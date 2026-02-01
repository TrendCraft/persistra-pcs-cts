/**
 * Leo MVL Initialization with Simplified Cross-Token Boundary
 * 
 * This module initializes the Minimally Viable Leo (MVL) environment
 * with the simplified cross-token boundary solution that replaces
 * the complex Session Boundary Manager.
 * 
 * @module lib/leo-mvl-init
 * @created June 2, 2025
 */

const path = require('path');
const { initializeMemoryGraph } = require('./services/memory-graph');
const { initializeLiveUpdater } = require('./services/live-updater');
const { initializeProcessManager } = require('./services/process-manager');
const { initializeCrossTokenBoundary } = require('./services/cross-token-boundary');

// Configuration
const DEFAULT_CONFIG = {
  memoryGraph: {
    dbPath: path.join(process.cwd(), 'data', 'memory-graph'),
    indexPath: path.join(process.cwd(), 'data', 'memory-graph-index')
  },
  cognitiveState: {
    statePath: path.join(process.cwd(), 'data', 'cognitive-state')
  },
  processManager: {
    lockFile: path.join(process.cwd(), 'data', '.leo-process-lock')
  }
};

/**
 * Initialize the Leo MVL environment
 * @param {Object} config Custom configuration options
 * @returns {Promise<Object>} Initialized MVL services
 */
async function initializeMVL(config = {}) {
  try {
    console.log('🧠 Initializing Leo MVL with simplified cross-token boundary...');
    
    // Merge custom config with defaults
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      memoryGraph: { ...DEFAULT_CONFIG.memoryGraph, ...config.memoryGraph },
      cognitiveState: { ...DEFAULT_CONFIG.cognitiveState, ...config.cognitiveState },
      processManager: { ...DEFAULT_CONFIG.processManager, ...config.processManager }
    };
    
    // Initialize process manager first to ensure singleton
    const processManager = await initializeProcessManager(mergedConfig.processManager);
    if (!processManager.isLocked()) {
      console.log('Another Leo MVL instance is already running. Exiting.');
      return null;
    }
    
    // Initialize memory graph
    const memoryGraph = await initializeMemoryGraph(mergedConfig.memoryGraph);
    
    // Initialize cross-token boundary functions
    const crossTokenBoundary = initializeCrossTokenBoundary({
      statePath: mergedConfig.cognitiveState.statePath
    });
    
    // Initialize live updater
    const liveUpdater = await initializeLiveUpdater({
      memoryGraph,
      crossTokenBoundary
    });
    
    // Register cleanup handler
    process.on('SIGINT', async () => {
      console.log('Leo MVL shutting down...');
      try {
        await processManager.release();
        console.log('Leo MVL shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    // Setup global functions for access
    global.searchMemoryGraph = memoryGraph.search;
    
    console.log('✅ Leo MVL initialized successfully');
    
    return {
      memoryGraph,
      liveUpdater,
      processManager,
      crossTokenBoundary
    };
  } catch (error) {
    console.error('Failed to initialize Leo MVL:', error);
    throw error;
  }
}

module.exports = {
  initializeMVL
};
