/**
 * Bulletproof Embeddings Factory - Singleton with Resilience
 * Provides unified embeddings interface for CLI and web with backoff, concurrency limits, and validation
 */

const pLimit = require('p-limit');
const { promisify } = require('util');

// Concurrency limit for embedding generation
const limit = pLimit(4);

// Expected embedding dimensions - dynamically determined by model
function getExpectedDim(model) {
  if (model && model.includes('384')) return 384;
  if (model && model.includes('768')) return 768;
  return 1536; // Default to OpenAI dimensions
}

const EXPECTED_DIM = getExpectedDim(process.env.EMBED_MODEL || 'openai-1536');

let singleton = null;

/**
 * Retry function with exponential backoff
 */
async function retry(fn, options = {}) {
  const { retries = 3, minTimeout = 300, factor = 2 } = options;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      
      const timeout = minTimeout * Math.pow(factor, attempt);
      console.log(`[EmbeddingsFactory] Retry ${attempt + 1}/${retries} after ${timeout}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, timeout));
    }
  }
}

/**
 * Safe embedding generation with concurrency limit and retry logic
 */
async function safeGenerate(emb, text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Invalid input for embedding generation: text must be a non-empty string');
  }

  return limit(() => retry(async () => {
    const vector = await emb.generate(text);
    
    // Dimension guard - fail early and loudly
    const expectedDim = getExpectedDim(process.env.EMBED_MODEL || 'openai-1536');
    if (!Array.isArray(vector) || vector.length !== expectedDim) {
      throw new Error(`Embedding dim ${vector?.length || 'undefined'} != expected ${expectedDim}`);
    }
    
    // Validate vector contains valid numbers
    if (vector.some(v => typeof v !== 'number' || !isFinite(v))) {
      throw new Error('Embedding contains invalid numbers');
    }
    
    return vector;
  }, { retries: 3, minTimeout: 300 }));
}

/**
 * Get singleton embeddings interface
 */
function getEmbeddingsInterface() {
  if (!singleton) {
    console.log('[EmbeddingsFactory] Creating singleton embeddings interface...');
    
    try {
      // Import TSE embeddings (it's a module with functions, not a class)
      const tseEmbeddings = require('/Users/stephenmansfield/Projects/Leo/lib/services/true-semantic-embeddings');
      
      const model = process.env.EMBED_MODEL || 'openai-1536';
      const expectedDim = getExpectedDim(model);
      
      const config = {
        model: model,
        dim: Number(process.env.EMBED_DIM || expectedDim),
        timeoutMs: 15000,
        apiKey: process.env.EMBED_API_KEY, // if remote
        localModelPath: process.env.EMBED_LOCAL_PATH // if local
      };
      
      // Sanity check: model and dim must match
      if (config.dim !== expectedDim) {
        throw new Error(`Model-dim mismatch: ${config.model} expects ${expectedDim}D but config.dim=${config.dim}`);
      }
      
      console.log('[EmbeddingsFactory] Config:', {
        model: config.model,
        dim: config.dim,
        timeoutMs: config.timeoutMs,
        hasApiKey: !!config.apiKey,
        hasLocalPath: !!config.localModelPath
      });
      
      // TSE is already initialized, just use it directly
      
      // Wrap with safe generation
      singleton = {
        generate: async (text) => safeGenerate(tseEmbeddings, text),
        
        // Add compatibility method for legacy callers
        generateEmbedding: async (text) => safeGenerate(tseEmbeddings, text),
        
        // Add required similarity and normalize methods
        similarity: tseEmbeddings.similarity,
        normalize: tseEmbeddings.normalize,
        
        // Batch generation with concurrency control
        generateBatch: async (texts) => {
          if (!Array.isArray(texts)) {
            throw new Error('generateBatch requires array of texts');
          }
          
          const results = await Promise.all(
            texts.map(text => safeGenerate(tseEmbeddings, text))
          );
          
          return results;
        },
        
        // Health check
        isHealthy: async () => {
          try {
            const testVector = await safeGenerate(tseEmbeddings, 'test embedding health');
            const expectedDim = getExpectedDim(config.model);
            return testVector.length === expectedDim;
          } catch (error) {
            console.error('[EmbeddingsFactory] Health check failed:', error.message);
            return false;
          }
        },
        
        // Get config info
        getConfig: () => ({ ...config, apiKey: config.apiKey ? '[REDACTED]' : undefined }),
        
        // Direct access to underlying instance (for compatibility)
        _instance: tseEmbeddings
      };
      
      console.log('[EmbeddingsFactory] ✅ Singleton embeddings interface created successfully');
      
    } catch (error) {
      console.error('[EmbeddingsFactory] ❌ Failed to create embeddings interface:', error.message);
      throw new Error(`Embeddings factory initialization failed: ${error.message}`);
    }
  }
  
  return singleton;
}

/**
 * Reset singleton (for testing)
 */
function resetSingleton() {
  singleton = null;
}

module.exports = {
  getEmbeddingsInterface,
  resetSingleton,
  getExpectedDim,
  safeGenerate,
  
  // Module-level compatibility method
  generateEmbedding: async (text) => {
    const interface = getEmbeddingsInterface();
    return await interface.generateEmbedding(text);
  }
};
