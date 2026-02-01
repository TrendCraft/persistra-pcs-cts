/**
 * Leo Codex Self-Test Context Manager Adapter
 * 
 * This module adapts the enhanced context manager for use with the self-test framework.
 * It provides a consistent interface for context retrieval and quality measurement.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const selfTestConfig = require('./self-test-config');

// Create component logger
const logger = createComponentLogger('context-manager-adapter');

// Try to import the improved context manager
let improvedContextManager;
try {
  improvedContextManager = require('../services/improved-context-manager');
  logger.info('Successfully loaded improved context manager');
} catch (error) {
  logger.error(`Failed to load improved context manager: ${error.message}`);
  
  // Fall back to the original enhanced context manager
  try {
    improvedContextManager = require('../../src/leo-codex/services/enhanced-context-manager');
    logger.info('Falling back to original enhanced context manager');
  } catch (fallbackError) {
    logger.error(`Failed to load fallback context manager: ${fallbackError.message}`);
    throw new Error(`No context manager available: ${error.message}, ${fallbackError.message}`);
  }
}

/**
 * Context Manager Adapter for Self-Testing
 */
class ContextManagerAdapter {
  /**
   * Create a new context manager adapter
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      // Default options
      embeddingsFile: path.join(selfTestConfig.outputDirs.results, 'data', 'embeddings.jsonl'),
      chunksFile: path.join(selfTestConfig.outputDirs.results, 'data', 'chunks.jsonl'),
      cacheDir: path.join(selfTestConfig.outputDirs.results, 'cache'),
      logDir: path.join(selfTestConfig.outputDirs.results, 'logs'),
      ...options
    };
    
    logger.info('Initialized context manager adapter', { options: this.options });
    
    // Configure environment variables for the enhanced context manager
    process.env.LEO_CACHE_DIR = this.options.cacheDir;
    process.env.LEO_LOG_DIR = this.options.logDir;
    process.env.LEO_EMBEDDINGS_FILE = this.options.embeddingsFile;
    process.env.LEO_CHUNKS_FILE = this.options.chunksFile;
    
    // Ensure directories exist
    this.ensureDirectories();
  }
  
  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    [this.options.cacheDir, this.options.logDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
  }
  
  /**
   * Get context for a query
   * @param {string} query - Query to get context for
   * @returns {Promise<Object>} Context result with context and relevance score
   */
  async getContextForQuery(query) {
    try {
      logger.info(`Getting context for query: ${query}`);
      
      // Start timer for performance measurement
      const startTime = Date.now();
      
      // Get context from improved context manager
      const contextResult = await improvedContextManager.getContextForQuery(query);
      
      // Extract the context string
      const contextString = contextResult.context || '';
      
      // End timer
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Calculate relevance score (this is a placeholder - in a real implementation,
      // we would use more sophisticated methods)
      const relevanceScore = this.calculateRelevanceScore(query, contextString);
      
      logger.info(`Got context for query (${processingTime}ms, relevance: ${relevanceScore.toFixed(2)})`);
      
      return {
        context: contextString,
        relevanceScore,
        processingTime
      };
    } catch (error) {
      logger.error(`Failed to get context for query: ${error.message}`, { query });
      throw error;
    }
  }
  
  /**
   * Calculate relevance score for context
   * @param {string} query - Query
   * @param {string} context - Retrieved context
   * @returns {number} Relevance score (0-1)
   */
  calculateRelevanceScore(query, context) {
    if (!context) return 0;
    
    // This is a simple implementation - in a real system, we would use
    // more sophisticated methods like semantic similarity
    
    // Convert to lowercase for comparison
    const queryLower = query.toLowerCase();
    const contextLower = context.toLowerCase();
    
    // Extract key terms from query (simple approach)
    const queryTerms = queryLower
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(term => term.length > 3)
      .filter(term => !['what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how', 'does', 'do', 'did', 'is', 'are', 'was', 'were', 'has', 'have', 'had'].includes(term));
    
    // Count how many query terms appear in the context
    let matchCount = 0;
    for (const term of queryTerms) {
      if (contextLower.includes(term)) {
        matchCount++;
      }
    }
    
    // Calculate relevance score
    return queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
  }
  
  /**
   * Generate enhanced prompt for a query
   * @param {string} query - Query to generate enhanced prompt for
   * @returns {Promise<string>} Enhanced prompt
   */
  async generateEnhancedPrompt(query) {
    try {
      logger.info(`Generating enhanced prompt for query: ${query}`);
      
      // Get enhanced prompt from improved context manager
      let enhancedPrompt;
      if (typeof improvedContextManager.generateEnhancedPrompt === 'function') {
        // Use the improved context manager's method
        enhancedPrompt = await improvedContextManager.generateEnhancedPrompt(query);
      } else {
        // Fall back to the original method
        enhancedPrompt = await improvedContextManager.injectContext(query);
      }
      
      logger.info('Generated enhanced prompt');
      
      return enhancedPrompt;
    } catch (error) {
      logger.error(`Failed to generate enhanced prompt: ${error.message}`, { query });
      throw error;
    }
  }
}

// Export adapter
module.exports = ContextManagerAdapter;
