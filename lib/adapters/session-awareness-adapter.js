/**
 * Session Awareness Adapter
 * 
 * This adapter provides a consistent interface for session awareness functionality.
 * It integrates with the Session Boundary Manager to enable cross-token session
 * continuity and implements the standardized adapter pattern for Leo.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const path = require('path');

// Import services with proper error handling
let sessionBoundaryManager;
try {
  sessionBoundaryManager = require('../services/session-boundary-manager');
} catch (error) {
  // Create fallback implementation if service is not available
  sessionBoundaryManager = {
    initialize: async () => {
      logger.info('Using fallback session boundary manager');
      return true;
    },
    getCurrentSession: () => ({
      id: `fallback-session-${Date.now()}`,
      startTime: Date.now(),
      lastUpdateTime: Date.now()
    }),
    getBoundaryProximity: () => ({
      isApproaching: false,
      isCritical: false,
      estimatedTokensRemaining: 8000,
      estimatedTokensUsed: 0,
      tokenLimit: 8000
    }),
    setCurrentTask: () => false,
    setMetaProgrammingInfo: () => false,
    forceBoundaryMarker: async () => null
  };
  logger.warn('Failed to load session boundary manager. Using fallback implementation.');
}

// Import conversation memory manager with proper error handling
let conversationMemoryManager;
try {
  conversationMemoryManager = require('../services/conversation-memory-manager');
} catch (error) {
  // Create fallback implementation if service is not available
  conversationMemoryManager = {
    initialize: async () => {
      logger.info('Using fallback conversation memory manager');
      return true;
    },
    searchMemory: async (query, options = {}) => ({
      success: false,
      items: [],
      error: 'Conversation Memory Manager not available',
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'fallback'
      }
    }),
    generateEnhancedContext: async (query, options = {}) => ({
      success: false,
      enhancedContext: '',
      error: 'Conversation Memory Manager not available',
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'fallback'
      }
    })
  };
  logger.warn('Failed to load conversation memory manager. Using fallback implementation.');
}

// Component name for logging and events
const COMPONENT_NAME = 'session-awareness-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Adapter instance
let instance = null;

/**
 * Session Awareness Adapter class
 */
