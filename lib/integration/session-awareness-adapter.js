/**
 * Session Awareness Adapter
 * 
 * Provides an interface for maintaining awareness across token boundaries.
 * This adapter allows Leo to store and retrieve data across sessions,
 * enabling cognitive continuity during long development flows.
 * 
 * This adapter follows the standardized interface defined in INTERFACE_REGISTRY.md
 * and is used by the CrossSessionAwarenessTest to validate Leo's ability to maintain
 * awareness across token boundaries.
 * 
 * @module lib/integration/session-awareness-adapter
 * @author Leo Development Team
 * @created May 13, 2025
 * @updated May 22, 2025 - Fixed circular dependencies, improved error handling, and standardized interfaces
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'session-awareness-adapter';

// Create logger
const logger = createComponentLogger(COMPONENT_NAME);

// Shared configuration for session data paths
// Use the same constants as session-boundary-manager.js
const SESSION_DATA_DIR = path.join(process.cwd(), 'data', 'sessions');
const getSessionFilePath = (sessionId) => path.join(SESSION_DATA_DIR, `${sessionId}.json`);

/**
 * Session Awareness Adapter
 * 
 * Provides methods for storing and retrieving data across token boundaries
 */
class SessionAwarenessAdapter {
  constructor() {
    this.initialized = false;
    this.initializing = false;
    this._initPromise = null;
    this.sessionDataDir = SESSION_DATA_DIR;
    this.currentSessionId = null;
    this.sessionData = new Map();
    this.lastError = null;
    this.initRetries = 0;
    this.maxInitRetries = 3;
  }

