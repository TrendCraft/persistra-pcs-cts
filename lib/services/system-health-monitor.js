/**
 * System Health Monitor
 * 
 * This service provides system health checks and self-diagnostic capabilities
 * for Leo components. It monitors the health of critical services, tracks
 * initialization status, and provides diagnostics for troubleshooting.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const configServiceAdapter = require('../adapters/config-service-adapter');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Component name for logging and events
const COMPONENT_NAME = 'system-health-monitor';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  HEALTH_CHECK_INTERVAL_MS: 60000, // 1 minute
  HEALTH_LOG_PATH: path.join(process.cwd(), 'data', 'logs', 'health'),
  CRITICAL_SERVICES: [
    'semantic-context-manager',
    'enhanced-context-retrieval',
    'conversation-memory-manager',
    'live-updater-bridge'
  ],
  ENABLE_PERFORMANCE_MONITORING: true,
  ENABLE_MEMORY_MONITORING: true,
  ENABLE_DISK_MONITORING: true,
  ALERT_THRESHOLD_CPU: 80, // Percentage
  ALERT_THRESHOLD_MEMORY: 80, // Percentage
  ALERT_THRESHOLD_DISK: 90 // Percentage
};

// Initialization state
let isInitialized = false;
let healthCheckInterval = null;

// Service health status
const serviceStatus = new Map();
const serviceInitTimes = new Map();
const servicePerformance = new Map();

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  // Initialize the config service adapter if needed
  if (!configServiceAdapter.isInitialized) {
    configServiceAdapter.initialize();
  }
  
  // Load configuration values using standardized property paths
  CONFIG = {
    HEALTH_CHECK_INTERVAL_MS: configServiceAdapter.getValue('systemHealthMonitor.healthCheckIntervalMs', 60000),
    HEALTH_LOG_PATH: configServiceAdapter.getValue('systemHealthMonitor.healthLogPath', 
      path.join(process.cwd(), 'data', 'logs', 'health')),
    CRITICAL_SERVICES: configServiceAdapter.getValue('systemHealthMonitor.criticalServices', [
      'semantic-context-manager',
      'enhanced-context-retrieval',
      'conversation-memory-manager',
      'live-updater-bridge'
    ]),
    ENABLE_PERFORMANCE_MONITORING: configServiceAdapter.getValue('systemHealthMonitor.enablePerformanceMonitoring', true),
    ENABLE_MEMORY_MONITORING: configServiceAdapter.getValue('systemHealthMonitor.enableMemoryMonitoring', true),
    ENABLE_DISK_MONITORING: configServiceAdapter.getValue('systemHealthMonitor.enableDiskMonitoring', true),
    ALERT_THRESHOLD_CPU: configServiceAdapter.getValue('systemHealthMonitor.alertThresholdCpu', 80),
    ALERT_THRESHOLD_MEMORY: configServiceAdapter.getValue('systemHealthMonitor.alertThresholdMemory', 80),
    ALERT_THRESHOLD_DISK: configServiceAdapter.getValue('systemHealthMonitor.alertThresholdDisk', 90)
  };
  
  logger.info('Configuration initialized with standardized property paths');
}

/**
 * Initialize the system health monitor
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    // Prevent duplicate initialization
    if (isInitialized) {
      logger.warn('System health monitor already initialized');
      return true;
    }
    
    logger.info('Initializing system health monitor...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Initialize configuration
    initializeConfig();
    
    // Ensure health log directory exists
    await fs.mkdir(CONFIG.HEALTH_LOG_PATH, { recursive: true });
    logger.info(`Health log directory created: ${CONFIG.HEALTH_LOG_PATH}`);
    
    // Subscribe to service events
    eventBus.on('service:initialized', handleServiceInitialized, COMPONENT_NAME);
    eventBus.on('service:error', handleServiceError, COMPONENT_NAME);
    eventBus.on('service:status', handleServiceStatus, COMPONENT_NAME);
    
    // Start health check interval
    startHealthChecks();
    
    isInitialized = true;
    logger.info('System health monitor initialized successfully');
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Start periodic health checks
 * @private
 */
function startHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(async () => {
    try {
      await runHealthCheck();
    } catch (error) {
      logger.error(`Health check failed: ${error.message}`);
    }
  }, CONFIG.HEALTH_CHECK_INTERVAL_MS);
  
  logger.info(`Health checks scheduled every ${CONFIG.HEALTH_CHECK_INTERVAL_MS / 1000} seconds`);
}

