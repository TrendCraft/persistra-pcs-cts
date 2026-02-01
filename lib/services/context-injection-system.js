/**
 * Context Injection System
 * 
 * This module provides a direct injection mechanism for inserting critical context
 * into new sessions after token boundaries. It works in conjunction with the
 * context preservation system to maintain cognitive continuity across token sessions.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'context-injection-system';

// Create logger
const logger = createComponentLogger(COMPONENT_NAME);

// Import required services
let contextPreservationSystem;
let metaPromptingLayer;
let configService;

// Track initialization state
let isInitialized = false;

// Configuration defaults
const DEFAULT_CONFIG = {
  INJECTION_ENABLED: true,
  AUTO_INJECTION_ON_SESSION_START: true,
  INJECTION_FORMAT: 'cognitive-continuity', // 'cognitive-continuity', 'standard', 'minimal'
  MAX_INJECTION_SIZE_BYTES: 1024 * 1024 // 1MB
};

// Configuration
let CONFIG = { ...DEFAULT_CONFIG };

// Injection state
const injectionState = {
  isInjecting: false,
  lastInjectionTime: null,
  injectionCount: 0,
  failedInjectionCount: 0,
  lastInjectedContext: null
};

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  try {
    if (configService && typeof configService.get === 'function') {
      CONFIG.INJECTION_ENABLED = configService.get(
        'contextInjection.enabled',
        DEFAULT_CONFIG.INJECTION_ENABLED
      );
      
      CONFIG.AUTO_INJECTION_ON_SESSION_START = configService.get(
        'contextInjection.autoInjectOnSessionStart',
        DEFAULT_CONFIG.AUTO_INJECTION_ON_SESSION_START
      );
      
      CONFIG.INJECTION_FORMAT = configService.get(
        'contextInjection.format',
        DEFAULT_CONFIG.INJECTION_FORMAT
      );
      
      CONFIG.MAX_INJECTION_SIZE_BYTES = configService.get(
        'contextInjection.maxSizeBytes',
        DEFAULT_CONFIG.MAX_INJECTION_SIZE_BYTES
      );
      
      logger.info('Configuration initialized from config service');
    } else {
      logger.warn('Config service not available, using default values');
    }
  } catch (error) {
    logger.error(`Error initializing configuration: ${error.message}`);
  }
}

/**
 * Format context for injection
 * @param {Object} context - Context to format
 * @returns {Object} Formatted context
 * @private
 */
function formatContextForInjection(context) {
  if (!context) {
    return null;
  }
  
  // Check if context is already in the right format
  if (context.cognitiveState && context.cognitiveState.yourPreviousUnderstanding) {
    return context;
  }
  
  // Format based on configuration
  switch (CONFIG.INJECTION_FORMAT) {
    case 'cognitive-continuity':
      return formatAsCognitiveMarkers(context);
    case 'minimal':
      return formatAsMinimal(context);
    case 'standard':
    default:
      return formatAsStandard(context);
  }
}

/**
 * Format context with cognitive continuity markers
 * @param {Object} context - Context to format
 * @returns {Object} Formatted context
 * @private
 */
function formatAsCognitiveMarkers(context) {
  const formatted = {
    sessionMetadata: context.sessionMetadata || {},
    cognitiveState: {
      yourPreviousUnderstanding: {}
    }
  };
  
  // Extract project structure
  if (context.projectStructure) {
    formatted.cognitiveState.yourPreviousUnderstanding.projectStructure = {
      description: 'Your previous understanding of the project structure included:',
      data: context.projectStructure
    };
  }
  
  // Extract current implementation
  if (context.currentImplementation) {
    formatted.cognitiveState.yourPreviousUnderstanding.currentImplementation = {
      description: 'You were working on implementing:',
      data: context.currentImplementation
    };
  }
  
  // Extract recent decisions
  if (context.recentDecisions) {
    formatted.cognitiveState.yourPreviousUnderstanding.recentDecisions = {
      description: 'Your recent implementation decisions included:',
      data: context.recentDecisions
    };
  }
  
  // Extract development history
  if (context.developmentHistory) {
    formatted.cognitiveState.yourPreviousUnderstanding.developmentHistory = {
      description: 'Your understanding of the development history included:',
      data: context.developmentHistory
    };
  }
  
  // Extract conversation history
  if (context.conversationHistory) {
    formatted.cognitiveState.yourPreviousUnderstanding.conversationHistory = {
      description: 'Your recent conversation with the user included:',
      data: context.conversationHistory
    };
  }
  
  return formatted;
}

