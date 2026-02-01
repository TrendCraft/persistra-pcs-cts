/**
 * Initialization Orchestrator
 * 
 * This module orchestrates the initialization of all Leo components in the correct order,
 * resolving dependencies and preventing circular initialization issues.
 * 
 * It implements a dependency resolution system that:
 * 1. Registers components with their dependencies
 * 2. Calculates a valid initialization order using topological sorting
 * 3. Initializes components in the correct order
 * 4. Provides initialization status and diagnostics
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'initialization-orchestrator';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Private state
const components = new Map();
let initializationOrder = [];
let initialized = false;
let initializing = false;
let initializationPromise = null;

/**
 * Register a component with the orchestrator
 * @param {string} name - Component name
 * @param {Object} component - Component instance
 * @param {Array<string>} dependencies - Array of dependency component names
 * @returns {boolean} Success status
 */
function registerComponent(name, component, dependencies = []) {
  if (!name || !component) {
    logger.error('Invalid component registration: name and component are required');
    return false;
  }
  
  // Check if component is already registered
  if (components.has(name)) {
    logger.warn(`Component ${name} is already registered, updating`);
  }
  
  // Register component
  components.set(name, {
    name,
    component,
    dependencies: dependencies || [],
    initialized: false,
    initializing: false,
    initializationTime: null,
    initializationError: null
  });
  
  logger.info(`Component ${name} registered with dependencies: ${dependencies.join(', ') || 'none'}`);
  
  // Recalculate initialization order
  calculateInitializationOrder();
  
  return true;
}

/**
 * Calculate initialization order using topological sort
 * @private
 */
function calculateInitializationOrder() {
  // Reset order
  initializationOrder = [];
  
  // Create a copy of the components for processing
  const remainingComponents = new Map(components);
  
  // Track visited and temporary marks for cycle detection
  const visited = new Set();
  const temporary = new Set();
  
  // Visit function for depth-first traversal
  function visit(componentName) {
    // Check for cycles
    if (temporary.has(componentName)) {
      const cycle = Array.from(temporary).join(' -> ') + ' -> ' + componentName;
      logger.error(`Circular dependency detected: ${cycle}`);
      throw new Error(`Circular dependency detected: ${cycle}`);
    }
    
    // Skip if already visited
    if (visited.has(componentName)) {
      return;
    }
    
    // Get component
    const component = remainingComponents.get(componentName);
    if (!component) {
      logger.warn(`Component ${componentName} not found during initialization order calculation`);
      return;
    }
    
    // Mark temporarily for cycle detection
    temporary.add(componentName);
    
    // Visit dependencies first
    for (const dependency of component.dependencies) {
      if (remainingComponents.has(dependency)) {
        visit(dependency);
      } else if (!components.has(dependency)) {
        logger.warn(`Dependency ${dependency} not found for component ${componentName}`);
      }
    }
    
    // Remove temporary mark
    temporary.delete(componentName);
    
    // Mark as visited
    visited.add(componentName);
    
    // Add to initialization order
    initializationOrder.push(componentName);
  }
  
  // Visit all components
  for (const [componentName] of remainingComponents) {
    if (!visited.has(componentName)) {
      visit(componentName);
    }
  }
  
  logger.info(`Initialization order calculated: ${initializationOrder.join(' -> ')}`);
}

/**
 * Initialize a specific component
 * @param {string} componentName - Component name
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function initializeComponent(componentName) {
  // Get component
  const componentData = components.get(componentName);
  if (!componentData) {
    logger.error(`Component ${componentName} not found during initialization`);
    return false;
  }
  
  // Skip if already initialized
  if (componentData.initialized) {
    logger.info(`Component ${componentName} already initialized, skipping`);
    return true;
  }
  
  // Skip if initializing
  if (componentData.initializing) {
    logger.info(`Component ${componentName} initialization in progress, skipping`);
    return true;
  }
  
  // Mark as initializing
  componentData.initializing = true;
  
  try {
    // Check if all dependencies are initialized
    for (const dependency of componentData.dependencies) {
      const dependencyData = components.get(dependency);
      if (!dependencyData) {
        logger.error(`Dependency ${dependency} not found for component ${componentName}`);
        componentData.initializing = false;
        componentData.initializationError = `Dependency ${dependency} not found`;
        return false;
      }
      
      if (!dependencyData.initialized) {
        logger.error(`Dependency ${dependency} not initialized for component ${componentName}`);
        componentData.initializing = false;
        componentData.initializationError = `Dependency ${dependency} not initialized`;
        return false;
      }
    }
    
    // Emit pre-initialization event
    eventBus.emit('component:pre-init', {
      component: componentName,
      timestamp: Date.now()
    });
    
    // Initialize component
    logger.info(`Initializing component ${componentName}`);
    const startTime = Date.now();
    
    // Collect dependencies for injection
    const dependencies = {};
    for (const dependency of componentData.dependencies) {
      dependencies[dependency] = components.get(dependency).component;
    }
    
    // Call initialize method with dependencies
    const result = await componentData.component.initialize(dependencies);
    
    // Check result
    if (result === false) {
      logger.error(`Component ${componentName} initialization failed`);
      componentData.initializing = false;
      componentData.initializationError = 'Initialization returned false';
      
      // Emit error event
      eventBus.emit('error', {
        component: componentName,
        message: 'Initialization failed',
        error: 'Initialization returned false'
      });
      
      return false;
    }
    
    // Mark as initialized
    componentData.initialized = true;
    componentData.initializing = false;
    componentData.initializationTime = Date.now() - startTime;
    
    // Emit initialization event
    eventBus.emit('component:initialized', {
      component: componentName,
      timestamp: Date.now(),
      initializationTime: componentData.initializationTime
    });
    
    logger.info(`Component ${componentName} initialized successfully in ${componentData.initializationTime}ms`);
    return true;
  } catch (error) {
    logger.error(`Error initializing component ${componentName}: ${error.message}`);
    
    // Update component state
    componentData.initializing = false;
    componentData.initializationError = error.message;
    
    // Emit error event
    eventBus.emit('error', {
      component: componentName,
      message: 'Error initializing component',
      error: error.message
    });
    
    return false;
  }
}

/**
 * Initialize all components in the calculated order
 * @returns {Promise<boolean>} Success status
 */
