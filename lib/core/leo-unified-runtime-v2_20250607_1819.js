// leo-unified-runtime-v2.js
// Local-only unified runtime using Qwen2.5-Coder 32B via Ollama
// Claude interface removed - this runtime is now fully sovereign and offline

const { initialize: initLocalLLM, promptLLM } = require('../interfaces/local-llm-interface');
const { loadMemoryGraph } = require('../memory/memory-loader');
const { searchLeoMemoryGraph } = require('../memory/search-engine');
const { createComponentLogger } = require('../utils/logger');

const logger = createComponentLogger('leo-unified-runtime');

let memoryGraph = null;

/**
 * Bootstraps Leo runtime
 */
async function initializeLeo() {
  logger.info('[LEO_RUNTIME_DEBUG] Entered initializeLeo()');
  logger.info('🧠 Initializing Leo with local LLM interface (Qwen2.5-Coder 32B)...');
  await initLocalLLM();

  logger.info('🧠 Loading persistent memory graph...');
  memoryGraph = await loadMemoryGraph();

  logger.info('✅ Leo runtime is initialized and ready.');
}

/**
 * Main prompt function - accepts user input and returns LLM output
 * @param {string} input
 * @returns {Promise<string>}
 */
async function runLeoPrompt(input) {
  logger.info('[LEO_RUNTIME_DEBUG] Entered runLeoPrompt()');
  if (!memoryGraph) {
    logger.warn('Memory graph not yet initialized. Loading now...');
    memoryGraph = await loadMemoryGraph();
  }

  // You can extend this to include memory graph summaries, context injection, etc.
  const contextInfo = await searchLeoMemoryGraph(input, memoryGraph);

  const composedPrompt = `${contextInfo ? contextInfo + '\n\n' : ''}${input}`;
  logger.debug('📝 Composed Prompt:
' + composedPrompt);

  const response = await promptLLM(composedPrompt);
  return response;
}

module.exports = {
  initializeLeo,
  runLeoPrompt,
};
