/**
 * System Initializer
 * 
 * Orchestrates the initialization of Leo's core systems in the correct order,
 * ensuring proper dependency resolution and handling initialization failures gracefully.
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const dependencyContainer = require('./dependency-container');

// Create logger
const logger = createComponentLogger('system-initializer');

// Component name for event bus registration
const COMPONENT_NAME = 'system-initializer';

// Initialization phases
const PHASES = {
  CORE: 'core',
  SERVICES: 'services',
  ADAPTERS: 'adapters',
  INTEGRATION: 'integration',
  PLUGINS: 'plugins'
};

// Phase components
const phaseComponents = {
  [PHASES.CORE]: [
    'config-service',
    'event-bus',
    'logger',
    'true-semantic-embeddings',
    'fixed-semantic-context-adapter'
  ],
  [PHASES.SERVICES]: [
    'session-boundary-manager',
    'semantic-context-manager',
    'context-preservation-system',
    'adaptive-context-selector',
    'conversation-summarizer',
    'conversation-semantic-search',
    'conversation-memory-manager',
    'change-linking-service',
    'live-updater-bridge'
  ],
  [PHASES.ADAPTERS]: [
    'session-awareness-adapter',
    'adaptive-context-selector-adapter',
    'semantic-context-adapter'
  ],
  [PHASES.INTEGRATION]: [
    'memory-integration-service',
    'meta-prompt-layer',
    'context-injection-system',
    'cognitive-loop-orchestrator'
  ],
  [PHASES.PLUGINS]: [
    'conversation-awareness',
    'real-time-code-awareness',
    'file-monitor'
  ]
};

// Initialization status
let isInitializing = false;
let isInitialized = false;
let initializationError = null;

/**
 * Register core components with the dependency container
 */
function registerCoreComponents() {
  logger.info('Registering core components');
  
  // Register event bus
  dependencyContainer.register('event-bus', () => eventBus, []);
  
  // Register logger
  dependencyContainer.register('logger', () => ({ createComponentLogger }), []);
  
  // Register config service
  dependencyContainer.register('config-service', () => require('../services/config-service'), []);
  
  // Register local semantic embeddings
  try {
    dependencyContainer.register('true-semantic-embeddings', 
      () => require('../services/true-semantic-embeddings'), 
      ['event-bus', 'config-service']);
  } catch (error) {
    logger.warn(`Error registering local semantic embeddings: ${error.message}`);
  }
  
  // Register fixed semantic context adapter
  try {
    dependencyContainer.register('fixed-semantic-context-adapter', 
      () => require('../adapters/fixed-semantic-context-adapter').fixedSemanticContextAdapter, 
      ['event-bus', 'config-service']);
  } catch (error) {
    logger.warn(`Error registering fixed semantic context adapter: ${error.message}`);
  }
}

/**
 * Register service components with the dependency container
 */
function registerServiceComponents() {
  logger.info('Registering service components');
  
  // Register session boundary manager
  dependencyContainer.register('session-boundary-manager', 
    () => require('../services/session-boundary-manager'), 
    ['event-bus', 'config-service']);
  
  // Register semantic context manager
  dependencyContainer.register('semantic-context-manager', 
    () => require('../services/semantic-context-manager'), 
    ['event-bus', 'config-service', 'true-semantic-embeddings']);
  
  // Register context preservation system
  dependencyContainer.register('context-preservation-system', 
    () => require('../services/context-preservation-system'), 
    ['event-bus', 'config-service', 'semantic-context-manager']);
  
  // Register adaptive context selector
  dependencyContainer.register('adaptive-context-selector', 
    () => require('../services/adaptive-context-selector'), 
    ['event-bus', 'config-service']);
  
  // Register conversation summarizer
  try {
    dependencyContainer.register('conversation-summarizer', 
      () => require('../services/conversation-summarizer'), 
      ['event-bus', 'config-service']);
  } catch (error) {
    logger.warn(`Error registering conversation summarizer: ${error.message}`);
  }
  
  // Register conversation semantic search
  try {
    dependencyContainer.register('conversation-semantic-search', 
      () => require('../services/conversation-semantic-search'), 
      ['event-bus', 'config-service']);
  } catch (error) {
    logger.warn(`Error registering conversation semantic search: ${error.message}`);
  }
  
  // Register conversation memory manager
  try {
    dependencyContainer.register('conversation-memory-manager', 
      () => require('../services/conversation-memory-manager'), 
      ['event-bus', 'config-service', 'conversation-summarizer']);
  } catch (error) {
    logger.warn(`Error registering conversation memory manager: ${error.message}`);
  }
  
  // Register live updater bridge
  try {
    dependencyContainer.register('live-updater-bridge', 
      () => require('../services/live-updater-bridge'), 
      ['event-bus', 'config-service', 'semantic-context-manager']);
  } catch (error) {
    logger.warn(`Error registering live updater bridge: ${error.message}`);
  }
  
  // Register change linking service
  try {
    dependencyContainer.register('change-linking-service', 
      () => require('../services/change-linking-service'), 
      ['event-bus', 'config-service']);
  } catch (error) {
    logger.warn(`Error registering change linking service: ${error.message}`);
  }
}

