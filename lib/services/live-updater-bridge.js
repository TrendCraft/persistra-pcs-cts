/**
 * Live Updater Bridge
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This module bridges the gap between the robust unified Live Updater in src/leo-codex
 * and the main Leo application, ensuring proper file change detection and processing.
 *
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const path = require('path');
const configService = require('../config/config');
const pathUtils = require('../utils/path-utils');
const eventBus = require('../utils/event-bus');
const semanticChunker = require('../adapters/semantic-chunker-adapter');
const semanticContextManager = require('./semantic-context-manager');

// Component name for event and config subscriptions
const COMPONENT_NAME = 'live-updater-bridge';

// Logger and embeddingsInterface will be set via DI
let logger = null;
let embeddingsInterface = null; // Set via initialize

// Configuration object
let CONFIG = {};

// Module state
let isInitialized = false;
let isRunning = false;
let liveUpdater = null;
let startTime = 0;
let fileChangeTimestamps = new Map();
let isUnifiedLiveUpdaterAvailable = false;
let debounceTimer = null;

// Import the unified Live Updater
try {
  liveUpdater = require('../../src/leo-codex/services/unified-live-updater');
} catch (error) {
  logger.error(`Failed to import unified Live Updater: ${error.message}`);
  liveUpdater = null;
}

// Metrics
const metrics = {
  status: 'stopped',
  isRunning: false,
  fileChangeCount: 0,
  lastUpdated: null,
  startTime: null,
  cacheStats: {
    size: 0,
    hits: 0,
    misses: 0
  },
  performance: {
    averageUpdateLatency: 0,
    lastUpdateDuration: 0
  }
};

// Cache invalidation tracking
let healthCheckInterval;

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  CONFIG = {
    // Project settings
    projectRoot: configService.getValue('paths.projectRoot', process.cwd()),
    
    // File watching settings
    watchInterval: configService.getValue('liveUpdater.watchInterval', 1000),
    watchEntireProject: configService.getValue('liveUpdater.watchEntireProject', true),
    
    // Cache settings
    cacheDir: configService.getValue('paths.cache', pathUtils.join(process.cwd(), 'data', 'cache')),
    maxCacheSize: configService.getValue('liveUpdater.maxCacheSize', 10000),
    
    // Performance settings
    maxConcurrent: configService.getValue('liveUpdater.maxConcurrent', 3),
    batchSize: configService.getValue('liveUpdater.batchSize', 10)
  };
  
  logger.info('Configuration initialized', { 
    projectRoot: CONFIG.projectRoot,
    watchEntireProject: CONFIG.watchEntireProject
  });
}

/**
 * Initialize the Live Updater Bridge
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[live-updater-bridge] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[live-updater-bridge] DI MIGRATION: logger not provided! Falling back to console.');
  }
  try {
    logger.info && logger.info('Initializing Live Updater Bridge');
    
    // Update central configuration if options provided
    if (Object.keys(options).length > 0) {
      configService.updateConfig(options);
    }
    
    // Initialize configuration using standardized access patterns
    initializeConfig();
    
    // Ensure cache directory exists
    if (!pathUtils.exists(CONFIG.cacheDir)) {
      pathUtils.ensureDirectoryExists(CONFIG.cacheDir);
    }
    
    // Initialize required components
    await Promise.all([
      semanticChunker.initialize(),
      semanticContextManager.initialize(),
      embeddings.initialize()
    ]);
    
    // Subscribe to configuration changes
    configService.subscribe(COMPONENT_NAME, handleConfigChange);
    
    // Subscribe to component initialization events
    eventBus.on('component:initialized', handleComponentInitialized, COMPONENT_NAME);
    eventBus.on('cache:invalidated', handleCacheInvalidated, COMPONENT_NAME);
    eventBus.on('file:changed', handleFileChanged, COMPONENT_NAME);
    
    if (!liveUpdater) {
      logger.warn('No Live Updater found, creating mock Live Updater');
      liveUpdater = createMockLiveUpdater();
    } else {
      // Set up cache invalidation callback
      if (typeof liveUpdater.setCacheInvalidationCallback === 'function') {
        liveUpdater.setCacheInvalidationCallback((filePath) => {
          logger.info(`Invalidating cache for file: ${filePath}`);
          semanticContextManager.invalidateCache(filePath);
          
          // Emit file change event
          eventBus.emit('file:changed', {
            path: filePath,
            timestamp: Date.now()
          });
        });
      }
      
      // Log that we're using whole-project awareness
      logger.info('Live Updater configured for whole-project awareness', { 
        watchingEntireProject: CONFIG.watchEntireProject,
        projectRoot: CONFIG.projectRoot
      });
    }
    
    isInitialized = true;
    
    // Emit initialization event
    eventBus.emit('component:initialized', {
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    logger.info('Live Updater Bridge initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize Live Updater Bridge: ${error.message}`, { 
      stack: error.stack 
    });
    return false;
  }
}

/**
 * Handle configuration changes
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @private
 */
