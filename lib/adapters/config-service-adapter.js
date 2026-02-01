/**
 * Configuration Service Adapter
 * 
 * This adapter provides a consistent interface for accessing configuration values
 * across all Leo components. It addresses interface mismatches between different
 * configuration access patterns and ensures standardized usage.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;

// Component name for logging and events
const COMPONENT_NAME = 'config-service-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Subscribers for configuration changes
const subscribers = new Map();

// Default configuration file path
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config', 'leo-config.json');

// Initialization state
let isInitialized = false;

/**
 * Initialize the configuration service adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    // Prevent duplicate initialization
    if (isInitialized) {
      logger.warn('Configuration service adapter already initialized');
      return true;
    }
    
    logger.info('Initializing configuration service adapter...');
    
    // Load configuration from file if specified
    const configPath = options.configPath || process.env.LEO_CONFIG_PATH || DEFAULT_CONFIG_PATH;
    
    try {
      await loadConfig(configPath);
    } catch (error) {
      logger.warn(`Could not load configuration from ${configPath}: ${error.message}`);
      logger.info('Using default configuration');
    }
    
    // Subscribe to configuration change events
    eventBus.on('config:changed', handleConfigChange, COMPONENT_NAME);
    
    isInitialized = true;
    logger.info('Configuration service adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Handle configuration change events
 * @param {Object} data - Event data
 * @private
 */
function handleConfigChange(data) {
  try {
    logger.info(`Configuration changed: ${data.path}`);
    
    // Notify subscribers
    for (const [component, callback] of subscribers.entries()) {
      try {
        if (!data.path || data.path.startsWith(component)) {
          logger.info(`Notifying ${component} of configuration change`);
          callback(data);
        }
      } catch (error) {
        logger.error(`Error notifying ${component} of configuration change: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error handling configuration change: ${error.message}`);
  }
}

/**
 * Get a configuration value
 * @param {string} path - Path to the configuration value
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Configuration value
 */
function getValue(path, defaultValue) {
  try {
    return configService.getValue(path, defaultValue);
  } catch (error) {
    logger.error(`Error getting configuration value for ${path}: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Set a configuration value
 * @param {string} path - Path to the configuration value
 * @param {*} value - Value to set
 * @returns {boolean} Success status
 */
function setValue(path, value) {
  try {
    configService.setValue(path, value);
    
    // Emit configuration change event
    eventBus.emit('config:changed', {
      path,
      value,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Error setting configuration value for ${path}: ${error.message}`);
    return false;
  }
}

/**
 * Get the entire configuration
 * @returns {Object} Configuration object
 */
function getConfig() {
  try {
    return configService.getConfig();
  } catch (error) {
    logger.error(`Error getting configuration: ${error.message}`);
    return {};
  }
}

/**
 * Load configuration from a file
 * @param {string} configPath - Path to the configuration file
 * @returns {Promise<boolean>} Success status
 */
async function loadConfig(configPath) {
  try {
    logger.info(`Loading configuration from ${configPath}`);
    
    // Check if file exists
    try {
      await fs.access(configPath);
    } catch (error) {
      logger.warn(`Configuration file not found: ${configPath}`);
      return false;
    }
    
    // Read and parse configuration file
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Load configuration into config service
    configService.loadConfig(config);
    
    logger.info('Configuration loaded successfully');
    
    // Emit configuration loaded event
    eventBus.emit('config:loaded', {
      configPath,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Error loading configuration from ${configPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Subscribe to configuration changes
 * @param {string} component - Component name
 * @param {Function} callback - Callback function
 * @returns {boolean} Success status
 */
function subscribeToChanges(component, callback) {
  try {
    if (typeof callback !== 'function') {
      logger.error(`Invalid callback for ${component}`);
      return false;
    }
    
    subscribers.set(component, callback);
    logger.info(`${component} subscribed to configuration changes`);
    return true;
  } catch (error) {
    logger.error(`Error subscribing ${component} to configuration changes: ${error.message}`);
    return false;
  }
}

/**
 * Unsubscribe from configuration changes
 * @param {string} component - Component name
 * @returns {boolean} Success status
 */
function unsubscribeFromChanges(component) {
  try {
    subscribers.delete(component);
    logger.info(`${component} unsubscribed from configuration changes`);
    return true;
  } catch (error) {
    logger.error(`Error unsubscribing ${component} from configuration changes: ${error.message}`);
    return false;
  }
}

// Export public API
module.exports = {
  initialize,
  getValue,
  setValue,
  getConfig,
  loadConfig,
  subscribeToChanges,
  unsubscribeFromChanges,
  isInitialized
};
