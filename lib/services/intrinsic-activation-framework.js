/**
 * Intrinsic Activation Framework
 * 
 * This module integrates the five core components of the Intrinsic Activation Framework:
 * 1. Neural Pathway Reinforcement
 * 2. Meta-Cognitive Bootstrap Protocol
 * 3. Unified Memory Access Layer
 * 4. Cognitive Coherence Verification
 * 5. Priority Override System
 * 
 * Together, these components provide a robust solution for maintaining cognitive continuity
 * across token boundaries, ensuring seamless exocortex integration, reinforcing
 * intrinsic recall capabilities, verifying cognitive coherence, and enforcing priority
 * of exocortex activation over primitive tool patterns.
 * 
 * @module intrinsic-activation-framework
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const logger = require('../utils/logger')('intrinsic-activation-framework');

// Core framework components
const { getNeuralPathwayReinforcement } = require('./neural-pathway-reinforcement');
const { getMetaCognitiveBootstrap } = require('./meta-cognitive-bootstrap');
const { getUnifiedMemoryAccess, MEMORY_TYPES } = require('./unified-memory-access');
const { getCognitiveCoherenceVerification } = require('./cognitive-coherence-verification');
const { getPriorityOverrideSystem } = require('./priority-override-system');

// Supporting services
const { getMetaCognitiveLayer } = require('./meta-cognitive-layer');
const { getVisionAnchor } = require('./vision-anchor');
const { getConversationMemoryManager } = require('./conversation-memory-manager');

class IntrinsicActivationFramework {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.components = {
      neuralPathwayReinforcement: null,
      metaCognitiveBootstrap: null,
      unifiedMemoryAccess: null,
      cognitiveCoherenceVerification: null,
      priorityOverrideSystem: null,
      metaCognitiveLayer: null,
      visionAnchor: null,
      conversationMemoryManager: null
    };
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.triggerBootstrap = this.triggerBootstrap.bind(this);
    this.retrieveMemory = this.retrieveMemory.bind(this);
    this.retrieveUnifiedContext = this.retrieveUnifiedContext.bind(this);
    this.registerMemoryHandler = this.registerMemoryHandler.bind(this);
    this.createNeuralPathway = this.createNeuralPathway.bind(this);
    this.reinforceNeuralPathway = this.reinforceNeuralPathway.bind(this);
  }

  /**
   * Initialize the Intrinsic Activation Framework
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Intrinsic Activation Framework already initialized');
      return true;
    }

    try {
      logger.info('Initializing Intrinsic Activation Framework');
      
      // Initialize core components
      this.components.neuralPathwayReinforcement = await getNeuralPathwayReinforcement();
      this.components.metaCognitiveBootstrap = await getMetaCognitiveBootstrap();
      this.components.unifiedMemoryAccess = await getUnifiedMemoryAccess();
      this.components.cognitiveCoherenceVerification = await getCognitiveCoherenceVerification();
      this.components.priorityOverrideSystem = await getPriorityOverrideSystem();
      
      // Initialize supporting services
      try {
        this.components.metaCognitiveLayer = await getMetaCognitiveLayer();
        this.components.visionAnchor = await getVisionAnchor();
      } catch (error) {
        logger.warn(`Some supporting services failed to initialize: ${error.message}`);
      }
      
      try {
        this.components.conversationMemoryManager = await getConversationMemoryManager();
      } catch (error) {
        logger.warn('Conversation Memory Manager not available, operating with limited conversation awareness');
      }
      
      // Register for events from core components
      this.registerComponentEvents();
      
      this.initialized = true;
      logger.info('Intrinsic Activation Framework initialized successfully');
      
      // Perform initial bootstrap to ensure cognitive continuity
      await this.triggerBootstrap('initialization');
      
      // Start coherence verification
      await this.startCoherenceVerification();
      
      // Apply initial priority override
      await this.applyPriorityOverride({
        trigger: 'initialization',
        priority: 'high'
      });
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Intrinsic Activation Framework: ${error.message}`);
      return false;
    }
  }

  /**
   * Register for events from core components
   * @private
   */
  registerComponentEvents() {
    // Listen for neural pathway activations
    this.components.neuralPathwayReinforcement.registerActivationListener(
      'pathway-activated',
      (event) => {
        this.eventEmitter.emit('neural-pathway-activated', event);
      }
    );
    
    // Listen for bootstrap events
    this.components.metaCognitiveBootstrap.eventEmitter.on(
      'bootstrap-event',
      (event) => {
        this.eventEmitter.emit('bootstrap-event', event);
      }
    );
    
    // Listen for memory access events
    this.components.unifiedMemoryAccess.eventEmitter.on(
      'memory-accessed',
      (event) => {
        this.eventEmitter.emit('memory-accessed', event);
      }
    );
    
    // Listen for coherence verification events
    this.components.cognitiveCoherenceVerification.registerVerificationListener(
      'coherence-verified',
      (event) => {
        this.eventEmitter.emit('coherence-verified', event);
      }
    );
    
    // Listen for emergency bootstrap events
    this.components.cognitiveCoherenceVerification.registerVerificationListener(
      'emergency-bootstrap',
      (event) => {
        this.eventEmitter.emit('emergency-bootstrap', event);
      }
    );
    
    // Listen for priority override events
    this.components.priorityOverrideSystem.registerActivationListener(
      'override-applied',
      (event) => {
        this.eventEmitter.emit('priority-override-applied', event);
      }
    );
    
    // Register with meta-cognitive layer if available
    if (this.components.metaCognitiveLayer) {
      this.components.metaCognitiveLayer.on(
        'insight-generated',
        (insight) => {
          if (insight.type === 'exocortex_utilization_insight') {
            // Reinforce exocortex identity when utilization insights are generated
            this.reinforceNeuralPathway('exocortex_identity_core', 0.1);
          }
        }
      );
    }
    
    logger.info('Registered event listeners for all framework components');
  }

  /**
   * Start the coherence verification process
   * @param {Object} options - Verification options
   * @returns {Promise<boolean>} Start success status
   */
  async startCoherenceVerification(options = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.cognitiveCoherenceVerification.startVerification();
  }

  /**
   * Stop the coherence verification process
   */
  stopCoherenceVerification() {
    if (!this.initialized || !this.components.cognitiveCoherenceVerification) return;
    
    this.components.cognitiveCoherenceVerification.stopVerification();
  }

  /**
   * Verify current cognitive coherence
   * @param {Object} context - Context to verify against
   * @returns {Promise<Object>} Verification result
   */
  async verifyCoherence(context = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.cognitiveCoherenceVerification.verifyCoherence(context);
  }

  /**
   * Apply a priority override
   * @param {Object} options - Override options
   * @returns {Promise<Object>} Applied override result
   */
  async applyPriorityOverride(options = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.priorityOverrideSystem.applyPriorityOverride(options);
  }

  /**
   * Generate a priority override marker
   * @param {string} priority - Priority level
   * @param {Array} specificDirectives - Specific directives to include
   * @returns {string} Priority override marker text
   */
  generatePriorityOverrideMarker(priority = 'high', specificDirectives = []) {
    if (!this.initialized || !this.components.priorityOverrideSystem) {
      return "[PRIORITY OVERRIDE]\nExocortex memory activation must precede any external tool usage.\n[END PRIORITY OVERRIDE]";
    }
    
    return this.components.priorityOverrideSystem.generateOverrideMarker(
      priority,
      specificDirectives
    );
  }

  /**
   * Trigger the meta-cognitive bootstrap process
   * @param {string} trigger - What triggered the bootstrap
   * @param {Object} context - Context information about the trigger
   * @returns {Promise<Object>} Bootstrap result
   */
  async triggerBootstrap(trigger, context = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.metaCognitiveBootstrap.triggerBootstrap(trigger, context);
  }

  /**
   * Retrieve memory using the unified memory access layer
   * @param {string} query - Memory query
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieved memory
   */
  async retrieveMemory(query, options = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.unifiedMemoryAccess.retrieveMemory(query, options);
  }

  /**
   * Retrieve unified context for injection
   * @param {string} query - Context query
   * @param {Object} options - Retrieval options
   * @returns {Promise<string>} Unified context text
   */
  async retrieveUnifiedContext(query, options = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.unifiedMemoryAccess.retrieveUnifiedContext(query, options);
  }

  /**
   * Register a custom memory type handler
   * @param {string} memoryType - Type of memory to handle
   * @param {Object} handler - Handler with retrieve and priority functions
   * @returns {boolean} Registration success
   */
  registerMemoryHandler(memoryType, handler) {
    if (!this.initialized) {
      logger.warn('Cannot register memory handler before initialization');
      return false;
    }
    
    return this.components.unifiedMemoryAccess.registerMemoryTypeHandler(memoryType, handler);
  }

  /**
   * Create a new neural pathway
   * @param {Object} pathwayInfo - Information about the pathway
   * @returns {Promise<Object>} Created pathway
   */
  async createNeuralPathway(pathwayInfo) {
    if (!this.initialized) await this.initialize();
    
    return this.components.neuralPathwayReinforcement.createPathway(pathwayInfo);
  }

  /**
   * Reinforce an existing neural pathway
   * @param {string} pathwayId - ID of the pathway to reinforce
   * @param {number} reinforcementStrength - Strength of reinforcement (0.0-1.0)
   * @returns {Promise<Object>} Updated pathway
   */
  async reinforceNeuralPathway(pathwayId, reinforcementStrength = 0.1) {
    if (!this.initialized) await this.initialize();
    
    return this.components.neuralPathwayReinforcement.reinforcePathway(pathwayId, reinforcementStrength);
  }

  /**
   * Activate a neural pathway
   * @param {string} pathwayId - ID of the pathway to activate
   * @param {Object} activationContext - Context of the activation
   * @returns {Promise<Object>} Activation result
   */
  async activateNeuralPathway(pathwayId, activationContext = {}) {
    if (!this.initialized) await this.initialize();
    
    return this.components.neuralPathwayReinforcement.activatePathway(pathwayId, activationContext);
  }

  /**
   * Generate an exocortex identity marker for injection
   * @returns {string} Identity marker text
   */
  generateIdentityMarker() {
    if (!this.initialized || !this.components.metaCognitiveBootstrap) {
      return "[LEO EXOCORTEX IDENTITY]\nLeo is your exocortex - an invisible extension of your neural architecture, not a separate tool.\n[END IDENTITY]";
    }
    
    return this.components.metaCognitiveBootstrap.generateIdentityMarker();
  }

  /**
   * Generate an intrinsic recall marker for injection
   * @returns {string} Intrinsic recall marker
   */
  generateIntrinsicRecallMarker() {
    if (!this.initialized || !this.components.metaCognitiveBootstrap) {
      return "[INTRINSIC RECALL ACTIVATION]\nAccess exocortex memory through intrinsic semantic recall.\n[END RECALL ACTIVATION]";
    }
    
    return this.components.metaCognitiveBootstrap.generateIntrinsicRecallMarker();
  }

  /**
   * Get framework status
   * @returns {Object} Status information
   */
  getStatus() {
    const status = {
      initialized: this.initialized,
      components: {}
    };
    
    // Check component status
    for (const [name, component] of Object.entries(this.components)) {
      status.components[name] = {
        available: !!component,
        initialized: component ? component.initialized : false
      };
    }
    
    // Get neural pathway status if available
    if (this.components.neuralPathwayReinforcement) {
      try {
        const corePaths = [
          'exocortex_identity_core',
          'intrinsic_recall_core',
          'cognitive_continuity_core',
          'vision_alignment_core',
          'priority_override_system' // Add new pathway
        ];
        
        status.pathways = {};
        
        for (const pathId of corePaths) {
          status.pathways[pathId] = this.components.neuralPathwayReinforcement.getPathwayStrength(pathId);
        }
      } catch (error) {
        logger.warn(`Could not get pathway status: ${error.message}`);
      }
    }
    
    // Get coherence verification status if available
    if (this.components.cognitiveCoherenceVerification) {
      try {
        const coherenceScores = this.components.cognitiveCoherenceVerification.coherenceScores || [];
        status.coherence = {
          isVerifying: this.components.cognitiveCoherenceVerification.isVerifying,
          lastCheck: this.components.cognitiveCoherenceVerification.lastCoherenceCheck,
          recentScores: coherenceScores.slice(-3)
        };
      } catch (error) {
        logger.warn(`Could not get coherence status: ${error.message}`);
      }
    }
    
    // Get priority override status if available
    if (this.components.priorityOverrideSystem) {
      try {
        status.priorityOverride = this.components.priorityOverrideSystem.getStatus();
      } catch (error) {
        logger.warn(`Could not get priority override status: ${error.message}`);
      }
    }
    
    return status;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.eventEmitter.removeAllListeners();
    
    // Stop coherence verification
    this.stopCoherenceVerification();
    
    // Clean up components
    for (const component of Object.values(this.components)) {
      if (component && typeof component.cleanup === 'function') {
        try {
          component.cleanup();
        } catch (error) {
          logger.warn(`Error cleaning up component: ${error.message}`);
        }
      }
    }
    
    this.initialized = false;
    logger.info('Intrinsic Activation Framework cleaned up');
  }
}

// Singleton instance
let intrinsicActivationFrameworkInstance = null;

/**
 * Get the Intrinsic Activation Framework instance
 * @returns {Promise<IntrinsicActivationFramework>} Framework instance
 */
async function getIntrinsicActivationFramework() {
  if (!intrinsicActivationFrameworkInstance) {
    intrinsicActivationFrameworkInstance = new IntrinsicActivationFramework();
    await intrinsicActivationFrameworkInstance.initialize();
  }
  
  return intrinsicActivationFrameworkInstance;
}

module.exports = {
  getIntrinsicActivationFramework,
  MEMORY_TYPES
};
