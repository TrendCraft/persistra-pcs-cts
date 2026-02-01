/**
 * Embeddings Wrapper (Leo 2.0)
 * Delegates to TSE (True Semantic Embeddings) for production-quality embeddings.
 * 
 * This wrapper ensures leo2 code uses the same embeddings backend as the rest of the system,
 * preventing parallel backend logic and zero-vector fallbacks.
 */
const path = require('path');

/**
 * Embeddings (Leo 2.0)
 * Wrapper that delegates to TSE for all embedding operations.
 * Contract: async initialize(config), async generate(input), getDimensions()
 */
class Embeddings {
  constructor() {
    this.tse = null;
    this.initialized = false;
  }

  async initialize(config = {}) {
    this.config = config;
    
    // Load TSE (True Semantic Embeddings) - canonical interface
    const tsePath = path.resolve(__dirname, '../../../../lib/services/true-semantic-embeddings.js');
    this.tse = require(tsePath);
    
    // Initialize TSE if not already initialized
    if (!this.tse.isInitialized || !this.tse.isInitialized()) {
      await this.tse.initialize({
        config: {
          EMBEDDING_DIMENSIONS: config.dimensions || 1536,
          CACHE_DIR: config.cacheDir || './.leo_cache',
          CACHE_FILE: config.cacheFile || 'embeddings-cache.json'
        },
        requireHighQualityBackend: process.env.LEO_PILOT_MODE === 'true'
      });
    }
    
    this.initialized = true;
    
    const backendType = this.tse._getBackendType?.() || 'unknown';
    const backend = this.tse._getBackend?.();
    const dimensions = backend?.getDimension?.() || 'unknown';
    
    console.log(`[leo2/Embeddings] Delegating to TSE: backend=${backendType}, dim=${dimensions}D`);
    
    return true;
  }

  async generate(input) {
    if (!this.initialized) {
      throw new Error('Embeddings not initialized. Call initialize() first.');
    }
    
    // Delegate to TSE
    return await this.tse.generate(input);
  }

  getDimensions() {
    if (!this.initialized) {
      return 1536; // Default
    }
    
    const backend = this.tse._getBackend?.();
    return backend?.getDimension?.() || 1536;
  }
}

module.exports = Embeddings;