/**
 * Register adapter components with the dependency container
 */
function registerAdapterComponents() {
  logger.info('Registering adapter components');
  
  // Register session awareness adapter
  dependencyContainer.register('session-awareness-adapter', 
    () => require('../adapters/session-awareness-adapter'), 
    ['event-bus', 'config-service', 'session-boundary-manager']);
  
  // Register adaptive context selector adapter
  dependencyContainer.register('adaptive-context-selector-adapter', 
    () => require('../adapters/adaptive-context-selector-adapter'), 
    ['event-bus', 'config-service', 'adaptive-context-selector']);
  
  // Register semantic context adapter
  dependencyContainer.register('semantic-context-adapter', 
    () => require('../adapters/semantic-context-adapter'), 
    ['event-bus', 'config-service', 'semantic-context-manager']);
}

/**
 * Register integration components with the dependency container
 */
function registerIntegrationComponents() {
  logger.info('Registering integration components');
  
  // Register memory integration service
  try {
    dependencyContainer.register('memory-integration-service', 
      () => require('../services/memory-integration-service'), 
      ['event-bus', 'config-service', 'conversation-memory-manager', 'semantic-context-manager', 'conversation-semantic-search']);
  } catch (error) {
    logger.warn(`Error registering memory integration service: ${error.message}`);
  }
  
  // Register meta prompt layer
  dependencyContainer.register('meta-prompt-layer', 
    () => require('../integration/meta-prompt-layer'), 
    ['event-bus', 'config-service', 'semantic-context-manager']);
  
  // Register context injection system
  dependencyContainer.register('context-injection-system', 
    () => require('../integration/context-injection-system'), 
    ['event-bus', 'config-service', 'semantic-context-manager']);
  
  // Register cognitive loop orchestrator
  try {
    dependencyContainer.register('cognitive-loop-orchestrator', 
      () => require('../integration/cognitive-loop-orchestrator'), 
      ['event-bus', 'config-service', 'semantic-context-manager', 'meta-prompt-layer']);
  } catch (error) {
    logger.warn(`Error registering cognitive loop orchestrator: ${error.message}`);
  }
}

/**
 * Register plugin components with the dependency container
 */
function registerPluginComponents() {
  logger.info('Registering plugin components');
  
  // Register conversation awareness
  dependencyContainer.register('conversation-awareness', 
    () => require('../plugins/conversation-awareness'), 
    ['event-bus', 'config-service']);
  
  // Register real-time code awareness
  dependencyContainer.register('real-time-code-awareness', 
    () => require('../plugins/real-time-code-awareness'), 
    ['event-bus', 'config-service']);
  
  // Register file monitor
  dependencyContainer.register('file-monitor', 
    () => require('../plugins/file-monitor'), 
    ['event-bus', 'config-service']);
}

/**
 * Register all components with the dependency container
 */
function registerAllComponents() {
  logger.info('Registering all components');
  
  // Register components by phase
  registerCoreComponents();
  registerServiceComponents();
  registerAdapterComponents();
  registerIntegrationComponents();
  registerPluginComponents();
  
  // Register additional components from the registration script
  try {
    logger.info('Loading additional component registrations');
    require('./register-components');
    logger.info('Additional components registered successfully');
  } catch (error) {
    logger.warn(`Error loading additional component registrations: ${error.message}`);
  }
}

/**
 * Initialize components for a specific phase
 * @param {string} phase - The phase to initialize
 */
