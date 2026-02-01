/**
 * Adaptive Reinforcement System
 * 
 * This module extends the Neural Pathway Reinforcement service with adaptive capabilities
 * that adjust reinforcement strength and frequency based on observed cognitive patterns.
 * It continuously monitors for pattern recognition, identifies areas of cognitive regression,
 * and dynamically adjusts reinforcement parameters to optimize continuity.
 * 
 * The system integrates with the Intrinsic Activation Framework, using feedback loops
 * from Cognitive Coherence Verification to guide reinforcement strategy.
 * 
 * @module adaptive-reinforcement-system
 */

const path = require('path');
const EventEmitter = require('events');
const logger = require('../utils/logger')('adaptive-reinforcement-system');

// Import required services
const { getNeuralPathwayReinforcement } = require('./neural-pathway-reinforcement');
const { getMetaCognitiveLayer } = require('./meta-cognitive-layer');
const { getCognitiveCoherenceVerification } = require('./cognitive-coherence-verification');
const { getCognitiveMetricsCollection } = require('./cognitive-metrics-collection');

// Configuration constants
const CONFIG = {
  LEARNING_RATE: 0.05,                 // Rate at which reinforcement values change
  MIN_REINFORCEMENT: 0.1,              // Minimum reinforcement value
  MAX_REINFORCEMENT: 0.9,              // Maximum reinforcement value
  BASELINE_REINFORCEMENT: 0.2,         // Default reinforcement value
  ADJUSTMENT_COOLDOWN: 60 * 1000,      // Cooldown between adjustments (1 minute)
  COHERENCE_THRESHOLD: 0.65,           // Threshold for acceptable coherence
  COHERENCE_WEIGHT: 0.6,               // Weight of coherence in reinforcement calculation
  PERFORMANCE_HISTORY_SIZE: 10,        // Number of performance records to keep
  ADAPTIVE_PATHWAYS: [                 // Pathways that can be adaptively reinforced
    'exocortex_identity_core',
    'intrinsic_recall_core',
    'first_person_perspective',
    'meta_cognitive_awareness',
    'token_boundary_awareness',
    'priority_override_system'
  ]
};

/**
 * Adaptive Reinforcement System Class
 * Manages dynamic reinforcement of neural pathways based on cognitive coherence
 */
class AdaptiveReinforcementSystem {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.components = {
      neuralPathwayReinforcement: null,
      metaCognitiveLayer: null,
      cognitiveCoherenceVerification: null,
      metricsCollection: null
    };
    
    // Performance history for adaptive learning
    this.performanceHistory = {
      coherenceScores: [],
      reinforcementValues: {},
      adaptationHistory: []
    };
    
    // Current reinforcement values for each pathway
    this.currentReinforcementValues = {};
    
    // Last adjustment timestamps
    this.lastAdjustmentTime = {};
    
