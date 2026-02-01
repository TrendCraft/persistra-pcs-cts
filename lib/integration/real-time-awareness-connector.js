/**
 * Real-Time Awareness Connector
 * 
 * Connects the Real-Time Code Awareness System with the Awareness Layers.
 * This component enables continuous vision alignment and drift prevention
 * during long development flows.
 * 
 * @module lib/integration/real-time-awareness-connector
 * @author Leo Development Team
 * @created May 13, 2025
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const { EventEmitter } = require('events');

// Default imports (will be overridden by dependency injection)
const { visionAnchor: defaultVisionAnchor } = require('../services/vision-anchor');
const { metaCognitiveLayer: defaultMetaCognitiveLayer } = require('../services/meta-cognitive-layer');
const { contextInjectionSystem: defaultContextInjectionSystem } = require('./context-injection-system');
const { sessionAwarenessAdapter: defaultSessionAwarenessAdapter } = require('./session-awareness-adapter');

// Create logger
const logger = createComponentLogger('real-time-awareness-connector');

/**
 * Real-Time Awareness Connector
 * 
 * Connects real-time code awareness with the awareness layers
 */
/**
 * Real-Time Awareness Connector
 * 
 * Connects real-time code awareness with the awareness layers.
 * Enables continuous vision alignment and drift prevention during development.
 */
class RealTimeAwarenessConnector extends EventEmitter {
  /**
   * Create a new Real-Time Awareness Connector with dependency injection support
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.visionAnchor - Vision anchor service
   * @param {Object} options.metaCognitiveLayer - Meta-cognitive layer service
   * @param {Object} options.contextInjectionSystem - Context injection system
   * @param {Object} options.sessionAwarenessAdapter - Session awareness adapter
   * @param {number} options.driftDetectionThreshold - Threshold for drift detection (0-1)
   * @param {number} options.analysisInterval - Interval for periodic analysis in ms
   */
  constructor({
    visionAnchor = defaultVisionAnchor,
    metaCognitiveLayer = defaultMetaCognitiveLayer,
    contextInjectionSystem = defaultContextInjectionSystem,
    sessionAwarenessAdapter = defaultSessionAwarenessAdapter,
    driftDetectionThreshold = 0.65,
    analysisInterval = 60000
  } = {}) {
    super();
    this.initialized = false;
    this._initPromise = null;
    this.codeChangeListeners = [];
    this.lastAnalysis = null;
    this.driftDetectionThreshold = driftDetectionThreshold;
    this.analysisInterval = analysisInterval;
    this.analysisTimer = null;
    
    // Store injected dependencies
    this.visionAnchor = visionAnchor;
    this.metaCognitiveLayer = metaCognitiveLayer;
    this.contextInjectionSystem = contextInjectionSystem;
    this.sessionAwarenessAdapter = sessionAwarenessAdapter;
    
    // Bound event handlers for proper cleanup
    this.boundFileChangeHandler = this.handleFileChange.bind(this);
    this.boundSignificantChangeHandler = this.handleSignificantChange.bind(this);
    this.boundDependencyChangeHandler = this.handleDependencyChange.bind(this);
  }

