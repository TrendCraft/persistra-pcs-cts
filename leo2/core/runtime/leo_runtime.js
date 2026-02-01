// Leo 2.0 Minimal Boot Pipeline (Hello World Integration)
const Embeddings = require('../memory/embeddings/embeddings');
const MemoryGraph = require('../memory/memoryGraph');
const IdentityManager = require('../identity/identity_manager');
const LLMClient = require('../../llm/qwen_adapter');
const ContextualSalienceEngine = require('../awareness/contextual_salience_engine');
const UnifiedAwareness = require('./unified_awareness');
const Logger = require('../../services/logger');
const InteractionMemory = require('../interactionMemory/interaction_memory');

(async () => {
  const logger = new Logger();
  logger.info('Leo 2.0 Booting...');

  const embeddings = new Embeddings();
  await embeddings.initialize({ model: 'stub', dimensions: 8 });
  logger.info('Embeddings initialized');

  const memoryGraph = new MemoryGraph({
    storagePath: process.env.LEO_MEMORY_PATH || './data/memory-graph.db'
  });
  await memoryGraph.initialize({ embeddings });
  await memoryGraph.storeMemory({ content: 'Hello World', type: 'fact' });
  await memoryGraph.storeMemory({ content: 'Leo is an AI.', type: 'fact' });
  logger.info('MemoryGraph initialized and prepopulated');

  const identity = new IdentityManager();
  await identity.load();
  logger.info('Identity loaded:', identity.getContext());

  const llm = new LLMClient();
  logger.info('LLMClient ready');

  const cse = new ContextualSalienceEngine();
  logger.info('ContextualSalienceEngine stub ready');

  const interactionMemory = new InteractionMemory();
  await interactionMemory.initialize();
  logger.info('InteractionMemory ready');

  const awareness = new UnifiedAwareness({ memoryGraph, llm, identity, logger });
  await awareness.initialize();

  // Minimal integration test
  const answer = await awareness.process('Who are you?');
  console.log('Leo says:', answer);

  // Save a minimal boot log
  logger.info('Leo 2.0 Minimal Boot Successful');
})();
