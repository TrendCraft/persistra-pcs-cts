/**
 * Content ID Generation Utilities
 * 
 * Provides deterministic content_id generation using sha256(normalize(text) + source_uri + version_tag)
 * to ensure chunks and embeddings always match across stores.
 */

const crypto = require('crypto');

/**
 * Normalize text content for consistent ID generation
 * @param {string} text - Raw text content
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')  // Canonicalize whitespace
    .replace(/[^\w\s\-_.]/g, '')  // Remove special chars except basic punctuation
    .trim();
}

/**
 * Generate deterministic content ID
 * @param {string} text - Text content
 * @param {string} sourceUri - Source URI (e.g., "persistra://notes/2025/09/htlogical.pdf#p=3")
 * @param {string} versionTag - Version tag (e.g., "v1")
 * @returns {string} SHA256 hash as content_id
 */
function generateContentId(text, sourceUri = '', versionTag = 'v1') {
  const normalizedText = normalizeText(text);
  const composite = normalizedText + sourceUri + versionTag;
  
  return crypto
    .createHash('sha256')
    .update(composite, 'utf8')
    .digest('hex');
}

/**
 * Create standardized chunk object with deterministic ID
 * @param {Object} params - Chunk parameters
 * @param {string} params.text - Text content
 * @param {string} params.sourceUri - Source URI
 * @param {string} params.versionTag - Version tag
 * @param {string} params.type - Content type (paper|note|chat|code)
 * @param {Object} params.metadata - Additional metadata
 * @returns {Object} Standardized chunk object
 */
function createChunk({ text, sourceUri = '', versionTag = 'v1', type = 'note', metadata = {} }) {
  const contentId = generateContentId(text, sourceUri, versionTag);
  
  return {
    content_id: contentId,
    source_uri: sourceUri,
    version_tag: versionTag,
    type: type,
    created_at: new Date().toISOString(),
    text: text,
    // Legacy compatibility fields
    id: contentId,
    content: text,
    title: metadata.title || '',
    metadata: {
      ...metadata,
      salience: metadata.salience || 0.5
    }
  };
}

/**
 * Create standardized embedding object
 * @param {string} contentId - Content ID from chunk
 * @param {Array} embedding - Embedding vector
 * @param {string} model - Model name (e.g., "tse:mini-2025-09")
 * @param {number} dim - Vector dimension
 * @returns {Object} Standardized embedding object
 */
function createEmbedding(contentId, embedding, model = 'tse-384', dim = 1536) {
  return {
    content_id: contentId,
    model: model,
    dim: dim,
    embedding: embedding,
    created_at: new Date().toISOString(),
    // Legacy compatibility fields
    id: contentId,
    vector: embedding
  };
}

module.exports = {
  normalizeText,
  generateContentId,
  createChunk,
  createEmbedding
};