  /**
   * Initialize the Real-Time Awareness Connector
   * 
   * @param {Object} options - Initialization options
   * @param {number} options.analysisInterval - Override the default analysis interval
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      if (this.initialized) {
        logger.info('Real-Time Awareness Connector already initialized');
        return { success: true, alreadyInitialized: true };
      }

      logger.info('Initializing Real-Time Awareness Connector');

      try {
        // Initialize dependencies
        await this.visionAnchor.initialize();
        await this.metaCognitiveLayer.initialize();
        await this.contextInjectionSystem.initialize();
        await this.sessionAwarenessAdapter.initialize();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start periodic analysis
        this.startPeriodicAnalysis(options.analysisInterval || this.analysisInterval);
        
        this.initialized = true;
        logger.info('Real-Time Awareness Connector initialized successfully');
        
        // Emit initialized event
        this.emit('initialized', { timestamp: Date.now() });
        
        return { success: true };
      } catch (error) {
        logger.error(`Failed to initialize Real-Time Awareness Connector: ${error.message}`, error);
        
        // Emit initialization error event
        this.emit('initializationError', { error: error.message, timestamp: Date.now() });
        
        return { 
          success: false, 
          error: error.message,
          component: 'real-time-awareness-connector'
        };
      }
    })();

    return this._initPromise;
  }

  /**
   * Set up event listeners for code changes
   */
  setupEventListeners() {
    // Listen for code change events
    try {
      const { codeChangeMonitor } = require('../services/code-change-monitor');
      this.codeChangeMonitor = codeChangeMonitor;
      
      // Listen for file changes using bound handlers
      codeChangeMonitor.on('fileChanged', this.boundFileChangeHandler);
      
      // Listen for significant changes using bound handlers
      codeChangeMonitor.on('significantChange', this.boundSignificantChangeHandler);
      
      // Listen for component dependency changes using bound handlers
      codeChangeMonitor.on('dependencyChanged', this.boundDependencyChangeHandler);
      
      logger.info('Event listeners set up for code changes');
    } catch (error) {
      logger.warn(`Could not set up code change listeners: ${error.message}`);
      logger.info('Will rely on periodic analysis instead of event-driven analysis');
    }
  }

  /**
   * Start periodic analysis of code changes
   * 
   * @param {number} interval - The interval in milliseconds
   */
  startPeriodicAnalysis(interval) {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }
    
    this.analysisInterval = interval;
    this.analysisTimer = setInterval(() => {
      this.analyzeCurrentState();
    }, this.analysisInterval);
    
