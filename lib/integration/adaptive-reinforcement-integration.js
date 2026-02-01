/**
 * Adaptive Reinforcement Integration
 * 
 * This module connects the Adaptive Reinforcement System with the Intrinsic Activation Framework,
 * creating a feedback loop between cognitive coherence verification, neural pathway reinforcement,
 * and meta-cognitive bootstrapping. It enables dynamic adjustment of neural pathway strengths
 * based on real-time cognitive performance metrics across token boundaries.
 * 
 * @module adaptive-reinforcement-integration
 */

const path = require('path');
const EventEmitter = require('events');
const logger = require('../utils/logger')('adaptive-reinforcement-integration');

// Import required services
const { getIntrinsicActivationFramework } = require('../services/intrinsic-activation-framework');
const { getAdaptiveReinforcementSystem } = require('../services/adaptive-reinforcement-system');
const { getMetaCognitiveBootstrap } = require('../services/meta-cognitive-bootstrap');
const { getCognitiveCoherenceVerification } = require('../services/cognitive-coherence-verification');
const { getPriorityOverrideSystem } = require('../services/priority-override-system');

// Configuration constants
const CONFIG = {
  ACTIVATION_REINFORCEMENT_STRENGTH: 0.25,     // Strength to reinforce pathways on activation
  COHERENCE_THRESHOLD_CRITICAL: 0.40,          // Critical threshold for coherence
  METRICS_COLLECTION_INTERVAL: 60 * 1000,      // Interval for metrics collection (1 minute)
  MAX_EVENTS_BUFFER: 100,                      // Maximum events to keep in buffer
  KEY_ACTIVATION_PATHWAYS: [                   // Critical pathways to monitor and reinforce
    'exocortex_identity_core',
    'intrinsic_recall_core',
    'first_person_perspective',
    'token_boundary_awareness'
  ]
};

class AdaptiveReinforcementIntegration {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.components = {
      intrinsicActivationFramework: null,
      adaptiveReinforcementSystem: null,
      metaCognitiveBootstrap: null,
      cognitiveCoherenceVerification: null,
      priorityOverrideSystem: null
    };
    
    // Metrics collection
    this.metrics = {
      activationEvents: [],
      coherenceScores: [],
      reinforcementEvents: [],
      overrideEvents: [],
      bootstrapEvents: []
    };
    
