// DO NOT USE THIS FILE
// embedding-service.js is fully deprecated as of July 2025.
// All semantic embedding operations MUST use EmbeddingsService via dependency injection.
// See MIGRATION.md for details on the new integration boundary.

// Patch: Ensure logger is always defined to avoid ReferenceError in legacy scripts
if (typeof logger === 'undefined') {
  var logger = (typeof global !== 'undefined' && global.logger) ? global.logger : console;
}
// Patch: Ensure configService is defined (minimal shim for legacy scripts)
if (typeof configService === 'undefined') {
  var configService = { updateConfig: function() { logger.info('[Shim] configService.updateConfig called (noop)'); } };
}
// Patch: Ensure eventBus is defined (minimal shim for legacy scripts)
if (typeof eventBus === 'undefined') {
  var eventBus = { emit: function() { logger.info('[Shim] eventBus.emit called (noop)'); } };
}
// Patch: Ensure COMPONENT_NAME is defined (minimal shim for legacy scripts)
if (typeof COMPONENT_NAME === 'undefined') {
  var COMPONENT_NAME = 'embedding-service';
}


const metrics = {
  embeddingsGenerated: 0,
  trueEmbeddingsGenerated: 0,
  hashEmbeddingsGenerated: 0,
  fallbacksTriggered: 0,
  averageGenerationTime: 0,
  totalGenerationTime: 0,
  errors: 0,
  lastError: null,
  lastErrorTime: null
};

// Initialization status
let isInitialized = false;

/**
 * Initialize the embedding service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing embedding service...');
    
    // Update central configuration if options provided
    if (Object.keys(options).length > 0) {
      configService.updateConfig(options);
    }
    
    // Initialize configuration using standardized access patterns
    initializeConfig();
    
    // Subscribe to configuration changes
    configService.subscribe(COMPONENT_NAME, handleConfigChange);
    
    // Create cache directory if it doesn't exist
    if (CONFIG.enableCache) {
      const cacheDir = pathUtils.normalize(CONFIG.cacheDir);
      if (!await pathUtils.exists(cacheDir)) {
        logger.info(`Creating cache directory: ${cacheDir}`);
        await pathUtils.ensureDirectoryExists(cacheDir);
      }
    }
    
    logger.info(`Initializing embedding service with mode: ${CONFIG.useTrueEmbeddings ? 'true semantic' : 'hash-based'}`);
    
    // Initialize hash-based embeddings (always needed for fallback)
    await hashEmbeddings.initialize();
    
    // Initialize true semantic embeddings if enabled
    if (CONFIG.useTrueEmbeddings) {
      await trueEmbeddings.initialize({
        modelType: CONFIG.modelType,
        fallbackToHash: CONFIG.fallbackToHash,
        cacheDir: CONFIG.cacheDir,
        maxRetries: CONFIG.maxRetries,
        retryDelay: CONFIG.retryDelay,
        timeout: CONFIG.timeout
      });
    }
    
    // Reset metrics
    resetMetrics();
    
    // Emit initialization event
    eventBus.emit('component:initialized', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      config: {
        useTrueEmbeddings: CONFIG.useTrueEmbeddings,
        modelType: CONFIG.modelType,
        fallbackToHash: CONFIG.fallbackToHash
      }
    });
    
    isInitialized = true;
    logger.info('Embedding service initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize embedding service: ${error.message}`);
    
    // Track error in metrics
    metrics.errors++;
    metrics.lastError = error.message;
    metrics.lastErrorTime = Date.now();
    
    // Emit error event
    eventBus.emit('component:error', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      error: error.message
    });
    
    return false;
  }
}

/**
 * Handle configuration changes
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @private
 */
function handleConfigChange(event, data) {
  if (event === 'updated') {
    logger.info('Configuration updated, reinitializing');
    initializeConfig();
  }
}

/**
 * Reset metrics
 * @private
 */
function resetMetrics() {
  metrics.embeddingsGenerated = 0;
  metrics.trueEmbeddingsGenerated = 0;
  metrics.hashEmbeddingsGenerated = 0;
  metrics.fallbacksTriggered = 0;
  metrics.averageGenerationTime = 0;
  metrics.totalGenerationTime = 0;
  metrics.errors = 0;
  metrics.lastError = null;
  metrics.lastErrorTime = null;
}