async function initializeAll() {
  // Check if already initialized
  if (initialized) {
    logger.info('All components already initialized');
    return true;
  }
  
  // Check if initialization is in progress
  if (initializing) {
    logger.info('Initialization already in progress, waiting...');
    return initializationPromise;
  }
  
  // Set initialization state
  initializing = true;
  
  // Create initialization promise
  initializationPromise = _initializeAll();
  
  return initializationPromise;
}

/**
 * Internal implementation of initializeAll
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function _initializeAll() {
  try {
    logger.info('Starting component initialization');
    const startTime = Date.now();
    
    // Emit initialization start event
    eventBus.emit('initialization:start', {
      timestamp: startTime,
      components: Array.from(components.keys())
    });
    
    // Initialize components in order
    for (const componentName of initializationOrder) {
      const success = await initializeComponent(componentName);
      if (!success) {
        logger.error(`Initialization failed at component ${componentName}`);
        
        // Emit initialization failed event
        eventBus.emit('initialization:failed', {
          timestamp: Date.now(),
          component: componentName,
          error: components.get(componentName).initializationError
        });
        
        initializing = false;
        return false;
      }
    }
    
    // Set initialization state
    initialized = true;
    initializing = false;
    
    const totalTime = Date.now() - startTime;
    logger.info(`All components initialized successfully in ${totalTime}ms`);
    
    // Emit initialization complete event
    eventBus.emit('initialization:complete', {
      timestamp: Date.now(),
      totalTime,
      components: Array.from(components.keys()).map(name => ({
        name,
        initializationTime: components.get(name).initializationTime
      }))
    });
    
    return true;
  } catch (error) {
    logger.error(`Error during initialization: ${error.message}`);
    
    // Emit initialization failed event
    eventBus.emit('initialization:failed', {
      timestamp: Date.now(),
      error: error.message
    });
    
    initializing = false;
    return false;
  }
}

/**
 * Reset initialization state (for testing)
 */
function reset() {
  components.clear();
  initializationOrder = [];
  initialized = false;
  initializing = false;
  initializationPromise = null;
  
  logger.info('Initialization orchestrator reset');
}

/**
 * Get initialization diagnostics
 * @returns {Object} Diagnostics information
 */
function getDiagnostics() {
  return {
    initialized,
    initializing,
    componentCount: components.size,
    initializationOrder,
    components: Array.from(components.entries()).map(([name, data]) => ({
      name,
      initialized: data.initialized,
      initializing: data.initializing,
      dependencies: data.dependencies,
      initializationTime: data.initializationTime,
      initializationError: data.initializationError
    }))
  };
}

/**
 * Diagnose initialization issues
 * @returns {Object} Diagnostic results
 */
function diagnoseInitializationIssues() {
  const issues = [];
  
  // Check for circular dependencies
  try {
    calculateInitializationOrder();
  } catch (error) {
    if (error.message.includes('Circular dependency')) {
      issues.push({
        type: 'circular_dependency',
        message: error.message
      });
    }
  }
  
  // Check for missing dependencies
  for (const [componentName, data] of components.entries()) {
    for (const dependency of data.dependencies) {
      if (!components.has(dependency)) {
        issues.push({
          type: 'missing_dependency',
          component: componentName,
          dependency,
          message: `Component ${componentName} depends on ${dependency}, but it is not registered`
        });
      }
    }
  }
  
  // Check for initialization errors
  for (const [componentName, data] of components.entries()) {
    if (data.initializationError) {
      issues.push({
        type: 'initialization_error',
        component: componentName,
        error: data.initializationError,
        message: `Component ${componentName} failed to initialize: ${data.initializationError}`
      });
    }
  }
  
  return {
    hasIssues: issues.length > 0,
    issueCount: issues.length,
    issues
  };
}

// Export public API
module.exports = {
  registerComponent,
  initializeAll,
  getDiagnostics,
  diagnoseInitializationIssues,
  reset,
  isInitialized: () => initialized
};
