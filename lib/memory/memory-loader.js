// memory-loader.js
// Bridge for loading Leo's memory graph from the conversation memory manager

const { createComponentLogger } = require('../utils/logger');
const { getFullMemoryGraph } = require('../services/conversation-memory-manager'); // Adjust if method name differs

const logger = createComponentLogger('memory-loader');

/**
 * Loads the full memory graph (conversations + code + narrative links)
 * @returns {Promise<Array>} Array of memory chunks (with embeddings)
 */
async function loadMemoryGraph() {
  try {
    logger.info('📚 Loading full memory graph via conversation-memory-manager...');
    const graph = await getFullMemoryGraph();
    logger.info(`✅ Loaded ${graph.length} memory nodes.`);
    return graph;
  } catch (err) {
    logger.error('❌ Failed to load memory graph:', err);
    return [];
  }
}

module.exports = {
  loadMemoryGraph
};
