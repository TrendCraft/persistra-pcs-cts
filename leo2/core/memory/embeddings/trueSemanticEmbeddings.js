// DEPRECATED: Use '../../../lib/services/true-semantic-embeddings.js' instead.
throw new Error("DEPRECATED: Use '../../../lib/services/true-semantic-embeddings.js' instead of leo2/core/memory/embeddings/trueSemanticEmbeddings.js");

const legacyEmbeddingsRaw = require('../../../../leo/services/embeddings/true_semantic_embeddings.js');

function getLegacyInstance() {
  // The legacy module exports an object with both class and instance
  if (legacyEmbeddingsRaw && legacyEmbeddingsRaw.trueSemanticEmbeddings) {
    return legacyEmbeddingsRaw.trueSemanticEmbeddings;
  }
  // If legacy module exports a class, instantiate it
  if (typeof legacyEmbeddingsRaw === 'function') return new legacyEmbeddingsRaw();
  // If it's already an object, use as is
  return legacyEmbeddingsRaw;
}

const legacyEmbeddings = getLegacyInstance();

class TrueSemanticEmbeddings {
  constructor() {
    this.logger = console;
  }

  async initialize() {
    if (typeof legacyEmbeddings.initialize === 'function') {
      try {
        await legacyEmbeddings.initialize();
        console.log('[SemanticEmbeddings] Initialized legacy embeddings.');
      } catch (e) {
        console.error('[SemanticEmbeddings] Legacy initialize() failed:', e);
      }
    }
    // Set dimensions if not already set
    if (!this.dimensions) {
      // === DYNAMIC DIMENSIONS BASED ON BACKEND ===
      const embeddingBackend = process.env.LEO_EMBEDDINGS_BACKEND || 'openai';
      const isCloudBackend = ['openai', 'azure', 'anthropic'].includes(embeddingBackend.toLowerCase());
      
      // Full dimensions for cloud transformers, local dimensions for local models
      const defaultDimensions = isCloudBackend ? 1536 : 384;
      this.dimensions = process.env.LEO_EMBEDDING_DIMENSIONS || defaultDimensions;
      
      this.logger.info(`Set embedding dimensions to ${this.dimensions} (${isCloudBackend ? 'Cloud Backend' : 'Local Backend'} - ${embeddingBackend})`);
    }
  }
  async generate(text) {
    if (typeof legacyEmbeddings.generate === 'function') {
      return await legacyEmbeddings.generate(text);
    }
    if (typeof legacyEmbeddings.embed === 'function') {
      return await legacyEmbeddings.embed(text);
    }
    throw new Error('Legacy embeddings has no generate() or embed() method!');
  }
  similarity(vecA, vecB) {
    // Direct cosine similarity implementation
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      throw new Error('Vectors must be arrays');
    }
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0; // Handle zero vectors
    }
    
    return dotProduct / (normA * normB);
  }
  
  normalize(vector) {
    // Simple L2 normalization
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude === 0 ? vector : vector.map(val => val / magnitude);
  }
}

module.exports = new TrueSemanticEmbeddings();
