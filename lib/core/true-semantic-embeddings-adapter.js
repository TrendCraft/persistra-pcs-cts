/**
 * True Semantic Embeddings Adapter
 * 
 * This adapter provides a consistent interface for the True Semantic Embeddings component.
 * It addresses interface mismatches between the expected MVL interface and the
 * actual implementation in the true-semantic-embeddings.js module.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const trueSemanticEmbeddings = require('../services/true-semantic-embeddings');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'true-semantic-embeddings-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Initialize the true semantic embeddings
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing true semantic embeddings adapter');
    
    const success = await trueSemanticEmbeddings.initialize(options);
    
    if (success) {
      logger.info('True semantic embeddings adapter initialized successfully');
      eventBus.emit('component:initialized', { 
        component: COMPONENT_NAME,
        timestamp: Date.now()
      });
    } else {
      logger.error('Failed to initialize true semantic embeddings');
    }
    
    return success;
  } catch (error) {
    logger.error(`Error initializing true semantic embeddings adapter: ${error.message}`, { error: error.stack });
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Initialization failed', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Generate embedding for text
 * @param {string} text
 * @param {Object} options
 * @returns {Promise<Array<number>>}
 */
async function generateEmbedding(text, options = {}) {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text: text must be a non-empty string');
    }
    
    const startTime = Date.now();
    const embedding = await trueSemanticEmbeddings.generateEmbedding(text, options);
    const duration = Date.now() - startTime;
    
    if (!validateEmbedding(embedding)) {
      throw new Error('Generated embedding is invalid');
    }
    
    logger.debug(`Generated embedding for text (${text.length} chars) in ${duration}ms`);
    
    eventBus.emit('embedding:generated', { 
      component: COMPONENT_NAME,
      textLength: text.length,
      duration
    });
    
    return embedding;
  } catch (error) {
    logger.error(`Error generating embedding: ${error.message}`, { error: error.stack });
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to generate embedding', 
      error: error.message 
    });
    return null;
  }
}

/**
 * Generate embedding with retry logic
 * @param {string} text
 * @param {number} maxRetries
 * @param {Object} options
 * @returns {Promise<Array<number>>}
 */
async function generateEmbeddingWithRetry(text, maxRetries = 3, options = {}) {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text: text must be a non-empty string');
    }
    
    if (typeof maxRetries !== 'number' || maxRetries < 0) {
      maxRetries = 3;
    }
    
    logger.debug(`Generating embedding with ${maxRetries} max retries`);
    const embedding = await trueSemanticEmbeddings.generateEmbeddingWithRetry(text, 0);
    
    if (!validateEmbedding(embedding)) {
      throw new Error('Generated embedding is invalid');
    }
    
    return embedding;
  } catch (error) {
    logger.error(`Error generating embedding with retry: ${error.message}`, { error: error.stack });
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to generate embedding with retry', 
      error: error.message 
    });
    return null;
  }
}

/**
 * Compare two embeddings using cosine similarity
 * @param {Array<number>} embedding1
 * @param {Array<number>} embedding2
 * @returns {number}
 */
function compareEmbeddings(embedding1, embedding2) {
  try {
    if (!validateEmbedding(embedding1) || !validateEmbedding(embedding2)) {
      throw new Error('Invalid embeddings');
    }
    
    const similarity = trueSemanticEmbeddings.cosineSimilarity(embedding1, embedding2);
    return (similarity + 1) / 2;
  } catch (error) {
    logger.error(`Error comparing embeddings: ${error.message}`);
    return 0;
  }
}

/**
 * Validate an embedding vector
 * @param {Array<number>} embedding
 * @returns {boolean}
 */
function validateEmbedding(embedding) {
  if (!embedding || !Array.isArray(embedding)) return false;
  if (embedding.length === 0) return false;
  if (embedding.some(val => val === null || val === undefined || isNaN(val))) return false;
  return true;
}

/**
 * Clear the embeddings cache
 * @returns {boolean}
 */
function clearCache() {
  try {
    trueSemanticEmbeddings.clearCache();
    logger.info('Embeddings cache cleared');
    eventBus.emit('cache:cleared', { 
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    return true;
  } catch (error) {
    logger.error(`Error clearing cache: ${error.message}`);
    return false;
  }
}

/**
 * Get metrics about the embeddings service
 * @returns {Object}
 */
function getMetrics() {
  try {
    const metrics = trueSemanticEmbeddings.getMetrics();
    metrics.adapter = {
      name: COMPONENT_NAME,
      timestamp: Date.now()
    };
    return metrics;
  } catch (error) {
    logger.error(`Error getting metrics: ${error.message}`);
    return {
      error: error.message,
      adapter: {
        name: COMPONENT_NAME,
        timestamp: Date.now()
      }
    };
  }
}

/**
 * Embed and score memory graph nodes
 * @param {string} query
 * @param {Array<Object>} memoryGraph
 * @param {Array<Object>} embeddings
 * @param {number} limit
 * @param {number} threshold
 * @returns {Array<Object>}
 */
async function embedAndScore(query, memoryGraph, embeddings, limit = 5, threshold = 0.15) {
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const scored = embeddings
    .map((embeddingEntry, i) => {
      const score = compareEmbeddings(queryEmbedding, embeddingEntry.vector);
      return { node: memoryGraph[i], score };
    })
    .filter(entry => entry.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

module.exports = {
  initialize,
  generateEmbedding,
  generateEmbeddingWithRetry,
  compareEmbeddings,
  clearCache,
  getMetrics,
  embedAndScore
};