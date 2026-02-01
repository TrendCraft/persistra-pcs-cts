/**
 * Semantic Context Manager Adapter
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This adapter provides a consistent interface for the Semantic Context Manager component.
 * It addresses interface mismatches between the expected MVL interface and the
 * actual implementation in the semantic-context-manager.js module.
 *
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const semanticContextManager = require('../services/semantic-context-manager');
const pathUtilsAdapter = require('./path-utils-adapter');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'semantic-context-manager-adapter';

// Logger and embeddingsInterface will be set via DI
let logger = null;
let embeddingsInterface = null;

/**
 * Initialize the semantic context manager
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[legacy/semantic-context-manager-adapter] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[legacy/semantic-context-manager-adapter] DI MIGRATION: logger not provided! Falling back to console.');
  }
  try {
    logger.info && logger.info('Initializing semantic context manager adapter');
    
    // Pass initialization to the underlying implementation
    const success = await semanticContextManager.initialize(options);
    
    if (success) {
      logger.info('Semantic context manager adapter initialized successfully');
      // Set the isInitialized property
      module.exports.isInitialized = true;
      // Emit initialization event
      eventBus.emit('component:initialized', { 
        component: COMPONENT_NAME,
        timestamp: Date.now()
      });
    } else {
      logger.error('Failed to initialize semantic context manager');
    }
    
    return success;
  } catch (error) {
    logger.error(`Error initializing semantic context manager adapter: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Initialization failed', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Search for context relevant to a query
 * @param {string} query - The query to search context for
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Standardized result with context results and metadata
 */
