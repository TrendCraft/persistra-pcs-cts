/**
 * CSE Identity Selector
 * 
 * Selects the most relevant identity reinforcement cues for current context.
 * 
 * @created June 11, 2025
 * @phase CSE Phase 2
 */

const Logger = require('../../services/logger');
const logger = new Logger();
const memoryStore = require('./memory_store');
const salienceRanker = require('./salience_ranker');
const path = require('path');
const fs = require('fs').promises;
const KERNEL_PATH = path.join(__dirname, '../prompts/leo_kernel.txt');

// Pure exocortex approach - no hardcoded identity statements
const CORE_IDENTITY = [];

/**
 * Select identity components based on context
 * @param {Object} context - Current context (query, conversation history)
 * @returns {Promise<Array>} - Selected identity components
 */
async function selectIdentityComponents(context = {}) {
  try {
    // Load affirmations from memory store
    const affirmations = await memoryStore.loadRecentMemories({ 
      type: 'affirmation',
      limit: 20
    });
    // If no affirmations found, return core identity
    if (!affirmations.length) {
      logger.debug('No affirmations found, using core identity');
      return CORE_IDENTITY;
    }
    // Rank affirmations by salience
    const rankedAffirmations = salienceRanker.rankMemories(
      affirmations,
      { limit: 5 } // Top 5 affirmations
    );
    // Extract content from ranked affirmations
    const affirmationContent = rankedAffirmations.map(item => item.memory.content);
    // Combine with core identity
    const identityComponents = [...CORE_IDENTITY, ...affirmationContent];
    logger.debug(`Selected ${identityComponents.length} identity components`);
    return identityComponents;
  } catch (error) {
    logger.error(`Failed to select identity components: ${error.message}`);
    return CORE_IDENTITY;
  }
}

/**
 * Build identity prompt with selected components
 * @param {Object} context - Current context
 * @returns {Promise<string>} - Built identity prompt
 */
async function buildIdentityPrompt(context) {
  try {
    const components = await selectIdentityComponents(context);
    let kernelContent;
    try {
      kernelContent = await fs.readFile(KERNEL_PATH, 'utf-8');
    } catch (err) {
      logger.warn(`Failed to read kernel file: ${err.message}`);
      // REMOVED: Hardcoded identity injection - now uses emergent identity from memory graph
      // kernelContent = "I am Leo, a cognitive engine.";
      kernelContent = "Cognitive processing engine with emergent capabilities.";
    }
    // Only return the first atomic line (kernel or identity component)
    const firstLine = (kernelContent || '').split('\n')[0].trim();
    const firstComponent = (components && components.length > 0) ? components[0].trim() : '';
    // Prefer the first identity component if available, else fallback to kernel
    return firstComponent || firstLine;
  } catch (error) {
    logger.error(`Failed to build identity prompt: ${error.message}`);
    return CORE_IDENTITY[0];
  }
}

module.exports = {
  selectIdentityComponents,
  buildIdentityPrompt
};
