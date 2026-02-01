/**
 * Context search, retrieval, and extraction logic
 * @module contextRetrieval
 *
 * External dependencies (to be injected/refactored):
 * - logger
 * - eventBus
 * - embeddingsInterface
 * - CONFIG
 * - cache/queryCache
 * - embeddings, chunks, needsReload, etc.
 * - pathUtils
 * - generateQueryEmbedding
 * - analyzeQuery
 * - inferChunkType
 *
 * Only pure/stateless retrieval, filtering, and sorting logic is implemented here.
 */

/**
 * Pure function to filter, sort, and boost context search results.
 * Stateless: takes all data as arguments, does not access globals.
 * @param {Object[]} embeddings
 * @param {Object[]} chunks
 * @param {number[]} queryEmbedding
 * @param {Object} analysis - Output of analyzeQuery
 * @param {Object} options
 * @param {number} [options.similarityThreshold=0.15]
 * @param {number} [options.maxResults=15]
 * @param {Function} cosineSimilarity - Similarity function
 * @param {Function} inferChunkType - Chunk type inference
 * @returns {Object[]} Sorted and filtered results
 */
// migrated chunk helpers to chunkTransform.js
const { inferChunkType } = require('./chunkTransform');

function retrieveAndRankContext({
  embeddings,
  chunks,
  queryEmbedding,
  analysis,
  options = {},
  cosineSimilarity,
  inferChunkType
}) {
  // Defensive: Check that both embeddings and chunks are arrays
  if (!Array.isArray(embeddings) || !Array.isArray(chunks)) {
    throw new Error(`[contextRetrieval] embeddings and chunks must both be arrays. Got embeddings: ${typeof embeddings}, chunks: ${typeof chunks}`);
  }
  // Defensive: Check that all elements are objects
  const invalidChunkIndex = chunks.findIndex(c => typeof c !== 'object' || c === null);
  if (invalidChunkIndex !== -1) {
    throw new Error(`[contextRetrieval] chunks[${invalidChunkIndex}] is not an object: ${JSON.stringify(chunks[invalidChunkIndex])}`);
  }
  const invalidEmbeddingIndex = embeddings.findIndex(e => typeof e !== 'object' || e === null);
  if (invalidEmbeddingIndex !== -1) {
    throw new Error(`[contextRetrieval] embeddings[${invalidEmbeddingIndex}] is not an object: ${JSON.stringify(embeddings[invalidEmbeddingIndex])}`);
  }
  const similarityThreshold = options.similarityThreshold || 0.15;
  const maxResults = options.maxResults || 15;
  // Defensive: only iterate up to the minimum length of both arrays
  const minLen = Math.min(embeddings.length, chunks.length);
  if (typeof logger !== 'undefined') logger.info(`[DEBUG] [contextRetrieval] chunks.length: ${chunks.length}, embeddings.length: ${embeddings.length}, using minLen: ${minLen}`);
  console.log('[contextRetrieval] chunks typeof:', typeof chunks, 'isArray:', Array.isArray(chunks));
console.log('[contextRetrieval] chunks:', JSON.stringify(chunks));
console.log('[contextRetrieval] embeddings:', JSON.stringify(embeddings));
console.log('[contextRetrieval] First chunk:', JSON.stringify(chunks[0]));
console.log('[contextRetrieval] First embedding:', JSON.stringify(embeddings[0]));
let results = [];
try {
  results = Array.from({ length: minLen }).map((_, index) => {
    try {
    const item = embeddings[index];
    const chunk = chunks[index] || {};
    let similarity = 0;
    try {
      similarity = cosineSimilarity(
        queryEmbedding,
        item.embedding || item.vector
      );
    } catch (error) {
      similarity = 0;
    }
    let boostedSimilarity = similarity;
    const chunkType = inferChunkType(chunk);
    if (analysis.isCodeQuery && chunkType === 'code') {
      boostedSimilarity *= 1.3;
    } else if (analysis.isDocumentationQuery && chunkType === 'documentation') {
      boostedSimilarity *= 1.3;
    } else if (analysis.isStructuralQuery && chunk.path && chunk.path.includes(analysis.targetFile)) {
      boostedSimilarity *= 1.5;
    }
    return {
      id: chunk.chunk_id || chunk.id || `chunk_${index}`,
      path: chunk.file || chunk.path || item.file,
      content: chunk.content || chunk.text || item.content,
      text: chunk.text || chunk.content || item.text,
      similarity: boostedSimilarity,
      originalSimilarity: similarity,
      type: chunkType
    };
  } catch (err) {
    if (typeof logger !== 'undefined') {
      logger.error(`[contextRetrieval] Error mapping chunk at index ${index}: ${err.message}`);
      logger.error(`[contextRetrieval] chunk: ${JSON.stringify(chunks[index])}`);
      logger.error(`[contextRetrieval] embedding: ${JSON.stringify(embeddings[index])}`);
    }
    return null; // skip this entry
    }
  });
} catch (err) {
  console.error('[contextRetrieval] Global error during mapping:', err);
  results = [];
}
  results.sort((a, b) => b.similarity - a.similarity);

  // === DEBUG LOGGING: Embedding & Similarity Inspection ===
  try {
    console.log('[DEBUG] Query embedding:', Array.isArray(queryEmbedding) ? queryEmbedding.slice(0, 10) : queryEmbedding);
    console.log('[DEBUG] First chunk embedding:', Array.isArray(chunks) && chunks[0]?.embedding ? chunks[0].embedding.slice(0, 10) : chunks[0]?.embedding);
    console.log('[DEBUG] Embedding length (query):', Array.isArray(queryEmbedding) ? queryEmbedding.length : 'n/a');
    console.log('[DEBUG] Embedding length (chunk):', Array.isArray(chunks) && chunks[0]?.embedding ? chunks[0].embedding.length : 'n/a');
    const similarities = Array.isArray(results) ? results.map(r => r?.originalSimilarity ?? 0) : [];
    console.log('[DEBUG] Top similarities:', similarities.slice(0, 10));
    console.log('[DEBUG] Max similarity:', similarities.length > 0 ? Math.max(...similarities) : 'n/a');
    console.log('[DEBUG] Similarity threshold:', similarityThreshold);
  } catch (err) {
    console.warn('[DEBUG] Error printing similarity diagnostics:', err);
  }
  // === END DEBUG LOGGING ===

  const filteredResults = results.filter(item => item.similarity >= similarityThreshold);
  return filteredResults.slice(0, maxResults);
}

module.exports = {
  retrieveAndRankContext
};
