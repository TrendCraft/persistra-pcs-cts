/**
 * Boundary Health Monitor
 * 
 * This service provides visual indicators and health monitoring for token boundary awareness,
 * showing the status of context preservation across token boundaries and providing
 * real-time feedback on the system's ability to maintain cognitive continuity.
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const configService = require('./config-service');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Component name for logging and events
const COMPONENT_NAME = 'boundary-health-monitor';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Make these dependencies optional to avoid circular dependencies
let semanticContextManager;
try {
  semanticContextManager = require('./semantic-context-manager');
} catch (error) {
  logger.warn('Semantic Context Manager not available, some features will be limited');
  semanticContextManager = {
    isInitialized: false,
    getBoundaryStatus: () => ({ status: 'unknown', percentage: 0, enabled: false })
  };
}

/**
 * Get current boundary status
 * @returns {Object} Boundary status information
 * @private
 */
function getBoundaryStatus() {
  // First try to get status from semantic context manager
  if (semanticContextManager && semanticContextManager.getBoundaryStatus) {
    return semanticContextManager.getBoundaryStatus();
  }
  
  // Fallback to session boundary manager if available
  if (sessionBoundaryManager && sessionBoundaryManager.getBoundaryProximity) {
    const proximity = sessionBoundaryManager.getBoundaryProximity();
    return {
      status: proximity.status,
      percentage: proximity.percentage,
      enabled: true
    };
  }
  
  // Default fallback
  return {
    status: 'unknown',
    percentage: 0.5, // Default to middle of range
    enabled: false
  };
}

let sessionBoundaryManager;
try {
  sessionBoundaryManager = require('./session-boundary-manager');
} catch (error) {
  logger.warn('Session Boundary Manager not available, some features will be limited');
  sessionBoundaryManager = {
    isInitialized: false,
    getBoundaryProximity: () => ({ status: 'unknown', percentage: 0 })
  };
}

// Configuration with sensible defaults
let CONFIG = {
  HEALTH_CHECK_INTERVAL_MS: 5000,
  AMBIENT_AWARENESS_ENABLED: true,
  VISIBILITY_THRESHOLD: 0.75,
  PROGRESSIVE_DISCLOSURE: true,
  CONTEXT_QUALITY_THRESHOLD: 0.65,
  ADAPTIVE_THRESHOLDS: true,
  LOG_LEVEL: 'info',
  HEALTH_LOG_PATH: path.join(os.homedir(), '.leo', 'logs', 'boundary-health.log'),
  METRICS_ENABLED: true,
  ALERT_THRESHOLDS: {
    SUBTLE: 0.5,    // Start subtle indicators at 50% token usage
    AMBIENT: 0.7,   // Show ambient indicators at 70% token usage
    VISIBLE: 0.85   // Show visible indicators at 85% token usage
  }
};

// Initialization state
let isInitialized = false;
let healthCheckInterval = null;

// Health metrics with enhanced tracking for sophisticated context selection
let healthMetrics = {
  systemHealth: 'unknown',
  boundaryStatus: 'unknown',
  contextPreservationStatus: 'idle',
  boundaryTransitionCount: 0,
  successfulPreservations: 0,
  failedPreservations: 0,
  successfulRestorations: 0,
  failedRestorations: 0,
  preservationTimes: [],      // Array of preservation durations in ms
  contextQualityHistory: [],  // Array of context quality scores (0-1)
  preservationSizeHistory: [], // Array of context sizes preserved in bytes
  tokenUsageHistory: [],      // Array of token usage percentages
  lastCheckTimestamp: 0,
  lastPreservationTime: 0,
  lastHealthCheckTime: 0,
  averagePreservationTime: 0,
  totalPreservations: 0,
  totalRestorations: 0,
  lastStatus: 'unknown',
  statusHistory: [],
  preservationHistory: [],
  preservationQualityScore: 0, // Overall quality score (0-1)
  userFeedbackMetrics: {
    positiveIndicators: 0,
    negativeIndicators: 0,
    lastFeedbackTime: 0,
    adaptiveThresholdAdjustments: 0
  }
};

