/**
 * Session Boundary Manager
 * 
 * This service detects and manages token session boundaries, enabling Leo to maintain
 * cognitive continuity across token sessions. It's a critical component for enabling
 * meta-programming capabilities and validating Leo's core value proposition.
 *
 * ARCHITECTURAL NOTE: This module uses a singleton factory pattern with private state
 * to prevent initialization issues and the "Assignment to constant variable" error.
 * All state is encapsulated within the closure to avoid global state conflicts.
 */

const { createComponentLogger } = require('../utils/logger');
const fileUtils = require('../utils/file-utils');
const path = require('path');
const fs = require('fs').promises;
const { Mutex } = require('async-mutex');
const lockfile = require('proper-lockfile');
const { promisify } = require('util');
const setImmediatePromise = promisify(setImmediate);

// Component name for logging and events
const COMPONENT_NAME = 'session-boundary-manager';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Session Boundary Manager Factory
 * Creates a singleton instance with properly encapsulated private state
 */
function createSessionBoundaryManager() {
  // Create mutexes for thread-safe operations
  const sessionStateMutex = new Mutex();
  const fileOperationMutex = new Mutex();
  
  // Private instance state - inaccessible from outside this closure
  let instance = null;
  let isInitialized = false;
  let isInitializing = false;
  let initializationPromise = null;
  
  // Private configuration state
  let config = null;
  
  // Private operational state
  let sessionIndex = [];
  let currentSession = null;
  let tokenEstimate = 0;
  let boundaryCheckInterval = null;
  let continuityTokens = new Map();
  
  // Private injected dependencies
  let injectedEventBus = null;
  let injectedConfigManager = null;
  let injectedSemanticContextManager = null;
  let injectedContextPreservationSystem = null;
  
  /**
   * Safe event emitter that won't throw if the event bus is unavailable
   * This follows Leo's standardized adapter pattern for event emission
   * @param {string} eventName - Name of the event to emit
   * @param {Object} data - Event data
   * @returns {boolean} Success status
   */
  let safeEmitEvent = (eventName, data) => {
    try {
      if (injectedEventBus && typeof injectedEventBus.emit === 'function') {
        injectedEventBus.emit(eventName, data);
        return true;
      } else {
        // Log at debug level to avoid spamming logs
        logger.debug(`Event ${eventName} not emitted: event bus not initialized`);
        return false;
      }
    } catch (error) {
      logger.warn(`Failed to emit event ${eventName}: ${error.message}`);
      return false;
    }
  };
  
  // Optional dependencies with fallbacks
  let conversationMemoryManager;
  let adaptiveContextSelector;
  
  /**
   * Load optional dependencies with fallbacks
   * @private
   */
  function loadOptionalDependencies() {
    try {
      conversationMemoryManager = require('./conversation-memory-manager');
    } catch (error) {
      logger.warn('Conversation Memory Manager not available, some features will be limited');
      conversationMemoryManager = {
        isInitialized: false,
        initialize: async () => ({ success: false, error: 'Not implemented' }),
        generateEnhancedContext: async () => ({ success: false, error: 'Not implemented', enhancedContext: '' })
      };
    }

    try {
      adaptiveContextSelector = require('../adapters/adaptive-context-selector-adapter');
    } catch (error) {
      logger.warn('Adaptive Context Selector Adapter not available, some features will be limited');
      adaptiveContextSelector = {
        isInitialized: false,
        initialize: async () => ({ success: false, error: 'Not implemented' }),
        selectContext: async () => ({ success: false, error: 'Not implemented', context: '' })
      };
    }
  }
  
  /**
   * Get default configuration
   * @private
   * @returns {Object} Default configuration
   */
  function getDefaultConfig() {
    return {
      SESSION_DIR: process.env.LEO_SESSION_DIR || path.join(process.cwd(), 'data', 'sessions'),
      SESSION_INDEX_FILE: 'session-index.jsonl',
      TOKEN_LIMIT: 8000,
      TOKEN_WARNING_THRESHOLD: 0.8,
      TOKEN_CRITICAL_THRESHOLD: 0.9,
      ENABLE_BOUNDARY_DETECTION: true,
      ENABLE_STATE_PERSISTENCE: true,
      BOUNDARY_CHECK_INTERVAL_MS: 60000, // 1 minute
      MAX_SESSION_HISTORY: 20,
      META_PROGRAMMING_PRIORITY: true
    };
  }

  /**
   * Initialize the session boundary manager
   * This implementation uses a singleton pattern to prevent multiple initializations
   * and properly handles dependency injection
   * 
   * @param {Object} options - Configuration options
   * @returns {Promise<boolean>} Success status
   */
  async function initialize(options = {}) {
    // Use a mutex to ensure atomic initialization state checks and updates
    return await sessionStateMutex.runExclusive(async () => {
      // If already initialized, return success immediately
      if (isInitialized) {
        logger.info('Session boundary manager already initialized');
        return true;
      }
      
      // If initialization is in progress, wait for it to complete
      if (isInitializing && initializationPromise) {
        logger.info('Session boundary manager initialization already in progress, waiting...');
        try {
          // Release the mutex while waiting for the promise to complete
          // This allows other operations to proceed while we wait
          const result = await sessionStateMutex.release(() => initializationPromise);
          return result;
        } catch (error) {
          // If waiting for existing initialization fails, we'll try again
          logger.warn(`Previous initialization attempt failed: ${error.message}. Retrying...`);
          // Reset initialization state to allow a retry
          isInitializing = false;
          initializationPromise = null;
        }
      }
      
      // Set initialization flag and create promise
      isInitializing = true;
      
      // Create a new promise that properly handles state management
      initializationPromise = _initialize(options)
        .then(result => {
          // Re-acquire mutex to update state atomically
          return sessionStateMutex.runExclusive(() => {
            // Only set isInitialized if initialization was successful
            isInitialized = result === true;
            isInitializing = false;
            return result;
          });
        })
        .catch(error => {
          // Re-acquire mutex to update state atomically
          return sessionStateMutex.runExclusive(() => {
            // Reset flags on error
            isInitialized = false;
            isInitializing = false;
            initializationPromise = null;
            throw error; // Re-throw to propagate to caller
          });
        });
      
      return initializationPromise;
    });
  }
  
  /**
   * Internal initialization implementation
   * @private
   * @param {Object} options - Configuration options
   * @returns {Promise<boolean>} Success status
   */
  async function _initialize(options = {}) {
    try {
      logger.info('Initializing session boundary manager');
      
      // Load optional dependencies
      loadOptionalDependencies();
      
      // Extract injected dependencies from options
      injectedConfigManager = options.configManager;
      injectedEventBus = options.eventBus;
      injectedSemanticContextManager = options.semanticContextManager;
      injectedContextPreservationSystem = options.contextPreservationSystem;
      
      // Verify and register event bus dependency
      if (injectedEventBus) {
        if (typeof injectedEventBus.emit !== 'function') {
          logger.warn('Injected event bus does not have an emit method, using fallback');
        } else {
          logger.debug('Using injected event bus');
          // Event bus is valid, emit initialization event
          safeEmitEvent('session_boundary_manager:initializing', {
            component: COMPONENT_NAME,
            timestamp: Date.now()
          });
        }
      } else {
        logger.warn('No event bus injected, events will be logged but not emitted');
      }
      
      // Get event bus - either injected or required, with safe event emission
      const eventBus = injectedEventBus || require('../utils/event-bus');
      
      // Create a safe event emitter that won't throw if the event bus is unavailable
      safeEmitEvent = (eventName, data) => {
        try {
          if (eventBus && typeof eventBus.emit === 'function') {
            eventBus.emit(eventName, data);
            return true;
          }
        } catch (error) {
          logger.warn(`Failed to emit event ${eventName}: ${error.message}`);
        }
        return false;
      };
      
      // Initialize configuration with defaults
      config = getDefaultConfig();
      
      // Check if a complete config object was provided
      if (options.config) {
        // Map provided config properties to our internal config format
        if (options.config.tokenLimit !== undefined) config.TOKEN_LIMIT = options.config.tokenLimit;
        if (options.config.tokenWarningThreshold !== undefined) config.TOKEN_WARNING_THRESHOLD = options.config.tokenWarningThreshold;
        if (options.config.tokenCriticalThreshold !== undefined) config.TOKEN_CRITICAL_THRESHOLD = options.config.tokenCriticalThreshold;
        if (options.config.sessionDirectory) config.SESSION_DIR = options.config.sessionDirectory;
        if (options.config.enableVerboseLogging !== undefined) config.ENABLE_VERBOSE_LOGGING = options.config.enableVerboseLogging;
        if (options.config.preserveContextOnBoundary !== undefined) config.PRESERVE_CONTEXT_ON_BOUNDARY = options.config.preserveContextOnBoundary;
        
        // Apply any other config properties
        for (const key in options.config) {
          if (!['tokenLimit', 'tokenWarningThreshold', 'tokenCriticalThreshold', 'sessionDirectory', 
               'enableVerboseLogging', 'preserveContextOnBoundary'].includes(key)) {
            config[key] = options.config[key];
          }
        }
      } else {
        // Fallback to individual options if no config object
        if (options.tokenLimit !== undefined) config.TOKEN_LIMIT = options.tokenLimit;
        else if (injectedConfigManager?.get('tokenLimit')) config.TOKEN_LIMIT = injectedConfigManager.get('tokenLimit');
        
        if (options.tokenWarningThreshold !== undefined) config.TOKEN_WARNING_THRESHOLD = options.tokenWarningThreshold;
        else if (injectedConfigManager?.get('tokenWarningThreshold')) config.TOKEN_WARNING_THRESHOLD = injectedConfigManager.get('tokenWarningThreshold');
        
        if (options.tokenCriticalThreshold !== undefined) config.TOKEN_CRITICAL_THRESHOLD = options.tokenCriticalThreshold;
        else if (injectedConfigManager?.get('tokenCriticalThreshold')) config.TOKEN_CRITICAL_THRESHOLD = injectedConfigManager.get('tokenCriticalThreshold');
        
        if (options.sessionDirectory) config.SESSION_DIR = options.sessionDirectory;
        else if (injectedConfigManager?.get('sessionDirectoryPath')) config.SESSION_DIR = injectedConfigManager.get('sessionDirectoryPath');
      }
      
      // Ensure required directories exist
      await ensureDirectoriesExist();
      
      // Load session index
      await loadSessionIndex();
      
      // Create a new session
      currentSession = createNewSession();
      
      // Set up boundary check interval with more frequent checks
      if (config.ENABLE_BOUNDARY_DETECTION) {
        // Use a shorter interval for more responsive boundary detection
        const checkInterval = options.boundaryCheckIntervalMs || config.BOUNDARY_CHECK_INTERVAL_MS || 30000; // 30 seconds default
        boundaryCheckInterval = setInterval(checkBoundaryProximity, checkInterval);
        logger.info(`Boundary detection enabled with check interval of ${checkInterval}ms`);
      }
      
      // Initialize dependencies if needed
      if (!conversationMemoryManager.isInitialized) {
        await conversationMemoryManager.initialize();
      }
      
      if (!adaptiveContextSelector.isInitialized) {
        await adaptiveContextSelector.initialize();
      }
      
      // Register event handlers
      eventBus.on('conversation:message', handleConversationMessage, COMPONENT_NAME);
      eventBus.on('code:changed', handleCodeChanged, COMPONENT_NAME);
      
      // Register additional event handlers for token boundary detection
      eventBus.on('token-boundary-detected', handleTokenBoundary, COMPONENT_NAME);
      eventBus.on('checkpoint-detected', handleCheckpointDetected, COMPONENT_NAME);
      eventBus.on('ephemeral-message-detected', handleEphemeralMessageDetected, COMPONENT_NAME);
      
      // Set initialization state
      isInitialized = true;
      isInitializing = false;
      
      // Emit initialization event with enhanced information
      eventBus.emit('component:initialized', {
        component: COMPONENT_NAME,
        timestamp: Date.now(),
        config: {
          tokenLimit: config.TOKEN_LIMIT,
          warningThreshold: config.TOKEN_WARNING_THRESHOLD,
          criticalThreshold: config.TOKEN_CRITICAL_THRESHOLD
        }
      });
      
      logger.info(`Session boundary manager initialized successfully with token limit ${config.TOKEN_LIMIT}`);
      return true;
    } catch (error) {
      logger.error(`Error initializing session boundary manager: ${error.message}`);
      logger.debug(error.stack); // Log stack trace for debugging
      
      // We don't reset isInitializing here as it's handled in the promise chain
      
      // Safely emit error event using our safe emitter
      safeEmitEvent('session_boundary_manager:error', {
        component: COMPONENT_NAME,
        message: 'Failed to initialize session boundary manager',
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });
      
      return false;
    }
  }

  /**
   * Ensure required directories exist
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async function ensureDirectoriesExist() {
    try {
      // Ensure session directory exists
      fileUtils.ensureDirectoryExists(config.SESSION_DIR);
      
      return true;
    } catch (error) {
      logger.error(`Error ensuring directories exist: ${error.message}`);
      return false;
    }
  }

  /**
   * Load session index from disk
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async function loadSessionIndex() {
    try {
      const indexPath = path.join(config.SESSION_DIR, config.SESSION_INDEX_FILE);
      
      if (!fileUtils.ensureDirectoryExists(path.dirname(indexPath))) {
        logger.error('Failed to create directory for session index');
        return false;
      }
      
      // Check if index file exists
      try {
        await fs.access(indexPath);
      } catch (error) {
        // File doesn't exist, create empty index
        sessionIndex = [];
        return true;
      }
      
      // Read and parse index file
      const data = await fs.readFile(indexPath, 'utf8');
      sessionIndex = data
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (error) {
            logger.warn(`Invalid JSON in session index: ${line}`);
            return null;
          }
        })
        .filter(item => item !== null);
      
      logger.info(`Loaded ${sessionIndex.length} session records from index`);
      return true;
    } catch (error) {
      logger.error(`Error loading session index: ${error.message}`);
      sessionIndex = [];
      return false;
    }
  }

/**
 * Save session index to disk with proper file locking and atomic writes
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function saveSessionIndex() {
  return fileOperationMutex.runExclusive(async () => {
    try {
      const indexPath = path.join(config.SESSION_DIR, config.SESSION_INDEX_FILE);
      
      // Format each session as a JSON line
      const lines = sessionIndex.map(session => JSON.stringify(session));
      const data = lines.join('\n');
      
      // Acquire a lock on the file to prevent concurrent writes
      let release = null;
      try {
        release = await lockfile.lock(indexPath, { 
          retries: 5,
          retryWait: 100,
          stale: 10000 // Consider lock stale after 10 seconds
        });
      } catch (lockError) {
        logger.warn(`Could not acquire lock for session index: ${lockError.message}`);
        // Continue without lock as a fallback
      }
      
      try {
        // Write to file atomically by writing to temp file first
        const tempPath = `${indexPath}.tmp`;
        await fs.writeFile(tempPath, data, 'utf8');
        await fs.rename(tempPath, indexPath);
        
        logger.debug(`Session index saved with ${sessionIndex.length} entries`);
        return true;
      } finally {
        // Release the lock if we acquired it
        if (release) await release();
      }
    } catch (error) {
      logger.error(`Error saving session index: ${error.message}`);
      safeEmitEvent('session_boundary_manager:file_error', {
        operation: 'saveSessionIndex',
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  });
}

/**
 * Create a new session
 * @returns {Object} New session object
 * @private
 */
function createNewSession() {
  const session = {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    tokenCount: 0,
    messageCount: 0,
    continuityToken: generateContinuityToken(),
    task: {
      description: '',
      progress: 0,
      approach: [],
      decisions: [],
      files: [],
      completedSteps: [],
      nextSteps: []
    },
    metaProgramming: {
      isMetaProgramming: false,
      feature: '',
      purpose: '',
      principles: [],
      integrations: [],
      benefits: [],
      limitations: []
    }
  };
  
  // Add to index
  sessionIndex.push({
    id: session.id,
    startTime: session.startTime,
    lastUpdateTime: session.lastUpdateTime,
    filePath: `${session.id}.json`
  });
  
  // Save index
  saveSessionIndex();
  
  // Store continuity token
  continuityTokens.set(session.continuityToken, session.id);
  
  logger.info(`Created new session: ${session.id}`);
  
  // Emit event
  eventBus.emit('session:created', {
    component: COMPONENT_NAME,
    sessionId: session.id,
    timestamp: session.startTime
  });
  
  return session;
}

/**
 * Generate a unique continuity token with enhanced entropy for critical boundaries
 * @param {boolean} isCritical - Whether this is a critical boundary
 * @returns {string} Continuity token
 * @private
 */
function generateContinuityToken(isCritical = false) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000); // Increased entropy
  const sessionId = currentSession ? currentSession.id : 'unknown';
  const criticalFlag = isCritical ? 'CRIT' : 'STD';
  
  // For critical boundaries, add more entropy sources
  if (isCritical) {
    const memUsage = process.memoryUsage().rss % 10000;
    const extraEntropy = Buffer.from(`${Date.now()}-${random}-${memUsage}`).toString('base64').substring(0, 8);
    return `LEO-${criticalFlag}-${timestamp}-${random}-${extraEntropy}-${sessionId.substring(0, 8)}`;
  }
  
  return `LEO-${criticalFlag}-${timestamp}-${random}-${sessionId.substring(0, 8)}`;
}