function handleConfigChange(event, data) {
  if (event === 'updated') {
    logger.info('Configuration updated, reinitializing');
    initializeConfig();
  }
}

/**
 * Handle component initialization events
 * @param {Object} data - Event data
 * @private
 */
function handleComponentInitialized(data) {
  const { component } = data;
  
  logger.debug(`Component initialized: ${component}`);
  
  // If the unified live updater is initialized, we can use it
  if (component === 'unified-live-updater') {
    logger.info('Unified Live Updater is initialized, connecting to it');
    isUnifiedLiveUpdaterAvailable = true;
  }
}

/**
 * Handle cache invalidation events
 * @param {Object} data - Event data
 * @private
 */
function handleCacheInvalidated(data) {
  const { path, component, count } = data;
  
  // Only process events from other components
  if (component !== COMPONENT_NAME) {
    logger.info(`Cache invalidation received from ${component}`, { path, count });
    
    // If we have a specific file path, process that file
    if (path) {
      // Forward to the live updater if available
      if (isUnifiedLiveUpdaterAvailable && liveUpdater) {
        logger.info(`Forwarding file change to Unified Live Updater: ${path}`);
        try {
          liveUpdater.handleFileChange(path, 'change');
        } catch (error) {
          logger.error(`Error forwarding file change to Unified Live Updater: ${error.message}`, { 
            error: error.stack,
            path
          });
        }
      } else {
        // Use our own cache invalidation mechanism
        invalidateCache(path);
      }
    } else {
      // Full cache invalidation
      logger.info('Performing full cache invalidation');
      
      // Forward to the live updater if available
      if (isUnifiedLiveUpdaterAvailable && liveUpdater) {
        logger.info('Forwarding full cache invalidation to Unified Live Updater');
        try {
          liveUpdater.triggerGraphRebuild();
        } catch (error) {
          logger.error(`Error forwarding cache invalidation to Unified Live Updater: ${error.message}`, { 
            error: error.stack 
          });
        }
      } else {
        // Use our own cache invalidation mechanism for all files
        invalidateAllCaches();
      }
    }
  }
}

/**
 * Handle file change events
 * @param {Object} data - Event data
 * @private
 */
function handleFileChanged(data) {
  const { path, type, component } = data;
  
  // Only process events from other components
  if (component !== COMPONENT_NAME) {
    logger.info(`File change detected from ${component}: ${type}`, { path });
    
    // Forward to the live updater if available
    if (isUnifiedLiveUpdaterAvailable && liveUpdater) {
      logger.info(`Forwarding file change to Unified Live Updater: ${path}`);
      try {
        liveUpdater.handleFileChange(path, type);
      } catch (error) {
        logger.error(`Error forwarding file change to Unified Live Updater: ${error.message}`, { 
          error: error.stack,
          path,
          type
        });
      }
    } else {
      // Use our own cache invalidation mechanism
      invalidateCache(path);
    }
  }
}

