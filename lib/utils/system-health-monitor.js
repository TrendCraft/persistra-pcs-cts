/**
 * System Health Monitor (DISABLED)
 * 
 * This module has been disabled because it was causing more problems than it was solving.
 * It was incorrectly "repairing" valid JSONL files by wiping them out, which directly
 * caused memory graph files to be wiped.
 * 
 * This dummy implementation provides all the expected methods but does nothing.
 */

const { createComponentLogger } = require('./logger');

// Create logger
const logger = createComponentLogger('system-health-monitor');

/**
 * Dummy System Health Monitor
 * 
 * All methods are no-ops that return success
 */
const systemHealthMonitor = {
  // Monitor state - always report as not running
  running: false,
  checkInterval: 0,
  checkIntervalId: null,
  
  // Empty maps for compatibility
  healthChecks: new Map(),
  dataChecks: new Map(),
  
  /**
   * Initialize the system health monitor (disabled)
   * 
   * @param {Object} options - Initialization options (ignored)
   * @returns {Promise<Object>} Success result
   */
  async initialize(options = {}) {
    logger.info('System health monitor is disabled');
    return { success: true, disabled: true };
  },
  
  /**
   * Register a component health check (disabled)
   * 
   * @returns {Object} Success result
   */
  registerHealthCheck() {
    return { success: true, disabled: true };
  },
  
  /**
   * Register a data integrity check (disabled)
   * 
   * @returns {Object} Success result
   */
  registerDataCheck() {
    return { success: true, disabled: true };
  },
  
  /**
   * Run a health check (disabled)
   * 
   * @returns {Promise<Object>} Success result
   */
  async runHealthCheck() {
    return { success: true, disabled: true };
  },
  
  /**
   * Start monitoring (disabled)
   * 
   * @returns {Object} Success result
   */
  start() {
    return { success: true, disabled: true };
  },
  
  /**
   * Stop monitoring (disabled)
   * 
   * @returns {Object} Success result
   */
  stop() {
    return { success: true, disabled: true };
  },
  
  /**
   * Start monitoring (disabled) - alias for start()
   * 
   * @returns {Object} Success result
   */
  startMonitoring() {
    return this.start();
  },
  
  /**
   * Stop monitoring (disabled) - alias for stop()
   * 
   * @returns {Object} Success result
   */
  stopMonitoring() {
    return this.stop();
  }
};

module.exports = systemHealthMonitor;
