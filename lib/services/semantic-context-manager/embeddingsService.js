// NOTE: This service is strictly for Leo’s in-house True Semantic Embeddings; do not inject other providers.

/**
 * EmbeddingsService (Leo Only)
 * Handles all embedding logic using the in-house True Semantic Embeddings interface.
 * No external embedding providers are supported or accepted.
 *
 * @class
 * @param {Object} opts
 * @param {Object} opts.trueSemanticEmbeddingsInterface - Must provide `generate`, `similarity`, `normalize` methods.
 * @param {Object} opts.logger
 *
 * This service is built exclusively for the True Semantic Embeddings backend; no other embedding providers are supported or expected.
 */
// --- Leo EmbeddingsService with DI registration ---
let _embeddingsService = null;

class EmbeddingsService {
  constructor({ trueSemanticEmbeddingsInterface, logger }) {
    if (
      !trueSemanticEmbeddingsInterface ||
      typeof trueSemanticEmbeddingsInterface.generate !== 'function' ||
      typeof trueSemanticEmbeddingsInterface.similarity !== 'function' ||
      typeof trueSemanticEmbeddingsInterface.normalize !== 'function'
    ) {
      throw new Error('EmbeddingsService requires Leo True Semantic Embeddings interface');
    }
    this.embeddings = trueSemanticEmbeddingsInterface;
    this.logger = logger;
  }

  /**
   * Generate an embedding for the given text using Leo's True Semantic Embeddings backend.
   * @param {string} text
   * @returns {Promise<Object>} Embedding result
   */
  async generateQueryEmbedding(text) {
    this.logger?.info?.('[EmbeddingsService] Generating embedding for:', text);
    return this.embeddings.generate(text);
  }

  /**
   * Compute cosine similarity between two vectors using Leo's backend.
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number}
   */
  cosineSimilarity(a, b) {
    return this.embeddings.similarity(a, b);
  }

  /**
   * Normalize a vector to unit length using Leo's backend.
   * @param {number[]} v
   * @returns {number[]}
   */
  normalizeVector(v) {
    return this.embeddings.normalize(v);
  }
}

function setEmbeddingsService(service) {
  _embeddingsService = service;
}

function getEmbeddingsService() {
  return _embeddingsService;
}

module.exports = {
  EmbeddingsService,
  setEmbeddingsService,
  getEmbeddingsService,
};
