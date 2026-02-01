/**
 * Real-Time Code Awareness Adapter
 * 
 * This adapter provides a standardized interface for the Real-Time Code Awareness service,
 * following Leo's adapter pattern to ensure consistent interaction with other components.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const realTimeCodeAwareness = require('../services/real-time-code-awareness');

// Component name for logging and events
const COMPONENT_NAME = 'real-time-code-awareness-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Initialization state
let isInitialized = false;

/**
 * Initialize the real-time code awareness adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  if (isInitialized) {
    logger.info('Real-time code awareness adapter already initialized');
    return true;
  }
  
  try {
    logger.info('Initializing real-time code awareness adapter...');
    
    // Initialize the underlying service
    const success = await realTimeCodeAwareness.initialize(options);
    
    if (!success) {
      logger.error('Failed to initialize real-time code awareness service');
      return false;
    }
    
    isInitialized = true;
    logger.info('Real-time code awareness adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('adapter:initialized', { 
      adapter: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize real-time code awareness adapter: ${error.message}`);
    eventBus.emit('adapter:error', {
      adapter: COMPONENT_NAME,
      error: error.message,
      timestamp: Date.now()
    });
    return false;
  }
}

/**
 * Get recent code changes
 * @param {Object} options - Options for retrieving changes
 * @param {number} options.limit - Maximum number of changes to return
 * @returns {Promise<Object>} Result with success status and changes
 */
async function getRecentChanges(options = {}) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Adapter not initialized',
        changes: []
      };
    }
    
    const limit = options.limit || 10;
    const changes = realTimeCodeAwareness.getRecentChanges(limit);
    
    return {
      success: true,
      changes,
      metadata: {
        timestamp: Date.now(),
        count: changes.length,
        limit
      }
    };
  } catch (error) {
    logger.error(`Error getting recent changes: ${error.message}`);
    return {
      success: false,
      error: error.message,
      changes: []
    };
  }
}

/**
 * Get impact analysis for a file
 * @param {Object} options - Options for impact analysis
 * @param {string} options.filePath - Path to the file
 * @returns {Promise<Object>} Result with success status and impact analysis
 */
async function getImpactAnalysis(options = {}) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Adapter not initialized',
        impact: null
      };
    }
    
    if (!options.filePath) {
      return {
        success: false,
        error: 'File path is required',
        impact: null
      };
    }
    
    const impact = realTimeCodeAwareness.getImpactAnalysis(options.filePath);
    
    return {
      success: true,
      impact,
      metadata: {
        timestamp: Date.now(),
        filePath: options.filePath
      }
    };
  } catch (error) {
    logger.error(`Error getting impact analysis: ${error.message}`);
    return {
      success: false,
      error: error.message,
      impact: null
    };
  }
}

/**
 * Add a dependency relationship to the graph
 * @param {Object} options - Options for adding dependency
 * @param {string} options.component - Component name
 * @param {string} options.dependency - Dependency path
 * @returns {Promise<Object>} Result with success status
 */
async function addDependency(options = {}) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Adapter not initialized'
      };
    }
    
    if (!options.component || !options.dependency) {
      return {
        success: false,
        error: 'Component and dependency are required'
      };
    }
    
    const success = await realTimeCodeAwareness.addDependency(options.component, options.dependency);
    
    return {
      success,
      metadata: {
        timestamp: Date.now(),
        component: options.component,
        dependency: options.dependency
      }
    };
  } catch (error) {
    logger.error(`Error adding dependency: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get the dependency graph
 * @returns {Promise<Object>} Result with success status and dependency graph
 */
async function getDependencyGraph() {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Adapter not initialized',
        graph: {}
      };
    }
    
    const graph = realTimeCodeAwareness.getDependencyGraph();
    
    return {
      success: true,
      graph,
      metadata: {
        timestamp: Date.now(),
        componentCount: Object.keys(graph).length
      }
    };
  } catch (error) {
    logger.error(`Error getting dependency graph: ${error.message}`);
    return {
      success: false,
      error: error.message,
      graph: {}
    };
  }
}

/**
 * Get components impacted by changes in the current session
 * @returns {Promise<Object>} Result with success status and impacted components
 */
async function getSessionImpacts() {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Adapter not initialized',
        impacts: []
      };
    }
    
    const impacts = realTimeCodeAwareness.getSessionImpacts();
    
    return {
      success: true,
      impacts,
      metadata: {
        timestamp: Date.now(),
        count: impacts.length
      }
    };
  } catch (error) {
    logger.error(`Error getting session impacts: ${error.message}`);
    return {
      success: false,
      error: error.message,
      impacts: []
    };
  }
}

// Export the adapter API
module.exports = {
  initialize,
  getRecentChanges,
  getImpactAnalysis,
  addDependency,
  getDependencyGraph,
  getSessionImpacts
};
