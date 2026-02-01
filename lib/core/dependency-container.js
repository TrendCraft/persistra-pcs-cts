/**
 * Dependency Container
 * 
 * A centralized dependency injection container for Leo components.
 * This resolves circular dependencies by providing a single source of truth
 * for component instances and ensures proper initialization order.
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Create logger
const logger = createComponentLogger('dependency-container');

// Component name for event bus registration
const COMPONENT_NAME = 'dependency-container';

// Container for component instances
const container = new Map();

// Component initialization status
const initStatus = new Map();

// Component dependencies
const dependencies = new Map();

// Component initialization order
const initOrder = [];

/**
 * Register a component with the container
 * 
 * @param {string} name - Component name
 * @param {Function} factory - Factory function that creates the component
 * @param {Array<string>} deps - Component dependencies
 */
function register(name, factory, deps = []) {
  if (container.has(name)) {
    logger.warn(`Component ${name} already registered`);
    return;
  }
  
  logger.info(`Registering component: ${name}`);
  container.set(name, { factory, instance: null });
  dependencies.set(name, deps);
  
  // Add to initialization order
  if (!initOrder.includes(name)) {
    initOrder.push(name);
  }
  
  // Ensure dependencies are before the component in initialization order
  const reorderedInitOrder = [];
  const visited = new Set();
  
  // Topological sort to resolve initialization order
  function visit(componentName) {
    if (visited.has(componentName)) return;
    visited.add(componentName);
    
    const componentDeps = dependencies.get(componentName) || [];
    for (const dep of componentDeps) {
      if (dependencies.has(dep)) {
        visit(dep);
      }
    }
    
    reorderedInitOrder.push(componentName);
  }
  
  // Visit all components to build initialization order
  for (const componentName of initOrder) {
    visit(componentName);
  }
  
  // Update initialization order
  initOrder.length = 0;
  initOrder.push(...reorderedInitOrder);
  
  logger.info(`Updated initialization order: ${initOrder.join(', ')}`);
}

/**
 * Get a component from the container
 * 
 * @param {string} name - Component name
 * @returns {Object} Component instance
 */
function get(name) {
  if (!container.has(name)) {
    logger.warn(`Component ${name} not registered`);
    return null;
  }
  
  const component = container.get(name);
  
  // Return existing instance if available
  if (component.instance) {
    return component.instance;
  }
  
  // Create instance if not available
  try {
    logger.info(`Creating instance of component: ${name}`);
    
    // Get dependencies
    const deps = dependencies.get(name) || [];
    const resolvedDeps = deps.map(dep => get(dep));
    
    // Create instance
    component.instance = component.factory(...resolvedDeps);
    
    return component.instance;
  } catch (error) {
    logger.error(`Error creating instance of component ${name}: ${error.message}`);
    return null;
  }
}

/**
 * Initialize all components in the container
 * 
 * @returns {Promise<boolean>} Success status
 */
async function initializeAll() {
  logger.info('Initializing all components');
  
  try {
    // Initialize components in order
    for (const name of initOrder) {
      await initialize(name);
    }
    
    logger.info('All components initialized successfully');
    
    // Emit initialization complete event
    eventBus.emit('dependency-container:initialized', {
      timestamp: Date.now(),
      components: initOrder
    }, COMPONENT_NAME);
    
    return true;
  } catch (error) {
    logger.error(`Error initializing components: ${error.message}`);
    return false;
  }
}

/**
 * Initialize a specific component
 * 
 * @param {string} name - Component name
 * @returns {Promise<boolean>} Success status
 */
async function initialize(name) {
  if (!container.has(name)) {
    logger.warn(`Cannot initialize component ${name}: not registered`);
    return false;
  }
  
  // Skip if already initialized
  if (initStatus.get(name) === 'initialized') {
    logger.info(`Component ${name} already initialized`);
    return true;
  }
  
  // Skip if currently initializing to prevent circular initialization
  if (initStatus.get(name) === 'initializing') {
    logger.warn(`Component ${name} is already being initialized`);
    return false;
  }
  
  logger.info(`Initializing component: ${name}`);
  initStatus.set(name, 'initializing');
  
  try {
    // Initialize dependencies first
    const deps = dependencies.get(name) || [];
    for (const dep of deps) {
      if (!await initialize(dep)) {
        throw new Error(`Failed to initialize dependency: ${dep}`);
      }
    }
    
    // Get component instance
    const instance = get(name);
    
    if (!instance) {
      throw new Error(`Failed to get instance of component: ${name}`);
    }
    
    // Initialize component if it has an initialize method
    if (typeof instance.initialize === 'function') {
      await instance.initialize();
    }
    
    initStatus.set(name, 'initialized');
    logger.info(`Component ${name} initialized successfully`);
    
    // Emit component initialized event
    eventBus.emit('dependency-container:component-initialized', {
      timestamp: Date.now(),
      component: name
    }, COMPONENT_NAME);
    
    return true;
  } catch (error) {
    initStatus.set(name, 'failed');
    logger.error(`Error initializing component ${name}: ${error.message}`);
    
    // Emit component initialization failed event
    eventBus.emit('dependency-container:component-initialization-failed', {
      timestamp: Date.now(),
      component: name,
      error: error.message
    }, COMPONENT_NAME);
    
    return false;
  }
}

/**
 * Get initialization status of a component
 * 
 * @param {string} name - Component name
 * @returns {string} Initialization status
 */
function getStatus(name) {
  return initStatus.get(name) || 'not-registered';
}

/**
 * Get initialization status of all components
 * 
 * @returns {Object} Initialization status of all components
 */
function getAllStatus() {
  const status = {};
  
  for (const name of container.keys()) {
    status[name] = getStatus(name);
  }
  
  return status;
}

/**
 * Register an already initialized instance directly with the container
 * 
 * @param {string} name - Component name
 * @param {Object} instance - Component instance
 * @param {Array<string>} deps - Component dependencies (optional)
 */
function registerInstance(name, instance, deps = []) {
  if (!name || !instance) {
    logger.error('Invalid parameters for registerInstance');
    return;
  }
  
  logger.info(`Directly registering instance for component: ${name}`);
  
  // If component already exists, update it
  if (container.has(name)) {
    const component = container.get(name);
    component.instance = instance;
    container.set(name, component);
    logger.info(`Updated existing component: ${name}`);
  } else {
    // Create a new component entry
    container.set(name, { factory: () => instance, instance });
    dependencies.set(name, deps);
    
    // Add to initialization order
    if (!initOrder.includes(name)) {
      initOrder.push(name);
    }
    
    logger.info(`Registered new component instance: ${name}`);
  }
  
  // Mark as initialized
  initStatus.set(name, 'initialized');
  
  // Emit event
  eventBus.emit('component:registered', { name, hasInstance: true }, COMPONENT_NAME);
}

module.exports = {
  register,
  registerInstance,
  get,
  initialize,
  initializeAll,
  getStatus,
  getAllStatus,
  isRegistered: (name) => container.has(name)
};