// User feedback metrics for adaptive behavior
let userFeedbackMetrics = {
  preferredVisibilityThreshold: null,  // User's preferred visibility threshold
  interactionCount: 0,                // Number of user interactions with indicators
  dismissCount: 0,                    // Number of times user dismissed indicators
  expandCount: 0,                     // Number of times user expanded indicators
  lastFeedbackTimestamp: 0
};

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  try {
    // Get configuration from config service
    const config = configService.getConfig() || {};
    
    // Map configuration values with defaults
    CONFIG = {
      HEALTH_CHECK_INTERVAL_MS: config.boundaryHealthMonitor?.healthCheckIntervalMs || CONFIG.HEALTH_CHECK_INTERVAL_MS,
      AMBIENT_AWARENESS_ENABLED: config.boundaryHealthMonitor?.ambientAwarenessEnabled !== undefined ? 
        config.boundaryHealthMonitor.ambientAwarenessEnabled : CONFIG.AMBIENT_AWARENESS_ENABLED,
      VISIBILITY_THRESHOLD: config.boundaryHealthMonitor?.visibilityThreshold || CONFIG.VISIBILITY_THRESHOLD,
      PROGRESSIVE_DISCLOSURE: config.boundaryHealthMonitor?.progressiveDisclosure !== undefined ?
        config.boundaryHealthMonitor.progressiveDisclosure : CONFIG.PROGRESSIVE_DISCLOSURE,
      LOG_LEVEL: config.boundaryHealthMonitor?.logLevel || CONFIG.LOG_LEVEL,
      HEALTH_LOG_PATH: config.boundaryHealthMonitor?.healthLogPath || CONFIG.HEALTH_LOG_PATH,
      METRICS_ENABLED: config.boundaryHealthMonitor?.metricsEnabled !== undefined ?
        config.boundaryHealthMonitor.metricsEnabled : CONFIG.METRICS_ENABLED,
      ALERT_THRESHOLDS: {
        SUBTLE: config.boundaryHealthMonitor?.alertThresholds?.subtle || CONFIG.ALERT_THRESHOLDS.SUBTLE,
        AMBIENT: config.boundaryHealthMonitor?.alertThresholds?.ambient || CONFIG.ALERT_THRESHOLDS.AMBIENT,
        VISIBLE: config.boundaryHealthMonitor?.alertThresholds?.visible || CONFIG.ALERT_THRESHOLDS.VISIBLE
      }
    };
    
    logger.info('Configuration initialized');
  } catch (error) {
    logger.warn(`Error loading configuration, using defaults: ${error.message}`);
    // Keep using the default CONFIG values
  }
}

/**
 * Check boundary health and update metrics
 * @returns {Object} Health status
 * @private
 */
