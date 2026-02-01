/**
 * Flow Tracking Integration Layer
 * 
 * This layer is responsible for integrating flow tracking with other systems:
 * - Integration with Unified Live Updater
 * - Event bus subscription and management
 * - Conversation awareness and tracking
 * - File event tracking
 * - Code change tracking
 * 
 * This is primarily based on functionality from the original flow-tracking.js
 */

const path = require('path');
const eventBus = require('../../utils/event-bus');

/**
 * Flow Tracking Integration Layer
 */
class FlowTrackingIntegration {
  /**
   * Create a new Flow Tracking Integration instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   * @param {string} componentName - Component name for event bus
   * @param {Object} coreLayer - Reference to the core layer
   * @param {Object} serviceLayer - Reference to the service layer
   */
  constructor(config, logger, componentName, coreLayer, serviceLayer) {
    this.config = config;
    this.logger = logger;
    this.componentName = componentName;
    this.coreLayer = coreLayer;
    this.serviceLayer = serviceLayer;
    this.isInitialized = false;
    
    // Event tracking
    this.registeredEvents = new Set();
    this.activeConversations = new Map();
    this.activeFiles = new Map();
    this.recentCodeChanges = [];
  }
  
  /**
   * Initialize the Integration Layer
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      this.logger.info('Initializing Flow Tracking Integration Layer');
      
      // Register event listeners
      await this.registerEventListeners();
      
      this.isInitialized = true;
      this.logger.info('Flow Tracking Integration Layer initialized successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error initializing Flow Tracking Integration Layer: ${error.message}`);
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
   * Register event listeners
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async registerEventListeners() {
    try {
      // Token boundary events
      this.registerEventListener('boundary:detected', this.handleBoundaryDetected.bind(this));
      this.registerEventListener('context:injected', this.handleContextInjected.bind(this));
      
      // File events
      this.registerEventListener('file:opened', this.handleFileOpened.bind(this));
      this.registerEventListener('file:saved', this.handleFileSaved.bind(this));
      this.registerEventListener('file:changed', this.handleFileChanged.bind(this));
      this.registerEventListener('file:created', this.handleFileCreated.bind(this));
      this.registerEventListener('file:deleted', this.handleFileDeleted.bind(this));
      
      // Navigation events
      this.registerEventListener('navigation:request', this.handleNavigationRequest.bind(this));
      this.registerEventListener('navigation:complete', this.handleNavigationComplete.bind(this));
      
      // Search events
      this.registerEventListener('search:executed', this.handleSearchExecuted.bind(this));
      this.registerEventListener('search:results', this.handleSearchResults.bind(this));
      
      // Cursor events
      this.registerEventListener('cursor:moved', this.handleCursorMoved.bind(this));
      this.registerEventListener('cursor:selection', this.handleCursorSelection.bind(this));
      
      // Conversation events
      this.registerEventListener('conversation:message', this.handleConversationMessage.bind(this));
      this.registerEventListener('conversation:summary', this.handleConversationSummary.bind(this));
      this.registerEventListener('conversation:session', this.handleConversationSession.bind(this));
      
      // Code events
      this.registerEventListener('code:change', this.handleCodeChange.bind(this));
      this.registerEventListener('code:commit', this.handleCodeCommit.bind(this));
      
      // System events
      this.registerEventListener('system:ready', this.handleSystemReady.bind(this));
      this.registerEventListener('system:shutdown', this.handleSystemShutdown.bind(this));
      
      this.logger.info(`Registered ${this.registeredEvents.size} event listeners for Flow Tracking`);
      return true;
    } catch (error) {
      this.logger.error(`Error registering event listeners: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Register a single event listener
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   * @private
   */
  registerEventListener(eventName, handler) {
    try {
      eventBus.on(eventName, handler, this.componentName);
      this.registeredEvents.add(eventName);
      this.logger.debug(`Registered event listener: ${eventName}`);
    } catch (error) {
      this.logger.error(`Error registering event listener for ${eventName}: ${error.message}`);
    }
  }
  
