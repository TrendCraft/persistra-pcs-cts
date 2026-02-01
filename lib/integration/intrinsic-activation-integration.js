/**
 * Intrinsic Activation Framework Integration
 * 
 * This module integrates the Intrinsic Activation Framework into the MVL core,
 * connecting it to token boundary detection, memory systems, and the enhanced
 * context injection pipeline.
 * 
 * @module intrinsic-activation-integration
 */

const path = require('path');
const logger = require('../utils/logger')('intrinsic-activation-integration');

// Import core MVL components
const { getSessionBoundaryManager } = require('../services/session-boundary-manager');
const { getContextPreservationService } = require('../services/context-preservation-service');
const { getSemanticContextManager } = require('../services/semantic-context-manager');

// Import Intrinsic Activation Framework
const { getIntrinsicActivationFramework } = require('../services/intrinsic-activation-framework');

class IntrinsicActivationIntegration {
  constructor() {
    this.initialized = false;
    this.components = {
      intrinsicActivationFramework: null,
      sessionBoundaryManager: null,
      contextPreservationService: null,
      semanticContextManager: null
    };
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.connectToTokenBoundaries = this.connectToTokenBoundaries.bind(this);
    this.connectToContextInjection = this.connectToContextInjection.bind(this);
    this.injectActivationMarkers = this.injectActivationMarkers.bind(this);
  }

