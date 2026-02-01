/**
 * Flow Tracking Service Layer
 * 
 * This layer is responsible for flow state tracking and session management.
 * It provides functionality for:
 * - Flow state detection and tracking
 * - Flow session management
 * - Event handling for file, navigation, and cursor events
 * - Basic conversation event handling
 * 
 * This is primarily based on functionality from the original flow-tracking-service.js
 */

const fs = require('fs').promises;
const path = require('path');
const eventBus = require('../../utils/event-bus');
const CognitiveLoadHelper = require('./cognitive-load-helper');

/**
 * Flow Tracking Service Layer
 */
class FlowTrackingService {
  /**
   * Create a new Flow Tracking Service instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   * @param {string} componentName - Component name for event bus
   * @param {Object} coreLayer - Reference to the core layer
   */
  constructor(config, logger, componentName, coreLayer) {
    this.config = config;
    this.logger = logger;
    this.componentName = componentName;
    this.coreLayer = coreLayer;
    this.isInitialized = false;
    
    // State management
    this.currentFlowState = null;
    this.currentFlowSession = null;
    this.lastActivityTimestamp = 0;
    this.recentContextSwitches = [];
    this.recentFileAccesses = [];
    
    // Initialize cognitive load helper
    this.cognitiveLoadHelper = new CognitiveLoadHelper(config, logger);
  }
  