async function searchContext(query, options = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Semantic context manager adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize semantic context manager adapter',
          results: [],
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    // Input validation
    if (!query || typeof query !== 'string') {
      logger.error('Invalid query: query must be a non-empty string');
      return {
        success: false,
        error: 'Invalid query: query must be a non-empty string',
        results: [],
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    const startTime = Date.now();
    
    // Extract options with defaults
    const { 
      maxResults = 5,
      similarityThreshold = 0.7,
      includeCode = true,
      includePaths = true
    } = options;
    
    logger.info(`Searching context for query: "${query}"`);
    
    try {
      // Use the underlying implementation
      const context = await semanticContextManager.searchContext(query, {
        maxResults,
        similarityThreshold,
        includeCode,
        includePaths
      });
      
      const duration = Date.now() - startTime;
      
      // Check if the result is already in the standardized format
      if (context && typeof context.success === 'boolean') {
        // Already standardized, just add any missing fields
        if (!context.metadata) {
          context.metadata = {
            query,
            timestamp: Date.now(),
            duration
          };
        }
        
        logger.info(`Found ${context.results ? context.results.length : 0} context results in ${duration}ms`);
        
        // Emit event for monitoring
        eventBus.emit('context:searched', { 
          component: COMPONENT_NAME,
          query,
          resultCount: context.results ? context.results.length : 0,
          duration
        });
        
        return context;
      }
      
      // Handle non-standardized return format
      // Convert to standardized format
      const standardizedResult = {
        success: true,
        results: Array.isArray(context) ? context : (context.results || []),
        metadata: {
          query,
          timestamp: Date.now(),
          duration,
          count: Array.isArray(context) ? context.length : (context.results ? context.results.length : 0),
          options: {
            maxResults,
            similarityThreshold,
            includeCode,
            includePaths
          }
        }
      };
      
      logger.info(`Found ${standardizedResult.results.length} context results in ${duration}ms`);
      
      // Emit event for monitoring
      eventBus.emit('context:searched', { 
        component: COMPONENT_NAME,
        query,
        resultCount: standardizedResult.results.length,
        duration
      });
      
      return standardizedResult;
    } catch (underlyingError) {
      // Handle errors from the underlying implementation
      logger.error(`Error from underlying implementation: ${underlyingError.message}`);
      
      // Emit error event
      eventBus.emit('error', { 
        component: COMPONENT_NAME, 
        message: 'Underlying context search failed', 
        error: underlyingError.message 
      });
      
      // Return standardized error format
      return {
        success: false,
        error: underlyingError.message,
        results: [],
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error',
          duration: Date.now() - startTime
        }
      };
    }
  } catch (error) {
    logger.error(`Error searching context: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Context search failed', 
      error: error.message 
    });
    
    // Return standardized error format
    return {
      success: false,
      error: error.message,
      results: [],
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Get context for a query (alias for searchContext for backward compatibility)
 * @param {string} query - The query to get context for
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Context object with relevant code snippets
 */
async function getContext(query, options = {}) {
  logger.debug('getContext called (alias for searchContext)');
  return searchContext(query, options);
}

/**
 * Generate an enhanced prompt with relevant context
 * @param {string} query - The query to generate prompt for
 * @param {Object} options - Prompt options
 * @returns {Promise<Object>} Standardized result with enhanced prompt and metadata
 */
async function generateEnhancedPrompt(query, options = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Semantic context manager adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize semantic context manager adapter',
          context: query, // Return original query as fallback
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    // Input validation
    if (!query || typeof query !== 'string') {
      logger.error('Invalid query: query must be a non-empty string');
      return {
        success: false,
        error: 'Invalid query: query must be a non-empty string',
        context: query, // Return original query as fallback
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    logger.info(`Generating enhanced prompt for query: "${query}"`);
    
    // Extract options with defaults
    const { 
      maxResults = 5,
      similarityThreshold = 0.7,
      includeCode = true,
      includePaths = true,
      format = 'markdown'
    } = options;
    
    try {
      // Use the underlying implementation
      const enhancedPromptResult = await semanticContextManager.generateEnhancedPrompt(query, {
        maxResults,
        similarityThreshold,
        includeCode,
        includePaths,
        format
      });
      
      // Check if the result is already in the standardized format
      if (enhancedPromptResult && typeof enhancedPromptResult.success === 'boolean') {
        // Already standardized, just add any missing fields
        if (!enhancedPromptResult.metadata) {
          enhancedPromptResult.metadata = {
            query,
            timestamp: Date.now(),
            status: enhancedPromptResult.success ? 'success' : 'error'
          };
        }
        
        const promptLength = enhancedPromptResult.context ? enhancedPromptResult.context.length : 0;
        logger.info(`Generated enhanced prompt (${promptLength} chars)`);
        
        // Emit event for monitoring
        eventBus.emit('prompt:enhanced', { 
          component: COMPONENT_NAME,
          query,
          promptLength
        });
        
        return enhancedPromptResult;
      }
      
      // Handle non-standardized return format (string or other format)
      // Convert to standardized format
      let contextContent = '';
      
      if (typeof enhancedPromptResult === 'string') {
        contextContent = enhancedPromptResult;
      } else if (enhancedPromptResult && enhancedPromptResult.prompt) {
        contextContent = enhancedPromptResult.prompt;
      } else if (enhancedPromptResult && enhancedPromptResult.context) {
        contextContent = enhancedPromptResult.context;
      } else {
        contextContent = String(enhancedPromptResult || '');
      }
      
      const standardizedResult = {
        success: true,
        context: contextContent,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'success',
          promptLength: contextContent.length,
          options: {
            maxResults,
            similarityThreshold,
            includeCode,
            includePaths,
            format
          }
        }
      };
      
      logger.info(`Generated enhanced prompt (${contextContent.length} chars)`);
      
      // Emit event for monitoring
      eventBus.emit('prompt:enhanced', { 
        component: COMPONENT_NAME,
        query,
        promptLength: contextContent.length
      });
      
      return standardizedResult;
    } catch (underlyingError) {
      // Handle errors from the underlying implementation
      logger.error(`Error from underlying implementation: ${underlyingError.message}`);
      
      // Emit error event
      eventBus.emit('error', { 
        component: COMPONENT_NAME, 
        message: 'Underlying enhanced prompt generation failed', 
        error: underlyingError.message 
      });
      
      // Return standardized error format with original query as fallback
      return {
        success: false,
        error: underlyingError.message,
        context: `Error formatting context. ${query}`,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  } catch (error) {
    logger.error(`Error generating enhanced prompt: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Enhanced prompt generation failed', 
      error: error.message 
    });
    
    // Return standardized error format with original query as fallback
    return {
      success: false,
      error: error.message,
      context: `Error formatting context. ${query}`,
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Process a file with the semantic chunker
 * @param {string} filePath - Path to the file
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of chunks
 */
async function processFile(filePath, options = {}) {
  try {
    // Input validation
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: path must be a non-empty string');
    }
    
    // Normalize and resolve path
    const normalizedPath = pathUtilsAdapter.absolute(filePath);
    
    logger.info(`Processing file: ${normalizedPath}`);
    
    // Use the underlying implementation
    const chunks = await semanticContextManager.processFileWithSemanticChunker(normalizedPath, options);
    
    logger.info(`Generated ${chunks.length} chunks for ${normalizedPath}`);
    
    // Emit event for monitoring
    eventBus.emit('file:processed', { 
      component: COMPONENT_NAME,
      path: normalizedPath,
      chunkCount: chunks.length
    });
    
    return chunks;
  } catch (error) {
    logger.error(`Error processing file ${filePath}: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to process file: ${filePath}`, 
      error: error.message 
    });
    return [];
  }
}

