/**
 * Live Updater Adapter
 * 
 * This adapter provides a standardized interface for the Live Updater component.
 * It addresses the file detection issues identified in the Live Updater review
 * and implements the recommended configuration from the diagnostics tool.
 * 
 * The adapter follows Leo's architectural guidelines and standardization principles:
 * 1. Uses the event bus for component communication
 * 2. Implements proper error handling and logging
 * 3. Provides a consistent interface for file watching
 * 4. Integrates with the configuration service
 * 5. Uses path utilities for path normalization
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const pathUtils = require('../utils/path-utils');

// Component name for logging and events
const COMPONENT_NAME = 'live-updater-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// State variables
let isInitialized = false;
let watcher = null;
let watchDirs = [];
let ignorePatterns = [];
let fileExtensions = [];
let pendingChanges = [];
let processingChanges = false;
let cacheInvalidationCallback = null;
let healthCheckInterval = null;
let config = {};

/**
 * Initialize the Live Updater adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Success status
 */
async function initialize(options = {}) {
  try {
    // Prevent duplicate initialization
    if (isInitialized) {
      logger.warn('Live updater adapter already initialized');
      return true;
    }

    logger.info('Initializing live updater adapter');

    // Load configuration
    config = loadConfiguration(options);
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up file watcher
    await setupWatcher();
    
    // Set up health check
    setupHealthCheck();
    
    isInitialized = true;
    logger.info('Live updater adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('component:initialized', { 
      component: COMPONENT_NAME, 
      timestamp: Date.now() 
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization error: ${error.message}`, { 
      stack: error.stack 
    });
    return false;
  }
}

/**
 * Load configuration from config service and merge with options
 * @param {Object} options - Configuration options
 * @returns {Object} - Merged configuration
 */
function loadConfiguration(options = {}) {
  // Default configuration
  const defaultConfig = {
    // File watching
    WATCH_DIRS: [process.cwd()], // Watch the current working directory by default
    EXTENSIONS: ['.js', '.jsx', '.ts', '.tsx', '.md', '.json', '.html', '.css', '.scss', '.yaml', '.yml', '.txt', '.sh', '.rc', '.config'],
    IGNORE_PATTERNS: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/logs/**',
      '**/*.min.js',
      '**/*.bundle.js',
      '**/data/embeddings.jsonl',
      '**/data/chunks.jsonl',
      '**/data/cache/**',
      '**/coverage/**',
      '**/.nyc_output/**',
      '**/tmp/**',
      '**/temp/**'
    ],
    ADDITIONAL_WATCH_DIRS: [], // User can add more directories to watch
    ADDITIONAL_IGNORE_PATTERNS: [], // User can add more patterns to ignore
    ADDITIONAL_EXTENSIONS: [], // User can add more extensions to watch
    PRIORITY_DIRS: ['lib', 'src', 'bin', 'tests'], // Directories that should be processed with higher priority
    
    // Processing
    THROTTLE_MS: 100,
    BATCH_SIZE: 20,
    MAX_CONCURRENT_PROCESSING: 5,
    
    // Health check
    HEALTH_CHECK_INTERVAL: 60000, // 1 minute
    
    // Watcher configuration
    USE_POLLING: true,
    POLLING_INTERVAL: 100,
    BINARY_INTERVAL: 300,
    AWAIT_WRITE_FINISH: true,
    STABILITY_THRESHOLD: 100,
    POLL_INTERVAL: 30,
    ALWAYS_STAT: true
  };
  
  // Try to load configuration from config service
  let serviceConfig = {};
  try {
    const fullConfig = configService.getConfig();
    if (fullConfig && fullConfig.liveUpdater) {
      serviceConfig = fullConfig.liveUpdater;
    }
  } catch (error) {
    logger.warn(`Could not load configuration from config service: ${error.message}`);
  }
  
  // Merge configurations with precedence: options > serviceConfig > defaultConfig
  const mergedConfig = { ...defaultConfig, ...serviceConfig, ...options };
  
  // Process configuration
  watchDirs = [...mergedConfig.WATCH_DIRS];
  if (mergedConfig.ADDITIONAL_WATCH_DIRS && mergedConfig.ADDITIONAL_WATCH_DIRS.length > 0) {
    watchDirs.push(...mergedConfig.ADDITIONAL_WATCH_DIRS);
  }
  
  // Ensure all paths are absolute
  watchDirs = watchDirs.map(dir => pathUtils.absolute(dir));
  
  // Combine ignore patterns
  ignorePatterns = [...mergedConfig.IGNORE_PATTERNS];
  if (mergedConfig.ADDITIONAL_IGNORE_PATTERNS && mergedConfig.ADDITIONAL_IGNORE_PATTERNS.length > 0) {
    ignorePatterns.push(...mergedConfig.ADDITIONAL_IGNORE_PATTERNS);
  }
  
  // Combine file extensions
  fileExtensions = [...mergedConfig.EXTENSIONS];
  if (mergedConfig.ADDITIONAL_EXTENSIONS && mergedConfig.ADDITIONAL_EXTENSIONS.length > 0) {
    fileExtensions.push(...mergedConfig.ADDITIONAL_EXTENSIONS);
  }
  
  logger.info('Configuration loaded', { 
    watchDirs,
    ignorePatterns: ignorePatterns.length,
    fileExtensions: fileExtensions.length
  });
  
  return mergedConfig;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Listen for configuration updates
  eventBus.on('config:updated', handleConfigUpdated, COMPONENT_NAME);
  
  // Listen for cache invalidation events
  eventBus.on('cache:invalidated', handleCacheInvalidated, COMPONENT_NAME);
  
  // Listen for manual refresh requests
  eventBus.on('file:refresh', handleRefreshRequested, COMPONENT_NAME);
  
  // Listen for shutdown events
  eventBus.on('system:shutdown', shutdown, COMPONENT_NAME);
  
  logger.debug('Event listeners set up');
}

/**
 * Handle configuration updates
 * @param {Object} data - Event data
 */
function handleConfigUpdated(data) {
  try {
    logger.info('Configuration update received');
    
    // Only reload if it's relevant to this component
    if (data && data.component === COMPONENT_NAME) {
      // Reload configuration
      config = loadConfiguration(data.config || {});
      
      // Restart watcher if needed
      restartWatcher();
      
      logger.info('Configuration updated successfully');
    }
  } catch (error) {
    logger.error(`Error handling configuration update: ${error.message}`, { 
      stack: error.stack 
    });
  }
}

/**
 * Handle cache invalidation events
 * @param {Object} data - Event data
 */
function handleCacheInvalidated(data) {
  try {
    if (data && data.filePath) {
      logger.debug(`Cache invalidation received for: ${data.filePath}`);
      
      // Call cache invalidation callback if set
      if (cacheInvalidationCallback && typeof cacheInvalidationCallback === 'function') {
        cacheInvalidationCallback(data.filePath);
      }
    }
  } catch (error) {
    logger.error(`Error handling cache invalidation: ${error.message}`, { 
      stack: error.stack 
    });
  }
}

/**
 * Handle manual refresh requests
 * @param {Object} data - Event data
 */
function handleRefreshRequested(data) {
  try {
    logger.info('Manual refresh requested', data);
    
    if (data && data.filePath) {
      // Refresh specific file
      handleFileChange(data.filePath, 'change');
    } else {
      // Refresh all watched directories
      restartWatcher();
    }
  } catch (error) {
    logger.error(`Error handling refresh request: ${error.message}`, { 
      stack: error.stack 
    });
  }
}

/**
 * Set up file watcher with optimal configuration
 */
async function setupWatcher() {
  try {
    // Close existing watcher if any
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    
    logger.info('Setting up file watcher', { 
      watchDirs, 
      extensions: fileExtensions.length,
      ignorePatterns: ignorePatterns.length
    });
    
    // Create watcher configuration based on diagnostic results
    const watcherConfig = {
      ignored: [
        // Function to check if a path should be ignored
        (filePath) => {
          // Check against ignore patterns
          for (const pattern of ignorePatterns) {
            if (minimatch(filePath, pattern)) {
              logger.debug(`Ignoring file matching pattern: ${filePath} (${pattern})`);
              return true;
            }
          }
          
          // Check file extension if it's a file (not a directory)
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              const ext = path.extname(filePath).toLowerCase();
              if (!fileExtensions.includes(ext)) {
                logger.debug(`Ignoring file with unsupported extension: ${filePath} (${ext})`);
                return true;
              }
            }
            return false;
          } catch (error) {
            // If we can't stat the file, assume it's not ignored
            logger.debug(`Error checking file stats: ${filePath}`, { error: error.message });
            return false;
          }
        }
      ],
      persistent: true,
      ignoreInitial: false, // Process existing files on startup
      usePolling: config.USE_POLLING,
      interval: config.POLLING_INTERVAL,
      binaryInterval: config.BINARY_INTERVAL,
      alwaysStat: config.ALWAYS_STAT,
      followSymlinks: false,
      disableGlobbing: false
    };
    
    // Add awaitWriteFinish if enabled
    if (config.AWAIT_WRITE_FINISH) {
      watcherConfig.awaitWriteFinish = {
        stabilityThreshold: config.STABILITY_THRESHOLD,
        pollInterval: config.POLL_INTERVAL
      };
    }
    
    // Create watcher
    watcher = chokidar.watch(watchDirs, watcherConfig);
    
    // Set up event handlers
    watcher
      .on('add', (filePath) => {
        logger.info(`File added: ${filePath}`);
        handleFileChange(filePath, 'add');
        // Emit event
        eventBus.emit('file:added', { 
          filePath, 
          timestamp: Date.now() 
        });
      })
      .on('change', (filePath) => {
        logger.info(`File changed: ${filePath}`);
        handleFileChange(filePath, 'change');
        // Emit event
        eventBus.emit('file:changed', { 
          filePath, 
          timestamp: Date.now() 
        });
      })
      .on('unlink', (filePath) => {
        logger.info(`File deleted: ${filePath}`);
        handleFileChange(filePath, 'unlink');
        // Emit event
        eventBus.emit('file:deleted', { 
          filePath, 
          timestamp: Date.now() 
        });
      })
      .on('error', (error) => {
        logger.error(`Watcher error: ${error.message}`, { 
          stack: error.stack 
        });
      })
      .on('ready', () => {
        logger.info('Initial scan complete, watching for changes');
        // Process pending changes
        processChanges();
      });
    
    logger.info('File watcher set up successfully');
    return true;
  } catch (error) {
    logger.error(`Error setting up watcher: ${error.message}`, { 
      stack: error.stack 
    });
    return false;
  }
}

/**
 * Restart the file watcher
 */
async function restartWatcher() {
  try {
    logger.info('Restarting file watcher');
    await setupWatcher();
    return true;
  } catch (error) {
    logger.error(`Error restarting watcher: ${error.message}`, { 
      stack: error.stack 
    });
    return false;
  }
}

/**
 * Handle file change events
 * @param {string} filePath - Path to the changed file
 * @param {string} eventType - Type of event (add, change, unlink)
 */
function handleFileChange(filePath, eventType) {
  try {
    // Normalize path
    const normalizedPath = pathUtils.normalize(filePath);
    
    // Add to pending changes with priority
    const priority = determinePriority(normalizedPath, eventType);
    pendingChanges.push({
      filePath: normalizedPath,
      eventType,
      priority,
      timestamp: Date.now()
    });
    
    // Throttle processing
    throttleProcessChanges();
  } catch (error) {
    logger.error(`Error handling file change: ${error.message}`, { 
      stack: error.stack,
      filePath,
      eventType
    });
  }
}

/**
 * Determine priority of a file based on its type and location
 * @param {string} filePath - Path to the file
 * @param {string} eventType - Type of event (add, change, unlink)
 * @returns {number} - Priority value (higher = more important)
 */
function determinePriority(filePath, eventType) {
  try {
    // Base priority by event type
    let priority = 1;
    
    // Higher priority for new files
    if (eventType === 'add') {
      priority += 1;
    }
    
    // Higher priority for priority directories
    for (const dir of config.PRIORITY_DIRS) {
      if (filePath.includes(`/${dir}/`)) {
        priority += 2;
        break;
      }
    }
    
    // Higher priority for certain file types
    const ext = path.extname(filePath).toLowerCase();
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      priority += 2; // Code files
    } else if (['.md', '.txt'].includes(ext)) {
      priority += 1; // Documentation
    }
    
    return priority;
  } catch (error) {
    logger.error(`Error determining priority: ${error.message}`, { 
      stack: error.stack,
      filePath,
      eventType
    });
    return 1; // Default priority
  }
}

/**
 * Throttle processing of changes
 */
const throttleProcessChanges = (() => {
  let timeout = null;
  return () => {
    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        processChanges();
      }, config.THROTTLE_MS);
    }
  };
})();

/**
 * Process pending changes
 */
async function processChanges() {
  // If already processing or no pending changes, return
  if (processingChanges || pendingChanges.length === 0) {
    return;
  }
  
  try {
    processingChanges = true;
    
    // Sort by priority (higher first)
    pendingChanges.sort((a, b) => b.priority - a.priority);
    
    // Take a batch of changes
    const batch = pendingChanges.splice(0, config.BATCH_SIZE);
    
    logger.info(`Processing ${batch.length} file changes`);
    
    // Process each change
    const promises = batch.map(processChange);
    await Promise.all(promises);
    
    // If more changes, continue processing
    if (pendingChanges.length > 0) {
      setTimeout(processChanges, 0);
    }
  } catch (error) {
    logger.error(`Error processing changes: ${error.message}`, { 
      stack: error.stack 
    });
  } finally {
    processingChanges = false;
  }
}

/**
 * Process a single change
 * @param {Object} change - Change object
 * @returns {Promise<boolean>} - Success status
 */
async function processChange(change) {
  try {
    const { filePath, eventType } = change;
    
    // Skip if file doesn't exist and it's not a delete event
    if (eventType !== 'unlink' && !await pathUtils.exists(filePath)) {
      logger.debug(`Skipping non-existent file: ${filePath}`);
      return false;
    }
    
    // Process based on event type
    if (eventType === 'add' || eventType === 'change') {
      // Emit detailed event
      eventBus.emit('file:processed', {
        filePath,
        eventType,
        timestamp: Date.now()
      });
      
      return true;
    } else if (eventType === 'unlink') {
      // Handle file deletion
      // Emit detailed event
      eventBus.emit('file:processed', {
        filePath,
        eventType,
        timestamp: Date.now()
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Error processing change: ${error.message}`, { 
      stack: error.stack,
      change
    });
    return false;
  }
}