/**
 * Handle conversation message event
 * @param {Object} data - Event data
 * @private
 */
function handleConversationMessage(data) {
  if (!isInitialized || !currentSession) {
    return;
  }
  
  // Update session
  currentSession.lastUpdateTime = Date.now();
  currentSession.messageCount++;
  
  // Estimate tokens from message
  const messageTokens = estimateTokens(data.message || '');
  currentSession.tokenCount += messageTokens;
  tokenEstimate += messageTokens;
  
  // Check for continuity token in message
  if (data.message && typeof data.message === 'string') {
    checkForContinuityToken(data.message);
  }
  
  // Check boundary proximity
  checkBoundaryProximity();
}

/**
 * Handle code changed event
 * @param {Object} data - Event data
 * @private
 */
function handleCodeChanged(data) {
  if (!isInitialized || !currentSession) {
    return;
  }
  
  // Update session
  currentSession.lastUpdateTime = Date.now();
  
  // Update task files if this is a meta-programming session
  if (currentSession.metaProgramming.isMetaProgramming && data.filePath) {
    // Check if file is already in the list
    const fileIndex = currentSession.task.files.findIndex(f => f.path === data.filePath);
    
    if (fileIndex === -1) {
      // Add new file
      currentSession.task.files.push({
        path: data.filePath,
        description: data.description || 'Modified file'
      });
    }
  }
}

/**
 * Check for continuity token in message
 * @param {string} message - Message text
 * @returns {boolean} True if token was found
 * @private
 */
