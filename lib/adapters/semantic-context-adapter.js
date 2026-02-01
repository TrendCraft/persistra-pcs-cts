/**
 * Standardized Semantic Context Adapter
 * 
 * This adapter provides a standardized interface to the semantic context manager,
 * with robust error handling, dependency resolution, and health monitoring integration.
 * 
 * It follows the standardized adapter pattern defined in LEO_STANDARDIZATION.md
 * and supports the "AI cognition WITH humans" approach by ensuring reliable
 * and consistent context retrieval even in the presence of failures.
 *
 * ARCHITECTURAL INVARIANT: All context search calls must supply a merged, normalized chunks array
 * (loaded via lib/utils/loadAndMergeChunksEmbeddings.js) as options.chunks. Direct file reads or
 * fallback chunk loading are forbidden. This is enforced in all searchContext and retrieveContext implementations.
 * 
 * @module lib/adapters/semantic-context-adapter
 * @author Leo Development Team
 * @created May 16, 2025
 */

const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const dependencyResolver = require('../utils/dependency-resolver');
// System health monitor removed - no longer needed
const dependencyContainer = require('../core/dependency-container');

// Component name for logging and events
const COMPONENT_NAME = 'semantic-context-adapter';

// Create logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Standardized Semantic Context Adapter
 * 
 * Provides a standardized interface to the semantic context manager
 * with improved error handling, dependency resolution, and health monitoring.
 */
class StandardizedSemanticContextAdapter {
  constructor() {
    this.initialized = false;
    this._initPromise = null;
    
    // Register with dependency resolver
    dependencyResolver.registerComponent(COMPONENT_NAME, [
      'semantic-context-manager'
    ], {
      timeout: 30000, // 30 seconds timeout
      required: false  // Continue even if dependencies fail
    });
    
    // Register fallback implementation
    dependencyResolver.registerFallback(COMPONENT_NAME, {
      retrieveContext: async (query, options = {}) => {
        logger.warn('Using fallback implementation for retrieveContext');
        return {
          success: false,
          error: 'Semantic context adapter not properly initialized',
          results: [],
          metadata: {
            timestamp: Date.now(),
            fallback: true
          }
        };
      },
      searchContext: async (query, options = {}) => {
        logger.warn('Using fallback implementation for searchContext');
        return {
          success: false,
          error: 'Semantic context adapter not properly initialized',
          results: [],
          metadata: {
            timestamp: Date.now(),
            fallback: true
          }
        };
      }
    });
  }

  /**
   * Initialize the adapter and its dependencies
   * 
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} - Initialization success status
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }
    
    this._initPromise = (async () => {
      try {
        if (this.initialized) {
          logger.info('Semantic Context Adapter already initialized');
          return true;
        }
        
        logger.info('Initializing Standardized Semantic Context Adapter');
        
        // System health monitor has been removed - no longer needed
        
        // Initialize semantic context manager using dependency resolver
        try {
          // Get semantic context manager from dependency container
          const semanticContextManager = dependencyContainer.get('semantic-context-manager');
          
          if (semanticContextManager && typeof semanticContextManager.initialize === 'function') {
            await semanticContextManager.initialize(options);
            logger.info('Semantic context manager initialized successfully');
          } else {
            logger.warn('Semantic context manager not available or missing initialize method');
          }
        } catch (managerError) {
          logger.error(`Failed to initialize semantic context manager: ${managerError.message}`);
          // We'll continue and use fallback mechanisms if needed
        }
        
        // Register health check with system health monitor
        // System health monitor has been removed - no longer needed
        /*
            COMPONENT_NAME,
            // Health check function
            async () => {
              try {
                // Simple test query to check if context retrieval works
                const testResult = await this.retrieveContext('test query', { limit: 1 });
                return {
                  healthy: testResult.success || !!testResult.fallback,
                  reason: testResult.success ? null : 'Context retrieval failed'
                };
              } catch (error) {
                return {
                  healthy: false,
                  reason: `Health check failed: ${error.message}`
                };
              }
            },
            // Repair function
            async (checkResult) => {
              try {
                // Attempt to re-initialize
                this.initialized = false;
                await this.initialize(options);
                return { success: true };
              } catch (error) {
                return { 
                  success: false,
                  reason: `Repair failed: ${error.message}`
                };
              }
            }
          );
        */
        
        this.initialized = true;
        
        // Emit initialization event
        eventBus.emit('service:initialized', { 
          service: COMPONENT_NAME,
          timestamp: Date.now()
        });
        
