/**
 * Session Context Manager
 * Manages session state with improved encapsulation and memory management
 */

const { v4: uuid } = require('uuid');
const { LeoError, FileSystem } = require('./leo-cognitive-core');

/**
 * Session Context Manager
 * Encapsulates session state management to avoid global object pollution
 */
class SessionContextManager {
  constructor(config, eventSystem) {
    this.config = config;
    this.events = eventSystem;
    
    // Initialize session context with defaults
    this.context = {
      sessionId: uuid(),
      startTime: Date.now(),
      estimatedTokensUsed: 0,
      previousSessionId: null,
      visionAlignment: 'unknown',
      developmentTrajectory: [],
      interactionCount: 0,
      lastPreservation: null,
      manualContextDocs: [],
      recentQueries: [],
      
      // Continuity state
      tokenBoundaryApproaching: false,
      continuityActive: true,
      
      // Private properties (not serialized)
      _preservationTimer: null,
      _visionTimer: null
    };
    
    // Bind methods to ensure correct 'this' context
    this.update = this.update.bind(this);
    this.get = this.get.bind(this);
    this.getAll = this.getAll.bind(this);
    this.loadPreviousState = this.loadPreviousState.bind(this);
    this.saveState = this.saveState.bind(this);
    this.generateContinuityContext = this.generateContinuityContext.bind(this);
    this.checkTokenBoundary = this.checkTokenBoundary.bind(this);
    this.recordQuery = this.recordQuery.bind(this);
    this.clearTimers = this.clearTimers.bind(this);
  }
  
  /**
   * Update session context properties
   */
  update(updates) {
    // Validate updates
    if (typeof updates !== 'object') {
      throw new LeoError('Updates must be an object', 'INVALID_UPDATES');
    }
    
    // Apply updates
    Object.entries(updates).forEach(([key, value]) => {
      // Skip private properties (starting with _)
      if (!key.startsWith('_')) {
        this.context[key] = value;
      }
    });
    
    // Emit update event
    this.events.emitWithMetadata('session.updated', { 
      sessionId: this.context.sessionId,
      updates: Object.keys(updates)
    });
    
    return this;
  }
  
  /**
   * Get a specific context property
   */
  get(key) {
    return this.context[key];
  }
  
  /**
   * Get all context properties (excluding private ones)
   */
  getAll() {
    // Create a copy without private properties
    return Object.entries(this.context)
      .filter(([key]) => !key.startsWith('_'))
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
  }
  
  /**
   * Load previous state from file
   */
  async loadPreviousState() {
    try {
      const stateFile = this.config.get('cognitiveStateFile');
      
      if (FileSystem.readTextFile(stateFile)) {
        const previousState = JSON.parse(FileSystem.readTextFile(stateFile));
        
        // Update context with previous state
        this.update({
          previousSessionId: previousState.sessionId,
          developmentTrajectory: previousState.developmentTrajectory || [],
          recentQueries: previousState.recentQueries || [],
          visionAlignment: previousState.visionAlignment || 'unknown'
        });
        
        this.events.emitWithMetadata('session.previousStateLoaded', { 
          previousSessionId: previousState.sessionId
        });
        
        return true;
      }
    } catch (error) {
      // Handle file not found gracefully
      if (error.code === 'FILE_NOT_FOUND') {
        this.events.emitWithMetadata('session.noStateFound', {});
        return false;
      }
      
      // Re-throw other errors
      throw new LeoError(`Failed to load previous state: ${error.message}`, 'STATE_LOAD_ERROR');
    }
    
    return false;
  }
  
  /**
   * Save current state to file
   */
  saveState() {
    try {
      const stateFile = this.config.get('cognitiveStateFile');
      
      // Prepare state for serialization (excluding private properties)
      const stateToSave = {
        ...this.getAll(),
        preservationTime: Date.now(),
        continuityContext: this.generateContinuityContext()
      };
      
      // Save to file
      FileSystem.saveJsonFile(stateFile, stateToSave);
      
      // Update last preservation time
      this.update({ lastPreservation: Date.now() });
      
      this.events.emitWithMetadata('session.stateSaved', { 
        sessionId: this.context.sessionId,
        preservationTime: stateToSave.preservationTime
      });
      
      return true;
    } catch (error) {
      this.events.emitWithMetadata('session.saveError', { error: error.message });
      throw new LeoError(`Failed to save state: ${error.message}`, 'STATE_SAVE_ERROR');
    }
  }
  
  /**
   * Generate human-readable continuity context
   */
  generateContinuityContext() {
    const session = this.context;
    
    return `# Session Continuity Context

**Session Transition**: ${session.previousSessionId ? `Continuing from ${session.previousSessionId}` : 'New session'}
**Development Focus**: ${session.developmentTrajectory.length > 0 ? session.developmentTrajectory[session.developmentTrajectory.length - 1] : 'Leo Exocortex Development'}
**Interaction Pattern**: ${session.interactionCount} interactions, ${Math.round((Date.now() - session.startTime) / 60000)} minutes active
**Token Boundary Status**: ${session.tokenBoundaryApproaching ? 'Approaching - state preserved' : 'Normal operation'}
**Vision Alignment**: ${session.visionAlignment}

This context enables seamless continuation across token boundaries while maintaining Leo's exocortex vision.
`;
  }
  
  /**
   * Check if token boundary is approaching
   */
  checkTokenBoundary() {
    const tokenThreshold = this.config.get('tokenThreshold');
    const approaching = this.context.estimatedTokensUsed > tokenThreshold;
    
    if (approaching && !this.context.tokenBoundaryApproaching) {
      this.update({ tokenBoundaryApproaching: true });
      
      this.events.emitWithMetadata('session.tokenBoundaryApproaching', {
        estimatedTokensUsed: this.context.estimatedTokensUsed,
        threshold: tokenThreshold
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Record a query and update token usage
   */
  recordQuery(query) {
    if (typeof query !== 'string') {
      return;
    }
    
    // Update token usage estimate (1.2 tokens per character is a conservative estimate)
    const tokenEstimate = Math.ceil(query.length * 1.2);
    
    // Keep recent queries list at a reasonable size
    const recentQueries = [
      ...this.context.recentQueries || [],
      { query, timestamp: Date.now() }
    ].slice(-10); // Keep only the 10 most recent queries
    
    this.update({
      estimatedTokensUsed: this.context.estimatedTokensUsed + tokenEstimate,
      interactionCount: this.context.interactionCount + 1,
      recentQueries
    });
    
    // Check token boundary after updating
    this.checkTokenBoundary();
  }
  
  /**
   * Set up automatic state preservation
   */
  setupAutomaticPreservation() {
    this.clearTimers();
    
    const interval = this.config.get('preservationInterval');
    
    this.context._preservationTimer = setInterval(() => {
      this.saveState();
    }, interval);
    
    this.events.emitWithMetadata('session.autoPreservationStarted', { 
      interval
    });
    
    return this;
  }
  
  /**
   * Clear all timers to prevent memory leaks
   */
  clearTimers() {
    if (this.context._preservationTimer) {
      clearInterval(this.context._preservationTimer);
      this.context._preservationTimer = null;
    }
    
    if (this.context._visionTimer) {
      clearInterval(this.context._visionTimer);
      this.context._visionTimer = null;
    }
  }
  
  /**
   * Clean up resources
   */
  shutdown() {
    this.clearTimers();
    this.saveState();
    
    this.events.emitWithMetadata('session.shutdown', { 
      sessionId: this.context.sessionId,
      uptime: Date.now() - this.context.startTime
    });
  }
}

module.exports = SessionContextManager;
