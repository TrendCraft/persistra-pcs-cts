/**
 * Flow Tracking Service
 * 
 * This service tracks development flow states and integrates them with the memory graph.
 * It enhances Leo's conversation awareness by providing context about the developer's
 * current flow state, cognitive load, and problem-solving patterns.
 * 
 * Based on the Flow Tracking Addition proposal, this service implements:
 * - Development flow state detection
 * - Cognitive load estimation
 * - Problem-solving pattern recognition
 * - Context switching detection
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const memoryGraphIntegration = require('./memory-graph-integration');
const conversationCaptureService = require('./conversation-capture-service');

// Component name for logging and events
const COMPONENT_NAME = 'flow-tracking-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  FLOW_DATA_DIR: process.env.LEO_FLOW_DATA_DIR || path.join(process.cwd(), 'data', 'flow-tracking'),
  FLOW_STATES_FILE: 'flow-states.jsonl',
  FLOW_SESSIONS_FILE: 'flow-sessions.jsonl',
  MAX_SESSION_IDLE_TIME_MS: 30 * 60 * 1000, // 30 minutes
  COGNITIVE_LOAD_THRESHOLD_HIGH: 0.7,
  COGNITIVE_LOAD_THRESHOLD_MEDIUM: 0.4,
  COGNITIVE_LOAD_SMOOTHING_FACTOR: 0.8, // Higher values (0-1) mean slower changes (more smoothing)
  COGNITIVE_LOAD_INDICATORS: {
    FILE_SAVE_FREQUENCY: {
      weight: 0.3,
      timeWindow: 5 * 60 * 1000, // 5 minutes
      highThreshold: 5, // saves in time window
      lowThreshold: 2
    },
    CONVERSATION_COMPLEXITY: {
      weight: 0.25,
      timeWindow: 10 * 60 * 1000, // 10 minutes
      complexityFactors: {
        messageLength: 0.4, // weight for message length
        technicalTerms: 0.6  // weight for technical terms
      }
    },
    CONTEXT_SWITCHING: {
      weight: 0.25,
      timeWindow: 15 * 60 * 1000, // 15 minutes
      highThreshold: 4, // switches in time window
      lowThreshold: 1
    },
    CODE_COMPLEXITY: {
      weight: 0.2,
      factors: {
        fileSize: 0.3, // weight for file size
        syntaxComplexity: 0.7 // weight for syntax complexity
      }
    }
  },
  FLOW_STATE_TYPES: [
    'coding',
    'debugging',
    'refactoring',
    'testing',
    'learning',
    'planning',
    'reviewing'
  ],
  PROBLEM_SOLVING_PATTERNS: [
    'systematic_debugging',
    'incremental_development',
    'exploratory_programming',
    'test_driven_development',
    'refactor_first',
    'research_oriented'
  ],
  ENABLE_FLOW_DETECTION: true,
  ENABLE_COGNITIVE_LOAD_ESTIMATION: true,
  ENABLE_PROBLEM_SOLVING_DETECTION: true,
  ENABLE_CONTEXT_SWITCHING_DETECTION: true
};

// Initialization state
let isInitialized = false;

// Current flow state
let currentFlowState = null;
let currentFlowSession = null;
let lastActivityTimestamp = 0;
let recentContextSwitches = [];
let recentFileAccesses = [];

// Cognitive load history for smoothing
let cognitiveLoadHistory = [];

// Technical terms dictionary for complexity estimation
const technicalTerms = new Set([
  'algorithm', 'api', 'async', 'await', 'backend', 'bug', 'cache', 'callback', 'class', 'component',
  'database', 'debug', 'dependency', 'deploy', 'endpoint', 'error', 'exception', 'framework', 'frontend',
  'function', 'git', 'http', 'interface', 'json', 'library', 'memory', 'method', 'module', 'object',
  'parameter', 'promise', 'protocol', 'query', 'recursion', 'refactor', 'regex', 'repository', 'request',
  'response', 'rest', 'runtime', 'schema', 'scope', 'server', 'service', 'socket', 'state', 'syntax',
  'thread', 'token', 'transaction', 'type', 'variable', 'websocket', 'workflow'
]);

/**
 * Initialize the flow tracking service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  // Enforce strict DI
  const { embeddingsInterface, logger: injectedLogger } = options;
  if (!embeddingsInterface || !injectedLogger) {
    throw new Error('flow-tracking-service: DI missing embeddingsInterface or logger');
  }
  logger = injectedLogger;
  global._leoInjectedEmbeddingsInterface = embeddingsInterface;

  try {
    // Merge options with defaults (excluding DI)
    const nonDIOptions = { ...options };
    delete nonDIOptions.embeddingsInterface;
    delete nonDIOptions.logger;
    Object.assign(CONFIG, nonDIOptions);

    // Initialize dependencies
    if (!await initializeDependencies({ embeddingsInterface, logger })) {
      throw new Error('Failed to initialize dependencies');
    }

    // Subscribe to events
    eventBus.on('file:opened', handleFileOpened, COMPONENT_NAME);
    eventBus.on('file:saved', handleFileSaved, COMPONENT_NAME);
    eventBus.on('search:performed', handleSearchPerformed, COMPONENT_NAME);
    eventBus.on('cursor:activity', handleCursorActivity, COMPONENT_NAME);
    eventBus.on('conversation:message:added', handleConversationMessage, COMPONENT_NAME);
    eventBus.on('conversation:session:saved', handleConversationSaved, COMPONENT_NAME);
    
    // Start a new flow session
    await startNewFlowSession();
    
    isInitialized = true;
    logger.info('Flow tracking service initialized successfully');
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Initialize dependencies
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function initializeDependencies(di = {}) {
  const { embeddingsInterface, logger } = di;
  try {
    // Initialize memory graph integration if not already initialized
    if (memoryGraphIntegration && typeof memoryGraphIntegration.initialize === 'function' && !memoryGraphIntegration.isInitialized()) {
      await memoryGraphIntegration.initialize({ embeddingsInterface, logger });
    }

    // Initialize conversation capture service if not already initialized
    if (conversationCaptureService && typeof conversationCaptureService.initialize === 'function' && !conversationCaptureService.isInitialized) {
      await conversationCaptureService.initialize({ embeddingsInterface, logger });
    }

    return true;
  } catch (error) {
    logger.error(`Error initializing dependencies: ${error.message}`);
    return false;
  }
}

/**
 * Start a new flow session
 * @returns {Promise<Object>} New flow session
 * @private
 */
