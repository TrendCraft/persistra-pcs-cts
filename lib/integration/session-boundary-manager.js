/**
 * Session Boundary Manager
 * 
 * Manages session boundaries and tracks the current session state.
 * This component is responsible for detecting when a session has ended
 * and creating a new session when needed.
 * 
 * @module lib/integration/session-boundary-manager
 * @author Leo Development Team
 * @created May 15, 2025
 * @updated May 22, 2025 - Fixed circular dependencies and improved error handling
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Create logger
const logger = createComponentLogger('session-boundary-manager');

// Configuration constants
const SESSION_DATA_DIR = path.join(process.cwd(), 'data', 'sessions');
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

// Shared configuration for session data paths
const getSessionFilePath = (sessionId) => path.join(SESSION_DATA_DIR, `${sessionId}.json`);

/**
 * Session Boundary Manager
 * 
 * Detects and manages session boundaries to ensure cognitive continuity
 */
class SessionBoundaryManager {
  constructor() {
    this.initialized = false;
    this.initializing = false;
    this._initPromise = null;
    this.sessionIndexPath = path.join(SESSION_DATA_DIR, 'index.json');
    this.sessionRecords = [];
    this.currentSessionId = null;
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.lastError = null;
    this.initRetries = 0;
    this.maxInitRetries = 3;
  }

  /**
   * Initialize the session boundary manager
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // If already initialized, return immediately
    if (this.initialized) {
      logger.debug('Session boundary manager already initialized');
      return { success: true, alreadyInitialized: true };
    }
    
    // If initialization is in progress, return the existing promise
    if (this._initPromise) {
      logger.debug('Session boundary manager initialization already in progress');
      return this._initPromise;
    }
    
    // Set initializing flag and create initialization promise
    this.initializing = true;
    this._initPromise = this._doInitialize(options);
    return this._initPromise;
  }
  
  /**
   * Internal initialization implementation
   * @private
   */
  async _doInitialize(options = {}) {
    logger.debug('Starting session boundary manager initialization');
    
    try {
      // Create session directory if it doesn't exist
      const sessionDir = path.dirname(this.sessionIndexPath);
      await fs.mkdir(sessionDir, { recursive: true });
      logger.debug(`Ensured session directory exists: ${sessionDir}`);

      // Load session records
      await this.loadSessionRecords();
      logger.debug(`Loaded ${this.sessionRecords.length} session records`);

      // Create a new session
      this.currentSessionId = await this.createNewSession();
      logger.debug(`Created new session with ID: ${this.currentSessionId}`);

      this.initialized = true;
      this.initializing = false;
      logger.info('Session boundary manager initialized successfully');
      
      // Emit initialization event
      eventBus.emit('service:initialized', { 
        service: 'session-boundary-manager', 
        timestamp: Date.now(),
        sessionId: this.currentSessionId
      });
      
      return { 
        success: true, 
        sessionId: this.currentSessionId 
      };
    } catch (error) {
      this.lastError = error;
      this.initializing = false;
      this.initRetries++;
      
      logger.error(`Failed to initialize session boundary manager (attempt ${this.initRetries}/${this.maxInitRetries}): ${error.message}`, error);
      
      // Emit error event
      eventBus.emit('service:initialization_failed', { 
        service: 'session-boundary-manager', 
        error: error.message,
        attempt: this.initRetries,
        timestamp: Date.now()
      });
      
      // If we haven't exceeded max retries, clear the init promise so we can try again
      if (this.initRetries < this.maxInitRetries) {
        this._initPromise = null;
      }
      
      return { 
        success: false, 
        error: error.message,
        retryable: this.initRetries < this.maxInitRetries
      };
    }
  }