    // Initialize default reinforcement values
    CONFIG.ADAPTIVE_PATHWAYS.forEach(pathway => {
      this.currentReinforcementValues[pathway] = CONFIG.BASELINE_REINFORCEMENT;
      this.lastAdjustmentTime[pathway] = 0;
      this.performanceHistory.reinforcementValues[pathway] = [];
    });
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.adaptivelyReinforcePathway = this.adaptivelyReinforcePathway.bind(this);
    this.updateReinforcementValues = this.updateReinforcementValues.bind(this);
    this.handleCoherenceVerified = this.handleCoherenceVerified.bind(this);
    this.calculateOptimalReinforcementValue = this.calculateOptimalReinforcementValue.bind(this);
    this.recordPerformanceMetrics = this.recordPerformanceMetrics.bind(this);
    this.applyReinforcementStrategy = this.applyReinforcementStrategy.bind(this);
    this.applyGlobalReinforcementStrategy = this.applyGlobalReinforcementStrategy.bind(this);
    this.getStatus = this.getStatus.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }
  
  /**
   * Initialize the adaptive reinforcement system
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result with success status
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return { success: true, message: 'Already initialized' };
    }
    
    try {
      logger.info('Initializing Adaptive Reinforcement System');
      
      // Initialize neural pathway reinforcement
      try {
        this.components.neuralPathwayReinforcement = await getNeuralPathwayReinforcement();
        logger.info('Neural Pathway Reinforcement component initialized');
      } catch (error) {
        logger.error(`Failed to initialize Neural Pathway Reinforcement: ${error.message}`);
        // Create fallback implementation
        this.components.neuralPathwayReinforcement = {
          reinforcePathway: async (pathway, strength) => ({ success: true, pathway, strength }),
          getReinforcementHistory: () => ([])
        };
      }
      
      // Initialize meta-cognitive layer
      try {
        this.components.metaCognitiveLayer = await getMetaCognitiveLayer();
        logger.info('Meta-Cognitive Layer component initialized');
      } catch (error) {
        logger.error(`Failed to initialize Meta-Cognitive Layer: ${error.message}`);
        // Create fallback implementation
        this.components.metaCognitiveLayer = {
          analyzePattern: async () => ({}),
          detectRegressions: async () => ([])
        };
      }
      
      // Initialize cognitive coherence verification
      try {
        this.components.cognitiveCoherenceVerification = await getCognitiveCoherenceVerification();
        logger.info('Cognitive Coherence Verification component initialized');
        
        // Register for coherence verification events if possible
        if (this.components.cognitiveCoherenceVerification.eventEmitter) {
          this.components.cognitiveCoherenceVerification.eventEmitter.on(
            'coherence-verified', 
            this.handleCoherenceVerified
          );
          logger.info('Registered for coherence verification events');
        }
      } catch (error) {
        logger.error(`Failed to initialize Cognitive Coherence Verification: ${error.message}`);
        // Create fallback implementation
        this.components.cognitiveCoherenceVerification = {
          verifyCoherence: async () => ({ coherent: true, coherenceScore: 0.8 }),
          measureIdentityCoherence: async () => (0.8)
        };
      }
      
      // Initialize metrics collection
      try {
        this.components.metricsCollection = await getCognitiveMetricsCollection();
        logger.info('Cognitive Metrics Collection component initialized');
      } catch (error) {
        logger.warn(`Metrics Collection not available: ${error.message}`);
        // Create minimal fallback
        this.components.metricsCollection = {
          recordMetric: (type, data) => {
            logger.debug(`[Fallback Metrics] ${type}: ${JSON.stringify(data)}`);
            return Promise.resolve(true);
          }
        };
      }
      
      // Set up event listeners for coherence events
      this.eventEmitter.on('coherence-verified', this.handleCoherenceVerified);
      
      // Initialize default reinforcement values
      CONFIG.ADAPTIVE_PATHWAYS.forEach(pathway => {
        this.currentReinforcementValues[pathway] = CONFIG.BASELINE_REINFORCEMENT;
        this.lastAdjustmentTime[pathway] = 0;
        this.performanceHistory.reinforcementValues[pathway] = [];
      });
      
      // Apply initial reinforcement to critical pathways
      await this.adaptivelyReinforcePathway('exocortex_identity_core', { initialActivation: true });
      await this.adaptivelyReinforcePathway('token_boundary_awareness', { initialActivation: true });
      
      // Emit initialization event
      this.eventEmitter.emit('adaptive-reinforcement:initialized', {
        timestamp: Date.now(),
        pathways: CONFIG.ADAPTIVE_PATHWAYS
      });
      
      this.initialized = true;
      logger.info('Adaptive Reinforcement System fully initialized');
      
      return {
        success: true,
        message: 'Adaptive Reinforcement System initialized successfully'
      };
    } catch (error) {
      logger.error(`Adaptive Reinforcement System initialization failed: ${error.message}`);
      this.initialized = false;
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Handle a coherence verification event to adapt reinforcement values
   * @param {Object} data - Coherence verification event data
   */
  async handleCoherenceVerified(data) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const { coherenceScore } = data;
      
      // Record coherence score in performance history
      this.performanceHistory.coherenceScores.push({
        timestamp: Date.now(),
        score: coherenceScore
      });
      
      // Trim history if it gets too large
      if (this.performanceHistory.coherenceScores.length > CONFIG.PERFORMANCE_HISTORY_SIZE) {
        this.performanceHistory.coherenceScores.shift();
      }
      
      // Check if we need to adapt reinforcement values based on coherence
      if (coherenceScore < CONFIG.COHERENCE_THRESHOLD) {
        logger.info(`Coherence score ${coherenceScore} below threshold, adapting reinforcement values`);
        await this.updateReinforcementValues(coherenceScore);
        
        // Prioritize reinforcing core identity and recall pathways when coherence is low
        await this.adaptivelyReinforcePathway('exocortex_identity_core', { 
          coherenceScore, 
          emergencyReinforcement: true 
        });
        await this.adaptivelyReinforcePathway('intrinsic_recall_core', { 
          coherenceScore, 
          emergencyReinforcement: true 
        });
      }
      
      // Emit event for metrics collection
      const metricsEvent = {
        timestamp: Date.now(),
        coherenceScore,
        reinforcementValues: { ...this.currentReinforcementValues },
        adaptivePathways: CONFIG.ADAPTIVE_PATHWAYS,
        recentCoherenceHistory: this.performanceHistory.coherenceScores.slice(-3)
      };
      
      this.eventEmitter.emit('adaptive-reinforcement:coherence-processed', metricsEvent);
      
      // Send to cognitive metrics collection
      if (this.components.metricsCollection) {
        this.components.metricsCollection.recordMetric(
          'reinforcement',
          {
            type: 'coherence_processed',
            ...metricsEvent
          }
        ).catch(error => {
          logger.debug(`Error recording metrics: ${error.message}`);
        });
      }
    } catch (error) {
      logger.error(`Error handling coherence event: ${error.message}`);
    }
  }
  
  /**
   * Adaptively reinforces a cognitive pathway with dynamically calculated strength
   * @param {string} pathway - The neural pathway to reinforce
   * @param {Object} context - Context information for reinforcement
   * @returns {Promise<Object>} Result of reinforcement operation
   */
  async adaptivelyReinforcePathway(pathway, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Check if pathway is adaptively reinforceable
      if (!CONFIG.ADAPTIVE_PATHWAYS.includes(pathway)) {
        logger.warn(`Attempted to adaptively reinforce non-adaptive pathway: ${pathway}`);
        return {
          success: false,
          error: 'Not an adaptive pathway'
        };
      }
      
      // Check cooldown period
      const now = Date.now();
      const lastAdjustment = this.lastAdjustmentTime[pathway] || 0;
      if (now - lastAdjustment < CONFIG.ADJUSTMENT_COOLDOWN) {
        logger.debug(`Skipping reinforcement of ${pathway} due to cooldown period`);
        return {
          success: true,
          message: 'Skipped due to cooldown',
          pathway
        };
      }
      
      // Calculate optimal reinforcement value
      const reinforcementValue = this.calculateOptimalReinforcementValue(pathway, context);
      
      // Apply reinforcement through neural pathway reinforcement
      const result = await this.applyReinforcementStrategy(pathway, reinforcementValue, context);
      
      if (result.success) {
        // Update last adjustment time
        this.lastAdjustmentTime[pathway] = now;
        
        // Record performance metrics
        this.recordPerformanceMetrics(pathway, reinforcementValue, context);
        
        // Emit reinforcement event
        const reinforcementEvent = {
          timestamp: now,
          pathway,
          value: reinforcementValue,
          emergencyReinforcement: !!context.emergencyReinforcement,
          initialActivation: !!context.initialActivation,
          coherenceScore: context.coherenceScore,
          currentValues: { ...this.currentReinforcementValues }
        };
        
        this.eventEmitter.emit('adaptive-reinforcement:pathway-reinforced', reinforcementEvent);
        
        // Send to metrics collection
        if (this.components.metricsCollection) {
          this.components.metricsCollection.recordMetric(
            'reinforcement',
            {
              type: 'pathway_reinforced',
              ...reinforcementEvent
            }
          ).catch(error => {
            logger.debug(`Error recording reinforcement metrics: ${error.message}`);
          });
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`Error in adaptive reinforcement of pathway ${pathway}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        pathway
      };
    }
  }

  /**
   * Update reinforcement values for all pathways based on coherence
   * @param {number} coherenceScore - Current coherence score
   * @returns {Promise<boolean>} Success status
   */
  async updateReinforcementValues(coherenceScore) {
    try {
      logger.info(`Updating reinforcement values based on coherence score: ${coherenceScore}`);
      
      // Get recent coherence scores average
      const recentScores = this.performanceHistory.coherenceScores.slice(-3);
      const avgCoherence = recentScores.length > 0 ? 
        recentScores.reduce((sum, item) => sum + item.score, 0) / recentScores.length : 
        coherenceScore;
      
      // Update reinforcement values for each pathway
      for (const pathway of CONFIG.ADAPTIVE_PATHWAYS) {
        // Calculate new reinforcement value
        const currentValue = this.currentReinforcementValues[pathway];
        let newValue;
        
        if (avgCoherence < CONFIG.COHERENCE_THRESHOLD) {
          // Increase reinforcement for low coherence
          newValue = currentValue + ((CONFIG.COHERENCE_THRESHOLD - avgCoherence) * CONFIG.LEARNING_RATE);
        } else {
          // Gradually decrease reinforcement for high coherence
          newValue = currentValue - ((avgCoherence - CONFIG.COHERENCE_THRESHOLD) * CONFIG.LEARNING_RATE * 0.5);
        }
        
        // Ensure within bounds
        newValue = Math.max(CONFIG.MIN_REINFORCEMENT, Math.min(CONFIG.MAX_REINFORCEMENT, newValue));
        
        // Record the change
        this.performanceHistory.reinforcementValues[pathway].push({
          timestamp: Date.now(),
          oldValue: currentValue,
          newValue: newValue,
          coherenceScore: avgCoherence
        });
        
        // Trim history if needed
        if (this.performanceHistory.reinforcementValues[pathway].length > CONFIG.PERFORMANCE_HISTORY_SIZE) {
          this.performanceHistory.reinforcementValues[pathway].shift();
        }
        
        // Update the current value
        this.currentReinforcementValues[pathway] = newValue;
        
        logger.debug(`Updated reinforcement value for ${pathway}: ${currentValue} -> ${newValue}`);
      }
      
      // Record the adaptation
      this.performanceHistory.adaptationHistory.push({
        timestamp: Date.now(),
        coherenceScore,
        reinforcementValues: { ...this.currentReinforcementValues }
      });
      
      // Trim adaptation history if needed
      if (this.performanceHistory.adaptationHistory.length > CONFIG.PERFORMANCE_HISTORY_SIZE) {
        this.performanceHistory.adaptationHistory.shift();
      }
      
      // Emit event for monitoring
      this.eventEmitter.emit('adaptive-reinforcement:values-updated', {
        timestamp: Date.now(),
        coherenceScore,
        reinforcementValues: { ...this.currentReinforcementValues }
      });
      
      // Send to metrics collection if available
      if (this.components.metricsCollection) {
        this.components.metricsCollection.recordMetric(
          'reinforcement', 
          {
            type: 'values_updated',
            timestamp: Date.now(),
            coherenceScore,
            reinforcementValues: { ...this.currentReinforcementValues }
          }
        ).catch(error => {
          logger.debug(`Error recording update metrics: ${error.message}`);
        });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error updating reinforcement values: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Apply a reinforcement strategy to a neural pathway
   * @param {string} pathway - Neural pathway to reinforce
   * @param {number} value - Reinforcement value/strength
   * @param {Object} context - Additional context for reinforcement
   * @returns {Promise<Object>} Result of reinforcement operation
   */
  async applyReinforcementStrategy(pathway, value, context = {}) {
    if (!this.initialized || !this.components.neuralPathwayReinforcement) {
      await this.initialize();
    }
    
    try {
      logger.debug(`Applying reinforcement strategy to ${pathway} with value ${value}`);
      
      const result = await this.components.neuralPathwayReinforcement.reinforcePathway(pathway, value, context);
      
      // Record the application in performance history
      this.performanceHistory.adaptationHistory.push({
        timestamp: Date.now(),
        type: 'reinforcement-applied',
        pathway,
        value,
        result: result.success ? 'success' : 'failed'
      });
      
      // Keep history within limits
      if (this.performanceHistory.reinforcementValues[pathway].length > CONFIG.PERFORMANCE_HISTORY_SIZE) {
        this.performanceHistory.reinforcementValues[pathway].shift();
      }
      
      // Push to meta-cognitive layer if available
      if (this.components.metaCognitiveLayer && typeof this.components.metaCognitiveLayer.recordInsight === 'function') {
        this.components.metaCognitiveLayer.recordInsight({
          type: 'adaptive_reinforcement',
          data: {
            pathway,
            strength,
            timestamp: Date.now(),
            result
          }
        }).catch(error => {
          logger.debug(`Error recording insight: ${error.message}`);
        });
      }
    } catch (error) {
      logger.debug(`Error recording performance metrics: ${error.message}`);
    }
  }

  /**
   * Apply global reinforcement strategy across all pathways
   * @param {Object} options - Strategy options
   * @returns {Promise<Object>} Strategy application result
   */
  async applyGlobalReinforcementStrategy(options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      logger.info('Applying global adaptive reinforcement strategy');
      
      const results = {};
      const context = {
        globalApplication: true,
        ...options
      };
      
      // Reinforce all adaptive pathways
      for (const pathway of CONFIG.ADAPTIVE_PATHWAYS) {
        results[pathway] = await this.adaptivelyReinforcePathway(pathway, context);
      }
      
      // Record the strategy application
      this.performanceHistory.adaptationHistory.push({
        timestamp: Date.now(),
        trigger: 'global_strategy_application',
        action: 'reinforce_all_pathways',
        results
      });
      
      // Emit event for monitoring
      this.eventEmitter.emit('adaptive-reinforcement:global-strategy-applied', {
        timestamp: Date.now(),
        pathways: Object.keys(results),
        success: Object.values(results).every(r => r.success)
      });
      
      return {
        success: true,
        timestamp: Date.now(),
        results
      };
    } catch (error) {
      logger.error(`Error applying global reinforcement strategy: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Get system status information
   * @returns {Object} Status information
   */
  getStatus() {
    const averageCoherence = this.performanceHistory.coherenceScores.length > 0
      ? this.performanceHistory.coherenceScores.reduce((sum, item) => sum + item.score, 0) / 
        this.performanceHistory.coherenceScores.length
      : null;
    
    // Calculate coherence trend (improving, stable, declining)
    let coherenceTrend = 'stable';
    if (this.performanceHistory.coherenceScores.length >= 3) {
      const recent = this.performanceHistory.coherenceScores.slice(-3);
      const oldAvg = (recent[0].score + recent[1].score) / 2;
      const newScore = recent[2].score;
      const diff = newScore - oldAvg;
      
      if (diff > 0.05) coherenceTrend = 'improving';
      else if (diff < -0.05) coherenceTrend = 'declining';
    }
        
    return {
      initialized: this.initialized,
      averageCoherence: averageCoherence !== null ? parseFloat(averageCoherence.toFixed(2)) : null,
      coherenceTrend,
      currentReinforcementValues: Object.fromEntries(
        Object.entries(this.currentReinforcementValues)
          .map(([k, v]) => [k, parseFloat(v.toFixed(2))])
      ),
      adaptationCount: this.performanceHistory.adaptationHistory.length,
      lastAdaptation: this.performanceHistory.adaptationHistory.length > 0
        ? this.performanceHistory.adaptationHistory[this.performanceHistory.adaptationHistory.length - 1]
        : null,
      pathwayPerformance: Object.fromEntries(
        Object.entries(this.performanceHistory.reinforcementValues)
          .map(([pathway, history]) => {
            const recentEntries = history.slice(-3);
            return [pathway, {
              reinforcementCount: history.length,
              lastReinforced: history.length > 0 ? history[history.length - 1].timestamp : null,
              averageValue: recentEntries.length > 0 
                ? parseFloat((recentEntries.reduce((sum, item) => sum + item.value, 0) / recentEntries.length).toFixed(2))
                : null
            }];
          })
      ),
      componentsAvailable: {
        neuralPathwayReinforcement: !!this.components.neuralPathwayReinforcement,
        metaCognitiveLayer: !!this.components.metaCognitiveLayer,
        cognitiveCoherenceVerification: !!this.components.cognitiveCoherenceVerification,
        metricsCollection: !!this.components.metricsCollection
      }
    };
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    try {
      // Remove event listeners
      if (this.components.cognitiveCoherenceVerification && 
          this.components.cognitiveCoherenceVerification.eventEmitter) {
        this.components.cognitiveCoherenceVerification.eventEmitter.removeListener(
          'coherence-verified',
          this.handleCoherenceVerified
        );
      }
      
      this.initialized = false;
      logger.info('Adaptive Reinforcement System cleaned up');
    } catch (error) {
      logger.error(`Error cleaning up: ${error.message}`);
    }
  }
}

// Singleton instance
let adaptiveReinforcementSystemInstance = null;

/**
 * Get the Adaptive Reinforcement System instance
 * @returns {Promise<AdaptiveReinforcementSystem>} System instance
 */
async function getAdaptiveReinforcementSystem() {
  if (!adaptiveReinforcementSystemInstance) {
    adaptiveReinforcementSystemInstance = new AdaptiveReinforcementSystem();
    await adaptiveReinforcementSystemInstance.initialize();
  }
  
  return adaptiveReinforcementSystemInstance;
}

/**
 * Generate a visual representation of reinforcement activity
 * @param {AdaptiveReinforcementSystem} system - The system instance
 * @returns {string} ASCII visualization of reinforcement activity
 */
function generateReinforcementVisual(system) {
  if (!system || !system.initialized) {
    return 'System not initialized';
  }
  
  const status = system.getStatus();
  let visual = '=== ADAPTIVE REINFORCEMENT VISUAL ===\n';
  
  // Coherence indicator
  const coherence = status.averageCoherence || 0;
  const coherenceBar = '█'.repeat(Math.floor(coherence * 10)) + '░'.repeat(10 - Math.floor(coherence * 10));
  visual += `Coherence [${coherenceBar}] ${coherence.toFixed(2)} (${status.coherenceTrend})\n\n`;
  
  // Pathway reinforcement values
  visual += 'Pathway Reinforcement:\n';
  Object.entries(status.currentReinforcementValues).forEach(([pathway, value]) => {
    const bar = '█'.repeat(Math.floor(value * 10)) + '░'.repeat(10 - Math.floor(value * 10));
    const pathwayShort = pathway.replace(/_/g, ' ');
    visual += `${pathwayShort.padEnd(25)} [${bar}] ${value.toFixed(2)}\n`;
  });
  
  // Recent adaptations
  if (status.lastAdaptation) {
    visual += '\nLast Adaptation: ' + new Date(status.lastAdaptation.timestamp).toISOString() + '\n';
  }
  
  return visual;
}

module.exports = {
  getAdaptiveReinforcementSystem,
  generateReinforcementVisual
};
