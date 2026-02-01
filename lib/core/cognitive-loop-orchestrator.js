/**
 * Cognitive Loop Orchestrator
 * 
 * Orchestrates the cognitive loop that maintains continuity across token boundaries.
 * This component coordinates the extraction, preservation, retrieval, and injection
 * of context to ensure cognitive continuity.
 * 
 * IMPORTANT: This module has been fixed to avoid circular dependencies.
 */

const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'cognitive-loop-orchestrator';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// State variables
let initialized = false;
let initializing = false;
let metaPromptLayer = null;
let contextPreservationSystem = null;
let semanticContextManager = null;
let sessionBoundaryManager = null;
let lastError = null;
let preservationActive = false;
let lastPreservationTime = null;
let loopPhase = 'idle';

/**
 * Set up periodic boundary checks
 * @private
 */
function _setupBoundaryChecks() {
  // Subscribe to boundary events
  eventBus.on('boundary:approaching', _boundaryCheckHandler, COMPONENT_NAME);
}

/**
 * Handle token boundary approaching event
 * @private
 * @param {Object} data - Event data
 */
function _boundaryCheckHandler(data) {
  if (!initialized || preservationActive) {
    return;
  }
  
  // If boundary is critical, preserve context immediately
  if (data.status === 'critical' && data.percentage >= 0.8) {
    logger.info('Critical boundary approaching, preserving context');
    _preserveContext();
  }
}

/**
 * Preserve context before token boundary
 * @private
 */
