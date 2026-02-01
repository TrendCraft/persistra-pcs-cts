/**
 * Cognitive Metrics Collection
 * 
 * This module collects, analyzes, and reports metrics related to cognitive continuity
 * across token boundaries. It integrates with the Intrinsic Activation Framework
 * and Adaptive Reinforcement System to gather performance data.
 * 
 * @module cognitive-metrics-collection
 */

const EventEmitter = require('events');
const logger = require('../utils/logger')('cognitive-metrics-collection');

// Import required services
const { getIntrinsicActivationFramework } = require('./intrinsic-activation-framework');
const { getAdaptiveReinforcementSystem } = require('./adaptive-reinforcement-system');
const { getAdaptiveReinforcementIntegration } = require('../integration/adaptive-reinforcement-integration');

// Configuration constants
const CONFIG = {
  COLLECTION_INTERVAL: 30 * 1000,      // Metrics collection interval (30 seconds)
  RETENTION_PERIOD: 24 * 60 * 60 * 1000, // Retain metrics for 24 hours
  MAX_DATAPOINTS: 1000,                // Maximum datapoints to store
  METRIC_TYPES: {
    COHERENCE: 'coherence',
    ACTIVATION: 'activation', 
    REINFORCEMENT: 'reinforcement',
    BOOTSTRAP: 'bootstrap',
    OVERRIDE: 'override',
    TOKEN_BOUNDARY: 'token_boundary'
  }
};

class CognitiveMetricsCollection {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.components = {
      intrinsicActivationFramework: null,
      adaptiveReinforcementSystem: null,
      adaptiveReinforcementIntegration: null
    };
    
    // Metrics storage
    this.metrics = {
      coherence: [],
      activation: [],
      reinforcement: [],
      bootstrap: [],
      override: [],
      token_boundary: []
    };
    
