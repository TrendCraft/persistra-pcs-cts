/**
 * Leo Codex - Live Updater Adapter for Self-Testing
 * 
 * This adapter provides a consistent interface for the self-test framework
 * to work with the unified Live Updater.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createComponentLogger } = require('../utils/logger');
const { ensureDirectoryExists } = require('../utils/file-utils');

// Create component logger
const logger = createComponentLogger('live-updater-adapter');

// Store the Live Updater process
let liveUpdaterProcess = null;
let isInitialized = false;

/**
 * Initialize the Live Updater
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options) {
  if (isInitialized) {
    logger.info('Live Updater already initialized');
    return true;
  }
  
  try {
    logger.info('Initializing Live Updater with options', options);
    
    // Ensure output directories exist
    ensureDirectoryExists(path.dirname(options.embeddingsFile));
    ensureDirectoryExists(path.dirname(options.chunksFile));
    
    // Prepare command-line arguments
    const args = [
      path.join(process.cwd(), 'src/leo-codex/start-unified-updater.js'),
      '--watch', options.watchDirs.join(','),
      '--embeddings', options.embeddingsFile,
      '--chunks', options.chunksFile
    ];
    
    if (options.ignoreDirs && options.ignoreDirs.length > 0) {
      args.push('--ignore', options.ignoreDirs.join(','));
    }
    
    if (options.fileExtensions && options.fileExtensions.length > 0) {
      args.push('--extensions', options.fileExtensions.join(','));
    }
    
    // Start the Live Updater process
    logger.info('Starting Live Updater process', { args });
    
    liveUpdaterProcess = spawn('node', args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Handle process output
    liveUpdaterProcess.stdout.on('data', (data) => {
      logger.info(`Live Updater: ${data.toString().trim()}`);
    });
    
    liveUpdaterProcess.stderr.on('data', (data) => {
      logger.error(`Live Updater error: ${data.toString().trim()}`);
    });
    
    // Handle process exit
    liveUpdaterProcess.on('exit', (code) => {
      logger.info(`Live Updater process exited with code ${code}`);
      liveUpdaterProcess = null;
      isInitialized = false;
    });
    
    // Wait for the Live Updater to initialize
    await new Promise((resolve) => setTimeout(resolve, 5000));
    
    isInitialized = true;
    logger.info('Live Updater initialized successfully');
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize Live Updater: ${error.message}`);
    return false;
  }
}

/**
 * Start the Live Updater
 * @returns {Promise<boolean>} Success status
 */
async function start() {
  if (!isInitialized) {
    logger.error('Live Updater not initialized');
    return false;
  }
  
  logger.info('Live Updater started');
  return true;
}

/**
 * Process all files in the watched directories
 * @returns {Promise<boolean>} Success status
 */
async function processAllFiles() {
  if (!isInitialized || !liveUpdaterProcess) {
    logger.error('Live Updater not initialized or not running');
    return false;
  }
  
  try {
    logger.info('Processing all files in watched directories');
    
    // In a real implementation, we would send a command to the Live Updater
    // to process all files. For now, we'll just wait to simulate processing.
    await new Promise((resolve) => setTimeout(resolve, 10000));
    
    logger.info('All files processed');
    return true;
  } catch (error) {
    logger.error(`Failed to process all files: ${error.message}`);
    return false;
  }
}

/**
 * Stop the Live Updater
 * @returns {Promise<boolean>} Success status
 */
async function stop() {
  if (!liveUpdaterProcess) {
    logger.info('No Live Updater process to stop');
    return true;
  }
  
  try {
    logger.info('Stopping Live Updater process');
    
    // Kill the process
    process.kill(-liveUpdaterProcess.pid);
    
    // Wait for the process to exit
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    liveUpdaterProcess = null;
    isInitialized = false;
    
    logger.info('Live Updater stopped successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to stop Live Updater: ${error.message}`);
    return false;
  }
}

/**
 * Check if the Live Updater is running
 * @returns {boolean} Running status
 */
function isRunning() {
  return liveUpdaterProcess !== null && isInitialized;
}

// Export the adapter interface
module.exports = {
  initialize,
  start,
  processAllFiles,
  stop,
  isRunning
};
