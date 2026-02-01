// TSE Backend Initialization and Validation
const tseExports = require('../../../../leo/services/embeddings/true_semantic_embeddings.js');
const trueSemanticEmbeddings = require('../../../lib/services/true-semantic-embeddings.js'); // Canonical advanced embedding service

class TSEInitializer {
  constructor() {
    this.initialized = false;
    this.activeBackend = null;
    this.backendType = null;
    this.dimensions = null;
    this.logger = console;
  }

  /**
   * Force initialization of TSE backend with validation
   * @returns {Promise<Object>} Initialization result
   */
  async forceInitialize() {
    if (this.initialized) {
      return {
        success: true,
        backend: this.activeBackend,
        type: this.backendType,
        dimensions: this.dimensions
      };
    }

    this.logger.info('[TSEInitializer] Starting forced TSE backend initialization...');

    try {
      // === DYNAMIC DIMENSIONS BASED ON BACKEND ===
      const embeddingBackend = process.env.LEO_EMBEDDINGS_BACKEND || 'openai';
      const isCloudBackend = ['openai', 'azure', 'anthropic'].includes(embeddingBackend.toLowerCase());
      
      // Full dimensions for cloud transformers, local dimensions for local models
      const targetDimensions = isCloudBackend ? 1536 : 384;
      
      this.logger.info(`[TSEInitializer] Setting dimensions to ${targetDimensions}D for ${isCloudBackend ? 'cloud' : 'local'} backend (${embeddingBackend})`);
      
      // Set dimensions based on backend type
      trueSemanticEmbeddings.dimensions = targetDimensions;
      trueSemanticEmbeddings.initialized = false; // Force re-initialization
      
      // Force await TSE initialization with correct dimensions
      await trueSemanticEmbeddings.initialize();
      
      // Validate backend is properly initialized
      const testEmbedding = await trueSemanticEmbeddings.generate('test initialization');
      
      if (!testEmbedding || !Array.isArray(testEmbedding) || testEmbedding.length === 0) {
        throw new Error('TSE backend failed to generate valid test embedding');
      }

      // Set backend properties
      this.activeBackend = trueSemanticEmbeddings;
      this.backendType = 'TSE_TF_IDF';
      this.dimensions = testEmbedding.length;
      this.initialized = true;

      this.logger.info(`[TSEInitializer] ✅ TSE backend initialized successfully:`);
      this.logger.info(`  - Backend Type: ${this.backendType}`);
      this.logger.info(`  - Dimensions: ${this.dimensions}`);
      this.logger.info(`  - Test Embedding: [${testEmbedding.slice(0, 3).join(', ')}...]`);

      return {
        success: true,
        backend: this.activeBackend,
        type: this.backendType,
        dimensions: this.dimensions
      };

    } catch (error) {
      this.logger.error('[TSEInitializer] ❌ TSE backend initialization failed:', error.message);
      throw new Error(`TSE Backend Initialization Failed: ${error.message}`);
    }
  }

  /**
   * Validate embedding compatibility
   * @param {Array} storedEmbedding - Embedding from memory graph
   * @param {Array} queryEmbedding - New query embedding
   * @returns {Object} Compatibility result
   */
  validateEmbeddingCompatibility(storedEmbedding, queryEmbedding) {
    if (!this.initialized) {
      throw new Error('TSE backend not initialized - call forceInitialize() first');
    }

    const result = {
      compatible: false,
      storedDims: storedEmbedding?.length || 0,
      queryDims: queryEmbedding?.length || 0,
      backendDims: this.dimensions,
      issues: []
    };

    // Check if embeddings exist
    if (!storedEmbedding || !Array.isArray(storedEmbedding)) {
      result.issues.push('Stored embedding is null or not an array');
    }

    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      result.issues.push('Query embedding is null or not an array');
    }

    // Check dimension compatibility
    if (result.storedDims !== result.queryDims) {
      result.issues.push(`Dimension mismatch: stored=${result.storedDims}, query=${result.queryDims}`);
    }

    if (result.queryDims !== this.dimensions) {
      result.issues.push(`Backend dimension mismatch: query=${result.queryDims}, backend=${this.dimensions}`);
    }

    // Check for zero vectors
    if (storedEmbedding && storedEmbedding.every(v => v === 0)) {
      result.issues.push('Stored embedding is zero vector');
    }

    if (queryEmbedding && queryEmbedding.every(v => v === 0)) {
      result.issues.push('Query embedding is zero vector');
    }

    result.compatible = result.issues.length === 0;
    return result;
  }

  /**
   * Get backend status for debugging
   * @returns {Object} Backend status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      activeBackend: this.activeBackend ? 'Available' : 'Not Available',
      backendType: this.backendType,
      dimensions: this.dimensions,
      canGenerateEmbeddings: this.initialized && this.activeBackend,
      canCalculateSimilarity: this.initialized && this.activeBackend
    };
  }

  /**
   * Calculate similarity with validation
   * @param {Array} vecA - First vector
   * @param {Array} vecB - Second vector
   * @returns {number} Similarity score
   */
  calculateSimilarity(vecA, vecB) {
    if (!this.initialized) {
      throw new Error('TSE backend not initialized - call forceInitialize() first');
    }

    const compatibility = this.validateEmbeddingCompatibility(vecA, vecB);
    if (!compatibility.compatible) {
      throw new Error(`Embedding compatibility error: ${compatibility.issues.join(', ')}`);
    }

    return this.activeBackend.similarity(vecA, vecB);
  }
}

module.exports = new TSEInitializer();