/**
 * Generate an embedding for the given text
 * @param {string} text - Text to generate embedding for
 * @param {Object} options - Options for embedding generation
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateEmbedding(text, options = {}) {
  try {
    // Ensure service is initialized
    if (!isInitialized) {
      logger.warn('Embedding service not initialized, initializing with defaults');
      await initialize();
    }
    
    // Track metrics
    const startTime = Date.now();
    let embedding;
    
    // Emit embedding request event
    eventBus.emit('embedding:requested', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      textLength: text.length,
      options: JSON.stringify(options)
    });
    
    try {
      if (CONFIG.useTrueEmbeddings) {
        // Use true semantic embeddings with retry
        embedding = await trueEmbeddings.generateEmbeddingWithRetry(text, options);
        metrics.trueEmbeddingsGenerated++;
      } else {
        // Use hash-based embeddings
        embedding = hashEmbeddings.generateSemanticEmbedding(text);
        metrics.hashEmbeddingsGenerated++;
      }
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      
      // Emit error event
      eventBus.emit('embedding:error', {
        component: COMPONENT_NAME,
        timestamp: Date.now(),
        error: error.message,
        textLength: text.length
      });
      
      // Track error in metrics
      metrics.errors++;
      metrics.lastError = error.message;
      metrics.lastErrorTime = Date.now();
      
      // Fall back to hash-based embeddings if true embeddings fail
      if (CONFIG.useTrueEmbeddings && CONFIG.fallbackToHash) {
        logger.warn('Falling back to hash-based embeddings');
        embedding = hashEmbeddings.generateSemanticEmbedding(text);
        metrics.fallbacksTriggered++;
        metrics.hashEmbeddingsGenerated++;
        
        // Emit fallback event
        eventBus.emit('embedding:fallback', {
          component: COMPONENT_NAME,
          timestamp: Date.now(),
          textLength: text.length
        });
      } else {
        // If fallback is disabled or we're already using hash-based embeddings,
        // return a zero vector as a last resort
        const dimensions = options.dimensions || 384;
        embedding = new Array(dimensions).fill(0);
      }
    }
    
    // Update metrics
    const endTime = Date.now();
    const generationTime = endTime - startTime;
    
    metrics.embeddingsGenerated++;
    metrics.totalGenerationTime += generationTime;
    metrics.averageGenerationTime = metrics.totalGenerationTime / metrics.embeddingsGenerated;
    
    // Emit embedding generated event
    eventBus.emit('embedding:generated', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      textLength: text.length,
      processingTime: generationTime,
      embeddingType: CONFIG.useTrueEmbeddings ? 'true' : 'hash'
    });
    
    return embedding;
  } catch (error) {
    logger.error(`Unexpected error in generateEmbedding: ${error.message}`);
    
    // Emit critical error event
    eventBus.emit('embedding:critical_error', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      error: error.message,
      textLength: text ? text.length : 0
    });
    
    // Return zero vector as last resort
    const dimensions = options.dimensions || 384;
    return new Array(dimensions).fill(0);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
  try {
    // Delegate to true embeddings implementation
    return trueEmbeddings.cosineSimilarity(vecA, vecB);
  } catch (error) {
    logger.error(`Error calculating cosine similarity: ${error.message}`);
    return 0; // Default to no similarity on error
  }
}

/**
 * Get metrics for the embedding service
 * @returns {Object} Metrics object
 */
function getMetrics() {
  return {
    ...metrics,
    timestamp: Date.now(),
    isInitialized,
    mode: CONFIG.useTrueEmbeddings ? 'true_semantic' : 'hash_based',
    config: {
      useTrueEmbeddings: CONFIG.useTrueEmbeddings,
      modelType: CONFIG.modelType,
      fallbackToHash: CONFIG.fallbackToHash,
      enableCache: CONFIG.enableCache
    }
  };
}

/**
 * Enable true semantic embeddings
 * @param {Object} options - Options for true embeddings
 * @returns {Promise<boolean>} Success status
 */
async function enableTrueEmbeddings(options = {}) {
  try {
    logger.info('Enabling true semantic embeddings');
    
    // Update configuration using standardized approach
    const configUpdate = {
      'embedding.useTrueEmbeddings': true
    };
    
    // Apply options
    if (options.modelType) {
      configUpdate['embedding.modelType'] = options.modelType;
    }
    
    if (options.cacheDir) {
      configUpdate['paths.cache'] = options.cacheDir;
    }
    
    // Update central configuration
    configService.updateConfig(configUpdate);
    
    // Reinitialize with new settings
    await initialize();
    
    // Emit mode change event
    eventBus.emit('embedding:mode:changed', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      mode: 'true_semantic',
      options: JSON.stringify(options)
    });
    
    logger.info('True semantic embeddings enabled successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to enable true semantic embeddings: ${error.message}`);
    
    // Emit error event
    eventBus.emit('embedding:mode:error', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      error: error.message
    });
    
    return false;
  }
}

/**
 * Disable true semantic embeddings (use hash-based)
 * @returns {Promise<boolean>} Success status
 */
async function disableTrueEmbeddings() {
  try {
    logger.info('Disabling true semantic embeddings, falling back to hash-based');
    
    // Update configuration using standardized approach
    configService.updateConfig({
      'embedding.useTrueEmbeddings': false
    });
    
    // Reinitialize with new settings
    await initialize();
    
    // Emit mode change event
    eventBus.emit('embedding:mode:changed', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      mode: 'hash_based'
    });
    
    return true;
  } catch (error) {
    logger.error(`Failed to disable true semantic embeddings: ${error.message}`);
    
    // Emit error event
    eventBus.emit('embedding:mode:error', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      error: error.message
    });
    
    return false;
  }
}

/**
 * Generate embedding with retry logic
 * @param {string} text - Text to generate embedding for
 * @param {Object} options - Options for embedding generation
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateEmbeddingWithRetry(text, options = {}) {
  const maxRetries = options.maxRetries || CONFIG.maxRetries;
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      return await generateEmbedding(text, options);
    } catch (error) {
      retries++;
      if (retries > maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      const delay = options.retryDelay || CONFIG.retryDelay;
      logger.warn(`Embedding generation failed, retrying (${retries}/${maxRetries}) after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Export public API with standardized naming
module.exports = {
  initialize,
  generateEmbedding,
  generateEmbeddingWithRetry,
  cosineSimilarity,
  getMetrics,
  enableTrueEmbeddings,
  disableTrueEmbeddings
};