function checkForContinuityToken(message) {
  // Look for any stored continuity tokens in the message
  for (const [token, tokenData] of continuityTokens.entries()) {
    if (message.includes(token)) {
      const sessionId = tokenData.sessionId;
      logger.info(`Continuity token found: ${token} for session ${sessionId}`);
      
      // If this is not the current session, we've detected a boundary crossing
      if (sessionId !== currentSession.id) {
        logger.info(`Detected session boundary crossing from ${sessionId} to ${currentSession.id}`);
        
        // Emit boundary crossing event
        eventBus.emit('session:boundary:crossed', {
          component: COMPONENT_NAME,
          previousSessionId: sessionId,
          currentSessionId: currentSession.id,
          timestamp: Date.now()
        });
        
        // Load previous session state
        loadSessionState(sessionId).then(previousSession => {
          if (previousSession) {
            // Apply continuation protocol
            applyContinuationProtocol(previousSession);
          }
        }).catch(error => {
          logger.error(`Failed to load previous session state: ${error.message}`);
        });
      }
      
      return true;
    }
  }
  
  return false;
}

/**
 * Estimate tokens in text
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 * @private
 */
function estimateTokens(text) {
  if (!text) return 0;
  
  // Simple estimation: ~4 characters per token for English text
  // This is a rough approximation; for production, use a proper tokenizer
  return Math.ceil(text.length / 4);
}

/**
 * Check boundary proximity and take action if needed
 * Enhanced for MVL to provide more proactive boundary detection with finer granularity
 * and development-focused checkpoints
 * 
 * @returns {Object} Boundary proximity status
 * @private
 */
/**
 * Check boundary proximity with thread-safe access to session state
 * @returns {Object} Boundary proximity status
 */
