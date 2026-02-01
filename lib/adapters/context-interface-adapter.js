/**
 * Context Interface Adapter
 * 
 * This adapter standardizes the interface between the enhanced context retrieval service
 * and the adaptive context selector, ensuring consistent option formats and return values.
 */

const { createComponentLogger } = require('../utils/logger');

// Create component logger
const logger = createComponentLogger('context-interface-adapter');

/**
 * Convert options from enhanced context retrieval format to adaptive context selector format
 * @param {Object} options - Options in enhanced context retrieval format
 * @returns {Object} Options in adaptive context selector format
 */
function convertToAdaptiveOptions(options = {}) {
  // Extract options with defaults
  const {
    maxCodeItems = 10,
    maxConversationItems = 5,
    maxNarrativeItems = 3,
    similarityThreshold = 0.65,
    includeCodeContext = true,
    includeConversationContext = true,
    includeNarrativeContext = true,
    signal = null,
    useCache = true
  } = options;
  
  logger.debug('Converting options to adaptive context selector format', {
    maxCodeItems,
    maxConversationItems,
    maxNarrativeItems,
    similarityThreshold
  });
  
  // Return standardized options
  return {
    // Core options
    similarityThreshold,
    signal,
    
    // Context limits with standardized naming
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
}

/**
 * Create a default result when context retrieval fails or returns unexpected format
 * @param {string} query - The original query
 * @returns {Object} A default context result object
 */
function createDefaultResult(query) {
  return {
    codeContext: '',
    conversationContext: '',
    narrativeContext: '',
    enhancedContext: `# Enhanced Leo Context\n\n## Your Query\n${query}\n\n## Note\nNo relevant context found for this query.\n\n## Instructions\nPlease answer the query based on your general knowledge.\n\n`,
    metadata: {
      source: 'fallback',
      timestamp: Date.now(),
      query
    }
  };
}

/**
 * Standardize the result from adaptive context selector
 * @param {Object} result - Result from adaptive context selector
 * @param {string} query - Original query
 * @returns {Object} Standardized result
 */
function standardizeResult(result, query) {
  // If result is not an object or is null/undefined, return default
  if (!result || typeof result !== 'object') {
    logger.warn('Received invalid result from context retrieval, creating default');
    return createDefaultResult(query);
  }
  
  // If result already has enhancedContext, return it
  if (result.enhancedContext) {
    return result;
  }
  
  // If result has context components but no enhancedContext, create it
  if (result.codeContext !== undefined || 
      result.conversationContext !== undefined || 
      result.narrativeContext !== undefined) {
    
    // Create a basic enhanced context from the components
    const enhancedContext = `# Enhanced Leo Context\n\n## Your Query\n${query}\n\n` +
      (result.codeContext ? `## Code Context\n${result.codeContext}\n\n` : '') +
      (result.conversationContext ? `## Conversation Context\n${result.conversationContext}\n\n` : '') +
      (result.narrativeContext ? `## Narrative Context\n${result.narrativeContext}\n\n` : '');
    
    return {
      ...result,
      enhancedContext
    };
  }
  
  // Otherwise return default
  return createDefaultResult(query);
}

module.exports = {
  convertToAdaptiveOptions,
  createDefaultResult,
  standardizeResult
};