/**
 * Format context as standard
 * @param {Object} context - Context to format
 * @returns {Object} Formatted context
 * @private
 */
function formatAsStandard(context) {
  return {
    sessionMetadata: context.sessionMetadata || {},
    preservedContext: context
  };
}

/**
 * Format context as minimal
 * @param {Object} context - Context to format
 * @returns {Object} Formatted context
 * @private
 */
function formatAsMinimal(context) {
  const minimal = {
    sessionMetadata: context.sessionMetadata || {},
    essentialContext: {}
  };
  
  // Include only the most essential context
  if (context.currentImplementation) {
    minimal.essentialContext.currentImplementation = context.currentImplementation;
  }
  
  if (context.recentDecisions) {
    minimal.essentialContext.recentDecisions = context.recentDecisions;
  }
  
  return minimal;
}

/**
 * Inject context into meta-prompting layer
 * @param {Object} context - Context to inject
 * @returns {Promise<Object>} Injection result
 * @private
 */
async function injectContextIntoMetaPromptingLayer(context) {
  try {
    // Access the metaPromptLayer property from the imported module
    if (!metaPromptingLayer || !metaPromptingLayer.metaPromptLayer || typeof metaPromptingLayer.metaPromptLayer.injectPreservedContext !== 'function') {
      throw new Error('Meta-prompting layer not available or missing injectPreservedContext function');
    }
    
    // Format context for injection
    const formattedContext = formatContextForInjection(context);
    
    // Check size constraints
    const contextSize = JSON.stringify(formattedContext).length;
    if (contextSize > CONFIG.MAX_INJECTION_SIZE_BYTES) {
      logger.warn(`Context size (${contextSize} bytes) exceeds maximum (${CONFIG.MAX_INJECTION_SIZE_BYTES} bytes), truncating`);
      // TODO: Implement intelligent truncation
    }
    
    // Inject context using the metaPromptLayer property
    const result = await metaPromptingLayer.metaPromptLayer.injectPreservedContext(formattedContext);
    
    if (!result.success) {
      throw new Error(result.error || 'Unknown error injecting context');
    }
    
    // Update injection state
    injectionState.isInjecting = false;
    injectionState.lastInjectionTime = Date.now();
    injectionState.injectionCount++;
    injectionState.lastInjectedContext = formattedContext;
    
    // Emit event
    eventBus.emit('context-injection:injected', {
      timestamp: Date.now(),
      contextSize
    });
    
    logger.info(`Context injected successfully (${contextSize} bytes)`);
    
    return {
      success: true,
      timestamp: Date.now(),
      contextSize
    };
  } catch (error) {
    // Update injection state
    injectionState.isInjecting = false;
    injectionState.failedInjectionCount++;
    
    // Emit event
    eventBus.emit('context-injection:failed', {
      timestamp: Date.now(),
      error: error.message
    });
    
    logger.error(`Error injecting context: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Register event handlers
 * @private
 */
function registerEventHandlers() {
  // Handle context restored event
  eventBus.on('context-preservation:restored', async (data) => {
    if (!isInitialized || !CONFIG.AUTO_INJECTION_ON_SESSION_START || injectionState.isInjecting) {
      return;
    }
    
    logger.info('Context restored, auto-injecting into new session');
    
    try {
      injectionState.isInjecting = true;
      await injectContextIntoMetaPromptingLayer(data.context);
    } catch (error) {
      logger.error(`Error auto-injecting context: ${error.message}`);
      injectionState.isInjecting = false;
      injectionState.failedInjectionCount++;
    }
  }, COMPONENT_NAME);
  
  // Handle session start event
  eventBus.on('session-boundary-manager:session-start', async (data) => {
    if (!isInitialized || !CONFIG.AUTO_INJECTION_ON_SESSION_START || injectionState.isInjecting) {
      return;
    }
    
    logger.info(`New session started (${data.sessionId}), retrieving and injecting context`);
    
    try {
      injectionState.isInjecting = true;
      
      // Retrieve context if not already provided
      if (!contextPreservationSystem || typeof contextPreservationSystem.restoreContext !== 'function') {
        throw new Error('Context preservation system not available or missing restoreContext function');
      }
      
      const previousSessionId = data.previousSessionId;
      const result = await contextPreservationSystem.restoreContext({
        sessionId: previousSessionId
      });
      
      if (!result.success || !result.context) {
        throw new Error(result.error || 'Failed to restore context');
      }
      
      // Inject context
      await injectContextIntoMetaPromptingLayer(result.context);
    } catch (error) {
      logger.error(`Error retrieving and injecting context: ${error.message}`);
      injectionState.isInjecting = false;
      injectionState.failedInjectionCount++;
    }
  }, COMPONENT_NAME);
}

/**
 * Initialize the context injection system
 * @param {Object} options - Initialization options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  if (isInitialized) {
    logger.warn('Context injection system already initialized');
    return true;
  }
  
  try {
    logger.info('Initializing context injection system');
    
    // Import dependencies
    try {
      contextPreservationSystem = require('./context-preservation-system');
      metaPromptingLayer = require('../integration/meta-prompt-layer');
      configService = require('./config-service');
    } catch (error) {
      logger.warn(`Error importing dependencies: ${error.message}`);
    }
    
    // Initialize configuration
    initializeConfig();
    
    // Register event handlers
    registerEventHandlers();
    
    // Update initialization state
    isInitialized = true;
    
    // Emit initialization event
    eventBus.emit('context-injection:initialized', {
      timestamp: Date.now()
    });
    
    logger.info('Context injection system initialized successfully');
    
    return true;
  } catch (error) {
    logger.error(`Error initializing context injection system: ${error.message}`);
    return false;
  }
}

/**
 * Inject context manually
 * @param {Object} options - Injection options
 * @param {Object} [options.context] - Context to inject (if not provided, latest preserved context will be used)
 * @param {string} [options.sessionId] - Specific session ID to retrieve context from
 * @returns {Promise<Object>} Injection result
 */
async function injectContext(options = {}) {
  if (!isInitialized) {
    return {
      success: false,
      error: 'Context injection system not initialized'
    };
  }
  
  if (injectionState.isInjecting) {
    return {
      success: false,
      error: 'Context injection already in progress'
    };
  }
  
  try {
    logger.info('Manual context injection requested');
    
    injectionState.isInjecting = true;
    
    // Use provided context or retrieve latest
    let context = options.context;
    if (!context) {
      if (!contextPreservationSystem || typeof contextPreservationSystem.restoreContext !== 'function') {
        throw new Error('Context preservation system not available or missing restoreContext function');
      }
      
      const result = await contextPreservationSystem.restoreContext({
        sessionId: options.sessionId
      });
      
      if (!result.success || !result.context) {
        throw new Error(result.error || 'Failed to restore context');
      }
      
      context = result.context;
    }
    
    // Inject context
    return await injectContextIntoMetaPromptingLayer(context);
  } catch (error) {
    injectionState.isInjecting = false;
    injectionState.failedInjectionCount++;
    
    logger.error(`Error during manual context injection: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Get injection status
 * @returns {Object} Injection status
 */
function getStatus() {
  return {
    isInitialized,
    isInjecting: injectionState.isInjecting,
    lastInjectionTime: injectionState.lastInjectionTime,
    injectionCount: injectionState.injectionCount,
    failedInjectionCount: injectionState.failedInjectionCount,
    injectionEnabled: CONFIG.INJECTION_ENABLED,
    autoInjectionEnabled: CONFIG.AUTO_INJECTION_ON_SESSION_START,
    injectionFormat: CONFIG.INJECTION_FORMAT
  };
}

// Export the context injection system
module.exports = {
  // Core functions
  initialize,
  injectContext,
  getStatus,
  
  // Status check
  isInitialized: () => isInitialized
};
