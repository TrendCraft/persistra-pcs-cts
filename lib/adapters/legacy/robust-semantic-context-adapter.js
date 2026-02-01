/**
 * Robust Semantic Context Adapter
 * 
 * This adapter provides a robust interface to the semantic context manager,
 * handling potential errors and ensuring consistent behavior even when
 * underlying data might be corrupted.
 * 
 * It follows the standardized adapter pattern defined in LEO_STANDARDIZATION.md
 * and provides both retrieveContext and searchContext methods for compatibility.
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../../utils/logger');
// Import the semantic context manager directly to avoid circular dependencies
const semanticContextManager = require('../../services/semantic-context-manager').semanticContextManager;
const { eventEmitter } = require('../../utils/event-emitter');

// Create logger
const logger = createComponentLogger('robust-semantic-context-adapter');

/**
 * Robust Semantic Context Adapter
 * 
 * Provides a standardized interface to the semantic context manager
 * with improved error handling and fallback mechanisms.
 */
const robustSemanticContextAdapter = {
  /**
   * Initialize the adapter
   */
  async initialize() {
    logger.info('Initializing Robust Semantic Context Adapter');
    
    try {
      // Check if semantic context manager exists
      if (!semanticContextManager) {
        throw new Error('Semantic context manager not found');
      }
      
      // Initialize semantic context manager if it has an initialize method
      if (typeof semanticContextManager.initialize === 'function') {
        await semanticContextManager.initialize();
      }
      
      // Register event handlers
      this._registerEventHandlers();
      
      logger.info('Robust Semantic Context Adapter initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Robust Semantic Context Adapter: ${error.message}`, error);
      
      // Attempt recovery
      await this._attemptRecovery();
      
      // Re-initialize semantic context manager if possible
      if (semanticContextManager && typeof semanticContextManager.initialize === 'function') {
        await semanticContextManager.initialize();
      }
      
      logger.info('Robust Semantic Context Adapter recovered and initialized successfully');
      return true;
    }
  },
  
  /**
   * Register event handlers
   */
  _registerEventHandlers() {
    // Listen for error events from semantic context manager
    eventEmitter.on('semantic-context-manager:error', async (error) => {
      logger.warn(`Caught error from semantic context manager: ${error.message}`);
      
      // Attempt recovery if it's a data corruption error
      if (error.message.includes('JSON') || error.message.includes('parse')) {
        await this._attemptRecovery();
      }
    });
  },
  
  /**
   * Attempt recovery from data corruption
   */
  async _attemptRecovery() {
    logger.info('Attempting recovery from data corruption');
    
    try {
      // Check embeddings directory
      const embeddingsDir = path.join(process.cwd(), 'data', 'embeddings');
      await this._repairDirectory(embeddingsDir, '{}');
      
      // Check chunks directory
      const chunksDir = path.join(process.cwd(), 'data', 'chunks');
      await this._repairDirectory(chunksDir, '[]');
      
      logger.info('Recovery completed successfully');
      return true;
    } catch (error) {
      logger.error(`Recovery failed: ${error.message}`, error);
      throw error;
    }
  },
  
  /**
   * Repair JSON files in a directory
   */
  async _repairDirectory(directory, defaultContent) {
    try {
      // Create directory if it doesn't exist
      await fs.mkdir(directory, { recursive: true });
      
      // Get all JSON files
      const files = await fs.readdir(directory);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      // Process each file
      for (const file of jsonFiles) {
        const filePath = path.join(directory, file);
        
        try {
          // Read file content
          const content = await fs.readFile(filePath, 'utf8');
          
          // Try to parse JSON
          try {
            JSON.parse(content);
            // File is valid, no action needed
          } catch (parseError) {
            logger.warn(`Found corrupted JSON in ${file}: ${parseError.message}`);
            
            // Create backup
            const backupPath = path.join(directory, `${file}.backup-${Date.now()}`);
            await fs.writeFile(backupPath, content);
            
            // Reset file with valid JSON
            await fs.writeFile(filePath, defaultContent);
            logger.info(`Reset ${file} to default content`);
          }
        } catch (fileError) {
          logger.error(`Error processing ${file}: ${fileError.message}`);
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to repair directory ${directory}: ${error.message}`, error);
      throw error;
    }
  },
  
  /**
   * Retrieve context for a query
   * 
   * This method provides compatibility with components expecting a retrieveContext method
   * as defined in the standardization document.
   * 
   * @param {string} query - The query to retrieve context for
   * @param {object} options - Options for context retrieval
   * @returns {Promise<object>} - The retrieved context
   */
  async retrieveContext(query, options = {}) {
    logger.info(`Retrieving context for query: ${query}...`);
    
    try {
      // Check if semantic context manager exists and has searchContext method
      if (!semanticContextManager || typeof semanticContextManager.searchContext !== 'function') {
        throw new Error('Semantic context manager not properly initialized');
      }
      
      // Call searchContext method on semantic context manager
      const context = await semanticContextManager.searchContext(query, {
        limit: options.limit || 5,
        minRelevance: options.minRelevance || 0.65,
        ...options
      });
      
      return {
        success: true,
        results: context && context.results ? context.results : [],
        query
      };
    } catch (error) {
      logger.error(`Context retrieval failed: ${error.message}`, error);
      
      // Return fallback results
      return {
        success: false,
        results: [],
        query,
        error: error.message
      };
    }
  },
  
  /**
   * Search context for a query
   * 
   * This is the native method name used by the semantic context manager.
   * 
   * @param {string} query - The query to search context for
   * @param {object} options - Options for context search
   * @returns {Promise<object>} - The search results
   */
  async searchContext(query, options = {}) {
    return this.retrieveContext(query, options);
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
    
    try {
      // Call storeChunks method on semantic context manager
      const result = await semanticContextManager.storeChunks(chunks, options);
      
      return {
        success: true,
        count: chunks.length,
        ...result
      };
    } catch (error) {
      logger.error(`Failed to store chunks: ${error.message}`, error);
      
      // Return failure result
      return {
        success: false,
        count: 0,
        error: error.message
      };
    }
  }
};

module.exports = { robustSemanticContextAdapter };