async function checkBoundaryHealth() {
  try {
    logger.debug('Checking boundary health...');
    
    // Get boundary status from semantic context manager
    let boundaryStatus = { status: 'unknown', percentage: 0, enabled: false };
    
    if (semanticContextManager && semanticContextManager.isInitialized) {
      boundaryStatus = semanticContextManager.getBoundaryStatus ? 
        semanticContextManager.getBoundaryStatus() : 
        boundaryStatus;
    } else if (sessionBoundaryManager && sessionBoundaryManager.isInitialized) {
      boundaryStatus = sessionBoundaryManager.getBoundaryProximity();
      boundaryStatus.enabled = true;
    }
    
    // Update health metrics
    healthMetrics.boundaryStatus = boundaryStatus.status;
    healthMetrics.contextPreservationStatus = boundaryStatus.isPreservingContext ? 'preserving' : 'idle';
    healthMetrics.lastCheckTimestamp = Date.now();
    
    // Determine overall system health
    if (boundaryStatus.status === 'critical') {
      healthMetrics.systemHealth = 'critical';
    } else if (boundaryStatus.status === 'warning') {
      healthMetrics.systemHealth = 'warning';
    } else if (boundaryStatus.status === 'normal') {
      healthMetrics.systemHealth = 'healthy';
    } else {
      healthMetrics.systemHealth = 'unknown';
    }
    
    // Log health status
    if (CONFIG.METRICS_ENABLED) {
      await logHealthMetrics();
    }
    
    // Get ambient awareness indicators
    const ambientStatus = ambientAwarenessIndicator();
    
    // Emit health status event with ambient awareness information
    eventBus.emit('boundary-health:status', {
      status: healthMetrics.systemHealth,
      boundaryStatus: boundaryStatus.status,
      contextPreservation: healthMetrics.contextPreservationStatus,
      percentage: boundaryStatus.percentage,
      timestamp: healthMetrics.lastCheckTimestamp,
      ambient: {
        visible: ambientStatus.visible,
        level: ambientStatus.level,
        indicator: ambientStatus.indicator
      }
    });
    
    // If we're at a critical threshold, emit a specific event for proactive action
    if (boundaryStatus.percentage >= CONFIG.ALERT_THRESHOLDS.VISIBLE) {
      eventBus.emit('boundary-health:critical-threshold', {
        percentage: boundaryStatus.percentage,
        status: boundaryStatus.status,
        timestamp: Date.now(),
        requiresAction: true
      });
    }
    
    return {
      status: healthMetrics.systemHealth,
      metrics: { ...healthMetrics },
      boundaryStatus,
      ambient: ambientStatus
    };
  } catch (error) {
    logger.error(`Error checking boundary health: ${error.message}`);
    return {
      status: 'error',
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Log health metrics to file
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function logHealthMetrics() {
  try {
    // Ensure log directory exists
    const logDir = path.dirname(CONFIG.HEALTH_LOG_PATH);
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (dirError) {
      // Ignore directory already exists error
    }
    
    // Format metrics as JSON
    const metricsLog = {
      timestamp: Date.now(),
      boundaryStatus: healthMetrics.boundaryStatus,
      contextPreservationStatus: healthMetrics.contextPreservationStatus,
      systemHealth: healthMetrics.systemHealth,
      boundaryTransitionCount: healthMetrics.boundaryTransitionCount,
      successfulPreservations: healthMetrics.successfulPreservations,
      failedPreservations: healthMetrics.failedPreservations
    };
    
    // Append to log file using callback pattern
    return new Promise((resolve, reject) => {
      fs.appendFile(
        CONFIG.HEALTH_LOG_PATH,
        JSON.stringify(metricsLog) + '\n',
        { encoding: 'utf8' },
        (err) => {
          if (err) {
            logger.warn(`Error writing to health log: ${err.message}`);
            reject(err);
          } else {
            resolve(true);
          }
        }
      );
    });
  } catch (error) {
    logger.warn(`Error logging health metrics: ${error.message}`);
    return false;
  }
}

/**
 * Provide ambient awareness indicators based on boundary status and context quality
 * Following progressive disclosure principles - only becoming more visible as needed
 * @param {boolean} [forceVisible=false] - Force visibility regardless of thresholds
 * @param {Object} [options={}] - Additional options for indicator customization
 * @param {boolean} [options.includeMetrics=false] - Whether to include detailed metrics
 * @param {boolean} [options.adaptToUserFeedback=true] - Whether to adapt based on user feedback
 * @param {boolean} [options.considerContextQuality=true] - Whether to consider context quality in indicators
 * @returns {Promise<Object>} Ambient indicator information
 * @private
 */
async function ambientAwarenessIndicator(forceVisible = false, options = {}) {
  const {
    includeMetrics = false,
    adaptToUserFeedback = true,
    considerContextQuality = true
  } = options;
  
  // Get current boundary status
  const boundaryStatus = getBoundaryStatus();
  let boundaryPercentage = boundaryStatus.percentage || 0;
  let boundaryStatusText = boundaryStatus.status || 'unknown';
  
  // Get context quality metrics if enabled
  let contextQuality = { overallQuality: 0.5 };
  if (considerContextQuality && semanticContextManager && semanticContextManager.getContextQualityMetrics) {
    try {
      contextQuality = await getContextQualityMetrics();
    } catch (error) {
      logger.warn(`Error getting context quality metrics: ${error.message}`);
    }
  }
  
  // Default indicator (invisible/minimal)
  let indicator = {
    visible: false,
    level: 'none',
    color: 'transparent',
    message: '',
    icon: null,
    metrics: null,
    contextQualityIndicator: null
  };
  
  // If ambient awareness is disabled, return minimal indicator
  if (!CONFIG.AMBIENT_AWARENESS_ENABLED) {
    return indicator;
  }
  
  // Determine visibility based on boundary status, context quality, and thresholds
  let shouldBeVisible = forceVisible;
  let visibilityThreshold = CONFIG.VISIBILITY_THRESHOLD;
  
  // Adjust visibility threshold based on context quality
  if (considerContextQuality && CONFIG.ADAPTIVE_THRESHOLDS) {
    // If context quality is low, show indicators earlier (lower threshold)
    // If context quality is high, we can wait longer (higher threshold)
    const qualityAdjustment = (contextQuality.overallQuality - 0.5) * 0.2; // -0.1 to +0.1 adjustment
    visibilityThreshold = Math.max(0.5, Math.min(0.9, CONFIG.VISIBILITY_THRESHOLD - qualityAdjustment));
  }
  
  if (!shouldBeVisible && boundaryPercentage >= visibilityThreshold) {
    shouldBeVisible = true;
  }
  
  // If user feedback indicates they prefer more visibility, adjust threshold
  if (adaptToUserFeedback && userFeedbackMetrics && userFeedbackMetrics.visibilityPreference > 0) {
    const userAdjustedThreshold = visibilityThreshold - (userFeedbackMetrics.visibilityPreference * 0.1);
    if (boundaryPercentage >= userAdjustedThreshold) {
      shouldBeVisible = true;
    }
  }
  
  // If not visible, return minimal indicator
  if (!shouldBeVisible) {
    return indicator;
  }
  
  // Determine visibility level based on progressive disclosure principles
  let visibilityLevel = 'none';
  
  // Define thresholds with sensible defaults if not configured
  const thresholds = {
    SUBTLE: CONFIG.THRESHOLDS?.SUBTLE || 0.5,
    AMBIENT: CONFIG.THRESHOLDS?.AMBIENT || 0.7,
    VISIBLE: CONFIG.THRESHOLDS?.VISIBLE || 0.85
  };
  
  if (forceVisible) {
    visibilityLevel = 'visible';
  } else if (boundaryPercentage >= thresholds.VISIBLE) {
    visibilityLevel = 'visible';
  } else if (boundaryPercentage >= thresholds.AMBIENT) {
    visibilityLevel = 'ambient';
  } else if (boundaryPercentage >= thresholds.SUBTLE) {
    visibilityLevel = 'subtle';
  }
  
  // Get token and time estimates if available
  let tokenRemaining = 0;
  let estimatedTimeRemaining = 0;
  
  if (boundaryStatus.tokensRemaining) {
    tokenRemaining = boundaryStatus.tokensRemaining;
  }
  
  if (boundaryStatus.estimatedTimeRemaining) {
    estimatedTimeRemaining = boundaryStatus.estimatedTimeRemaining;
  }
  
  // Define enhanced ambient indicators for different visibility levels
  const indicators = {
    none: {
      symbol: '',
      color: 'default',
      message: ''
    },
    subtle: {
      symbol: '•',  // Subtle dot indicator
      color: 'blue',
      message: 'Context continuity maintained',
      detailedMessage: `Context quality: ${Math.round(contextQuality.overallQuality * 100)}%`
    },
    ambient: {
      symbol: '◐',  // Ambient half-circle indicator
      color: 'cyan',
      message: 'Approaching token boundary',
      detailedMessage: estimatedTimeRemaining > 0 ? 
        `~${estimatedTimeRemaining} minutes remaining` : 
        `${tokenRemaining} tokens remaining`
    },
    visible: {
      symbol: '◉',  // Visible circle indicator
      color: 'yellow',
      message: 'Token boundary imminent',
      detailedMessage: 'Context preservation active'
    }
  };
  
  // Update our indicator with the appropriate values
  indicator.visible = true;
  indicator.level = visibilityLevel;
  indicator.color = indicators[visibilityLevel].color;
  indicator.icon = indicators[visibilityLevel].symbol;
  indicator.message = indicators[visibilityLevel].message;
  
  // Create a minimal, ambient indicator that doesn't disrupt flow
  let displayText = '';
  let detailedText = '';
  
  if (visibilityLevel !== 'none') {
    // Enhanced color formatting with gradients for terminal output
    const colorCodes = {
      default: '',
      blue: '\u001b[34m',
      lightBlue: '\u001b[94m',
      cyan: '\u001b[36m',
      lightCyan: '\u001b[96m',
      yellow: '\u001b[33m',
      lightYellow: '\u001b[93m',
      orange: '\u001b[38;5;208m',
      green: '\u001b[32m',
      red: '\u001b[31m',
      bold: '\u001b[1m',
      reset: '\u001b[0m'
    };
    
    // Create progressively more visible indicators based on level with enhanced visuals
    if (visibilityLevel === 'subtle') {
      // Subtle indicator - just a small dot in the corner with hover-like detailed info
      displayText = `${colorCodes.blue}${indicator.icon}${colorCodes.reset}`;
      if (includeMetrics) {
        detailedText = `${colorCodes.lightBlue}${indicators[visibilityLevel].detailedMessage}${colorCodes.reset}`;
      }
    } else if (visibilityLevel === 'ambient') {
      // Ambient indicator - symbol with percentage and token info
      const percentage = Math.round(boundaryPercentage * 100);
      // Create a color gradient based on percentage
      const colorCode = percentage < 75 ? colorCodes.cyan : colorCodes.lightCyan;
      displayText = `${colorCode}${indicator.icon} ${percentage}%${colorCodes.reset}`;
      if (includeMetrics) {
        detailedText = `${colorCode}${indicators[visibilityLevel].detailedMessage}${colorCodes.reset}`;
      }
    } else if (visibilityLevel === 'visible') {
      // Visible indicator - full message with context preservation status and detailed metrics
      const preservationStatus = healthMetrics.contextPreservationStatus === 'preserving' ? 
        'active' : 'pending';
      // Create a color gradient based on preservation status
      const colorCode = preservationStatus === 'active' ? colorCodes.yellow : colorCodes.orange;
      displayText = `${colorCode}${colorCodes.bold}${indicator.icon} ${indicator.message}${colorCodes.reset}`;
      if (includeMetrics) {
        // Include detailed context preservation metrics
        const contextMetrics = getContextPreservationMetrics();
        detailedText = `${colorCode}${indicators[visibilityLevel].detailedMessage} (${preservationStatus})\n` +
          `Context quality: ${Math.round(contextQuality.overallQuality * 100)}%, ` +
          `Preservation success rate: ${Math.round(contextMetrics.successRate * 100)}%${colorCodes.reset}`;
      } else {
        detailedText = `${colorCode}${indicators[visibilityLevel].detailedMessage} (${preservationStatus})${colorCodes.reset}`;
      }
    }
    
    // Only log to console if forced or at visible level
    if (forceVisible || visibilityLevel === 'visible') {
      // For visible level or forced display, show a minimal status line
      console.log(`\n${displayText}`);
      if (detailedText) {
        console.log(`  ${detailedText}`);
      }
    }
  }
  
  // Return enhanced indicator information with more metrics
  return {
    visible: visibilityLevel !== 'none',
    level: visibilityLevel,
    indicator: displayText,
    detailedIndicator: detailedText,
    percentage: boundaryPercentage,
    status: boundaryStatus,
    preservationStatus: healthMetrics.contextPreservationStatus,
    contextQuality: contextQuality,
    tokensRemaining: tokenRemaining,
    estimatedTimeRemaining: estimatedTimeRemaining,
    thresholds: thresholds
  };
}

/**
 * Get context preservation metrics for detailed reporting
 * @returns {Object} Context preservation metrics
 * @private
 */
function getContextPreservationMetrics() {
  // Calculate success rate based on successful vs. failed preservations
  const totalPreservations = healthMetrics.successfulPreservations + healthMetrics.failedPreservations;
  const successRate = totalPreservations > 0 ? 
    healthMetrics.successfulPreservations / totalPreservations : 1.0;
  
  // Calculate average preservation time if available
  let averagePreservationTime = 0;
  if (healthMetrics.preservationTimes && healthMetrics.preservationTimes.length > 0) {
    const sum = healthMetrics.preservationTimes.reduce((a, b) => a + b, 0);
    averagePreservationTime = sum / healthMetrics.preservationTimes.length;
  }
  
  // Calculate context quality trend if available
  let qualityTrend = 'stable';
  if (healthMetrics.contextQualityHistory && healthMetrics.contextQualityHistory.length >= 2) {
    const current = healthMetrics.contextQualityHistory[healthMetrics.contextQualityHistory.length - 1];
    const previous = healthMetrics.contextQualityHistory[healthMetrics.contextQualityHistory.length - 2];
    if (current > previous * 1.05) {
      qualityTrend = 'improving';
    } else if (current < previous * 0.95) {
      qualityTrend = 'declining';
    }
  }
  
  return {
    successRate,
    totalPreservations,
    successfulPreservations: healthMetrics.successfulPreservations,
    failedPreservations: healthMetrics.failedPreservations,
    averagePreservationTime,
    lastPreservationTime: healthMetrics.lastPreservationTime,
    qualityTrend
  };
}

/**
 * Get context quality metrics from semantic context manager with enhanced analytics
 * This function retrieves sophisticated metrics about context quality across token boundaries
 * @returns {Promise<Object>} Context quality metrics with detailed analysis
 * @private
 */
async function getContextQualityMetrics() {
  try {
    // First try to get metrics from semantic context manager
    if (semanticContextManager && semanticContextManager.getContextQualityMetrics) {
      const metrics = await semanticContextManager.getContextQualityMetrics();
      
      // Track metrics history for trend analysis
      if (metrics && metrics.overallQuality) {
        // Keep only the last 10 entries to avoid excessive memory usage
        if (healthMetrics.contextQualityHistory.length >= 10) {
          healthMetrics.contextQualityHistory.shift();
        }
        
        // Add timestamp to the metrics for trend analysis
        const metricsWithTimestamp = {
          ...metrics,
          timestamp: Date.now()
        };
        
        healthMetrics.contextQualityHistory.push(metricsWithTimestamp);
        
        // Calculate trend to provide predictive insights
        const trend = calculateQualityTrend(healthMetrics.contextQualityHistory);
        
        // Enrich metrics with trend information
        return {
          ...metrics,
          trend,
          historyAvailable: true,
          predictedQuality: predictFutureQuality(metrics, trend)
        };
      }
      
      return metrics;
    }
    
    // If semantic context manager is not available, return default metrics
    return {
      overallQuality: 0.5, // Default to medium quality
      coverage: 0.5,
      relevance: 0.5,
      recency: 0.5,
      diversity: 0.5,
      historyAvailable: false
    };
  } catch (error) {
    logger.warn(`Error getting context quality metrics: ${error.message}`);
    return {
      overallQuality: 0.5,
      coverage: 0.5,
      relevance: 0.5,
      recency: 0.5,
      diversity: 0.5,
      error: error.message,
      historyAvailable: false
    };
  }
}

/**
 * Calculate quality trend based on historical metrics
 * @param {Array} history - Array of historical quality metrics
 * @returns {Object} Trend information
 * @private
 */
function calculateQualityTrend(history) {
  if (!history || history.length < 2) {
    return { direction: 'stable', rate: 0 };
  }
  
  // Calculate trend over the last few data points
  const recentHistory = history.slice(-5); // Use last 5 data points
  
  // Calculate slope of quality over time
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = recentHistory.length;
  
  recentHistory.forEach((item, index) => {
    const x = index;
    const y = item.overallQuality;
    
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  });
  
  // Calculate slope using least squares method
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  
  // Determine trend direction and magnitude
  let direction = 'stable';
  if (slope > 0.05) {
    direction = 'improving';
  } else if (slope < -0.05) {
    direction = 'declining';
  }
  
  return {
    direction,
    rate: slope,
    dataPoints: n
  };
}

/**
 * Predict future context quality based on current metrics and trend
 * @param {Object} currentMetrics - Current quality metrics
 * @param {Object} trend - Trend information
 * @returns {Object} Predicted future quality
 * @private
 */
function predictFutureQuality(currentMetrics, trend) {
  const currentQuality = currentMetrics.overallQuality;
  
  // Simple linear prediction for next boundary crossing
  const predictedQuality = Math.max(0, Math.min(1, currentQuality + trend.rate));
  
  return {
    nextBoundary: predictedQuality,
    confidence: Math.max(0, 1 - Math.abs(trend.rate) * 2) // Lower confidence with higher rate of change
  };
}

/**
 * Display detailed boundary status (only when explicitly requested)
 * This is not the primary interface - ambient indicators are preferred
 * @private
 */
function displayDetailedStatus() {
  // Get current boundary status with forced visibility
  const ambientStatus = ambientAwarenessIndicator(true);
  
  // Define status indicators
  const statusSymbols = {
    normal: '✓',
    warning: '⚠',
    critical: '!',
    unknown: '?',
    preserving: '⟳',
    idle: '⦿'
  };
  
  // Get appropriate indicators
  const healthSymbol = statusSymbols[healthMetrics.systemHealth] || statusSymbols.unknown;
  const preservationSymbol = statusSymbols[healthMetrics.contextPreservationStatus] || statusSymbols.unknown;
  
  // Calculate percentage display
  let percentageBar = '';
  if (ambientStatus.percentage > 0) {
    const percentage = Math.round(ambientStatus.percentage * 100);
    
    // Create a minimal progress indicator
    const barLength = 10;
    const filledLength = Math.round(ambientStatus.percentage * barLength);
    const emptyLength = barLength - filledLength;
    
    percentageBar = `[${
      '█'.repeat(filledLength) + 
      '·'.repeat(emptyLength)
    }] ${percentage}%`;
  }
  
  // Display minimal status information
  console.log('\n• Cognitive Continuity Status');
  console.log(`  ${healthSymbol} System: ${healthMetrics.systemHealth}`);
  console.log(`  ${preservationSymbol} Context: ${healthMetrics.contextPreservationStatus}`);
  
  if (percentageBar) {
    console.log(`  ${percentageBar}`);
  }
  
  // Only show detailed metrics if explicitly requested
  console.log(`  Transitions: ${healthMetrics.boundaryTransitionCount}, Preservations: ${healthMetrics.successfulPreservations}`);
}

/**
 * Handle boundary status change event
 * @param {Object} data - Event data
 * @private
 */
function handleBoundaryStatusChange(data) {
  logger.debug('Boundary status change detected', data);
  
  // Update metrics based on status change
  if (data.status === 'critical' && healthMetrics.boundaryStatus !== 'critical') {
    // Transition to critical state
    logger.warn('Boundary status transitioned to CRITICAL');
    
    // Emit critical boundary event
    eventBus.emit('boundary-health:critical', {
      percentage: data.percentage,
      timestamp: Date.now()
    });
  } else if (data.status === 'warning' && healthMetrics.boundaryStatus !== 'warning') {
    // Transition to warning state
    logger.info('Boundary status transitioned to WARNING');
    
    // Emit warning boundary event
    eventBus.emit('boundary-health:warning', {
      percentage: data.percentage,
      timestamp: Date.now()
    });
  }
  
  // Update current status
  healthMetrics.boundaryStatus = data.status;
}

/**
 * Handle context preservation event
 * @param {Object} data - Event data
 * @private
 */
function handleContextPreserved(data) {
  logger.info('Context preservation detected', data);
  
  // Update metrics
  healthMetrics.contextPreservationStatus = 'preserving';
  healthMetrics.successfulPreservations++;
  
  // Emit health update event
  eventBus.emit('boundary-health:preservation-success', {
    boundaryId: data.boundaryId,
    timestamp: data.timestamp
  });
}

/**
 * Handle context restoration event
 * @param {Object} data - Event data
 * @private
 */
function handleContextRestored(data) {
  logger.info('Context restoration detected', data);
  
  // Update metrics
  healthMetrics.contextPreservationStatus = 'idle';
  healthMetrics.boundaryTransitionCount++;
  
  // Emit health update event
  eventBus.emit('boundary-health:boundary-crossed', {
    boundaryId: data.boundaryId,
    timestamp: data.timestamp,
    originalTimestamp: data.originalTimestamp
  });
}

/**
 * Handle context preservation failure event
 * @param {Object} data - Event data
 * @private
 */
function handlePreservationFailure(data) {
  logger.warn('Context preservation failure detected', data);
  
  // Update metrics
  healthMetrics.failedPreservations++;
  
  // Emit health update event
  eventBus.emit('boundary-health:preservation-failure', {
    error: data.error,
    timestamp: Date.now()
  });
}

/**
 * Initialize the boundary health monitor
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  if (isInitialized) {
    logger.info('Boundary health monitor already initialized');
    return true;
  }
  
  try {
    logger.info('Initializing boundary health monitor...');
    
    // Initialize configuration
    initializeConfig();
    
    // Update configuration with provided options
    CONFIG = { ...CONFIG, ...options };
    
    // Subscribe to relevant events
    eventBus.on('semantic-context-manager:boundary-status', handleBoundaryStatusChange, COMPONENT_NAME);
    eventBus.on('semantic-context-manager:context-preserved', handleContextPreserved, COMPONENT_NAME);
    eventBus.on('semantic-context-manager:context-restored', handleContextRestored, COMPONENT_NAME);
    eventBus.on('semantic-context-manager:preservation-failure', handlePreservationFailure, COMPONENT_NAME);
    
    // Set up health check interval
    healthCheckInterval = setInterval(checkBoundaryHealth, CONFIG.HEALTH_CHECK_INTERVAL_MS);
    
    // Perform initial health check
    await checkBoundaryHealth();
    
    isInitialized = true;
    logger.info('Boundary health monitor initialized successfully');
    
    // Emit initialization event
    eventBus.emit('boundary-health:initialized', {
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize boundary health monitor: ${error.message}`);
    return false;
  }
}

/**
 * Get current health status with ambient awareness information
 * @param {Object} options - Options
 * @param {boolean} [options.includeAmbientIndicator=false] - Whether to include ambient indicator
 * @returns {Object} Health status with ambient awareness information
 */
function getHealthStatus(options = {}) {
  // Get ambient indicator if requested
  const ambientInfo = options.includeAmbientIndicator ? 
    ambientAwarenessIndicator(false) : 
    { visible: false, level: 'none', indicator: '' };
  
  return {
    systemHealth: healthMetrics.systemHealth,
    boundaryStatus: healthMetrics.boundaryStatus,
    contextPreservationStatus: healthMetrics.contextPreservationStatus,
    metrics: { ...healthMetrics },
    timestamp: Date.now(),
    ambient: ambientInfo
  };
}

/**
 * Get ambient awareness indicator with enhanced context quality integration
 * @param {Object} options - Options for indicator customization
 * @param {boolean} [options.forceVisible=false] - Force visibility regardless of thresholds
 * @param {boolean} [options.includeMetrics=false] - Whether to include detailed metrics
 * @param {boolean} [options.adaptToUserFeedback=true] - Whether to adapt based on user feedback
 * @param {boolean} [options.considerContextQuality=true] - Whether to consider context quality in indicators
 * @param {boolean} [options.predictiveFeedback=false] - Whether to include predictive feedback about future context quality
 * @returns {Promise<Object>} Enhanced ambient indicator information
 */
async function getAmbientIndicator(options = {}) {
  const {
    forceVisible = false,
    includeMetrics = false,
    adaptToUserFeedback = true,
    considerContextQuality = true,
    predictiveFeedback = false
  } = options;
  
  // Get basic ambient indicator
  const indicator = await ambientAwarenessIndicator(forceVisible, {
    includeMetrics,
    adaptToUserFeedback,
    considerContextQuality
  });
  
  // If predictive feedback is requested, enhance with future quality predictions
  if (predictiveFeedback && indicator.visible) {
    try {
      // Get context quality metrics with trend analysis
      const qualityMetrics = await getContextQualityMetrics();
      
      // Only add predictive feedback if we have history available
      if (qualityMetrics.historyAvailable && qualityMetrics.predictedQuality) {
        const prediction = qualityMetrics.predictedQuality;
        
        // Add predictive insights to the indicator
        indicator.predictiveFeedback = {
          nextBoundaryQuality: prediction.nextBoundary,
          confidence: prediction.confidence,
          trend: qualityMetrics.trend.direction,
          recommendation: getRecommendationBasedOnTrend(qualityMetrics.trend)
        };
      }
    } catch (error) {
      logger.warn(`Error adding predictive feedback to ambient indicator: ${error.message}`);
    }
  }
  
  return indicator;
}

/**
 * Get recommendation based on context quality trend
 * @param {Object} trend - Trend information
 * @returns {string} Recommendation for maintaining context quality
 * @private
 */
function getRecommendationBasedOnTrend(trend) {
  if (!trend) return '';
  
  switch (trend.direction) {
    case 'improving':
      return 'Context quality is improving. Continue current interaction pattern.';
    case 'declining':
      if (trend.rate < -0.1) {
        return 'Context quality declining rapidly. Consider summarizing current context before boundary crossing.';
      } else {
        return 'Context quality gradually declining. Consider refreshing key context elements.';
      }
    case 'stable':
    default:
      return 'Context quality stable. Normal boundary crossing recommended.';
  }
}

/**
 * Display status information with enhanced context quality metrics
 * This is not the primary interface - ambient indicators are preferred
 * @param {Object} options - Options for status display
 * @param {boolean} [options.detailed=false] - Whether to show detailed information
 * @param {boolean} [options.includeMetrics=false] - Whether to include detailed metrics
 * @param {boolean} [options.predictiveFeedback=false] - Whether to include predictive feedback
 * @returns {Promise<boolean>} Success status
 */
async function displayStatus(options = {}) {
  const {
    detailed = false,
    includeMetrics = false,
    predictiveFeedback = false
  } = options;
  
  if (!isInitialized) {
    logger.warn('Boundary health monitor not initialized');
    return false;
  }
  
  try {
    if (detailed) {
      // Show detailed status with enhanced context quality metrics
      await displayDetailedStatusWithQualityMetrics(includeMetrics, predictiveFeedback);
    } else {
      // Show enhanced ambient indicator with forced visibility
      const indicator = await getAmbientIndicator({
        forceVisible: true,
        includeMetrics,
        predictiveFeedback
      });
      
      // Display the indicator
      console.log('\n=== Leo Boundary Status ===');
      console.log(`Status: ${indicator.level} (${Math.round(indicator.percentage * 100)}%)`);
      
      if (indicator.message) {
        console.log(`Message: ${indicator.message}`);
      }
      
      if (predictiveFeedback && indicator.predictiveFeedback) {
        console.log('\n--- Predictive Insights ---');
        console.log(`Trend: Context quality is ${indicator.predictiveFeedback.trend}`);
        console.log(`Recommendation: ${indicator.predictiveFeedback.recommendation}`);
      }
      
      if (includeMetrics) {
        const qualityMetrics = await getContextQualityMetrics();
        console.log('\n--- Context Quality Metrics ---');
        console.log(`Overall Quality: ${Math.round(qualityMetrics.overallQuality * 100)}%`);
        console.log(`Coverage: ${Math.round(qualityMetrics.coverage * 100)}%`);
        console.log(`Relevance: ${Math.round(qualityMetrics.relevance * 100)}%`);
      }
      
      console.log('===========================');
    }
    return true;
  } catch (error) {
    logger.error(`Error displaying status: ${error.message}`);
    return false;
  }
}

/**
 * Display detailed status with enhanced context quality metrics
 * @param {boolean} includeMetrics - Whether to include detailed metrics
 * @param {boolean} predictiveFeedback - Whether to include predictive feedback
 * @returns {Promise<void>}
 * @private
 */
async function displayDetailedStatusWithQualityMetrics(includeMetrics = false, predictiveFeedback = false) {
  // Get boundary status
  const boundaryStatus = getBoundaryStatus();
  
  // Get context quality metrics
  const qualityMetrics = await getContextQualityMetrics();
  
  // Get context preservation metrics
  const preservationMetrics = getContextPreservationMetrics();
  
  console.log('\n=== Leo Boundary Health Monitor: Detailed Status ===');
  console.log(`Boundary Status: ${boundaryStatus.status} (${Math.round(boundaryStatus.percentage * 100)}%)`);
  console.log(`Context Preservation: ${preservationMetrics.status}`);
  console.log(`Context Quality: ${Math.round(qualityMetrics.overallQuality * 100)}%`);
  
  if (predictiveFeedback && qualityMetrics.trend) {
    console.log('\n--- Predictive Analysis ---');
    console.log(`Quality Trend: ${qualityMetrics.trend.direction} (rate: ${qualityMetrics.trend.rate.toFixed(3)})`);
    
    if (qualityMetrics.predictedQuality) {
      console.log(`Predicted Quality at Next Boundary: ${Math.round(qualityMetrics.predictedQuality.nextBoundary * 100)}%`);
      console.log(`Prediction Confidence: ${Math.round(qualityMetrics.predictedQuality.confidence * 100)}%`);
    }
    
    // Get recommendation based on trend
    const recommendation = getRecommendationBasedOnTrend(qualityMetrics.trend);
    console.log(`Recommendation: ${recommendation}`);
  }
  
  if (includeMetrics) {
    console.log('\n--- Detailed Metrics ---');
    console.log(`Context Coverage: ${Math.round(qualityMetrics.coverage * 100)}%`);
    console.log(`Context Relevance: ${Math.round(qualityMetrics.relevance * 100)}%`);
    console.log(`Context Recency: ${Math.round(qualityMetrics.recency * 100)}%`);
    console.log(`Context Diversity: ${Math.round(qualityMetrics.diversity * 100)}%`);
    console.log('\n--- Preservation Statistics ---');
    console.log(`Successful Preservations: ${healthMetrics.successfulPreservations}`);
    console.log(`Failed Preservations: ${healthMetrics.failedPreservations}`);
    console.log(`Successful Restorations: ${healthMetrics.successfulRestorations}`);
    console.log(`Failed Restorations: ${healthMetrics.failedRestorations}`);
    console.log(`Average Preservation Time: ${healthMetrics.averagePreservationTime}ms`);
  }
  
  console.log('===================================================');
}

/**
 * Clean up resources
 * @returns {Promise<boolean>} Success status
 */
async function cleanup() {
  try {
    logger.info('Cleaning up boundary health monitor...');
    
    // Clear health check interval
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    
    // Unsubscribe from events
    eventBus.off('semantic-context-manager:boundary-status', handleBoundaryStatusChange);
    eventBus.off('semantic-context-manager:context-preserved', handleContextPreserved);
    eventBus.off('semantic-context-manager:context-restored', handleContextRestored);
    eventBus.off('semantic-context-manager:preservation-failure', handlePreservationFailure);
    
    isInitialized = false;
    logger.info('Boundary health monitor cleaned up successfully');
    return true;
  } catch (error) {
    logger.error(`Error cleaning up boundary health monitor: ${error.message}`);
    return false;
  }
}

// Export public API
module.exports = {
  initialize,
  getHealthStatus,
  getAmbientIndicator,
  displayStatus,
  cleanup,
  get isInitialized() {
    return isInitialized;
  }
};
