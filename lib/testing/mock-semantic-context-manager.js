/**
 * Mock Semantic Context Manager
 * 
 * This module provides a mock implementation of the semantic context manager
 * for testing purposes. It simulates the behavior of the real semantic context manager
 * without requiring actual embeddings or chunks.
 */

const { createComponentLogger } = require('../utils/logger');
const { eventEmitter } = require('../utils/event-emitter');

// Create logger
const logger = createComponentLogger('mock-semantic-context-manager');

/**
 * Mock Semantic Context Manager
 * 
 * Simulates the behavior of the real semantic context manager for testing
 */
const mockSemanticContextManager = {
  /**
   * Initialize the mock semantic context manager
   */
  async initialize() {
    logger.info('Initializing Mock Semantic Context Manager');
    
    // Simulate loading embeddings and chunks
    logger.info('Simulating loading of embeddings and chunks');
    
    // Emit initialization event
    eventEmitter.emit('semantic-context-manager:initialized');
    
    logger.info('Mock Semantic Context Manager initialized successfully');
    return true;
  },
  
  /**
   * Search context for a query
   * 
   * @param {string} query - The query to search context for
   * @param {object} options - Options for context search
   * @returns {Promise<object>} - The search results
   */
  async searchContext(query, options = {}) {
    logger.info(`Searching context for query: ${query}...`);
    
    // Generate mock results based on the query
    const results = this._generateMockResults(query, options);
    
    return {
      success: true,
      results,
      query
    };
  },
  
  /**
   * Store chunks in the semantic context
   * 
   * @param {Array} chunks - The chunks to store
   * @param {object} options - Options for storing chunks
   * @returns {Promise<object>} - The result of storing chunks
   */
  async storeChunks(chunks, options = {}) {
    logger.info(`Storing ${chunks.length} chunks...`);
    
    return {
      success: true,
      count: chunks.length
    };
  },
  
  /**
   * Generate mock results based on the query
   * 
   * @param {string} query - The query to generate results for
   * @param {object} options - Options for generating results
   * @returns {Array} - The generated results
   */
  _generateMockResults(query, options = {}) {
    const limit = options.limit || 5;
    const results = [];
    
    // Generate results based on query keywords
    const keywords = [
      'context', 'injection', 'system', 'semantic', 'adapter', 
      'prompt', 'layer', 'meta', 'cognitive', 'leo'
    ];
    
    // Find matching keywords in the query
    const matchingKeywords = keywords.filter(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // Generate results for each matching keyword
    for (const keyword of matchingKeywords) {
      if (results.length >= limit) break;
      
      results.push({
        path: `/Users/stephenmansfield/Projects/Leo/lib/services/${keyword}-service.js`,
        content: `This is mock content for ${keyword}. It simulates the actual content that would be retrieved from the semantic context manager.`,
        score: 0.8 + (Math.random() * 0.2),
        title: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Service`,
        type: 'code'
      });
    }
    
    // If no keywords matched or not enough results, add generic results
    while (results.length < limit) {
      results.push({
        path: `/Users/stephenmansfield/Projects/Leo/lib/services/generic-service-${results.length + 1}.js`,
        content: `This is generic mock content for testing. It simulates the actual content that would be retrieved from the semantic context manager.`,
        score: 0.7 + (Math.random() * 0.1),
        title: `Generic Service ${results.length + 1}`,
        type: 'code'
      });
    }
    
    return results;
  }
};

module.exports = { mockSemanticContextManager };
