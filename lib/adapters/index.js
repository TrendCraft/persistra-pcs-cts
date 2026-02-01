/**
 * Leo Adapters Index
 * 
 * This file exports all adapter modules to provide a centralized way to access
 * standardized interfaces for Leo components. These adapters are part of the
 * MVL-Driven Interface Standardization approach, addressing interface mismatches
 * between expected interfaces and actual implementations.
 * 
 * IMPORTANT: This module follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const semanticChunkerAdapter = require('./semantic-chunker-adapter');
const trueSemanticEmbeddingsAdapter = require('./true-semantic-embeddings-adapter');
const semanticContextManagerAdapter = require('./semantic-context-manager-adapter');
const pathUtilsAdapter = require('./path-utils-adapter');
const liveUpdaterBridgeAdapter = require('./live-updater-bridge-adapter');
const liveUpdaterAdapter = require('./live-updater-adapter');

// Export all adapters
module.exports = {
  semanticChunker: semanticChunkerAdapter,
  trueSemanticEmbeddings: trueSemanticEmbeddingsAdapter,
  semanticContextManager: semanticContextManagerAdapter,
  pathUtils: pathUtilsAdapter,
  liveUpdaterBridge: liveUpdaterBridgeAdapter,
  liveUpdater: liveUpdaterAdapter
};
