/**
 * Pure chunk transformation, type inference, and filtering helpers.
 * Stateless: no mutation of external/shared state.
 * @module chunkTransform
 */

/**
 * Infer chunk type from a chunk object.
 * @param {Object} chunk
 * @returns {string} type (e.g., 'code', 'doc', 'test', 'unknown')
 */
// DEPRECATED: Use robust inferChunkType from semantic-chunker.js
const { inferChunkType: robustInferChunkType } = require('../semantic-chunker');
function inferChunkType(chunk) {
  return robustInferChunkType(chunk);
}

/**
 * Map and enrich an array of chunks with inferred type and normalized content.
 * @param {Object[]} chunks
 * @returns {Object[]} mapped/enriched chunks
 */
function mapAndEnrichChunks(chunks) {
  return (chunks || []).map(chunk => ({
    ...chunk,
    type: inferChunkType(chunk),
    content: (chunk.content || chunk.text || '').trim()
  }));
}

/**
 * Filter chunks by type.
 * @param {Object[]} chunks
 * @param {string[]} allowedTypes
 * @returns {Object[]} filtered chunks
 */
function filterChunksByType(chunks, allowedTypes = []) {
  if (!Array.isArray(chunks) || allowedTypes.length === 0) return chunks || [];
  return chunks.filter(chunk => allowedTypes.includes(chunk.type || inferChunkType(chunk)));
}

/**
 * Post-process chunk array (deduplicate by content, sort by type).
 * @param {Object[]} chunks
 * @returns {Object[]} post-processed chunks
 */
function postProcessChunks(chunks) {
  const seen = new Set();
  const deduped = (chunks || []).filter(chunk => {
    const key = (chunk.content || chunk.text || '').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
}

module.exports = {
  inferChunkType,
  mapAndEnrichChunks,
  filterChunksByType,
  postProcessChunks
};