  /**
   * Initialize the Service Layer
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      this.logger.info('Initializing Flow Tracking Service Layer');
      
      // Ensure required directories exist
      await fs.mkdir(this.config.FLOW_DATA_DIR, { recursive: true });
      
      // Start a new flow session
      await this.startNewFlowSession();
      
      this.isInitialized = true;
      this.logger.info('Flow Tracking Service Layer initialized successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error initializing Flow Tracking Service Layer: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update configuration
   * @param {Object} newConfig - New configuration object
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    if (this.cognitiveLoadHelper) {
      this.cognitiveLoadHelper.updateConfig(newConfig);
    }
  }
  
  /**
   * Start a new flow session
   * @returns {Promise<Object>} New flow session
   * @private
   */
  async startNewFlowSession() {
    try {
      // Create new flow session
      this.currentFlowSession = {
        id: `flow_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        flowStates: [],
        contextSwitches: 0,
        conversations: new Set(),
        files: new Set(),
        searchQueries: [],
        metaData: {
          operatingSystem: process.platform,
          nodeVersion: process.version,
          startupTime: Date.now()
        }
      };
      
      // Create initial flow state
      await this.updateFlowState({
        type: 'initialization',
        phase: 'startup',
        cognitiveLoad: 'low',
        context: 'System initialization'
      });
      
      // Save flow session
      await this.saveFlowSession(this.currentFlowSession);
      
      this.logger.info(`Started new flow session: ${this.currentFlowSession.id}`);
      return this.currentFlowSession;
    } catch (error) {
      this.logger.error(`Error starting new flow session: ${error.message}`);
      
      // Create a fallback session
      this.currentFlowSession = {
        id: `fallback_session_${Date.now()}`,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        flowStates: [],
        contextSwitches: 0,
        conversations: new Set(),
        files: new Set(),
        error: error.message
      };
      
      return this.currentFlowSession;
    }
  }
  
  /**
   * Update the current flow state
   * @param {Object} updates - Flow state updates
   * @returns {Promise<Object>} Updated flow state
   */
  async updateFlowState(updates = {}) {
    try {
      // Get current timestamp
      const timestamp = Date.now();
      
      // Calculate time since last activity
      const timeSinceLastActivity = this.lastActivityTimestamp > 0 
        ? timestamp - this.lastActivityTimestamp 
        : 0;
      
      // Check if we need to detect a context switch based on idle time
      let contextSwitch = false;
      if (timeSinceLastActivity > this.config.MAX_SESSION_IDLE_TIME_MS) {
        contextSwitch = true;
        this.recentContextSwitches.push({
          timestamp,
          reason: 'idle_timeout',
          idleTime: timeSinceLastActivity
        });
        
        // Limit array size
        if (this.recentContextSwitches.length > 20) {
          this.recentContextSwitches = this.recentContextSwitches.slice(-20);
        }
        
        if (this.currentFlowSession) {
          this.currentFlowSession.contextSwitches++;
        }
      }
      
      // If context switch detected or no current flow state, create a new one
      if (!this.currentFlowState || contextSwitch) {
        this.currentFlowState = {
          id: `flow_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
          sessionId: this.currentFlowSession ? this.currentFlowSession.id : null,
          startTime: timestamp,
          lastUpdateTime: timestamp,
          type: updates.type || this.detectFlowType(),
          phase: updates.phase || 'initial',
          cognitiveLoad: updates.cognitiveLoad || 'medium',
          context: updates.context || '',
          events: [],
          files: new Set(),
          contextSwitches: contextSwitch ? 1 : 0
        };
      } else {
        // Update existing flow state
        this.currentFlowState.lastUpdateTime = timestamp;
        
        if (updates.type) {
          this.currentFlowState.type = updates.type;
        }
        
        if (updates.phase) {
          this.currentFlowState.phase = updates.phase;
        }
        
        if (updates.cognitiveLoad) {
          this.currentFlowState.cognitiveLoad = updates.cognitiveLoad;
        }
        
        if (updates.context) {
          this.currentFlowState.context = updates.context;
        }
        
        if (contextSwitch) {
          this.currentFlowState.contextSwitches++;
        }
      }
      
      // Update activity timestamp
      this.lastActivityTimestamp = timestamp;
      
      // If session exists, update it
      if (this.currentFlowSession) {
        this.currentFlowSession.lastActivityTime = timestamp;
        
        // Add flow state to session if it's new
        const existingStateIndex = this.currentFlowSession.flowStates.findIndex(
          state => state.id === this.currentFlowState.id
        );
        
        if (existingStateIndex === -1) {
          this.currentFlowSession.flowStates.push(this.currentFlowState);
        } else {
          this.currentFlowSession.flowStates[existingStateIndex] = this.currentFlowState;
        }
      }
      
      // Estimate cognitive load if enabled
      if (this.config.ENABLE_COGNITIVE_LOAD_ESTIMATION && this.cognitiveLoadHelper) {
        const estimatedLoad = await this.cognitiveLoadHelper.estimateCognitiveLoad({
          recentFileAccesses: this.recentFileAccesses,
          recentContextSwitches: this.recentContextSwitches,
          currentFlowState: this.currentFlowState,
          currentFlowSession: this.currentFlowSession
        });
        
        this.currentFlowState.cognitiveLoad = estimatedLoad.loadLevel;
        this.currentFlowState.cognitiveLoadDetails = estimatedLoad.details;
      }
      
      // Save flow state to disk
      await this.saveFlowState(this.currentFlowState);
      
      // Update core layer if available
      if (this.coreLayer && typeof this.coreLayer.updateFlowState === 'function') {
        this.coreLayer.updateFlowState({
          currentFlow: this.currentFlowState.type,
          flowPhase: this.currentFlowState.phase,
          cognitiveLoad: this.currentFlowState.cognitiveLoad,
          lastActivity: timestamp
        });
      }
      
      return this.currentFlowState;
    } catch (error) {
      this.logger.error(`Error updating flow state: ${error.message}`);
      return this.currentFlowState || {};
    }
  }
  
  /**
   * Detect the current flow type based on recent activities
   * @returns {string} Flow type
   * @private
   */
  detectFlowType() {
    // Default to coding if we can't determine
    const defaultType = 'coding';
    
    if (!this.config.ENABLE_FLOW_DETECTION) {
      return defaultType;
    }
    
    try {
      // Get recent file accesses
      const recentFiles = this.recentFileAccesses || [];
      
      // Check if we have enough data to make a determination
      if (recentFiles.length < 3) {
        return defaultType;
      }
      
      // Count file extensions to determine activity
      const extensionCounts = {};
      recentFiles.forEach(access => {
        const ext = path.extname(access.filePath).toLowerCase();
        extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
      });
      
      // Analyze patterns
      const testExtensions = ['.test.js', '.spec.js', '.test.ts', '.spec.ts'];
      const docExtensions = ['.md', '.txt', '.doc', '.pdf'];
      
      // Check for test files
      const isTestingFocus = recentFiles.some(access => 
        testExtensions.some(ext => access.filePath.endsWith(ext))
      );
      
      if (isTestingFocus) {
        return 'testing';
      }
      
      // Check for documentation focus
      const docCount = Object.keys(extensionCounts)
        .filter(ext => docExtensions.includes(ext))
        .reduce((sum, ext) => sum + extensionCounts[ext], 0);
      
      if (docCount > recentFiles.length / 2) {
        return 'learning';
      }
      
      // Check for debugging patterns
      const hasDebuggingPattern = recentFiles.some(access => 
        access.eventType === 'search' && 
        (access.query?.toLowerCase().includes('error') || 
         access.query?.toLowerCase().includes('bug') ||
         access.query?.toLowerCase().includes('fix'))
      );
      
      if (hasDebuggingPattern) {
        return 'debugging';
      }
      
      // Check for refactoring patterns
      const hasRefactoringPattern = recentFiles.length > 5 && 
        new Set(recentFiles.map(access => access.filePath)).size < recentFiles.length / 2;
      
      if (hasRefactoringPattern) {
        return 'refactoring';
      }
      
      // Default to coding
      return defaultType;
    } catch (error) {
      this.logger.error(`Error detecting flow type: ${error.message}`);
      return defaultType;
    }
  }
  
  /**
   * Save flow state to disk
   * @param {Object} flowState - Flow state to save
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async saveFlowState(flowState) {
    try {
      if (!flowState || !flowState.id) {
        return false;
      }
      
      // Clone the state to avoid modifying the original
      const stateToSave = { ...flowState };
      
      // Convert Sets to Arrays for serialization
      if (stateToSave.files instanceof Set) {
        stateToSave.files = Array.from(stateToSave.files);
      }
      
      // Create a sanitized version for storage
      const storageState = {
        id: stateToSave.id,
        sessionId: stateToSave.sessionId,
        startTime: stateToSave.startTime,
        lastUpdateTime: stateToSave.lastUpdateTime,
        type: stateToSave.type,
        phase: stateToSave.phase,
        cognitiveLoad: stateToSave.cognitiveLoad,
        context: stateToSave.context,
        files: stateToSave.files,
        contextSwitches: stateToSave.contextSwitches,
        timestamp: Date.now()
      };
      
      // Write to flow states file
      const flowStatesPath = path.join(this.config.FLOW_DATA_DIR, this.config.FLOW_STATES_FILE);
      const data = JSON.stringify(storageState) + '\n';
      
      await fs.appendFile(flowStatesPath, data, 'utf8');
      return true;
    } catch (error) {
      this.logger.error(`Error saving flow state: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Save flow session to disk
   * @param {Object} flowSession - Flow session to save
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async saveFlowSession(flowSession) {
    try {
      if (!flowSession || !flowSession.id) {
        return false;
      }
      
      // Clone the session to avoid modifying the original
      const sessionToSave = { ...flowSession };
      
      // Convert Sets to Arrays for serialization
      if (sessionToSave.conversations instanceof Set) {
        sessionToSave.conversations = Array.from(sessionToSave.conversations);
      }
      
      if (sessionToSave.files instanceof Set) {
        sessionToSave.files = Array.from(sessionToSave.files);
      }
      
      // Don't save full flow states in the session record
      sessionToSave.flowStates = sessionToSave.flowStates.map(state => state.id);
      
      // Create a sanitized version for storage
      const storageSession = {
        id: sessionToSave.id,
        startTime: sessionToSave.startTime,
        lastActivityTime: sessionToSave.lastActivityTime,
        flowStates: sessionToSave.flowStates,
        contextSwitches: sessionToSave.contextSwitches,
        conversations: sessionToSave.conversations,
        files: sessionToSave.files,
        searchQueries: sessionToSave.searchQueries,
        metaData: sessionToSave.metaData,
        timestamp: Date.now()
      };
      
      // Write to flow sessions file
      const flowSessionsPath = path.join(this.config.FLOW_DATA_DIR, this.config.FLOW_SESSIONS_FILE);
      const data = JSON.stringify(storageSession) + '\n';
      
      await fs.appendFile(flowSessionsPath, data, 'utf8');
      return true;
    } catch (error) {
      this.logger.error(`Error saving flow session: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle file event
   * @param {Object} data - Event data
   * @private
   */
  handleFileEvent(data) {
    try {
      if (!data || !data.filePath) {
        return;
      }
      
      // Record file access
      const fileAccess = {
        timestamp: Date.now(),
        filePath: data.filePath,
        eventType: data.eventType || 'unknown'
      };
      
      this.recentFileAccesses.push(fileAccess);
      
      // Limit array size
      if (this.recentFileAccesses.length > 50) {
        this.recentFileAccesses = this.recentFileAccesses.slice(-50);
      }
      
      // Add to current flow state
      if (this.currentFlowState && this.currentFlowState.files instanceof Set) {
        this.currentFlowState.files.add(data.filePath);
      }
      
      // Add to current session
      if (this.currentFlowSession && this.currentFlowSession.files instanceof Set) {
        this.currentFlowSession.files.add(data.filePath);
      }
      
      // Update flow state based on the event type
      let updates = {};
      
      switch (data.eventType) {
        case 'opened':
          updates = { phase: 'reading' };
          break;
        case 'saved':
          updates = { phase: 'implementing' };
          break;
        case 'changed':
          updates = { phase: 'editing' };
          break;
        case 'created':
          updates = { phase: 'creating', type: 'coding' };
          break;
        case 'deleted':
          updates = { phase: 'refactoring', type: 'refactoring' };
          break;
      }
      
      // Add context information
      updates.context = `${data.eventType || 'Interacting with'} file: ${path.basename(data.filePath)}`;
      
      // Update flow state
      this.updateFlowState(updates);
      
      this.logger.debug(`Handled file event for ${data.filePath}`, { eventType: data.eventType });
    } catch (error) {
      this.logger.error(`Error handling file event: ${error.message}`);
    }
  }
  
  /**
   * Handle navigation event
   * @param {Object} data - Event data
   * @private
   */
  handleNavigationEvent(data) {
    try {
      if (!data) {
        return;
      }
      
      // Update flow state based on navigation
      const updates = {
        phase: 'exploring',
        context: data.target 
          ? `Navigating to ${data.target}` 
          : 'Navigating within codebase'
      };
      
      // Record as file access if there's a file target
      if (data.filePath) {
        this.recentFileAccesses.push({
          timestamp: Date.now(),
          filePath: data.filePath,
          eventType: 'navigation'
        });
        
        // Limit array size
        if (this.recentFileAccesses.length > 50) {
          this.recentFileAccesses = this.recentFileAccesses.slice(-50);
        }
        
        // Add to current flow state
        if (this.currentFlowState && this.currentFlowState.files instanceof Set) {
          this.currentFlowState.files.add(data.filePath);
        }
        
        // Add to current session
        if (this.currentFlowSession && this.currentFlowSession.files instanceof Set) {
          this.currentFlowSession.files.add(data.filePath);
        }
      }
      
      // Update flow state
      this.updateFlowState(updates);
      
      this.logger.debug('Handled navigation event', { event: data.eventType });
    } catch (error) {
      this.logger.error(`Error handling navigation event: ${error.message}`);
    }
  }
  
  /**
   * Handle search event
   * @param {Object} data - Event data
   * @private
   */
  handleSearchEvent(data) {
    try {
      if (!data || !data.query) {
        return;
      }
      
      // Add search query to session
      if (this.currentFlowSession && Array.isArray(this.currentFlowSession.searchQueries)) {
        this.currentFlowSession.searchQueries.push({
          timestamp: Date.now(),
          query: data.query,
          results: data.resultCount || 0
        });
      }
      
      // Update flow state based on search
      const updates = {
        phase: 'researching',
        context: `Searching for: ${data.query}`
      };
      
      // Update flow state
      this.updateFlowState(updates);
      
      this.logger.debug('Handled search event', { query: data.query });
    } catch (error) {
      this.logger.error(`Error handling search event: ${error.message}`);
    }
  }
  
  /**
   * Handle cursor event
   * @param {Object} data - Event data
   * @private
   */
  handleCursorEvent(data) {
    try {
      if (!data) {
        return;
      }
      
      // Update last activity timestamp
      this.lastActivityTimestamp = Date.now();
      
      // No need to update flow state for every cursor movement
      // Just record that there was activity
      
      this.logger.debug('Handled cursor event');
    } catch (error) {
      this.logger.error(`Error handling cursor event: ${error.message}`);
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
      
      // Add conversation to current session
      if (this.currentFlowSession && this.currentFlowSession.conversations instanceof Set) {
        this.currentFlowSession.conversations.add(data.sessionId);
      }
      
      // Update flow state based on the message
      const updates = {
        phase: 'discussing',
        type: 'planning',
        context: `Conversation: ${data.content ? data.content.substring(0, 50) + '...' : 'New message'}`
      };
      
      // Update flow state
      this.updateFlowState(updates);
      
      this.logger.debug('Handled conversation message event', { 
        sessionId: data.sessionId,
        messageId: data.messageId
      });
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
      
      // Add conversation to current session
      if (this.currentFlowSession && this.currentFlowSession.conversations instanceof Set) {
        this.currentFlowSession.conversations.add(data.sessionId);
      }
      
      // Update flow state based on the summary
      const updates = {
        phase: 'reflecting',
        type: 'reviewing',
        context: `Conversation summary: ${data.summary.substring(0, 100)}...`
      };
      
      // Update flow state
      this.updateFlowState(updates);
      
      this.logger.debug('Handled conversation summary event', { sessionId: data.sessionId });
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
      
      // Add conversation to current session
      if (this.currentFlowSession && this.currentFlowSession.conversations instanceof Set) {
        this.currentFlowSession.conversations.add(data.sessionId);
      }
      
      this.logger.debug('Handled conversation session event', { sessionId: data.sessionId });
    } catch (error) {
      this.logger.error(`Error handling conversation session: ${error.message}`);
    }
  }
  
  /**
   * Get the current flow state
   * @returns {Object} Current flow state
   */
  getCurrentFlowState() {
    return this.currentFlowState;
  }
  
  /**
   * Get the current flow session
   * @returns {Object} Current flow session
   */
  getCurrentFlowSession() {
    return this.currentFlowSession;
  }
  
  /**
   * End the current flow session
   * @returns {Promise<boolean>} Success status
   */
  async endCurrentFlowSession() {
    try {
      if (!this.currentFlowSession) {
        return false;
      }
      
      // Update end time
      this.currentFlowSession.endTime = Date.now();
      
      // Save final state
      await this.saveFlowSession(this.currentFlowSession);
      
      this.logger.info(`Ended flow session: ${this.currentFlowSession.id}`);
      
      // Start a new session
      await this.startNewFlowSession();
      
      return true;
    } catch (error) {
      this.logger.error(`Error ending flow session: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Clean up resources and shut down
   * @returns {Promise<boolean>} Success status
   */
  async shutdown() {
    try {
      // End current flow session
      await this.endCurrentFlowSession();
      
      this.logger.info('Flow Tracking Service Layer shut down successfully');
      return true;
    } catch (error) {
      this.logger.error(`Error during Service Layer shutdown: ${error.message}`);
      return false;
    }
  }
}

module.exports = FlowTrackingService;