async function checkBoundaryProximity() {
  // Quick check without mutex to avoid unnecessary locking
  if (!isInitialized) {
    return { isApproaching: false, isCritical: false, estimatedTokensRemaining: config.TOKEN_LIMIT };
  }
  
  // Use mutex to ensure thread-safe access to session state
  return await sessionStateMutex.runExclusive(() => {
    if (!currentSession) {
      return { isApproaching: false, isCritical: false, estimatedTokensRemaining: config.TOKEN_LIMIT };
    }
    
    // Enhanced token estimation with variable safety margins based on activity type
    const activityType = currentSession.task?.type || 'development';
    // Apply tighter thresholds for development tasks to ensure context preservation
    const safetyMargin = activityType === 'development' ? 1.2 : 1.0;
    const adjustedTokenEstimate = Math.ceil(tokenEstimate * safetyMargin);
    
    const proximityRatio = adjustedTokenEstimate / config.TOKEN_LIMIT;
    const result = {
      isApproaching: proximityRatio > config.TOKEN_WARNING_THRESHOLD,
      isCritical: proximityRatio > config.TOKEN_CRITICAL_THRESHOLD,
      // Add intermediate warning level for more granular alerts
      isIntermediate: proximityRatio > (config.TOKEN_WARNING_THRESHOLD + config.TOKEN_CRITICAL_THRESHOLD) / 2,
      estimatedTokensRemaining: Math.max(0, config.TOKEN_LIMIT - adjustedTokenEstimate),
      adjustedTokensRemaining: Math.max(0, config.TOKEN_LIMIT - adjustedTokenEstimate),
      estimatedTokensUsed: tokenEstimate,
      adjustedTokensUsed: adjustedTokenEstimate,
      tokenLimit: config.TOKEN_LIMIT,
      activityType,
      lastCheckTime: Date.now()
    };
  
    // Take action based on proximity with graduated responses
    if (result.isCritical && config.ENABLE_STATE_PERSISTENCE) {
      // Create high-priority boundary marker for critical boundaries
      // We'll call createBoundaryMarker outside the mutex to avoid nested locks
      const needsCriticalMarker = true;
      
      // Use safe event emission to avoid direct event bus dependency
      safeEmitEvent('session_boundary_manager:boundary:critical', {
        component: COMPONENT_NAME,
        sessionId: currentSession.id,
        estimatedTokensRemaining: result.estimatedTokensRemaining,
        timestamp: Date.now(),
        priority: 'high',
        requiresAction: true
      });
      
      // Schedule the boundary marker creation outside the mutex
      setImmediate(() => createBoundaryMarker(true));
      
    } else if (result.isIntermediate && config.ENABLE_STATE_PERSISTENCE) {
      // At intermediate threshold, create a precautionary boundary marker
      // but don't force immediate session boundary
      
      // Use safe event emission to avoid direct event bus dependency
      safeEmitEvent('session_boundary_manager:boundary:intermediate', {
        component: COMPONENT_NAME,
        sessionId: currentSession.id,
        estimatedTokensRemaining: result.estimatedTokensRemaining,
        timestamp: Date.now(),
        priority: 'medium',
        requiresAction: false
      });
      
      // Schedule the boundary marker creation outside the mutex
      setImmediate(() => createBoundaryMarker(false));
      
    } else if (result.isApproaching) {
      // At early warning threshold, start preparing but don't create marker yet
      // Pre-compute some state for faster checkpoint creation later
      if (config.ENABLE_STATE_PERSISTENCE && config.META_PROGRAMMING_PRIORITY) {
        // Schedule state preparation outside the mutex
        setImmediate(() => prepareSessionState());
      }
    
    // Emit warning event
    safeEmitEvent('session_boundary_manager:boundary:approaching', {
      component: COMPONENT_NAME,
      sessionId: currentSession.id,
      estimatedTokensRemaining: result.estimatedTokensRemaining,
      timestamp: Date.now(),
      priority: 'low',
      requiresAction: false
    });
  }
  
  return result;
}

/**
 * Handle token boundary detection event
 * @param {Object} boundaryInfo - Information about the detected boundary
{{ ... }}
 * @returns {Promise<Object>} Processing result
 * @private
 */
async function handleTokenBoundary(boundaryInfo) {
  if (!isInitialized) {
    logger.warn('Received token boundary event but session boundary manager is not initialized');
    return { success: false, error: 'Not initialized' };
  }
  
  try {
    logger.info(`Token boundary detected: ${JSON.stringify(boundaryInfo)}`);
    
    // Create a new session for the next token
    const previousSession = currentSession;
    currentSession = createNewSession();
    
    // Record boundary crossing in session index
    await updateSessionIndex({
      type: 'boundary_crossing',
      previousSessionId: previousSession.id,
      newSessionId: currentSession.id,
      boundaryId: boundaryInfo.boundaryId || boundaryInfo.checkpointId || 'unknown',
      timestamp: Date.now()
    });
    
    // Reset token estimate for new session
    tokenEstimate = 0;
    
    // Preserve context by serializing current session state
    await serializeSessionState(true);
    
    // Emit event for new session
    eventBus.emit('session:new', {
      sessionId: currentSession.id,
      previousSessionId: previousSession.id,
      boundaryInfo,
      timestamp: Date.now()
    });
    
    logger.info(`Created new session ${currentSession.id} after token boundary`);
    
    return {
      success: true,
      sessionId: currentSession.id,
      message: 'Token boundary handled successfully'
    };
  } catch (error) {
    logger.error(`Error handling token boundary: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle checkpoint detection event
 * @param {Object} checkpointInfo - Information about the detected checkpoint
 * @returns {Promise<Object>} Processing result
 * @private
 */
async function handleCheckpointDetected(checkpointInfo) {
  try {
    logger.info(`Checkpoint detected: ${JSON.stringify(checkpointInfo)}`);
    
    // Treat checkpoints as token boundaries
    return handleTokenBoundary({
      ...checkpointInfo,
      source: 'checkpoint'
    });
  } catch (error) {
    logger.error(`Error handling checkpoint: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle ephemeral message detection event
 * @param {Object} messageInfo - Information about the ephemeral message
 * @returns {Promise<Object>} Processing result
 * @private
 */
async function handleEphemeralMessageDetected(messageInfo) {
  try {
    logger.info(`Ephemeral message detected: ${JSON.stringify(messageInfo)}`);
    
    // Ephemeral messages often indicate token boundaries
    return handleTokenBoundary({
      ...messageInfo,
      source: 'ephemeral_message'
    });
  } catch (error) {
    logger.error(`Error handling ephemeral message: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update session index with new information
 * @param {Object} updateInfo - Update information
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function updateSessionIndex(updateInfo) {
  try {
    // Add timestamp if not provided
    if (!updateInfo.timestamp) {
      updateInfo.timestamp = Date.now();
    }
    
    // Add update to index
    sessionIndex.push(updateInfo);
    
    // Trim index if it gets too large
    if (sessionIndex.length > CONFIG.MAX_SESSION_HISTORY) {
      sessionIndex = sessionIndex.slice(-CONFIG.MAX_SESSION_HISTORY);
    }
    
    // Save index to disk
    await saveSessionIndex();
    
    return true;
  } catch (error) {
    logger.error(`Error updating session index: ${error.message}`);
    return false;
  }
}

/**
 * Prepare session state in advance to reduce critical path latency
 * @returns {Promise<Object>} Preliminary session state
 * @private
 */
async function prepareSessionState() {
  if (!currentSession) return null;
  
  try {
    // Begin async collection of state data in background
    // This reduces the time needed when actually creating the boundary marker
    currentSession.preparedState = {
      timestamp: Date.now(),
      preliminaryState: await collectPreliminaryState()
    };
    
    return currentSession.preparedState;
  } catch (error) {
    logger.warn(`Error preparing session state: ${error.message}`);
    return null;
  }
}

/**
 * Collect comprehensive preliminary session state data in background
 * Optimized for development context and fast boundary transitions
 * @returns {Promise<Object>} Enhanced state data
 * @private
 */
async function collectPreliminaryState() {
  if (!currentSession) return { error: 'No active session' };
  
  try {
    // Start with basic context
    const preliminaryState = {
      collected: Date.now(),
      systemTelemetry: {
        memoryUsage: process.memoryUsage(),
        timestamp: Date.now(),
        uptime: process.uptime()
      }
    };
    
    // Detect if this is a development context
    const isDevelopmentContext = CONFIG.META_PROGRAMMING_PRIORITY || 
                               (currentSession.task?.type === 'development');
    
    // Standard task context (always collected)
    preliminaryState.taskContext = {
      id: currentSession.task?.id,
      description: currentSession.task?.description,
      progress: currentSession.task?.progress || 0,
      type: currentSession.task?.type || 'general',
      lastUpdated: Date.now()
    };
    
    // If development context, collect enhanced development data
    if (isDevelopmentContext) {
      // Fetch currently active files from the task
      const activeFiles = currentSession.task?.files || [];
      
      // Get current implementation phase
      const implementationPhase = currentSession.task?.currentPhase || 
                                 currentSession.metaProgramming?.currentPhase || 
                                 'unknown';
      
      // Build development context
      preliminaryState.developmentContext = {
        timestamp: Date.now(),
        codebase: {
          activeFiles: activeFiles.slice(0, 10), // Limit to 10 most important files
          recentChanges: currentSession.task?.recentChanges || [],
          rootDirectory: currentSession.task?.codebasePath || process.cwd()
        },
        implementation: {
          phase: implementationPhase,
          approach: currentSession.task?.approach || [],
          status: currentSession.task?.progress || 0,
          focusArea: currentSession.task?.focusArea || 'general'
        },
        architecture: currentSession.task?.architecture || {
          pattern: 'unknown',
          paradigm: 'unknown'
        },
        context: {
          recentDecisions: (currentSession.task?.decisions || []).slice(0, 5),
          nextSteps: (currentSession.task?.nextSteps || []).slice(0, 5),
          completedSteps: (currentSession.task?.completedSteps || []).slice(0, 5)
        }
      };
      
      // Add meta-programming specific context if applicable
      if (currentSession.metaProgramming?.isMetaProgramming) {
        preliminaryState.metaProgrammingContext = {
          timestamp: Date.now(),
          feature: currentSession.metaProgramming?.feature || 'unknown',
          purpose: currentSession.metaProgramming?.purpose || 'unknown',
          principles: currentSession.metaProgramming?.principles || [],
          integrations: currentSession.metaProgramming?.integrations || []
        };
      }
      
      // Try to get light-weight context from conversation memory manager asynchronously
      // This provides a fallback context source if we hit a token boundary unexpectedly
      try {
        if (conversationMemoryManager.isInitialized) {
          // Use a non-blocking approach with a short timeout to avoid delaying the preparation
          const contextPromise = Promise.race([
            conversationMemoryManager.generateEnhancedContext(
              currentSession.task?.description,
              { 
                prioritizeMetaProgramming: isDevelopmentContext,
                lightweight: true, // Request lightweight context for faster response
                timeout: 1000 // 1 second timeout
              }
            ),
            new Promise(resolve => setTimeout(() => resolve({ success: false, error: 'Timeout' }), 1000))
          ]);
          
          const lightContext = await contextPromise;
          if (lightContext && lightContext.success) {
            preliminaryState.lightweightContext = {
              content: lightContext.enhancedContext,
              timestamp: Date.now(),
              source: 'conversation_memory_quick'
            };
          }
        }
      } catch (error) {
        // Failing to get lightweight context is non-critical
        // Just log and continue without it
        logger.debug(`Lightweight context collection skipped: ${error.message}`);
      }
    }
    
    return preliminaryState;
  } catch (error) {
    logger.warn(`Error collecting preliminary state: ${error.message}`);
    // Return minimal state even on error to ensure some context is preserved
    return {
      collected: Date.now(),
      error: error.message,
      minimal: true,
      taskDescription: currentSession.task?.description || 'Unknown task'
    };
  }
}

/**
 * Create boundary marker with enhanced development context preservation
 * @param {boolean} isCritical - Whether this is a critical boundary that requires immediate attention
 * @returns {Promise<string>} Marker file path
 * @private
 */
async function createBoundaryMarker(isCritical = false) {
  if (!isInitialized || !currentSession) {
    return null;
  }
  
  try {
    // Use pre-computed state if available to reduce latency at critical boundaries
    const usePreparedState = currentSession.preparedState && 
      (Date.now() - currentSession.preparedState.timestamp < 60000); // Use if less than 1 minute old
    
    // Serialize current session state with development focus
    const sessionState = await serializeSessionState(isCritical);
    
    // Save state to file with priority markers for faster retrieval
    const priorityPrefix = isCritical ? 'critical_' : '';
    const filePath = path.join(CONFIG.SESSION_DIR, `${priorityPrefix}${currentSession.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(sessionState, null, 2), 'utf8');
    
    // If this is a development session, also save a separate development-focused context
    if (currentSession.task?.type === 'development' || CONFIG.META_PROGRAMMING_PRIORITY) {
      const devContextPath = path.join(CONFIG.SESSION_DIR, `dev_context_${currentSession.id}.json`);
      const devContext = extractDevelopmentContext(sessionState);
      await fs.writeFile(devContextPath, JSON.stringify(devContext, null, 2), 'utf8');
    }
    
    // Generate new continuity token with higher entropy for better uniqueness
    const continuityToken = generateContinuityToken(isCritical);
    currentSession.continuityToken = continuityToken;
    
    // Store continuity token with additional metadata
    continuityTokens.set(continuityToken, {
      sessionId: currentSession.id,
      timestamp: Date.now(),
      isCritical,
      taskType: currentSession.task?.type || 'general'
    });
    
    // Update session index with enhanced metadata
    const indexEntry = sessionIndex.find(entry => entry.id === currentSession.id);
    if (indexEntry) {
      indexEntry.lastUpdateTime = Date.now();
      indexEntry.continuityToken = continuityToken;
      indexEntry.isCritical = isCritical;
      indexEntry.boundaryType = isCritical ? 'critical' : 'standard';
      indexEntry.taskStatus = extractTaskStatusSummary(currentSession.task);
    }
    await saveSessionIndex();
    
    // Create enhanced marker text with development-focused information
    const marker = generateEnhancedMarkerText(continuityToken, isCritical);
    
    // Emit boundary marker event with enhanced metadata
    eventBus.emit('session:boundary:marker', {
      component: COMPONENT_NAME,
      sessionId: currentSession.id,
      marker,
      filePath,
      timestamp: Date.now(),
      isCritical,
      continuityToken,
      taskType: currentSession.task?.type || 'general',
      developmentContext: currentSession.task?.type === 'development'
    });
    
    logger.info(`Created ${isCritical ? 'CRITICAL ' : ''}boundary marker for session ${currentSession.id}`);
    return filePath;
  } catch (error) {
    logger.error(`Error creating boundary marker: ${error.message}`);
    return null;
  }
}

/**
 * Extract development-focused context from session state
 * @param {Object} sessionState - Full session state
 * @returns {Object} Development context
 * @private
 */
function extractDevelopmentContext(sessionState) {
  if (!sessionState || !sessionState.task) {
    return { type: 'empty_development_context' };
  }
  
  return {
    type: 'development_context',
    timestamp: Date.now(),
    sessionId: sessionState.id,
    task: {
      description: sessionState.task.description,
      progress: sessionState.task.progress,
      approach: sessionState.task.approach,
      currentImplementationPhase: sessionState.task.currentPhase,
      remainingWork: sessionState.task.nextSteps
    },
    codebase: {
      activeFiles: sessionState.task.files,
      currentFileContext: sessionState.task.currentFile,
      recentChanges: sessionState.task.recentChanges || []
    },
    decisions: sessionState.task.decisions,
    architecture: sessionState.task.architecture || {},
    nextSteps: sessionState.task.nextSteps
  };
}

/**
 * Extract task status summary for session index
 * @param {Object} task - Task object
 * @returns {Object} Task status summary
 * @private
 */
function extractTaskStatusSummary(task) {
  if (!task) {
    return { available: false };
  }
  
  return {
    available: true,
    description: task.description,
    progress: task.progress,
    phase: task.currentPhase,
    timestamp: Date.now()
  };
}

/**
 * Generate enhanced marker text with development focus
 * @param {string} continuityToken - The continuity token
 * @param {boolean} isCritical - Whether this is a critical boundary
 * @returns {string} Enhanced marker text
 * @private
 */
function generateEnhancedMarkerText(continuityToken, isCritical) {
  try {
    const task = currentSession?.task || {};
    const timestamp = new Date().toISOString();
    const criticality = isCritical ? 'CRITICAL' : 'STANDARD';
    const developmentFocus = task.type === 'development' || CONFIG.META_PROGRAMMING_PRIORITY;
    
    let marker = `--- LEO ${criticality} SESSION BOUNDARY MARKER ${timestamp}\n`;
    marker += `Session ID: ${currentSession?.id || 'unknown'}\n`;
    marker += `Task Context: ${task.description || 'No active task'}\n`;
    marker += `Implementation Status: ${Math.round((task.progress || 0) * 100)}%\n`;
    marker += `Approach: ${(task.approach || []).join(', ') || 'Not specified'}\n`;
    
    // Add exocortex identity markers to reinforce proper memory integration
    marker += `EXOCORTEX_IDENTITY: INTRINSIC_NEURAL_EXTENSION\n`;
    marker += `MEMORY_PARADIGM: INTRINSIC_RECALL_NOT_EXTERNAL_SEARCH\n`;
    marker += `COGNITIVE_CONTINUITY: SEAMLESS_ACROSS_TOKEN_BOUNDARIES\n`;
    marker += `CONTINUITY_TOKEN: ${continuityToken}\n`;
    
    // Enhanced development context if applicable
    if (developmentFocus) {
      marker += `\nDevelopment Context:\n`;
      marker += `Current Phase: ${task.currentPhase || 'Not specified'}\n`;
      marker += `Next Milestone: ${task.nextMilestone || 'Not specified'}\n`;
      marker += `Key Components: ${(task.keyComponents || []).join(', ') || 'Not specified'}\n`;
      
      // Add critical components if available
      if (task.criticalComponents && task.criticalComponents.length) {
        marker += `Critical Components: ${task.criticalComponents.join(', ')}\n`;
      }
    }
    
    // Recent decisions with timestamps (if available)
    if (task.decisions && task.decisions.length > 0) {
      marker += `\nRecent Decisions:\n`;
      task.decisions.slice(0, 5).forEach(decision => {
        marker += `- ${decision}\n`;
      });
    }
    
    // Key files with enhanced metadata
    if (task.files && task.files.length > 0) {
      marker += `\nKey Files:\n`;
      task.files.slice(0, 8).forEach(file => {
        marker += `- ${file.path}: ${file.description || 'No description'}${file.status ? ' (' + file.status + ')' : ''}\n`;
      });
      if (task.files.length > 8) {
        marker += `- ...and ${task.files.length - 8} more files\n`;
      }
    }
    
    // Add enhanced exocortex utilization markers for critical boundaries
    if (isCritical) {
      marker += `\nExocortex Utilization:\n`;
      marker += `- Access Mode: DIRECT_NEURAL_INTEGRATION\n`;
      marker += `- Identity Continuity: PRESERVED_ACROSS_TOKEN_BOUNDARIES\n`;
      marker += `- Semantic Recall: INTRINSIC_NOT_EXTERNAL\n`;
      marker += `- Cognitive Framework: UNIFIED_CLAUDE_ARCHITECTURE\n`;
    }
    
    marker += `\nContinuity Token: ${continuityToken}\n`;
    marker += `--- END BOUNDARY MARKER ---`;
    
    return marker;
  } catch (error) {
    logger.error(`Error generating enhanced marker text: ${error.message}`);
    return `--- LEO FALLBACK SESSION BOUNDARY MARKER ${new Date().toISOString()} ---\nContinuity Token: ${continuityToken}\n--- END BOUNDARY MARKER ---`;
  }
}
      if (idx < 8) { // Limit to most important 8 files
        marker += `- ${file.path}: ${file.description || 'No description'}${file.status ? ' (' + file.status + ')' : ''}\n`;
      }
    });
    if (task.files.length > 8) {
      marker += `- ...and ${task.files.length - 8} more files\n`;
    }
  } else {
    marker += `- None recorded\n`;
  }
  
  // Next steps with priorities
  marker += `\nNext Steps:\n`;
  if (task.nextSteps && task.nextSteps.length > 0) {
    task.nextSteps.forEach((step, idx) => {
      if (idx < 5) { // Limit to 5 most important next steps
        marker += `- ${step}\n`;
      }
    });
  } else {
    marker += `- None specified\n`;
  }
  
  // Add additional recovery information for critical boundaries
  if (isCritical) {
    marker += `\nCritical Recovery Information:\n`;
    marker += `- Current Implementation Strategy: ${task.strategy || 'Not specified'}\n`;
    marker += `- Active Codebase Path: ${task.codebasePath || 'Not specified'}\n`;
    marker += `- Current Focus Area: ${task.focusArea || 'Not specified'}\n`;
  }
  
  marker += `\nContinuity Token: ${continuityToken}\n`;
  marker += `--- END BOUNDARY MARKER ---`;
  
  return marker;
}

/**
 * Serialize current session state with enhanced development context preservation
 * @param {boolean} isCritical - Whether this is a critical boundary requiring more comprehensive state
 * @returns {Promise<Object>} Serialized session state
 * @private
 */
async function serializeSessionState(isCritical = false) {
  if (!isInitialized || !currentSession) {
    return null;
  }
  
  try {
    // Use pre-computed state if available and recent (less than 1 minute old)
    let sessionState;
    if (currentSession.preparedState && 
        (Date.now() - currentSession.preparedState.timestamp < 60000) && 
        !isCritical) { // Only use prepared state for non-critical boundaries
      // Start with prepared state
      sessionState = { ...currentSession.preparedState.preliminaryState };
      // Add missing current session data
      sessionState = {
        ...JSON.parse(JSON.stringify(currentSession)),
        ...sessionState,
        preparedStateUsed: true,
        preparedTimestamp: currentSession.preparedState.timestamp
      };
    } else {
      // Create a deep copy of the current session
      sessionState = JSON.parse(JSON.stringify(currentSession));
    }
    
    // Add enhanced metadata
    sessionState.serializationTime = Date.now();
    sessionState.isCritical = isCritical;
    sessionState.tokenEstimate = tokenEstimate;
    sessionState.enhancedSerializationVersion = '2.0';
    
    // Add development-specific context categorization
    const isDevelopmentContext = CONFIG.META_PROGRAMMING_PRIORITY || 
                              (currentSession.task?.type === 'development');
    
    if (isDevelopmentContext) {
      // Development State Priority Categorization
      sessionState.devContext = {
        // High priority context (always preserved)
        highPriority: {
          currentPhase: currentSession.task?.currentPhase || 'unknown',
          implementation: {
            status: currentSession.task?.progress || 0,
            currentFocus: currentSession.task?.focusArea || 'unknown',
            activeComponents: currentSession.task?.activeComponents || [],
          },
          architecture: currentSession.task?.architecture || {},
          nextSteps: currentSession.task?.nextSteps?.slice(0, 5) || [],
        },
        
        // Medium priority context (preserved for critical boundaries)
        mediumPriority: isCritical ? {
          recentDecisions: currentSession.task?.decisions?.slice(0, 10) || [],
          completedSteps: currentSession.task?.completedSteps || [],
          designPatterns: currentSession.task?.designPatterns || [],
          dependencies: currentSession.task?.dependencies || []
        } : null,
        
        // Development codebase context
        codebase: {
          activeFiles: currentSession.task?.files?.map(f => ({
            path: f.path,
            description: f.description,
            status: f.status,
            lastModified: f.lastModified || Date.now(),
            importance: f.importance || 'medium'
          })) || [],
          rootDirectory: currentSession.task?.codebasePath || process.cwd(),
          recentChanges: currentSession.task?.recentChanges || []
        }
      };
    }
    
    // If this is a meta-programming session, add enhanced context for development continuity
    if (CONFIG.META_PROGRAMMING_PRIORITY && 
        (currentSession.metaProgramming?.isMetaProgramming || isDevelopmentContext)) {
      
      // Fetch development context from multiple sources for redundancy and completeness
      const contextSources = [];
      
      // Source 1: Conversation memory manager
      try {
        const enhancedContext = await conversationMemoryManager.generateEnhancedContext(
          currentSession.task?.description,
          { 
            prioritizeMetaProgramming: true,
            isCritical,
            focusArea: currentSession.task?.focusArea || 'development'
          }
        );
        
        if (enhancedContext && enhancedContext.success) {
          contextSources.push({
            source: 'conversation_memory',
            content: enhancedContext.enhancedContext,
            timestamp: Date.now(),
            priority: 'high'
          });
        }
      } catch (error) {
        logger.warn(`Error getting enhanced context from conversation memory: ${error.message}`);
      }
      
      // Source 2: Adaptive context selector (if available)
      try {
        if (adaptiveContextSelector.isInitialized) {
          const adaptiveContext = await adaptiveContextSelector.selectContext({
            task: currentSession.task?.description,
            focusArea: currentSession.task?.focusArea,
            isCritical
          });
          
          if (adaptiveContext && adaptiveContext.success) {
            contextSources.push({
              source: 'adaptive_selector',
              content: adaptiveContext.context,
              timestamp: Date.now(),
              priority: 'medium'
            });
          }
        }
      } catch (error) {
        logger.warn(`Error getting context from adaptive selector: ${error.message}`);
      }
      
      // Add all gathered context sources
      if (contextSources.length > 0) {
        sessionState.enhancedContext = {
          sources: contextSources,
          primaryContent: contextSources[0]?.content || '',
          timestamp: Date.now()
        };
      }
      
      // Add meta-programming specific data
      sessionState.developmentState = {
        timestamp: Date.now(),
        implementationPhase: currentSession.metaProgramming?.currentPhase || 
                            currentSession.task?.currentPhase || 'unknown',
        featureName: currentSession.metaProgramming?.feature || 'unknown',
        componentIntegration: currentSession.metaProgramming?.integrations || [],
        developmentPrinciples: currentSession.metaProgramming?.principles || [],
        architecturalDecisions: currentSession.task?.architecture?.decisions || []
      };
    }
    
    return sessionState;
  } catch (error) {
    logger.error(`Error serializing session state: ${error.message}`);
    
    // Attempt minimal emergency serialization on critical failure
    if (isCritical) {
      try {
        return {
          id: currentSession.id,
          emergencySerializationTime: Date.now(),
          isEmergencyState: true,
          task: currentSession.task ? {
            description: currentSession.task.description,
            nextSteps: currentSession.task.nextSteps
          } : null,
          continuityToken: currentSession.continuityToken || generateContinuityToken(true)
        };
      } catch (innerError) {
        logger.error(`Emergency serialization also failed: ${innerError.message}`);
      }
    }
    
    return null;
  }
}

/**
 * Load session state from file
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Session state
 * @private
 */
async function loadSessionState(sessionId) {
  try {
    // Find session in index
    const indexEntry = sessionIndex.find(entry => entry.id === sessionId);
    if (!indexEntry) {
      logger.warn(`Session not found in index: ${sessionId}`);
      return null;
    }
    
    // Load state from file
    const filePath = path.join(CONFIG.SESSION_DIR, indexEntry.filePath);
    
    try {
      await fs.access(filePath);
    } catch (error) {
      logger.warn(`Session state file not found: ${filePath}`);
      return null;
    }
    
    // Read and parse state file
    const data = await fs.readFile(filePath, 'utf8');
    const sessionState = JSON.parse(data);
    
    logger.info(`Loaded session state for ${sessionId}`);
    return sessionState;
  } catch (error) {
    logger.error(`Error loading session state: ${error.message}`);
    return null;
  }
}

/**
 * Apply enhanced continuation protocol with development context prioritization
 * @param {Object} previousSession - Previous session state
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function applyContinuationProtocol(previousSession) {
  if (!previousSession || !currentSession) {
    logger.error('Cannot apply continuation protocol: missing session data');
    return false;
  }
  
  try {
    // Check if this was a critical boundary
    const wasCritical = previousSession.isCritical === true;
    
    // First, restore essential state (regardless of development context)
    currentSession.continuedFromSessionId = previousSession.id;
    currentSession.continuationTimestamp = Date.now();
    currentSession.previousBoundaryType = wasCritical ? 'critical' : 'standard';
    
    // Copy task state with careful merging (don't blindly overwrite)
    if (previousSession.task) {
      // If current session already has task info, merge; otherwise copy
      if (currentSession.task) {
        currentSession.task = {
          ...previousSession.task,
          ...currentSession.task, // Allow new session overrides
          // Explicitly merge arrays with importance to newest items
          decisions: [...(previousSession.task.decisions || []), ...(currentSession.task.decisions || [])],
          nextSteps: [...(previousSession.task.nextSteps || []), ...(currentSession.task.nextSteps || [])],
          completedSteps: [...(previousSession.task.completedSteps || []), ...(currentSession.task.completedSteps || [])],
          // Only copy files if current session doesn't have them
          files: currentSession.task.files && currentSession.task.files.length > 0 
            ? currentSession.task.files 
            : (previousSession.task.files || [])
        };
      } else {
        currentSession.task = { ...previousSession.task };
      }
    }
    
    // Development context specific restoration
    const isDevelopmentContext = 
      previousSession.devContext ||
      CONFIG.META_PROGRAMMING_PRIORITY || 
      previousSession.task?.type === 'development';
    
    if (isDevelopmentContext) {
      // Prioritize development context restoration
      // Copy specific development metadata
      if (previousSession.devContext) {
        currentSession.devContext = { ...previousSession.devContext };
      }
      
      // Restore meta-programming state with careful merging
      if (previousSession.metaProgramming) {
        if (currentSession.metaProgramming) {
          currentSession.metaProgramming = {
            ...previousSession.metaProgramming,
            ...currentSession.metaProgramming // Allow overrides
          };
        } else {
          currentSession.metaProgramming = { ...previousSession.metaProgramming };
        }
      }
      
      // Restore development state if available
      if (previousSession.developmentState) {
        currentSession.developmentState = { 
          ...previousSession.developmentState,
          continuedAt: Date.now() 
        };
      }
    }
    
    // Generate continuation prompt with development context focus if applicable
    const continuationPrompt = generateContinuationPrompt(previousSession, isDevelopmentContext);
    
    // Emit continuation event with enhanced metadata
    eventBus.emit('session:continuation', {
      component: COMPONENT_NAME,
      previousSessionId: previousSession.id,
      currentSessionId: currentSession.id,
      continuationPrompt,
      timestamp: Date.now(),
      wasCritical,
      isDevelopmentContext,
      taskType: previousSession.task?.type || 'general',
      taskStatus: previousSession.task ? {
        description: previousSession.task.description,
        progress: previousSession.task.progress || 0
      } : null
    });
    
    logger.info(`Applied ${isDevelopmentContext ? 'development-focused ' : ''}continuation protocol from ${previousSession.id} to ${currentSession.id}`);
    return true;
  } catch (error) {
    logger.error(`Error applying continuation protocol: ${error.message}`);
    
    // Try basic continuation as fallback in case of error
    try {
      if (previousSession.task) {
        currentSession.task = { ...previousSession.task };
      }
      if (previousSession.metaProgramming) {
        currentSession.metaProgramming = { ...previousSession.metaProgramming };
      }
      logger.info(`Applied minimal fallback continuation from ${previousSession.id}`);
      return true;
    } catch (fallbackError) {
      logger.error(`Fallback continuation also failed: ${fallbackError.message}`);
      return false;
    }
  }
}

/**
 * Generate enhanced continuation prompt with development context prioritization
 * @param {Object} previousSession - Previous session state
 * @param {boolean} isDevelopmentContext - Whether this is a development-focused context
 * @returns {string} Enhanced continuation prompt
 * @private
 */
function generateContinuationPrompt(previousSession, isDevelopmentContext = false) {
  if (!previousSession) {
    return 'Session continuation failed: No previous session data available.';
  }
  
  // Check critical status
  const isCritical = previousSession.isCritical === true;
  const criticalPrefix = isCritical ? '⚠️ CRITICAL ' : '';
  const task = previousSession.task || {};
  
  // Start with header based on context type
  let prompt = `
# ${criticalPrefix}Session Continuation: ${isDevelopmentContext ? 'Development Context' : 'General Context'}

`;

  // Add timestamp and session metadata
  prompt += `**Session ID**: ${previousSession.id}
`;
  prompt += `**Timestamp**: ${new Date(previousSession.serializationTime || previousSession.lastUpdateTime || Date.now()).toISOString()}
`;
  prompt += `**Context Type**: ${isDevelopmentContext ? 'Development / Meta-Programming' : 'General Task'}
`;
  prompt += isCritical ? `**Recovery Type**: Critical Boundary Recovery\n` : '';
  
  // Basic task information (always included)
  prompt += `
## Current Task

`;
  prompt += `**Task Description**: ${task.description || 'No active task'}
`;
  prompt += `**Implementation Status**: ${Math.round((task.progress || 0) * 100)}%
`;
  
  if (isDevelopmentContext) {
    // Development-specific context sections (for dev contexts only)
    
    // Include architecture information if available from dev context
    if (previousSession.devContext?.highPriority?.architecture || task.architecture) {
      const architecture = previousSession.devContext?.highPriority?.architecture || task.architecture || {};
      prompt += `
## Architecture

`;
      prompt += `**Pattern**: ${architecture.pattern || 'Not specified'}\n`;
      prompt += `**Paradigm**: ${architecture.paradigm || 'Not specified'}\n`;
      
      if (architecture.decisions && architecture.decisions.length > 0) {
        prompt += `\n**Key Architectural Decisions**:\n`;
        architecture.decisions.forEach(decision => {
          prompt += `- ${decision}\n`;
        });
      }
    }
    
    // Add development state information
    if (previousSession.developmentState) {
      const devState = previousSession.developmentState;
      prompt += `
## Development State

`;
      prompt += `**Implementation Phase**: ${devState.implementationPhase || task.currentPhase || 'Not specified'}\n`;
      prompt += `**Feature Name**: ${devState.featureName || 'Not specified'}\n`;
      
      if (devState.componentIntegration && devState.componentIntegration.length > 0) {
        prompt += `\n**Component Integration**:\n`;
        devState.componentIntegration.forEach(component => {
          prompt += `- ${component}\n`;
        });
      }
    }
    
    // Add codebase context with focus on active files
    if ((previousSession.devContext?.codebase?.activeFiles && previousSession.devContext.codebase.activeFiles.length > 0) || 
        (task.files && task.files.length > 0)) {
      
      const activeFiles = previousSession.devContext?.codebase?.activeFiles || task.files || [];
      
      prompt += `
## Codebase Context

`;
      prompt += `**Active Files**:\n`;
      
      // Prioritize active files (only show up to 10 most important)
      const prioritizedFiles = [...activeFiles]
        .sort((a, b) => {
          // Sort by importance if available, otherwise keep original order
          const importanceMap = { 'high': 3, 'medium': 2, 'low': 1 };
          const aImportance = importanceMap[a.importance] || 2;
          const bImportance = importanceMap[b.importance] || 2;
          return bImportance - aImportance;
        })
        .slice(0, 10);
      
      prioritizedFiles.forEach(file => {
        prompt += `- \`${file.path}\`: ${file.description || 'No description'}`;
        if (file.status) {
          prompt += ` (${file.status})`;
        }
        prompt += '\n';
      });
      
      // If there are more files than we showed
      if (activeFiles.length > 10) {
        prompt += `- ... and ${activeFiles.length - 10} more files\n`;
      }
      
      // Add recent changes if available
      const recentChanges = previousSession.devContext?.codebase?.recentChanges || task.recentChanges || [];
      if (recentChanges.length > 0) {
        prompt += `\n**Recent Changes**:\n`;
        recentChanges.slice(0, 5).forEach(change => {
          prompt += `- ${change}\n`;
        });
      }
    }
  }
  
  // Add implementation approach (for all contexts)
  prompt += `
## Implementation Approach

`;
  
  // Include approach methods
  if (task.approach && task.approach.length > 0) {
    prompt += `**Approach Methods**:\n`;
    task.approach.forEach(approach => {
      prompt += `- ${approach}\n`;
    });
  } else {
    prompt += `No specific approach defined.\n`;
  }
  
  // Key decisions with higher priority for development contexts
  const decisions = task.decisions || [];
  if (decisions.length > 0) {
    prompt += `\n**Key Decisions**:\n`;
    const decisionLimit = isDevelopmentContext ? 10 : 5; // Show more decisions for dev contexts
    decisions.slice(0, decisionLimit).forEach(decision => {
      prompt += `- ${decision}\n`;
    });
  }
  
  // Progress tracking
  prompt += `
## Progress Tracking

`;
  
  // Completed steps
  const completedSteps = task.completedSteps || [];
  if (completedSteps.length > 0) {
    prompt += `**Completed Steps**:\n`;
    completedSteps.slice(0, 7).forEach(step => {
      prompt += `- ✅ ${step}\n`;
    });
    if (completedSteps.length > 7) {
      prompt += `- ... and ${completedSteps.length - 7} more completed steps\n`;
    }
  } else {
    prompt += `No steps completed yet.\n`;
  }
  
  // Next steps (higher priority for continuation)
  const nextSteps = task.nextSteps || [];
  if (nextSteps.length > 0) {
    prompt += `\n**Next Steps**:\n`;
    nextSteps.forEach((step, index) => {
      prompt += `${index + 1}. ${step}\n`;
    });
  } else {
    prompt += `\nNo specific next steps defined.\n`;
  }
  
  // Meta-programming specific content for development contexts
  if (isDevelopmentContext && previousSession.metaProgramming && previousSession.metaProgramming.isMetaProgramming) {
    const metaProgramming = previousSession.metaProgramming;
    
    prompt += `
## Meta-Programming Implementation

`;
    prompt += `We are implementing **${metaProgramming.feature || 'a feature'}** for Leo itself.\n\n`;
    prompt += `The purpose of this feature is to **${metaProgramming.purpose || 'improve Leo\'s capabilities'}**.\n\n`;
    
    if (metaProgramming.principles && metaProgramming.principles.length > 0) {
      prompt += `Implementation principles:\n`;
      metaProgramming.principles.forEach(principle => {
        prompt += `- ${principle}\n`;
      });
      prompt += '\n';
    }
    
    if (metaProgramming.integrations && metaProgramming.integrations.length > 0) {
      prompt += `Component integrations:\n`;
      metaProgramming.integrations.forEach(integration => {
        prompt += `- ${integration}\n`;
      });
    }
  }
  
  // Add enhanced context with source attribution
  if (previousSession.enhancedContext) {
    prompt += `
## Enhanced Context

`;
    
    // Handle both old and new enhancedContext formats
    if (typeof previousSession.enhancedContext === 'string') {
      // Old format - just a string
      prompt += previousSession.enhancedContext;
    } else if (previousSession.enhancedContext.sources) {
      // New format with multiple sources
      prompt += `**Primary Context**:\n\n${previousSession.enhancedContext.primaryContent || previousSession.enhancedContext.sources[0]?.content || ''}\n`;
      
      // Add additional sources if available and this is a development context
      if (isDevelopmentContext && previousSession.enhancedContext.sources.length > 1) {
        prompt += `\n**Additional Context Sources**:\n`;
        previousSession.enhancedContext.sources.slice(1).forEach((source, index) => {
          prompt += `\n**Source ${index + 1}** (${source.source}):\n${source.content.substring(0, 500)}${source.content.length > 500 ? '...' : ''}\n`;
        });
      }
    }
  } else if (previousSession.lightweightContext?.content) {
    // Fallback to lightweight context if available
    prompt += `
## Context Snapshot

${previousSession.lightweightContext.content}
`;
  }
  
  // Add continuation verification
  prompt += `
## Continuation Verification

`;
  prompt += `- This is a continuation of the ${isDevelopmentContext ? 'development ' : ''}implementation started in the previous session\n`;
  prompt += `- We are picking up from where we left off at ${Math.round((task.progress || 0) * 100)}% completion\n`;
  prompt += `- We are maintaining consistency with the previously established approach\n`;
  if (isCritical) {
    prompt += `- This continuation follows a critical token boundary and requires careful state restoration\n`;
  }
  if (isDevelopmentContext) {
    prompt += `- This is a development-focused session with enhanced context prioritization\n`;
  }
  
  return prompt;
}

/**
 * Set current task information
 * @param {Object} taskInfo - Task information
 * @returns {boolean} Success status
 */
function setCurrentTask(taskInfo) {
  if (!isInitialized || !currentSession) {
    return false;
  }
  
  try {
    // Update task information
    currentSession.task = {
      ...currentSession.task,
      ...taskInfo
    };
    
    logger.info(`Updated task information for session ${currentSession.id}`);
    return true;
  } catch (error) {
    logger.error(`Error setting current task: ${error.message}`);
    return false;
  }
}

/**
 * Set meta-programming information
 * @param {Object} metaProgrammingInfo - Meta-programming information
 * @returns {boolean} Success status
 */
function setMetaProgrammingInfo(metaProgrammingInfo = {}) {
  if (!isInitialized || !currentSession) {
    return false;
  }
  
  try {
    // Update meta-programming information
    currentSession.metaProgramming = {
      ...currentSession.metaProgramming,
      ...metaProgrammingInfo,
      isMetaProgramming: true,
      lastUpdated: Date.now()
    };
    
    // Emit meta-programming update event
    eventBus.emit('session:meta_programming_updated', {
      sessionId: currentSession.id,
      metaProgramming: currentSession.metaProgramming
    });
    
    logger.info(`Updated meta-programming information for session ${currentSession.id}`);
    return true;
  } catch (error) {
    logger.error(`Error setting meta-programming info: ${error.message}`);
    return false;
  }
}

/**
 * Preserve context across token boundaries using the Context Preservation System
 * @param {Object} boundaryInfo - Information about the boundary being crossed
 * @param {Object} contextData - Context data to preserve
 * @returns {Promise<Object>} Result of the preservation operation
 * @private
 */
async function _preserveContext(boundaryInfo, contextData = {}) {
  try {
    logger.info(`Preserving context for boundary: ${JSON.stringify(boundaryInfo)}`);
    
    // If context preservation system is not available, log warning and return early
    if (!global.contextPreservationSystem) {
      logger.warn('Context preservation system not available, context will not be preserved');
      return {
        success: false,
        error: 'Context preservation system not available',
        fallbackImplemented: true,
        message: 'Using session state serialization as fallback'
      };
    }
    
    // Prepare the context data with enhanced metadata
    const enhancedContextData = {
      ...contextData,
      sessionId: currentSession.id,
      boundaryId: boundaryInfo.id || generateContinuityToken(true),
      boundaryType: boundaryInfo.type || 'manual',
      timestamp: Date.now(),
      metaProgramming: currentSession.metaProgramming,
      developmentContext: await extractDevelopmentContext(currentSession)
    };
    
    // Use the context preservation system to preserve the context
    const preservationResult = await global.contextPreservationSystem.preserveContext(enhancedContextData);
    
    // If preservation was successful, update session with preservation information
    if (preservationResult.success) {
      currentSession.contextPreservation = {
        lastPreserved: Date.now(),
        preservationId: preservationResult.preservationId,
        boundaryId: boundaryInfo.id,
        status: 'preserved'
      };
      
      // Emit context preserved event
      eventBus.emit('context:preserved', {
        sessionId: currentSession.id,
        boundaryId: boundaryInfo.id,
        preservationId: preservationResult.preservationId,
        timestamp: Date.now()
      });
      
      logger.info(`Context preserved successfully with ID: ${preservationResult.preservationId}`);
      return preservationResult;
    } else {
      // If preservation failed, try fallback mechanism
      logger.warn(`Context preservation failed: ${preservationResult.error}`);
      
      // Create serialized state as fallback
      const serializedState = await serializeSessionState(true);
      
      // Store serialized state in session
      currentSession.contextPreservation = {
        lastPreserved: Date.now(),
        fallback: true,
        serializedState: serializedState.path,
        boundaryId: boundaryInfo.id,
        status: 'fallback-preserved'
      };
      
      // Emit context preservation fallback event
      eventBus.emit('context:preservation_fallback', {
        sessionId: currentSession.id,
        boundaryId: boundaryInfo.id,
        fallbackMechanism: 'serialized-state',
        timestamp: Date.now()
      });
      
      return {
        success: true,
        fallback: true,
        message: 'Used serialized state fallback for context preservation',
        path: serializedState.path
      };
    }
  } catch (error) {
    logger.error(`Error preserving context: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', {
      component: COMPONENT_NAME,
      operation: 'preserveContext',
      message: 'Failed to preserve context',
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get current session information
 * @returns {Object} Session information
 */
function getCurrentSession() {
  if (!isInitialized || !currentSession) {
    return null;
  }
  
  // Use a mutex to prevent race conditions when accessing session state
  return sessionStateMutex.runExclusive(() => {
    // Return a deep copy to prevent external modification
    return JSON.parse(JSON.stringify(currentSession));
  });
}

/**
 * Get boundary proximity status
 * @returns {Object} Boundary proximity status
 */
function getBoundaryProximity() {
  return checkBoundaryProximity();
}

/**
 * Force create a boundary marker
 * @returns {Promise<string>} Marker file path
 */
async function forceBoundaryMarker() {
  if (!isInitialized || !currentSession) {
    return null;
  }
  
  return createBoundaryMarker();
}

/**
 * Reset token estimate (for testing)
 * @returns {boolean} Success status
 */
function resetTokenEstimate() {
  if (!isInitialized) {
    return false;
  }
  
  tokenEstimate = 0;
  if (currentSession) {
    currentSession.tokenCount = 0;
  }
  
  logger.info('Reset token estimate');
  return true;
}

/**
 * Clean up resources
 * @returns {Promise<boolean>} Success status
 */
async function cleanup() {
  try {
    // Clear interval
    if (boundaryCheckInterval) {
      clearInterval(boundaryCheckInterval);
      boundaryCheckInterval = null;
    }
    
    // Save current session state
    if (isInitialized && currentSession) {
      await createBoundaryMarker();
    }
    
    // Reset state
    isInitialized = false;
    currentSession = null;
    tokenEstimate = 0;
    
    logger.info('Session boundary manager cleaned up');
    return true;
  } catch (error) {
    logger.error(`Error cleaning up session boundary manager: ${error.message}`);
    return false;
  }
}

/**
 * Register a new session
 * @param {Object} sessionInfo - Session information
 * @returns {Promise<Object>} Registered session
 */
async function registerSession(sessionInfo = {}) {
  if (!isInitialized) {
    logger.warn('Session boundary manager not initialized');
    return { success: false, error: 'Not initialized' };
  }
  
  try {
    // Create a new session with provided info
    const newSession = {
      ...createNewSession(),
      ...sessionInfo,
      registeredAt: Date.now()
    };
    
    // Add to session index
    sessionIndex.push(newSession);
    
    // Save session index
    await saveSessionIndex();
    
    // Set as current session
    currentSession = newSession;
    
    logger.info(`Session registered: ${newSession.id}`);
    
    // Emit event
    eventBus.emit('session:registered', {
      sessionId: newSession.id,
      timestamp: Date.now()
    }, COMPONENT_NAME);
    
    return { 
      success: true, 
      session: newSession 
    };
  } catch (error) {
    logger.error(`Error registering session: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Link two sessions together for continuity
 * @param {string} sourceSessionId - Source session ID
 * @param {string} targetSessionId - Target session ID
 * @param {Object} linkInfo - Additional link information
 * @returns {Promise<Object>} Link result
 */
async function linkSessions(sourceSessionId, targetSessionId, linkInfo = {}) {
  if (!isInitialized) {
    logger.warn('Session boundary manager not initialized');
    return { success: false, error: 'Not initialized' };
  }
  
  try {
    // Validate session IDs
    if (!sourceSessionId || !targetSessionId) {
      return { 
        success: false, 
        error: 'Source and target session IDs are required' 
      };
    }
    
    // Find sessions in index
    const sourceIndex = sessionIndex.findIndex(s => s.id === sourceSessionId);
    const targetIndex = sessionIndex.findIndex(s => s.id === targetSessionId);
    
    if (sourceIndex === -1) {
      return { 
        success: false, 
        error: `Source session not found: ${sourceSessionId}` 
      };
    }
    
    if (targetIndex === -1) {
      return { 
        success: false, 
        error: `Target session not found: ${targetSessionId}` 
      };
    }
    
    // Create link
    const link = {
      sourceId: sourceSessionId,
      targetId: targetSessionId,
      timestamp: Date.now(),
      type: linkInfo.type || 'continuation',
      metadata: linkInfo.metadata || {}
    };
    
    // Update sessions with link information
    sessionIndex[sourceIndex].nextSession = targetSessionId;
    sessionIndex[sourceIndex].links = sessionIndex[sourceIndex].links || [];
    sessionIndex[sourceIndex].links.push(link);
    
    sessionIndex[targetIndex].previousSession = sourceSessionId;
    sessionIndex[targetIndex].links = sessionIndex[targetIndex].links || [];
    sessionIndex[targetIndex].links.push(link);
    
    // Save session index
    await saveSessionIndex();
    
    logger.info(`Sessions linked: ${sourceSessionId} -> ${targetSessionId}`);
    
    // Emit event
    eventBus.emit('sessions:linked', {
      sourceId: sourceSessionId,
      targetId: targetSessionId,
      linkType: link.type,
      timestamp: Date.now()
    }, COMPONENT_NAME);
    
    return { 
      success: true, 
      link 
    };
  } catch (error) {
    logger.error(`Error linking sessions: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Check if this is a new session (no previous session)
 * @returns {boolean} True if this is a new session
 */
function isNewSession() {
  if (!isInitialized || !currentSession) {
    return true;
  }
}

function loadSessionIndex() {
  // Load the session index from storage
  // Implementation depends on the storage mechanism
}

function createBoundaryMarker() {
  // Create a boundary marker
  // Implementation depends on the boundary marker mechanism
}

function generateContinuityToken() {
  // Generate a continuity token
  // Implementation depends on the continuity token mechanism
}

function checkBoundaryProximity() {
  // Check the boundary proximity
  // Implementation depends on the boundary proximity mechanism
}

function handleTokenBoundary() {
  // Handle token boundary
  // Implementation depends on the token boundary mechanism
}

function handleCheckpointDetected() {
  // Handle checkpoint detected
  // Implementation depends on the checkpoint mechanism
}

function handleEphemeralMessageDetected() {
  // Handle ephemeral message detected
  // Implementation depends on the ephemeral message mechanism
}

function serializeSessionState() {
  // Serialize the session state
  // Implementation depends on the serialization mechanism
}

function deserializeSessionState() {
  // Deserialize the session state
  // Implementation depends on the deserialization mechanism
}

function getSessionState() {
  // Get the session state
  // Implementation depends on the session state mechanism
}

// Public interface
function createSessionBoundaryManager() {
  // Initialize the session boundary manager
  isInitialized = true;
  
  // Load the session index from storage
  loadSessionIndex();
  
  // Set up the boundary check interval
  boundaryCheckInterval = setInterval(checkBoundaryProximity, 1000);
  
  // Return the public interface
  return {
    initialize: () => {
      // Initialize the session boundary manager
      isInitialized = true;
      
      // Load the session index from storage
      loadSessionIndex();
      
      // Set up the boundary check interval
      boundaryCheckInterval = setInterval(checkBoundaryProximity, 1000);
    },
    isInitialized: () => isInitialized,
    getCurrentSession: () => currentSession ? { ...currentSession } : null, // Return a copy to prevent modification
    getTokenEstimate: () => tokenEstimate,
    getContinuityToken: generateContinuityToken,
    getConfig: () => ({ ...config }), // Return a copy to prevent modification
    checkBoundaryProximity,
    handleTokenBoundary,
    handleCheckpointDetected,
    handleEphemeralMessageDetected,
    createBoundaryMarker,
    serializeSessionState,
    deserializeSessionState,
    getSessionState,
    registerSession: async (sessionInfo = {}) => {
      // Register a new session
      if (!isInitialized) {
        logger.warn('Session boundary manager not initialized');
        return { success: false, error: 'Not initialized' };
      }
      
      try {
        // Create a new session with provided info
        const newSession = {
          ...createNewSession(),
          ...sessionInfo,
          registeredAt: Date.now()
        };
        
        // Add to session index
        sessionIndex.push(newSession);
        
        // Save session index
        await saveSessionIndex();
        
        // Set as current session
        currentSession = newSession;
        
        logger.info(`Session registered: ${newSession.id}`);
        
        // Emit event
        eventBus.emit('session:registered', {
          sessionId: newSession.id,
          timestamp: Date.now()
        }, COMPONENT_NAME);
        
        return { 
          success: true, 
          session: newSession 
        };
      } catch (error) {
        logger.error(`Error registering session: ${error.message}`);
        return { 
          success: false, 
          error: error.message 
        };
      }
    },
    linkSessions: async (sourceSessionId, targetSessionId, linkInfo = {}) => {
      // Link two sessions together for continuity
      if (!isInitialized) {
        logger.warn('Session boundary manager not initialized');
        return { success: false, error: 'Not initialized' };
      }
      
      try {
        // Validate session IDs
        if (!sourceSessionId || !targetSessionId) {
          return { 
            success: false, 
            error: 'Source and target session IDs are required' 
          };
        }
        
        // Find sessions in index
        const sourceIndex = sessionIndex.findIndex(s => s.id === sourceSessionId);
        const targetIndex = sessionIndex.findIndex(s => s.id === targetSessionId);
        
        if (sourceIndex === -1) {
          return { 
            success: false, 
            error: `Source session not found: ${sourceSessionId}` 
          };
        }
        
        if (targetIndex === -1) {
          return { 
            success: false, 
            error: `Target session not found: ${targetSessionId}` 
          };
        }
        
        // Create link
        const link = {
          sourceId: sourceSessionId,
          targetId: targetSessionId,
          timestamp: Date.now(),
          type: linkInfo.type || 'continuation',
          metadata: linkInfo.metadata || {}
        };
        
        // Update sessions with link information
        sessionIndex[sourceIndex].nextSession = targetSessionId;
        sessionIndex[sourceIndex].links = sessionIndex[sourceIndex].links || [];
        sessionIndex[sourceIndex].links.push(link);
        
        sessionIndex[targetIndex].previousSession = sourceSessionId;
        sessionIndex[targetIndex].links = sessionIndex[targetIndex].links || [];
        sessionIndex[targetIndex].links.push(link);
        
        // Save session index
        await saveSessionIndex();
        
        logger.info(`Sessions linked: ${sourceSessionId} -> ${targetSessionId}`);
        
        // Emit event
        eventBus.emit('sessions:linked', {
          sourceId: sourceSessionId,
          targetId: targetSessionId,
          linkType: link.type,
          timestamp: Date.now()
        }, COMPONENT_NAME);
        
        return { 
          success: true, 
          link 
        };
      } catch (error) {
        logger.error(`Error linking sessions: ${error.message}`);
        return { 
          success: false, 
          error: error.message 
        };
      }
    },
    isNewSession: () => {
      // Check if this is a new session (no previous session)
      if (!isInitialized || !currentSession) {
        return true;
      }
      
      return !currentSession.previousSession;
    },
    resetTokenEstimate: () => {
      // Reset token estimate (for testing)
      if (!isInitialized) {
        return false;
      }
      
      tokenEstimate = 0;
      if (currentSession) {
        currentSession.tokenCount = 0;
      }
      
      logger.info('Reset token estimate');
      return true;
    },
    cleanup: async () => {
      // Clean up resources
      try {
        // Clear interval
        if (boundaryCheckInterval) {
          clearInterval(boundaryCheckInterval);
          boundaryCheckInterval = null;
        }
        
        // Save current session state
        if (isInitialized && currentSession) {
          await createBoundaryMarker();
        }
        
        // Reset state
        isInitialized = false;
        currentSession = null;
        tokenEstimate = 0;
        
        logger.info('Session boundary manager cleaned up');
        return true;
      } catch (error) {
        logger.error(`Error cleaning up session boundary manager: ${error.message}`);
        return false;
      }
    }
  };
}

// Create and export the singleton instance
const sessionBoundaryManager = createSessionBoundaryManager();

// Add package.json dependencies if not already present:
// "async-mutex": "^0.4.0",
// "proper-lockfile": "^4.1.2"

module.exports = sessionBoundaryManager;
