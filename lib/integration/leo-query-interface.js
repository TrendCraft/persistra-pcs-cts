/**
 * Leo Query Interface
 * 
 * Provides a unified interface for directly accessing Leo's capabilities
 * and memory systems. This is a key component of the Integration Layer
 * that allows Leo to be queried directly by LLMs and other systems.
 * 
 * @module lib/integration/leo-query-interface
 * @author Leo Development Team
 * @created May 13, 2025
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const { memoryManager } = require('../services/memory-manager');
const { semanticSearchService } = require('../services/semantic-search-service');
const { adaptiveContextSelector } = require('../services/adaptive-context-selector');
const { sessionAwarenessAdapter } = require('./session-awareness-adapter');
const { visionAnchor } = require('../services/vision-anchor');
const { metaCognitiveLayer } = require('../services/meta-cognitive-layer');

// Create logger
const logger = createComponentLogger('leo-query-interface');

/**
 * Leo Query Interface
 * 
 * Provides a unified interface for querying Leo's capabilities
 */
class LeoQueryInterface {
  constructor() {
    this.initialized = false;
    this._initPromise = null;
    this.queryHandlers = new Map();
  }

  /**
   * Initialize the Leo Query Interface
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      // Enforce strict DI
      const { embeddingsInterface, logger: injectedLogger } = options;
      if (!embeddingsInterface || !injectedLogger) {
        throw new Error('LeoQueryInterface: DI missing embeddingsInterface or logger');
      }
      const logger = injectedLogger;

      if (this.initialized) {
        logger.info('Leo Query Interface already initialized');
        return;
      }

      logger.info('Initializing Leo Query Interface');

      try {
        // Initialize dependencies with DI
        await memoryManager.initialize({ embeddingsInterface, logger });
        await semanticSearchService.initialize({ embeddingsInterface, logger });
        await sessionAwarenessAdapter.initialize({ embeddingsInterface, logger });
        await adaptiveContextSelector.initialize({ embeddingsInterface, logger });

        // Initialize awareness components with DI
        await visionAnchor.initialize({ embeddingsInterface, logger });
        await metaCognitiveLayer.initialize({ embeddingsInterface, logger });

        // Register query handlers
        this.registerQueryHandlers();
        
        this.initialized = true;
        logger.info('Leo Query Interface initialized successfully');
      } catch (error) {
        logger.error(`Failed to initialize Leo Query Interface: ${error.message}`, error);
        throw new Error(`Leo Query Interface initialization failed: ${error.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Register all query handlers
   */
  registerQueryHandlers() {
    // Memory queries
    this.registerQueryHandler('memory.retrieve', this.retrieveMemories.bind(this));
    this.registerQueryHandler('memory.search', this.searchMemories.bind(this));
    this.registerQueryHandler('memory.store', this.storeMemory.bind(this));
    
    // Context queries
    this.registerQueryHandler('context.get', this.getContext.bind(this));
    this.registerQueryHandler('context.search', this.searchContext.bind(this));
    
    // Vision queries
    this.registerQueryHandler('vision.get', this.getVision.bind(this));
    this.registerQueryHandler('vision.checkAlignment', this.checkVisionAlignment.bind(this));
    
    // Meta-cognitive queries
    this.registerQueryHandler('metacognitive.getInsights', this.getMetaCognitiveInsights.bind(this));
    this.registerQueryHandler('metacognitive.getTrajectory', this.getDevelopmentTrajectory.bind(this));
    this.registerQueryHandler('metacognitive.recordObservation', this.recordObservation.bind(this));
    
    // Session queries
    this.registerQueryHandler('session.getState', this.getSessionState.bind(this));
    this.registerQueryHandler('session.storeData', this.storeSessionData.bind(this));
    this.registerQueryHandler('session.retrieveData', this.retrieveSessionData.bind(this));
    
    // System queries
    this.registerQueryHandler('system.getCapabilities', this.getCapabilities.bind(this));
    this.registerQueryHandler('system.getStatus', this.getSystemStatus.bind(this));
  }

  /**
   * Register a query handler
   * 
   * @param {string} queryType - The type of query to handle
   * @param {Function} handler - The handler function
   */
  registerQueryHandler(queryType, handler) {
    this.queryHandlers.set(queryType, handler);
    logger.debug(`Registered query handler for: ${queryType}`);
  }

