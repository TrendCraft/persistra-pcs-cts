// leo_unified_runtime.js

const ollamaAdapter = require('../adapters/ollama-adapter');
const configService = require('./config-service');
const logger = require('../utils/logger').createComponentLogger('leo-runtime');
const memoryGraph = require('../services/memory-graph-integration');
const semanticEmbedder = require('../services/semantic-embeddings');
const readline = require('readline');

// Initialization flag
let isInitialized = false;

async function initializeLeoRuntime() {
  if (isInitialized) return;
  logger.info('🔁 Initializing Leo Unified Runtime...');

  try {
    await configService.initialize();
    logger.info('✅ Config service initialized.');

    const memoryInit = await memoryGraph.initialize();
    if (!memoryInit) throw new Error('Memory Graph failed to initialize');
    logger.info('✅ Memory graph initialized.');

    await semanticEmbedder.initialize();
    logger.info('✅ Semantic embedder initialized.');

    const ollamaReady = await ollamaAdapter.verifyModel();
    if (!ollamaReady) throw new Error('Ollama model not ready or not found');
    logger.info(`✅ Ollama model is ready: ${ollamaAdapter.getActiveModelName()}`);

    isInitialized = true;
    logger.info('🚀 Leo Unified Runtime initialization complete.');
  } catch (err) {
    logger.error(`❌ Failed to initialize Leo runtime: ${err.message}`);
    process.exit(1);
  }
}

async function runLeoPrompt(input) {
  if (!isInitialized) await initializeLeoRuntime();

  const contextResults = await semanticEmbedder.queryMemoryGraph(input);
  const contextChunks = contextResults.map(r => r.content);
  const fullContext = contextChunks.join('\n\n');

  const finalPrompt = fullContext
    ? `Context:\n\n${fullContext}\n\nUser: ${input}`
    : `User: ${input}`;

  const response = await ollamaAdapter.queryModel(finalPrompt);

  return {
    text: response,
    model: ollamaAdapter.getActiveModelName(),
    provider: 'ollama-local'
  };
}

if (require.main === module) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('🧠 Ask Leo: ', async (userInput) => {
    const result = await runLeoPrompt(userInput);
    console.log(`\n💬 Qwen's Response:\n`, result);
    rl.close();
  });
}

module.exports = {
  initializeLeoRuntime,
  runLeoPrompt
};
