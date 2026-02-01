/**
 * LLM Platform Adapter
 * 
 * Provides an adapter between Leo and various LLM platforms.
 * This component enables Leo to work with different LLM platforms
 * while maintaining its core functionality.
 * 
 * @module lib/integration/llm-platform-adapter
 * @author Leo Development Team
 * @created May 13, 2025
 */

const { createComponentLogger } = require('../utils/logger');
const { metaPromptLayer } = require('./meta-prompt-layer');
const { contextInjectionSystem } = require('./context-injection-system');
const { leoQueryInterface } = require('./leo-query-interface');
const { sessionAwarenessAdapter } = require('./session-awareness-adapter');

// Create logger
const logger = createComponentLogger('llm-platform-adapter');

/**
 * LLM Platform Adapter
 * 
 * Adapts Leo to work with different LLM platforms
 */
class LlmPlatformAdapter {
  constructor() {
    this.initialized = false;
    this._initPromise = null;
    this.platformAdapters = new Map();
    this.defaultPlatform = 'windsurf';
  }

  /**
   * Initialize the LLM Platform Adapter
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      if (this.initialized) {
        logger.info('LLM Platform Adapter already initialized');
        return;
      }

      logger.info('Initializing LLM Platform Adapter');

      try {
        // Initialize dependencies
        await metaPromptLayer.initialize();
        await contextInjectionSystem.initialize();
        await leoQueryInterface.initialize();
        await sessionAwarenessAdapter.initialize();
        
        // Register platform adapters
        this.registerPlatformAdapters();
        
        this.initialized = true;
        logger.info('LLM Platform Adapter initialized successfully');
      } catch (error) {
        logger.error(`Failed to initialize LLM Platform Adapter: ${error.message}`, error);
        throw new Error(`LLM Platform Adapter initialization failed: ${error.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Register all platform adapters
   */
  registerPlatformAdapters() {
    // Windsurf adapter
    this.registerPlatformAdapter('windsurf', {
      enhancePrompt: async (prompt, options) => {
        return await metaPromptLayer.getEnhancedPromptText(prompt, {
          template: options.template || 'standard',
          contextStrategy: options.contextStrategy || 'standard'
        });
      },
      
      processResponse: async (response, options) => {
        // Record the response in session awareness
        await sessionAwarenessAdapter.storeData('last_llm_response', {
          timestamp: new Date(),
          platform: 'windsurf',
          responseLength: response.length
        });
        
        // No modification needed for Windsurf responses
        return response;
      },
      
      handleQuery: async (query, options) => {
        return await leoQueryInterface.executeQuery(query);
      }
    });
    
    // OpenAI adapter
    this.registerPlatformAdapter('openai', {
      enhancePrompt: async (prompt, options) => {
        // OpenAI might need a different prompt format
        return await metaPromptLayer.getEnhancedPromptText(prompt, {
          template: 'minimal',
          contextStrategy: options.contextStrategy || 'standard'
        });
      },
      
      processResponse: async (response, options) => {
        // Record the response in session awareness
        await sessionAwarenessAdapter.storeData('last_llm_response', {
          timestamp: new Date(),
          platform: 'openai',
          responseLength: response.length
        });
        
        // No modification needed for OpenAI responses
        return response;
      },
      
      handleQuery: async (query, options) => {
        return await leoQueryInterface.executeQuery(query);
      }
    });
    
    // Anthropic adapter
    this.registerPlatformAdapter('anthropic', {
      enhancePrompt: async (prompt, options) => {
        // Anthropic might need a different prompt format
        return await metaPromptLayer.getEnhancedPromptText(prompt, {
          template: 'comprehensive',
          contextStrategy: options.contextStrategy || 'standard'
        });
      },
      
      processResponse: async (response, options) => {
        // Record the response in session awareness
        await sessionAwarenessAdapter.storeData('last_llm_response', {
          timestamp: new Date(),
          platform: 'anthropic',
          responseLength: response.length
        });
        
        // No modification needed for Anthropic responses
        return response;
      },
      
      handleQuery: async (query, options) => {
        return await leoQueryInterface.executeQuery(query);
      }
    });
  }

