/**
 * Extract plain text from Claude Messages API response
 * @param {Object} resp - Claude API response
 * @returns {string} Extracted text content
 */
function extractClaudeText(resp) {
  // Claude Messages API returns { content: [{type:'text', text:'...'}, ...] }
  const parts = Array.isArray(resp?.content) ? resp.content : [];
  const text = parts
    .map(p => (p?.type === 'text' && typeof p.text === 'string') ? p.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
  return text;
}

module.exports = { extractClaudeText };