/**
 * Set up health check interval
 */
function setupHealthCheck() {
  // Clear existing interval if any
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  // Set up new interval
  healthCheckInterval = setInterval(() => {
    performHealthCheck();
  }, config.HEALTH_CHECK_INTERVAL);
  
  logger.debug('Health check interval set up');
}

/**
 * Perform health check
 */
async function performHealthCheck() {
  try {
    logger.debug('Performing health check');
    
    // Check if watcher is still active
    if (!watcher) {
      logger.warn('Watcher not found, restarting');
      await setupWatcher();
      return;
    }
    
    // Check for stuck processing
    if (processingChanges && pendingChanges.length > 0) {
      const oldestChange = pendingChanges[0];
      const now = Date.now();
      const age = now - oldestChange.timestamp;
      
      // If processing is stuck for more than 5 minutes, restart
      if (age > 300000) {
        logger.warn('Processing appears stuck, restarting', { 
          age,
          pendingChanges: pendingChanges.length
        });
        
        processingChanges = false;
        await restartWatcher();
      }
    }
    
    // Emit health status
    eventBus.emit('component:health', {
      component: COMPONENT_NAME,
      status: 'healthy',
      pendingChanges: pendingChanges.length,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`, { 
      stack: error.stack 
    });
    
    // Emit health status
    eventBus.emit('component:health', {
      component: COMPONENT_NAME,
      status: 'error',
      error: error.message,
      timestamp: Date.now()
    });
  }
}

/**
 * Set cache invalidation callback
 * @param {Function} callback - Function to call when invalidating cache
 */
function setCacheInvalidationCallback(callback) {
  if (typeof callback === 'function') {
    cacheInvalidationCallback = callback;
    logger.debug('Cache invalidation callback set');
    return true;
  }
  
  logger.warn('Invalid cache invalidation callback');
  return false;
}

/**
 * Invalidate cache for a specific file
 * @param {string} filePath - Path to the file
 */
function invalidateCache(filePath) {
  try {
    logger.debug(`Invalidating cache for: ${filePath}`);
    
    // Emit cache invalidation event
    eventBus.emit('cache:invalidated', {
      source: COMPONENT_NAME,
      filePath,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Error invalidating cache: ${error.message}`, { 
      stack: error.stack,
      filePath
    });
    return false;
  }
}

/**
 * Get diagnostics information
 * @returns {Object} - Diagnostics information
 */
function getDiagnostics() {
  return {
    component: COMPONENT_NAME,
    isInitialized,
    watchDirs,
    fileExtensions: fileExtensions.length,
    ignorePatterns: ignorePatterns.length,
    pendingChanges: pendingChanges.length,
    processingChanges,
    usePolling: config.USE_POLLING,
    awaitWriteFinish: config.AWAIT_WRITE_FINISH,
    timestamp: Date.now()
  };
}

/**
 * Shutdown the Live Updater adapter
 */
async function shutdown() {
  try {
    logger.info('Shutting down live updater adapter');
    
    // Clear health check interval
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    
    // Close watcher
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    
    // Remove event listeners
    eventBus.off('config:updated', COMPONENT_NAME);
    eventBus.off('cache:invalidated', COMPONENT_NAME);
    eventBus.off('file:refresh', COMPONENT_NAME);
    eventBus.off('system:shutdown', COMPONENT_NAME);
    
    isInitialized = false;
    logger.info('Live updater adapter shut down successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error shutting down: ${error.message}`, { 
      stack: error.stack 
    });
    return false;
  }
}

/**
 * Helper function for minimatch-like pattern matching
 * @param {string} filePath - Path to check
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} - Whether the path matches the pattern
 */
function minimatch(filePath, pattern) {
  // Simple glob pattern matching
  // Convert glob pattern to regex
  const regex = new RegExp(
    `^${pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')}$`
  );
  
  return regex.test(filePath);
}

// Export the adapter API with the standardized interface
module.exports = {
  initialize,
  setupWatcher,
  restartWatcher,
  handleFileChange,
  processChanges,
  invalidateCache,
  setCacheInvalidationCallback,
  getDiagnostics,
  shutdown
};