/**
 * Handle service initialized event
 * @param {Object} data - Event data
 * @private
 */
function handleServiceInitialized(data) {
  try {
    const { service, timestamp, dependencyStatus } = data;
    
    // Record service initialization time
    serviceInitTimes.set(service, timestamp);
    
    // Update service status
    serviceStatus.set(service, {
      status: 'initialized',
      lastUpdated: timestamp,
      dependencyStatus
    });
    
    logger.info(`Service initialized: ${service}`);
    
    // Check if this is a critical service
    if (CONFIG.CRITICAL_SERVICES.includes(service)) {
      logger.info(`Critical service ${service} initialized`);
      
      // Emit health status update
      eventBus.emit('health:status', {
        service: COMPONENT_NAME,
        timestamp: Date.now(),
        criticalServiceInitialized: service
      });
    }
  } catch (error) {
    logger.error(`Error handling service initialized event: ${error.message}`);
  }
}

/**
 * Handle service error event
 * @param {Object} data - Event data
 * @private
 */
function handleServiceError(data) {
  try {
    const { service, message, timestamp = Date.now() } = data;
    
    // Update service status
    serviceStatus.set(service, {
      status: 'error',
      lastUpdated: timestamp,
      error: message
    });
    
    logger.warn(`Service error: ${service} - ${message}`);
    
    // Check if this is a critical service
    if (CONFIG.CRITICAL_SERVICES.includes(service)) {
      logger.error(`Critical service ${service} reported an error: ${message}`);
      
      // Emit health status update
      eventBus.emit('health:alert', {
        service: COMPONENT_NAME,
        timestamp: Date.now(),
        criticalServiceError: {
          service,
          message
        }
      });
    }
  } catch (error) {
    logger.error(`Error handling service error event: ${error.message}`);
  }
}

/**
 * Handle service status event
 * @param {Object} data - Event data
 * @private
 */
function handleServiceStatus(data) {
  try {
    const { service, status, timestamp = Date.now(), metrics } = data;
    
    // Update service status
    serviceStatus.set(service, {
      status,
      lastUpdated: timestamp,
      metrics
    });
    
    // Update service performance metrics if available
    if (metrics) {
      servicePerformance.set(service, {
        timestamp,
        metrics
      });
    }
    
    logger.info(`Service status update: ${service} - ${status}`);
  } catch (error) {
    logger.error(`Error handling service status event: ${error.message}`);
  }
}

/**
 * Run a comprehensive health check
 * @returns {Promise<Object>} Health check results
 */
async function runHealthCheck() {
  try {
    logger.info('Running health check...');
    
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      services: {},
      system: {},
      alerts: []
    };
    
    // Check service status
    for (const service of CONFIG.CRITICAL_SERVICES) {
      const status = serviceStatus.get(service);
      const initTime = serviceInitTimes.get(service);
      const performance = servicePerformance.get(service);
      
      results.services[service] = {
        status: status ? status.status : 'unknown',
        initialized: !!initTime,
        initTime: initTime || null,
        lastUpdated: status ? status.lastUpdated : null,
        performance: performance ? performance.metrics : null
      };
      
      // Add alert if critical service is not initialized
      if (!initTime) {
        results.alerts.push({
          level: 'error',
          message: `Critical service ${service} is not initialized`,
          service
        });
      }
      
      // Add alert if critical service has an error
      if (status && status.status === 'error') {
        results.alerts.push({
          level: 'error',
          message: `Critical service ${service} has an error: ${status.error}`,
          service
        });
      }
    }
    
    // Check system resources
    if (CONFIG.ENABLE_PERFORMANCE_MONITORING) {
      const cpuUsage = process.cpuUsage();
      const cpuPercent = Math.round((cpuUsage.user + cpuUsage.system) / 1000 / os.cpus().length);
      
      results.system.cpu = {
        usage: cpuPercent,
        cores: os.cpus().length
      };
      
      // Add alert if CPU usage is high
      if (cpuPercent > CONFIG.ALERT_THRESHOLD_CPU) {
        results.alerts.push({
          level: 'warning',
          message: `High CPU usage: ${cpuPercent}%`,
          resource: 'cpu'
        });
      }
    }
    
    if (CONFIG.ENABLE_MEMORY_MONITORING) {
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryPercent = Math.round((usedMemory / totalMemory) * 100);
      
      results.system.memory = {
        total: formatBytes(totalMemory),
        free: formatBytes(freeMemory),
        used: formatBytes(usedMemory),
        percent: memoryPercent,
        heapUsed: formatBytes(memoryUsage.heapUsed),
        heapTotal: formatBytes(memoryUsage.heapTotal)
      };
      
      // Add alert if memory usage is high
      if (memoryPercent > CONFIG.ALERT_THRESHOLD_MEMORY) {
        results.alerts.push({
          level: 'warning',
          message: `High memory usage: ${memoryPercent}%`,
          resource: 'memory'
        });
      }
    }
    
    // Calculate execution time
    results.executionTimeMs = Date.now() - startTime;
    
    // Log results
    logger.info(`Health check completed in ${results.executionTimeMs}ms`);
    
    // Save results to file
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const healthLogPath = path.join(CONFIG.HEALTH_LOG_PATH, `health-${timestamp}.json`);
    await fs.writeFile(healthLogPath, JSON.stringify(results, null, 2));
    
    // Emit health status update
    eventBus.emit('health:check', {
      service: COMPONENT_NAME,
      timestamp: Date.now(),
      results
    });
    
    return results;
  } catch (error) {
    logger.error(`Health check failed: ${error.message}`);
    throw error;
  }
}

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Bytes to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 * @private
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get the current health status of all services
 * @returns {Object} Health status
 */
