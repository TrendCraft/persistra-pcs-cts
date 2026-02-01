/**
 * Semantic Context Manager Adapter (Modular)
 *
 * Standards-compliant adapter delegating to the modular semantic context manager.
 * Implements dependency injection, initialization, and direct delegation to modular API.
 *
 * ARCHITECTURAL INVARIANT: All context search calls must supply a merged, normalized chunks array
 * (loaded via lib/utils/loadAndMergeChunksEmbeddings.js) as options.chunks. Direct file reads or
 * fallback chunk loading are forbidden. This is enforced in all searchContext implementations.
 *
 * Replaces all legacy stub logic with modular API calls and proper DI.
 */

// Import modular semantic context manager API
const {
  initialize: modularInitialize,
  EmbeddingsService,
  CacheService,
  BoundaryService,
  setEmbeddingsService,
  setCacheService,
  SemanticContextSearch
} = require('../services/semantic-context-manager');

const { createComponentLogger } = require('../utils/logger');
const createEventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'semantic-context-manager-adapter';
let logger = null; // Will be set via DI or fallback
let eventBus = null;
let searchInstance = null;

// Adapter state
let isInitialized = false;

/**
 * Initialize the Semantic Context Manager Adapter and underlying modular services.
 * - Instantiates all services with DI (logger, eventBus, config)
 * - Injects services into the modular context manager
 * - Calls modular initialize
 * - Sets isInitialized to true
 */
async function initialize(options = {}) {
  if (!logger) logger = options.logger || createComponentLogger(COMPONENT_NAME);
  if (!eventBus) eventBus = options.eventBus || createEventBus;
  if (isInitialized) {
    logger.warn('Semantic context manager adapter already initialized');
    return true;
  }
  // === Dependency Injection Step ===
  // Strict DI: require trueSemanticEmbeddingsInterface to be provided
  if (!options.trueSemanticEmbeddingsInterface) {
    throw new Error('[semantic-context-manager-adapter] Missing trueSemanticEmbeddingsInterface: must be injected via options');
  }
  const embeddingsService = new EmbeddingsService({ logger, trueSemanticEmbeddingsInterface: options.trueSemanticEmbeddingsInterface, ...options.embeddings });
  const cacheService = new CacheService({ logger, eventBus, config: options.cacheConfig || {} });
  const boundaryService = new BoundaryService({ logger, eventBus });
  setEmbeddingsService(embeddingsService);
  setCacheService(cacheService);
  // (Optional) Inject boundaryService if modular API supports it
  // await boundaryService.initialize?.();

  // === Modular Manager Initialization ===
  await modularInitialize(options);

  // Instantiate the new DI-compliant search class
  searchInstance = new SemanticContextSearch({ logger, eventBus });
  isInitialized = true;
  logger.info('Semantic context manager adapter initialized (modular)');
  eventBus.emit('component:initialized', {
    component: COMPONENT_NAME,
    timestamp: Date.now(),
  });
  return true;
}

/**
 * Canonical context search (delegates to modular API).
 * All callers MUST supply a merged, normalized chunks array via options.chunks,
 * loaded using lib/utils/loadAndMergeChunksEmbeddings.js. Direct file reads or fallback loading are forbidden.
 * Throws if called without a valid chunks array.
 */
async function searchContext(query, options = {}) {
  // === FAILSAFE INVARIANT: Enforce canonical chunks loading ===
  if (!options.chunks || !Array.isArray(options.chunks) || options.chunks.length === 0) {
    throw new Error('[INVARIANT] searchContext called without merged chunks array. All code must use loadAndMergeChunksEmbeddings.');
  }
  if (!isInitialized) {
    throw new Error('Semantic context manager adapter not initialized');
  }
  // Ensure logger and eventBus are always passed via options
  const optsWithDI = { ...options, logger: options.logger || logger, eventBus: options.eventBus || eventBus };
  logger.debug(`Delegating searchContext to DI-compliant SemanticContextSearch for query: ${query}`);
  return searchInstance.searchContext(query, optsWithDI);
}

/**
 * Get diagnostics information
 * @returns {Object} - Diagnostics information
 */
function getDiagnostics() {
  return {
    component: COMPONENT_NAME,
    isInitialized,
    timestamp: Date.now()
  };
}

/**
 * Shutdown the Semantic Context Manager adapter
 */
async function shutdown() {
  try {
    logger.info('Shutting down semantic context manager adapter');
    
    isInitialized = false;
    logger.info('Semantic context manager adapter shut down successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error shutting down: ${error.message}`, { 
      stack: error.stack 
    });
    return false;
  }
}

// Export the adapter API with the standardized interface
module.exports = {
  initialize,
  searchContext,
  getDiagnostics,
  shutdown
};
