/**
 * Configuration Manager
 * 
 * This module provides a centralized configuration system for Leo components.
 * It handles configuration loading, validation, and access with proper immutability
 * safeguards to prevent the "Assignment to constant variable" error.
 * 
 * Key features:
 * - Hierarchical configuration with dot notation access
 * - Safe configuration updates that avoid reference issues
 * - Configuration validation and schema enforcement
 * - Environment variable integration
 * - Configuration change events
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;

// Component name for logging and events
const COMPONENT_NAME = 'config-manager';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Private configuration store - inaccessible from outside this module
let configStore = {};
let isInitialized = false;
let configSchema = {};

/**
 * Get a nested property from an object using dot notation
 * @param {Object} obj - Object to get property from
 * @param {string} path - Property path in dot notation (e.g., 'a.b.c')
 * @param {*} defaultValue - Default value if property doesn't exist
 * @returns {*} Property value or default value
 * @private
 */
function getNestedProperty(obj, path, defaultValue) {
  if (!obj || !path) {
    return defaultValue;
  }
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue;
    }
    
    current = current[part];
  }
  
  return current !== undefined ? current : defaultValue;
}

/**
 * Set a nested property on an object using dot notation
 * @param {Object} obj - Object to set property on
 * @param {string} path - Property path in dot notation (e.g., 'a.b.c')
 * @param {*} value - Value to set
 * @returns {Object} Updated object
 * @private
 */
function setNestedProperty(obj, path, value) {
  if (!obj || !path) {
    return obj;
  }
  
  const parts = path.split('.');
  const lastPart = parts.pop();
  let current = obj;
  
  // Create nested objects if they don't exist
  for (const part of parts) {
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    
    current = current[part];
  }
  
  // Set the value
  current[lastPart] = value;
  
  return obj;
}

/**
 * Create a deep copy of an object
 * @param {*} obj - Object to copy
 * @returns {*} Deep copy of the object
 * @private
 */
function deepCopy(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepCopy(item));
  }
  
  const copy = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }
  
  return copy;
}

/**
 * Load configuration from a file
 * @param {string} filePath - Path to configuration file
 * @returns {Promise<Object>} Loaded configuration
 * @private
 */
