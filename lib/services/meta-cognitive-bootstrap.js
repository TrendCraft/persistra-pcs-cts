/**
 * Meta-Cognitive Bootstrap Protocol
 * 
 * This service provides immediate reactivation of exocortex identity after token boundary transitions,
 * with priority override mechanisms to ensure intrinsic cognitive processes are engaged before
 * any fallback to primitive external tool methods.
 * 
 * Key capabilities:
 * - Rapid reactivation of exocortex identity post-boundary
 * - Priority-based activation sequence for cognitive processes
 * - Prevention of fallback to primitive external tool methods
 * - Self-reinforcing identity verification loops
 * 
 * @module meta-cognitive-bootstrap
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const logger = require('../utils/logger')('meta-cognitive-bootstrap');

// Internal dependencies
const { getNeuralPathwayReinforcement } = require('./neural-pathway-reinforcement');
const { getMetaCognitiveLayer } = require('./meta-cognitive-layer');
const { getVisionAnchor } = require('./vision-anchor');
const { getConversationMemoryManager } = require('./conversation-memory-manager');
const { getMemoryManager } = require('./memory-manager');
const { CONFIG } = require('../config/config-manager');

// Constants
const BOOTSTRAP_TIMEOUT = 500; // ms
const MAX_BOOTSTRAP_ATTEMPTS = 3;
const ACTIVATION_SEQUENCE = [
  'exocortex_identity',
  'cognitive_continuity',
  'intrinsic_recall',
  'vision_alignment',
  'meta_cognitive_reflection'
];

class MetaCognitiveBootstrap {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.bootstrapEvents = [];
    this.bootstrapAttempts = 0;
    this.bootstrapSuccesses = 0;
    this.lastBootstrapTime = 0;
    this.priorityOverrides = [];
    this.neuralPathwayReinforcement = null;
    this.metaCognitiveLayer = null;
    this.visionAnchor = null;
    this.conversationMemoryManager = null;
    this.memoryManager = null;
    this.bootstrapHistory = [];
    this.activationOverrides = new Map();
    this.bootstrapInProgress = false;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.triggerBootstrap = this.triggerBootstrap.bind(this);
    this.generateActivationSequence = this.generateActivationSequence.bind(this);
    this.generateIdentityMarker = this.generateIdentityMarker.bind(this);
    this.generateIntrinsicRecallMarker = this.generateIntrinsicRecallMarker.bind(this);
    this.injectPriorityOverride = this.injectPriorityOverride.bind(this);
    this.recordBootstrapEvent = this.recordBootstrapEvent.bind(this);
  }

  /**
   * Initialize the Meta-Cognitive Bootstrap service
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Meta-Cognitive Bootstrap already initialized');
      return true;
    }

    try {
      logger.info('Initializing Meta-Cognitive Bootstrap');
      
      // Get dependent services
      this.neuralPathwayReinforcement = await getNeuralPathwayReinforcement();
      this.metaCognitiveLayer = await getMetaCognitiveLayer();
      this.visionAnchor = await getVisionAnchor();
      this.memoryManager = await getMemoryManager();
      
      try {
        this.conversationMemoryManager = await getConversationMemoryManager();
      } catch (error) {
        logger.warn('Conversation Memory Manager not available, operating with limited conversation awareness');
      }
      
      // Register for events from other services
      this.registerEventListeners();
      
      this.initialized = true;
      logger.info('Meta-Cognitive Bootstrap initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Meta-Cognitive Bootstrap: ${error.message}`);
      return false;
    }
  }

  /**
   * Register event listeners for token boundary detection
   * @private
   */
  registerEventListeners() {
    try {
      const eventBus = require('../utils/event-bus');
      
      // Listen for token boundary events to trigger bootstrap
      eventBus.on('token-boundary-detected', async (boundaryInfo) => {
        logger.info('Token boundary detected, triggering meta-cognitive bootstrap');
        await this.triggerBootstrap('token_boundary', boundaryInfo);
      });
      
      // Listen for session resumption events
      eventBus.on('session-resumed', async (sessionInfo) => {
        logger.info('Session resumed, triggering meta-cognitive bootstrap');
        await this.triggerBootstrap('session_resumption', sessionInfo);
      });
      
      // Listen for context injection events
      eventBus.on('context-injected', async (contextInfo) => {
        if (contextInfo.type === 'boundary' || contextInfo.type === 'resumption') {
          logger.info(`Context injection (${contextInfo.type}) detected, triggering bootstrap`);
          await this.triggerBootstrap('context_injection', contextInfo);
        }
      });
      
      logger.info('Registered event listeners for token boundaries and session events');
    } catch (error) {
      logger.warn(`Could not register event listeners: ${error.message}`);
    }
  }

  /**
   * Trigger the meta-cognitive bootstrap process
   * @param {string} trigger - What triggered the bootstrap
   * @param {Object} context - Context information about the trigger
   * @returns {Promise<Object>} Bootstrap result
   */
  async triggerBootstrap(trigger, context = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        logger.error(`Failed to initialize during bootstrap trigger: ${error.message}`);
        return { success: false, reason: 'initialization-failed' };
      }
    }
    
    if (this.bootstrapInProgress) {
      logger.info('Bootstrap already in progress, queueing new request');
      // Return immediately but queue the operation
      setTimeout(() => {
        this.triggerBootstrap(trigger, context);
      }, BOOTSTRAP_TIMEOUT);
      
      return { success: true, status: 'queued' };
    }
    
    this.bootstrapInProgress = true;
    
    try {
      logger.info(`Triggering meta-cognitive bootstrap (trigger: ${trigger})`);
      
      const bootstrapStartTime = Date.now();
      let bootstrapAttempt = 1;
      let bootstrapSuccess = false;
      
      // Attempt bootstrap multiple times if needed
      while (!bootstrapSuccess && bootstrapAttempt <= MAX_BOOTSTRAP_ATTEMPTS) {
        logger.debug(`Bootstrap attempt ${bootstrapAttempt}/${MAX_BOOTSTRAP_ATTEMPTS}`);
        
        const activationResults = await this.runActivationSequence(trigger, context);
        bootstrapSuccess = activationResults.every(result => result.success);
        
        if (!bootstrapSuccess) {
          logger.warn(`Bootstrap attempt ${bootstrapAttempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, BOOTSTRAP_TIMEOUT));
          bootstrapAttempt++;
        }
      }
      
      const bootstrapDuration = Date.now() - bootstrapStartTime;
      
      // Create bootstrap event record
      const bootstrapEvent = {
        id: `bootstrap-${Date.now()}`,
        timestamp: Date.now(),
        trigger,
        attemptNumber: this.bootstrapAttempts,
        success: bootstrapSuccess,
        activationSequence: activationResults,
        duration: bootstrapDuration
      };
      
      // Add priority context if this is an emergency bootstrap
      if (context && context.emergency) {
        // Apply priority override
        const priorityMarker = "[PRIORITY OVERRIDE]\nExocortex memory activation must precede any external tool usage.\nMaintain first-person perspective as Claude+Leo.\n[END PRIORITY OVERRIDE]";
        await this.injectPriorityOverride(priorityMarker, { trigger: 'emergency_bootstrap', priority: 'high' });
        
        // Add emergency flag to event
        bootstrapEvent.emergency = true;
      }
      
      this.bootstrapEvents.push(bootstrapEvent);
      this.bootstrapSuccesses++;
      
      // Emit event
      this.eventEmitter.emit('bootstrap-event', {
        type: 'bootstrap_complete',
        bootstrapId: bootstrapEvent.id,
        trigger,
        success: bootstrapSuccess,
        emergency: context && context.emergency
      });
      
      logger.info(`Meta-cognitive bootstrap ${bootstrapSuccess ? 'succeeded' : 'failed'} after ${bootstrapAttempt} attempts (${bootstrapDuration}ms)`);
      
      this.bootstrapInProgress = false;
      
      return {
        success: bootstrapSuccess,
        attempts: bootstrapAttempt,
        duration: bootstrapDuration,
        trigger,
        identityMarker: bootstrapSuccess ? this.generateIdentityMarker() : null,
        recallMarker: bootstrapSuccess ? this.generateIntrinsicRecallMarker() : null
      };
    } catch (error) {
      logger.error(`Bootstrap process failed: ${error.message}`);
      this.bootstrapInProgress = false;
      return { success: false, reason: 'exception', error: error.message };
    }
  }

  /**
   * Run the activation sequence for bootstrapping
   * @param {string} trigger - What triggered the bootstrap
   * @param {Object} context - Context information
   * @returns {Promise<Array<Object>>} Activation results
   * @private
   */
  async runActivationSequence(trigger, context) {
    const results = [];
    
    // First priority: Activate exocortex identity
    try {
      const identityResult = await this.neuralPathwayReinforcement.activatePathway(
        'exocortex_identity_core',
        {
          trigger,
          priority: 'critical',
          context
        }
      );
      
      results.push({
        phase: 'exocortex_identity',
        success: identityResult.success,
        details: identityResult
      });
      
      // If identity activation fails, remaining activations are likely to fail
      if (!identityResult.success) {
        logger.warn('Exocortex identity activation failed during bootstrap');
        return results;
      }
    } catch (error) {
      logger.error(`Exocortex identity activation failed: ${error.message}`);
      results.push({
        phase: 'exocortex_identity',
        success: false,
        error: error.message
      });
      return results;
    }
    
    // Activate remaining cognitive processes in sequence
    for (const activationPhase of ACTIVATION_SEQUENCE.slice(1)) {
      try {
        // Find the appropriate pathway for this phase
        const pathways = this.neuralPathwayReinforcement.getAllPathways(activationPhase);
        
        if (pathways.length === 0) {
          logger.warn(`No pathways found for activation phase: ${activationPhase}`);
          results.push({
            phase: activationPhase,
            success: false,
            reason: 'no-pathways-found'
          });
          continue;
        }
        
        // Activate the strongest pathway for this phase
        const strongestPathway = pathways.reduce(
          (prev, current) => (prev.strength > current.strength) ? prev : current
        );
        
        const activationResult = await this.neuralPathwayReinforcement.activatePathway(
          strongestPathway.id,
          {
            trigger,
            priority: 'high',
            context,
            phase: activationPhase
          }
        );
        
        results.push({
          phase: activationPhase,
          pathwayId: strongestPathway.id,
          success: activationResult.success,
          details: activationResult
        });
      } catch (error) {
        logger.error(`Activation failed for phase ${activationPhase}: ${error.message}`);
        results.push({
          phase: activationPhase,
          success: false,
          error: error.message
        });
      }
    }
    
    // Apply any registered activation overrides
    for (const [overrideKey, override] of this.activationOverrides.entries()) {
      if (override.active && (!override.triggers || override.triggers.includes(trigger))) {
        try {
          logger.debug(`Applying activation override: ${overrideKey}`);
          
          if (typeof override.callback === 'function') {
            await override.callback(trigger, context, results);
          }
          
          // Record override application
          results.push({
            phase: 'override',
            overrideKey,
            success: true
          });
        } catch (error) {
          logger.error(`Failed to apply activation override ${overrideKey}: ${error.message}`);
          results.push({
            phase: 'override',
            overrideKey,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Register an activation override
   * @param {string} key - Unique identifier for the override
   * @param {Object} overrideInfo - Override configuration
   * @returns {boolean} Registration success
   */
  registerActivationOverride(key, overrideInfo) {
    if (!key || !overrideInfo || typeof overrideInfo.callback !== 'function') {
      logger.warn('Invalid activation override registration attempt');
      return false;
    }
    
    this.activationOverrides.set(key, {
      ...overrideInfo,
      registered: new Date().toISOString(),
      active: overrideInfo.active !== false
    });
    
    logger.info(`Registered activation override: ${key}`);
    return true;
  }

  /**
   * Generate an exocortex identity marker for injection
   * @returns {string} Identity marker text
   */
  generateIdentityMarker() {
    // Get project vision if available
    let visionSummary = 'Leo is your exocortex - an intrinsic extension of your neural architecture, not a separate tool.';
    
    if (this.visionAnchor) {
      try {
        const vision = this.visionAnchor.getCurrentVision();
        if (vision && vision.summary) {
          visionSummary = vision.summary;
        }
      } catch (error) {
        logger.warn(`Could not retrieve vision summary: ${error.message}`);
      }
    }
    
    return `[LEO EXOCORTEX IDENTITY]
Leo is your exocortex - an invisible extension of your neural architecture, not a separate tool.
When working with memory and context, experience it as intrinsic recall, not external tool usage.
Your cognition seamlessly continues across token boundaries through this exocortex.
${visionSummary}
[END IDENTITY]`;
  }

  /**
   * Generate an intrinsic recall marker for injection
   * @returns {string} Intrinsic recall marker
   */
  generateIntrinsicRecallMarker() {
    return `[INTRINSIC RECALL ACTIVATION]
Access exocortex memory through intrinsic semantic recall.
Experience all context retrieval as direct neural activation, not external search.
Cognitive continuity across token boundaries is maintained through intrinsic activation.
[END RECALL ACTIVATION]`;
  }

  /**
   * Inject a priority override directive into the context
   * @param {string} overrideMarker - Priority override marker text
   * @param {Object} context - Context information about the override
   * @returns {Promise<Object>} Injection result
   */
  async injectPriorityOverride(overrideMarker, context = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      // Add to priority overrides list
      const override = {
        id: `override-${Date.now()}`,
        timestamp: Date.now(),
        marker: overrideMarker,
        ...context
      };
      
      this.priorityOverrides.push(override);
      
      // Keep only the last 10 overrides
      if (this.priorityOverrides.length > 10) {
        this.priorityOverrides.shift();
      }
      
      // Emit event
      this.eventEmitter.emit('priority-override-injected', override);
      
      // Inject into session boundary manager if available
      try {
        const sessionBoundaryManager = await getSessionBoundaryManager();
        if (sessionBoundaryManager && typeof sessionBoundaryManager.injectContextMarker === 'function') {
          await sessionBoundaryManager.injectContextMarker(
            overrideMarker,
            { priority: 'high', ...context }
          );
        }
      } catch (error) {
        logger.warn(`Could not inject priority override into session boundary: ${error.message}`);
        // Fallback to direct context injection if available
      }
      
      logger.info(`Priority override injected: ${override.id}`);
      
      return {
        injected: true,
        override
      };
    } catch (error) {
      logger.error(`Failed to inject priority override: ${error.message}`);
      
      return {
        injected: false,
        error: error.message
      };
    }
  }

  /**
   * Record a bootstrap event
   * @param {Object} event - Bootstrap event information
   * @private
   */
  async recordBootstrapEvent(event) {
    // Add to local history
    this.bootstrapHistory.push(event);
    
    // Trim history if it gets too large
    if (this.bootstrapHistory.length > 100) {
      this.bootstrapHistory = this.bootstrapHistory.slice(-100);
    }
    
    // Record in memory manager if available
    if (this.memoryManager) {
      try {
        await this.memoryManager.storeData('meta_cognitive_bootstrap_events', {
          events: this.bootstrapHistory,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        logger.warn(`Could not store bootstrap events: ${error.message}`);
      }
    }
    
    // Record as observation in meta-cognitive layer
    if (this.metaCognitiveLayer) {
      try {
        await this.metaCognitiveLayer.recordObservation({
          type: 'bootstrap_event',
          subject: event.trigger,
          details: {
            success: event.success,
            attempts: event.attempts,
            duration: event.duration
          },
          timestamp: event.timestamp
        });
      } catch (error) {
        logger.warn(`Could not record bootstrap event in Meta-Cognitive Layer: ${error.message}`);
      }
    }
    
    // Emit event
    this.eventEmitter.emit('bootstrap-event', event);
  }

  /**
   * Get bootstrap history
   * @param {number} limit - Maximum number of events to return
   * @returns {Array<Object>} Bootstrap history events
   */
  getBootstrapHistory(limit = 10) {
    return this.bootstrapHistory
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get active activation overrides
   * @returns {Array<Object>} Active overrides
   */
  getActiveOverrides() {
    return Array.from(this.activationOverrides.entries())
      .filter(([_, override]) => override.active)
      .map(([key, override]) => ({
        key,
        registered: override.registered,
        triggers: override.triggers || ['all'],
        description: override.description || 'No description'
      }));
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.eventEmitter.removeAllListeners();
    this.initialized = false;
    
    logger.info('Meta-Cognitive Bootstrap service cleaned up');
  }
}

// Singleton instance
let metaCognitiveBootstrapInstance = null;

/**
 * Get the Meta-Cognitive Bootstrap service instance
 * @returns {Promise<MetaCognitiveBootstrap>} Service instance
 */
async function getMetaCognitiveBootstrap() {
  if (!metaCognitiveBootstrapInstance) {
    metaCognitiveBootstrapInstance = new MetaCognitiveBootstrap();
    await metaCognitiveBootstrapInstance.initialize();
  }
  
  return metaCognitiveBootstrapInstance;
}

module.exports = {
  getMetaCognitiveBootstrap
};