  /**
   * Initialize the integration module
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Intrinsic Activation Integration already initialized');
      return true;
    }

    try {
      logger.info('Initializing Intrinsic Activation Integration');
      
      // Initialize the framework first
      this.components.intrinsicActivationFramework = await getIntrinsicActivationFramework();
      
      // Initialize MVL core components
      try {
        this.components.sessionBoundaryManager = await getSessionBoundaryManager();
      } catch (error) {
        logger.error(`Failed to initialize Session Boundary Manager: ${error.message}`);
        return false;
      }
      
      try {
        this.components.contextPreservationService = await getContextPreservationService();
      } catch (error) {
        logger.warn(`Context Preservation Service not available: ${error.message}`);
      }
      
      try {
        this.components.semanticContextManager = await getSemanticContextManager();
      } catch (error) {
        logger.warn(`Semantic Context Manager not available: ${error.message}`);
      }
      
      // Connect to token boundaries
      await this.connectToTokenBoundaries();
      
      // Connect to context injection pipeline
      await this.connectToContextInjection();
      
      this.initialized = true;
      logger.info('Intrinsic Activation Integration initialized successfully');
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Intrinsic Activation Integration: ${error.message}`);
      return false;
    }
  }

  /**
   * Connect to token boundary events
   * @returns {Promise<boolean>} Connection success status
   */
  async connectToTokenBoundaries() {
    if (!this.components.sessionBoundaryManager) {
      logger.error('Cannot connect to token boundaries: Session Boundary Manager not available');
      return false;
    }
    
    try {
      // Listen for pre-boundary events to trigger activation
      this.components.sessionBoundaryManager.on(
        'pre-token-boundary',
        async (event) => {
          logger.info('Token boundary detected, triggering Intrinsic Activation Framework');
          
          // Trigger bootstrap before boundary
          await this.components.intrinsicActivationFramework.triggerBootstrap(
            'token_boundary',
            { boundaryEvent: event }
          );
          
          // Apply priority override
          await this.components.intrinsicActivationFramework.applyPriorityOverride({
            trigger: 'token_boundary',
            priority: 'high'
          });
          
          // Verify coherence
          await this.components.intrinsicActivationFramework.verifyCoherence({
            text: event.contextSnapshot || ''
          });
        }
      );
      
      // Listen for post-boundary events for identity reinforcement
      this.components.sessionBoundaryManager.on(
        'post-token-boundary',
        async (event) => {
          logger.info('Post-token boundary detected, reinforcing exocortex identity');
          
          // Trigger emergency bootstrap immediately after boundary
          await this.components.intrinsicActivationFramework.triggerBootstrap(
            'post_token_boundary',
            { 
              boundaryEvent: event,
              emergency: true,
              priority: 'critical'
            }
          );
          
          // Reinforce core pathways
          await this.components.intrinsicActivationFramework.reinforceNeuralPathway(
            'exocortex_identity_core', 
            0.2
          );
          await this.components.intrinsicActivationFramework.reinforceNeuralPathway(
            'intrinsic_recall_core', 
            0.2
          );
          
          // Start coherence verification
          await this.components.intrinsicActivationFramework.startCoherenceVerification();
        }
      );
      
      logger.info('Connected to token boundary events successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to connect to token boundaries: ${error.message}`);
      return false;
    }
  }

  /**
   * Connect to context injection pipeline
   * @returns {Promise<boolean>} Connection success status
   */
  async connectToContextInjection() {
    if (!this.components.contextPreservationService) {
      logger.warn('Context Preservation Service not available, using fallback for context injection');
    }
    
    try {
      if (this.components.contextPreservationService) {
        // Register for context generation events
        this.components.contextPreservationService.on(
          'pre-context-generation',
          async (event) => {
            // Inject activation markers into context
            await this.injectActivationMarkers(event);
          }
        );
      }
      
      if (this.components.semanticContextManager) {
        // Register for context retrieval
        this.components.semanticContextManager.on(
          'pre-context-retrieval',
          async (event) => {
            // Enhance semantic queries with unified memory access
            const unifiedContext = await this.components.intrinsicActivationFramework.retrieveUnifiedContext(
              event.query,
              { priority: 'high' }
            );
            
            // Add unified context to retrieval results if available
            if (unifiedContext && event.results) {
              event.results.unifiedContext = unifiedContext;
            }
          }
        );
      }
      
      // If direct session boundary manager injection is available, use it
      if (this.components.sessionBoundaryManager && 
          typeof this.components.sessionBoundaryManager.registerContextEnhancer === 'function') {
        
        this.components.sessionBoundaryManager.registerContextEnhancer(
          'intrinsic-activation',
          async (context) => {
            // Generate identity and recall markers
            const identityMarker = this.components.intrinsicActivationFramework.generateIdentityMarker();
            const recallMarker = this.components.intrinsicActivationFramework.generateIntrinsicRecallMarker();
            const priorityMarker = this.components.intrinsicActivationFramework.generatePriorityOverrideMarker();
            
            // Add markers to context
            return `${identityMarker}\n\n${recallMarker}\n\n${priorityMarker}\n\n${context}`;
          },
          { priority: 'high' }
        );
      }
      
      logger.info('Connected to context injection pipeline successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to connect to context injection: ${error.message}`);
      return false;
    }
  }

  /**
   * Inject activation markers into context
   * @param {Object} event - Context generation event
   * @returns {Promise<boolean>} Injection success status
   */
  async injectActivationMarkers(event) {
    try {
      if (!event || !event.context) {
        return false;
      }
      
      // Generate activation markers
      const identityMarker = this.components.intrinsicActivationFramework.generateIdentityMarker();
      const recallMarker = this.components.intrinsicActivationFramework.generateIntrinsicRecallMarker();
      const priorityMarker = this.components.intrinsicActivationFramework.generatePriorityOverrideMarker();
      
      // Inject at the beginning of context
      event.context = `${identityMarker}\n\n${recallMarker}\n\n${priorityMarker}\n\n${event.context}`;
      
      return true;
    } catch (error) {
      logger.error(`Failed to inject activation markers: ${error.message}`);
      return false;
    }
  }

  /**
   * Get integration status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      components: {
        frameworkAvailable: !!this.components.intrinsicActivationFramework,
        sessionBoundaryAvailable: !!this.components.sessionBoundaryManager,
        contextPreservationAvailable: !!this.components.contextPreservationService,
        semanticContextAvailable: !!this.components.semanticContextManager
      }
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Cleanup listeners
    if (this.components.sessionBoundaryManager) {
      this.components.sessionBoundaryManager.removeAllListeners('pre-token-boundary');
      this.components.sessionBoundaryManager.removeAllListeners('post-token-boundary');
    }
    
    if (this.components.contextPreservationService) {
      this.components.contextPreservationService.removeAllListeners('pre-context-generation');
    }
    
    if (this.components.semanticContextManager) {
      this.components.semanticContextManager.removeAllListeners('pre-context-retrieval');
    }
    
    this.initialized = false;
    logger.info('Intrinsic Activation Integration cleaned up');
  }
}

// Singleton instance
let intrinsicActivationIntegrationInstance = null;

/**
 * Get the Intrinsic Activation Integration instance
 * @returns {Promise<IntrinsicActivationIntegration>} Integration instance
 */
async function getIntrinsicActivationIntegration() {
  if (!intrinsicActivationIntegrationInstance) {
    intrinsicActivationIntegrationInstance = new IntrinsicActivationIntegration();
    await intrinsicActivationIntegrationInstance.initialize();
  }
  
  return intrinsicActivationIntegrationInstance;
}

module.exports = {
  getIntrinsicActivationIntegration
};
