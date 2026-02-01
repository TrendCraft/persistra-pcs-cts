/**
 * Code Change Monitor
 * 
 * Monitors code changes in real-time and emits events when changes are detected.
 * This component is used by the Real-Time Awareness Connector to track code modifications.
 * 
 * @module lib/services/code-change-monitor
 * @author Leo Development Team
 * @created May 13, 2025
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');
const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('code-change-monitor');

/**
 * Code Change Monitor
 * 
 * Monitors code changes and emits events when changes are detected
 */
class CodeChangeMonitor extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.watchers = new Map();
    this.ignoredPaths = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      'test-results'
    ];
    this.significantFilePatterns = [
      /config.*\.js$/,
      /\.json$/,
      /package\.json$/,
      /service.*\.js$/,
      /adapter.*\.js$/,
      /component.*\.js$/,
      /interface.*\.js$/
    ];
  }

  /**
   * Initialize the code change monitor
   * @param {Object} options - Initialization options
   */
  async initialize(options = {}) {
    if (this.initialized) {
      logger.warn('Code change monitor already initialized');
      return;
    }

    logger.info('Initializing code change monitor');

    try {
      // Set up options
      this.projectRoot = options.projectRoot || process.cwd();
      this.ignoredPaths = options.ignoredPaths || this.ignoredPaths;
      this.significantFilePatterns = options.significantFilePatterns || this.significantFilePatterns;

      // Initialize watchers
      await this.initializeWatchers();

      this.initialized = true;
      logger.info('Code change monitor initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize code change monitor: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Initialize file watchers
   */
  async initializeWatchers() {
    try {
      // Create watcher for the project root
      const watcher = chokidar.watch(this.projectRoot, {
        ignored: (path) => {
          // Check if path contains any ignored paths
          return this.ignoredPaths.some(ignoredPath => path.includes(ignoredPath));
        },
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        }
      });

      // Set up event handlers
      watcher.on('add', this.handleFileAdd.bind(this));
      watcher.on('change', this.handleFileChange.bind(this));
      watcher.on('unlink', this.handleFileDelete.bind(this));
      watcher.on('error', this.handleError.bind(this));

      // Store watcher
      this.watchers.set('project', watcher);

      logger.info(`Watching for code changes in ${this.projectRoot}`);
    } catch (error) {
      logger.error(`Error initializing watchers: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Handle file addition event
   * @param {string} filePath - Path to the added file
   */
  handleFileAdd(filePath) {
    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      logger.debug(`File added: ${relativePath}`);

      const changeData = {
        type: 'file_change',
        filePath: relativePath,
        changeType: 'add',
        timestamp: new Date()
      };

      // Emit file changed event
      this.emit('fileChanged', changeData);

      // Check if this is a significant file
      if (this.isSignificantFile(relativePath)) {
        logger.info(`Significant file added: ${relativePath}`);
        
        const significantChangeData = {
          ...changeData,
          description: `New file added: ${relativePath}`,
          impact: 'moderate'
        };
        
        // Emit significant change event
        this.emit('significantChange', significantChangeData);
      }
    } catch (error) {
      logger.error(`Error handling file add: ${error.message}`, error);
    }
  }

  /**
   * Handle file change event
   * @param {string} filePath - Path to the changed file
   */
  handleFileChange(filePath) {
    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      logger.debug(`File changed: ${relativePath}`);

      const changeData = {
        type: 'file_change',
        filePath: relativePath,
        changeType: 'modify',
        timestamp: new Date()
      };

      // Emit file changed event
      this.emit('fileChanged', changeData);

      // Check if this is a significant file
      if (this.isSignificantFile(relativePath)) {
        logger.info(`Significant file changed: ${relativePath}`);
        
        const significantChangeData = {
          ...changeData,
          description: `File modified: ${relativePath}`,
          impact: 'moderate'
        };
        
        // Emit significant change event
        this.emit('significantChange', significantChangeData);
      }

      // Check for dependency changes
      if (relativePath === 'package.json') {
        this.handleDependencyChange(filePath);
      }
    } catch (error) {
      logger.error(`Error handling file change: ${error.message}`, error);
    }
  }

  /**
   * Handle file deletion event
   * @param {string} filePath - Path to the deleted file
   */
  handleFileDelete(filePath) {
    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      logger.debug(`File deleted: ${relativePath}`);

      const changeData = {
        type: 'file_change',
        filePath: relativePath,
        changeType: 'delete',
        timestamp: new Date()
      };

      // Emit file changed event
      this.emit('fileChanged', changeData);

      // Check if this is a significant file
      if (this.isSignificantFile(relativePath)) {
        logger.info(`Significant file deleted: ${relativePath}`);
        
        const significantChangeData = {
          ...changeData,
          description: `File deleted: ${relativePath}`,
          impact: 'high'
        };
        
        // Emit significant change event
        this.emit('significantChange', significantChangeData);
      }
    } catch (error) {
      logger.error(`Error handling file delete: ${error.message}`, error);
    }
  }

  /**
   * Handle dependency change event
   * @param {string} filePath - Path to the package.json file
   */
  handleDependencyChange(filePath) {
    try {
      // Read the package.json file
      const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Emit dependency change event
      this.emit('dependencyChanged', {
        type: 'dependency_change',
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
        timestamp: new Date()
      });
      
      logger.info('Dependency change detected');
    } catch (error) {
      logger.error(`Error handling dependency change: ${error.message}`, error);
    }
  }

  /**
   * Handle error event
   * @param {Error} error - The error that occurred
   */
  handleError(error) {
    logger.error(`Watcher error: ${error.message}`, error);
  }

  /**
   * Check if a file is significant
   * @param {string} filePath - Path to the file
   * @returns {boolean} True if the file is significant
   */
  isSignificantFile(filePath) {
    // Check if the file matches any significant file patterns
    return this.significantFilePatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Stop all watchers
   */
  async stop() {
    try {
      // Close all watchers
      for (const [name, watcher] of this.watchers.entries()) {
        await watcher.close();
        logger.info(`Stopped watcher: ${name}`);
      }
      
      // Clear watchers map
      this.watchers.clear();
      
      logger.info('All watchers stopped');
    } catch (error) {
      logger.error(`Error stopping watchers: ${error.message}`, error);
      throw error;
    }
  }
}

// Create singleton instance
const codeChangeMonitor = new CodeChangeMonitor();

module.exports = {
  codeChangeMonitor
};