  /**
   * Unregister event listeners
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async unregisterEventListeners() {
    try {
      for (const eventName of this.registeredEvents) {
        eventBus.off(eventName, this.componentName);
        this.logger.debug(`Unregistered event listener: ${eventName}`);
      }
      
      this.registeredEvents.clear();
      this.logger.info('Unregistered all event listeners for Flow Tracking');
      return true;
    } catch (error) {
      this.logger.error(`Error unregistering event listeners: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle boundary detected event
   * @param {Object} data - Event data
   * @private
   */
  handleBoundaryDetected(data) {
    try {
      this.logger.debug('Token boundary detected', { data });
      
      // Update core layer
      if (this.coreLayer && typeof this.coreLayer.handleBoundaryDetected === 'function') {
        this.coreLayer.handleBoundaryDetected(data);
      }
      
      // Prepare for consciousness transition if approaching boundary
      if (data && data.isApproaching) {
        this.prepareBoundaryTransition();
      }
    } catch (error) {
      this.logger.error(`Error handling boundary detected: ${error.message}`);
    }
  }
  
  /**
   * Handle context injected event
   * @param {Object} data - Event data
   * @private
   */
  handleContextInjected(data) {
    try {
      this.logger.debug('Context injected', { data });
      
      // Update core layer
      if (this.coreLayer && typeof this.coreLayer.handleContextInjected === 'function') {
        this.coreLayer.handleContextInjected(data);
      }
    } catch (error) {
      this.logger.error(`Error handling context injected: ${error.message}`);
    }
  }
  
  /**
   * Handle file opened event
   * @param {Object} data - Event data
   * @private
   */
  handleFileOpened(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      this.logger.debug(`File opened: ${data.filePath}`);
      
      // Track active file
      this.activeFiles.set(data.filePath, {
        openTime: Date.now(),
        lastActivity: Date.now(),
        eventCount: 1
      });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleFileEvent === 'function') {
        this.serviceLayer.handleFileEvent({
          ...data,
          eventType: 'opened'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling file opened: ${error.message}`);
    }
  }
  
  /**
   * Handle file saved event
   * @param {Object} data - Event data
   * @private
   */
  handleFileSaved(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      this.logger.debug(`File saved: ${data.filePath}`);
      
      // Update active file
      if (this.activeFiles.has(data.filePath)) {
        const fileInfo = this.activeFiles.get(data.filePath);
        fileInfo.lastActivity = Date.now();
        fileInfo.lastSaved = Date.now();
        fileInfo.eventCount++;
        this.activeFiles.set(data.filePath, fileInfo);
      } else {
        this.activeFiles.set(data.filePath, {
          openTime: Date.now(),
          lastActivity: Date.now(),
          lastSaved: Date.now(),
          eventCount: 1
        });
      }
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleFileEvent === 'function') {
        this.serviceLayer.handleFileEvent({
          ...data,
          eventType: 'saved'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling file saved: ${error.message}`);
    }
  }
  
  /**
   * Handle file changed event
   * @param {Object} data - Event data
   * @private
   */
  handleFileChanged(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      this.logger.debug(`File changed: ${data.filePath}`);
      
      // Update active file
      if (this.activeFiles.has(data.filePath)) {
        const fileInfo = this.activeFiles.get(data.filePath);
        fileInfo.lastActivity = Date.now();
        fileInfo.lastChanged = Date.now();
        fileInfo.eventCount++;
        this.activeFiles.set(data.filePath, fileInfo);
      } else {
        this.activeFiles.set(data.filePath, {
          openTime: Date.now(),
          lastActivity: Date.now(),
          lastChanged: Date.now(),
          eventCount: 1
        });
      }
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleFileEvent === 'function') {
        this.serviceLayer.handleFileEvent({
          ...data,
          eventType: 'changed'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling file changed: ${error.message}`);
    }
  }
  
  /**
   * Handle file created event
   * @param {Object} data - Event data
   * @private
   */
  handleFileCreated(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      this.logger.debug(`File created: ${data.filePath}`);
      
      // Track active file
      this.activeFiles.set(data.filePath, {
        createTime: Date.now(),
        openTime: Date.now(),
        lastActivity: Date.now(),
        eventCount: 1
      });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleFileEvent === 'function') {
        this.serviceLayer.handleFileEvent({
          ...data,
          eventType: 'created'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling file created: ${error.message}`);
    }
  }
  