        logger.info('Standardized Semantic Context Adapter initialized successfully');
        return true;
      } catch (error) {
        logger.error(`Failed to initialize Standardized Semantic Context Adapter: ${error.message}`, error);
        
        // Emit error event
        eventBus.emit('error', { 
          component: COMPONENT_NAME, 
          message: 'Failed to initialize semantic context adapter', 
          error: error.message 
        });
        
        return false;
      } finally {
        this._initPromise = null;
      }
    })();
    
    return this._initPromise;
  }

  /**
   * Canonical context retrieval. All callers MUST supply a merged, normalized chunks array via options.chunks,
   * loaded using lib/utils/loadAndMergeChunksEmbeddings.js. Direct file reads or fallback loading are forbidden.
   * Throws if called without a valid chunks array.
   *
   * @param {string} query - The query to retrieve context for
   * @param {Object} options - Options for context retrieval (must include chunks)
   * @returns {Promise<Object>} - The retrieved context
   */
  async retrieveContext(query, options = {}) {
    // === FAILSAFE INVARIANT: Enforce canonical chunks loading ===
    if (!options.chunks || !Array.isArray(options.chunks) || options.chunks.length === 0) {
      throw new Error('[INVARIANT] retrieveContext called without merged chunks array. All code must use loadAndMergeChunksEmbeddings.');
    }
    try {
      // Ensure initialized
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Get semantic context manager from dependency container
      let semanticContextManager;
      try {
        semanticContextManager = dependencyContainer.get('semantic-context-manager');
      } catch (error) {
        logger.warn(`Error getting semantic context manager: ${error.message}`);
      }
      
      // Check if semantic context manager is available
      if (!semanticContextManager || typeof semanticContextManager.searchContext !== 'function') {
        // Get fallback implementation if available
        const fallback = dependencyResolver.getFallbackImplementation(COMPONENT_NAME);
        if (fallback && typeof fallback.retrieveContext === 'function') {
          return await fallback.retrieveContext(query, options);
        }
        
        throw new Error('Semantic context manager not available');
      }
      
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
      
      // Run health check on failure
      if (systemHealthMonitor.running) {
        systemHealthMonitor.runHealthCheck().catch(healthError => {
          logger.error(`Health check failed: ${healthError.message}`);
        });
      }
      
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

  /**
   * Canonical context search. All callers MUST supply a merged, normalized chunks array via options.chunks,
   * loaded using lib/utils/loadAndMergeChunksEmbeddings.js. Direct file reads or fallback loading are forbidden.
   * Throws if called without a valid chunks array.
   *
   * @param {string} query - The query to search context for
   * @param {Object} options - Options for context search (must include chunks)
   * @returns {Promise<Object>} - The search results
   */
  async searchContext(query, options = {}) {
    // === FAILSAFE INVARIANT: Enforce canonical chunks loading ===
    if (!options.chunks || !Array.isArray(options.chunks) || options.chunks.length === 0) {
      throw new Error('[INVARIANT] searchContext called without merged chunks array. All code must use loadAndMergeChunksEmbeddings.');
    }
    try {
      // Ensure initialized
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Get semantic context manager from dependency container
      let semanticContextManager;
      try {
        semanticContextManager = dependencyContainer.get('semantic-context-manager');
      } catch (error) {
        logger.warn(`Error getting semantic context manager: ${error.message}`);
      }
      
      // Check if semantic context manager is available
      if (!semanticContextManager || typeof semanticContextManager.searchContext !== 'function') {
        // Get fallback implementation if available
        const fallback = dependencyResolver.getFallbackImplementation(COMPONENT_NAME);
        if (fallback && typeof fallback.searchContext === 'function') {
          return await fallback.searchContext(query, options);
        }
        
        throw new Error('Semantic context manager not available');
      }
      
      logger.info(`Searching context for query: ${query.substring(0, 50)}...`);
      
      // Call the native searchContext method
      return await semanticContextManager.searchContext(query, options);
    } catch (error) {
      logger.error(`Error searching context: ${error.message}`, error);
      
      // Run health check on failure
      if (systemHealthMonitor.running) {
        systemHealthMonitor.runHealthCheck().catch(healthError => {
          logger.error(`Health check failed: ${healthError.message}`);
        });
      }
      
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
  
  /**
   * Get the initialization status of the adapter
   * 
   * @returns {boolean} - Whether the adapter is initialized
   */
  isInitialized() {
    return this.initialized;
  }
}

// Create singleton instance
const semanticContextAdapter = new StandardizedSemanticContextAdapter();

module.exports = {
  semanticContextAdapter
};