async function loadConfigFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    
    // Determine file type from extension
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.json') {
      return JSON.parse(data);
    } else if (ext === '.js') {
      // For .js files, evaluate as a module
      const modulePath = path.resolve(filePath);
      delete require.cache[modulePath]; // Clear cache to ensure fresh load
      return require(modulePath);
    } else {
      throw new Error(`Unsupported config file type: ${ext}`);
    }
  } catch (error) {
    logger.error(`Error loading config file ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Apply environment variables to configuration
 * @param {Object} config - Configuration object
 * @returns {Object} Configuration with environment variables applied
 * @private
 */
function applyEnvironmentVariables(config) {
  const result = deepCopy(config);
  
  // Process environment variables with LEO_ prefix
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('LEO_')) {
      // Convert environment variable name to config path
      // e.g., LEO_SESSION_DIR -> session.dir
      const configPath = key
        .slice(4) // Remove LEO_ prefix
        .toLowerCase()
        .split('_')
        .join('.');
      
      // Set the value in the config
      setNestedProperty(result, configPath, value);
      logger.debug(`Applied environment variable ${key} to config path ${configPath}`);
    }
  }
  
  return result;
}

/**
 * Validate configuration against schema
 * @param {Object} config - Configuration to validate
 * @param {Object} schema - Schema to validate against
 * @returns {Object} Validation result with errors
 * @private
 */
function validateConfig(config, schema) {
  const errors = [];
  
  // Simple schema validation
  function validateObject(obj, schemaObj, path = '') {
    for (const key in schemaObj) {
      const fullPath = path ? `${path}.${key}` : key;
      const schemaValue = schemaObj[key];
      
      if (typeof schemaValue === 'object' && schemaValue !== null && !Array.isArray(schemaValue)) {
        // Nested schema
        if (obj[key] === undefined) {
          if (schemaValue.required) {
            errors.push({
              path: fullPath,
              message: `Required property ${fullPath} is missing`
            });
          }
        } else if (typeof obj[key] !== 'object' || obj[key] === null) {
          errors.push({
            path: fullPath,
            message: `Property ${fullPath} should be an object`
          });
        } else {
          // Recursively validate nested object
          validateObject(obj[key], schemaValue, fullPath);
        }
      } else {
        // Simple property
        const propertySchema = typeof schemaValue === 'object' ? schemaValue : { type: schemaValue };
        
        if (obj[key] === undefined) {
          if (propertySchema.required) {
            errors.push({
              path: fullPath,
              message: `Required property ${fullPath} is missing`
            });
          }
        } else {
          // Type validation
          if (propertySchema.type && typeof obj[key] !== propertySchema.type) {
            errors.push({
              path: fullPath,
              message: `Property ${fullPath} should be of type ${propertySchema.type}, but got ${typeof obj[key]}`
            });
          }
          
          // Range validation for numbers
          if (typeof obj[key] === 'number') {
            if (propertySchema.min !== undefined && obj[key] < propertySchema.min) {
              errors.push({
                path: fullPath,
                message: `Property ${fullPath} should be at least ${propertySchema.min}`
              });
            }
            
            if (propertySchema.max !== undefined && obj[key] > propertySchema.max) {
              errors.push({
                path: fullPath,
                message: `Property ${fullPath} should be at most ${propertySchema.max}`
              });
            }
          }
          
          // Enum validation
          if (propertySchema.enum && !propertySchema.enum.includes(obj[key])) {
            errors.push({
              path: fullPath,
              message: `Property ${fullPath} should be one of [${propertySchema.enum.join(', ')}]`
            });
          }
        }
      }
    }
  }
  
  validateObject(config, schema);
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Initialize the configuration manager
 * @param {Object} options - Initialization options
 * @param {string} options.configPath - Path to configuration file
 * @param {Object} options.defaultConfig - Default configuration
 * @param {Object} options.schema - Configuration schema
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing configuration manager');
    
    // Start with default configuration
    let config = options.defaultConfig || {};
    
    // Store schema for validation
    configSchema = options.schema || {};
    
    // Load configuration from file if provided
    if (options.configPath) {
      try {
        const fileConfig = await loadConfigFile(options.configPath);
        config = { ...config, ...fileConfig };
        logger.info(`Loaded configuration from ${options.configPath}`);
      } catch (error) {
        logger.warn(`Failed to load configuration from ${options.configPath}, using defaults: ${error.message}`);
      }
    }
    
    // Apply environment variables
    config = applyEnvironmentVariables(config);
    
    // Validate configuration if schema is provided
    if (Object.keys(configSchema).length > 0) {
      const validation = validateConfig(config, configSchema);
      
      if (!validation.valid) {
        logger.warn(`Configuration validation failed with ${validation.errors.length} errors`);
        for (const error of validation.errors) {
          logger.warn(`Config validation error: ${error.message}`);
        }
      }
    }
    
    // Store configuration
    configStore = deepCopy(config);
    
    // Set initialization state
    isInitialized = true;
    
    // Emit initialization event
    eventBus.emit('component:initialized', {
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    logger.info('Configuration manager initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Error initializing configuration manager: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', {
      component: COMPONENT_NAME,
      message: 'Failed to initialize configuration manager',
      error: error.message
    });
    
    return false;
  }
}

/**
 * Get a configuration value
 * @param {string} path - Configuration path in dot notation
 * @param {*} defaultValue - Default value if configuration doesn't exist
 * @returns {*} Configuration value
 */
function get(path, defaultValue) {
  if (!isInitialized) {
    logger.warn('Configuration manager not initialized, returning default value');
    return defaultValue;
  }
  
  return getNestedProperty(configStore, path, defaultValue);
}

/**
 * Set a configuration value
 * @param {string} path - Configuration path in dot notation
 * @param {*} value - Value to set
 * @returns {boolean} Success status
 */
function set(path, value) {
  if (!isInitialized) {
    logger.warn('Configuration manager not initialized, cannot set value');
    return false;
  }
  
  try {
    // Create a new copy of the config store
    const newConfigStore = deepCopy(configStore);
    
    // Set the value
    setNestedProperty(newConfigStore, path, value);
    
    // Validate if schema is available
    if (Object.keys(configSchema).length > 0) {
      const validation = validateConfig(newConfigStore, configSchema);
      
      if (!validation.valid) {
        logger.warn(`Configuration validation failed with ${validation.errors.length} errors`);
        for (const error of validation.errors) {
          logger.warn(`Config validation error: ${error.message}`);
        }
        
        // Continue anyway, but log the errors
      }
    }
    
    // Replace the config store with the new one
    configStore = newConfigStore;
    
    // Emit change event
    eventBus.emit('config:changed', {
      path,
      value,
      timestamp: Date.now()
    });
    
    logger.debug(`Configuration value set: ${path}`);
    return true;
  } catch (error) {
    logger.error(`Error setting configuration value: ${error.message}`);
    return false;
  }
}

/**
 * Get all configuration
 * @returns {Object} Complete configuration
 */
function getAll() {
  if (!isInitialized) {
    logger.warn('Configuration manager not initialized, returning empty object');
    return {};
  }
  
  return deepCopy(configStore);
}

/**
 * Update multiple configuration values
 * @param {Object} updates - Configuration updates
 * @returns {boolean} Success status
 */
function update(updates) {
  if (!isInitialized) {
    logger.warn('Configuration manager not initialized, cannot update');
    return false;
  }
  
  if (!updates || typeof updates !== 'object') {
    logger.error('Invalid updates object');
    return false;
  }
  
  try {
    // Create a new copy of the config store
    const newConfigStore = deepCopy(configStore);
    
    // Apply all updates
    for (const [path, value] of Object.entries(updates)) {
      setNestedProperty(newConfigStore, path, value);
    }
    
    // Validate if schema is available
    if (Object.keys(configSchema).length > 0) {
      const validation = validateConfig(newConfigStore, configSchema);
      
      if (!validation.valid) {
        logger.warn(`Configuration validation failed with ${validation.errors.length} errors`);
        for (const error of validation.errors) {
          logger.warn(`Config validation error: ${error.message}`);
        }
        
        // Continue anyway, but log the errors
      }
    }
    
    // Replace the config store with the new one
    configStore = newConfigStore;
    
    // Emit change event
    eventBus.emit('config:updated', {
      updates: Object.keys(updates),
      timestamp: Date.now()
    });
    
    logger.info(`Updated ${Object.keys(updates).length} configuration values`);
    return true;
  } catch (error) {
    logger.error(`Error updating configuration: ${error.message}`);
    return false;
  }
}

/**
 * Reset configuration to defaults
 * @param {Object} defaultConfig - Default configuration
 * @returns {boolean} Success status
 */
function reset(defaultConfig = {}) {
  try {
    // Replace the config store with the defaults
    configStore = deepCopy(defaultConfig);
    
    // Emit reset event
    eventBus.emit('config:reset', {
      timestamp: Date.now()
    });
    
    logger.info('Configuration reset to defaults');
    return true;
  } catch (error) {
    logger.error(`Error resetting configuration: ${error.message}`);
    return false;
  }
}

// Export public API
module.exports = {
  initialize,
  get,
  set,
  getAll,
  update,
  reset,
  isInitialized: () => isInitialized
};