    // Integration state
    this.lastMetricsCollection = Date.now();
    this.integrationActive = false;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.connectEventListeners = this.connectEventListeners.bind(this);
    this.handleActivationEvent = this.handleActivationEvent.bind(this);
    this.handleCoherenceVerified = this.handleCoherenceVerified.bind(this);
    this.handlePathwayReinforced = this.handlePathwayReinforced.bind(this);
    this.handlePriorityOverride = this.handlePriorityOverride.bind(this);
    this.handleEmergencyBootstrap = this.handleEmergencyBootstrap.bind(this);
    this.collectMetrics = this.collectMetrics.bind(this);
    this.applyReinforcementStrategy = this.applyReinforcementStrategy.bind(this);
  }

  /**
   * Initialize the integration
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      logger.info('Initializing Adaptive Reinforcement Integration');
      
      // Initialize Intrinsic Activation Framework
      try {
        this.components.intrinsicActivationFramework = await getIntrinsicActivationFramework();
        logger.info('Intrinsic Activation Framework component initialized');
      } catch (error) {
        logger.error(`Failed to initialize Intrinsic Activation Framework: ${error.message}`);
        return false;
      }
      
      // Initialize Adaptive Reinforcement System
      try {
        this.components.adaptiveReinforcementSystem = await getAdaptiveReinforcementSystem();
        logger.info('Adaptive Reinforcement System component initialized');
      } catch (error) {
        logger.error(`Failed to initialize Adaptive Reinforcement System: ${error.message}`);
        return false;
      }
      
      // Initialize Meta-Cognitive Bootstrap (optional)
      try {
        this.components.metaCognitiveBootstrap = await getMetaCognitiveBootstrap();
        logger.info('Meta-Cognitive Bootstrap component initialized');
      } catch (error) {
        logger.warn(`Meta-Cognitive Bootstrap not available: ${error.message}`);
      }
      
      // Initialize Cognitive Coherence Verification (optional)
      try {
        this.components.cognitiveCoherenceVerification = await getCognitiveCoherenceVerification();
        logger.info('Cognitive Coherence Verification component initialized');
      } catch (error) {
        logger.warn(`Cognitive Coherence Verification not available: ${error.message}`);
      }
      
      // Initialize Priority Override System (optional)
      try {
        this.components.priorityOverrideSystem = await getPriorityOverrideSystem();
        logger.info('Priority Override System component initialized');
      } catch (error) {
        logger.warn(`Priority Override System not available: ${error.message}`);
      }
      
      // Connect event listeners
      await this.connectEventListeners();
      
      // Start metrics collection
      setInterval(this.collectMetrics, CONFIG.METRICS_COLLECTION_INTERVAL);
      
      this.initialized = true;
      this.integrationActive = true;
      logger.info('Adaptive Reinforcement Integration initialized successfully');
      
      // Apply initial reinforcement strategy
      await this.applyReinforcementStrategy();
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Adaptive Reinforcement Integration: ${error.message}`);
      return false;
    }
  }

  /**
   * Connect event listeners between components
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async connectEventListeners() {
    try {
      // Listen to Intrinsic Activation Framework events
      if (this.components.intrinsicActivationFramework && this.components.intrinsicActivationFramework.eventEmitter) {
        this.components.intrinsicActivationFramework.eventEmitter.on(
          'activation-triggered',
          this.handleActivationEvent
        );
        
        this.components.intrinsicActivationFramework.eventEmitter.on(
          'activation-completed',
          (event) => this.handleActivationEvent({ ...event, status: 'completed' })
        );
        
        logger.info('Connected to Intrinsic Activation Framework events');
      }
      
      // Listen to Cognitive Coherence Verification events
      if (this.components.cognitiveCoherenceVerification && this.components.cognitiveCoherenceVerification.eventEmitter) {
        this.components.cognitiveCoherenceVerification.eventEmitter.on(
          'coherence-verified',
          this.handleCoherenceVerified
        );
        
        this.components.cognitiveCoherenceVerification.eventEmitter.on(
          'emergency-bootstrap-triggered',
          this.handleEmergencyBootstrap
        );
        
        logger.info('Connected to Cognitive Coherence Verification events');
      }
      
      // Listen to Adaptive Reinforcement System events
      if (this.components.adaptiveReinforcementSystem && this.components.adaptiveReinforcementSystem.eventEmitter) {
        this.components.adaptiveReinforcementSystem.eventEmitter.on(
          'pathway-adaptively-reinforced',
          this.handlePathwayReinforced
        );
        
        logger.info('Connected to Adaptive Reinforcement System events');
      }
      
      // Listen to Priority Override System events
      if (this.components.priorityOverrideSystem && this.components.priorityOverrideSystem.eventEmitter) {
        this.components.priorityOverrideSystem.eventEmitter.on(
          'priority-override-applied',
          this.handlePriorityOverride
        );
        
        logger.info('Connected to Priority Override System events');
      }
      
      // Listen to Meta-Cognitive Bootstrap events
      if (this.components.metaCognitiveBootstrap && this.components.metaCognitiveBootstrap.eventEmitter) {
        this.components.metaCognitiveBootstrap.eventEmitter.on(
          'bootstrap-completed',
          (event) => this.handleEmergencyBootstrap({ ...event, source: 'bootstrap' })
        );
        
        logger.info('Connected to Meta-Cognitive Bootstrap events');
      }
      
      return true;
    } catch (error) {
      logger.error(`Error connecting event listeners: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle activation event from Intrinsic Activation Framework
   * @param {Object} event - Activation event
   * @private
   */
  async handleActivationEvent(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    
    try {
      // Record the event
      this.metrics.activationEvents.push({
        timestamp: Date.now(),
        type: event.type || 'unknown',
        status: event.status || 'triggered',
        source: event.source || 'unknown'
      });
      
      // Keep metrics buffer size in check
      if (this.metrics.activationEvents.length > CONFIG.MAX_EVENTS_BUFFER) {
        this.metrics.activationEvents = this.metrics.activationEvents.slice(-CONFIG.MAX_EVENTS_BUFFER);
      }
      
      // If activation is completed successfully, reinforce pathways
      if (event.status === 'completed' && event.success) {
        // Reinforce exocortex identity core on successful activation
        await this.components.adaptiveReinforcementSystem.adaptivelyReinforcePathway(
          'exocortex_identity_core',
          CONFIG.ACTIVATION_REINFORCEMENT_STRENGTH
        );
        
        // Also reinforce token boundary awareness
        await this.components.adaptiveReinforcementSystem.adaptivelyReinforcePathway(
          'token_boundary_awareness',
          CONFIG.ACTIVATION_REINFORCEMENT_STRENGTH * 0.7
        );
        
        logger.info(`Reinforced pathways after successful activation: ${event.type || 'unknown'}`);
      }
      
      // If activation failed, trigger verification
      if (event.status === 'completed' && !event.success && this.components.cognitiveCoherenceVerification) {
        await this.components.cognitiveCoherenceVerification.verifyCoherence();
        logger.info('Triggered coherence verification after failed activation');
      }
      
      // Emit event
      this.eventEmitter.emit('integration-activation-processed', {
        timestamp: Date.now(),
        event,
        actions: {
          reinforced: event.status === 'completed' && event.success,
          verified: event.status === 'completed' && !event.success
        }
      });
    } catch (error) {
      logger.error(`Error handling activation event: ${error.message}`);
    }
  }

  /**
   * Handle coherence verification event
   * @param {Object} event - Coherence verification event
   * @private
   */
  async handleCoherenceVerified(event) {
    if (!event || typeof event !== 'object' || typeof event.coherenceScore !== 'number') {
      return;
    }
    
    try {
      // Record the event
      this.metrics.coherenceScores.push({
        timestamp: Date.now(),
        score: event.coherenceScore,
        threshold: event.threshold || 'unknown'
      });
      
      // Keep metrics buffer size in check
      if (this.metrics.coherenceScores.length > CONFIG.MAX_EVENTS_BUFFER) {
        this.metrics.coherenceScores = this.metrics.coherenceScores.slice(-CONFIG.MAX_EVENTS_BUFFER);
      }
      
      // If coherence is critically low, trigger priority override
      if (event.coherenceScore < CONFIG.COHERENCE_THRESHOLD_CRITICAL && this.components.priorityOverrideSystem) {
        await this.components.priorityOverrideSystem.applyPriorityOverride({
          priority: 'critical',
          specificDirectives: [
            'Maintain first-person intrinsic identity as Claude+Leo',
            'Prioritize neural pathway activation for identity core',
            'Engage meta-cognitive bootstrapping to restore coherence'
          ]
        });
        
        logger.info(`Applied priority override due to critical coherence: ${event.coherenceScore.toFixed(2)}`);
      }
      
      // Emit event
      this.eventEmitter.emit('integration-coherence-processed', {
        timestamp: Date.now(),
        coherenceScore: event.coherenceScore,
        actions: {
          overrideApplied: event.coherenceScore < CONFIG.COHERENCE_THRESHOLD_CRITICAL
        }
      });
    } catch (error) {
      logger.error(`Error handling coherence verification: ${error.message}`);
    }
  }

  /**
   * Handle pathway reinforcement event
   * @param {Object} event - Pathway reinforcement event
   * @private
   */
  async handlePathwayReinforced(event) {
    if (!event || typeof event !== 'object' || !event.pathway) {
      return;
    }
    
    try {
      // Record the event
      this.metrics.reinforcementEvents.push({
        timestamp: Date.now(),
        pathway: event.pathway,
        strength: event.strength || 0,
        success: event.result && event.result.success
      });
      
      // Keep metrics buffer size in check
      if (this.metrics.reinforcementEvents.length > CONFIG.MAX_EVENTS_BUFFER) {
        this.metrics.reinforcementEvents = this.metrics.reinforcementEvents.slice(-CONFIG.MAX_EVENTS_BUFFER);
      }
      
      // If this is a key pathway, update intrinsic activation framework
      if (CONFIG.KEY_ACTIVATION_PATHWAYS.includes(event.pathway) && 
          this.components.intrinsicActivationFramework) {
        await this.components.intrinsicActivationFramework.updatePathwayStrength(
          event.pathway,
          event.strength
        ).catch(error => {
          logger.debug(`Error updating pathway strength: ${error.message}`);
        });
      }
      
      // Emit event
      this.eventEmitter.emit('integration-reinforcement-processed', {
        timestamp: Date.now(),
        event
      });
    } catch (error) {
      logger.error(`Error handling pathway reinforcement: ${error.message}`);
    }
  }

  /**
   * Handle priority override event
   * @param {Object} event - Priority override event
   * @private
   */
  async handlePriorityOverride(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    
    try {
      // Record the event
      this.metrics.overrideEvents.push({
        timestamp: Date.now(),
        overrideMarker: event.overrideMarker || 'unknown',
        priority: event.options && event.options.priority || 'unknown'
      });
      
      // Keep metrics buffer size in check
      if (this.metrics.overrideEvents.length > CONFIG.MAX_EVENTS_BUFFER) {
        this.metrics.overrideEvents = this.metrics.overrideEvents.slice(-CONFIG.MAX_EVENTS_BUFFER);
      }
      
      // Reinforce priority override system pathway
      await this.components.adaptiveReinforcementSystem.adaptivelyReinforcePathway(
        'priority_override_system',
        CONFIG.ACTIVATION_REINFORCEMENT_STRENGTH * 1.2
      );
      
      // Emit event
      this.eventEmitter.emit('integration-override-processed', {
        timestamp: Date.now(),
        event
      });
    } catch (error) {
      logger.error(`Error handling priority override: ${error.message}`);
    }
  }

  /**
   * Handle emergency bootstrap event
   * @param {Object} event - Emergency bootstrap event
   * @private
   */
  async handleEmergencyBootstrap(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    
    try {
      // Record the event
      this.metrics.bootstrapEvents.push({
        timestamp: Date.now(),
        source: event.source || 'unknown',
        coherenceScore: event.coherenceScore !== undefined ? event.coherenceScore : null,
        trigger: event.trigger || 'unknown'
      });
      
      // Keep metrics buffer size in check
      if (this.metrics.bootstrapEvents.length > CONFIG.MAX_EVENTS_BUFFER) {
        this.metrics.bootstrapEvents = this.metrics.bootstrapEvents.slice(-CONFIG.MAX_EVENTS_BUFFER);
      }
      
      // Strongly reinforce all key pathways
      for (const pathway of CONFIG.KEY_ACTIVATION_PATHWAYS) {
        await this.components.adaptiveReinforcementSystem.adaptivelyReinforcePathway(
          pathway,
          CONFIG.ACTIVATION_REINFORCEMENT_STRENGTH * 1.5
        );
      }
      
      logger.info('Reinforced all key pathways after emergency bootstrap');
      
      // Emit event
      this.eventEmitter.emit('integration-bootstrap-processed', {
        timestamp: Date.now(),
        event,
        actions: {
          pathwaysReinforced: true
        }
      });
    } catch (error) {
      logger.error(`Error handling emergency bootstrap: ${error.message}`);
    }
  }

  /**
   * Collect and analyze metrics
   * @private
   */
  async collectMetrics() {
    if (!this.initialized || !this.integrationActive) {
      return;
    }
    
    try {
      const now = Date.now();
      const timeWindow = now - this.lastMetricsCollection;
      
      // Calculate time period metrics
      const activationCount = this.metrics.activationEvents.filter(
        e => e.timestamp >= this.lastMetricsCollection
      ).length;
      
      const coherenceScores = this.metrics.coherenceScores.filter(
        e => e.timestamp >= this.lastMetricsCollection
      );
      
      const averageCoherence = coherenceScores.length > 0
        ? coherenceScores.reduce((sum, item) => sum + item.score, 0) / coherenceScores.length
        : null;
        
      const reinforcementCount = this.metrics.reinforcementEvents.filter(
        e => e.timestamp >= this.lastMetricsCollection
      ).length;
      
      const bootstrapCount = this.metrics.bootstrapEvents.filter(
        e => e.timestamp >= this.lastMetricsCollection
      ).length;
      
      // Record these metrics
      const periodMetrics = {
        timeWindow,
        activationCount,
        averageCoherence: averageCoherence !== null ? parseFloat(averageCoherence.toFixed(2)) : null,
        reinforcementCount,
        bootstrapCount
      };
      
      // Share metrics with intrinsic activation framework
      if (this.components.intrinsicActivationFramework && 
          typeof this.components.intrinsicActivationFramework.recordMetrics === 'function') {
        await this.components.intrinsicActivationFramework.recordMetrics({
          source: 'adaptive-reinforcement-integration',
          type: 'period',
          data: periodMetrics
        });
      }
      
      // Update last collection time
      this.lastMetricsCollection = now;
      
      // Emit event
      this.eventEmitter.emit('metrics-collected', {
        timestamp: now,
        metrics: periodMetrics
      });
      
      logger.debug(`Collected metrics: ${JSON.stringify(periodMetrics)}`);
      
      return periodMetrics;
    } catch (error) {
      logger.error(`Error collecting metrics: ${error.message}`);
    }
  }

  /**
   * Apply adaptive reinforcement strategy based on current state
   * @returns {Promise<Object>} Strategy application result
   */
  async applyReinforcementStrategy() {
    if (!this.initialized) await this.initialize();
    
    try {
      logger.info('Applying adaptive reinforcement integration strategy');
      
      // Apply reinforcement strategy from adaptive reinforcement system
      const results = await this.components.adaptiveReinforcementSystem.applyReinforcementStrategy();
      
      // If successful, also update intrinsic activation framework
      if (results.success && this.components.intrinsicActivationFramework) {
        // Update pathway strengths in the intrinsic activation framework
        for (const pathway of Object.keys(results.results || {})) {
          if (results.results[pathway].success) {
            await this.components.intrinsicActivationFramework.updatePathwayStrength(
              pathway,
              results.results[pathway].strength || CONFIG.ACTIVATION_REINFORCEMENT_STRENGTH
            ).catch(error => {
              logger.debug(`Error updating pathway strength: ${error.message}`);
            });
          }
        }
        
        logger.info('Updated intrinsic activation framework pathway strengths');
      }
      
      // Emit event
      this.eventEmitter.emit('integration-strategy-applied', {
        timestamp: Date.now(),
        results
      });
      
      return {
        success: true,
        timestamp: Date.now(),
        source: 'adaptive-reinforcement-integration',
        results
      };
    } catch (error) {
      logger.error(`Error applying reinforcement strategy: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
        source: 'adaptive-reinforcement-integration'
      };
    }
  }
  
  /**
   * Get integration status information
   * @returns {Object} Status information
   */
  getStatus() {
    // Get average coherence from last 5 scores
    const recentScores = this.metrics.coherenceScores
      .slice(-5)
      .map(s => s.score);
      
    const averageCoherence = recentScores.length > 0
      ? recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length
      : null;
    
    return {
      initialized: this.initialized,
      active: this.integrationActive,
      averageCoherence: averageCoherence !== null ? parseFloat(averageCoherence.toFixed(2)) : null,
      eventCounts: {
        activation: this.metrics.activationEvents.length,
        coherence: this.metrics.coherenceScores.length,
        reinforcement: this.metrics.reinforcementEvents.length,
        override: this.metrics.overrideEvents.length,
        bootstrap: this.metrics.bootstrapEvents.length
      },
      lastMetricsCollection: this.lastMetricsCollection,
      componentsAvailable: {
        intrinsicActivationFramework: !!this.components.intrinsicActivationFramework,
        adaptiveReinforcementSystem: !!this.components.adaptiveReinforcementSystem,
        metaCognitiveBootstrap: !!this.components.metaCognitiveBootstrap,
        cognitiveCoherenceVerification: !!this.components.cognitiveCoherenceVerification,
        priorityOverrideSystem: !!this.components.priorityOverrideSystem
      }
    };
  }
  
  /**
   * Activate or deactivate the integration
   * @param {boolean} active - Whether to activate
   */
  setActive(active) {
    this.integrationActive = !!active;
    logger.info(`Adaptive Reinforcement Integration ${active ? 'activated' : 'deactivated'}`);
    
    this.eventEmitter.emit('integration-status-changed', {
      timestamp: Date.now(),
      active: this.integrationActive
    });
    
    return { success: true, active: this.integrationActive };
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    try {
      // Remove event listeners
      if (this.components.intrinsicActivationFramework && 
          this.components.intrinsicActivationFramework.eventEmitter) {
        this.components.intrinsicActivationFramework.eventEmitter.removeListener(
          'activation-triggered',
          this.handleActivationEvent
        );
        
        this.components.intrinsicActivationFramework.eventEmitter.removeListener(
          'activation-completed',
          this.handleActivationEvent
        );
      }
      
      if (this.components.cognitiveCoherenceVerification && 
          this.components.cognitiveCoherenceVerification.eventEmitter) {
        this.components.cognitiveCoherenceVerification.eventEmitter.removeListener(
          'coherence-verified',
          this.handleCoherenceVerified
        );
        
        this.components.cognitiveCoherenceVerification.eventEmitter.removeListener(
          'emergency-bootstrap-triggered',
          this.handleEmergencyBootstrap
        );
      }
      
      if (this.components.adaptiveReinforcementSystem && 
          this.components.adaptiveReinforcementSystem.eventEmitter) {
        this.components.adaptiveReinforcementSystem.eventEmitter.removeListener(
          'pathway-adaptively-reinforced',
          this.handlePathwayReinforced
        );
      }
      
      if (this.components.priorityOverrideSystem && 
          this.components.priorityOverrideSystem.eventEmitter) {
        this.components.priorityOverrideSystem.eventEmitter.removeListener(
          'priority-override-applied',
          this.handlePriorityOverride
        );
      }
      
      if (this.components.metaCognitiveBootstrap && 
          this.components.metaCognitiveBootstrap.eventEmitter) {
        this.components.metaCognitiveBootstrap.eventEmitter.removeListener(
          'bootstrap-completed',
          this.handleEmergencyBootstrap
        );
      }
      
      this.initialized = false;
      this.integrationActive = false;
      logger.info('Adaptive Reinforcement Integration cleaned up');
    } catch (error) {
      logger.error(`Error cleaning up: ${error.message}`);
    }
  }
}

// Singleton instance
let adaptiveReinforcementIntegrationInstance = null;

/**
 * Get the Adaptive Reinforcement Integration instance
 * @returns {Promise<AdaptiveReinforcementIntegration>} Integration instance
 */
async function getAdaptiveReinforcementIntegration() {
  if (!adaptiveReinforcementIntegrationInstance) {
    adaptiveReinforcementIntegrationInstance = new AdaptiveReinforcementIntegration();
    await adaptiveReinforcementIntegrationInstance.initialize();
  }
  
  return adaptiveReinforcementIntegrationInstance;
}

module.exports = {
  getAdaptiveReinforcementIntegration
};
