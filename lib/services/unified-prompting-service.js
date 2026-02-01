/**
 * Unified Prompting Service
 * 
 * Integrates the Context Injection System, Template Registry, and Clipboard Service
 * to provide a seamless prompting experience that maintains cognitive continuity
 * across token boundaries.
 * 
 * @module lib/services/unified-prompting-service
 * @author Leo Development Team
 * @created May 22, 2025
 */

const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'unified-prompting-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Unified Prompting Service
 * 
 * Provides a unified interface for generating and managing prompts
 */
class UnifiedPromptingService {
  /**
   * Create a new UnifiedPromptingService instance
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    // Initialization state
    this.initialized = false;
    this.initializing = false;
    this._initPromise = null;
    this.lastError = null;
    
    // Dependencies (lazy loaded)
    this._contextInjectionSystem = null;
    this._templateRegistry = null;
    this._clipboardService = null;
    this._sessionAwarenessAdapter = null;
    
    // Configuration with defaults
    this.config = {
      defaultTemplate: 'standard',
      autoClipboard: true,
      includeSessionContext: true,
      cachePrompts: true,
      promptCacheSize: 50,
      ...config
    };
    
    // Prompt cache
    this.promptCache = [];
  }

  /**
   * Initialize the unified prompting service
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
      
      // Initialize dependencies (lazy loading)
      await this._initDependencies();
      
      // Set initialization flags
      this.initialized = true;
      this.initializing = false;
      
      // Emit initialization event
      eventBus.emit('service:initialized', { 
        service: COMPONENT_NAME, 
        timestamp: Date.now()
      });
      
      return { 
        success: true, 
        timestamp: Date.now()
      };
    } catch (error) {
      this.lastError = error;
      this.initializing = false;
      
      logger.error(`Failed to initialize ${COMPONENT_NAME}: ${error.message}`, error);
      
      // Emit error event
      eventBus.emit('service:initialization_failed', { 
        service: COMPONENT_NAME, 
        error: error.message,
        timestamp: Date.now()
      });
      
      // Clear the init promise so we can try again
      this._initPromise = null;
      
      return { 
        success: false, 
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Initialize dependencies using lazy loading
   * @private
   * @returns {Promise<void>}
   */
  async _initDependencies() {
    try {
      // Lazy load dependencies to avoid circular dependencies
      
      // Context Injection System
      if (!this._contextInjectionSystem) {
        logger.debug('Lazy loading Context Injection System');
        const { contextInjectionSystem } = require('../integration/context-injection-system');
        this._contextInjectionSystem = contextInjectionSystem;
        
        // Initialize if not already initialized
        if (!this._contextInjectionSystem.initialized) {
          const initResult = await this._contextInjectionSystem.initialize();
          if (!initResult.success) {
            throw new Error(`Failed to initialize Context Injection System: ${initResult.error}`);
          }
        }
      }
      
      // Template Registry
      if (!this._templateRegistry) {
        logger.debug('Lazy loading Template Registry');
        const { templateRegistry } = require('./template-registry');
        this._templateRegistry = templateRegistry;
        
        // Initialize if not already initialized
        if (!this._templateRegistry.initialized) {
          const initResult = await this._templateRegistry.initialize();
          if (!initResult.success) {
            throw new Error(`Failed to initialize Template Registry: ${initResult.error}`);
          }
        }
      }
      
      // Clipboard Service
      if (!this._clipboardService) {
        logger.debug('Lazy loading Clipboard Service');
        const { clipboardService } = require('./clipboard-service');
        this._clipboardService = clipboardService;
        
        // Initialize if not already initialized
        if (!this._clipboardService.initialized) {
          const initResult = await this._clipboardService.initialize();
          if (!initResult.success) {
            logger.warn(`Clipboard Service initialization failed, but continuing: ${initResult.error}`);
            // Don't throw here, we can continue without clipboard
          }
        }
      }
      
      // Session Awareness Adapter
      if (!this._sessionAwarenessAdapter && this.config.includeSessionContext) {
        logger.debug('Lazy loading Session Awareness Adapter');
        const { sessionAwarenessAdapter } = require('../integration/session-awareness-adapter');
        this._sessionAwarenessAdapter = sessionAwarenessAdapter;
        
        // Initialize if not already initialized
        if (!this._sessionAwarenessAdapter.initialized) {
          const initResult = await this._sessionAwarenessAdapter.initialize();
          if (!initResult.success) {
            logger.warn(`Session Awareness Adapter initialization failed, but continuing: ${initResult.error}`);
            // Don't throw here, we can continue without session awareness
          }
        }
      }
      
      logger.info('All dependencies initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize dependencies: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate a prompt with context injection and template formatting
   * @param {string} content - Prompt content
   * @param {Object} options - Options for prompt generation
   * @returns {Promise<Object>} Generated prompt result
   */
  async generatePrompt(content, options = {}) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Cannot generate prompt: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          timestamp: Date.now()
        };
      }
    }
    
