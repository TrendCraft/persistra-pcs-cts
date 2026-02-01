// search-engine.js
// Simplified bridge to local-semantic-search.js for Leo's memory graph access

const { createComponentLogger } = require('../utils/logger');
const { searchMemoryGraph } = require('../utils/local-semantic-search');

const logger = createComponentLogger('search-engine');

/**
 * Search Leo's memory graph for relevant semantic context
 * @param {string} query
 * @returns {Promise<string>} - Concatenated memory chunk content
 */
async function searchLeoMemoryGraph(query) {
  try {
    const results = await searchMemoryGraph(query);
    if (!results.success || !results.results.length) {
      logger.info('🔍 No relevant memory context found.');
      return '';
    }

    const context = results.results.map(r => r.content).join('\n\n---\n\n');
    logger.debug(`🧠 Memory context retrieved (${results.results.length} chunks).`);
    return context;
  } catch (err) {
    logger.error('Memory search failed:', err);
    return '';
  }
}

module.exports = {
  searchLeoMemoryGraph
};
