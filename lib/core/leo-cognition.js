/**
 * Leo Cognition Module
 * 
 * Core cognitive functions for Leo's exocortex system.
 * This module provides semantic search capabilities and memory management.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

// Import core components
const { 
  SearchEngine, 
  ConfigManager, 
  FileSystem,
  SearchError 
} = require('./leo-cognitive-core');

// Create instances
const config = new ConfigManager();
const fileSystem = new FileSystem();
const searchEngine = new SearchEngine(config);

// Track initialization state
let initialized = false;

/**
 * Initialize the Leo cognition system
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  if (initialized) return true;
  
  try {
    // Ensure directories exist
    await fileSystem.ensureDir(config.get('dataDir'));
    await fileSystem.ensureDir(path.dirname(config.get('cognitiveStateFile')));
    
    // Initialize search engine
    await searchEngine.initialize();
    
    initialized = true;
    console.log('🧠 Leo Cognition initialized');
    return true;
  } catch (error) {
    console.error('❌ Leo Cognition initialization failed:', error.message);
    return false;
  }
}

/**
 * Perform a semantic search
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
async function search(query, options = {}) {
  if (!initialized) {
    await initialize();
  }
  
  try {
    // Validate input
    if (typeof query !== 'string' || !query.trim()) {
      return {
        query: query || '',
        results: [],
        error: 'Invalid query: must be a non-empty string',
        timestamp: new Date().toISOString()
      };
    }
    
    // Record query for token tracking
    if (global.sessionContext) {
      global.sessionContext.estimatedTokensUsed = 
        (global.sessionContext.estimatedTokensUsed || 0) + query.length / 4;
    }
    
    // Perform search
    const results = await searchEngine.search(query, options);
    
    // Return formatted results
    return {
      query,
      results,
      resultCount: results.length,
      timestamp: new Date().toISOString(),
      sessionId: global.sessionContext?.sessionId
    };
  } catch (error) {
    console.error('❌ Search error:', error.message);
    
    // Return error in a structured format
    return {
      query,
      results: [],
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get statistics about the Leo cognition system
 * @returns {Object} System statistics
 */
function getStats() {
  return {
    initialized,
    searchStats: searchEngine.getStats(),
    config: config.getAll()
  };
}

// Export the module API
module.exports = {
  initialize,
  search,
  getStats
};
