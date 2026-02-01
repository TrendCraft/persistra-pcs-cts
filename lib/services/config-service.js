/**
 * Configuration Service
 * 
 * Provides a centralized configuration system for all Leo components.
 * This service loads configuration from the config directory and provides
 * methods for components to access their configuration settings.
 * 
 * @module lib/services/config-service
 * @author Leo Development Team
 * @created May 14, 2025
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Create logger
const logger = createComponentLogger('config-service');
// Track which warnings have already been logged (per process)
const _loggedWarnings = new Set();
function warnOnce(msg) {
  if (!_loggedWarnings.has(msg)) {
    logger.warn(msg);
    _loggedWarnings.add(msg);
  }
}

/**
 * Configuration Service
 * 
 * Manages configuration for all Leo components
 */
class ConfigService {
  constructor() {
    this.initialized = false;
    this.configPath = path.join(process.cwd(), 'config', 'leo-config.json');
    this.config = null;
    this.defaultConfig = {
      version: "1.0.0",
      environment: "development",
      logging: {
        level: "info",
        format: "json",
        directory: "logs"
      },
      thresholds: {
        visionAlignment: 0.75,
        driftDetection: 0.65,
        semanticSimilarity: 0.8
      },
      services: {
        realTimeAwareness: {
          enabled: true,
          updateInterval: 5000
        },
        visionAnchor: {
          enabled: true,
          checkFrequency: "high"
        },
        metaCognitive: {
          enabled: true,
          reflectionInterval: 10000
        },
        contextInjection: {
          enabled: true,
          strategy: "proactive"
        }
      },
      integration: {
        llmPlatform: {
          default: "windsurf",
          platforms: {
            windsurf: {
              enabled: true,
              apiVersion: "latest"
            },
            openai: {
              enabled: false
            },
            anthropic: {
              enabled: false
            }
          }
        }
      },
      dataStorage: {
        directory: "data",
        backupFrequency: "daily"
      }
    };
    
    // Initialize event listeners
    this._initEventListeners();
  }

  /**
   * Initialize event listeners
   * @private
   */
  _initEventListeners() {
    eventBus.on('config:reload', () => {
      this.reloadConfig();
    }, 'config-service');
  }

  /**
   * Initialize the configuration service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) {
      warnOnce('Configuration service already initialized');
      return true;
    }

    logger.info('Initializing configuration service');

    try {
      // Load configuration
      await this.loadConfig();
      
      // Set initialization flag
      this.initialized = true;
      
      // Emit initialization event
      eventBus.emit('config:initialized', { 
        timestamp: new Date().toISOString() 
      });
      
      logger.info('Configuration service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize configuration service: ${error.message}`);
      
      // Use default configuration
      this.config = this.defaultConfig;
      
      // Set initialization flag to allow the system to continue
      this.initialized = true;
      
      warnOnce('Using default configuration');
      return true;
    }
  }

  /**
   * Load configuration from file
   * @returns {Promise<boolean>} Success status
   */
  async loadConfig() {
    try {
      // Check if config file exists
      try {
        await fs.access(this.configPath);
      } catch (error) {
        warnOnce(`Configuration file not found: ${this.configPath}`);
        
        // Create config directory if it doesn't exist
        const configDir = path.dirname(this.configPath);
        await fs.mkdir(configDir, { recursive: true });
        
        // Write default config to file
        await fs.writeFile(this.configPath, JSON.stringify(this.defaultConfig, null, 2));
        logger.info(`Created default configuration file: ${this.configPath}`);
      }
      
      // Read config file
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      logger.info('Configuration loaded successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to load configuration: ${error.message}`);
      
      // Use default configuration
      this.config = this.defaultConfig;
      
      warnOnce('Using default configuration');
      return false;
    }
  }

  /**
   * Reload configuration from file
   * @returns {Promise<boolean>} Success status
   */
  async reloadConfig() {
    logger.info('Reloading configuration');
    
    const wasInitialized = this.initialized;
    this.initialized = false;
    
    const success = await this.loadConfig();
    
    this.initialized = wasInitialized;
    
    if (success) {
      // Emit configuration changed event
      eventBus.emit('config:changed', {
        timestamp: new Date().toISOString()
      });
    }
    
    return success;
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key (dot notation)
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value
   */
  get(key, defaultValue = null) {
    if (!this.initialized) {
      warnOnce('Configuration service not initialized, using default values');
      return defaultValue;
    }
    
    if (!key) {
      return this.config;
    }
    
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return defaultValue;
      }
      
      value = value[k];
      
      if (value === undefined) {
        return defaultValue;
      }
    }
    
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set configuration value
   * @param {string} key - Configuration key (dot notation)
   * @param {*} value - Configuration value
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value) {
    if (!this.initialized) {
      warnOnce('Configuration service not initialized, cannot set values');
      return false;
    }
    
    if (!key) {
      logger.error('Invalid configuration key');
      return false;
    }
    
    const keys = key.split('.');
    let target = this.config;
    
    // Navigate to the target object
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      
      if (target[k] === undefined || target[k] === null || typeof target[k] !== 'object') {
        target[k] = {};
      }
      
      target = target[k];
    }
    