    try {
      // Merge options with defaults
      const promptOptions = {
        templateName: this.config.defaultTemplate,
        includeContext: true,
        copyToClipboard: this.config.autoClipboard,
        sessionId: null,
        ...options
      };
      
      // Get session context if available and requested
      let sessionContext = '';
      if (this.config.includeSessionContext && this._sessionAwarenessAdapter && promptOptions.sessionId) {
        try {
          const sessionResult = await this._sessionAwarenessAdapter.getSessionState(promptOptions.sessionId);
          if (sessionResult.success) {
            sessionContext = sessionResult.state.summary || '';
          }
        } catch (error) {
          logger.warn(`Failed to get session context: ${error.message}`);
          // Continue without session context
        }
      }
      
      // Generate context using Context Injection System
      let injectedContext = '';
      if (promptOptions.includeContext) {
        try {
          const contextResult = await this._contextInjectionSystem.generateContext(content, {
            sessionId: promptOptions.sessionId,
            sessionContext
          });
          
          if (contextResult.success) {
            injectedContext = contextResult.context;
          } else {
            logger.warn(`Context generation failed: ${contextResult.error}`);
            // Continue without injected context
          }
        } catch (error) {
          logger.warn(`Error during context injection: ${error.message}`);
          // Continue without injected context
        }
      }
      
      // Format with template
      const templateResult = await this._templateRegistry.formatWithTemplate(
        promptOptions.templateName,
        content,
        injectedContext
      );
      
      if (!templateResult.success) {
        throw new Error(`Template formatting failed: ${templateResult.error}`);
      }
      
      const formattedPrompt = templateResult.formatted;
      
      // Copy to clipboard if requested
      let clipboardResult = { success: false, reason: 'not_requested' };
      if (promptOptions.copyToClipboard) {
        clipboardResult = await this._clipboardService.copyToClipboard(formattedPrompt);
      }
      
      // Cache the prompt if enabled
      if (this.config.cachePrompts) {
        this._cachePrompt(formattedPrompt, content, promptOptions);
      }
      
      // Emit prompt generated event
      eventBus.emit('prompt:generated', {
        timestamp: Date.now(),
        templateUsed: templateResult.templateUsed,
        hasContext: !!injectedContext,
        clipboardSuccess: clipboardResult.success
      });
      
      return {
        success: true,
        prompt: formattedPrompt,
        originalContent: content,
        context: injectedContext,
        templateUsed: templateResult.templateUsed,
        clipboardResult,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to generate prompt: ${error.message}`);
      
      return { 
        success: false, 
        error: error.message,
        originalContent: content,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Cache a generated prompt
   * @private
   * @param {string} prompt - Formatted prompt
   * @param {string} originalContent - Original content
   * @param {Object} options - Prompt options
   */
  _cachePrompt(prompt, originalContent, options) {
    // Add to cache
    this.promptCache.unshift({
      prompt,
      originalContent,
      options,
      timestamp: Date.now()
    });
    
    // Trim cache if needed
    if (this.promptCache.length > this.config.promptCacheSize) {
      this.promptCache = this.promptCache.slice(0, this.config.promptCacheSize);
    }
  }
  
  /**
   * Get recent prompts from cache
   * @param {number} [count=10] - Number of prompts to retrieve
   * @returns {Object[]} Recent prompts
   */
  getRecentPrompts(count = 10) {
    return this.promptCache.slice(0, count);
  }
  
  /**
   * Get available templates
   * @returns {Promise<Object>} Templates object
   */
  async getAvailableTemplates() {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Cannot get templates: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          timestamp: Date.now()
        };
      }
    }
    
    try {
      const templates = this._templateRegistry.getTemplates();
      
      return {
        success: true,
        templates: templates,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to get templates: ${error.message}`);
      
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
      clipboardAvailable: this._clipboardService ? this._clipboardService.initialized : false,
      templateCount: this._templateRegistry ? 
        (this._templateRegistry.templates.size + this._templateRegistry.customTemplates.size) : 0,
      contextInjectionAvailable: this._contextInjectionSystem ? this._contextInjectionSystem.initialized : false,
      sessionAwarenessAvailable: this._sessionAwarenessAdapter ? this._sessionAwarenessAdapter.initialized : false,
      cachedPrompts: this.promptCache.length,
      lastError: this.lastError ? this.lastError.message : null,
      timestamp: Date.now()
    };
  }
}

// Create singleton instance
const unifiedPromptingService = new UnifiedPromptingService();

module.exports = {
  unifiedPromptingService
};
