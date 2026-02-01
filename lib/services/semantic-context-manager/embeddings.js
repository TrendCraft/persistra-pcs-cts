// Embedding and vector utility logic

/**
 * TODO: Refactor dependencies on logger, embeddingsInterface, etc.
 * Copied from semantic-context-manager.js
 */
async function generateQueryEmbedding(query, { embeddingsService } = {}) {
  if (embeddingsService && typeof embeddingsService.generateQueryEmbedding === 'function') {
    return embeddingsService.generateQueryEmbedding(query);
  } else {
    // Fallback: simple hash-based embedding (for testing only)
    function generateFallbackEmbedding(text) {
      // Returns a deterministic pseudo-random vector for the text
      const arr = new Array(64).fill(0).map((_, i) => {
        let hash = 0;
        for (let j = 0; j < text.length; j++) hash = (hash * 31 + text.charCodeAt(j) + i) & 0xffffffff;
        return ((hash % 1000) / 1000.0) - 0.5;
      });
      return arr;
    }
    return {
      embedding: generateFallbackEmbedding(query),
      method: 'fallback-hash-embedding'
    };
  }
}

/**
 * Compute cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return (normA && normB) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

/**
 * Normalize a vector to unit length.
 * @param {number[]} v
 * @returns {number[]}
 */
function normalizeVector(v) {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm ? v.map(x => x / norm) : v;
}

module.exports = {
  generateQueryEmbedding,
  cosineSimilarity,
  normalizeVector
};