/**
 * Process multiple files with the semantic chunker
 * @param {Array<string>} filePaths - Array of file paths
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of chunks
 */
async function processFiles(filePaths, options = {}) {
  try {
    // Input validation
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error('Invalid file paths: must be a non-empty array of strings');
    }
    
    logger.info(`Processing ${filePaths.length} files`);
    
    // Use the underlying implementation
    const chunks = await semanticContextManager.processFilesWithSemanticChunker(filePaths, options);
    
    logger.info(`Generated ${chunks.length} chunks from ${filePaths.length} files`);
    
    // Emit event for monitoring
    eventBus.emit('files:processed', { 
      component: COMPONENT_NAME,
      fileCount: filePaths.length,
      chunkCount: chunks.length
    });
    
    return chunks;
  } catch (error) {
    logger.error(`Error processing files: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to process files', 
      error: error.message 
    });
    return [];
  }
}

/**
 * Invalidate the context cache
 * @param {Object} options - Cache invalidation options
 * @returns {Promise<boolean>} Success status
 */
async function invalidateCache(options = {}) {
  try {
    logger.info('Invalidating context cache');
    
    // Use the underlying implementation
    await semanticContextManager.invalidateCache(options);
    
    logger.info('Context cache invalidated');
    
    // Emit event for monitoring
    eventBus.emit('cache:invalidated', { 
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Error invalidating cache: ${error.message}`);
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to invalidate cache', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Analyze a query to extract key terms and intent
 * @param {string} query - The query to analyze
 * @returns {Object} Standardized result with analysis and metadata
 */
function analyzeQuery(query) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Semantic context manager adapter not initialized, initializing now...');
      // Since analyzeQuery is synchronous, we can't await initialize here
      // Instead, we'll return an error indicating initialization is needed
      return {
        success: false,
        error: 'Semantic context manager adapter not initialized',
        analysis: null,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    // Input validation
    if (!query || typeof query !== 'string') {
      logger.error('Invalid query: query must be a non-empty string');
      return {
        success: false,
        error: 'Invalid query: query must be a non-empty string',
        analysis: null,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    logger.info(`Analyzing query: "${query}"`);
    
    try {
      // Use the underlying implementation
      const analysis = semanticContextManager.analyzeQuery(query);
      
      // Check if the result is already in the standardized format
      if (analysis && typeof analysis.success === 'boolean') {
        // Already standardized, just add any missing fields
        if (!analysis.metadata) {
          analysis.metadata = {
            query,
            timestamp: Date.now()
          };
        }
        
        logger.info('Query analysis completed');
        
        // Emit event for monitoring
        eventBus.emit('query:analyzed', { 
          component: COMPONENT_NAME,
          query
        });
        
        return analysis;
      }
      
      // Convert to standardized format
      const standardizedResult = {
        success: true,
        analysis: analysis || {},
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'success'
        }
      };
      
      logger.info('Query analysis completed');
      
      // Emit event for monitoring
      eventBus.emit('query:analyzed', { 
        component: COMPONENT_NAME,
        query
      });
      
      return standardizedResult;
    } catch (underlyingError) {
      // Handle errors from the underlying implementation
      logger.error(`Error from underlying implementation: ${underlyingError.message}`);
      
      // Emit error event
      eventBus.emit('error', { 
        component: COMPONENT_NAME, 
        message: 'Underlying query analysis failed', 
        error: underlyingError.message 
      });
      
      // Return standardized error format
      return {
        success: false,
        error: underlyingError.message,
        analysis: null,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  } catch (error) {
    logger.error(`Error analyzing query: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Query analysis failed', 
      error: error.message 
    });
    
    // Return standardized error format
    return {
      success: false,
      error: error.message,
      analysis: null,
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Store chunks in the context database
 * @param {Array} chunks - Array of chunks to store
 * @param {Object} options - Storage options
 * @returns {Promise<boolean>} Success status
 */
async function storeChunks(chunks, options = {}) {
  try {
    // Input validation
    if (!Array.isArray(chunks)) {
      throw new Error('Invalid chunks: chunks must be an array');
    }
    
    if (chunks.length === 0) {
      logger.info('No chunks to store');
      return true;
    }
    
    logger.info(`Storing ${chunks.length} chunks in context database`);
    
    // Use the underlying implementation if available
    if (typeof semanticContextManager.storeChunks === 'function') {
      return await semanticContextManager.storeChunks(chunks, options);
    }
    
    // Fallback implementation - add to embeddings and chunks files
    // This is a simplified implementation and should be replaced with proper storage
    const fs = require('fs');
    const path = require('path');
    const { promisify } = require('util');
    const appendFileAsync = promisify(fs.appendFile);
    const configService = require('../config/config');
    
    const embeddingsFile = configService.getValue('embeddingsFile') || path.join(process.cwd(), 'data', 'embeddings.jsonl');
    const chunksFile = configService.getValue('chunksFile') || path.join(process.cwd(), 'data', 'chunks.jsonl');
    
    // Ensure directories exist
    const embeddingsDir = path.dirname(embeddingsFile);
    const chunksDir = path.dirname(chunksFile);
    
    if (!fs.existsSync(embeddingsDir)) {
      fs.mkdirSync(embeddingsDir, { recursive: true });
    }
    
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true });
    }
    
    // Store chunks and embeddings
    for (const chunk of chunks) {
      if (!chunk.id) {
        chunk.id = `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
      
      if (!chunk.timestamp) {
        chunk.timestamp = Date.now();
      }
      
      // Store embedding
      if (chunk.embedding) {
        const embeddingEntry = {
          id: chunk.id,
          embedding: chunk.embedding,
          timestamp: chunk.timestamp
        };
        
        await appendFileAsync(embeddingsFile, JSON.stringify(embeddingEntry) + '\n');
      }
      
      // Store chunk without embedding to save space
      const chunkEntry = { ...chunk };
      delete chunkEntry.embedding; // Don't duplicate the embedding
      
      await appendFileAsync(chunksFile, JSON.stringify(chunkEntry) + '\n');
    }
    
    logger.info(`Successfully stored ${chunks.length} chunks`);
    
    // Emit event for monitoring
    eventBus.emit('chunks:stored', { 
      component: COMPONENT_NAME,
      count: chunks.length
    });
    
    return true;
  } catch (error) {
    logger.error(`Error storing chunks: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to store chunks', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Get cache statistics
 * @returns {Object} Standardized result with cache statistics
 */
function getCacheStats() {
  try {
    logger.info('Getting cache statistics');
    
    // Get stats from underlying implementation if available
    if (typeof semanticContextManager.getCacheStats === 'function') {
      return semanticContextManager.getCacheStats();
    }
    
    // Provide default stats if not available
    return {
      success: true,
      stats: {
        hits: 0,
        misses: 0,
        invalidations: 0,
        size: 0
      },
      metadata: {
        timestamp: Date.now(),
        note: 'Default stats from adapter'
      }
    };
  } catch (error) {
    logger.error(`Error getting cache statistics: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to get cache statistics', 
      error: error.message 
    });
    
    return {
      success: false,
      error: error.message,
      stats: {},
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Generate an embedding for a query
 * @param {string} query - The query to generate an embedding for
 * @returns {Promise<Object>} Standardized result with embedding and metadata
 */
async function generateQueryEmbedding(query) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Semantic context manager adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize semantic context manager adapter',
          embedding: new Array(384).fill(0),
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error',
            dimensions: 384
          }
        };
      }
    }
    
    logger.info(`Generating embedding for query: "${query}"`);
    
    // Use true semantic embeddings directly if available in the underlying implementation
    let embeddings = null;
    
    try {
      // Try to use the direct embedding generation function
      const embedding = await embeddings.generateEmbedding(query, {
        type: 'query',
        dimensions: 384 // Use standard dimensions
      });
      
      logger.info('Generated query embedding successfully');
      
      // Return standardized result
      return {
        success: true,
        embedding,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'success',
          dimensions: embedding.length,
          method: 'semantic'
        }
      };
    } catch (embeddingError) {
      logger.warn(`Error using direct embedding generation: ${embeddingError.message}`);
      
      // Fallback to using a hash-based approach if necessary
      logger.info('Falling back to hash-based embedding generation');
      
      // Create a simple hash-based embedding as fallback
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(query).digest('hex');
      
      // Convert hash to a numeric vector (384 dimensions to match standard)
      const embedding = new Array(384).fill(0);
      for (let i = 0; i < hash.length - 1; i += 2) {
        const value = parseInt(hash.substr(i, 2), 16);
        const index = i / 2 % 384;
        embedding[index] = (value / 255) * 2 - 1; // Scale to [-1, 1]
      }
      
      // Normalize the vector
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const normalizedEmbedding = embedding.map(val => val / magnitude);
      
      logger.info('Generated fallback embedding successfully');
      
      // Return standardized result
      return {
        success: true,
        embedding: normalizedEmbedding,
        metadata: {
          query,
          timestamp: Date.now(),
          status: 'success',
          dimensions: normalizedEmbedding.length,
          method: 'fallback-hash'
        }
      };
    }
  } catch (error) {
    logger.error(`Error generating query embedding: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to generate query embedding', 
      error: error.message 
    });
    
    // Return a standardized error response
    return {
      success: false,
      error: error.message,
      embedding: new Array(384).fill(0),
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error',
        dimensions: 384
      }
    };
  }
}

/**
 * Retrieve context based on a query
 * This method is an alias for searchContext to maintain interface consistency
 * across the system as defined in LEO_STANDARDIZATION.md
 * 
 * @param {string} query - The query to retrieve context for
 * @param {Object} options - Options for context retrieval
 * @returns {Promise<Object>} Retrieved context in standardized format
 */
async function retrieveContext(query, options = {}) {
  logger.info(`retrieveContext called with query: ${query.substring(0, 50)}...`);
  return searchContext(query, options);
}

/**
 * Get context based on a query
 * @param {string} query - The query to get context for
 * @param {Object} options - Options for context retrieval
 * @returns {Promise<Object>} Retrieved context in standardized format
 */
async function getContext(query, options = {}) {
  logger.info(`getContext called with query: ${query.substring(0, 50)}...`);
  return searchContext(query, options);
}

// Export the adapter API
module.exports = {
  initialize,
  searchContext,
  retrieveContext,
  getContext,
  generateEnhancedPrompt,
  processFile,
  processFiles,
  invalidateCache,
  analyzeQuery,
  storeChunks,
  getCacheStats,
  generateQueryEmbedding,
  isInitialized: false // Add standardized isInitialized property
};