/**
 * Create a mock Live Updater for fallback
 * @returns {Object} Mock Live Updater
 */
function createMockLiveUpdater() {
  logger.info('Creating mock Live Updater', { component: 'live-updater-bridge' });
  
  return {
    start: async () => {
      logger.info('Mock Live Updater started', { component: 'live-updater-bridge' });
      return true;
    },
    stop: async () => {
      logger.info('Mock Live Updater stopped', { component: 'live-updater-bridge' });
      return true;
    },
    getMetrics: () => {
      return {
        status: 'mock',
        fileCount: 0,
        changesDetected: 0,
        lastChangeDetectedAt: null
      };
    },
    setCacheInvalidationCallback: (callback) => {
      logger.info('Mock Live Updater cache invalidation callback set', { component: 'live-updater-bridge' });
    },
    invalidateCache: (filePath) => {
      logger.info(`Mock Live Updater invalidating cache for ${filePath}`, { component: 'live-updater-bridge' });
    }
  };
}

/**
 * Start the Live Updater
 * @returns {Promise<boolean>} Success status
 */
async function start() {
  try {
    if (!isInitialized) {
      logger.warn('Live Updater Bridge not initialized, initializing with defaults', { component: 'live-updater-bridge' });
      const initialized = await initialize();
      if (!initialized) {
        return false;
      }
    }
    
    if (isRunning) {
      logger.warn('Live Updater Bridge already running', { component: 'live-updater-bridge' });
      return true;
    }
    
    // Start the unified Live Updater
    if (liveUpdater && typeof liveUpdater.start === 'function') {
      await liveUpdater.start();
      isRunning = true;
      startTime = Date.now();
      
      // Update metrics
      metrics.status = 'running';
      metrics.isRunning = true;
      metrics.startTime = new Date().toISOString();
      
      logger.info('Live Updater Bridge started successfully', { component: 'live-updater-bridge' });
      return true;
    } else {
      logger.error('Live Updater start function not available', { component: 'live-updater-bridge' });
      return false;
    }
  } catch (error) {
    logger.error(`Failed to start Live Updater Bridge: ${error.message}`, { 
      component: 'live-updater-bridge',
      error 
    });
    return false;
  }
}

/**
 * Stop the Live Updater
 * @returns {Promise<boolean>} Success status
 */
async function stop() {
  try {
    if (!isRunning) {
      logger.warn('Live Updater Bridge not running', { component: 'live-updater-bridge' });
      return true;
    }
    
    // Clear health check interval
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    
    // Stop the unified Live Updater
    if (liveUpdater && typeof liveUpdater.stop === 'function') {
      await liveUpdater.stop();
      isRunning = false;
      
      // Update metrics
      metrics.status = 'stopped';
      metrics.isRunning = false;
      
      logger.info('Live Updater Bridge stopped successfully', { component: 'live-updater-bridge' });
      return true;
    } else {
      logger.error('Unified Live Updater not available', { component: 'live-updater-bridge' });
      return false;
    }
  } catch (error) {
    logger.error(`Failed to stop Live Updater Bridge: ${error.message}`, { 
      component: 'live-updater-bridge',
      error 
    });
    return false;
  }
}

/**
 * Check if a file has been updated since a given timestamp
 * @param {string} filePath - Path to the file
 * @param {number} timestamp - Timestamp to check against
 * @returns {boolean} True if file has been updated
 */
