/**
 * String and text helper utilities
 * @module stringUtils
 * @todo Add more helpers as needed
 */

/**
 * Normalize text to lower case and trim whitespace.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return typeof text === 'string' ? text.trim().toLowerCase() : '';
}

/**
 * Token count (simple whitespace split)
 * @param {string} text
 * @returns {number}
 */
function countTokens(text) {
  return typeof text === 'string' ? text.trim().split(/\s+/).length : 0;
}

/**
 * Extract keywords from text (very basic, for demo)
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (typeof text !== 'string') return [];
  return text.match(/\b\w{4,}\b/g) || [];
}

module.exports = {
  normalizeText,
  countTokens,
  extractKeywords
};