  /**
   * Execute a query against Leo
   * 
   * @param {Object} query - The query to execute
   * @returns {Object} The query result
   */
  async executeQuery(query) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!query || !query.type) {
      throw new Error('Invalid query: must include a type');
    }
    
    logger.info(`Executing query of type: ${query.type}`);
    
    const handler = this.queryHandlers.get(query.type);
    if (!handler) {
      throw new Error(`No handler registered for query type: ${query.type}`);
    }
    
    try {
      const result = await handler(query);
      
      return {
        success: true,
        queryType: query.type,
        timestamp: new Date(),
        result
      };
    } catch (error) {
      logger.error(`Query execution failed: ${error.message}`, error);
      
      return {
        success: false,
        queryType: query.type,
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Retrieve memories from the memory manager
   * 
   * @param {Object} query - The query parameters
   * @returns {Array} Retrieved memories
   */
  async retrieveMemories(query) {
    if (!query.params) {
      throw new Error('Memory retrieval requires parameters');
    }
    
    return await memoryManager.retrieveMemories(query.params);
  }

  /**
   * Search memories using semantic search
   * 
   * @param {Object} query - The query parameters
   * @returns {Array} Search results
   */
  async searchMemories(query) {
    if (!query.params || !query.params.query) {
      throw new Error('Memory search requires a query parameter');
    }
    
    return await memoryManager.searchMemories(query.params.query, query.params.options);
  }

  /**
   * Store a memory in the memory manager
   * 
   * @param {Object} query - The query parameters
   * @returns {Object} The stored memory
   */
  async storeMemory(query) {
    if (!query.params || !query.params.memory) {
      throw new Error('Memory storage requires a memory object');
    }
    
    return await memoryManager.storeMemory(query.params.memory);
  }

  /**
   * Get context from the adaptive context selector
   * 
   * @param {Object} query - The query parameters
   * @returns {Array} Context items
   */
  async getContext(query) {
    if (!query.params || !query.params.query) {
      throw new Error('Context retrieval requires a query parameter');
    }
    
    return await adaptiveContextSelector.getContext(query.params.query, query.params.options);
  }

  /**
   * Search for context using semantic search
   * 
   * @param {Object} query - The query parameters
   * @returns {Array} Search results
   */
  async searchContext(query) {
    if (!query.params || !query.params.query) {
      throw new Error('Context search requires a query parameter');
    }
    
    return await semanticSearchService.search(query.params.query, query.params.options);
  }

  /**
   * Get the project vision
   * 
   * @returns {Object} The project vision
   */
  async getVision() {
    return await visionAnchor.getVisionSummary();
  }

  /**
   * Check if content aligns with the project vision
   * 
   * @param {Object} query - The query parameters
   * @returns {Object} Alignment assessment
   */
  async checkVisionAlignment(query) {
    if (!query.params || !query.params.content) {
      throw new Error('Vision alignment check requires content');
    }
    
    return await visionAnchor.checkVisionAlignment({
      type: query.params.type || 'content',
      id: query.params.id || `content_${Date.now()}`,
      content: query.params.content
    });
  }

  /**
   * Get meta-cognitive insights
   * 
   * @param {Object} query - The query parameters
   * @returns {Array} Meta-cognitive insights
   */
  async getMetaCognitiveInsights(query) {
    return await metaCognitiveLayer.getRecentInsights(query.params);
  }

  /**
   * Get the current development trajectory
   * 
   * @returns {Object} Development trajectory
   */
  async getDevelopmentTrajectory() {
    return await metaCognitiveLayer.getDevelopmentTrajectory();
  }

  /**
   * Record a meta-cognitive observation
   * 
   * @param {Object} query - The query parameters
   * @returns {Object} The recorded observation
   */
  async recordObservation(query) {
    if (!query.params || !query.params.observation) {
      throw new Error('Recording an observation requires an observation object');
    }
    
    return await metaCognitiveLayer.recordObservation(query.params.observation);
  }

  /**
   * Get the current session state
   * 
   * @returns {Object} Session state
   */
  async getSessionState() {
    return await sessionAwarenessAdapter.getSessionState();
  }

  /**
   * Store data in the session
   * 
   * @param {Object} query - The query parameters
   * @returns {boolean} Success indicator
   */
  async storeSessionData(query) {
    if (!query.params || !query.params.key === undefined || query.params.data === undefined) {
      throw new Error('Storing session data requires a key and data');
    }
    
    return await sessionAwarenessAdapter.storeData(query.params.key, query.params.data);
  }

  /**
   * Retrieve data from the session
   * 
   * @param {Object} query - The query parameters
   * @returns {*} Retrieved data
   */
  async retrieveSessionData(query) {
    if (!query.params || query.params.key === undefined) {
      throw new Error('Retrieving session data requires a key');
    }
    
    return await sessionAwarenessAdapter.retrieveData(query.params.key);
  }

  /**
   * Get Leo's capabilities
   * 
   * @returns {Object} Leo's capabilities
   */
  async getCapabilities() {
    const queryTypes = Array.from(this.queryHandlers.keys());
    
    return {
      queryTypes,
      components: {
        memory: true,
        semanticSearch: true,
        adaptiveContext: true,
        sessionAwareness: true,
        visionAnchor: true,
        metaCognitive: true
      },
      version: '0.1.0'
    };
  }

  /**
   * Get the system status
   * 
   * @returns {Object} System status
   */
  async getSystemStatus() {
    const memoryStatus = await memoryManager.getStatus();
    const searchStatus = await semanticSearchService.getStatus();
    const sessionStatus = await sessionAwarenessAdapter.getStatus();
    
    return {
      timestamp: new Date(),
      components: {
        memory: memoryStatus,
        semanticSearch: searchStatus,
        sessionAwareness: sessionStatus
      },
      initialized: this.initialized
    };
  }
}

// Create singleton instance
const leoQueryInterface = new LeoQueryInterface();

module.exports = {
  leoQueryInterface
};