async function initializePhaseComponents(phase) {
  logger.info(`Initializing phase: ${phase}`);
  
  // Get components for this phase
  const components = phaseComponents[phase];
  
  if (!components || !Array.isArray(components) || components.length === 0) {
    logger.warn(`No components found for phase: ${phase}`);
    return false;
  }
  
  // Initialize each component in this phase
  let success = true;
  
  for (const componentName of components) {
    try {
      // Skip if component is not registered
      if (!dependencyContainer.isRegistered(componentName)) {
        logger.warn(`Component ${componentName} not registered, skipping initialization`);
        continue;
      }
      
      // Get component instance - handle both resolve and get methods
      let component;
      if (typeof dependencyContainer.get === 'function') {
        component = dependencyContainer.get(componentName);
      } else if (typeof dependencyContainer.resolve === 'function') {
        component = await dependencyContainer.resolve(componentName);
      } else {
        logger.error(`Dependency container has no valid resolution method for ${componentName}`);
        success = false;
        continue;
      }
      
      // Skip if component is already initialized
      if (component && typeof component.isInitialized === 'function' && component.isInitialized()) {
        logger.info(`Component ${componentName} already initialized, skipping`);
        continue;
      }
      
      // Initialize component
      if (component && typeof component.initialize === 'function') {
        logger.info(`Initializing component: ${componentName}`);
        
        // Initialize with event emission
        eventBus.emit(`${componentName}:initializing`, {
          phase,
          timestamp: Date.now()
        });
        
        const result = await component.initialize();
        
        eventBus.emit(`${componentName}:initialized`, {
          phase,
          timestamp: Date.now(),
          result
        });
        
        logger.info(`Component ${componentName} initialized successfully`);
      }
    } catch (error) {
      logger.error(`Error initializing component ${componentName}: ${error.message}`);
      success = false;
      
      // Emit error event
      eventBus.emit(`${componentName}:error`, {
        phase,
        timestamp: Date.now(),
        error: error.message
      });
    }
  }
  
  return success;
}

/**
 * Initialize all phases
 * 
 * @returns {Promise<boolean>} Success status
 */
async function initializeAllPhases() {
  logger.info('Initializing all phases');
  
  // Initialize each phase in order
  const phases = Object.values(PHASES);
  let success = true;
  
  for (const phase of phases) {
    const phaseSuccess = await initializePhaseComponents(phase);
    
    if (!phaseSuccess) {
      logger.warn(`Phase ${phase} initialization failed`);
      success = false;
    }
  }
  
  return success;
}

/**
 * Initialize the system
 * 
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  // Prevent multiple initializations
  if (isInitializing) {
    logger.warn('System is already initializing, ignoring duplicate call');
    return false;
  }
  
  if (isInitialized) {
    logger.info('System is already initialized');
    return true;
  }
  
  // Set initializing flag
  isInitializing = true;
  
  try {
    logger.info('Initializing system');
    
    // Register all components
    registerAllComponents();
    
    // Initialize all phases
    const success = await initializeAllPhases();
    
    // Set initialization status
    isInitialized = success;
    isInitializing = false;
    
    if (success) {
      logger.info('System initialized successfully');
      
      // Emit success event
      eventBus.emit(`${COMPONENT_NAME}:initialized`, {
        timestamp: Date.now(),
        success: true
      });
    } else {
      logger.error('System initialization failed');
      
      // Emit failure event
      eventBus.emit(`${COMPONENT_NAME}:initialized`, {
        timestamp: Date.now(),
        success: false,
        error: 'One or more phases failed to initialize'
      });
    }
    
    return success;
  } catch (error) {
    // Set initialization status
    isInitialized = false;
    isInitializing = false;
    initializationError = error;
    
    logger.error(`System initialization error: ${error.message}`);
    
    // Emit error event
    eventBus.emit(`${COMPONENT_NAME}:error`, {
      timestamp: Date.now(),
      error: error.message
    });
    
    return false;
  }
}

/**
 * Get initialization status
 * 
 * @returns {Object} Initialization status
 */
function getStatus() {
  return {
    isInitializing,
    isInitialized,
    error: initializationError ? initializationError.message : null
  };
}

/**
 * Get registered phases
 * 
 * @returns {Object} Registered phases and their components
 */
function getRegisteredPhases() {
  return { ...phaseComponents };
}

module.exports = {
  initialize,
  getStatus,
  PHASES,
  phaseComponents,
  getRegisteredPhases,
  registerCoreComponents,
  registerServiceComponents,
  registerAdapterComponents,
  registerIntegrationComponents,
  registerPluginComponents,
  registerAllComponents
};
