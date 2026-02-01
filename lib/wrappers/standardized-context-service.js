/**
 * Standardized Context Service
 * 
 * This wrapper provides a standardized interface for context retrieval,
 * abstracting away the implementation details of the enhanced context retrieval service
 * and adaptive context selector.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const enhancedContextRetrieval = require('../services/enhanced-context-retrieval');
const AdaptiveContextSelector = require('../services/adaptive-context-selector');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'standardized-context-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Adaptive context selector instance
let adaptiveContextSelector = null;

/**
 * Initialize the standardized context service
 * @param {Object} options - Initialization options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    // Prevent duplicate initialization
    if (module.exports.isInitialized) {
      logger.info('Standardized context service already initialized');
      return true;
    }
    
    logger.info('Initializing standardized context service...');
    
    // Initialize enhanced context retrieval with dependency-aware approach
    logger.info('Initializing enhanced context retrieval dependency...');
    const enhancedInitResult = await enhancedContextRetrieval.initialize(options);
    if (!enhancedInitResult) {
      logger.warn('Enhanced context retrieval initialization failed, but will continue with limited functionality');
    } else {
      logger.info('Enhanced context retrieval initialized successfully');
    }
    
    // Initialize adaptive context selector
    try {
      adaptiveContextSelector = new AdaptiveContextSelector(options);
      logger.info('Adaptive context selector initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize adaptive context selector: ${error.message}`);
      logger.warn('Will continue without adaptive context selection capabilities');
    }
    
    // Update initialization status
    module.exports.isInitialized = true;
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    logger.info('Standardized context service initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Standardized context service initialization failed: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to initialize standardized context service', 
      error: error.message 
    });
    
    return false;
  }
}

/**
 * Create a default result when context retrieval fails
 * @param {string} query - The original query
 * @param {string} [errorMessage] - Optional error message to include
 * @returns {Object} A default context result
 * @private
 */
function _createDefaultResult(query, errorMessage = '') {
  return {
    codeContext: '',
    conversationContext: '',
    narrativeContext: '',
    enhancedContext: `# Enhanced Leo Context\n\n## Your Query\n${query}\n\n${errorMessage ? `## Error\n${errorMessage}\n\n` : ''}## Note\nNo relevant context found for this query.\n\n## Instructions\nPlease answer the query based on your general knowledge.\n\n`,
    metadata: {
      source: 'fallback',
      timestamp: Date.now(),
      query,
      error: errorMessage || undefined
    }
  };
}

/**
 * Retrieve context using the standardized interface
 * @param {string} query - The query text
 * @param {Object} options - Retrieval options
 * @returns {Promise<Object>} Context result in standardized format
 */
