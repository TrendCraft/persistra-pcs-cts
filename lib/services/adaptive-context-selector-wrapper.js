/**
 * Adaptive Context Selector Wrapper
 * 
 * This module wraps the AdaptiveContextSelector class to provide a singleton instance
 * that follows the same pattern as other services in Leo.
 * 
 * @module lib/services/adaptive-context-selector-wrapper
 * @author Leo Development Team
 * @created May 13, 2025
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const adaptiveContextSelector = require('./adaptive-context-selector').adaptiveContextSelector;
const { robustSemanticContextAdapter } = require('../adapters/legacy/robust-semantic-context-adapter');

// Create logger
const logger = createComponentLogger('adaptive-context-selector-wrapper');

/**
 * Wrapper for the Adaptive Context Selector
 * 
 * Ensures proper initialization and connection with dependencies
 */
class AdaptiveContextSelectorWrapper {
  constructor() {
    this.initialized = false;
    this._initPromise = null;
  }

  /**
   * Initialize the wrapper and its dependencies
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      if (this.initialized) {
        logger.info('Adaptive Context Selector Wrapper already initialized');
        return;
      }

      logger.info('Initializing Adaptive Context Selector Wrapper');

      try {
        // First initialize the semantic context adapter
        await robustSemanticContextAdapter.initialize();
        
        // Then initialize the adaptive context selector
        await adaptiveContextSelector.initialize();
        
        // Verify that the robust semantic context adapter is properly connected
        if (!robustSemanticContextAdapter.retrieveContext) {
          throw new Error('Robust Semantic Context Adapter does not have retrieveContext method');
        }
        
        this.initialized = true;
        logger.info('Adaptive Context Selector Wrapper initialized successfully');
      } catch (error) {
        logger.error(`Failed to initialize Adaptive Context Selector Wrapper: ${error.message}`, error);
        throw new Error(`Adaptive Context Selector Wrapper initialization failed: ${error.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Get context for a query
   * @param {string} query - The query text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Selected context and metadata in standardized format
   */
  async getContext(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Call the wrapped adaptiveContextSelector
      const contextResult = await adaptiveContextSelector.getContext(query, options);
      
      // Verify that we have actual content
      if (contextResult.success && 
          (!contextResult.contextItems || 
           contextResult.contextItems.length === 0 || 
           (contextResult.contextItems[0].content === 'No context available'))) {
        
        logger.warn('Adaptive Context Selector returned empty context, trying direct semantic context retrieval');
        
        // Try direct semantic context retrieval as fallback
        const semanticContext = await robustSemanticContextAdapter.retrieveContext(query, {
          limit: options.maxCodeItems || 5,
          minRelevance: options.similarityThreshold || 0.65
        });
        
        if (semanticContext && semanticContext.results && semanticContext.results.length > 0) {
          // Format the semantic context results
          const formattedContext = this._formatSemanticResults(semanticContext.results);
          
          return {
            success: true,
            contextItems: [
              {
                type: 'semantic',
                id: 'semantic-context-' + Date.now(),
                title: 'Semantic Context',
                content: formattedContext,
                priority: 0.9
              }
            ],
            metadata: semanticContext.metadata || {}
          };
        }
      }
      
      return contextResult;
    } catch (error) {
      logger.error(`Error getting context: ${error.message}`, error);
      
      // Try direct semantic context retrieval as fallback
      try {
        logger.info('Attempting direct semantic context retrieval as fallback');
        
        const semanticContext = await robustSemanticContextAdapter.retrieveContext(query, {
          limit: options.maxCodeItems || 5,
          minRelevance: options.similarityThreshold || 0.65
        });
        
        if (semanticContext && semanticContext.results && semanticContext.results.length > 0) {
          // Format the semantic context results
          const formattedContext = this._formatSemanticResults(semanticContext.results);
          
          return {
            success: true,
            contextItems: [
              {
                type: 'semantic',
                id: 'semantic-context-' + Date.now(),
                title: 'Semantic Context (Fallback)',
                content: formattedContext,
                priority: 0.9
              }
            ],
            metadata: semanticContext.metadata || {}
          };
        }
      } catch (fallbackError) {
        logger.error(`Fallback context retrieval also failed: ${fallbackError.message}`, fallbackError);
      }
      
      return {
        success: false,
        error: error.message,
        contextItems: []
      };
    }
  }
  
  /**
   * Format semantic search results into readable context
   * @param {Array} results - Semantic search results
   * @returns {string} Formatted context
   * @private
   */
  _formatSemanticResults(results) {
    if (!results || results.length === 0) {
      return 'No semantic context available';
    }
    
    let formattedContext = '## Semantic Context\n\n';
    
    results.forEach((result, index) => {
      // Add a separator between results
      if (index > 0) {
        formattedContext += '\n---\n\n';
      }
      
      // Add result metadata
      formattedContext += `### ${result.title || result.path || `Result ${index + 1}`}\n\n`;
      
      if (result.path) {
        formattedContext += `**Path:** ${result.path}\n\n`;
      }
      
      if (result.relevance) {
        formattedContext += `**Relevance:** ${result.relevance.toFixed(2)}\n\n`;
      }
      
      // Add result content
      if (result.content) {
        formattedContext += `\`\`\`\n${result.content}\n\`\`\`\n\n`;
      }
    });
    
    return formattedContext;
  }
}

// Create singleton instance
const adaptiveContextSelectorWrapper = new AdaptiveContextSelectorWrapper();

module.exports = {
  adaptiveContextSelectorWrapper
};
