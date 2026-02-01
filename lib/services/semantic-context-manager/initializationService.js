/**
 * InitializationService - Handles initialization, config, and status for the semantic context manager.
 * All state is encapsulated and exposed via explicit API.
 *
 * Usage: require('./initializationService')
 */

const configService = require('./config-service');
const eventBus = require('../utils/event-bus');

let isInitialized = false;
let initializing = false;
let lastInitError = null;
let CONFIG = {};

function initializeConfig() {
  CONFIG = {
    similarityThreshold: configService.getConfig('contextManager.minSimilarityThreshold', 0.2),
    maxResults: configService.getConfig('contextManager.maxContextItems', 10),
    ENABLE_CORPUS_STATS: configService.getConfig('contextManager.enableCorpusStats', true),
    QUERY_CACHE_SIZE: configService.getConfig('contextManager.maxCacheItems', 1000),
    QUERY_CACHE_TTL: configService.getConfig('contextManager.cacheExpiration', 3600) * 1000,
    USE_SEMANTIC_CHUNKER: configService.getConfig('chunking.useSemanticChunker', true),
    MAX_CHUNK_SIZE: configService.getConfig('chunking.maxChunkSize', 1000),
    OVERLAP_SIZE: configService.getConfig('chunking.chunkOverlap', 50),
    EMBEDDING_DIMENSIONS: configService.getConfig('embedding.dimensions', 384)
    // ...add more config as needed
  };
}

function getConfig() {
  return { ...CONFIG };
}

function getStatus() {
  return {
    isInitialized,
    initializing,
    lastInitError,
    config: getConfig()
  };
}

async function initialize(options = {}) {
  if (isInitialized || initializing) return true;
  initializing = true;
  lastInitError = null;
  try {
    initializeConfig();
    // TODO: Add dependency initialization (embeddings, adapters, etc.)
    // Example: await embeddingsInterface.initialize()
    isInitialized = true;
    initializing = false;
    eventBus.emit('initialized', { component: 'semantic-context-manager', config: getConfig() });
    return true;
  } catch (err) {
    lastInitError = err;
    initializing = false;
    isInitialized = false;
    eventBus.emit('error', { component: 'semantic-context-manager', error: err.message });
    return false;
  }
}

function resetInitialization() {
  isInitialized = false;
  initializing = false;
  lastInitError = null;
}

module.exports = {
  initialize,
  getConfig,
  getStatus,
  isInitialized: () => isInitialized,
  resetInitialization
};
