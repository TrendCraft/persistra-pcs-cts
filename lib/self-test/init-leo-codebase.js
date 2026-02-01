#!/usr/bin/env node

/**
 * Leo Codex Self-Test Initializer
 * 
 * This script initializes the unified Live Updater to process Leo's own codebase,
 * creating embeddings and chunks for self-testing.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const selfTestConfig = require('./self-test-config');
const config = require('../config/config');
const { ensureDirectoryExists } = require('../utils/file-utils');

// Create component logger
const logger = createComponentLogger('self-test-init');

// Try to import the Live Updater adapter
let liveUpdaterAdapter;
try {
  liveUpdaterAdapter = require('./live-updater-adapter');
} catch (error) {
  logger.error(`Could not load Live Updater adapter: ${error.message}`);
  process.exit(1);
}

/**
 * Initialize Leo's codebase for self-testing
 */
async function initLeoCasebase() {
  logger.info('Initializing Leo codebase for self-testing');
  
  // Create self-test data directory
  const selfTestDataDir = path.join(selfTestConfig.outputDirs.results, 'data');
  ensureDirectoryExists(selfTestDataDir);
  
  // Create self-test configuration for the Live Updater
  const liveUpdaterConfig = {
    // Watch Leo's own codebase
    watchDirs: selfTestConfig.watchDirs,
    
    // Ignore directories
    ignoreDirs: selfTestConfig.ignoreDirs,
    
    // File extensions to watch
    fileExtensions: selfTestConfig.fileExtensions,
    
    // Output files
    embeddingsFile: path.join(selfTestDataDir, 'embeddings.jsonl'),
    chunksFile: path.join(selfTestDataDir, 'chunks.jsonl'),
    
    // Logging
    logFile: path.join(selfTestConfig.outputDirs.results, 'live-updater.log'),
    logLevel: 'info',
    
    // Processing options
    batchSize: 10,
    maxConcurrent: 3,
    debounceMs: 1000
  };
  
  // Check if Leo is already running
  const pidFile = path.join(process.cwd(), '.leo', 'live-updater.pid');
  let isLeoRunning = false;
  
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      // Check if process is running (this is platform-specific)
      try {
        process.kill(pid, 0); // This throws an error if the process doesn't exist
        isLeoRunning = true;
        logger.info(`Leo is already running with PID ${pid}`);
      } catch (e) {
        // Process doesn't exist, remove stale PID file
        fs.unlinkSync(pidFile);
      }
    } catch (error) {
      logger.warn(`Failed to check if Leo is running: ${error.message}`);
    }
  }
  
  // If Leo is not running, start it using the leo-start.js script
  if (!isLeoRunning) {
    logger.info('Starting Leo using leo-start.js');
    
    try {
      // Use child_process.spawn to start leo-start.js in the background
      const { spawn } = require('child_process');
      const leoStartPath = path.join(process.cwd(), 'bin', 'leo-start.js');
      
      // Ensure the script is executable
      fs.chmodSync(leoStartPath, '755');
      
      // Spawn the process
      const leoProcess = spawn(leoStartPath, [
        '--dir', process.cwd(),
        '--verbose',
        '--no-api' // We don't need the API server for self-testing
      ], {
        detached: true, // Run in the background
        stdio: 'ignore' // Don't pipe stdio
      });
      
      // Unref the child process so it can run independently
      leoProcess.unref();
      
      logger.info(`Started Leo with PID ${leoProcess.pid}`);
      
      // Wait for Leo to initialize (this is a simple approach, could be improved)
      logger.info('Waiting for Leo to initialize...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      logger.error(`Failed to start Leo: ${error.message}`);
      throw error;
    }
  }
  
  // Initialize the Live Updater with Leo's codebase
  logger.info('Starting Live Updater with Leo codebase', {
    watchDirs: liveUpdaterConfig.watchDirs,
    embeddingsFile: liveUpdaterConfig.embeddingsFile
  });
  
  try {
    // Start the Live Updater
    await liveUpdaterAdapter.initialize(liveUpdaterConfig);
    await liveUpdaterAdapter.start();
    
    logger.info('Live Updater started successfully');
    
    // Process all files in Leo's codebase
    logger.info('Processing all files in Leo codebase...');
    await liveUpdaterAdapter.processAllFiles();
    
    logger.info('Initial processing complete');
    
    // Keep the Live Updater running for a while to process any remaining files
    logger.info('Waiting for all processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Stop the Live Updater
    await liveUpdaterAdapter.stop();
    
    logger.info('Live Updater stopped');
    logger.info('Leo codebase initialization complete');
    
    // Return the paths to the generated files
    return {
      embeddingsFile: liveUpdaterConfig.embeddingsFile,
      chunksFile: liveUpdaterConfig.chunksFile,
      logFile: liveUpdaterConfig.logFile
    };
  } catch (error) {
    logger.error(`Failed to initialize Leo codebase: ${error.message}`);
    
    // Try to stop the Live Updater if it was started
    try {
      await liveUpdaterAdapter.stop();
    } catch (stopError) {
      logger.error(`Failed to stop Live Updater: ${stopError.message}`);
    }
    
    throw error;
  }
}

// Run initialization if this script is executed directly
if (require.main === module) {
  initLeoCasebase()
    .then(result => {
      console.log('Leo codebase initialization complete');
      console.log(`Embeddings file: ${result.embeddingsFile}`);
      console.log(`Chunks file: ${result.chunksFile}`);
      console.log(`Log file: ${result.logFile}`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
} else {
  // Export for programmatic use
  module.exports = initLeoCasebase;
}