  /**
   * Handle file deleted event
   * @param {Object} data - Event data
   * @private
   */
  handleFileDeleted(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      this.logger.debug(`File deleted: ${data.filePath}`);
      
      // Remove from active files
      this.activeFiles.delete(data.filePath);
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleFileEvent === 'function') {
        this.serviceLayer.handleFileEvent({
          ...data,
          eventType: 'deleted'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling file deleted: ${error.message}`);
    }
  }
  
  /**
   * Handle navigation request event
   * @param {Object} data - Event data
   * @private
   */
  handleNavigationRequest(data) {
    try {
      this.logger.debug('Navigation request', { data });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleNavigationEvent === 'function') {
        this.serviceLayer.handleNavigationEvent({
          ...data,
          eventType: 'request'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling navigation request: ${error.message}`);
    }
  }
  
  /**
   * Handle navigation complete event
   * @param {Object} data - Event data
   * @private
   */
  handleNavigationComplete(data) {
    try {
      this.logger.debug('Navigation complete', { data });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleNavigationEvent === 'function') {
        this.serviceLayer.handleNavigationEvent({
          ...data,
          eventType: 'complete'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling navigation complete: ${error.message}`);
    }
  }
  
  /**
   * Handle search executed event
   * @param {Object} data - Event data
   * @private
   */
  handleSearchExecuted(data) {
    try {
      this.logger.debug('Search executed', { data });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleSearchEvent === 'function') {
        this.serviceLayer.handleSearchEvent({
          ...data,
          eventType: 'executed'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling search executed: ${error.message}`);
    }
  }
  
  /**
   * Handle search results event
   * @param {Object} data - Event data
   * @private
   */
  handleSearchResults(data) {
    try {
      this.logger.debug('Search results', { data });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleSearchEvent === 'function') {
        this.serviceLayer.handleSearchEvent({
          ...data,
          eventType: 'results'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling search results: ${error.message}`);
    }
  }
  
  /**
   * Handle cursor moved event
   * @param {Object} data - Event data
   * @private
   */
  handleCursorMoved(data) {
    try {
      // Don't log every cursor movement to avoid flooding the logs
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleCursorEvent === 'function') {
        this.serviceLayer.handleCursorEvent({
          ...data,
          eventType: 'moved'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling cursor moved: ${error.message}`);
    }
  }
  
  /**
   * Handle cursor selection event
   * @param {Object} data - Event data
   * @private
   */
  handleCursorSelection(data) {
    try {
      this.logger.debug('Cursor selection', { data });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleCursorEvent === 'function') {
        this.serviceLayer.handleCursorEvent({
          ...data,
          eventType: 'selection'
        });
      }
    } catch (error) {
      this.logger.error(`Error handling cursor selection: ${error.message}`);
    }
  }
  
  /**
   * Handle conversation message event
   * @param {Object} data - Event data
   * @private
   */
  handleConversationMessage(data) {
    try {
      if (!data || !data.sessionId) {
        return;
      }
      
      this.logger.debug('Conversation message', { 
        sessionId: data.sessionId,
        messageId: data.messageId
      });
      
      // Track active conversation
      if (this.activeConversations.has(data.sessionId)) {
        const convInfo = this.activeConversations.get(data.sessionId);
        convInfo.lastActivity = Date.now();
        convInfo.messageCount = (convInfo.messageCount || 0) + 1;
        this.activeConversations.set(data.sessionId, convInfo);
      } else {
        this.activeConversations.set(data.sessionId, {
          startTime: Date.now(),
          lastActivity: Date.now(),
          messageCount: 1
        });
      }
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleConversationMessage === 'function') {
        this.serviceLayer.handleConversationMessage(data);
      }
    } catch (error) {
      this.logger.error(`Error handling conversation message: ${error.message}`);
    }
  }
  
