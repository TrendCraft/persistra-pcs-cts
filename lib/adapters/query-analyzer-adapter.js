/**
 * Query Analyzer Adapter
 * 
 * This adapter provides a consistent interface for the Query Analyzer component.
 * It addresses interface mismatches between the expected MVL interface and the
 * actual implementation in the query-analyzer.js module.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const getQueryAnalyzer = require('../services/query-analyzer');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'query-analyzer-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Initialize the query analyzer
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing query analyzer adapter');
    
    // Get the query analyzer instance
    const queryAnalyzer = getQueryAnalyzer(options);
    
    if (queryAnalyzer) {
      logger.info('Query analyzer adapter initialized successfully');
      // Set the isInitialized property
      module.exports.isInitialized = true;
      // Emit initialization event
      eventBus.emit('component:initialized', { 
        component: COMPONENT_NAME,
        timestamp: Date.now()
      });
      
      return true;
    } else {
      logger.error('Failed to initialize query analyzer');
      return false;
    }
  } catch (error) {
    logger.error(`Error initializing query analyzer adapter: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to initialize query analyzer adapter', 
      error: error.message 
    });
    
    return false;
  }
}

/**
 * Analyze a query to determine its characteristics
 * @param {string} query - The query to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Standardized result with analysis and metadata
 */
async function analyzeQuery(query, options = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Query analyzer adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize query analyzer adapter',
          analysis: {},
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    logger.info(`Analyzing query: "${query}"`);
    
    // Get the query analyzer instance
    const queryAnalyzer = getQueryAnalyzer();
    
    // Analyze the query
    const analysis = queryAnalyzer.analyzeQuery(query, options);
    
    logger.info('Query analysis completed');
    
    // Return standardized result
    return {
      success: true,
      analysis: {
        type: analysis.type,
        isCodeQuery: analysis.isCodeQuery,
        isDocumentationQuery: analysis.isDocumentationQuery,
        isStructuralQuery: analysis.isStructuralQuery,
        confidence: analysis.confidence,
        complexity: analysis.complexity,
        contextWeights: analysis.contextWeights,
        entities: analysis.entities || []
      },
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'success',
        options
      }
    };
  } catch (error) {
    logger.error(`Error analyzing query: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to analyze query', 
      error: error.message 
    });
    
    // Return standardized error format
    return {
      success: false,
      error: error.message,
      analysis: {},
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Get recommendations for context retrieval based on query analysis
 * @param {string} query - The query to get recommendations for
 * @param {Object} options - Recommendation options
 * @returns {Promise<Object>} Standardized result with recommendations and metadata
 */
async function getContextRecommendations(query, options = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Query analyzer adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize query analyzer adapter',
          recommendations: {},
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    logger.info(`Getting context recommendations for query: "${query}"`);
    
    // Get the query analyzer instance
    const queryAnalyzer = getQueryAnalyzer();
    
    // First analyze the query
    const analysis = queryAnalyzer.analyzeQuery(query, options);
    
    // Then get recommendations based on the analysis
    const recommendations = queryAnalyzer.getContextRecommendations(analysis);
    
    logger.info('Context recommendations generated');
    
    // Return standardized result
    return {
      success: true,
      recommendations: {
        maxResults: recommendations.maxResults,
        similarityThreshold: recommendations.similarityThreshold,
        includeCode: recommendations.includeCode,
        includeConversation: recommendations.includeConversation,
        includeNarrative: recommendations.includeNarrative,
        contextWeights: recommendations.contextWeights
      },
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'success',
        analysisType: analysis.type,
        options
      }
    };
  } catch (error) {
    logger.error(`Error getting context recommendations: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to get context recommendations', 
      error: error.message 
    });
    
    // Return standardized error format
    return {
      success: false,
      error: error.message,
      recommendations: {},
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Update the configuration of the query analyzer
 * @param {Object} config - New configuration options
 * @returns {Promise<Object>} Standardized result with update status and metadata
 */
async function updateConfig(config = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Query analyzer adapter not initialized, initializing now...');
      const initSuccess = await initialize(config);
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize query analyzer adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
      
      return {
        success: true,
        metadata: {
          timestamp: Date.now(),
          status: 'success',
          message: 'Initialized with provided configuration'
        }
      };
    }
    
    logger.info('Updating query analyzer configuration');
    
    // Get the query analyzer instance
    const queryAnalyzer = getQueryAnalyzer();
    
    // Update the configuration
    queryAnalyzer.updateConfig(config);
    
    logger.info('Query analyzer configuration updated successfully');
    
    // Return standardized result
    return {
      success: true,
      metadata: {
        timestamp: Date.now(),
        status: 'success',
        updatedKeys: Object.keys(config)
      }
    };
  } catch (error) {
    logger.error(`Error updating query analyzer configuration: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to update query analyzer configuration', 
      error: error.message 
    });
    
    // Return standardized error format
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

// Export the adapter API
module.exports = {
  initialize,
  analyzeQuery,
  getContextRecommendations,
  updateConfig,
  isInitialized: false
};