async function _preserveContext() {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, cannot preserve context`);
    return;
  }
  
  if (preservationActive) {
    logger.info('Context preservation already in progress');
    return;
  }
  
  preservationActive = true;
  loopPhase = 'preservation';
  
  try {
    // Extract context
    if (semanticContextManager && typeof semanticContextManager.extractContext === 'function') {
      const contextResult = await semanticContextManager.extractContext();
      
      if (!contextResult.success) {
        logger.warn(`Failed to extract context: ${contextResult.error || 'Unknown error'}`);
        return;
      }
      
      // Preserve context
      if (contextPreservationSystem && typeof contextPreservationSystem.preserveContext === 'function') {
        const preservationResult = await contextPreservationSystem.preserveContext({
          context: contextResult.context,
          timestamp: Date.now(),
          sessionId: sessionBoundaryManager && typeof sessionBoundaryManager.getCurrentSession === 'function' ? 
            sessionBoundaryManager.getCurrentSession().id : 'unknown'
        });
        
        if (preservationResult.success) {
          logger.info('Context preserved successfully');
          lastPreservationTime = Date.now();
          
          // Emit event
          eventBus.emit('context:preserved', {
            timestamp: lastPreservationTime,
            size: preservationResult.size || 0
          }, COMPONENT_NAME);
        } else {
          logger.warn(`Context preservation failed: ${preservationResult.error || 'Unknown error'}`);
        }
      } else {
        logger.warn('Context preservation system not available');
      }
    } else {
      logger.warn('Semantic context manager not available');
    }
  } catch (error) {
    logger.error(`Error preserving context: ${error.message}`, error);
  } finally {
    preservationActive = false;
    loopPhase = 'idle';
  }
}

/**
 * Initialize the cognitive loop orchestrator
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
async function initialize(options = {}) {
  if (initialized) {
    logger.info('Cognitive loop orchestrator already initialized');
    return { success: true, message: 'Already initialized' };
  }

  if (initializing) {
    logger.info('Cognitive loop orchestrator initialization already in progress');
    return { success: false, error: 'Initialization in progress' };
  }

  initializing = true;

  try {
    logger.info('Initializing cognitive loop orchestrator');

    // Set up dependencies
    metaPromptLayer = options.metaPromptLayer || null;
    contextPreservationSystem = options.contextPreservationSystem || null;
    semanticContextManager = options.semanticContextManager || null;
    sessionBoundaryManager = options.sessionBoundaryManager || null;

    // Check for missing dependencies
    if (!metaPromptLayer) {
      logger.warn('Meta prompt layer not provided');
    }

    if (!contextPreservationSystem) {
      logger.warn('Context preservation system not provided');
    }

    if (!semanticContextManager) {
      logger.warn('Semantic context manager not provided');
    }

    if (!sessionBoundaryManager) {
      logger.warn('Session boundary manager not provided');
    }

    // Set up boundary checks
    _setupBoundaryChecks();

    // Set initialization state
    initialized = true;
    initializing = false;

    logger.info('Cognitive loop orchestrator initialized successfully');

    // Emit initialization event
    eventBus.emit('cognitive-loop-orchestrator:initialized', {
      timestamp: Date.now()
    }, COMPONENT_NAME);

    return { success: true, message: 'Initialized successfully' };
  } catch (error) {
    lastError = error;
    initializing = false;
    logger.error(`Error initializing cognitive loop orchestrator: ${error.message}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieve and inject context after token boundary
 * @returns {Promise<Object>} Retrieval result
 */
async function retrieveAndInjectContext() {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, cannot retrieve context`);
    return { success: false, error: 'Not initialized' };
  }
  
  loopPhase = 'retrieval';
  
  try {
    // Retrieve context
    if (!contextPreservationSystem || typeof contextPreservationSystem.restoreContext !== 'function') {
      logger.warn('Context preservation system not available');
      return { success: false, error: 'Context preservation system not available' };
    }
    
    const retrievalResult = await contextPreservationSystem.restoreContext();
    
    if (!retrievalResult || !retrievalResult.success || !retrievalResult.context) {
      logger.warn('No context available for retrieval');
      return { success: false, error: 'No context available' };
    }
    
    // Process retrieved context through meta-prompt layer
    let enhancedContext = retrievalResult.context;
    
    if (metaPromptLayer && typeof metaPromptLayer.processResponse === 'function') {
      enhancedContext = await metaPromptLayer.processResponse(retrievalResult.context);
    }
    
    // Update current context
    if (semanticContextManager && typeof semanticContextManager.updateContext === 'function') {
      await semanticContextManager.updateContext(enhancedContext);
    }
    
    logger.info('Context retrieved and injected successfully');
    
    // Emit event
    eventBus.emit('context:injected', {
      timestamp: Date.now(),
      size: retrievalResult.size || 0
    }, COMPONENT_NAME);
    
    return { 
      success: true,
      context: enhancedContext,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error(`Error retrieving and injecting context: ${error.message}`, error);
    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    };
  } finally {
    loopPhase = 'idle';
  }
}

/**
 * Extract context from the semantic context manager
 * @returns {Promise<Object>} Extraction result
 */
async function extractContext() {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, cannot extract context`);
    return { success: false, error: 'Not initialized' };
  }
  
  try {
    // Get current context from semantic context manager
    if (!semanticContextManager || typeof semanticContextManager.getCurrentContext !== 'function') {
      logger.warn('Semantic context manager not available');
      return { success: false, error: 'Semantic context manager not available' };
    }
    
    const contextResult = await semanticContextManager.getCurrentContext();
    
    if (!contextResult || !contextResult.success || !contextResult.context) {
      logger.warn('No context available for extraction');
      return { success: false, error: 'No context available' };
    }
    
    logger.info('Context extracted successfully');
    
    return { 
      success: true,
      context: contextResult.context,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error(`Error extracting context: ${error.message}`, error);
    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Preserve context for token boundary crossing
 * @param {Object} [context] - Optional context to preserve, if not provided will extract from semantic context manager
 * @returns {Promise<Object>} Preservation result
 */
async function preserveContext(context = null) {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, cannot preserve context`);
    return { success: false, error: 'Not initialized' };
  }
  
  preservationActive = true;
  loopPhase = 'preservation';
  
  try {
    // Use provided context or extract from semantic context manager
    let contextToPreserve = context;
    
    if (!contextToPreserve) {
      const extractionResult = await extractContext();
      if (!extractionResult.success) {
        return extractionResult; // Forward the error
      }
      contextToPreserve = extractionResult.context;
    }
    
    // Preserve context using context preservation system
    if (!contextPreservationSystem || typeof contextPreservationSystem.preserveContext !== 'function') {
      logger.warn('Context preservation system not available');
      return { success: false, error: 'Context preservation system not available' };
    }
    
    const preservationResult = await contextPreservationSystem.preserveContext({
      context: contextToPreserve,
      force: true
    });
    
    if (preservationResult.success) {
      logger.info('Context preserved successfully');
      lastPreservationTime = Date.now();
      
      // Emit event
      eventBus.emit('context:preserved', {
        timestamp: lastPreservationTime,
        size: preservationResult.size || 0,
        filePath: preservationResult.filePath
      }, COMPONENT_NAME);
    } else {
      logger.warn(`Context preservation failed: ${preservationResult.error || 'Unknown error'}`);
    }
    
    return preservationResult;
  } catch (error) {
    logger.error(`Error preserving context: ${error.message}`, error);
    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    };
  } finally {
    preservationActive = false;
    loopPhase = 'idle';
  }
}

/**
 * Restore context after token boundary
 * @returns {Promise<Object>} Restoration result
 */
async function restoreContext() {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, cannot restore context`);
    return { success: false, error: 'Not initialized' };
  }
  
  try {
    // Restore context using context preservation system
    if (!contextPreservationSystem || typeof contextPreservationSystem.restoreContext !== 'function') {
      logger.warn('Context preservation system not available');
      return { success: false, error: 'Context preservation system not available' };
    }
    
    const restorationResult = await contextPreservationSystem.restoreContext();
    
    if (restorationResult.success) {
      logger.info('Context restored successfully');
      
      // Emit event
      eventBus.emit('context:restored', {
        timestamp: Date.now(),
        size: restorationResult.size || 0
      }, COMPONENT_NAME);
    } else {
      logger.warn(`Context restoration failed: ${restorationResult.error || 'Unknown error'}`);
    }
    
    return restorationResult;
  } catch (error) {
    logger.error(`Error restoring context: ${error.message}`, error);
    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Inject context into a prompt
 * @param {Object} [context] - Optional context to inject, if not provided will use restored context
 * @returns {Promise<Object>} Injection result
 */
async function injectContext(context = null) {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, cannot inject context`);
    return { success: false, error: 'Not initialized' };
  }
  
  try {
    // Use provided context or restore from context preservation system
    let contextToInject = context;
    
    if (!contextToInject) {
      const restorationResult = await restoreContext();
      if (!restorationResult.success) {
        return restorationResult; // Forward the error
      }
      contextToInject = restorationResult.context;
    }
    
    // Inject context using meta-prompt layer
    if (!metaPromptLayer || typeof metaPromptLayer.enhancePrompt !== 'function') {
      logger.warn('Meta prompt layer not available');
      return { success: false, error: 'Meta prompt layer not available' };
    }
    
    const enhancedPrompt = await metaPromptLayer.enhancePrompt('', {
      context: contextToInject
    });
    
    logger.info('Context injected successfully');
    
    return { 
      success: true,
      enhancedPrompt,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error(`Error injecting context: ${error.message}`, error);
    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Enhance a prompt with preserved context
 * @param {string} prompt - Original prompt
 * @returns {Promise<string>} Enhanced prompt
 */
async function enhancePrompt(prompt) {
  if (!initialized) {
    logger.warn(`${COMPONENT_NAME} not initialized, returning original prompt`);
    return prompt;
  }
  
  try {
    // Check if we need to retrieve context first
    if (sessionBoundaryManager && typeof sessionBoundaryManager.isNewSession === 'function' && sessionBoundaryManager.isNewSession()) {
      logger.info('New session detected, retrieving context');
      await retrieveAndInjectContext();
    }
    
    // Use meta-prompt layer to enhance the prompt
    if (metaPromptLayer && typeof metaPromptLayer.enhancePrompt === 'function') {
      return await metaPromptLayer.enhancePrompt(prompt);
    } else {
      logger.warn('Meta prompt layer not available, returning original prompt');
      return prompt;
    }
  } catch (error) {
    logger.error(`Error enhancing prompt: ${error.message}`, error);
    return prompt;
  }
}

/**
 * Get service status
 * @returns {Object} Service status
 */
function getStatus() {
  return {
    initialized,
    initializing,
    lastError: lastError ? lastError.message : null,
    preservationActive,
    lastPreservationTime,
    loopPhase,
    dependencies: {
      metaPromptLayer: metaPromptLayer ? true : false,
      contextPreservationSystem: contextPreservationSystem ? true : false,
      semanticContextManager: semanticContextManager ? true : false,
      sessionBoundaryManager: sessionBoundaryManager ? true : false
    },
    timestamp: Date.now()
  };
}

// Export the module
module.exports = {
  initialize,
  retrieveAndInjectContext,
  extractContext,
  preserveContext,
  restoreContext,
  injectContext,
  enhancePrompt,
  getStatus
};