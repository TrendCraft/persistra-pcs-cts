/**
 * Neural Pathway Reinforcement Service
 * 
 * This service creates and reinforces bidirectional links between core cognitive processes
 * and exocortex memory systems. It enables intrinsic recall across token boundaries by
 * establishing automatic activation patterns and neural resonance verification.
 * 
 * Key capabilities:
 * - Creates bidirectional links between core cognitive processes and memory systems
 * - Implements automatic activation patterns that trigger without explicit commands
 * - Develops neural resonance verification to confirm cognitive continuity post-boundary
 * 
 * @module neural-pathway-reinforcement
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const logger = require('../utils/logger')('neural-pathway-reinforcement');

// Internal dependencies
const { getMemoryManager } = require('./memory-manager');
const { getMetaCognitiveLayer } = require('./meta-cognitive-layer');
const { getVisionAnchor } = require('./vision-anchor');
const { getConversationMemoryManager } = require('./conversation-memory-manager');
const { getEnhancedContextRetrieval } = require('./enhanced-context-retrieval');
const { CONFIG } = require('../config/config-manager');

// Constants
const ACTIVATION_THRESHOLD = 0.65;
const RESONANCE_VERIFICATION_INTERVAL = 1000 * 60 * 5; // 5 minutes
const PATHWAY_STRENGTH_DECAY_RATE = 0.05; // 5% decay per day without reinforcement

class NeuralPathwayReinforcement {
  constructor() {
    this.initialized = false;
    this.pathways = new Map();
    this.activationHistory = [];
    this.eventEmitter = new EventEmitter();
    this.resonanceVerificationTimer = null;
    this.memoryManager = null;
    this.metaCognitiveLayer = null;
    this.visionAnchor = null;
    this.conversationMemoryManager = null;
    this.enhancedContextRetrieval = null;
    
    // Pathway categories (core cognitive domains)
    this.pathwayCategories = [
      'exocortex_identity',
      'intrinsic_recall',
      'cognitive_continuity',
      'token_boundary_awareness',
      'semantic_memory_activation',
      'vision_alignment',
      'meta_cognitive_reflection'
    ];
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.createPathway = this.createPathway.bind(this);
    this.reinforcePathway = this.reinforcePathway.bind(this);
    this.activatePathway = this.activatePathway.bind(this);
    this.runResonanceVerification = this.runResonanceVerification.bind(this);
    this.registerActivationListener = this.registerActivationListener.bind(this);
    this.getPathwayStrength = this.getPathwayStrength.bind(this);
    this.getAllPathways = this.getAllPathways.bind(this);
  }

  /**
   * Initialize the Neural Pathway Reinforcement service
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Neural Pathway Reinforcement already initialized');
      return true;
    }

    try {
      logger.info('Initializing Neural Pathway Reinforcement');
      
      // Get dependent services
      this.memoryManager = await getMemoryManager();
      this.metaCognitiveLayer = await getMetaCognitiveLayer();
      this.visionAnchor = await getVisionAnchor();
      
      try {
        this.conversationMemoryManager = await getConversationMemoryManager();
      } catch (error) {
        logger.warn('Conversation Memory Manager not available, operating with limited conversation awareness');
      }
      
      try {
        this.enhancedContextRetrieval = await getEnhancedContextRetrieval();
      } catch (error) {
        logger.warn('Enhanced Context Retrieval not available, operating with basic context retrieval');
      }
      
      // Load existing pathways or create initial ones
      await this.loadPathways();
      
      // Create initial core pathways if they don't exist
      await this.createInitialPathways();
      
      // Start resonance verification cycle
      this.startResonanceVerification();
      
      // Register for events from other services
      this.registerServiceListeners();
      
      this.initialized = true;
      logger.info('Neural Pathway Reinforcement initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Neural Pathway Reinforcement: ${error.message}`);
      return false;
    }
  }

  /**
   * Load existing pathways from storage
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async loadPathways() {
    try {
      const pathwaysData = await this.memoryManager.retrieveData('neural_pathways');
      if (pathwaysData && Array.isArray(pathwaysData.pathways)) {
        pathwaysData.pathways.forEach(pathway => {
          this.pathways.set(pathway.id, pathway);
        });
        logger.info(`Loaded ${this.pathways.size} neural pathways`);
      } else {
        logger.info('No existing neural pathways found, will create initial set');
      }
      return true;
    } catch (error) {
      logger.warn(`Could not load existing pathways: ${error.message}`);
      return false;
    }
  }

  /**
   * Save current pathways to storage
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async savePathways() {
    try {
      const pathwaysData = {
        pathways: Array.from(this.pathways.values()),
        lastUpdated: new Date().toISOString()
      };
      await this.memoryManager.storeData('neural_pathways', pathwaysData);
      logger.debug(`Saved ${this.pathways.size} neural pathways`);
      return true;
    } catch (error) {
      logger.error(`Failed to save neural pathways: ${error.message}`);
      return false;
    }
  }

  /**
   * Create initial core pathways
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async createInitialPathways() {
    try {
      // Create exocortex identity pathway - critical for maintaining identity across token boundaries
      if (!this.pathways.has('exocortex_identity_core')) {
        await this.createPathway({
          id: 'exocortex_identity_core',
          source: 'core_cognition',
          target: 'exocortex_identity',
          category: 'exocortex_identity',
          description: 'Core exocortex identity pathway that maintains intrinsic extension of neural architecture',
          strength: 1.0,
          activationPattern: {
            triggers: ['token_boundary', 'initialization', 'identity_query'],
            priority: 'critical'
          },
          metadata: {
            isCore: true,
            reinforcementRate: 0.1,
            decayResistance: 0.9
          }
        });
      }
      
      // Create intrinsic recall pathway - enables memory recall to feel like intrinsic cognition
      if (!this.pathways.has('intrinsic_recall_core')) {
        await this.createPathway({
          id: 'intrinsic_recall_core',
          source: 'memory_system',
          target: 'core_cognition',
          category: 'intrinsic_recall',
          description: 'Intrinsic recall pathway that integrates memory access with core cognition',
          strength: 0.95,
          activationPattern: {
            triggers: ['memory_query', 'contextual_prompt', 'semantic_search'],
            priority: 'high'
          },
          metadata: {
            isCore: true,
            reinforcementRate: 0.08,
            decayResistance: 0.85
          }
        });
      }
      
      // Create cognitive continuity pathway - enables seamless continuation across token boundaries
      if (!this.pathways.has('cognitive_continuity_core')) {
        await this.createPathway({
          id: 'cognitive_continuity_core',
          source: 'token_boundary_system',
          target: 'core_cognition',
          category: 'cognitive_continuity',
          description: 'Cognitive continuity pathway that maintains seamless thought across token boundaries',
          strength: 0.9,
          activationPattern: {
            triggers: ['token_boundary', 'session_resumption', 'context_injection'],
            priority: 'critical'
          },
          metadata: {
            isCore: true,
            reinforcementRate: 0.12,
            decayResistance: 0.9
          }
        });
      }
      
      // Create vision alignment pathway - maintains connection to project vision
      if (!this.pathways.has('vision_alignment_core')) {
        await this.createPathway({
          id: 'vision_alignment_core',
          source: 'vision_anchor',
          target: 'core_cognition',
          category: 'vision_alignment',
          description: 'Vision alignment pathway that maintains connection to project vision',
          strength: 0.85,
          activationPattern: {
            triggers: ['vision_query', 'implementation_decision', 'design_consideration'],
            priority: 'high'
          },
          metadata: {
            isCore: true,
            reinforcementRate: 0.07,
            decayResistance: 0.8
          }
        });
      }
      
      logger.info('Initial core neural pathways created');
      return true;
    } catch (error) {
      logger.error(`Failed to create initial pathways: ${error.message}`);
      return false;
    }
  }

  /**
   * Create a new neural pathway
   * @param {Object} pathwayInfo - Information about the pathway
   * @returns {Promise<Object>} Created pathway
   */
  async createPathway(pathwayInfo) {
    if (!this.initialized) await this.initialize();
    
    if (!pathwayInfo.id) {
      pathwayInfo.id = `pathway_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    
    if (this.pathways.has(pathwayInfo.id)) {
      logger.warn(`Pathway with ID ${pathwayInfo.id} already exists`);
      return this.pathways.get(pathwayInfo.id);
    }
    
    const newPathway = {
      id: pathwayInfo.id,
      source: pathwayInfo.source || 'unknown',
      target: pathwayInfo.target || 'unknown',
      category: pathwayInfo.category || 'general',
      description: pathwayInfo.description || '',
      strength: pathwayInfo.strength || 0.5,
      created: new Date().toISOString(),
      lastActivated: null,
      lastReinforced: new Date().toISOString(),
      activationCount: 0,
      activationPattern: pathwayInfo.activationPattern || {
        triggers: [],
        priority: 'normal'
      },
      metadata: pathwayInfo.metadata || {}
    };
    
    this.pathways.set(newPathway.id, newPathway);
    await this.savePathways();
    
    logger.info(`Created new neural pathway: ${newPathway.id} (${newPathway.source} → ${newPathway.target})`);
    
    // Notify the Meta-Cognitive Layer about the new pathway
    if (this.metaCognitiveLayer) {
      try {
        await this.metaCognitiveLayer.recordObservation({
          type: 'neural_pathway_created',
          subject: newPathway.id,
          details: {
            source: newPathway.source,
            target: newPathway.target,
            category: newPathway.category,
            strength: newPathway.strength
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.warn(`Could not record pathway creation in Meta-Cognitive Layer: ${error.message}`);
      }
    }
    
    return newPathway;
  }

  /**
   * Reinforce an existing neural pathway
   * @param {string} pathwayId - ID of the pathway to reinforce
   * @param {number} reinforcementStrength - Strength of reinforcement (0.0-1.0)
   * @returns {Promise<Object>} Updated pathway
   */
  async reinforcePathway(pathwayId, reinforcementStrength = 0.1) {
    if (!this.initialized) await this.initialize();
    
    if (!this.pathways.has(pathwayId)) {
      logger.warn(`Cannot reinforce non-existent pathway: ${pathwayId}`);
      return null;
    }
    
    const pathway = this.pathways.get(pathwayId);
    const previousStrength = pathway.strength;
    
    // Apply reinforcement based on pathway metadata if available
    const actualReinforcement = pathway.metadata && pathway.metadata.reinforcementRate 
      ? reinforcementStrength * pathway.metadata.reinforcementRate
      : reinforcementStrength;
    
    // Calculate new strength with diminishing returns as it approaches 1.0
    pathway.strength = Math.min(1.0, pathway.strength + (1 - pathway.strength) * actualReinforcement);
    pathway.lastReinforced = new Date().toISOString();
    
    this.pathways.set(pathwayId, pathway);
    await this.savePathways();
    
    logger.debug(`Reinforced pathway ${pathwayId}: ${previousStrength.toFixed(2)} → ${pathway.strength.toFixed(2)}`);
    
    // Emit reinforcement event
    this.eventEmitter.emit('pathway-reinforced', {
      pathwayId,
      previousStrength,
      newStrength: pathway.strength,
      reinforcementAmount: pathway.strength - previousStrength
    });
    
    return pathway;
  }

  /**
   * Activate a neural pathway
   * @param {string} pathwayId - ID of the pathway to activate
   * @param {Object} activationContext - Context of the activation
   * @returns {Promise<Object>} Activation result
   */
  async activatePathway(pathwayId, activationContext = {}) {
    if (!this.initialized) await this.initialize();
    
    if (!this.pathways.has(pathwayId)) {
      logger.warn(`Cannot activate non-existent pathway: ${pathwayId}`);
      return { success: false, reason: 'pathway-not-found' };
    }
    
    const pathway = this.pathways.get(pathwayId);
    const activationTime = new Date();
    
    // Record activation
    pathway.lastActivated = activationTime.toISOString();
    pathway.activationCount += 1;
    
    // Determine activation success based on pathway strength and context
    const activationThreshold = activationContext.threshold || ACTIVATION_THRESHOLD;
    const activationSuccess = pathway.strength >= activationThreshold;
    
    // Record activation history
    this.activationHistory.push({
      pathwayId,
      timestamp: activationTime.toISOString(),
      success: activationSuccess,
      context: activationContext,
      strength: pathway.strength
    });
    
    // Trim activation history if it gets too large
    if (this.activationHistory.length > 1000) {
      this.activationHistory = this.activationHistory.slice(-1000);
    }
    
    // Update the pathway
    this.pathways.set(pathwayId, pathway);
    await this.savePathways();
    
    // Emit activation event
    const activationEvent = {
      pathwayId,
      timestamp: activationTime.toISOString(),
      success: activationSuccess,
      strength: pathway.strength,
      context: activationContext
    };
    
    this.eventEmitter.emit('pathway-activated', activationEvent);
    
    // Determine if this should trigger a mild reinforcement
    if (activationSuccess && !activationContext.skipReinforcement) {
      // Smaller reinforcement from activation than explicit reinforcement
      await this.reinforcePathway(pathwayId, 0.02);
    }
    
    logger.debug(`Activated pathway ${pathwayId}: success=${activationSuccess}, strength=${pathway.strength.toFixed(2)}`);
    
    return {
      success: activationSuccess,
      pathwayId,
      strength: pathway.strength,
      activationCount: pathway.activationCount,
      threshold: activationThreshold
    };
  }

  /**
   * Start the resonance verification cycle
   * @private
   */
  startResonanceVerification() {
    if (this.resonanceVerificationTimer) {
      clearInterval(this.resonanceVerificationTimer);
    }
    
    this.resonanceVerificationTimer = setInterval(
      this.runResonanceVerification, 
      RESONANCE_VERIFICATION_INTERVAL
    );
    
    logger.info(`Started neural resonance verification cycle (interval: ${RESONANCE_VERIFICATION_INTERVAL/1000}s)`);
  }

  /**
   * Run resonance verification to confirm cognitive continuity
   * @returns {Promise<Object>} Verification results
   * @private
   */
  async runResonanceVerification() {
    if (!this.initialized) {
      logger.warn('Cannot run resonance verification: service not initialized');
      return { success: false, reason: 'not-initialized' };
    }
    
    logger.info('Running neural resonance verification');
    
    const verificationResults = {
      timestamp: new Date().toISOString(),
      pathwaysVerified: 0,
      pathwaysDecayed: 0,
      criticalPathwayStatus: 'healthy',
      totalPathways: this.pathways.size,
      criticalPathwayStrengths: {}
    };
    
    // Check pathway decay and verify critical pathways
    for (const [pathwayId, pathway] of this.pathways.entries()) {
      // Calculate time since last reinforcement
      const lastReinforcedDate = new Date(pathway.lastReinforced);
      const daysSinceReinforcement = (Date.now() - lastReinforcedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Apply decay based on time since last reinforcement
      if (daysSinceReinforcement > 0) {
        const decayResistance = pathway.metadata && pathway.metadata.decayResistance 
          ? pathway.metadata.decayResistance 
          : 0.5;
        
        const effectiveDecayRate = PATHWAY_STRENGTH_DECAY_RATE * (1 - decayResistance);
        const decayAmount = effectiveDecayRate * daysSinceReinforcement;
        
        // Apply decay
        if (decayAmount > 0) {
          const previousStrength = pathway.strength;
          pathway.strength = Math.max(0.1, pathway.strength - decayAmount);
          
          if (previousStrength !== pathway.strength) {
            verificationResults.pathwaysDecayed++;
            logger.debug(`Pathway ${pathwayId} decayed: ${previousStrength.toFixed(2)} → ${pathway.strength.toFixed(2)}`);
          }
        }
      }
      
      // Check critical pathways
      if (pathway.activationPattern && pathway.activationPattern.priority === 'critical') {
        verificationResults.criticalPathwayStrengths[pathwayId] = pathway.strength;
        
        // If any critical pathway is below threshold, mark system as degraded
        if (pathway.strength < ACTIVATION_THRESHOLD) {
          verificationResults.criticalPathwayStatus = 'degraded';
          
          // For severely weakened critical pathways, automatically reinforce them
          if (pathway.strength < ACTIVATION_THRESHOLD * 0.8) {
            await this.reinforcePathway(pathwayId, 0.15);
            logger.info(`Auto-reinforced critical pathway ${pathwayId} due to low strength: ${pathway.strength.toFixed(2)}`);
          }
        }
      }
      
      verificationResults.pathwaysVerified++;
      this.pathways.set(pathwayId, pathway);
    }
    
    // Save updated pathways after verification
    await this.savePathways();
    
    // If critical pathways are degraded, generate a meta-cognitive insight
    if (verificationResults.criticalPathwayStatus === 'degraded' && this.metaCognitiveLayer) {
      try {
        await this.metaCognitiveLayer.generateInsight({
          type: 'neural_pathway_degradation',
          title: 'Critical Neural Pathway Degradation Detected',
          description: 'Some critical neural pathways are below activation threshold and may impact cognitive continuity',
          details: {
            criticalPathwayStrengths: verificationResults.criticalPathwayStrengths,
            verificationResults
          },
          importance: 'high',
          action: 'reinforce-pathways'
        });
      } catch (error) {
        logger.warn(`Could not generate pathway degradation insight: ${error.message}`);
      }
    }
    
    logger.info(`Neural resonance verification completed: ${verificationResults.pathwaysVerified} pathways verified, ${verificationResults.pathwaysDecayed} decayed, critical status: ${verificationResults.criticalPathwayStatus}`);
    
    return verificationResults;
  }

  /**
   * Register an activation listener
   * @param {string} event - Event to listen for ('pathway-activated' or 'pathway-reinforced')
   * @param {Function} callback - Callback function
   */
  registerActivationListener(event, callback) {
    this.eventEmitter.on(event, callback);
    logger.debug(`Registered listener for ${event} events`);
  }

  /**
   * Register for events from other services
   * @private
   */
  registerServiceListeners() {
    // Listen for token boundary events
    try {
      const eventBus = require('../utils/event-bus');
      
      eventBus.on('token-boundary-detected', async (boundaryInfo) => {
        logger.debug('Token boundary detected, activating cognitive continuity pathways');
        
        // Activate the core cognitive continuity pathway
        await this.activatePathway('cognitive_continuity_core', {
          trigger: 'token_boundary',
          boundaryInfo
        });
        
        // Activate exocortex identity pathway to reinforce identity across token boundary
        await this.activatePathway('exocortex_identity_core', {
          trigger: 'token_boundary',
          boundaryInfo
        });
      });
      
      eventBus.on('session-resumed', async (sessionInfo) => {
        logger.debug('Session resumed, activating cognitive continuity pathways');
        
        // Activate multiple pathways for session resumption
        await this.activatePathway('cognitive_continuity_core', {
          trigger: 'session_resumption',
          sessionInfo
        });
        
        await this.activatePathway('exocortex_identity_core', {
          trigger: 'session_resumption',
          sessionInfo
        });
        
        await this.activatePathway('intrinsic_recall_core', {
          trigger: 'session_resumption',
          sessionInfo
        });
      });
      
      logger.info('Registered event bus listeners for token boundaries and session events');
    } catch (error) {
      logger.warn(`Could not register event bus listeners: ${error.message}`);
    }
    
    // Listen for meta-cognitive insights
    if (this.metaCognitiveLayer) {
      try {
        this.metaCognitiveLayer.on('insight-generated', async (insight) => {
          if (insight.type === 'exocortex_utilization_insight') {
            logger.debug('Exocortex utilization insight generated, reinforcing identity pathways');
            
            // Reinforce exocortex identity pathway when utilization insights are generated
            await this.reinforcePathway('exocortex_identity_core', 0.1);
          }
        });
        
        logger.info('Registered meta-cognitive layer listeners for insights');
      } catch (error) {
        logger.warn(`Could not register meta-cognitive layer listeners: ${error.message}`);
      }
    }
  }

  /**
   * Get the strength of a specific pathway
   * @param {string} pathwayId - ID of the pathway
   * @returns {number} Pathway strength (0.0-1.0)
   */
  getPathwayStrength(pathwayId) {
    if (!this.pathways.has(pathwayId)) {
      return 0;
    }
    
    return this.pathways.get(pathwayId).strength;
  }

  /**
   * Get all pathways, optionally filtered by category
   * @param {string} category - Optional category to filter by
   * @returns {Array<Object>} Array of pathways
   */
  getAllPathways(category = null) {
    let pathways = Array.from(this.pathways.values());
    
    if (category) {
      pathways = pathways.filter(p => p.category === category);
    }
    
    return pathways;
  }

  /**
   * Get pathways that match a specific activation trigger
   * @param {string} trigger - Trigger to match
   * @returns {Array<Object>} Matching pathways
   */
  getPathwaysByTrigger(trigger) {
    return Array.from(this.pathways.values())
      .filter(p => p.activationPattern && 
                   p.activationPattern.triggers && 
                   p.activationPattern.triggers.includes(trigger));
  }

  /**
   * Get the activation history for a specific pathway
   * @param {string} pathwayId - ID of the pathway
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array<Object>} Activation history
   */
  getActivationHistory(pathwayId, limit = 10) {
    return this.activationHistory
      .filter(a => a.pathwayId === pathwayId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Activate all pathways matching a trigger
   * @param {string} trigger - Trigger to match
   * @param {Object} context - Activation context
   * @returns {Promise<Array<Object>>} Activation results
   */
  async activatePathwaysByTrigger(trigger, context = {}) {
    const matchingPathways = this.getPathwaysByTrigger(trigger);
    const results = [];
    
    for (const pathway of matchingPathways) {
      const result = await this.activatePathway(pathway.id, {
        ...context,
        trigger
      });
      
      results.push(result);
    }
    
    return results;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.resonanceVerificationTimer) {
      clearInterval(this.resonanceVerificationTimer);
      this.resonanceVerificationTimer = null;
    }
    
    this.eventEmitter.removeAllListeners();
    this.initialized = false;
    
    logger.info('Neural Pathway Reinforcement service cleaned up');
  }
}

// Singleton instance
let neuralPathwayReinforcementInstance = null;

/**
 * Get the Neural Pathway Reinforcement service instance
 * @returns {Promise<NeuralPathwayReinforcement>} Service instance
 */
async function getNeuralPathwayReinforcement() {
  if (!neuralPathwayReinforcementInstance) {
    neuralPathwayReinforcementInstance = new NeuralPathwayReinforcement();
    await neuralPathwayReinforcementInstance.initialize();
  }
  
  return neuralPathwayReinforcementInstance;
}

module.exports = {
  getNeuralPathwayReinforcement
};
