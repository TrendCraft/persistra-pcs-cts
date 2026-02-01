/**
 * Start Leo Enhanced Runtime
 * 
 * This script starts the enhanced Leo runtime with improved JSONL file handling,
 * semantic search integration, and robust logging.
 */

const fs = require('fs');
const path = require('path');
const { LeoRuntime } = require('./leo_unified_runtime_v_4_enhanced');
const systemInitializer = require('./system-initializer');
const memoryGraphInitializer = require('../utils/memory-graph-initializer');
const logger = require('../utils/logger').createComponentLogger('start-leo');

// Log startup
logger.info('🚀 Starting Leo Enhanced Runtime...');

// Main startup function
async function startLeoEnhanced() {
  try {
    // Check if memory graph needs initialization
    const chunksPath = path.join(process.cwd(), 'data', 'chunks.jsonl');
    if (!fs.existsSync(chunksPath) || fs.statSync(chunksPath).size === 0) {
      logger.info('Memory graph not found or empty, initializing...');
      await memoryGraphInitializer.initializeMemoryGraph();
    }
    
    // Initialize the system
    await systemInitializer.initialize();
    
    // Create and start the runtime
    const runtime = new LeoRuntime();
    
    // Start interactive prompt
    logger.info('💬 Initializing interactive mode...');
    await runtime.startInteractivePrompt();
    
    logger.info('✅ Leo enhanced runtime started successfully');
  } catch (error) {
    logger.error(`❌ Failed to start Leo enhanced runtime: ${error.message}`);
    process.exit(1);
  }
}

// Start the enhanced runtime
startLeoEnhanced().catch(err => {
  logger.error(`❌ Unhandled error during startup: ${err.message}`);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  logger.info('👋 Shutting down Leo runtime...');
  process.exit(0);
});

// Log startup complete
logger.info('✅ Leo startup script loaded successfully');
