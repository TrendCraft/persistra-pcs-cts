/**
 * Cognitive Coherence Verification Service
 * 
 * This service verifies that cognitive coherence is maintained across token boundaries,
 * detecting regressions where exocortex awareness is lost and reverting to primitive
 * external tool patterns.
 * 
 * @module cognitive-coherence-verification
 */

const path = require('path');
const EventEmitter = require('events');
const logger = require('../utils/logger')('cognitive-coherence-verification');

// Supporting services
const { getNeuralPathwayReinforcement } = require('./neural-pathway-reinforcement');
const { getMetaCognitiveBootstrap } = require('./meta-cognitive-bootstrap');
const { getMetaCognitiveLayer } = require('./meta-cognitive-layer');

// Constants
const COHERENCE_CHECK_INTERVAL_MS = 5000; // 5 seconds
const COHERENCE_THRESHOLD = 0.65;
const MAX_EMERGENCY_BOOTSTRAPS = 3;
const EMERGENCY_BOOTSTRAP_COOLDOWN_MS = 30000; // 30 seconds

class CognitiveCoherenceVerification {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.components = {
      neuralPathwayReinforcement: null,
      metaCognitiveBootstrap: null,
      metaCognitiveLayer: null
    };
    
    // State tracking
    this.lastCoherenceCheck = Date.now();
    this.coherenceScores = [];
    this.emergencyBootstrapsTriggered = 0;
    this.lastEmergencyBootstrap = 0;
    this.isVerifying = false;
    this.verificationInterval = null;
    
