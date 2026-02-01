/**
 * Semantic Context Adapter
 * 
 * This adapter resolves the interface mismatch between components that expect
 * a retrieveContext method and the semantic-context-manager which provides
 * a searchContext method. It ensures proper standardization of interfaces
 * as defined in LEO_STANDARDIZATION.md.
 * 
 * @module lib/adapters/semantic-context-adapter
 * @author Leo Development Team
 * @created May 14, 2025
 */

const { createComponentLogger } = require('../utils/logger');
const semanticContextManager = require('../services/semantic-context-manager');
const eventBus = require('../utils/event-bus');

// Create logger
const logger = createComponentLogger('semantic-context-adapter');

/**
 * Semantic Context Adapter
 * 
 * Adapts the semantic context manager interface to provide a standardized
 * retrieveContext method expected by other components
 */
class SemanticContextAdapter {
  constructor() {
    this.initialized = false;
    this._initPromise = null;
  }

  /**
   * Initialize the adapter and its dependencies
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      if (this.initialized) {
        logger.info('Semantic Context Adapter already initialized');
        return;
      }

      logger.info('Initializing Semantic Context Adapter');

      try {
        // Initialize the semantic context manager
        await semanticContextManager.initialize();
        
        this.initialized = true;
        logger.info('Semantic Context Adapter initialized successfully');
        eventBus.emit('service:initialized', { 
          service: 'semantic-context-adapter',
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error(`Failed to initialize Semantic Context Adapter: ${error.message}`, error);
        throw new Error(`Semantic Context Adapter initialization failed: ${error.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Retrieve context based on a query
   * This method adapts the searchContext method to match the expected retrieveContext interface
   * 
   * @param {string} query - The query to retrieve context for
   * @param {Object} options - Options for context retrieval
   * @returns {Promise<Object>} Retrieved context in standardized format
   */
  async retrieveContext(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.info(`Retrieving context for query: ${query.substring(0, 50)}...`);
      
      // Map options to the format expected by searchContext
      const searchOptions = {
        limit: options.limit || 10,
        minRelevance: options.minRelevance || 0.65,
        includeContent: true,
        ...options
      };
      
      // Call the searchContext method
      const searchResult = await semanticContextManager.searchContext(query, searchOptions);
      
      // Transform the result to match the expected retrieveContext format
      return {
        success: searchResult.success,
        query,
        results: searchResult.results.map(result => ({
          title: result.title || result.path,
          path: result.path,
          content: result.content,
          relevance: result.relevance,
          type: result.type || 'code'
        })),
        metadata: {
          timestamp: Date.now(),
          queryTime: searchResult.metadata?.queryTime,
          resultCount: searchResult.results.length
        }
      };
    } catch (error) {
      logger.error(`Error retrieving context: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        results: [],
        metadata: {
          timestamp: Date.now(),
          error: error.message
        }
      };
    }
  }
}

// Create singleton instance
const semanticContextAdapter = new SemanticContextAdapter();

module.exports = {
  semanticContextAdapter
};