    // Collection state
    this.isCollecting = false;
    this.collectionInterval = null;
    this.lastAnalysis = null;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.startCollection = this.startCollection.bind(this);
    this.stopCollection = this.stopCollection.bind(this);
    this.collectMetrics = this.collectMetrics.bind(this);
    this.recordMetric = this.recordMetric.bind(this);
    this.analyzeMetrics = this.analyzeMetrics.bind(this);
    this.generateReport = this.generateReport.bind(this);
    this.pruneOldData = this.pruneOldData.bind(this);
  }

  /**
   * Initialize the metrics collection system
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      logger.info('Initializing Cognitive Metrics Collection');
      
      // Initialize Intrinsic Activation Framework
      try {
        this.components.intrinsicActivationFramework = await getIntrinsicActivationFramework();
        logger.info('Intrinsic Activation Framework component initialized');
      } catch (error) {
        logger.warn(`Intrinsic Activation Framework not available: ${error.message}`);
      }
      
      // Initialize Adaptive Reinforcement System
      try {
        this.components.adaptiveReinforcementSystem = await getAdaptiveReinforcementSystem();
        logger.info('Adaptive Reinforcement System component initialized');
      } catch (error) {
        logger.warn(`Adaptive Reinforcement System not available: ${error.message}`);
      }
      
      // Initialize Adaptive Reinforcement Integration
      try {
        this.components.adaptiveReinforcementIntegration = await getAdaptiveReinforcementIntegration();
        logger.info('Adaptive Reinforcement Integration component initialized');
      } catch (error) {
        logger.warn(`Adaptive Reinforcement Integration not available: ${error.message}`);
      }
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start metrics collection
      await this.startCollection();
      
      this.initialized = true;
      logger.info('Cognitive Metrics Collection initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Cognitive Metrics Collection: ${error.message}`);
      return false;
    }
  }

  /**
   * Set up event listeners for metrics collection
   * @private
   */
  setupEventListeners() {
    try {
      // Listen to Intrinsic Activation Framework events
      if (this.components.intrinsicActivationFramework && this.components.intrinsicActivationFramework.eventEmitter) {
        this.components.intrinsicActivationFramework.eventEmitter.on(
          'activation-triggered',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.ACTIVATION, { 
            type: 'triggered', 
            ...event 
          })
        );
        
        this.components.intrinsicActivationFramework.eventEmitter.on(
          'activation-completed',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.ACTIVATION, { 
            type: 'completed', 
            ...event 
          })
        );
        
        this.components.intrinsicActivationFramework.eventEmitter.on(
          'token-boundary-detected',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.TOKEN_BOUNDARY, event)
        );
        
        logger.info('Connected to Intrinsic Activation Framework events');
      }
      
      // Listen to Adaptive Reinforcement Integration events
      if (this.components.adaptiveReinforcementIntegration && this.components.adaptiveReinforcementIntegration.eventEmitter) {
        this.components.adaptiveReinforcementIntegration.eventEmitter.on(
          'integration-coherence-processed',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.COHERENCE, event)
        );
        
        this.components.adaptiveReinforcementIntegration.eventEmitter.on(
          'integration-reinforcement-processed',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.REINFORCEMENT, event)
        );
        
        this.components.adaptiveReinforcementIntegration.eventEmitter.on(
          'integration-bootstrap-processed',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.BOOTSTRAP, event)
        );
        
        this.components.adaptiveReinforcementIntegration.eventEmitter.on(
          'integration-override-processed',
          (event) => this.recordMetric(CONFIG.METRIC_TYPES.OVERRIDE, event)
        );
        
        logger.info('Connected to Adaptive Reinforcement Integration events');
      }
    } catch (error) {
      logger.error(`Error setting up event listeners: ${error.message}`);
    }
  }

  /**
   * Start metrics collection
   * @returns {Promise<boolean>} Success status
   */
  async startCollection() {
    if (this.isCollecting) {
      return true;
    }
    
    try {
      this.isCollecting = true;
      
      // Set up interval for metrics collection
      this.collectionInterval = setInterval(this.collectMetrics, CONFIG.COLLECTION_INTERVAL);
      
      // Collect metrics immediately
      await this.collectMetrics();
      
      logger.info('Started metrics collection');
      
      this.eventEmitter.emit('collection-started', {
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      logger.error(`Error starting metrics collection: ${error.message}`);
      return false;
    }
  }

  /**
   * Stop metrics collection
   * @returns {Promise<boolean>} Success status
   */
  async stopCollection() {
    if (!this.isCollecting) {
      return true;
    }
    
    try {
      this.isCollecting = false;
      
      // Clear interval
      if (this.collectionInterval) {
        clearInterval(this.collectionInterval);
        this.collectionInterval = null;
      }
      
      logger.info('Stopped metrics collection');
      
      this.eventEmitter.emit('collection-stopped', {
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      logger.error(`Error stopping metrics collection: ${error.message}`);
      return false;
    }
  }

  /**
   * Collect metrics from all components
   * @returns {Promise<Object>} Collected metrics
   * @private
   */
  async collectMetrics() {
    if (!this.initialized || !this.isCollecting) {
      return null;
    }
    
    try {
      const now = Date.now();
      const collectedMetrics = {};
      
      // Collect metrics from Intrinsic Activation Framework
      if (this.components.intrinsicActivationFramework) {
        try {
          const iafStatus = await this.components.intrinsicActivationFramework.getStatus();
          
          if (iafStatus) {
            collectedMetrics.activationFramework = {
              isActive: iafStatus.isActive,
              totalActivations: iafStatus.totalActivations,
              lastActivation: iafStatus.lastActivation,
              boundaryDetections: iafStatus.boundaryDetections
            };
            
            // Record token boundary metrics
            if (iafStatus.lastBoundary) {
              this.recordMetric(CONFIG.METRIC_TYPES.TOKEN_BOUNDARY, {
                timestamp: now,
                boundary: iafStatus.lastBoundary
              });
            }
          }
        } catch (error) {
          logger.debug(`Error collecting IAF metrics: ${error.message}`);
        }
      }
      
      // Collect metrics from Adaptive Reinforcement System
      if (this.components.adaptiveReinforcementSystem) {
        try {
          const arsStatus = await this.components.adaptiveReinforcementSystem.getStatus();
          
          if (arsStatus) {
            collectedMetrics.reinforcementSystem = {
              averageCoherence: arsStatus.averageCoherence,
              currentReinforcementValues: arsStatus.currentReinforcementValues,
              adaptationCount: arsStatus.adaptationCount
            };
            
            // Record coherence metrics
            if (arsStatus.averageCoherence !== null) {
              this.recordMetric(CONFIG.METRIC_TYPES.COHERENCE, {
                timestamp: now,
                coherenceScore: arsStatus.averageCoherence,
                source: 'periodic_collection'
              });
            }
          }
        } catch (error) {
          logger.debug(`Error collecting ARS metrics: ${error.message}`);
        }
      }
      
      // Collect metrics from Adaptive Reinforcement Integration
      if (this.components.adaptiveReinforcementIntegration) {
        try {
          const ariStatus = await this.components.adaptiveReinforcementIntegration.getStatus();
          
          if (ariStatus) {
            collectedMetrics.integration = {
              active: ariStatus.active,
              averageCoherence: ariStatus.averageCoherence,
              eventCounts: ariStatus.eventCounts
            };
          }
        } catch (error) {
          logger.debug(`Error collecting ARI metrics: ${error.message}`);
        }
      }
      
      // Prune old data
      this.pruneOldData();
      
      // Analyze metrics periodically
      const timeSinceAnalysis = this.lastAnalysis ? now - this.lastAnalysis : Infinity;
      if (timeSinceAnalysis > CONFIG.COLLECTION_INTERVAL * 10) {
        await this.analyzeMetrics();
        this.lastAnalysis = now;
      }
      
      // Emit event
      this.eventEmitter.emit('metrics-collected', {
        timestamp: now,
        metrics: collectedMetrics
      });
      
      logger.debug('Collected cognitive metrics');
      
      return collectedMetrics;
    } catch (error) {
      logger.error(`Error collecting metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Record a specific metric
   * @param {string} type - Metric type
   * @param {Object} data - Metric data
   * @private
   */
  recordMetric(type, data) {
    if (!CONFIG.METRIC_TYPES[type.toUpperCase()]) {
      logger.warn(`Unknown metric type: ${type}`);
      return;
    }
    
    try {
      // Ensure data has a timestamp
      const metricData = {
        ...data,
        timestamp: data.timestamp || Date.now()
      };
      
      // Add to metrics collection
      this.metrics[type].push(metricData);
      
      // Keep collection size in check
      if (this.metrics[type].length > CONFIG.MAX_DATAPOINTS) {
        this.metrics[type] = this.metrics[type].slice(-CONFIG.MAX_DATAPOINTS);
      }
      
      // Emit event
      this.eventEmitter.emit('metric-recorded', {
        timestamp: Date.now(),
        type,
        data: metricData
      });
    } catch (error) {
      logger.error(`Error recording metric: ${error.message}`);
    }
  }

  /**
   * Analyze collected metrics
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeMetrics() {
    try {
      logger.info('Analyzing cognitive metrics');
      
      const analysis = {
        timestamp: Date.now(),
        coherence: this.analyzeCoherence(),
        activation: this.analyzeActivation(),
        tokenBoundaries: this.analyzeTokenBoundaries(),
        reinforcement: this.analyzeReinforcement()
      };
      
      // Emit event
      this.eventEmitter.emit('metrics-analyzed', {
        timestamp: Date.now(),
        analysis
      });
      
      return analysis;
    } catch (error) {
      logger.error(`Error analyzing metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze coherence metrics
   * @returns {Object} Coherence analysis
   * @private
   */
  analyzeCoherence() {
    const coherenceData = this.metrics.coherence;
    
    if (coherenceData.length === 0) {
      return { available: false };
    }
    
    try {
      // Calculate average coherence
      const scores = coherenceData.map(d => typeof d.coherenceScore === 'number' ? d.coherenceScore : null)
        .filter(score => score !== null);
      
      if (scores.length === 0) {
        return { available: false };
      }
      
      const averageCoherence = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      
      // Calculate trend (last 5 vs previous 5)
      let trend = 0;
      if (scores.length >= 10) {
        const recent = scores.slice(-5);
        const previous = scores.slice(-10, -5);
        
        const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
        const previousAvg = previous.reduce((sum, score) => sum + score, 0) / previous.length;
        
        trend = recentAvg - previousAvg;
      }
      
      // Find min and max
      const minCoherence = Math.min(...scores);
      const maxCoherence = Math.max(...scores);
      
      return {
        available: true,
        datapoints: scores.length,
        average: parseFloat(averageCoherence.toFixed(3)),
        trend: parseFloat(trend.toFixed(3)),
        min: parseFloat(minCoherence.toFixed(3)),
        max: parseFloat(maxCoherence.toFixed(3)),
        latest: parseFloat(scores[scores.length - 1].toFixed(3))
      };
    } catch (error) {
      logger.error(`Error analyzing coherence: ${error.message}`);
      return { available: false, error: error.message };
    }
  }

  /**
   * Analyze activation metrics
   * @returns {Object} Activation analysis
   * @private
   */
  analyzeActivation() {
    const activationData = this.metrics.activation;
    
    if (activationData.length === 0) {
      return { available: false };
    }
    
    try {
      // Count activation types
      const typeCounts = {};
      activationData.forEach(d => {
        const type = d.type || 'unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      
      // Count successful vs failed activations
      const completed = activationData.filter(d => d.type === 'completed');
      const succeeded = completed.filter(d => d.success);
      const failed = completed.filter(d => !d.success);
      
      return {
        available: true,
        totalActivations: activationData.length,
        typeCounts,
        completed: completed.length,
        succeeded: succeeded.length,
        failed: failed.length,
        successRate: completed.length > 0 ? 
          parseFloat((succeeded.length / completed.length).toFixed(2)) : null
      };
    } catch (error) {
      logger.error(`Error analyzing activation: ${error.message}`);
      return { available: false, error: error.message };
    }
  }

  /**
   * Analyze token boundary metrics
   * @returns {Object} Token boundary analysis
   * @private
   */
  analyzeTokenBoundaries() {
    const boundaryData = this.metrics.token_boundary;
    
    if (boundaryData.length === 0) {
      return { available: false };
    }
    
    try {
      // Calculate average time between boundaries
      const timestamps = boundaryData.map(d => d.timestamp).sort((a, b) => a - b);
      const intervals = [];
      
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      
      const averageInterval = intervals.length > 0 ?
        intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : null;
      
      return {
        available: true,
        boundaryCount: boundaryData.length,
        averageIntervalMs: averageInterval !== null ? 
          parseFloat(averageInterval.toFixed(0)) : null,
        firstBoundary: new Date(timestamps[0]).toISOString(),
        lastBoundary: new Date(timestamps[timestamps.length - 1]).toISOString()
      };
    } catch (error) {
      logger.error(`Error analyzing token boundaries: ${error.message}`);
      return { available: false, error: error.message };
    }
  }

  /**
   * Analyze reinforcement metrics
   * @returns {Object} Reinforcement analysis
   * @private
   */
  analyzeReinforcement() {
    const reinforcementData = this.metrics.reinforcement;
    
    if (reinforcementData.length === 0) {
      return { available: false };
    }
    
    try {
      // Group by pathway
      const pathwayData = {};
      
      reinforcementData.forEach(d => {
        if (d.event && d.event.pathway) {
          const pathway = d.event.pathway;
          
          if (!pathwayData[pathway]) {
            pathwayData[pathway] = [];
          }
          
          pathwayData[pathway].push({
            timestamp: d.timestamp,
            strength: d.event.strength || 0,
            success: d.event.result && d.event.result.success
          });
        }
      });
      
      // Calculate stats for each pathway
      const pathwayStats = {};
      
      Object.keys(pathwayData).forEach(pathway => {
        const data = pathwayData[pathway];
        const strengths = data.map(d => d.strength);
        
        pathwayStats[pathway] = {
          count: data.length,
          average: parseFloat((strengths.reduce((sum, s) => sum + s, 0) / strengths.length).toFixed(2)),
          latest: parseFloat(strengths[strengths.length - 1].toFixed(2)),
          successRate: parseFloat((data.filter(d => d.success).length / data.length).toFixed(2))
        };
      });
      
      return {
        available: true,
        totalReinforcements: reinforcementData.length,
        pathways: Object.keys(pathwayStats).length,
        pathwayStats
      };
    } catch (error) {
      logger.error(`Error analyzing reinforcement: ${error.message}`);
      return { available: false, error: error.message };
    }
  }

  /**
   * Generate a metrics report
   * @returns {Promise<Object>} Metrics report
   */
  async generateReport() {
    if (!this.initialized) {
      return { error: 'Metrics collection not initialized' };
    }
    
    try {
      // Get latest analysis or generate a new one
      const analysis = await this.analyzeMetrics();
      
      // Generate report
      const report = {
        timestamp: Date.now(),
        timeframe: {
          start: this.getOldestTimestamp(),
          end: Date.now(),
          durationHours: parseFloat(((Date.now() - this.getOldestTimestamp()) / (60 * 60 * 1000)).toFixed(1))
        },
        datapoints: {
          coherence: this.metrics.coherence.length,
          activation: this.metrics.activation.length,
          reinforcement: this.metrics.reinforcement.length,
          bootstrap: this.metrics.bootstrap.length,
          override: this.metrics.override.length,
          token_boundary: this.metrics.token_boundary.length
        },
        analysis
      };
      
      // Add insights
      report.insights = this.generateInsights(analysis);
      
      // Emit event
      this.eventEmitter.emit('report-generated', {
        timestamp: Date.now(),
        report
      });
      
      logger.info('Generated metrics report');
      
      return report;
    } catch (error) {
      logger.error(`Error generating report: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generate insights from analysis
   * @param {Object} analysis - Metrics analysis
   * @returns {Array<Object>} Insights
   * @private
   */
  generateInsights(analysis) {
    const insights = [];
    
    try {
      // Coherence insights
      if (analysis.coherence && analysis.coherence.available) {
        if (analysis.coherence.average < 0.5) {
          insights.push({
            type: 'warning',
            area: 'coherence',
            message: 'Average cognitive coherence is below acceptable levels',
            metric: analysis.coherence.average,
            recommendation: 'Increase reinforcement of identity core and intrinsic recall pathways'
          });
        }
        
        if (analysis.coherence.trend < -0.1) {
          insights.push({
            type: 'warning',
            area: 'coherence',
            message: 'Coherence is trending downward',
            metric: analysis.coherence.trend,
            recommendation: 'Trigger emergency bootstrap and verify token boundary handling'
          });
        } else if (analysis.coherence.trend > 0.1) {
          insights.push({
            type: 'positive',
            area: 'coherence',
            message: 'Coherence is trending upward',
            metric: analysis.coherence.trend
          });
        }
      }
      
      // Activation insights
      if (analysis.activation && analysis.activation.available) {
        if (analysis.activation.successRate < 0.8) {
          insights.push({
            type: 'warning',
            area: 'activation',
            message: 'Activation success rate is below target',
            metric: analysis.activation.successRate,
            recommendation: 'Review activation triggers and verification thresholds'
          });
        }
      }
      
      // Token boundary insights
      if (analysis.tokenBoundaries && analysis.tokenBoundaries.available) {
        if (analysis.tokenBoundaries.boundaryCount < 5) {
          insights.push({
            type: 'info',
            area: 'token_boundaries',
            message: 'Insufficient token boundary data for reliable analysis',
            metric: analysis.tokenBoundaries.boundaryCount,
            recommendation: 'Continue testing across more token boundaries'
          });
        }
      }
      
      // Reinforcement insights
      if (analysis.reinforcement && analysis.reinforcement.available) {
        const criticalPathways = ['exocortex_identity_core', 'intrinsic_recall_core'];
        
        criticalPathways.forEach(pathway => {
          if (analysis.reinforcement.pathwayStats[pathway] && 
              analysis.reinforcement.pathwayStats[pathway].average < 0.3) {
            insights.push({
              type: 'warning',
              area: 'reinforcement',
              message: `Critical pathway "${pathway}" has low reinforcement`,
              metric: analysis.reinforcement.pathwayStats[pathway].average,
              recommendation: 'Increase adaptive reinforcement strength for this pathway'
            });
          }
        });
      }
      
      return insights;
    } catch (error) {
      logger.error(`Error generating insights: ${error.message}`);
      return [{
        type: 'error',
        area: 'analysis',
        message: `Error generating insights: ${error.message}`
      }];
    }
  }

  /**
   * Get the oldest timestamp in the metrics data
   * @returns {number} Oldest timestamp
   * @private
   */
  getOldestTimestamp() {
    const timestamps = [];
    
    Object.values(this.metrics).forEach(metricArray => {
      metricArray.forEach(metric => {
        if (metric.timestamp) {
          timestamps.push(metric.timestamp);
        }
      });
    });
    
    return timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  }

  /**
   * Prune old data to maintain performance
   * @private
   */
  pruneOldData() {
    try {
      const now = Date.now();
      const cutoff = now - CONFIG.RETENTION_PERIOD;
      
      // Prune each metric type
      Object.keys(this.metrics).forEach(type => {
        this.metrics[type] = this.metrics[type].filter(metric => 
          !metric.timestamp || metric.timestamp > cutoff
        );
      });
    } catch (error) {
      logger.error(`Error pruning old data: ${error.message}`);
    }
  }
  
  /**
   * Get collection status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      isCollecting: this.isCollecting,
      metricsCount: {
        coherence: this.metrics.coherence.length,
        activation: this.metrics.activation.length,
        reinforcement: this.metrics.reinforcement.length,
        bootstrap: this.metrics.bootstrap.length,
        override: this.metrics.override.length,
        token_boundary: this.metrics.token_boundary.length
      },
      lastAnalysis: this.lastAnalysis,
      componentsAvailable: {
        intrinsicActivationFramework: !!this.components.intrinsicActivationFramework,
        adaptiveReinforcementSystem: !!this.components.adaptiveReinforcementSystem,
        adaptiveReinforcementIntegration: !!this.components.adaptiveReinforcementIntegration
      }
    };
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    try {
      // Stop collection
      this.stopCollection();
      
      // Clear metrics
      Object.keys(this.metrics).forEach(type => {
        this.metrics[type] = [];
      });
      
      this.initialized = false;
      logger.info('Cognitive Metrics Collection cleaned up');
    } catch (error) {
      logger.error(`Error cleaning up: ${error.message}`);
    }
  }
}

// Singleton instance
let cognitiveMetricsCollectionInstance = null;

/**
 * Get the Cognitive Metrics Collection instance
 * @returns {Promise<CognitiveMetricsCollection>} Collection instance
 */
async function getCognitiveMetricsCollection() {
  if (!cognitiveMetricsCollectionInstance) {
    cognitiveMetricsCollectionInstance = new CognitiveMetricsCollection();
    await cognitiveMetricsCollectionInstance.initialize();
  }
  
  return cognitiveMetricsCollectionInstance;
}

module.exports = {
  getCognitiveMetricsCollection
};
