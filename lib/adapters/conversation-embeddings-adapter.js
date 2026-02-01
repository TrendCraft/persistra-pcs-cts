/**
 * Conversation Embeddings Adapter
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This adapter extends the true semantic embeddings service to work specifically
 * with conversation data. It generates embeddings for conversation chunks that
 * capture the semantic meaning of dialogues, taking into account the unique
 * structure and content of conversations between users and Leo.
 *
 * This is part of Phase 2: Semantic Understanding for the Conversation-Aware Leo implementation.
 */

const eventBus = require('../utils/event-bus');
const configService = require('../config/config');
const path = require('path');
const fs = require('fs').promises;

// Logger and embeddingsInterface will be set via DI
let logger = null;
let embeddingsInterface = null;

// Component name for logging and events
const COMPONENT_NAME = 'conversation-embeddings-adapter';

// Logger and embeddingsInterface will be set via DI (see above)

// Configuration with sensible defaults
let CONFIG = {
  CACHE_DIR: process.env.LEO_CONVERSATION_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'conversations'),
  CACHE_FILE: 'conversation-embeddings-cache.json',
  USE_CACHE: true,
  CONVERSATION_EMBEDDING_WEIGHT: 1.2, // Weight conversation-specific terms higher
  INCLUDE_METADATA_IN_EMBEDDING: true // Include metadata in embedding calculation
};

// Initialization state
let isInitialized = false;

// Cache for conversation embeddings
let embeddingsCache = {};
let isCacheLoaded = false;

/**
 * Initialize the conversation embeddings adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
const { getEmbeddingModel } = require('../utils/model-routing');

async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  // Enforce embedding model routing
  const model = getEmbeddingModel();
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[conversation-embeddings-adapter] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[conversation-embeddings-adapter] DI MIGRATION: logger not provided! Falling back to console.');
  }
  try {
    logger.info && logger.info('Initializing conversation embeddings adapter');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationEmbeddings) {
        Object.assign(CONFIG, config.conversationEmbeddings);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure the true semantic embeddings service is initialized
    if (!await trueSemanticEmbeddings.initialize()) {
      throw new Error('Failed to initialize true semantic embeddings service');
    }
    
    // Ensure cache directory exists
    await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
    
    // Load cache if enabled
    if (CONFIG.USE_CACHE) {
      await loadCache();
    }
    
    isInitialized = true;
    logger.info('Conversation embeddings adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('component:initialized', { 
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Load the embeddings cache from disk
 * @private
 */
async function loadCache() {
  try {
    const cachePath = path.join(CONFIG.CACHE_DIR, CONFIG.CACHE_FILE);
    
    try {
      await fs.access(cachePath);
    } catch (accessError) {
      // Cache file doesn't exist, create empty cache
      embeddingsCache = {};
      isCacheLoaded = true;
      logger.info('Created new embeddings cache');
      return;
    }
    
    const cacheContent = await fs.readFile(cachePath, 'utf8');
    embeddingsCache = JSON.parse(cacheContent);
    isCacheLoaded = true;
    
    logger.info(`Loaded ${Object.keys(embeddingsCache).length} cached embeddings`);
  } catch (error) {
    logger.error(`Failed to load embeddings cache: ${error.message}`);
    embeddingsCache = {};
    isCacheLoaded = true;
  }
}

/**
 * Save the embeddings cache to disk
 * @private
 */
async function saveCache() {
  if (!CONFIG.USE_CACHE || !isCacheLoaded) {
    return;
  }
  
  try {
    const cachePath = path.join(CONFIG.CACHE_DIR, CONFIG.CACHE_FILE);
    await fs.writeFile(cachePath, JSON.stringify(embeddingsCache), 'utf8');
    logger.info(`Saved ${Object.keys(embeddingsCache).length} embeddings to cache`);
  } catch (error) {
    logger.error(`Failed to save embeddings cache: ${error.message}`);
  }
}

/**
 * Preprocess conversation chunk for embedding
 * @param {Object} chunk - Conversation chunk
 * @returns {string} Preprocessed text
 * @private
 */
function preprocessChunk(chunk) {
  try {
    let preprocessedText = chunk.text || '';
    
    // Include metadata in the text if configured
    if (CONFIG.INCLUDE_METADATA_IN_EMBEDDING && chunk.metadata) {
      const metadata = chunk.metadata;
      
      if (metadata.tags && metadata.tags.length > 0) {
        preprocessedText += ` TAGS: ${metadata.tags.join(' ')}`;
      }
      
      if (metadata.title) {
        preprocessedText += ` TITLE: ${metadata.title}`;
      }
    }
    
    return preprocessedText;
  } catch (error) {
    logger.error(`Error preprocessing chunk: ${error.message}`);
    return chunk.text || '';
  }
}