async function retrieveContext(query, options = {}) {
  // Start timing for performance monitoring
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid query: Query must be a non-empty string');
    }
    
    logger.info(`Retrieving context for query: "${query.substring(0, 30)}..."`);
    
    // Check if service is initialized
    if (!module.exports.isInitialized) {
      logger.warn('Standardized context service not initialized, attempting to initialize');
      const initResult = await initialize();
      if (!initResult) {
        logger.error('Failed to initialize standardized context service');
        return _createDefaultResult(query, 'Service not initialized properly');
      }
    }
    
    // Extract standardized options with defaults
    const {
      maxCodeItems = 10,
      maxConversationItems = 5,
      maxNarrativeItems = 3,
      similarityThreshold = 0.65,
      includeCodeContext = true,
      includeConversationContext = true,
      includeNarrativeContext = true,
      signal = null,
      useCache = true,
      useAdaptiveSelector = true
    } = options;
    
    // Log options
    logger.info('Using context retrieval options:', {
      maxCodeItems,
      maxConversationItems,
      maxNarrativeItems,
      similarityThreshold,
      includeCodeContext,
      includeConversationContext,
      includeNarrativeContext,
      useAdaptiveSelector
    });
    
    // Check for abort signal before starting
    if (signal && signal.aborted) {
      const abortError = new Error('Context retrieval aborted before starting');
      abortError.name = 'AbortError';
      throw abortError;
    }
    
    // Try adaptive context selector first if enabled and available
    if (useAdaptiveSelector && adaptiveContextSelector) {
      try {
        logger.info('Using adaptive context selector');
        
        // Prepare standardized options for adaptive context selector
        const adaptiveOptions = {
          // Core options
          similarityThreshold,
          signal,
          
          // Context limits
          maxCodeItems,
          maxConversationItems,
          maxNarrativeItems,
          
          // Inclusion flags
          includeCodeContext,
          includeConversationContext,
          includeNarrativeContext,
          
          // Cache options
          useCache
        };
        
        // Get context using adaptive selection
        const adaptiveResult = await adaptiveContextSelector.selectContext(query, adaptiveOptions);
        
        // Process the result
        if (adaptiveResult && typeof adaptiveResult === 'object') {
          // If it already has enhancedContext, return it with standardized metadata
          if (adaptiveResult.enhancedContext) {
            logger.info('Using pre-formatted enhanced context from adaptive context selector');
            
            // Ensure standardized metadata
            return {
              ...adaptiveResult,
              metadata: {
                ...adaptiveResult.metadata,
                source: 'adaptive',
                processingTime: Date.now() - startTime,
                timestamp: Date.now()
              }
            };
          }
          
          // If it has context components but no enhancedContext, build it
          if (adaptiveResult.codeContext !== undefined || 
              adaptiveResult.conversationContext !== undefined || 
              adaptiveResult.narrativeContext !== undefined) {
            
            logger.info('Building enhanced context from individual context components');
            
            // Create a basic enhanced context from the components
            const enhancedContext = `# Enhanced Leo Context\n\n## Your Query\n${query}\n\n` +
              (adaptiveResult.codeContext ? `## Code Context\n${adaptiveResult.codeContext}\n\n` : '') +
              (adaptiveResult.conversationContext ? `## Conversation Context\n${adaptiveResult.conversationContext}\n\n` : '') +
              (adaptiveResult.narrativeContext ? `## Narrative Context\n${adaptiveResult.narrativeContext}\n\n` : '') +
              `## Instructions\nPlease use the provided context to answer the query. If the context doesn't contain all the necessary information, use your general knowledge but acknowledge when you're doing so.\n\n`;
            
            return {
              ...adaptiveResult,
              enhancedContext,
              metadata: {
                ...adaptiveResult.metadata,
                source: 'adaptive',
                processingTime: Date.now() - startTime,
                timestamp: Date.now()
              }
            };
          }
        }
      } catch (error) {
        // Check if this was an abort error
        if (error.name === 'AbortError') {
          logger.warn('Adaptive context selection was aborted');
          throw error; // Re-throw abort errors
        }
        
        logger.error(`Adaptive context selection failed: ${error.message}`);
        // Fall through to enhanced context retrieval
      }
    }
    
    // Fall back to enhanced context retrieval
    try {
      logger.info('Using enhanced context retrieval service');
      
      // Convert options to format expected by enhanced context retrieval
      const enhancedOptions = {
        maxCodeItems,
        maxConversationItems,
        maxNarrativeItems,
        similarityThreshold,
        includeCodeContext,
        includeConversationContext,
        includeNarrativeContext,
        signal,
        useCache
      };
      
      // Get context using enhanced context retrieval
      const result = await enhancedContextRetrieval.retrieveContext(query, enhancedOptions);
      
      // Ensure result has all required properties
      if (result && typeof result === 'object') {
        // If it already has enhancedContext, return it with standardized metadata
        if (result.enhancedContext) {
          return {
            ...result,
            metadata: {
              ...result.metadata,
              source: 'enhanced',
              processingTime: Date.now() - startTime,
              timestamp: Date.now()
            }
          };
        }
        
        // If it has context components but no enhancedContext, build it
        if (result.codeContext || result.conversationContext || result.narrativeContext) {
          const enhancedContext = `# Enhanced Leo Context\n\n## Your Query\n${query}\n\n` +
            (result.codeContext ? `## Code Context\n${result.codeContext}\n\n` : '') +
            (result.conversationContext ? `## Conversation Context\n${result.conversationContext}\n\n` : '') +
            (result.narrativeContext ? `## Narrative Context\n${result.narrativeContext}\n\n` : '') +
            `## Instructions\nPlease use the provided context to answer the query. If the context doesn't contain all the necessary information, use your general knowledge but acknowledge when you're doing so.\n\n`;
          
          return {
            ...result,
            enhancedContext,
            metadata: {
              ...result.metadata,
              source: 'enhanced',
              processingTime: Date.now() - startTime,
              timestamp: Date.now()
            }
          };
        }
      }
      
      // If result is invalid, return default
      logger.warn('Enhanced context retrieval returned an invalid result');
      return _createDefaultResult(query, 'Invalid context retrieval result');
    } catch (error) {
      // Check if this was an abort error
      if (error.name === 'AbortError') {
        logger.warn('Enhanced context retrieval was aborted');
        throw error; // Re-throw abort errors
      }
      
      logger.error(`Enhanced context retrieval failed: ${error.message}`);
      return _createDefaultResult(query, `Context retrieval error: ${error.message}`);
    }
  } catch (error) {
    // Special handling for abort errors
    if (error.name === 'AbortError') {
      logger.warn(`Context retrieval aborted: ${error.message}`);
      return _createDefaultResult(query, 'Context retrieval was aborted');
    }
    
    logger.error(`Context retrieval error: ${error.message}`);
    return _createDefaultResult(query, `Error: ${error.message}`);
  }
}

// Export public API with isInitialized property
module.exports = {
  initialize,
  retrieveContext,
  isInitialized: false
};