  /**
   * Register a platform adapter
   * 
   * @param {string} platform - The name of the platform
   * @param {Object} adapter - The adapter implementation
   */
  registerPlatformAdapter(platform, adapter) {
    this.platformAdapters.set(platform, adapter);
    
    logger.debug(`Registered platform adapter: ${platform}`);
  }

  /**
   * Enhance a prompt for a specific platform
   * 
   * @param {string} prompt - The original prompt
   * @param {Object} options - Options for prompt enhancement
   * @returns {string} The enhanced prompt
   */
  async enhancePrompt(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!prompt) {
      throw new Error('Invalid prompt: prompt cannot be empty');
    }
    
    const platform = options.platform || this.defaultPlatform;
    logger.info(`Enhancing prompt for platform: ${platform}`);
    
    const adapter = this.platformAdapters.get(platform);
    if (!adapter) {
      logger.warn(`Platform adapter not found: ${platform}, using default`);
      const defaultAdapter = this.platformAdapters.get(this.defaultPlatform);
      return await defaultAdapter.enhancePrompt(prompt, options);
    }
    
    try {
      // Create a session boundary marker for this prompt
      await sessionAwarenessAdapter.createSessionBoundary({
        type: 'prompt',
        platform,
        timestamp: new Date()
      });
      
      return await adapter.enhancePrompt(prompt, options);
    } catch (error) {
      logger.error(`Prompt enhancement failed for platform ${platform}: ${error.message}`, error);
      throw new Error(`Prompt enhancement failed: ${error.message}`);
    }
  }

  /**
   * Process a response from a specific platform
   * 
   * @param {string} response - The response to process
   * @param {Object} options - Options for response processing
   * @returns {string} The processed response
   */
  async processResponse(response, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!response) {
      throw new Error('Invalid response: response cannot be empty');
    }
    
    const platform = options.platform || this.defaultPlatform;
    logger.info(`Processing response from platform: ${platform}`);
    
    const adapter = this.platformAdapters.get(platform);
    if (!adapter) {
      logger.warn(`Platform adapter not found: ${platform}, using default`);
      const defaultAdapter = this.platformAdapters.get(this.defaultPlatform);
      return await defaultAdapter.processResponse(response, options);
    }
    
    try {
      // Create a session boundary marker for this response
      await sessionAwarenessAdapter.createSessionBoundary({
        type: 'response',
        platform,
        timestamp: new Date()
      });
      
      return await adapter.processResponse(response, options);
    } catch (error) {
      logger.error(`Response processing failed for platform ${platform}: ${error.message}`, error);
      throw new Error(`Response processing failed: ${error.message}`);
    }
  }

  /**
   * Handle a query for a specific platform
   * 
   * @param {Object} query - The query to handle
   * @param {Object} options - Options for query handling
   * @returns {Object} The query result
   */
  async handleQuery(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!query) {
      throw new Error('Invalid query: query cannot be empty');
    }
    
    // Ensure query has a params property for system.getCapabilities
    if (query.type === 'system.getCapabilities' && !query.params) {
      query.params = {};
    }
    
    const platform = options.platform || this.defaultPlatform;
    logger.info(`Handling query for platform: ${platform}`);
    
    const adapter = this.platformAdapters.get(platform);
    if (!adapter) {
      logger.warn(`Platform adapter not found: ${platform}, using default`);
      const defaultAdapter = this.platformAdapters.get(this.defaultPlatform);
      return await defaultAdapter.handleQuery(query, options);
    }
    
    try {
      return await adapter.handleQuery(query, options);
    } catch (error) {
      logger.error(`Query handling failed for platform ${platform}: ${error.message}`, error);
      throw new Error(`Query handling failed: ${error.message}`);
    }
  }

  /**
   * Get the available platforms
   * 
   * @returns {Array} Available platforms
   */
  getAvailablePlatforms() {
    return Array.from(this.platformAdapters.keys());
  }

  /**
   * Set the default platform
   * 
   * @param {string} platform - The platform to set as default
   */
  setDefaultPlatform(platform) {
    if (!this.platformAdapters.has(platform)) {
      throw new Error(`Platform not available: ${platform}`);
    }
    
    this.defaultPlatform = platform;
    logger.info(`Default platform set to: ${platform}`);
  }
}

// Create singleton instance
const llmPlatformAdapter = new LlmPlatformAdapter();

module.exports = {
  llmPlatformAdapter
};