async function startNewFlowSession() {
  try {
    // Create new flow session
    currentFlowSession = {
      id: `flow_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      endTime: null,
      flowStates: [],
      contextSwitches: 0,
      cognitiveLoadAverage: 0,
      dominantFlowState: null,
      dominantProblemSolvingPattern: null,
      conversationIds: []
    };
    
    // Create initial flow state
    currentFlowState = {
      id: `flow_state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: currentFlowSession.id,
      timestamp: Date.now(),
      flowType: 'coding', // Default flow type
      cognitiveLoad: 0.3, // Default cognitive load (medium-low)
      problemSolvingPattern: null,
      recentContext: [],
      interruptionPoints: []
    };
    
    // Save to disk
    await saveFlowSession(currentFlowSession);
    await saveFlowState(currentFlowState);
    
    // Add to flow session
    currentFlowSession.flowStates.push(currentFlowState.id);
    
    logger.info(`Started new flow session: ${currentFlowSession.id}`);
    
    // Emit event
    eventBus.emit('flow:session:started', {
      sessionId: currentFlowSession.id,
      timestamp: Date.now()
    });
    
    return currentFlowSession;
  } catch (error) {
    logger.error(`Error starting new flow session: ${error.message}`);
    return null;
  }
}

/**
 * Update the current flow state
 * @param {Object} updates - Flow state updates
 * @returns {Promise<Object>} Updated flow state
 */