function getHealthStatus() {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      services: {},
      healthy: true
    };
    
    // Check service status
    for (const service of CONFIG.CRITICAL_SERVICES) {
      const serviceData = serviceStatus.get(service);
      const initTime = serviceInitTimes.get(service);
      
      status.services[service] = {
        status: serviceData ? serviceData.status : 'unknown',
        initialized: !!initTime,
        lastUpdated: serviceData ? serviceData.lastUpdated : null
      };
      
      // Mark as unhealthy if any critical service is not initialized or has an error
      if (!initTime || (serviceData && serviceData.status === 'error')) {
        status.healthy = false;
      }
    }
    
    return status;
  } catch (error) {
    logger.error(`Error getting health status: ${error.message}`);
    return {
      timestamp: new Date().toISOString(),
      error: error.message,
      healthy: false
    };
  }
}

/**
 * Run diagnostics on a specific service
 * @param {string} service - Service name
 * @returns {Promise<Object>} Diagnostic results
 */
async function runDiagnostics(service) {
  try {
    logger.info(`Running diagnostics for service: ${service}`);
    
    const results = {
      timestamp: new Date().toISOString(),
      service,
      status: serviceStatus.get(service) || { status: 'unknown' },
      initTime: serviceInitTimes.get(service) || null,
      performance: servicePerformance.get(service) || null,
      recommendations: []
    };
    
    // Check if service is initialized
    if (!serviceInitTimes.get(service)) {
      results.recommendations.push({
        issue: 'Service not initialized',
        action: 'Check initialization logs and ensure all dependencies are available'
      });
    }
    
    // Check if service has errors
    const status = serviceStatus.get(service);
    if (status && status.status === 'error') {
      results.recommendations.push({
        issue: `Service has an error: ${status.error}`,
        action: 'Check error logs and fix the underlying issue'
      });
    }
    
    // Check dependency status
    if (status && status.dependencyStatus) {
      const failedDependencies = [];
      
      for (const [dep, initialized] of Object.entries(status.dependencyStatus)) {
        if (!initialized) {
          failedDependencies.push(dep);
        }
      }
      
      if (failedDependencies.length > 0) {
        results.recommendations.push({
          issue: `Failed dependencies: ${failedDependencies.join(', ')}`,
          action: 'Initialize these dependencies before initializing this service'
        });
      }
    }
    
    // Log results
    logger.info(`Diagnostics completed for service: ${service}`);
    
    return results;
  } catch (error) {
    logger.error(`Diagnostics failed for service ${service}: ${error.message}`);
    throw error;
  }
}

/**
 * Get system metrics
 * @returns {Object} System metrics
 */
function getSystemMetrics() {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      }
    };
    
    return metrics;
  } catch (error) {
    logger.error(`Error getting system metrics: ${error.message}`);
    return {
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

// Export public API
module.exports = {
  initialize,
  runHealthCheck,
  getHealthStatus,
  runDiagnostics,
  getSystemMetrics,
  isInitialized
};