    // Set the value
    target[keys[keys.length - 1]] = value;
    
    // Save the configuration
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      
      // Emit configuration changed event
      eventBus.emit('config:changed', {
        key,
        value,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Configuration updated: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Get component configuration
   * @param {string} componentName - Component name
   * @returns {Object} Component configuration
   */
  getComponentConfig(componentName) {
    if (!this.initialized) {
      warnOnce('Configuration service not initialized, using default values');
      return {};
    }
    
    // Check for component-specific configuration
    const componentConfig = this.get(`components.${componentName}`, {});
    
    // Check for service configuration
    const serviceConfig = this.get(`services.${componentName}`, {});
    
    // Check for integration configuration
    const integrationConfig = this.get(`integration.${componentName}`, {});
    
    // Merge configurations
    return {
      ...componentConfig,
      ...serviceConfig,
      ...integrationConfig,
      thresholds: this.get('thresholds', {})
    };
  }
}

// Create singleton instance
const configService = new ConfigService();

// Initialize the config service immediately when the module is loaded
(async () => {
  try {
    if (!configService.initialized) {
      logger.info('Auto-initializing configuration service');
      await configService.initialize();
    }
  } catch (error) {
    logger.error(`Failed to auto-initialize configuration service: ${error.message}`);
  }
})();

// Export a proxy that ensures the config service is initialized before any method is called
module.exports = new Proxy({
  initialize: async () => {
    if (configService.initialized) {
      logger.info('Configuration service already initialized');
      return true;
    }
    return configService.initialize();
  },
  getConfig: (key, defaultValue) => {
    if (!configService.initialized) {
      warnOnce('Configuration service not initialized, using default values');
      return defaultValue;
    }
    return configService.get(key, defaultValue);
  },
  setConfig: (key, value) => {
    if (!configService.initialized) {
      warnOnce('Configuration service not initialized, cannot set config');
      return false;
    }
    return configService.set(key, value);
  },
  getComponentConfig: (componentName) => {
    if (!configService.initialized) {
      warnOnce('Configuration service not initialized, using default values');
      return {};
    }
    return configService.getComponentConfig(componentName);
  },
  subscribe: (componentName, callback) => {
    if (!configService.initialized) {
      warnOnce('Configuration service not initialized, subscription may not work');
    }
    return eventBus.on('config:changed', callback, componentName);
  },
  updateConfig: (options) => {
    if (!configService.initialized) {
      warnOnce('Configuration service not initialized, cannot update config');
      return false;
    }
    // Update multiple config values at once
    Object.entries(options).forEach(([key, value]) => {
      configService.set(key, value);
    });
    return true;
  },
  isInitialized: () => configService.initialized
}, {
  get: function(target, prop) {
    // Return the property if it exists
    if (prop in target) {
      return target[prop];
    }
    
    // For any other property access, ensure the config service is initialized
    if (!configService.initialized) {
      warnOnce(`Configuration service not initialized, accessing property: ${prop.toString()}`);
    }
    
    // Return the property from the config service
    return configService[prop];
  }
});