function hasFileChanged(filePath, timestamp) {
  // Normalize the file path for consistent lookup
  const normalizedPath = pathUtils.normalize(filePath);
  
  // Check if we have a record of this file changing
  const changeTimestamp = fileChangeTimestamps.get(normalizedPath);
  
  // If we have a timestamp and it's newer than the provided timestamp, the file has changed
  if (changeTimestamp && changeTimestamp > timestamp) {
    return true;
  }
  
  // If we don't have a timestamp, check if the file exists and get its mtime
  if (pathUtils.exists(normalizedPath)) {
    try {
      const stats = pathUtils.getStats(normalizedPath);
      const fileTimestamp = stats.mtimeMs;
      
      // Update our cache
      fileChangeTimestamps.set(normalizedPath, fileTimestamp);
      
      // Return true if the file is newer than the provided timestamp
      return fileTimestamp > timestamp;
    } catch (error) {
      logger.warn(`Error checking file timestamp for ${normalizedPath}: ${error.message}`);
    }
  }
  
  return false;
}

/**
 * Invalidate cache for a file
 * @param {string} filePath - Path to the file
 * @returns {boolean} Success status
 */
function invalidateCache(filePath) {
  try {
    // Normalize the file path for consistent handling
    const normalizedPath = pathUtils.normalize(filePath);
    
    // Record invalidation timestamp
    const timestamp = Date.now();
    fileChangeTimestamps.set(normalizedPath, timestamp);
    
    // Notify semantic context manager
    if (semanticContextManager.invalidateCache) {
      semanticContextManager.invalidateCache(normalizedPath);
    }
    
    // Emit file change event
    eventBus.emit('file:changed', {
      path: normalizedPath,
      timestamp: timestamp,
      source: COMPONENT_NAME
    });
    
    logger.info(`Cache invalidated for ${normalizedPath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to invalidate cache for ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Invalidate all caches
 */
function invalidateAllCaches() {
  logger.info('Invalidating all caches');
  
  if (cacheInvalidationCallback) {
    try {
      cacheInvalidationCallback(null); // null means invalidate all
    } catch (error) {
      logger.error(`Error in cache invalidation callback: ${error.message}`);
    }
  }
  
  // Emit cache invalidation event
  eventBus.emit('cache:invalidated', { 
    component: COMPONENT_NAME,
    path: null // null means invalidate all
  });
}

/**
 * Process all files in the watched directories
 * @returns {Promise<boolean>} Success status
 */
async function processAllFiles() {
  try {
    // Ensure we're initialized
    if (!isInitialized) {
      logger.warn('Live Updater Bridge not initialized, initializing with defaults');
      const initialized = await initialize();
      if (!initialized) {
        return false;
      }
    }
    
    // Emit processing start event
    eventBus.emit('processing:start', {
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    // Use the unified live updater if available
    if (liveUpdater && typeof liveUpdater.processAllFiles === 'function') {
      const startTime = Date.now();
      
      await liveUpdater.processAllFiles();
      
      const duration = Date.now() - startTime;
      logger.info(`All files processed successfully in ${duration}ms`);
      
      // Emit processing complete event
      eventBus.emit('processing:complete', {
        component: COMPONENT_NAME,
        timestamp: Date.now(),
        duration: duration
      });
      
      return true;
    } else {
      logger.error('Live Updater not available or missing processAllFiles method');
      
      // Emit processing error event
      eventBus.emit('processing:error', {
        component: COMPONENT_NAME,
        timestamp: Date.now(),
        error: 'Live Updater not available'
      });
      
      return false;
    }
  } catch (error) {
    logger.error(`Failed to process all files: ${error.message}`);
    
    // Emit processing error event
    eventBus.emit('processing:error', {
      component: COMPONENT_NAME,
      timestamp: Date.now(),
      error: error.message
    });
    
    return false;
  }
}

/**
 * Check if the Live Updater is running
 * @returns {boolean} Running status
 */
function isLiveUpdaterRunning() {
  return isRunning;
}

/**
 * Get Live Updater metrics
 * @returns {Object} Metrics object
 */
function getMetrics() {
  try {
    // Update current metrics
    metrics.status = isRunning ? 'running' : 'stopped';
    metrics.isRunning = isRunning;
    metrics.lastUpdated = Date.now();
    metrics.uptime = isRunning ? Date.now() - startTime : 0;
    
    // Get cache stats from semantic context manager
    if (semanticContextManager && typeof semanticContextManager.getCacheStats === 'function') {
      metrics.cacheStats = semanticContextManager.getCacheStats() || metrics.cacheStats;
    }
    
    // Calculate performance metrics
    metrics.performance.averageUpdateLatency = calculateAverageUpdateLatency();
    
    // Get Live Updater metrics if available
    if (liveUpdater && typeof liveUpdater.getMetrics === 'function') {
      const liveUpdaterMetrics = liveUpdater.getMetrics();
      
      // Merge with our metrics
      const combinedMetrics = {
        ...metrics,
        updaterMetrics: liveUpdaterMetrics || {}
      };
      
      // Emit metrics event
      eventBus.emit('metrics:update', {
        component: COMPONENT_NAME,
        metrics: combinedMetrics,
        timestamp: Date.now()
      });
      
      return combinedMetrics;
    }
    
    // Return basic metrics if Live Updater metrics not available
    const basicMetrics = {
      ...metrics,
      updaterMetrics: {}
    };
    
    // Emit metrics event
    eventBus.emit('metrics:update', {
      component: COMPONENT_NAME,
      metrics: basicMetrics,
      timestamp: Date.now()
    });
    
    return basicMetrics;
  } catch (error) {
    logger.error(`Failed to get Live Updater metrics: ${error.message}`);
    
    // Return basic metrics on error
    return {
      status: isRunning ? 'running' : 'stopped',
      isRunning,
      error: error.message
    };
  }
}

/**
 * Calculate average update latency
 * @returns {number} Average update latency in milliseconds
 */
function calculateAverageUpdateLatency() {
  if (fileChangeTimestamps.size < 2) {
    return 0;
  }
  
  const timestamps = Array.from(fileChangeTimestamps.values()).sort();
  let totalLatency = 0;
  let count = 0;
  
  for (let i = 1; i < timestamps.length; i++) {
    const latency = timestamps[i] - timestamps[i - 1];
    if (latency > 0 && latency < 60000) { // Ignore outliers > 1 minute
      totalLatency += latency;
      count++;
    }
  }
  
  return count > 0 ? totalLatency / count : 0;
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 * @deprecated Use pathUtils.ensureDirectoryExists instead
 * @private
 */
function ensureDirectoryExists(dirPath) {
  logger.warn('ensureDirectoryExists is deprecated, use pathUtils.ensureDirectoryExists instead');
  pathUtils.ensureDirectoryExists(dirPath);
}

/**
 * Shutdown the Unified Live Updater and clean up resources
 * @returns {Promise<void>}
 */
async function shutdown() {
  logger.info('Shutting down Unified Live Updater');
  
  try {
    // Unsubscribe from all events
    eventBus.removeAllListeners(COMPONENT_NAME);
    
    // Shutdown flow tracking if it was initialized
    if (CONFIG.ENABLE_FLOW_TRACKING && flowTracking) {
      logger.info('Shutting down flow tracking');
      await flowTracking.shutdown();
    }
    
    // Close file watchers if any
    if (watcher) {
      logger.info('Closing file watchers');
      watcher.close();
      watcher = null;
    }
    
    // Clear any pending timers
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
    logger.info('Unified Live Updater shutdown complete');
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

// Export the bridge interface
module.exports = {
  // Core functionality
  initialize,
  start,
  stop,
  processAllFiles,
  
  // File change detection
  hasFileChanged,
  invalidateCache,
  
  // Status and metrics
  isRunning: isLiveUpdaterRunning,
  getMetrics,
  
  // Event handlers
  handleConfigChange,
  handleComponentInitialized,
  
  // Constants
  COMPONENT_NAME
};