class SessionAwarenessAdapter {
  /**
   * Constructor
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = options;
    this.isInitialized = false;
    this.sessionBoundaryManager = null;
    this.conversationMemoryManager = null;
    this.sessionState = {
      currentSessionId: null,
      previousSessionId: null,
      boundaryDetected: false,
      lastBoundaryTime: null,
      continuationApplied: false,
      sessionHistory: []
    };
    
    logger.debug('Session awareness adapter instance created');
  }
  
  /**
   * Initialize the adapter
   * @param {Object} dependencies - Service dependencies
   * @returns {Promise<boolean>} Success status
   */
  async initialize(dependencies = {}) {
    try {
      logger.info('Initializing session awareness adapter');
      
      // Initialize session boundary manager if not already initialized
      if (!sessionBoundaryManager.isInitialized) {
        const success = await sessionBoundaryManager.initialize();
        if (!success) {
          logger.warn('Failed to initialize session boundary manager');
        }
      }
      
      // Initialize conversation memory manager if not already initialized
      if (!conversationMemoryManager.isInitialized) {
        const success = await conversationMemoryManager.initialize();
        if (!success) {
          logger.warn('Failed to initialize conversation memory manager');
        }
      }
      
      // Store dependencies
      this.sessionBoundaryManager = sessionBoundaryManager;
      this.conversationMemoryManager = conversationMemoryManager;
      
      // Register event handlers
      eventBus.on('session:boundary:crossed', this._handleBoundaryCrossed.bind(this), COMPONENT_NAME);
      eventBus.on('session:continuation', this._handleContinuation.bind(this), COMPONENT_NAME);
      eventBus.on('session:boundary:approaching', this._handleBoundaryApproaching.bind(this), COMPONENT_NAME);
      
      // Get current session
      const currentSession = sessionBoundaryManager.getCurrentSession();
      if (currentSession) {
        this.sessionState.currentSessionId = currentSession.id;
        this.sessionState.sessionHistory.push({
          id: currentSession.id,
          startTime: currentSession.startTime,
          type: 'current'
        });
      }
      
      this.isInitialized = true;
      
      // Emit initialization event
      eventBus.emit('component:initialized', {
        component: COMPONENT_NAME,
        timestamp: Date.now()
      });
      
      logger.info('Session awareness adapter initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Error initializing session awareness adapter: ${error.message}`);
      
      // Emit error event
      eventBus.emit('error', {
        component: COMPONENT_NAME,
        message: 'Failed to initialize session awareness adapter',
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Handle boundary crossed event
   * @param {Object} data - Event data
   * @private
   */
  _handleBoundaryCrossed(data) {
    logger.info(`Session boundary crossed: ${data.previousSessionId} -> ${data.currentSessionId}`);
    
    // Update session state
    this.sessionState.previousSessionId = data.previousSessionId;
    this.sessionState.currentSessionId = data.currentSessionId;
    this.sessionState.boundaryDetected = true;
    this.sessionState.lastBoundaryTime = data.timestamp;
    this.sessionState.continuationApplied = false;
    
    // Add to session history
    this.sessionState.sessionHistory.push({
      id: data.currentSessionId,
      startTime: data.timestamp,
      previousId: data.previousSessionId,
      type: 'boundary_crossed'
    });
    
    // Limit history size
    if (this.sessionState.sessionHistory.length > 10) {
      this.sessionState.sessionHistory = this.sessionState.sessionHistory.slice(-10);
    }
  }
  
  /**
   * Handle continuation event
   * @param {Object} data - Event data
   * @private
   */
  _handleContinuation(data) {
    logger.info(`Session continuation applied: ${data.previousSessionId} -> ${data.currentSessionId}`);
    
    // Update session state
    this.sessionState.continuationApplied = true;
    
    // Update session history
    const historyEntry = this.sessionState.sessionHistory.find(
      entry => entry.id === data.currentSessionId
    );
    
    if (historyEntry) {
      historyEntry.continuationApplied = true;
      historyEntry.continuationTime = data.timestamp;
    }
  }
  
  /**
   * Handle boundary approaching event
   * @param {Object} data - Event data
   * @private
   */
  _handleBoundaryApproaching(data) {
    logger.info(`Session boundary approaching: ${data.sessionId}, tokens remaining: ${data.estimatedTokensRemaining}`);
    
    // Emit event for other components
    eventBus.emit('session:awareness:boundary:approaching', {
      component: COMPONENT_NAME,
      sessionId: data.sessionId,
      estimatedTokensRemaining: data.estimatedTokensRemaining,
      timestamp: data.timestamp
    });
  }
  
  /**
   * Apply session awareness to context
   * @param {string} context - Original context
   * @param {Object} options - Context options
   * @returns {Promise<Object>} Enhanced context with session awareness
   */
  async applySessionAwareness(context, options = {}) {
    try {
      if (!this.isInitialized) {
        logger.warn('Session awareness adapter not initialized, initializing now...');
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            context,
            error: 'Failed to initialize session awareness adapter',
            metadata: {
              timestamp: Date.now(),
              status: 'error'
            }
          };
        }
      }
      
      // Get current session information
      const currentSession = this.sessionBoundaryManager.getCurrentSession();
      if (!currentSession) {
        return {
          success: true,
          context,
          metadata: {
            timestamp: Date.now(),
            status: 'no_session_available'
          }
        };
      }
      
      // Get boundary proximity safely with null checks
      let boundaryStatus = { isApproaching: false, isCritical: false };
      try {
        if (this.sessionBoundaryManager && typeof this.sessionBoundaryManager.getBoundaryProximity === 'function') {
          boundaryStatus = this.sessionBoundaryManager.getBoundaryProximity() || boundaryStatus;
        }
      } catch (error) {
        logger.warn(`Error getting boundary proximity: ${error.message}`);
      }
      
      // Check if we need to add session awareness information
      let enhancedContext = context;
      
      // Add session boundary information if approaching
      if (boundaryStatus && (boundaryStatus.isApproaching || boundaryStatus.isCritical)) {
        const boundaryInfo = `
## Session Boundary Information
${boundaryStatus.isCritical ? '⚠️ **CRITICAL: Token session boundary imminent**' : '⚠️ **WARNING: Approaching token session boundary**'}
- Estimated tokens remaining: ${boundaryStatus.estimatedTokensRemaining}
- Estimated tokens used: ${boundaryStatus.estimatedTokensUsed}
- Token limit: ${boundaryStatus.tokenLimit}

*Session state is being preserved for continuity across token boundaries.*
`;
        
        // Add boundary information to the beginning of the context
        enhancedContext = boundaryInfo + enhancedContext;
      }
      
      // Add continuation information if we recently crossed a boundary
      if (this.sessionState.boundaryDetected && !this.sessionState.continuationApplied) {
        const continuationInfo = `
## Session Continuation Notice
This is a new token session continuing from a previous session.
- Previous session ID: ${this.sessionState.previousSessionId}
- Current session ID: ${this.sessionState.currentSessionId}
- Boundary crossed at: ${new Date(this.sessionState.lastBoundaryTime).toISOString()}

*Session state has been restored for continuity across token boundaries.*
`;
        
        // Add continuation information to the beginning of the context
        enhancedContext = continuationInfo + enhancedContext;
        
        // Mark continuation as applied
        this.sessionState.continuationApplied = true;
      }
      
      // Add meta-programming context if applicable
      if (currentSession.metaProgramming && currentSession.metaProgramming.isMetaProgramming) {
        const metaProgrammingInfo = `
## Meta-Programming Context
Currently implementing: ${currentSession.metaProgramming.feature || 'Unknown feature'}
Purpose: ${currentSession.metaProgramming.purpose || 'Not specified'}
Implementation progress: ${Math.round(currentSession.task.progress * 100)}%
`;
        
        // Add meta-programming information to the beginning of the context
        enhancedContext = metaProgrammingInfo + enhancedContext;
      }
      
      return {
        success: true,
        context: enhancedContext,
        metadata: {
          sessionId: currentSession.id,
          boundaryStatus,
          timestamp: Date.now(),
          status: 'enhanced'
        }
      };
    } catch (error) {
      logger.error(`Error applying session awareness: ${error.message}`);
      
      return {
        success: false,
        context,
        error: error.message,
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  }
  
  /**
   * Set current task information
   * @param {Object} taskInfo - Task information
   * @returns {Promise<Object>} Standardized result with update status
   */
  async setCurrentTask(taskInfo) {
    try {
      if (!this.isInitialized) {
        logger.warn('Session awareness adapter not initialized, initializing now...');
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            error: 'Failed to initialize session awareness adapter',
            metadata: {
              timestamp: Date.now(),
              status: 'error'
            }
          };
        }
      }
      
      const success = this.sessionBoundaryManager.setCurrentTask(taskInfo);
      
      return {
        success,
        metadata: {
          timestamp: Date.now(),
          status: success ? 'updated' : 'failed'
        }
      };
    } catch (error) {
      logger.error(`Error setting current task: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  }
  
  /**
   * Set meta-programming information
   * @param {Object} metaProgrammingInfo - Meta-programming information
   * @returns {Promise<Object>} Standardized result with update status
   */
  async setMetaProgrammingInfo(metaProgrammingInfo) {
    try {
      if (!this.isInitialized) {
        logger.warn('Session awareness adapter not initialized, initializing now...');
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            error: 'Failed to initialize session awareness adapter',
            metadata: {
              timestamp: Date.now(),
              status: 'error'
            }
          };
        }
      }
      
      const success = this.sessionBoundaryManager.setMetaProgrammingInfo(metaProgrammingInfo);
      
      return {
        success,
        metadata: {
          timestamp: Date.now(),
          status: success ? 'updated' : 'failed'
        }
      };
    } catch (error) {
      logger.error(`Error setting meta-programming info: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  }
  
  /**
   * Get session status information
   * @returns {Promise<Object>} Standardized result with session status
   */
  async getSessionStatus() {
    try {
      if (!this.isInitialized) {
        logger.warn('Session awareness adapter not initialized, initializing now...');
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            error: 'Failed to initialize session awareness adapter',
            metadata: {
              timestamp: Date.now(),
              status: 'error'
            }
          };
        }
      }
      
      // Get current session with null checks
      let currentSession = null;
      let boundaryStatus = { status: 'unknown', percentage: 0 };
      
      try {
        if (this.sessionBoundaryManager && typeof this.sessionBoundaryManager.getCurrentSession === 'function') {
          currentSession = this.sessionBoundaryManager.getCurrentSession();
        }
        
        if (this.sessionBoundaryManager && typeof this.sessionBoundaryManager.getBoundaryProximity === 'function') {
          boundaryStatus = this.sessionBoundaryManager.getBoundaryProximity() || boundaryStatus;
        }
      } catch (error) {
        logger.warn(`Error getting session state: ${error.message}`);
      }
      
      // Ensure sessionState exists to prevent null reference errors
      if (!this.sessionState) {
        this.sessionState = {
          currentSessionId: null,
          previousSessionId: null,
          boundaryDetected: false,
          continuationApplied: false,
          sessionHistory: []
        };
      }
      
      return {
        success: true,
        sessionStatus: {
          currentSessionId: currentSession ? currentSession.id : null,
          previousSessionId: this.sessionState ? this.sessionState.previousSessionId : null,
          startTime: currentSession ? currentSession.startTime : null,
          lastUpdateTime: currentSession ? currentSession.lastUpdateTime : null,
          boundaryStatus,
          boundaryDetected: this.sessionState ? this.sessionState.boundaryDetected : false,
          continuationApplied: this.sessionState ? this.sessionState.continuationApplied : false,
          sessionHistory: this.sessionState ? this.sessionState.sessionHistory : []
        },
        metadata: {
          timestamp: Date.now(),
          status: 'success'
        }
      };
    } catch (error) {
      logger.error(`Error getting session status: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  }
  
  /**
   * Force create a boundary marker
   * @returns {Promise<Object>} Standardized result with marker information
   */
  async forceBoundaryMarker() {
    try {
      if (!this.isInitialized) {
        logger.warn('Session awareness adapter not initialized, initializing now...');
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            error: 'Failed to initialize session awareness adapter',
            metadata: {
              timestamp: Date.now(),
              status: 'error'
            }
          };
        }
      }
      
      const markerPath = await this.sessionBoundaryManager.forceBoundaryMarker();
      
      return {
        success: !!markerPath,
        markerPath,
        metadata: {
          timestamp: Date.now(),
          status: markerPath ? 'created' : 'failed'
        }
      };
    } catch (error) {
      logger.error(`Error forcing boundary marker: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
  }
}

/**
 * Initialize the session awareness adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing session awareness adapter');
    
    // If already initialized, return immediately
    if (module.exports.isInitialized) {
      logger.info('Session awareness adapter already initialized');
      return true;
    }
    
    // Create instance if it doesn't exist
    if (!instance) {
      instance = new SessionAwarenessAdapter(options);
    }
    
    // Initialize the instance
    const success = await instance.initialize();
    
    // Update module export property
    module.exports.isInitialized = success;
    
    if (success) {
      logger.info('Session awareness adapter initialized successfully');
    } else {
      logger.warn('Session awareness adapter initialization failed');
    }
    
    return success;
  } catch (error) {
    logger.error(`Error initializing session awareness adapter: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', {
      component: COMPONENT_NAME,
      message: 'Failed to initialize session awareness adapter',
      error: error.message
    });
    
    // Update module export property to indicate initialization failure
    module.exports.isInitialized = false;
    
    return false;
  }
}

/**
 * Apply session awareness to context
 * @param {string} context - Original context
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Enhanced context with session awareness
 */
async function applySessionAwareness(context, options = {}) {
  try {
    if (!instance) {
      logger.warn('Session awareness adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          context,
          error: 'Failed to initialize session awareness adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    return await instance.applySessionAwareness(context, options);
  } catch (error) {
    logger.error(`Error applying session awareness: ${error.message}`);
    
    return {
      success: false,
      context,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Set current task information
 * @param {Object} taskInfo - Task information
 * @returns {Promise<Object>} Standardized result with update status
 */
async function setCurrentTask(taskInfo) {
  try {
    if (!instance) {
      logger.warn('Session awareness adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize session awareness adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    return await instance.setCurrentTask(taskInfo);
  } catch (error) {
    logger.error(`Error setting current task: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Set meta-programming information
 * @param {Object} metaProgrammingInfo - Meta-programming information
 * @returns {Promise<Object>} Standardized result with update status
 */
async function setMetaProgrammingInfo(metaProgrammingInfo) {
  try {
    if (!instance) {
      logger.warn('Session awareness adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize session awareness adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    return await instance.setMetaProgrammingInfo(metaProgrammingInfo);
  } catch (error) {
    logger.error(`Error setting meta-programming info: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Get session status information
 * @returns {Promise<Object>} Standardized result with session status
 */
async function getSessionStatus() {
  try {
    if (!instance) {
      logger.warn('Session awareness adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize session awareness adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    return await instance.getSessionStatus();
  } catch (error) {
    logger.error(`Error getting session status: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Force create a boundary marker
 * @returns {Promise<Object>} Standardized result with marker information
 */
async function forceBoundaryMarker() {
  try {
    if (!instance) {
      logger.warn('Session awareness adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize session awareness adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    return await instance.forceBoundaryMarker();
  } catch (error) {
    logger.error(`Error forcing boundary marker: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Store data for the current session
 * @param {string} testId - Test ID or namespace
 * @param {string} key - Data key
 * @param {any} value - Data value
 * @returns {Promise<boolean>} Success status
 */
async function storeData(testId, key, value) {
  // Ensure adapter is initialized
  if (!instance || !instance.isInitialized) {
    await initialize();
  }
  
  try {
    // Use the integration session awareness adapter to store data
    const integrationAdapter = require('../integration/session-awareness-adapter').sessionAwarenessAdapter;
    await integrationAdapter.storeData(`${testId}:${key}`, value);
    
    logger.info(`Stored session data: ${testId}:${key}`);
    return true;
  } catch (error) {
    logger.error(`Error storing session data: ${error.message}`, error);
    return false;
  }
}

/**
 * Retrieve data from a previous session
 * @param {string} testId - Test ID or namespace
 * @param {string} key - Data key
 * @returns {Promise<any>} Data value
 */
async function retrieveData(testId, key) {
  // Ensure adapter is initialized
  if (!instance || !instance.isInitialized) {
    await initialize();
  }
  
  try {
    // Combine testId and key to form the storage key
    const storageKey = `${testId}:${key}`;
    
    // Use the integration session awareness adapter to retrieve data
    const integrationAdapter = require('../integration/session-awareness-adapter').sessionAwarenessAdapter;
    const result = await integrationAdapter.retrieveData(storageKey);
    
    logger.info(`Retrieved session data for key: ${storageKey}`);
    return result;
  } catch (error) {
    logger.error(`Error retrieving data for test ${testId}, key ${key}: ${error.message}`, error);
    return null;
  }
}

/**
 * Create a session boundary marker
 * @param {Object} boundaryData - Data about the boundary
 * @returns {Promise<Object>} Boundary marker information
 */
async function createSessionBoundary(boundaryData = {}) {
  // Ensure adapter is initialized
  if (!instance || !instance.isInitialized) {
    await initialize();
  }
  
  try {
    // Use the integration session awareness adapter to create a boundary
    const integrationAdapter = require('../integration/session-awareness-adapter').sessionAwarenessAdapter;
    return await integrationAdapter.createSessionBoundary(boundaryData);
  } catch (error) {
    logger.error(`Error creating session boundary: ${error.message}`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get the current session state
 * @returns {Promise<Object>} Session state information
 */
async function getSessionState() {
  // Ensure adapter is initialized
  if (!instance || !instance.isInitialized) {
    await initialize();
  }
  
  try {
    // Get the current session status
    const status = await getSessionStatus();
    
    // Return a standardized session state object
    return {
      success: true,
      sessionId: status.sessionId,
      startTime: status.startTime,
      lastUpdateTime: status.lastUpdateTime,
      boundaryProximity: status.boundaryProximity,
      metadata: {
        timestamp: Date.now(),
        status: 'active'
      }
    };
  } catch (error) {
    logger.error(`Error getting session state: ${error.message}`, error);
    return {
      success: false,
      error: error.message,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

// Export the adapter API
module.exports = {
  initialize,
  applySessionAwareness,
  setCurrentTask,
  setMetaProgrammingInfo,
  getSessionStatus,
  getSessionState,
  forceBoundaryMarker,
  storeData,
  retrieveData,
  createSessionBoundary,
  sessionAwarenessAdapter: instance
};