  /**
   * Initialize the session awareness adapter
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // If already initialized, return immediately
    if (this.initialized) {
      logger.debug(`${COMPONENT_NAME} already initialized`);
      return { success: true, alreadyInitialized: true, timestamp: Date.now() };
    }
    
    // If initialization is in progress, return the existing promise
    if (this._initPromise) {
      logger.debug(`${COMPONENT_NAME} initialization already in progress`);
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
    logger.debug('Starting session awareness adapter initialization');
    
    try {
      // Create session data directory if it doesn't exist
      await fs.mkdir(this.sessionDataDir, { recursive: true });
      logger.debug(`Ensured session data directory exists: ${this.sessionDataDir}`);

      // Get the current session ID using lazy loading to avoid circular dependencies
      try {
        // Defer loading the session boundary manager until needed
        const sessionBoundaryManager = await this._getSessionBoundaryManager();
        
        // Get or create current session ID
        this.currentSessionId = await sessionBoundaryManager.getCurrentSessionId();
        logger.debug(`Current session ID: ${this.currentSessionId}`);
      } catch (sessionError) {
        // If we can't get the session boundary manager, create a fallback session ID
        logger.warn(`Could not get session boundary manager: ${sessionError.message}`);
        this.currentSessionId = `fallback-session-${Date.now()}`;
        logger.debug(`Created fallback session ID: ${this.currentSessionId}`);
      }

      // Load session data
      await this.loadSessionData();
      logger.debug(`Loaded ${this.sessionData.size} items from session data`);

      this.initialized = true;
      this.initializing = false;
      logger.info('Session awareness adapter initialized successfully');
      
      // Emit initialization event
      eventBus.emit('service:initialized', { 
        service: COMPONENT_NAME, 
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
      
      logger.error(`Failed to initialize session awareness adapter (attempt ${this.initRetries}/${this.maxInitRetries}): ${error.message}`, error);
      
      // Emit error event
      eventBus.emit('service:initialization_failed', { 
        service: COMPONENT_NAME, 
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
        retryable: this.initRetries < this.maxInitRetries,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Get the session boundary manager using lazy loading
   * @private
   * @returns {Promise<Object>} Session boundary manager instance
   */
  async _getSessionBoundaryManager() {
    try {
      // Defer loading the session boundary manager until needed
      const { sessionBoundaryManager } = require('./session-boundary-manager');
      
      // Check if it's already initialized
      if (!sessionBoundaryManager.initialized) {
        const initResult = await sessionBoundaryManager.initialize();
        if (!initResult.success) {
          throw new Error(`Session boundary manager initialization failed: ${initResult.error}`);
        }
      }
      
      return sessionBoundaryManager;
    } catch (error) {
      logger.error(`Error getting session boundary manager: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Load session data from storage
   */
  async loadSessionData() {
    try {
      const sessionFilePath = path.join(this.sessionDataDir, `${this.currentSessionId}.json`);
      
      try {
        const data = await fs.readFile(sessionFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        for (const [key, value] of Object.entries(parsedData)) {
          this.sessionData.set(key, value);
        }
        
        logger.info(`Loaded ${this.sessionData.size} items from session data`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error loading session data: ${error.message}`);
        } else {
          logger.info('No existing session data found, starting with empty session');
        }
      }
    } catch (error) {
      logger.error(`Error loading session data: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Save session data to storage
   */
  async saveSessionData() {
    try {
      const sessionFilePath = path.join(this.sessionDataDir, `${this.currentSessionId}.json`);
      const data = JSON.stringify(Object.fromEntries(this.sessionData), null, 2);
      
      await fs.writeFile(sessionFilePath, data);
      logger.info(`Saved ${this.sessionData.size} items to session data`);
    } catch (error) {
      logger.error(`Error saving session data: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Store data for the current session
   * @param {string} testId - Test ID or namespace
   * @param {string} key - Data key
   * @param {any} value - Data value
   * @returns {Promise<boolean>} Success status
   */
  async storeAwarenessData(testId, key, value) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Create storage key using testId and key
      const storageKey = `${testId}:${key}`;
      
      // Store the data
      this.sessionData.set(storageKey, value);
      await this.saveSessionData();
      
      logger.info(`Stored awareness data: ${storageKey}`);
      return true;
    } catch (error) {
      logger.error(`Error storing awareness data: ${error.message}`, error);
      return false;
    }
  }
  
  /**
   * Store data for the current session
   * @param {string} namespace - Optional namespace for the data (e.g., test ID)
   * @param {string} key - Data key
   * @param {any} value - Data value
   * @returns {Promise<boolean>} Success status
   */
  async storeData(namespace, key, value) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Handle both 2-parameter and 3-parameter versions for backward compatibility
      let actualKey, actualValue;
      
      if (arguments.length === 2) {
        // If only 2 arguments are provided, assume (key, value) format
        actualKey = namespace;
        actualValue = key;
      } else {
        // If 3 arguments are provided, use namespace:key format
        actualKey = `${namespace}:${key}`;
        actualValue = value;
      }
      
      this.sessionData.set(actualKey, actualValue);
      await this.saveSessionData();
      
      logger.info(`Stored session data: ${actualKey}`);
      return true;
    } catch (error) {
      logger.error(`Error storing session data: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Retrieve data from the current session
   * @param {string} namespace - Optional namespace for the data (e.g., test ID)
   * @param {string} key - Data key
   * @returns {Promise<any>} Data value
   */
  async getData(namespace, key) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Handle both 1-parameter and 2-parameter versions for backward compatibility
    let actualKey;
    
    if (arguments.length === 1) {
      // If only 1 argument is provided, assume it's the key
      actualKey = namespace;
    } else {
      // If 2 arguments are provided, use namespace:key format
      actualKey = `${namespace}:${key}`;
    }

    return this.sessionData.get(actualKey);
  }

  /**
   * Check if data exists in the current session
   * @param {string} key - Data key
   * @returns {Promise<boolean>} True if data exists
   */
  async hasData(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.sessionData.has(key);
  }

  /**
   * Delete data from the current session
   * @param {string} key - Data key
   * @returns {Promise<boolean>} Success status
   */
  async deleteData(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const deleted = this.sessionData.delete(key);
      
      if (deleted) {
        await this.saveSessionData();
        logger.info(`Deleted session data: ${key}`);
      }
      
      return deleted;
    } catch (error) {
      logger.error(`Error deleting session data: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Clear all data from the current session
   * @returns {Promise<boolean>} Success status
   */
  async clearData() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      this.sessionData.clear();
      await this.saveSessionData();
      
      logger.info('Cleared all session data');
      return true;
    } catch (error) {
      logger.error(`Error clearing session data: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Add a test assertion to the current session
   * @param {string} name - Assertion name
   * @param {boolean} condition - Assertion condition
   * @param {string} message - Assertion message
   * @returns {Promise<Object>} Assertion result
   */
  async assert(name, condition, message) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const assertion = {
        name,
        passed: !!condition,
        message: message || `Assertion ${condition ? 'passed' : 'failed'}: ${name}`,
        timestamp: new Date()
      };
      
      // Get existing assertions or create new array
      let assertions = this.sessionData.get('assertions');
      if (!assertions || !Array.isArray(assertions)) {
        assertions = [];
      }
      
      // Add the new assertion
      assertions.push(assertion);
      
      // Update assertions in session data
      this.sessionData.set('assertions', assertions);
      await this.saveSessionData();
      
      logger.info(`Test assertion: ${assertion.message}`);
      return assertion;
    } catch (error) {
      logger.error(`Error creating assertion: ${error.message}`, error);
      return {
        name,
        passed: false,
        message: `Assertion failed due to error: ${error.message}`,
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Create a session boundary marker
   * @param {Object} boundaryData - Data about the boundary
   * @returns {Promise<Object>} Boundary marker information
   */
  async createSessionBoundary(boundaryData = {}) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to create session boundary: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}` 
        };
      }
    }

    try {
      // Create boundary marker
      const markerId = `boundary-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const marker = {
        id: markerId,
        timestamp: new Date(),
        sessionId: this.currentSessionId,
        type: boundaryData.type || 'generic',
        data: boundaryData
      };
      
      // Store boundary marker
      await this.storeData(`boundary-${marker.id}`, marker);
      
      // Record the token boundary in the session boundary manager using lazy loading
      try {
        const sessionBoundaryManager = await this._getSessionBoundaryManager();
        await sessionBoundaryManager.recordTokenBoundary({
          id: markerId,
          type: 'session_boundary',
          source: 'session-awareness-adapter',
          boundaryType: boundaryData.type || 'generic',
          metadata: boundaryData
        });
      } catch (boundaryError) {
        logger.warn(`Could not record token boundary in session boundary manager: ${boundaryError.message}`);
        // Continue even if we couldn't record the boundary
      }
      
      // Emit event
      eventBus.emit('session:boundary:created', marker);
      
      logger.info(`Created session boundary marker: ${marker.id}`);
      return {
        success: true,
        ...marker
      };
    } catch (error) {
      logger.error(`Error creating session boundary: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        sessionId: this.currentSessionId
      };
    }
  }

  /**
   * Retrieve awareness data for cross-session testing
   * @param {string} testId - Test ID or namespace
   * @param {string} key - Data key
   * @returns {Promise<any>} Data value
   */
  async retrieveAwarenessData(testId, key) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Create storage key using testId and key
      const storageKey = `${testId}:${key}`;
      
      // First try to get from current session
      const currentData = await this.getData(storageKey);
      if (currentData !== undefined) {
        logger.info(`Retrieved awareness data from current session: ${storageKey}`);
        return currentData;
      }
      
      // If not found in current session, try to find in all available sessions
      const sessions = await this.listSessions();
      
      for (const sessionId of sessions) {
        if (sessionId === this.currentSessionId) continue; // Already checked current session
        
        const sessionFilePath = path.join(this.sessionDataDir, `${sessionId}.json`);
        
        try {
          const data = await fs.readFile(sessionFilePath, 'utf8');
          const parsedData = JSON.parse(data);
          
          if (parsedData[storageKey] !== undefined) {
            logger.info(`Retrieved awareness data from session ${sessionId}: ${storageKey}`);
            return parsedData[storageKey];
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            logger.warn(`Error reading session ${sessionId}: ${error.message}`);
          }
          // Continue to next session
        }
      }
      
      logger.warn(`Awareness data not found in any session: ${storageKey}`);
      return null;
    } catch (error) {
      logger.error(`Error retrieving awareness data: ${error.message}`, error);
      return null;
    }
  }
  
  /**
   * Retrieve data from a previous session
   * @param {string} key - Data key or full storage key (namespace:key format)
   * @returns {Promise<any>} Data value
   */
  async retrieveData(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // First try to get from current session
      const currentData = await this.getData(key);
      if (currentData !== undefined) {
        logger.info(`Retrieved data from current session: ${key}`);
        return currentData;
      }
      
      // If not found in current session, try to find in all available sessions
      const sessions = await this.listSessions();
      
      for (const sessionId of sessions) {
        if (sessionId === this.currentSessionId) continue; // Already checked current session
        
        const sessionFilePath = path.join(this.sessionDataDir, `${sessionId}.json`);
        
        try {
          const data = await fs.readFile(sessionFilePath, 'utf8');
          const parsedData = JSON.parse(data);
          
          if (parsedData[key] !== undefined) {
            logger.info(`Retrieved data from session ${sessionId}: ${key}`);
            return parsedData[key];
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            logger.warn(`Error reading session ${sessionId}: ${error.message}`);
          }
          // Continue to next session
        }
      }
      
      logger.warn(`Data not found in any session: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Error retrieving data: ${error.message}`, error);
      return null;
    }
  }
  /**
   * List all available sessions
   * @returns {Promise<Array<string>>} Array of session IDs
   */
  async listSessions() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Read all files in the session data directory
      const files = await fs.readdir(this.sessionDataDir);
      
      // Filter for .json files and extract session IDs
      const sessionIds = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      logger.info(`Found ${sessionIds.length} available sessions`);
      return sessionIds;
    } catch (error) {
      logger.error(`Error listing sessions: ${error.message}`, error);
      return [];
    }
  }

  /**
   * Complete a cross-session awareness test and generate a summary
   * @returns {Promise<Object>} Test summary
   */
  async completeTest() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get all assertions from the session data
      const assertions = this.sessionData.get('assertions') || [];
      
      // Calculate test results
      const totalAssertions = assertions.length;
      const passedAssertions = assertions.filter(a => a.passed).length;
      const successRate = totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;
      
      // Get test metadata
      const testId = this.sessionData.get('testId') || 'unknown';
      const testName = this.sessionData.get('testName') || 'Unnamed Test';
      const description = this.sessionData.get('description') || '';
      const startTime = this.sessionData.get('startTime') || new Date();
      const endTime = new Date();
      
      // Create summary
      const summary = {
        testId,
        testName,
        description,
        startTime,
        endTime,
        duration: endTime - startTime,
        totalAssertions,
        passedAssertions,
        successRate,
        assertions
      };
      
      // Store summary in session data
      this.sessionData.set('testSummary', summary);
      await this.saveSessionData();
      
      // Save report to file
      const reportDir = path.join(process.cwd(), 'test-results', 'cross-session');
      await fs.mkdir(reportDir, { recursive: true });
      
      const reportPath = path.join(reportDir, `${testId}-report.json`);
      await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
      
      logger.info(`Test completed. Success rate: ${successRate.toFixed(2)}%. Report saved to: ${reportPath}`);
      
      return summary;
    } catch (error) {
      logger.error(`Error completing test: ${error.message}`, error);
      return {
        error: error.message,
        success: false
      };
    }
  }

  async getPreviousSessionData(sessionId, key) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const sessionFilePath = path.join(this.sessionDataDir, `${sessionId}.json`);
      
      try {
        const data = await fs.readFile(sessionFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        return parsedData[key];
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error loading previous session data: ${error.message}`);
        }
        return null;
      }
    } catch (error) {
      logger.error(`Error retrieving previous session data: ${error.message}`, error);
      return null;
    }
  }

  /**
   * List all available sessions
   * @returns {Promise<Array<string>>} Array of session IDs
   */
  async listSessions() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const files = await fs.readdir(this.sessionDataDir);
      const sessionIds = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      return sessionIds;
    } catch (error) {
      logger.error(`Error listing sessions: ${error.message}`, error);
      return [];
    }
  }
  
  /**
   * Get the current session state
   * @returns {Promise<Object>} Session state information
   */
  async getSessionState() {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to get session state: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          sessionId: this.currentSessionId || `fallback-session-${Date.now()}`
        };
      }
    }
    
    try {
      // Get the current session ID and data
      const sessionId = this.currentSessionId;
      
      // Get boundary information from the session boundary manager using lazy loading
      let boundaryInfo = {};
      try {
        const sessionBoundaryManager = await this._getSessionBoundaryManager();
        boundaryInfo = await sessionBoundaryManager.getBoundaryInfo(sessionId);
      } catch (error) {
        logger.warn(`Could not get boundary info: ${error.message}`);
        // Continue with default values if we couldn't get boundary info
      }
      
      // Calculate boundary proximity based on time since last activity
      let boundaryProximity = 'unknown';
      if (boundaryInfo && boundaryInfo.lastActivity) {
        const now = Date.now();
        const timeSinceLastActivity = now - boundaryInfo.lastActivity;
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes, same as in SessionBoundaryManager
        
        // Calculate proximity as a percentage of session timeout
        const proximityPercentage = Math.min(100, (timeSinceLastActivity / sessionTimeout) * 100);
        
        if (proximityPercentage < 25) {
          boundaryProximity = 'far';
        } else if (proximityPercentage < 50) {
          boundaryProximity = 'medium';
        } else if (proximityPercentage < 75) {
          boundaryProximity = 'close';
        } else {
          boundaryProximity = 'imminent';
        }
      }
      
      // Return a standardized session state object
      return {
        success: true,
        sessionId: sessionId,
        previousSessionId: boundaryInfo.previousSessionId || null,
        startTime: boundaryInfo.startTime || new Date().toISOString(),
        lastUpdateTime: boundaryInfo.lastActivity ? new Date(boundaryInfo.lastActivity).toISOString() : new Date().toISOString(),
        boundaryProximity: boundaryProximity,
        dataKeys: Array.from(this.sessionData.keys()),
        continuityScore: this._calculateContinuityScore(boundaryInfo),
        dataSize: this.sessionData.size
      };
    } catch (error) {
      logger.error(`Failed to get session state: ${error.message}`, error);
      return {
        success: false,
        sessionId: this.currentSessionId,
        error: error.message
      };
    }
  }
  
  /**
   * Calculate continuity score based on boundary info
   * @private
   * @param {Object} boundaryInfo - Boundary information
   * @returns {number} Continuity score between 0 and 1
   */
  _calculateContinuityScore(boundaryInfo) {
    if (!boundaryInfo) {
      return 1.0; // Default to perfect continuity if no boundary info
    }
    
    // Calculate based on token boundaries and time since last activity
    let score = 1.0;
    
    // If there are many token boundaries, reduce the score
    if (boundaryInfo.tokenBoundaries && boundaryInfo.tokenBoundaries.length > 0) {
      // More boundaries = lower score, but never below 0.5 just for having boundaries
      score -= Math.min(0.5, boundaryInfo.tokenBoundaries.length * 0.05);
    }
    
    // If last activity was a long time ago, reduce the score
    if (boundaryInfo.lastActivity) {
      const now = Date.now();
      const timeSinceLastActivity = now - boundaryInfo.lastActivity;
      const sessionTimeout = 30 * 60 * 1000; // 30 minutes
      
      // Reduce score based on time elapsed (up to 0.5 reduction)
      score -= Math.min(0.5, (timeSinceLastActivity / sessionTimeout) * 0.5);
    }
    
    return Math.max(0, score); // Ensure score is not negative
  }

  /**
   * List all available sessions
   * @returns {Promise<Array<string>>} Array of session IDs
   */
  async listSessions() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const files = await fs.readdir(this.sessionDataDir);
      const sessionIds = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      return sessionIds;
    } catch (error) {
      logger.error(`Error listing sessions: ${error.message}`, error);
      return [];
    }
  }

  /**
   * Get the current session state
   * @returns {Promise<Object>} Session state information
   */
  async getSessionState() {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to get session state: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          sessionId: this.currentSessionId || `fallback-session-${Date.now()}`
        };
      }
    }
      
    try {
      // Get the current session ID and data
      const sessionId = this.currentSessionId;
      
      // Get boundary information from the session boundary manager using lazy loading
      let boundaryInfo = {};
      try {
        const sessionBoundaryManager = await this._getSessionBoundaryManager();
        boundaryInfo = await sessionBoundaryManager.getBoundaryInfo(sessionId);
      } catch (error) {
        logger.warn(`Could not get boundary info: ${error.message}`);
        // Continue with default values if we couldn't get boundary info
      }
      
      // Calculate boundary proximity based on time since last activity
      let boundaryProximity = 'unknown';
      if (boundaryInfo && boundaryInfo.lastActivity) {
        const now = Date.now();
        const timeSinceLastActivity = now - boundaryInfo.lastActivity;
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes, same as in SessionBoundaryManager
        
        // Calculate proximity as a percentage of session timeout
        const proximityPercentage = Math.min(100, (timeSinceLastActivity / sessionTimeout) * 100);
        
        if (proximityPercentage < 25) {
          boundaryProximity = 'far';
        } else if (proximityPercentage < 50) {
          boundaryProximity = 'medium';
        } else if (proximityPercentage < 75) {
          boundaryProximity = 'close';
        } else {
          boundaryProximity = 'imminent';
        }
      }
      
      // Return a standardized session state object
      return {
        success: true,
        sessionId: sessionId,
        previousSessionId: boundaryInfo.previousSessionId || null,
        startTime: boundaryInfo.startTime || new Date().toISOString(),
        lastUpdateTime: boundaryInfo.lastActivity ? new Date(boundaryInfo.lastActivity).toISOString() : new Date().toISOString(),
        boundaryProximity: boundaryProximity,
        dataKeys: Array.from(this.sessionData.keys()),
        continuityScore: this._calculateContinuityScore(boundaryInfo),
        dataSize: this.sessionData.size
      };
    } catch (error) {
      logger.error(`Failed to get session state: ${error.message}`, error);
      return {
        success: false,
        sessionId: this.currentSessionId,
        error: error.message
      };
    }
  }

/**
* Calculate continuity score based on boundary info
* @private
* @param {Object} boundaryInfo - Boundary information
* @returns {number} Continuity score between 0 and 1
*/
_calculateContinuityScore(boundaryInfo) {
if (!boundaryInfo) {
  return 1.0; // Default to perfect continuity if no boundary info
}
  
// Calculate based on token boundaries and time since last activity
let score = 1.0;
  
// If there are many token boundaries, reduce the score
if (boundaryInfo.tokenBoundaries && boundaryInfo.tokenBoundaries.length > 0) {
  // More boundaries = lower score, but never below 0.5 just for having boundaries
  score -= Math.min(0.5, boundaryInfo.tokenBoundaries.length * 0.05);
}
  
// If last activity was a long time ago, reduce the score
if (boundaryInfo.lastActivity) {
  const now = Date.now();
  const timeSinceLastActivity = now - boundaryInfo.lastActivity;
  const sessionTimeout = 30 * 60 * 1000; // 30 minutes
  
  // Reduce score based on time elapsed (up to 0.5 reduction)
  score -= Math.min(0.5, (timeSinceLastActivity / sessionTimeout) * 0.5);
}
  
return Math.max(0, score); // Ensure score is not negative
}

/**
* Get service status
* @returns {Object} Service status
*/
getStatus() {
return {
  initialized: this.initialized,
  initializing: this.initializing,
  currentSessionId: this.currentSessionId,
  sessionDataCount: this.sessionData.size,
  lastError: this.lastError ? this.lastError.message : null,
  timestamp: Date.now()
};
}
}

// Create singleton instance
const sessionAwarenessAdapter = new SessionAwarenessAdapter();

/**
 * Get the current session state
 * This is a standalone function that delegates to the SessionAwarenessAdapter instance
 * to avoid code duplication and ensure consistent behavior
 * 
 * @returns {Promise<Object>} Session state information
 */
async function getSessionState() {
  return sessionAwarenessAdapter.getSessionState();
}

module.exports = {
  sessionAwarenessAdapter,
  getSessionState,
  // Export the methods directly for easier access by the CrossSessionAwarenessTest
  createSessionBoundary: (...args) => sessionAwarenessAdapter.createSessionBoundary(...args),
  getSessionData: (...args) => sessionAwarenessAdapter.getSessionData(...args),
  setSessionData: (...args) => sessionAwarenessAdapter.setSessionData(...args),
  getCurrentSessionId: (...args) => sessionAwarenessAdapter.getCurrentSessionId(...args)
};
