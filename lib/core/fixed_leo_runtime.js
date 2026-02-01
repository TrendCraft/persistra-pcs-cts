// fixed_leo_runtime.js (Final Simplified Version)

const configService = require('../config/config-service');
const ollamaAdapter = require('../adapters/ollama-adapter');
const memoryGraph = require('../services/memory-graph-integration');
const semanticEmbedder = require('../services/semantic-embeddings');
const readline = require('readline');
const eventBus = require('../utils/event-bus');

// Inlined simple logger to avoid module issues
const logger = {
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

async function initializeLeo() {
  try {
    logger.info('[LEO_INIT] Initializing configuration...');
    configService.initialize();

    logger.info('[LEO_INIT] Initializing Ollama shell...');
    await ollamaAdapter.initializeOllamaShell();

    logger.info('[LEO_INIT] Initializing memory graph...');
    await memoryGraph.initialize();

    logger.info('[LEO_INIT] Initializing semantic embedder...');
    await semanticEmbedder.initialize();

    logger.info('[LEO_INIT] ✅ Leo runtime is fully initialized. Ready for interaction.');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('🧠 Ask Leo: ');
    rl.prompt();
    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) return rl.prompt();

      const response = await ollamaAdapter.sendToLLM(input);
      console.log(response);
      rl.prompt();
    });
  } catch (err) {
    logger.error('[LEO_INIT_ERROR]', err);
  }
}

initializeLeo();
