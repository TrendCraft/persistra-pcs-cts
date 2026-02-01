/**
 * Clipboard Service
 * 
 * Provides a robust clipboard interface with fallback mechanisms and error handling.
 * This service follows Leo's standardized interface patterns and integrates with
 * the event bus for system-wide awareness.
 * 
 * @module lib/services/clipboard-service
 * @author Leo Development Team
 * @created May 22, 2025
 */

const clipboardy = require('clipboardy');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'clipboard-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Clipboard Service
 * 
 * Provides clipboard functionality with fallback mechanisms
 */
class ClipboardService {
  /**
   * Create a new ClipboardService instance
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    // Initialization state
    this.initialized = false;
    this.initializing = false;
    this._initPromise = null;
    this.lastError = null;
    this.initRetries = 0;
    this.maxInitRetries = 3;
    
    // Clipboard availability
    this.isAvailable = false;
    
    // Configuration with defaults
    this.config = {
      enabled: true,
      saveToFile: true,
      filePath: path.join(process.cwd(), 'data', 'clipboard', 'prompt.txt'),
      notifyUser: true,
      ...config
    };
  }

  /**
   * Initialize the clipboard service
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // If already initialized, return immediately
    if (this.initialized) {
      logger.debug(`${COMPONENT_NAME} already initialized`);
      return { success: true, alreadyInitialized: true };
    }
    
    // If initialization is in progress, return the existing promise
    if (this._initPromise) {
      logger.debug(`${COMPONENT_NAME} initialization already in progress`);
      return this._initPromise;
    }
    
    // Set initializing flag and create initialization promise
    this.initializing = true;
    this._initPromise = this._doInitialize(options);
    return this._initPromise;
  }
  
  /**
   * Internal initialization implementation
   * @private
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async _doInitialize(options = {}) {
    logger.info(`Initializing ${COMPONENT_NAME}`);
    
    try {
      // Apply configuration
      this.config = { ...this.config, ...options };
      
      // Ensure directory exists for file fallback
      if (this.config.saveToFile) {
        const dir = path.dirname(this.config.filePath);
        await fs.mkdir(dir, { recursive: true });
        logger.debug(`Created clipboard file directory: ${dir}`);
      }
      
      // Check clipboard availability
      this.isAvailable = await this.checkAvailability();
      logger.info(`Clipboard availability: ${this.isAvailable ? 'Available' : 'Not available'}`);
      
      // Set initialization flags
      this.initialized = true;
      this.initializing = false;
      
      // Emit initialization event
      eventBus.emit('service:initialized', { 
        service: COMPONENT_NAME, 
        timestamp: Date.now(),
        isAvailable: this.isAvailable
      });
      
      return { 
        success: true, 
        isAvailable: this.isAvailable,
        timestamp: Date.now()
      };
    } catch (error) {
      this.lastError = error;
      this.initializing = false;
      this.initRetries++;
      
      logger.error(`Failed to initialize ${COMPONENT_NAME} (attempt ${this.initRetries}/${this.maxInitRetries}): ${error.message}`, error);
      
      // Emit error event
      eventBus.emit('service:initialization_failed', { 
        service: COMPONENT_NAME, 
        error: error.message,
        attempt: this.initRetries,
        timestamp: Date.now()
      });
      
      // If we haven't exceeded max retries, clear the init promise so we can try again
      if (this.initRetries < this.maxInitRetries) {
        this._initPromise = null;
      }
      
      return { 
        success: false, 
        error: error.message,
        retryable: this.initRetries < this.maxInitRetries
      };
    }
  }
  
  /**
   * Check clipboard availability
   * @returns {Promise<boolean>} True if clipboard is available
   */
  async checkAvailability() {
    if (!this.config.enabled) return false;
    
    try {
      const testText = "Leo Clipboard Test";
      await clipboardy.write(testText);
      const readBack = await clipboardy.read();
      return readBack === testText;
    } catch (error) {
      logger.warn(`Clipboard access is not available: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<Object>} Result object
   */
  async copyToClipboard(text) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Cannot copy to clipboard: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          fallback: false
        };
      }
    }
    
    if (!this.config.enabled) {
      return { success: false, reason: 'clipboard_disabled', fallback: false };
    }
    
    // Try primary clipboard method
    try {
      await clipboardy.write(text);
      logger.info('Content copied to clipboard successfully');
      
      // Emit success event
      eventBus.emit('clipboard:copied', {
        timestamp: Date.now(),
        method: 'primary',
        textLength: text.length
      });
      
      // Also save to file if configured (as a backup)
      if (this.config.saveToFile) {
        await this.saveToFile(text);
      }
      
      return { 
        success: true,
        method: 'primary',
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Primary clipboard method failed: ${error.message}`);
      
      // Try fallback methods
      const fallbackResult = await this.tryFallbackMethods(text);
      
      // If all clipboard methods fail, save to file as last resort
      if (!fallbackResult.success && this.config.saveToFile) {
        const fileResult = await this.saveToFile(text);
        
        if (fileResult.success) {
          // Emit fallback event
          eventBus.emit('clipboard:fallback', {
            timestamp: Date.now(),
            method: 'file',
            filePath: fileResult.filePath,
            reason: error.message
          });
        }
        
        return {
          success: fileResult.success,
          method: 'file',
          filePath: fileResult.filePath,
          fallback: true,
          primaryError: error.message,
          timestamp: Date.now()
        };
      }
      
      return fallbackResult;
    }
  }
  
  /**
   * Try fallback clipboard methods based on platform
   * @private
   * @param {string} text - Text to copy
   * @returns {Promise<Object>} Result object
   */
  async tryFallbackMethods(text) {
    try {
      const platform = process.platform;
      
      if (platform === 'darwin') {
        execSync('pbcopy', { input: text });
      } else if (platform === 'win32') {
        const tempFile = path.join(require('os').tmpdir(), 'leo-clipboard.txt');
        await fs.writeFile(tempFile, text, 'utf8');
        execSync(`type "${tempFile}" | clip`);
      } else if (platform === 'linux') {
        execSync(`echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`);
      }
      
      logger.info('Content copied to clipboard using fallback method');
      
      // Emit fallback success event
      eventBus.emit('clipboard:fallback_success', {
        timestamp: Date.now(),
        method: 'platform_specific',
        platform: process.platform
      });
      
      return { 
        success: true, 
        method: 'fallback',
        platform: process.platform,
        fallback: true,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Fallback clipboard methods failed: ${error.message}`);
      
      // Emit fallback failure event
      eventBus.emit('clipboard:fallback_failed', {
        timestamp: Date.now(),
        error: error.message
      });
      
      return { 
        success: false, 
        reason: 'all_methods_failed',
        error: error.message,
        fallback: true,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Save text to file as fallback
   * @param {string} text - Text to save
   * @param {string} [customPath] - Optional custom file path
   * @returns {Promise<Object>} Result object
   */
  async saveToFile(text, customPath = null) {
    try {
      const filePath = customPath || this.config.filePath;
      await fs.writeFile(filePath, text, 'utf8');
      logger.info(`Content saved to file: ${filePath}`);
      
      return { 
        success: true, 
        filePath,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to save content to file: ${error.message}`);
      
      return { 
        success: false, 
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      isAvailable: this.isAvailable,
      config: this.config,
      lastError: this.lastError ? this.lastError.message : null,
      timestamp: Date.now()
    };
  }
}

// Create singleton instance
const clipboardService = new ClipboardService();

module.exports = {
  clipboardService
};
