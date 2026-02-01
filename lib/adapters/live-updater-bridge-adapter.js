/**
 * Live Updater Bridge Adapter
 * 
 * This adapter provides a consistent interface for the Live Updater Bridge component,
 * which acts as an intermediary between the Unified Live Updater and other Leo components.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const { v4: uuidv4 } = require('uuid');

// Component name for logging and events
const COMPONENT_NAME = 'live-updater-bridge-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Reference to the underlying live updater bridge
let liveUpdaterBridge;

// Track registered change handlers
const changeHandlers = new Map();

// Metrics tracking
const metrics = {
  filesProcessed: 0,
  changeHandlersRegistered: 0,
  watchStatus: {
    active: false,
    paused: false,
    lastActivity: null
  }
};

// Watch status
let watchingActive = false;
let watchingPaused = false;

/**
 * Initialize the live updater bridge
 * @param {Object} options - Initialization options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing live updater bridge adapter');
    
    // Dynamically import the live updater bridge to avoid circular dependencies
    try {
      liveUpdaterBridge = require('../components/live-updater-bridge');
    } catch (error) {
      logger.warn(`Could not load live updater bridge: ${error.message}`);
      logger.info('Using fallback implementation');
      
      // Create a fallback implementation for MVL
      liveUpdaterBridge = createFallbackImplementation();
    }
    
    // Set up event handlers for file changes
    eventBus.on('file:changed', async (data) => {
      // Process changed file
      await processFileChange(data.path, data.type);
    }, COMPONENT_NAME);
    
    // Enforce strict DI
    const { embeddingsInterface, logger: injectedLogger } = options;
    if (!embeddingsInterface || !injectedLogger) {
      throw new Error('live-updater-bridge-adapter: DI missing embeddingsInterface or logger');
    }
    logger = injectedLogger;

    // Remove DI from options before passing config
    const nonDIOptions = { ...options };
    delete nonDIOptions.embeddingsInterface;
    delete nonDIOptions.logger;

    // Initialize the bridge with DI
    if (liveUpdaterBridge && typeof liveUpdaterBridge.initialize === 'function') {
      await liveUpdaterBridge.initialize({
        ...nonDIOptions,
        embeddingsInterface,
        logger
      });
    }

    // Update watch status
    watchingActive = true;
    watchingPaused = false;
    metrics.watchStatus.active = true;
    metrics.watchStatus.paused = false;
    metrics.watchStatus.lastActivity = new Date().toISOString();

    logger.info('Live updater bridge adapter initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Error initializing live updater bridge adapter: ${error.message}`);
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to initialize live updater bridge adapter', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Process a file change
 * @param {string} filePath - Path to the changed file
 * @param {string} changeType - Type of change (add, change, unlink)
 * @returns {Promise<boolean>} Success status
 */
async function processFileChange(filePath, changeType) {
  try {
    logger.debug(`Processing file change: ${filePath} (${changeType})`);
    
    // Skip if watching is paused
    if (watchingPaused) {
      logger.debug(`Watching is paused, ignoring change to ${filePath}`);
      return false;
    }
    
    // Update metrics
    metrics.filesProcessed++;
    metrics.watchStatus.lastActivity = new Date().toISOString();
    
    // Process with underlying implementation if available
    if (liveUpdaterBridge && typeof liveUpdaterBridge.processFileChange === 'function') {
      await liveUpdaterBridge.processFileChange(filePath, changeType);
    }
    
    // Notify all registered change handlers
    for (const [id, handler] of changeHandlers.entries()) {
      try {
        await handler(filePath, changeType);
      } catch (error) {
        logger.error(`Error in change handler ${id}: ${error.message}`);
      }
    }
    
    // Emit event for monitoring
    eventBus.emit('file:processed', { 
      component: COMPONENT_NAME,
      path: filePath,
      changeType
    });
    
    return true;
  } catch (error) {
    logger.error(`Error processing file change ${filePath}: ${error.message}`);
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to process file change: ${filePath}`, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Register a change handler
 * @param {Function} handler - Function to call when a file changes
 * @returns {string} Handler ID for unregistering
 */
function registerChangeHandler(handler) {
  if (typeof handler !== 'function') {
    logger.error('Cannot register change handler: handler must be a function');
    return '';
  }
  
  const handlerId = uuidv4();
  changeHandlers.set(handlerId, handler);
  
  // Update metrics
  metrics.changeHandlersRegistered++;
  
  logger.debug(`Registered change handler: ${handlerId}`);
  return handlerId;
}

/**
 * Unregister a change handler
 * @param {string} handlerId - ID of the handler to unregister
 * @returns {boolean} Success status
 */
function unregisterChangeHandler(handlerId) {
  if (!changeHandlers.has(handlerId)) {
    logger.warn(`Change handler not found: ${handlerId}`);
    return false;
  }
  
  changeHandlers.delete(handlerId);
  logger.debug(`Unregistered change handler: ${handlerId}`);
  return true;
}

/**
 * Get the current watch status
 * @returns {Object} Watch status
 */
function getWatchStatus() {
  return {
    active: watchingActive,
    paused: watchingPaused,
    handlers: changeHandlers.size,
    lastActivity: metrics.watchStatus.lastActivity
  };
}

/**
 * Pause watching for file changes
 * @returns {boolean} Success status
 */
function pauseWatching() {
  watchingPaused = true;
  metrics.watchStatus.paused = true;
  
  logger.info('Paused watching for file changes');
  
  // Pause underlying implementation if available
  if (liveUpdaterBridge && typeof liveUpdaterBridge.pauseWatching === 'function') {
    return liveUpdaterBridge.pauseWatching();
  }
  
  return true;
}

/**
 * Resume watching for file changes
 * @returns {boolean} Success status
 */
function resumeWatching() {
  watchingPaused = false;
  metrics.watchStatus.paused = false;
  
  logger.info('Resumed watching for file changes');
  
  // Resume underlying implementation if available
  if (liveUpdaterBridge && typeof liveUpdaterBridge.resumeWatching === 'function') {
    return liveUpdaterBridge.resumeWatching();
  }
  
  return true;
}

/**
 * Get metrics about the live updater bridge
 * @returns {Object} Metrics object
 */
function getMetrics() {
  return {
    ...metrics,
    handlers: changeHandlers.size
  };
}

/**
 * Create a fallback implementation for MVL
 * @returns {Object} Fallback implementation
 */
function createFallbackImplementation() {
  return {
    initialize: async () => {
      logger.info('Initialized fallback live updater bridge');
      return true;
    },
    processFileChange: async (filePath, changeType) => {
      logger.info(`[Fallback] Processing file change: ${filePath} (${changeType})`);
      return true;
    },
    pauseWatching: () => {
      logger.info('[Fallback] Paused watching');
      return true;
    },
    resumeWatching: () => {
      logger.info('[Fallback] Resumed watching');
      return true;
    }
  };
}

// Export the adapter API
module.exports = {
  initialize,
  processFileChange,
  registerChangeHandler,
  unregisterChangeHandler,
  getWatchStatus,
  pauseWatching,
  resumeWatching,
  getMetrics
};