async function updateFlowState(updates = {}) {
  try {
    if (!currentFlowState) {
      logger.warn('No active flow state to update');
      return null;
    }
    
    // Check if we need to create a new flow state
    const shouldCreateNew = updates.flowType && updates.flowType !== currentFlowState.flowType;
    
    if (shouldCreateNew) {
      // Save current flow state
      await saveFlowState(currentFlowState);
      
      // Create new flow state
      currentFlowState = {
        id: `flow_state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId: currentFlowSession.id,
        timestamp: Date.now(),
        flowType: updates.flowType,
        cognitiveLoad: updates.cognitiveLoad || currentFlowState.cognitiveLoad,
        problemSolvingPattern: updates.problemSolvingPattern || currentFlowState.problemSolvingPattern,
        recentContext: updates.recentContext || currentFlowState.recentContext,
        interruptionPoints: updates.interruptionPoints || currentFlowState.interruptionPoints
      };
      
      // Add to flow session
      currentFlowSession.flowStates.push(currentFlowState.id);
      
      // Update flow session
      currentFlowSession.lastActivityTime = Date.now();
      currentFlowSession.contextSwitches++;
      
      // Save to disk
      await saveFlowState(currentFlowState);
      await saveFlowSession(currentFlowSession);
      
      // Emit event
      eventBus.emit('flow:state:changed', {
        sessionId: currentFlowSession.id,
        stateId: currentFlowState.id,
        flowType: currentFlowState.flowType,
        timestamp: Date.now()
      });
    } else {
      // Update existing flow state
      Object.assign(currentFlowState, updates);
      currentFlowState.timestamp = Date.now();
      
      // Update flow session
      currentFlowSession.lastActivityTime = Date.now();
      
      // Save to disk
      await saveFlowState(currentFlowState);
      await saveFlowSession(currentFlowSession);
    }
    
    // Update last activity timestamp
    lastActivityTimestamp = Date.now();
    
    return currentFlowState;
  } catch (error) {
    logger.error(`Error updating flow state: ${error.message}`);
    return null;
  }
}

/**
 * Save flow state to disk
 * @param {Object} flowState - Flow state to save
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function saveFlowState(flowState) {
  try {
    const flowStatesPath = path.join(CONFIG.FLOW_DATA_DIR, CONFIG.FLOW_STATES_FILE);
    
    // Append to file
    await fs.appendFile(flowStatesPath, JSON.stringify(flowState) + '\n');
    
    return true;
  } catch (error) {
    logger.error(`Error saving flow state: ${error.message}`);
    return false;
  }
}

/**
 * Save flow session to disk
 * @param {Object} flowSession - Flow session to save
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function saveFlowSession(flowSession) {
  try {
    const flowSessionsPath = path.join(CONFIG.FLOW_DATA_DIR, CONFIG.FLOW_SESSIONS_FILE);
    
    // Read existing sessions
    let sessions = [];
    try {
      const sessionsContent = await fs.readFile(flowSessionsPath, 'utf8');
      sessions = sessionsContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (readError) {
      // File might not exist yet, that's okay
    }
    
    // Filter out the session we're updating
    sessions = sessions.filter(session => session.id !== flowSession.id);
    
    // Add the updated session
    sessions.push(flowSession);
    
    // Write back to file
    const sessionsContent = sessions
      .map(session => JSON.stringify(session))
      .join('\n') + '\n';
    
    await fs.writeFile(flowSessionsPath, sessionsContent, 'utf8');
    
    return true;
  } catch (error) {
    logger.error(`Error saving flow session: ${error.message}`);
    return false;
  }
}

/**
 * Handle file opened event
 * @param {Object} data - Event data
 * @private
 */
async function handleFileOpened(data) {
  try {
    if (!data || !data.filePath) {
      return;
    }
    
    // Add to recent file accesses
    recentFileAccesses.push({
      filePath: data.filePath,
      timestamp: Date.now(),
      action: 'opened'
    });
    
    // Limit to last 10 file accesses
    if (recentFileAccesses.length > 10) {
      recentFileAccesses.shift();
    }
    
    // Add to recent context
    if (!currentFlowState.recentContext.includes(data.filePath)) {
      currentFlowState.recentContext.push(data.filePath);
      
      // Limit to last 5 context items
      if (currentFlowState.recentContext.length > 5) {
        currentFlowState.recentContext.shift();
      }
    }
    
    // Detect flow state based on file extension
    const fileExt = path.extname(data.filePath).toLowerCase();
    let flowType = currentFlowState.flowType;
    
    if (fileExt === '.test.js' || fileExt === '.spec.js' || data.filePath.includes('test/') || data.filePath.includes('tests/')) {
      flowType = 'testing';
    } else if (fileExt === '.js' || fileExt === '.ts' || fileExt === '.jsx' || fileExt === '.tsx') {
      flowType = 'coding';
    } else if (fileExt === '.md' || fileExt === '.txt' || fileExt === '.pdf') {
      flowType = 'learning';
    }
    
    // Update flow state if changed
    if (flowType !== currentFlowState.flowType) {
      await updateFlowState({ flowType });
    } else {
      // Just update the timestamp
      currentFlowState.timestamp = Date.now();
      currentFlowSession.lastActivityTime = Date.now();
      
      await saveFlowState(currentFlowState);
      await saveFlowSession(currentFlowSession);
    }
  } catch (error) {
    logger.error(`Error handling file opened event: ${error.message}`);
  }
}

/**
 * Handle file saved event
 * @param {Object} data - Event data
 * @private
 */
async function handleFileSaved(data) {
  try {
    if (!data || !data.filePath) {
      return;
    }
    
    // Add to recent file accesses
    recentFileAccesses.push({
      filePath: data.filePath,
      timestamp: Date.now(),
      action: 'saved'
    });
    
    // Limit to last 10 file accesses
    if (recentFileAccesses.length > 10) {
      recentFileAccesses.shift();
    }
    
    // Calculate cognitive load using enhanced estimation
    const cognitiveLoad = await estimateCognitiveLoad({
      eventType: 'file_saved',
      data: data,
      recentSaves: recentFileAccesses
        .filter(access => access.action === 'saved' && 
                Date.now() - access.timestamp < CONFIG.COGNITIVE_LOAD_INDICATORS.FILE_SAVE_FREQUENCY.timeWindow)
    });
    
    // Update flow state with new cognitive load
    await updateFlowState({ cognitiveLoad });
  } catch (error) {
    logger.error(`Error handling file saved event: ${error.message}`);
  }
}

/**
 * Handle search performed event
 * @param {Object} data - Event data
 * @private
 */
async function handleSearchPerformed(data) {
  try {
    if (!data || !data.query) {
      return;
    }
    
    // Add to interruption points
    currentFlowState.interruptionPoints.push({
      type: 'search',
      query: data.query,
      timestamp: Date.now()
    });
    
    // Limit to last 10 interruption points
    if (currentFlowState.interruptionPoints.length > 10) {
      currentFlowState.interruptionPoints.shift();
    }
    
    // Detect problem solving pattern based on search query
    let problemSolvingPattern = currentFlowState.problemSolvingPattern;
    
    if (data.query.includes('error') || data.query.includes('bug') || data.query.includes('fix')) {
      problemSolvingPattern = 'systematic_debugging';
    } else if (data.query.includes('test') || data.query.includes('assert')) {
      problemSolvingPattern = 'test_driven_development';
    } else if (data.query.includes('refactor') || data.query.includes('clean')) {
      problemSolvingPattern = 'refactor_first';
    } else if (data.query.includes('example') || data.query.includes('tutorial')) {
      problemSolvingPattern = 'research_oriented';
    }
    
    // Update flow state
    await updateFlowState({ problemSolvingPattern });
  } catch (error) {
    logger.error(`Error handling search performed event: ${error.message}`);
  }
}

/**
 * Handle cursor activity event
 * @param {Object} data - Event data
 * @private
 */
async function handleCursorActivity(data) {
  try {
    if (!data) {
      return;
    }
    
    // Update last activity timestamp
    lastActivityTimestamp = Date.now();
    
    // Check if we need to update flow session
    if (currentFlowSession && Date.now() - currentFlowSession.lastActivityTime > CONFIG.MAX_SESSION_IDLE_TIME_MS) {
      // Current session has been idle for too long, end it and start a new one
      await endCurrentFlowSession();
      await startNewFlowSession();
    } else if (currentFlowSession) {
      // Update last activity time
      currentFlowSession.lastActivityTime = Date.now();
      await saveFlowSession(currentFlowSession);
    }
  } catch (error) {
    logger.error(`Error handling cursor activity event: ${error.message}`);
  }
}

/**
 * Handle conversation message event
 * @param {Object} data - Event data
 * @private
 */
async function handleConversationMessage(data) {
  try {
    if (!data || !data.message) {
      return;
    }
    
    // Add to interruption points
    currentFlowState.interruptionPoints.push({
      type: 'conversation',
      messageId: data.message.id,
      timestamp: Date.now()
    });
    
    // Limit to last 10 interruption points
    if (currentFlowState.interruptionPoints.length > 10) {
      currentFlowState.interruptionPoints.shift();
    }
    
    // Calculate cognitive load using enhanced estimation
    const cognitiveLoad = await estimateCognitiveLoad({
      eventType: 'conversation_message',
      data: data,
      messageContent: data.message?.content || '',
      messageType: data.message?.type || 'text'
    });
    
    // Update flow state with new cognitive load
    await updateFlowState({ cognitiveLoad });
  } catch (error) {
    logger.error(`Error handling conversation message event: ${error.message}`);
  }
}

/**
 * Handle conversation saved event
 * @param {Object} data - Event data
 * @private
 */
async function handleConversationSaved(data) {
  try {
    if (!data || !data.sessionId) {
      return;
    }
    
    // Add to flow session
    if (!currentFlowSession.conversationIds.includes(data.sessionId)) {
      currentFlowSession.conversationIds.push(data.sessionId);
      await saveFlowSession(currentFlowSession);
    }
    
    // Create link between flow session and conversation
    if (memoryGraphIntegration && typeof memoryGraphIntegration.createLinks === 'function') {
      await memoryGraphIntegration.createLinks(currentFlowSession.id, 'flow', [{
        id: data.sessionId,
        type: 'conversation',
        similarity: 1.0 // Direct link, not based on similarity
      }]);
    }
    
    // Add flow state to conversation metadata
    if (conversationCaptureService && typeof conversationCaptureService.updateConversationMetadata === 'function') {
      await conversationCaptureService.updateConversationMetadata(data.sessionId, {
        flowState: {
          sessionId: currentFlowSession.id,
          flowType: currentFlowState.flowType,
          cognitiveLoad: currentFlowState.cognitiveLoad,
          problemSolvingPattern: currentFlowState.problemSolvingPattern,
          timestamp: Date.now()
        }
      });
    }
  } catch (error) {
    logger.error(`Error handling conversation saved event: ${error.message}`);
  }
}

/**
 * End the current flow session
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function endCurrentFlowSession() {
  try {
    if (!currentFlowSession) {
      logger.warn('No active flow session to end');
      return false;
    }
    
    // Update end time
    currentFlowSession.endTime = Date.now();
    
    // Calculate cognitive load average
    if (currentFlowSession.flowStates.length > 0) {
      const flowStates = await getFlowStatesForSession(currentFlowSession.id);
      const cognitiveLoadSum = flowStates.reduce((sum, state) => sum + state.cognitiveLoad, 0);
      currentFlowSession.cognitiveLoadAverage = cognitiveLoadSum / flowStates.length;
      
      // Determine dominant flow state
      const flowTypeCounts = {};
      flowStates.forEach(state => {
        flowTypeCounts[state.flowType] = (flowTypeCounts[state.flowType] || 0) + 1;
      });
      
      let maxCount = 0;
      let dominantFlowState = null;
      
      for (const [flowType, count] of Object.entries(flowTypeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantFlowState = flowType;
        }
      }
      
      currentFlowSession.dominantFlowState = dominantFlowState;
      
      // Determine dominant problem solving pattern
      const patternCounts = {};
      flowStates.forEach(state => {
        if (state.problemSolvingPattern) {
          patternCounts[state.problemSolvingPattern] = (patternCounts[state.problemSolvingPattern] || 0) + 1;
        }
      });
      
      maxCount = 0;
      let dominantPattern = null;
      
      for (const [pattern, count] of Object.entries(patternCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantPattern = pattern;
        }
      }
      
      currentFlowSession.dominantProblemSolvingPattern = dominantPattern;
    }
    
    // Save to disk
    await saveFlowSession(currentFlowSession);
    
    // Emit event
    eventBus.emit('flow:session:ended', {
      sessionId: currentFlowSession.id,
      duration: currentFlowSession.endTime - currentFlowSession.startTime,
      cognitiveLoadAverage: currentFlowSession.cognitiveLoadAverage,
      dominantFlowState: currentFlowSession.dominantFlowState,
      dominantProblemSolvingPattern: currentFlowSession.dominantProblemSolvingPattern,
      timestamp: Date.now()
    });
    
    logger.info(`Ended flow session: ${currentFlowSession.id}`);
    
    return true;
  } catch (error) {
    logger.error(`Error ending flow session: ${error.message}`);
    return false;
  }
}

/**
 * Get flow states for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} Flow states
 * @private
 */
async function getFlowStatesForSession(sessionId) {
  try {
    const flowStatesPath = path.join(CONFIG.FLOW_DATA_DIR, CONFIG.FLOW_STATES_FILE);
    
    try {
      await fs.access(flowStatesPath);
    } catch (accessError) {
      logger.warn(`Flow states file not found: ${flowStatesPath}`);
      return [];
    }
    
    const statesContent = await fs.readFile(flowStatesPath, 'utf8');
    const states = statesContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .filter(state => state.sessionId === sessionId);
    
    return states;
  } catch (error) {
    logger.error(`Error getting flow states for session: ${error.message}`);
    return [];
  }
}

/**
 * Get the current flow state
 * @returns {Object} Current flow state
 */
function getCurrentFlowState() {
  return currentFlowState;
}

/**
 * Get the current flow session
 * @returns {Object} Current flow session
 */
function getCurrentFlowSession() {
  return currentFlowSession;
}

/**
 * Get all flow sessions
 * @returns {Promise<Array>} All flow sessions
 */
async function getAllFlowSessions() {
  try {
    const flowSessionsPath = path.join(CONFIG.FLOW_DATA_DIR, CONFIG.FLOW_SESSIONS_FILE);
    
    try {
      await fs.access(flowSessionsPath);
    } catch (accessError) {
      logger.warn(`Flow sessions file not found: ${flowSessionsPath}`);
      return [];
    }
    
    const sessionsContent = await fs.readFile(flowSessionsPath, 'utf8');
    const sessions = sessionsContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    return sessions;
  } catch (error) {
    logger.error(`Error getting all flow sessions: ${error.message}`);
    return [];
  }
}

/**
 * Get a flow session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Flow session
 */
async function getFlowSession(sessionId) {
  try {
    const sessions = await getAllFlowSessions();
    return sessions.find(session => session.id === sessionId);
  } catch (error) {
    logger.error(`Error getting flow session: ${error.message}`);
    return null;
  }
}

/**
 * Get flow sessions for a conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Array>} Flow sessions
 */
async function getFlowSessionsForConversation(conversationId) {
  try {
    const sessions = await getAllFlowSessions();
    return sessions.filter(session => session.conversationIds.includes(conversationId));
  } catch (error) {
    logger.error(`Error getting flow sessions for conversation: ${error.message}`);
    return [];
  }
}

/**
 * Estimate cognitive load based on multiple factors with time-weighted averaging
 * @param {Object} params - Parameters for estimation
 * @returns {Promise<number>} Estimated cognitive load (0-1)
 * @private
 */
async function estimateCognitiveLoad(params) {
  try {
    if (!currentFlowState) return 0.3; // Default if no flow state
    
    const currentLoad = currentFlowState.cognitiveLoad;
    let newLoadEstimate = currentLoad;
    
    // Factor 1: File save frequency
    if (params.eventType === 'file_saved' && params.recentSaves) {
      const saveConfig = CONFIG.COGNITIVE_LOAD_INDICATORS.FILE_SAVE_FREQUENCY;
      const saveCount = params.recentSaves.length;
      
      if (saveCount >= saveConfig.highThreshold) {
        // High frequency indicates higher cognitive load
        newLoadEstimate += saveConfig.weight * 0.2;
      } else if (saveCount <= saveConfig.lowThreshold) {
        // Low frequency may indicate lower cognitive load
        newLoadEstimate -= saveConfig.weight * 0.1;
      }
    }
    
    // Factor 2: Conversation complexity
    if (params.eventType === 'conversation_message' && params.messageContent) {
      const conversationConfig = CONFIG.COGNITIVE_LOAD_INDICATORS.CONVERSATION_COMPLEXITY;
      const { messageContent } = params;
      
      // Analyze message complexity
      const messageLength = messageContent.length;
      const normalizedLength = Math.min(messageLength / 500, 1); // Normalize to 0-1
      
      // Count technical terms
      const words = messageContent.toLowerCase().split(/\W+/);
      const technicalTermCount = words.filter(word => technicalTerms.has(word)).length;
      const normalizedTermCount = Math.min(technicalTermCount / 10, 1); // Normalize to 0-1
      
      // Calculate complexity score
      const complexityScore = 
        (normalizedLength * conversationConfig.complexityFactors.messageLength) +
        (normalizedTermCount * conversationConfig.complexityFactors.technicalTerms);
      
      // Adjust load based on complexity
      newLoadEstimate += conversationConfig.weight * complexityScore * 0.3;
    }
    
    // Factor 3: Context switching
    const recentSwitches = recentContextSwitches
      .filter(cs => Date.now() - cs.timestamp < CONFIG.COGNITIVE_LOAD_INDICATORS.CONTEXT_SWITCHING.timeWindow)
      .length;
    
    const switchConfig = CONFIG.COGNITIVE_LOAD_INDICATORS.CONTEXT_SWITCHING;
    if (recentSwitches >= switchConfig.highThreshold) {
      // Frequent context switching indicates higher cognitive load
      newLoadEstimate += switchConfig.weight * 0.2;
    } else if (recentSwitches <= switchConfig.lowThreshold) {
      // Minimal context switching may indicate flow state (lower cognitive load)
      newLoadEstimate -= switchConfig.weight * 0.05;
    }
    
    // Apply bounds
    newLoadEstimate = Math.max(0.1, Math.min(0.9, newLoadEstimate));
    
    // Apply time-weighted smoothing
    const smoothingFactor = CONFIG.COGNITIVE_LOAD_SMOOTHING_FACTOR;
    const smoothedLoad = (currentLoad * smoothingFactor) + (newLoadEstimate * (1 - smoothingFactor));
    
    // Store in history for trend analysis
    cognitiveLoadHistory.push({
      timestamp: Date.now(),
      value: smoothedLoad,
      trigger: params.eventType
    });
    
    // Keep history at reasonable size
    if (cognitiveLoadHistory.length > 100) {
      cognitiveLoadHistory.shift();
    }
    
    logger.debug(`Cognitive load estimated: ${smoothedLoad.toFixed(2)} (from ${currentLoad.toFixed(2)})`);
    return smoothedLoad;
  } catch (error) {
    logger.error(`Error estimating cognitive load: ${error.message}`);
    return currentFlowState ? currentFlowState.cognitiveLoad : 0.3;
  }
}

/**
 * Get cognitive load history
 * @param {number} timeWindowMs - Time window in milliseconds
 * @returns {Array} Cognitive load history entries
 */
function getCognitiveLoadHistory(timeWindowMs = 30 * 60 * 1000) {
  const cutoffTime = Date.now() - timeWindowMs;
  return cognitiveLoadHistory.filter(entry => entry.timestamp >= cutoffTime);
}

module.exports = {
  initialize,
  updateFlowState,
  getCurrentFlowState,
  getCurrentFlowSession,
  getAllFlowSessions,
  getFlowSession,
  getFlowSessionsForConversation,
  getCognitiveLoadHistory,
  isInitialized: () => isInitialized
};
