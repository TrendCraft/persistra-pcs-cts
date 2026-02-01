// Robust memory formatting and LLM-based snippet polishing
const { polishText } = require('../../../lib/services/claudeLLM');

/**
 * Format a memory object for natural-language display (with optional LLM polish)
 * @param {Object} memory - The memory object
 * @param {boolean} useLLM - Whether to use LLM-based polishing
 * @returns {Promise<string>} Polished, display-ready snippet
 */
async function formatMemoryForDisplay(memory, useLLM = false) {
  let snippet = '';
  // 1. Use summary if present
  if (memory.summary) {
    snippet = memory.summary;
  } else if (typeof memory.content === 'string') {
    snippet = memory.content;
  } else if (typeof memory.content === 'object' && memory.content !== null) {
    // If there's an inner content field that's a string, try to parse
    if (typeof memory.content.content === 'string') {
      try {
        const parsed = JSON.parse(memory.content.content);
        snippet = JSON.stringify(parsed, null, 2);
      } catch {
        snippet = memory.content.content;
      }
    } else {
      // Otherwise, join key fields for a rough summary
      snippet = Object.entries(memory.content)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(' | ');
    }
  }
  snippet = snippet || '[No displayable content]';

  // 2. Optionally polish with LLM
  if (useLLM) {
    try {
      snippet = await polishText(snippet);
    } catch (e) {
      // Fallback to raw snippet if LLM fails
    }
  }

  return snippet;
}

module.exports = { formatMemoryForDisplay };