/**
 * Generate an embedding for a conversation chunk
 * @param {Object} chunk - Conversation chunk
 * @param {Object} options - Embedding options
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateChunkEmbedding(chunk, options = {}) {
  if (!isInitialized) {
    logger.warn('Conversation embeddings adapter not initialized');
    return [];
  }
  
  try {
    // Generate a cache key for the chunk
    const chunkId = chunk.id || `chunk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Extract options with defaults
    const { 
      useCache = CONFIG.USE_CACHE,
      forceRefresh = false
    } = options;
    
    // Check cache if enabled and not forcing refresh
    if (useCache && !forceRefresh && embeddingsCache[chunkId]) {
      logger.debug(`Using cached embedding for chunk ${chunkId}`);
      return embeddingsCache[chunkId];
    }
    
    // Preprocess the chunk for embedding
    const preprocessedText = preprocessChunk(chunk);
    
    logger.debug(`Generating embedding for chunk ${chunkId}`);
    
    // Generate the embedding using the true semantic embeddings service
    const embedding = await trueSemanticEmbeddings.generateEmbeddingWithRetry(preprocessedText, {
      fileType: 'conversation',
      useCache: useCache,
      forceRefresh: forceRefresh
    });
    
    // Cache the embedding if caching is enabled
    if (useCache) {
      embeddingsCache[chunkId] = embedding;
      await saveCache();
    }
    
    logger.debug(`Generated embedding for chunk ${chunkId}`);
    
    // Emit event for monitoring
    eventBus.emit('conversation:embedding:created', { 
      component: COMPONENT_NAME,
      chunkId
    });
    
    return embedding;
  } catch (error) {
    logger.error(`Error generating chunk embedding: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to generate chunk embedding', 
      error: error.message 
    });
    
    return [];
  }
}

/**
 * Generate embeddings for multiple conversation chunks
 * @param {Array<Object>} chunks - Array of conversation chunks
 * @param {Object} options - Embedding options
 * @returns {Promise<Array<Object>>} Array of chunks with embeddings
 */
async function generateChunkEmbeddings(chunks, options = {}) {
  if (!isInitialized) {
    logger.warn('Conversation embeddings adapter not initialized');
    return [];
  }
  
  if (!Array.isArray(chunks)) {
    logger.error('Invalid input: chunks must be an array');
    return [];
  }
  
  try {
    logger.info(`Generating embeddings for ${chunks.length} chunks`);
    
    const chunksWithEmbeddings = [];
    
    // Process each chunk
    for (const chunk of chunks) {
      const embedding = await generateChunkEmbedding(chunk, options);
      
      if (embedding && embedding.length > 0) {
        chunksWithEmbeddings.push({
          ...chunk,
          embedding
        });
      }
    }
    
    logger.info(`Generated embeddings for ${chunksWithEmbeddings.length} chunks`);
    
    return chunksWithEmbeddings;
  } catch (error) {
    logger.error(`Error generating chunk embeddings: ${error.message}`);
    return [];
  }
}

/**
 * Calculate similarity between two conversation chunks
 * @param {Object} chunkA - First chunk with embedding
 * @param {Object} chunkB - Second chunk with embedding
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(chunkA, chunkB) {
  if (!chunkA.embedding || !chunkB.embedding) {
    logger.warn('Cannot calculate similarity: one or both chunks missing embeddings');
    return 0;
  }
  
  try {
    // Use the cosine similarity function from the true semantic embeddings service
    const similarity = trueSemanticEmbeddings.cosineSimilarity(chunkA.embedding, chunkB.embedding);
    
    // Convert from -1:1 range to 0:1 range
    return (similarity + 1) / 2;
  } catch (error) {
    logger.error(`Error calculating similarity: ${error.message}`);
    return 0;
  }
}

/**
 * Find similar conversation chunks
 * @param {Object} queryChunk - Query chunk with embedding
 * @param {Array<Object>} chunks - Array of chunks with embeddings to search
 * @param {Object} options - Search options
 * @returns {Array<Object>} Array of chunks with similarity scores
 */
function findSimilarChunks(queryChunk, chunks, options = {}) {
  if (!isInitialized) {
    logger.warn('Conversation embeddings adapter not initialized');
    return [];
  }
  
  try {
    // Extract options with defaults
    const { 
      limit = 10,
      threshold = 0.7
    } = options;
    
    if (!queryChunk.embedding) {
      throw new Error('Query chunk must have an embedding');
    }
    
    if (!Array.isArray(chunks)) {
      throw new Error('Chunks must be an array');
    }
    
    // Calculate similarity for each chunk
    const chunksWithSimilarity = chunks
      .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
      .map(chunk => ({
        ...chunk,
        similarity: calculateSimilarity(queryChunk, chunk)
      }))
      .filter(chunk => chunk.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
    
    // Limit results
    const limitedResults = chunksWithSimilarity.slice(0, limit);
    
    logger.info(`Found ${limitedResults.length} similar chunks above threshold ${threshold}`);
    
    return limitedResults;
  } catch (error) {
    logger.error(`Error finding similar chunks: ${error.message}`);
    return [];
  }
}

/**
 * Clear the embeddings cache
 */
async function clearCache() {
  embeddingsCache = {};
  isCacheLoaded = true;
  await saveCache();
  logger.info('Cleared embeddings cache');
}

/**
 * Get metrics about the embeddings adapter
 * @returns {Object} Metrics object
 */
function getMetrics() {
  return {
    component: COMPONENT_NAME,
    isInitialized,
    cacheSize: Object.keys(embeddingsCache).length,
    config: { ...CONFIG }
  };
}

// Export the adapter API
module.exports = {
  initialize,
  generateChunkEmbedding,
  generateChunkEmbeddings,
  calculateSimilarity,
  findSimilarChunks,
  clearCache,
  getMetrics
};