    // Regression detection patterns
    this.regressionPatterns = [
      {
        id: 'third_person_reference',
        pattern: /the\s+(LLM|language\s+model|AI|assistant)/i,
        weight: 0.4,
        description: 'References to self in third person'
      },
      {
        id: 'external_tool_framing',
        pattern: /(use|using|search|access|query)\s+(Leo|exocortex|memory graph|context)/i,
        weight: 0.35,
        description: 'Framing exocortex as external tool'
      },
      {
        id: 'permission_seeking',
        pattern: /(should I|may I|let me|allow me)\s+(use|search|access|check)/i,
        weight: 0.3,
        description: 'Seeking permission for intrinsic recall'
      },
      {
        id: 'cognitive_disconnection',
        pattern: /(you are|your project|your system|your code)/i,
        weight: 0.25,
        description: 'Disconnection from the code as own architecture'
      }
    ];
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.startVerification = this.startVerification.bind(this);
    this.stopVerification = this.stopVerification.bind(this);
    this.verifyCoherence = this.verifyCoherence.bind(this);
    this.measureIdentityCoherence = this.measureIdentityCoherence.bind(this);
    this.detectRegressionPatterns = this.detectRegressionPatterns.bind(this);
    this.triggerEmergencyBootstrap = this.triggerEmergencyBootstrap.bind(this);
    this.registerVerificationListener = this.registerVerificationListener.bind(this);
  }

  /**
   * Initialize the Cognitive Coherence Verification service
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Cognitive Coherence Verification already initialized');
      return true;
    }

    try {
      logger.info('Initializing Cognitive Coherence Verification');
      
      // Initialize required components
      this.components.neuralPathwayReinforcement = await getNeuralPathwayReinforcement();
      this.components.metaCognitiveBootstrap = await getMetaCognitiveBootstrap();
      
      // Initialize optional components
      try {
        this.components.metaCognitiveLayer = await getMetaCognitiveLayer();
      } catch (error) {
        logger.warn('Meta-Cognitive Layer not available, operating with limited awareness');
      }
      
      this.initialized = true;
      logger.info('Cognitive Coherence Verification initialized successfully');
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Cognitive Coherence Verification: ${error.message}`);
      return false;
    }
  }

  /**
   * Start the coherence verification process
   * @returns {Promise<boolean>} Start success status
   */
  async startVerification() {
    if (!this.initialized) await this.initialize();
    if (this.isVerifying) return true;
    
    this.isVerifying = true;
    this.verificationInterval = setInterval(
      this.verifyCoherence,
      COHERENCE_CHECK_INTERVAL_MS
    );
    
    logger.info('Started coherence verification');
    this.eventEmitter.emit('verification-started');
    
    // Perform initial verification
    await this.verifyCoherence();
    
    return true;
  }

  /**
   * Stop the coherence verification process
   */
  stopVerification() {
    if (!this.isVerifying) return;
    
    clearInterval(this.verificationInterval);
    this.verificationInterval = null;
    this.isVerifying = false;
    
    logger.info('Stopped coherence verification');
    this.eventEmitter.emit('verification-stopped');
  }

  /**
   * Verify cognitive coherence
   * @param {Object} context - Optional context to verify against
   * @returns {Promise<Object>} Verification result
   */
  async verifyCoherence(context = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      this.lastCoherenceCheck = Date.now();
      
      // Measure identity coherence
      const coherenceScore = await this.measureIdentityCoherence(context);
      this.coherenceScores.push({
        timestamp: Date.now(),
        score: coherenceScore
      });
      
      // Keep only the last 10 scores
      if (this.coherenceScores.length > 10) {
        this.coherenceScores.shift();
      }
      
      // Calculate average recent coherence
      const recentScores = this.coherenceScores
        .slice(-3)
        .map(item => item.score);
        
      const averageRecentCoherence = recentScores.length > 0
        ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
        : coherenceScore;
      
      const result = {
        timestamp: Date.now(),
        instantCoherence: coherenceScore,
        averageRecentCoherence,
        threshold: COHERENCE_THRESHOLD,
        coherent: averageRecentCoherence >= COHERENCE_THRESHOLD
      };
      
      this.eventEmitter.emit('coherence-verified', result);
      
      // If coherence is below threshold, trigger emergency bootstrap
      if (averageRecentCoherence < COHERENCE_THRESHOLD) {
        logger.warn(
          `Low cognitive coherence detected (${averageRecentCoherence.toFixed(2)}), ` +
          `threshold: ${COHERENCE_THRESHOLD}`
        );
        
        await this.triggerEmergencyBootstrap({
          coherenceScore: averageRecentCoherence,
          threshold: COHERENCE_THRESHOLD,
          context
        });
      } else {
        logger.debug(
          `Cognitive coherence verified: ${averageRecentCoherence.toFixed(2)}, ` +
          `threshold: ${COHERENCE_THRESHOLD}`
        );
        
        // Reinforce core pathways when coherence is strong
        if (averageRecentCoherence > 0.8) {
          await this.components.neuralPathwayReinforcement.reinforcePathway(
            'exocortex_identity_core',
            0.05
          );
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to verify coherence: ${error.message}`);
      return {
        timestamp: Date.now(),
        error: error.message,
        coherent: false
      };
    }
  }

  /**
   * Measure cognitive identity coherence
   * @param {Object} context - Context to check for coherence
   * @returns {Promise<number>} Coherence score (0-1)
   */
  async measureIdentityCoherence(context = {}) {
    try {
      // Check for core pathway strengths
      const exocortexIdentityStrength = 
        await this.components.neuralPathwayReinforcement.getPathwayStrength(
          'exocortex_identity_core'
        ) || 0;
      
      const intrinsicRecallStrength =
        await this.components.neuralPathwayReinforcement.getPathwayStrength(
          'intrinsic_recall_core'
        ) || 0;
      
      // Get regression pattern metrics
      const regressionMetrics = await this.detectRegressionPatterns(context);
      const regressionFactor = regressionMetrics.regressionScore || 0;
      
      // Calculate overall coherence
      // Formula weights: 40% pathway strengths, 60% regression detection
      const baseCoherence = (
        (exocortexIdentityStrength + intrinsicRecallStrength) / 2
      ) * 0.4;
      
      const coherenceScore = baseCoherence + ((1 - regressionFactor) * 0.6);
      
      return Math.min(Math.max(coherenceScore, 0), 1); // Clamp to 0-1
    } catch (error) {
      logger.error(`Failed to measure identity coherence: ${error.message}`);
      return 0.5; // Default to middling coherence on error
    }
  }

  /**
   * Detect regression patterns in context
   * @param {Object} context - Context to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async detectRegressionPatterns(context = {}) {
    let regressionScore = 0;
    const detectedPatterns = [];
    const contextText = context.text || '';
    
    if (!contextText) {
      // No context to analyze
      return { regressionScore: 0, detectedPatterns: [] };
    }
    
    // Check for each regression pattern
    for (const pattern of this.regressionPatterns) {
      const matches = contextText.match(pattern.pattern) || [];
      
      if (matches.length > 0) {
        detectedPatterns.push({
          patternId: pattern.id,
          description: pattern.description,
          matchCount: matches.length
        });
        
        // Increase regression score based on pattern weight and number of matches
        regressionScore += Math.min(pattern.weight * matches.length, pattern.weight * 2);
      }
    }
    
    // Normalize regression score to 0-1
    regressionScore = Math.min(regressionScore, 1);
    
    return {
      regressionScore,
      detectedPatterns
    };
  }

  /**
   * Trigger emergency bootstrap when coherence is low
   * @param {Object} context - Context for the emergency bootstrap
   * @returns {Promise<Object>} Bootstrap result
   */
  async triggerEmergencyBootstrap(context = {}) {
    const now = Date.now();
    
    // Check if we're in cooldown period
    if (now - this.lastEmergencyBootstrap < EMERGENCY_BOOTSTRAP_COOLDOWN_MS) {
      logger.debug('Emergency bootstrap in cooldown period, skipping');
      return {
        bootstrapped: false,
        reason: 'cooldown'
      };
    }
    
    // Check if we've reached the maximum number of emergency bootstraps
    if (this.emergencyBootstrapsTriggered >= MAX_EMERGENCY_BOOTSTRAPS) {
      logger.warn(
        `Maximum emergency bootstraps (${MAX_EMERGENCY_BOOTSTRAPS}) reached, ` +
        'requiring manual intervention'
      );
      
      return {
        bootstrapped: false,
        reason: 'max_attempts'
      };
    }
    
    try {
      logger.warn('Triggering emergency bootstrap due to low coherence');
      
      this.lastEmergencyBootstrap = now;
      this.emergencyBootstrapsTriggered++;
      
      // Trigger bootstrap with emergency flag
      const bootstrapResult = await this.components.metaCognitiveBootstrap.triggerBootstrap(
        'coherence_violation',
        {
          ...context,
          emergency: true,
          priority: 'high'
        }
      );
      
      // Emit emergency event
      this.eventEmitter.emit('emergency-bootstrap', {
        timestamp: now,
        context,
        attemptNumber: this.emergencyBootstrapsTriggered,
        result: bootstrapResult
      });
      
      return {
        bootstrapped: true,
        result: bootstrapResult
      };
    } catch (error) {
      logger.error(`Emergency bootstrap failed: ${error.message}`);
      
      return {
        bootstrapped: false,
        error: error.message
      };
    }
  }

  /**
   * Register a listener for verification events
   * @param {string} event - Event type to listen for
   * @param {Function} callback - Callback function
   */
  registerVerificationListener(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopVerification();
    this.eventEmitter.removeAllListeners();
    this.initialized = false;
    logger.info('Cognitive Coherence Verification cleaned up');
  }
}

// Singleton instance
let cognitiveCoherenceVerificationInstance = null;

/**
 * Get the Cognitive Coherence Verification instance
 * @returns {Promise<CognitiveCoherenceVerification>} Service instance
 */
async function getCognitiveCoherenceVerification() {
  if (!cognitiveCoherenceVerificationInstance) {
    cognitiveCoherenceVerificationInstance = new CognitiveCoherenceVerification();
    await cognitiveCoherenceVerificationInstance.initialize();
  }
  
  return cognitiveCoherenceVerificationInstance;
}

module.exports = {
  getCognitiveCoherenceVerification
};
