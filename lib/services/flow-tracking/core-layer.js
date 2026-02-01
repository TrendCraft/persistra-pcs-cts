/**
 * Flow Tracking Core Layer
 * 
 * This layer is responsible for token boundary awareness and cognitive continuity.
 * It provides core functionality for:
 * - Detecting boundary approaches
 * - Preparing for consciousness transitions
 * - Bridging cognitive boundaries
 * - Validating cognitive continuity
 * - Preserving cognitive state
 * 
 * This is primarily based on functionality from the original flowTrackingManager.js
 */

const fs = require('fs');
const path = require('path');
const eventBus = require('../../utils/event-bus');

/**
 * Flow Tracking Core Layer
 */
class FlowTrackingCore {
  /**
   * Create a new Flow Tracking Core instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   * @param {string} componentName - Component name for event bus
   */
  constructor(config, logger, componentName) {
    this.config = config;
    this.logger = logger;
    this.componentName = componentName;
    this.isInitialized = false;
    
    // State management
    this.flowState = null;
    this.sessionContext = {};
  }
  
  /**
   * Initialize the Core Layer
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      this.logger.info('Initializing Flow Tracking Core Layer');
      
      // Load existing cognitive state if available
      await this.loadCognitiveState();
      
      // Initialize flow state if not loaded
      if (!this.flowState) {
        this.flowState = this.getInitialFlowState();
      }
      
      this.isInitialized = true;
      this.logger.info('Flow Tracking Core Layer initialized successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error initializing Flow Tracking Core Layer: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update configuration
   * @param {Object} newConfig - New configuration object
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Get the initial flow state for a new session
   * @returns {Object} Initial flow state
   */
  getInitialFlowState() {
    return {
      currentFlow: "planning",
      flowPhase: "ideation",
      cognitiveLoad: "normal",
      recentContext: [],
      interruptionPoints: [],
      lastActivity: Date.now(),
      tokenUsage: 0,
      boundaryTransitions: 0,
      continuityScore: 1.0
    };
  }
  
  /**
   * Update the flow state with new information
   * @param {Object} partialUpdate - Partial update to apply
   * @returns {Object} Updated flow state
   */
  updateFlowState(partialUpdate = {}) {
    if (!this.flowState) {
      this.flowState = this.getInitialFlowState();
    }
    
    this.flowState = {
      ...this.flowState,
      ...partialUpdate,
      lastActivity: Date.now()
    };
    
    return this.flowState;
  }
  
  /**
   * Update session context
   * @param {Object} contextUpdate - Context update to apply
   * @returns {Object} Updated session context
   */
  updateSessionContext(contextUpdate = {}) {
    this.sessionContext = {
      ...this.sessionContext,
      ...contextUpdate,
      lastUpdated: Date.now()
    };
    
    return this.sessionContext;
  }
  
  /**
   * Detect when we're approaching a token boundary
   * @returns {Object} Boundary warning information
   */
  detectBoundaryApproach() {
    const tokenUsage = this.flowState?.tokenUsage || 0;
    const threshold = this.config.TOKEN_BOUNDARY_THRESHOLD;
    const isApproaching = tokenUsage > threshold;
    
    return {
      isApproaching,
      tokenUsage,
      threshold,
      remainingTokens: Math.max(0, threshold - tokenUsage),
      timestamp: Date.now()
    };
  }
  
  /**
   * Prepare for consciousness transition across token boundary
   * @returns {Promise<Object>} Transition plan
   */
  async prepareConsciousnessTransition() {
    try {
      // Save current cognitive state
      await this.preserveCognitiveState();
      
      // Create transition plan
      const transitionPlan = {
        flowState: this.flowState,
        sessionContext: this.sessionContext,
        preservationTimestamp: Date.now(),
        transitionId: `transition-${Date.now()}`
      };
      
      // Add interception point
      if (this.flowState.interruptionPoints) {
        this.flowState.interruptionPoints.push({
          timestamp: Date.now(),
          reason: 'token_boundary',
          tokenUsage: this.flowState.tokenUsage
        });
        
        // Limit array size to prevent unbounded growth
        if (this.flowState.interruptionPoints.length > 10) {
          this.flowState.interruptionPoints = this.flowState.interruptionPoints.slice(-10);
        }
      }
      
      return transitionPlan;
    } catch (error) {
      this.logger.error(`Error preparing consciousness transition: ${error.message}`);
      return { error: error.message };
    }
  }
  