  /**
   * Load session records from storage
   */
  async loadSessionRecords() {
    try {
      try {
        const data = await fs.readFile(this.sessionIndexPath, 'utf8');
        this.sessionRecords = JSON.parse(data);
        logger.info(`Loaded ${this.sessionRecords.length} session records from index`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error loading session records: ${error.message}`);
        }
        this.sessionRecords = [];
      }
    } catch (error) {
      logger.error(`Error loading session records: ${error.message}`, error);
      this.sessionRecords = [];
    }
  }

  /**
   * Save session records to storage
   */
  async saveSessionRecords() {
    try {
      const data = JSON.stringify(this.sessionRecords, null, 2);
      await fs.writeFile(this.sessionIndexPath, data);
      logger.info(`Saved ${this.sessionRecords.length} session records to index`);
    } catch (error) {
      logger.error(`Error saving session records: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Create a new session
   * @returns {Promise<string>} New session ID
   */
  async createNewSession() {
    try {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 10);
      const sessionId = `session-${timestamp}-${randomId}`;

      const sessionRecord = {
        id: sessionId,
        startTime: timestamp,
        lastActivity: timestamp,
        status: 'active',
        tokenBoundaries: []
      };

      this.sessionRecords.push(sessionRecord);
      await this.saveSessionRecords();

      logger.info(`Created new session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      logger.error(`Error creating new session: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get the current session ID
   * @returns {Promise<string>} Current session ID
   */
  async getCurrentSessionId() {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to get current session ID: initialization failed - ${initResult.error}`);
        // Return a fallback session ID if initialization fails
        return `fallback-session-${Date.now()}`;
      }
    }

    try {
      // Check if current session has timed out
      const currentSession = this.sessionRecords.find(record => record.id === this.currentSessionId);
      
      if (currentSession) {
        const now = Date.now();
        const timeSinceLastActivity = now - currentSession.lastActivity;
        
        if (timeSinceLastActivity > this.sessionTimeout) {
          // Session has timed out, create a new one
          logger.info(`Session ${this.currentSessionId} has timed out, creating a new session`);
          currentSession.status = 'completed';
          currentSession.endTime = now;
          this.currentSessionId = await this.createNewSession();
          
          // Emit session timeout event
          eventBus.emit('session:timeout', {
            previousSessionId: currentSession.id,
            newSessionId: this.currentSessionId,
            timeoutAfter: timeSinceLastActivity,
            timestamp: now
          });
        } else {
          // Update last activity time
          currentSession.lastActivity = now;
          await this.saveSessionRecords();
        }
      } else {
        // Current session not found, create a new one
        logger.warn(`Current session ${this.currentSessionId} not found, creating a new session`);
        this.currentSessionId = await this.createNewSession();
        
        // Emit session recovery event
        eventBus.emit('session:recovered', {
          newSessionId: this.currentSessionId,
          timestamp: Date.now()
        });
      }

      return this.currentSessionId;
    } catch (error) {
      logger.error(`Error getting current session ID: ${error.message}`, error);
      // Return the current session ID if available, or a fallback
      return this.currentSessionId || `fallback-session-${Date.now()}`;
    }
  }

  /**
   * Get information about session boundaries
   * @param {string} sessionId - Session ID to get boundary info for
   * @returns {Promise<Object>} Boundary information
   */
  async getBoundaryInfo(sessionId) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to get boundary info: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          sessionId: sessionId
        };
      }
    }

    try {
      // Get the session record
      const sessionRecord = this.sessionRecords.find(record => record.id === sessionId);
      if (!sessionRecord) {
        logger.warn(`Session record not found for session ID: ${sessionId}`);
        return {
          success: false,
          error: 'Session record not found',
          sessionId: sessionId
        };
      }

      // Get token boundaries from session awareness adapter using lazy loading
      let tokenBoundaries = [];
      try {
        const sessionAwarenessAdapter = await this._getSessionAwarenessAdapter();
        const boundaryData = await sessionAwarenessAdapter.getData('token-boundaries');
        if (boundaryData && Array.isArray(boundaryData)) {
          tokenBoundaries = boundaryData;
        }
      } catch (error) {
        logger.warn(`Could not get token boundaries: ${error.message}`);
        // Continue with empty token boundaries
      }

      // Calculate boundary proximity based on time since last activity
      const now = Date.now();
      const timeSinceLastActivity = now - sessionRecord.lastActivity;
      const proximityPercentage = Math.min(100, (timeSinceLastActivity / this.sessionTimeout) * 100);
      
      let proximity = 'unknown';
      if (proximityPercentage < 25) {
        proximity = 'far';
      } else if (proximityPercentage < 50) {
        proximity = 'medium';
      } else if (proximityPercentage < 75) {
        proximity = 'close';
      } else {
        proximity = 'imminent';
      }

      // Calculate continuity score
      let continuityScore = 1.0;
      if (tokenBoundaries.length > 0) {
        // More boundaries = lower score, but never below 0.5 just for having boundaries
        continuityScore -= Math.min(0.5, tokenBoundaries.length * 0.05);
      }
      // Time factor - reduce score based on time elapsed (up to 0.5 reduction)
      continuityScore -= Math.min(0.5, (timeSinceLastActivity / this.sessionTimeout) * 0.5);
      continuityScore = Math.max(0, continuityScore); // Ensure score is not negative

      return {
        success: true,
        sessionId: sessionRecord.id,
        startTime: sessionRecord.startTime,
        lastActivity: sessionRecord.lastActivity,
        lastUpdateTime: sessionRecord.lastUpdateTime,
        tokenBoundaries: sessionRecord.tokenBoundaries,
        proximity,
        continuityScore,
        previousSessionId: sessionRecord.previousSessionId || null
      };
    } catch (error) {
      logger.error(`Failed to get boundary info: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        sessionId: sessionId
      };
    }
  }
  
  /**
   * Record a token boundary in the current session
   * @param {Object} boundaryData - Data about the token boundary
   * @returns {Promise<Object>} Result with success status and boundary information
   */
  async recordTokenBoundary(boundaryData) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to record token boundary: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}` 
        };
      }
    }

    try {
      const currentSession = this.sessionRecords.find(record => record.id === this.currentSessionId);
      
      if (!currentSession) {
        logger.warn(`Current session ${this.currentSessionId} not found, creating a new session`);
        this.currentSessionId = await this.createNewSession();
        return this.recordTokenBoundary(boundaryData);
      }
      
      const timestamp = Date.now();
      const boundaryId = boundaryData.id || `boundary-${timestamp}-${Math.random().toString(36).substring(2, 7)}`;
      
      const tokenBoundary = {
        id: boundaryId,
        timestamp,
        sessionId: this.currentSessionId,
        ...boundaryData
      };
      
      currentSession.tokenBoundaries.push(tokenBoundary);
      currentSession.lastActivity = timestamp;
      
      await this.saveSessionRecords();
      
      // Emit token boundary event
      eventBus.emit('token:boundary:detected', {
        sessionId: this.currentSessionId,
        timestamp,
        boundaryId,
        ...boundaryData
      }, 'session-boundary-manager');
      
      logger.info(`Recorded token boundary ${boundaryId} in session ${this.currentSessionId}`);
      
      return { 
        success: true, 
        boundaryId,
        sessionId: this.currentSessionId,
        timestamp 
      };
    } catch (error) {
      logger.error(`Error recording token boundary: ${error.message}`, error);
      return { 
        success: false, 
        error: error.message,
        sessionId: this.currentSessionId
      };
    }
  }

  /**
   * Get the session awareness adapter using lazy loading
   * @private
   * @returns {Promise<Object>} Session awareness adapter instance
   */
  async _getSessionAwarenessAdapter() {
    try {
      // Defer loading the session awareness adapter until needed
      const { sessionAwarenessAdapter } = require('./session-awareness-adapter');
      
      // Check if it's already initialized
      if (!sessionAwarenessAdapter.initialized) {
        const initResult = await sessionAwarenessAdapter.initialize();
        if (!initResult.success) {
          throw new Error(`Session awareness adapter initialization failed: ${initResult.error}`);
        }
      }
      
      return sessionAwarenessAdapter;
    } catch (error) {
      logger.error(`Error getting session awareness adapter: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get token boundaries for a session
   * @param {string} sessionId - Session ID (defaults to current session)
   * @returns {Promise<Array>} Array of token boundaries
   */
  async getTokenBoundaries(sessionId = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const targetSessionId = sessionId || this.currentSessionId;
    const session = this.sessionRecords.find(record => record.id === targetSessionId);
    
    if (!session) {
      logger.warn(`Session ${targetSessionId} not found`);
      return [];
    }
    
    return session.tokenBoundaries;
  }

  /**
   * Complete the current session
   * @returns {Promise<boolean>} Success status
   */
  async completeCurrentSession() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const currentSession = this.sessionRecords.find(record => record.id === this.currentSessionId);
      
      if (!currentSession) {
        logger.warn(`Current session ${this.currentSessionId} not found`);
        return false;
      }
      
      const timestamp = Date.now();
      
      currentSession.status = 'completed';
      currentSession.endTime = timestamp;
      currentSession.lastActivity = timestamp;
      
      await this.saveSessionRecords();
      
      // Create a new session
      this.currentSessionId = await this.createNewSession();
      
      logger.info(`Completed session ${currentSession.id}`);
      return true;
    } catch (error) {
      logger.error(`Error completing current session: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Get session information
   * @param {string} sessionId - Session ID (defaults to current session)
   * @returns {Promise<Object>} Session information
   */
  async getSessionInfo(sessionId = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const targetSessionId = sessionId || this.currentSessionId;
    const session = this.sessionRecords.find(record => record.id === targetSessionId);
    
    if (!session) {
      logger.warn(`Session ${targetSessionId} not found`);
      return null;
    }
    
    return session;
  }

  /**
   * Get recent sessions
   * @param {number} limit - Maximum number of sessions to return
   * @returns {Promise<Array>} Array of recent sessions
   */
  async getRecentSessions(limit = 5) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Sort sessions by start time (descending)
    const sortedSessions = [...this.sessionRecords].sort((a, b) => b.startTime - a.startTime);
    
    return sortedSessions.slice(0, limit);
  }
  
  /**
   * Get information about a specific boundary by ID
   * @param {string} sessionId - Session ID (defaults to current session)
   * @param {number|string} boundaryId - Boundary ID to retrieve
   * @returns {Promise<Object>} Boundary information
   */
  async getBoundaryById(sessionId = null, boundaryId = null) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to get boundary by ID: initialization failed - ${initResult.error}`);
        return null;
      }
    }
    
    try {
      const targetSessionId = sessionId || this.currentSessionId;
      const session = this.sessionRecords.find(record => record.id === targetSessionId);
      
      if (!session) {
        logger.warn(`Session ${targetSessionId} not found`);
        return null;
      }
      
      if (!boundaryId) {
        // Return the most recent boundary if no specific ID is provided
        if (session.tokenBoundaries.length === 0) {
          return null;
        }
        return session.tokenBoundaries[session.tokenBoundaries.length - 1];
      }
      
      // Find the specific boundary by ID
      const boundary = session.tokenBoundaries.find(b => {
        if (typeof boundaryId === 'number' && b.id === boundaryId) {
          return true;
        }
        if (typeof boundaryId === 'string' && b.id && b.id.toString() === boundaryId) {
          return true;
        }
        return false;
      });
      
      if (!boundary) {
        logger.warn(`Boundary ${boundaryId} not found in session ${targetSessionId}`);
        return null;
      }
      
      return boundary;
    } catch (error) {
      logger.error(`Error getting boundary info: ${error.message}`, error);
      return null;
    }
  }
  
  /**
   * Clear the current session state (for testing purposes)
   * @returns {Promise<boolean>} Success status
   */
  async clearSessionState() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Complete the current session if it exists
      if (this.currentSessionId) {
        const currentSession = this.sessionRecords.find(record => record.id === this.currentSessionId);
        if (currentSession) {
          currentSession.status = 'completed';
          currentSession.endTime = Date.now();
        }
      }
      
      // Reset the current session ID
      this.currentSessionId = null;
      
      // Save the updated records
      await this.saveSessionRecords();
      
      logger.info('Session state cleared successfully');
      return true;
    } catch (error) {
      logger.error(`Error clearing session state: ${error.message}`, error);
      return false;
    }
  }
}

// Create singleton instance
const sessionBoundaryManager = new SessionBoundaryManager();

module.exports = {
  sessionBoundaryManager
};