    logger.info(`Periodic analysis started with interval: ${interval}ms`);
  }

  /**
   * Stop periodic analysis
   */
  stopPeriodicAnalysis() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
      logger.info('Periodic analysis stopped');
    }
  }

  /**
   * Handle file change event
   * 
   * @param {Object} changeData - Data about the file change
   * @param {string} changeData.filePath - Path to the changed file
   * @param {string} changeData.changeType - Type of change (added, modified, deleted)
   * @param {Object} changeData.metadata - Additional metadata about the change
   */
  async handleFileChange(changeData) {
    // Check if initialized - if not, don't try to initialize here
    if (!this.initialized) {
      logger.warn('Ignoring file change event - connector not initialized');
      return;
    }
    
    logger.debug(`File change detected: ${changeData.filePath}`);
    
    try {
      // Record the change as an observation in the meta-cognitive layer
      await this.metaCognitiveLayer.recordObservation({
        type: 'code_change',
        content: `File changed: ${changeData.filePath}`,
        filePath: changeData.filePath,
        changeType: changeData.changeType,
        timestamp: new Date()
      });
      
      // If this is a significant file (e.g., core component, configuration), analyze immediately
      if (this.isSignificantFile(changeData.filePath)) {
        await this.analyzeCurrentState();
      }
      
      // Emit event for other components
      this.emit('codeChangeDetected', changeData);
    } catch (error) {
      logger.error(`Error handling file change: ${error.message}`, error);
    }
  }

  /**
   * Handle significant change event
   * 
   * @param {Object} changeData - Data about the significant change
   * @param {string} changeData.description - Description of the significant change
   * @param {Array<string>} changeData.files - List of files affected by the change
   * @param {string} changeData.impact - Impact assessment of the change
   */
  async handleSignificantChange(changeData) {
    // Check if initialized - if not, don't try to initialize here
    if (!this.initialized) {
      logger.warn('Ignoring significant change event - connector not initialized');
      return;
    }
    
    logger.info(`Significant change detected: ${changeData.description}`);
    
    try {
      // Record the change as an observation in the meta-cognitive layer
      await this.metaCognitiveLayer.recordObservation({
        type: 'significant_code_change',
        content: changeData.description,
        files: changeData.files,
        impact: changeData.impact,
        timestamp: new Date()
      });
      
      // Analyze the current state immediately
      await this.analyzeCurrentState();
      
      // Emit event for other components
      this.emit('significantChangeDetected', changeData);
    } catch (error) {
      logger.error(`Error handling significant change: ${error.message}`, error);
    }
  }

  /**
   * Handle dependency change event
   * 
   * @param {Object} dependencyData - Data about the dependency change
   * @param {string} dependencyData.description - Description of the dependency change
   * @param {string} dependencyData.source - Source component of the dependency
   * @param {string} dependencyData.target - Target component of the dependency
   * @param {string} dependencyData.changeType - Type of change (added, removed, modified)
   */
  async handleDependencyChange(dependencyData) {
    // Check if initialized - if not, don't try to initialize here
    if (!this.initialized) {
      logger.warn('Ignoring dependency change event - connector not initialized');
      return;
    }
    
    logger.info(`Dependency change detected: ${dependencyData.description}`);
    
    try {
      // Record the change as an observation in the meta-cognitive layer
      await this.metaCognitiveLayer.recordObservation({
        type: 'dependency_change',
        content: dependencyData.description,
        source: dependencyData.source,
        target: dependencyData.target,
        changeType: dependencyData.changeType,
        timestamp: new Date()
      });
      
      // Analyze the current state immediately
      await this.analyzeCurrentState();
      
      // Emit event for other components
      this.emit('dependencyChangeDetected', dependencyData);
    } catch (error) {
      logger.error(`Error handling dependency change: ${error.message}`, error);
    }
  }

  /**
   * Check if a file is significant
   * 
   * @param {string} filePath - The path to the file
   * @returns {boolean} Whether the file is significant
   */
  isSignificantFile(filePath) {
    // Consider files in core directories as significant
    if (filePath.includes('/lib/services/') || 
        filePath.includes('/lib/adapters/') || 
        filePath.includes('/lib/integration/')) {
      return true;
    }
    
    // Consider configuration files as significant
    if (filePath.endsWith('.config.js') || 
        filePath.endsWith('.json') && filePath.includes('/config/')) {
      return true;
    }
    
    // Consider documentation files as significant
    if (filePath.endsWith('.md') && filePath.includes('/docs/')) {
      return true;
    }
    
    return false;
  }

  /**
   * Analyze the current state for drift detection
   * 
   * @returns {Promise<Object|null>} Analysis result or null if no changes to analyze
   * @property {Date} timestamp - When the analysis was performed
   * @property {Array} recentChanges - List of recent code changes
   * @property {Object} visionAlignment - Result of vision alignment check
   * @property {Object} trajectory - Development trajectory information
   * @property {boolean} driftDetected - Whether drift was detected
   * @property {Array<string>} recommendations - Recommendations to address drift
   */
  async analyzeCurrentState() {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error('Cannot analyze current state - initialization failed');
        return null;
      }
    }
    
    logger.info('Analyzing current state for drift detection');
    
    try {
      // Get recent code changes
      const recentChanges = await this.getRecentCodeChanges();
      
      // If no recent changes, skip analysis
      if (!recentChanges || recentChanges.length === 0) {
        logger.debug('No recent changes to analyze');
        return null;
      }
      
      // Create a description of recent changes
      const changesDescription = this.formatChangesDescription(recentChanges);
      
      // Check alignment with vision
      const visionAlignment = await this.visionAnchor.checkVisionAlignment({
        type: 'code_changes',
        id: `changes_${Date.now()}`,
        content: changesDescription
      });
      
      // Get development trajectory
      const trajectory = await this.metaCognitiveLayer.getDevelopmentTrajectory();
      
      // Create analysis result
      const analysis = {
        timestamp: new Date(),
        recentChanges,
        visionAlignment,
        trajectory,
        driftDetected: !visionAlignment.isAligned || visionAlignment.overallAlignment < this.driftDetectionThreshold,
        recommendations: []
      };
      
      // Add recommendations based on analysis
      if (!visionAlignment.isAligned) {
        analysis.recommendations.push(
          'Recent code changes may be drifting from the project vision.',
          ...visionAlignment.recommendations
        );
      }
      
      // Store analysis in session awareness
      await this.sessionAwarenessAdapter.storeData('last_drift_analysis', analysis);
      
      // Update context injection system
      await this.updateContextInjection(analysis);
      
      // Emit drift detection event if drift detected
      if (analysis.driftDetected) {
        this.emit('driftDetected', analysis);
      } else {
        this.emit('visionAlignmentConfirmed', analysis);
      }
      
      this.lastAnalysis = analysis;
      logger.info(`State analysis complete. Drift detected: ${analysis.driftDetected}`);
      
      return analysis;
    } catch (error) {
      logger.error(`Error analyzing current state: ${error.message}`, error);
      
      // Emit analysis error event
      this.emit('analysisError', { error: error.message, timestamp: Date.now() });
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get recent code changes
   * 
   * @returns {Promise<Array>} Recent code changes
   * @property {string} type - Type of change (code_change, significant_code_change, dependency_change)
   * @property {string} content - Description of the change
   * @property {string} [filePath] - Path to the changed file (for code_change)
   * @property {string} [changeType] - Type of change (added, modified, deleted)
   * @property {Array<string>} [files] - List of affected files (for significant_code_change)
   * @property {string} [impact] - Impact assessment (for significant_code_change)
   * @property {string} [source] - Source component (for dependency_change)
   * @property {string} [target] - Target component (for dependency_change)
   * @property {Date} timestamp - When the change occurred
   */
  async getRecentCodeChanges() {
    try {
      // Try to get from code change monitor first
      if (this.codeChangeMonitor) {
        return await this.codeChangeMonitor.getRecentChanges();
      }
      
      // If codeChangeMonitor is not available, try to get it
      try {
        const { codeChangeMonitor } = require('../services/code-change-monitor');
        this.codeChangeMonitor = codeChangeMonitor;
        return await codeChangeMonitor.getRecentChanges();
      } catch (monitorError) {
        logger.warn(`Could not get code change monitor: ${monitorError.message}`);
      }
      
      // Fall back to meta-cognitive observations
      logger.info('Falling back to meta-cognitive layer for recent changes');
      const observations = await this.metaCognitiveLayer.getRecentObservations({
        types: ['code_change', 'significant_code_change', 'dependency_change'],
        limit: 20
      });
      
      return observations;
    } catch (error) {
      logger.error(`Error getting recent code changes: ${error.message}`, error);
      return [];
    }
  }

  /**
   * Format changes description for vision alignment check
   * 
   * @param {Array} changes - The changes to format
   * @returns {string} Formatted changes description
   */
  formatChangesDescription(changes) {
    if (!changes || changes.length === 0) {
      return 'No recent changes.';
    }
    
    let description = `Recent code changes (${changes.length}):\n\n`;
    
    for (const change of changes) {
      if (change.type === 'code_change') {
        description += `- File changed: ${change.filePath} (${change.changeType})\n`;
      } else if (change.type === 'significant_code_change') {
        description += `- Significant change: ${change.content}\n`;
        if (change.impact) {
          description += `  Impact: ${change.impact}\n`;
        }
      } else if (change.type === 'dependency_change') {
        description += `- Dependency change: ${change.content}\n`;
      } else {
        description += `- ${change.content}\n`;
      }
    }
    
    return description;
  }

  /**
   * Update context injection based on analysis
   * 
   * @param {Object} analysis - The analysis result
   * @param {boolean} analysis.driftDetected - Whether drift was detected
   * @param {Object} analysis.visionAlignment - Vision alignment information
   * @param {number} analysis.visionAlignment.overallAlignment - Alignment score (0-1)
   * @param {Array<string>} analysis.recommendations - Recommendations to address drift
   * @param {Array} analysis.recentChanges - List of recent code changes
   */
  async updateContextInjection(analysis) {
    if (!analysis) {
      return;
    }
    
    try {
      // Register a custom context provider for drift awareness
      this.contextInjectionSystem.registerContextProvider('drift_awareness', async (query, options) => {
        if (!analysis.driftDetected) {
          return []; // No drift detected, no need to inject
        }
        
        return [{
          type: 'drift_awareness',
          id: 'drift_detection',
          title: 'Drift Detection Warning',
          content: `Recent code changes may be drifting from the project vision (alignment score: ${analysis.visionAlignment.overallAlignment.toFixed(2)}).\n\nRecommendations:\n${analysis.recommendations.map(r => `- ${r}`).join('\n')}`,
          priority: 0.95 // Very high priority
        }];
      });
      
      // Register a custom context provider for recent changes
      this.contextInjectionSystem.registerContextProvider('recent_changes', async (query, options) => {
        if (!analysis.recentChanges || analysis.recentChanges.length === 0) {
          return [];
        }
        
        return [{
          type: 'recent_changes',
          id: 'code_changes',
          title: 'Recent Code Changes',
          content: this.formatChangesDescription(analysis.recentChanges),
          priority: 0.8 // High priority
        }];
      });
      
      // Register a custom context provider for trajectory awareness
      if (analysis.trajectory) {
        this.contextInjectionSystem.registerContextProvider('trajectory_awareness', async (query, options) => {
          return [{
            type: 'trajectory_awareness',
            id: 'development_trajectory',
            title: 'Development Trajectory',
            content: `Current development trajectory: ${analysis.trajectory.direction}\n\nRecent focus areas:\n${analysis.trajectory.focusAreas.map(area => `- ${area}`).join('\n')}`,
            priority: 0.7 // Medium-high priority
          }];
        });
      }
      
      logger.info('Context injection updated with drift awareness and recent changes');
    } catch (error) {
      logger.error(`Error updating context injection: ${error.message}`, error);
    }
  }

  /**
   * Get the last analysis result
   * 
   * @returns {Object} The last analysis result
   */
  getLastAnalysis() {
    return this.lastAnalysis;
  }

  /**
   * Force an immediate analysis
   * 
   * @returns {Object} The analysis result
   */
  async forceAnalysis() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Ensure meta-cognitive layer is initialized
    await metaCognitiveLayer.initialize();
    
    return await this.analyzeCurrentState();
  }

  /**
   * Set the drift detection threshold
   * 
   * @param {number} threshold - The new threshold (0-1)
   */
  setDriftDetectionThreshold(threshold) {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    
    this.driftDetectionThreshold = threshold;
    logger.info(`Drift detection threshold set to: ${threshold}`);
  }
  
  /**
   * Dispose of the connector and clean up resources
   * Allows for safe shutdown of the connector
   * 
   * @returns {Promise<boolean>} Success status
   */
  async dispose() {
    logger.info('Disposing Real-Time Awareness Connector');
    
    try {
      // Stop periodic analysis
      this.stopPeriodicAnalysis();
      
      // Remove event listeners if code change monitor is available
      if (this.codeChangeMonitor) {
        this.codeChangeMonitor.off('fileChanged', this.boundFileChangeHandler);
        this.codeChangeMonitor.off('significantChange', this.boundSignificantChangeHandler);
        this.codeChangeMonitor.off('dependencyChanged', this.boundDependencyChangeHandler);
        logger.info('Removed code change event listeners');
      }
      
      // Reset state
      this.initialized = false;
      this._initPromise = null;
      
      // Emit disposed event
      this.emit('disposed', { timestamp: Date.now() });
      
      logger.info('Real-Time Awareness Connector disposed successfully');
      return true;
    } catch (error) {
      logger.error(`Error disposing Real-Time Awareness Connector: ${error.message}`, error);
      return false;
    }
  }
}

/**
 * Create a Real-Time Awareness Connector with custom dependencies
 * Factory function for creating instances with dependency injection
 * 
 * @param {Object} options - Configuration options for the connector
 * @returns {RealTimeAwarenessConnector} New connector instance
 */
function createRealTimeAwarenessConnector(options = {}) {
  return new RealTimeAwarenessConnector(options);
}

// Create singleton instance with default dependencies
const realTimeAwarenessConnector = createRealTimeAwarenessConnector();

module.exports = {
  realTimeAwarenessConnector,
  createRealTimeAwarenessConnector,
  RealTimeAwarenessConnector
};