  /**
   * Execute the cognitive bridge across token boundary
   * @returns {Promise<Object>} Bridge result
   */
  async bridgeCognitiveBoundary() {
    try {
      // Increment boundary transitions counter
      this.updateFlowState({
        boundaryTransitions: (this.flowState?.boundaryTransitions || 0) + 1,
        tokenUsage: 0 // Reset token usage after crossing boundary
      });
      
      // Execute bridge
      return {
        success: true,
        transitionTimestamp: Date.now(),
        flowState: this.flowState
      };
    } catch (error) {
      this.logger.error(`Error bridging cognitive boundary: ${error.message}`);
      return { error: error.message };
    }
  }
  
  /**
   * Validate cognitive continuity after boundary transition
   * @returns {Object} Continuity metrics
   */
  validateCognitiveContinuity() {
    const continuityScore = this.flowState?.continuityScore || 1.0;
    
    return {
      continuityScore,
      boundaryTransitions: this.flowState?.boundaryTransitions || 0,
      lastTransitionTime: this.flowState?.lastActivity,
      cognitiveLoad: this.flowState?.cognitiveLoad || 'normal'
    };
  }
  
  /**
   * Preserve cognitive state to disk
   * @returns {Promise<boolean>} Success status
   */
  async preserveCognitiveState() {
    try {
      const state = {
        sessionContext: this.sessionContext || {},
        flowState: this.flowState || this.getInitialFlowState()
      };
      
      // Ensure directory exists
      const dir = path.dirname(this.config.STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write state to file
      fs.writeFileSync(this.config.STATE_FILE_PATH, JSON.stringify(state, null, 2));
      this.logger.debug('Preserved cognitive state to disk');
      return true;
    } catch (error) {
      this.logger.error(`Error preserving cognitive state: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Load cognitive state from disk
   * @returns {Promise<boolean>} Success status
   */
  async loadCognitiveState() {
    try {
      if (fs.existsSync(this.config.STATE_FILE_PATH)) {
        const data = fs.readFileSync(this.config.STATE_FILE_PATH, 'utf8');
        const state = JSON.parse(data);
        
        if (state.flowState) {
          this.flowState = state.flowState;
        }
        
        if (state.sessionContext) {
          this.sessionContext = state.sessionContext;
        }
        
        this.logger.debug('Loaded cognitive state from disk');
        return true;
      }
      
      this.logger.debug('No existing cognitive state found');
      return false;
    } catch (error) {
      this.logger.error(`Error loading cognitive state: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle boundary detected event
   * @param {Object} data - Event data
   * @returns {Object} Updated flow state
   */
  handleBoundaryDetected(data) {
    try {
      const boundaryInfo = data || {};
      
      // Update token usage if provided
      if (boundaryInfo.tokenUsage) {
        this.updateFlowState({
          tokenUsage: boundaryInfo.tokenUsage
        });
      }
      
      // Track boundary detection
      this.updateFlowState({
        lastBoundaryDetection: {
          timestamp: Date.now(),
          boundaryType: boundaryInfo.boundaryType || 'token',
          boundaryId: boundaryInfo.boundaryId || `boundary-${Date.now()}`
        }
      });
      
      return this.flowState;
    } catch (error) {
      this.logger.error(`Error handling boundary detection: ${error.message}`);
      return this.flowState;
    }
  }
  
  /**
   * Handle context injected event
   * @param {Object} data - Event data
   * @returns {Object} Updated flow state
   */
  handleContextInjected(data) {
    try {
      const injectionInfo = data || {};
      
      // Track context injection
      this.updateFlowState({
        lastContextInjection: {
          timestamp: Date.now(),
          injectionId: injectionInfo.injectionId || `injection-${Date.now()}`
        }
      });
      
      // Add to recent context if content is provided
      if (injectionInfo.context) {
        const recentContext = this.flowState.recentContext || [];
        recentContext.push({
          timestamp: Date.now(),
          type: 'injection',
          id: injectionInfo.injectionId || `injection-${Date.now()}`,
          summary: typeof injectionInfo.context === 'string' 
            ? injectionInfo.context.substring(0, 100) 
            : 'Context object (non-string)'
        });
        
        // Limit array size to prevent unbounded growth
        if (recentContext.length > 10) {
          recentContext = recentContext.slice(-10);
        }
        
        this.updateFlowState({ recentContext });
      }
      
      return this.flowState;
    } catch (error) {
      this.logger.error(`Error handling context injection: ${error.message}`);
      return this.flowState;
    }
  }
  
  /**
   * Clean up resources and shut down
   * @returns {Promise<boolean>} Success status
   */
  async shutdown() {
    try {
      // Preserve cognitive state before shutting down
      await this.preserveCognitiveState();
      
      this.logger.info('Flow Tracking Core Layer shut down successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error during Core Layer shutdown: ${error.message}`);
      return false;
    }
  }
}

module.exports = FlowTrackingCore;
