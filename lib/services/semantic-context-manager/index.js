// semantic-context-manager/index.js

// ==============================
// Legacy-named Exports (for compatibility)
// ==============================
const { initialize, getConfig } = require('./init');
const searchModule = require('./search'); // Contains SemanticContextSearch, searchContext, etc.
const { injectContext } = require('./inject');
// const { generateEnhancedPrompt } = require('./enhancedPrompt');
const { processFileWithSemanticChunker, processFilesWithSemanticChunker } = require('./chunker');
const cacheService = require('./cacheService');
const setCacheService = require('./cacheService').setCacheService;
const preserveContext = require('./boundaryService').preserveContext;
const restoreContext = require('./boundaryService').restoreContext;
const getBoundaryStatus = require('./boundaryService').getBoundaryStatus;
const getContextQualityMetrics = require('./metrics').getContextQualityMetrics;
const isInitialized = require('./status').isInitialized;
const getStatus = require('./status').getStatus;
const setEmbeddingsService = require('./embeddingsService').setEmbeddingsService;
const getEmbeddingsService = require('./embeddingsService').getEmbeddingsService;

// ==============================
// Modular Public API Exports
// ==============================

// Embeddings Service (Class)
const { EmbeddingsService } = require('./embeddingsService');

// Cache Service (Class)
const { CacheService } = require('./cacheService');

// Boundary Service (Class)
const BoundaryService = require('./boundaryService');

// Context Metrics (all compute*Score functions)
const {
  computeCoverageScore,
  computeRelevanceScore,
  computeRecencyScore,
  computeDiversityScore,
} = require('./contextMetrics');

// Prioritization Utilities
const { prioritizeContextElements } = require('./prioritization');

// Chunk Transform Utilities
const {
  inferChunkType,
  mapAndEnrichChunks,
  filterChunksByType,
  postProcessChunks,
} = require('./chunkTransform');

// ==============================
// Module Exports
// ==============================
module.exports = {
  // Legacy-named exports (for compatibility)
  initialize,
  getConfig,
  SemanticContextSearch: searchModule.SemanticContextSearch,
  searchContext: searchModule.searchContext,
  injectContext,
  processFileWithSemanticChunker,
  processFilesWithSemanticChunker,
  cacheService,
  setCacheService,
  preserveContext,
  restoreContext,
  getBoundaryStatus,
  getContextQualityMetrics,
  isInitialized,
  getStatus,
  setEmbeddingsService,
  getEmbeddingsService,

  // ==============================
  // Modular Public API Exports
  // ==============================

  // Embeddings Service
  EmbeddingsService,

  // Cache Service
  CacheService,

  // Boundary Service
  BoundaryService,

  // Context Metrics
  computeCoverageScore,
  computeRelevanceScore,
  computeRecencyScore,
  computeDiversityScore,

  // Prioritization Utilities
  prioritizeContextElements,

  // Chunk Transform Utilities
  inferChunkType,
  mapAndEnrichChunks,
  filterChunksByType,
  postProcessChunks,
};

// ==============================
// Boot Function for Top-Level Initialization
// ==============================
let _isInitialized = false;

async function boot(config) {
  try {
    await initialize(config);
    _isInitialized = true;
    console.log("[semantic-context-manager] Successfully initialized.");
    return true;
  } catch (err) {
    _isInitialized = false;
    console.error("[semantic-context-manager] Initialization FAILED:", err.stack || err);
    return false;
  }
}

function isInitializedTopLevel() {
  return _isInitialized;
}

module.exports.boot = boot;
module.exports.isInitializedTopLevel = isInitializedTopLevel;

// ==============================
// Module Exports
// ==============================
// ==============================
// Module Exports
// ==============================