  /**
   * Handle conversation summary event
   * @param {Object} data - Event data
   * @private
   */
  handleConversationSummary(data) {
    try {
      if (!data || !data.sessionId || !data.summary) {
        return;
      }
      
      this.logger.debug('Conversation summary', { sessionId: data.sessionId });
      
      // Update active conversation
      if (this.activeConversations.has(data.sessionId)) {
        const convInfo = this.activeConversations.get(data.sessionId);
        convInfo.lastActivity = Date.now();
        convInfo.hasSummary = true;
        convInfo.summary = data.summary;
        this.activeConversations.set(data.sessionId, convInfo);
      }
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleConversationSummary === 'function') {
        this.serviceLayer.handleConversationSummary(data);
      }
    } catch (error) {
      this.logger.error(`Error handling conversation summary: ${error.message}`);
    }
  }
  
  /**
   * Handle conversation session event
   * @param {Object} data - Event data
   * @private
   */
  handleConversationSession(data) {
    try {
      if (!data || !data.sessionId) {
        return;
      }
      
      this.logger.debug('Conversation session', { sessionId: data.sessionId });
      
      // Pass to service layer
      if (this.serviceLayer && typeof this.serviceLayer.handleConversationSession === 'function') {
        this.serviceLayer.handleConversationSession(data);
      }
    } catch (error) {
      this.logger.error(`Error handling conversation session: ${error.message}`);
    }
  }
  
  /**
   * Handle code change event
   * @param {Object} data - Event data
   * @private
   */
  handleCodeChange(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      this.logger.debug('Code change', { filePath: data.filePath });
      
      // Track code change
      this.recentCodeChanges.push({
        timestamp: Date.now(),
        filePath: data.filePath,
        changeType: data.changeType || 'edit',
        lines: data.lines
      });
      
      // Limit array size
      if (this.recentCodeChanges.length > 50) {
        this.recentCodeChanges = this.recentCodeChanges.slice(-50);
      }
    } catch (error) {
      this.logger.error(`Error handling code change: ${error.message}`);
    }
  }
  
  /**
   * Handle code commit event
   * @param {Object} data - Event data
   * @private
   */
  handleCodeCommit(data) {
    try {
      this.logger.debug('Code commit', { data });
      
      // Clear recent code changes on commit
      this.recentCodeChanges = [];
    } catch (error) {
      this.logger.error(`Error handling code commit: ${error.message}`);
    }
  }
  
  /**
   * Handle system ready event
   * @param {Object} data - Event data
   * @private
   */
  handleSystemReady(data) {
    try {
      this.logger.info('System ready event received');
      
      // Re-initialize if needed
      if (!this.isInitialized) {
        this.initialize().catch(error => {
          this.logger.error(`Error reinitializing on system ready: ${error.message}`);
        });
      }
    } catch (error) {
      this.logger.error(`Error handling system ready: ${error.message}`);
    }
  }
  
  /**
   * Handle system shutdown event
   * @param {Object} data - Event data
   * @private
   */
  handleSystemShutdown(data) {
    try {
      this.logger.info('System shutdown event received');
      
      // Shut down gracefully
      this.shutdown().catch(error => {
        this.logger.error(`Error shutting down on system shutdown event: ${error.message}`);
      });
    } catch (error) {
      this.logger.error(`Error handling system shutdown: ${error.message}`);
    }
  }
  
  /**
   * Prepare for boundary transition
   * @returns {Promise<Object>} Transition plan
   * @private
   */
  async prepareBoundaryTransition() {
    try {
      this.logger.info('Preparing for token boundary transition');
      
      // Get transition plan from core layer
      let transitionPlan = {};
      if (this.coreLayer && typeof this.coreLayer.prepareConsciousnessTransition === 'function') {
        transitionPlan = await this.coreLayer.prepareConsciousnessTransition();
      }
      
      // Notify of boundary preparation
      eventBus.emit('boundary:preparing', {
        timestamp: Date.now(),
        transitionPlan
      }, this.componentName);
      
      return transitionPlan;
    } catch (error) {
      this.logger.error(`Error preparing boundary transition: ${error.message}`);
      return { error: error.message };
    }
  }
  
  /**
   * Generate flow context for the current state
   * @param {Object} options - Context generation options
   * @returns {Promise<Object>} Flow context
   */
  async generateFlowContext(options = {}) {
    try {
      const flowContext = {
        timestamp: Date.now(),
        currentFlow: null,
        activeFiles: Array.from(this.activeFiles.keys()).slice(0, 5),
        activeConversations: Array.from(this.activeConversations.keys()).slice(0, 3),
        recentCodeChanges: this.recentCodeChanges.slice(0, 10),
        cognitiveLoad: 'medium'
      };
      
      // Get current flow state from service layer
      if (this.serviceLayer && typeof this.serviceLayer.getCurrentFlowState === 'function') {
        const flowState = this.serviceLayer.getCurrentFlowState();
        if (flowState) {
          flowContext.currentFlow = {
            type: flowState.type,
            phase: flowState.phase,
            cognitiveLoad: flowState.cognitiveLoad,
            context: flowState.context,
            contextSwitches: flowState.contextSwitches
          };
          
          flowContext.cognitiveLoad = flowState.cognitiveLoad;
        }
      }
      
      // Get additional context from core layer
      if (this.coreLayer) {
        // Get continuity metrics
        if (typeof this.coreLayer.validateCognitiveContinuity === 'function') {
          flowContext.continuity = this.coreLayer.validateCognitiveContinuity();
        }
        
        // Get boundary approach status
        if (typeof this.coreLayer.detectBoundaryApproach === 'function') {
          flowContext.boundaryApproach = this.coreLayer.detectBoundaryApproach();
        }
      }
      
      return flowContext;
    } catch (error) {
      this.logger.error(`Error generating flow context: ${error.message}`);
      return {
        timestamp: Date.now(),
        error: error.message,
        cognitiveLoad: 'medium'
      };
    }
  }
  
  /**
   * Generate flow summary for the current session
   * @param {Object} options - Summary generation options
   * @returns {Promise<Object>} Flow summary
   */
  async generateFlowSummary(options = {}) {
    try {
      const summary = {
        timestamp: Date.now(),
        sessionDuration: 0,
        fileCount: 0,
        conversationCount: 0,
        codeChangeCount: 0,
        primaryFlowType: 'unknown',
        cognitiveLoadTrend: 'stable'
      };
      
      // Get session information from service layer
      if (this.serviceLayer && typeof this.serviceLayer.getCurrentFlowSession === 'function') {
        const session = this.serviceLayer.getCurrentFlowSession();
        if (session) {
          summary.sessionId = session.id;
          summary.sessionStart = session.startTime;
          summary.sessionDuration = Date.now() - session.startTime;
          summary.fileCount = session.files instanceof Set ? session.files.size : 0;
          summary.conversationCount = session.conversations instanceof Set ? session.conversations.size : 0;
          summary.contextSwitches = session.contextSwitches || 0;
          
          // Calculate primary flow type
          if (session.flowStates && session.flowStates.length > 0) {
            const typeCounts = {};
            session.flowStates.forEach(state => {
              if (state.type) {
                typeCounts[state.type] = (typeCounts[state.type] || 0) + 1;
              }
            });
            
            let maxCount = 0;
            let primaryType = 'unknown';
            for (const [type, count] of Object.entries(typeCounts)) {
              if (count > maxCount) {
                maxCount = count;
                primaryType = type;
              }
            }
            
            summary.primaryFlowType = primaryType;
          }
        }
      }
      
      // Count code changes
      summary.codeChangeCount = this.recentCodeChanges.length;
      
      return summary;
    } catch (error) {
      this.logger.error(`Error generating flow summary: ${error.message}`);
      return {
        timestamp: Date.now(),
        error: error.message
      };
    }
  }
  
  /**
   * Clean up resources and shut down
   * @returns {Promise<boolean>} Success status
   */
  async shutdown() {
    try {
      // Unregister event listeners
      await this.unregisterEventListeners();
      
      this.logger.info('Flow Tracking Integration Layer shut down successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error during Integration Layer shutdown: ${error.message}`);
      return false;
    }
  }
}

module.exports = FlowTrackingIntegration;
