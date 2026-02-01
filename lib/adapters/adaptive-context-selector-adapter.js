/**
 * Adaptive Context Selector Adapter
 * 
 * This adapter provides a consistent interface for the Adaptive Context Selector component.
 * It addresses interface mismatches between the expected MVL interface and the
 * actual implementation in the adaptive-context-selector.js module.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const { adaptiveContextSelector } = require('../services/adaptive-context-selector');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'adaptive-context-selector-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Import services with proper error handling
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
      results: [],
      error: 'Conversation Memory Manager not available',
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'fallback'
      }
    }),
    generateEnhancedContext: async (query, options = {}) => ({
      success: false,
      context: '',
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

// Import narrative understanding service with proper error handling
let narrativeUnderstandingService;
try {
  narrativeUnderstandingService = require('../services/narrative-understanding-service');
} catch (error) {
  // Create a fallback implementation if the service is not available
  narrativeUnderstandingService = {
    initialize: async () => {
      logger.info('Using fallback narrative understanding service');
      return true;
    },
    retrieveNarrativeContext: async (query, options = {}) => ({
      success: false,
      results: [],
      error: 'Narrative understanding service not available',
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'fallback'
      }
    })
  };
}

/**
 * Initialize the adaptive context selector
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing adaptive context selector adapter');
    
    // Initialize required services first
    try {
      logger.info('Initializing conversation memory manager...');
      await conversationMemoryManager.initialize();
      logger.info('Conversation memory manager initialized successfully');
    } catch (error) {
      logger.warn(`Failed to initialize conversation memory manager: ${error.message}`);
      logger.info('Using fallback implementation for conversation memory manager');
    }
    
    try {
      if (narrativeUnderstandingService.initialize) {
        logger.info('Initializing narrative understanding service...');
        await narrativeUnderstandingService.initialize();
        logger.info('Narrative understanding service initialized successfully');
      }
    } catch (error) {
      logger.warn(`Failed to initialize narrative understanding service: ${error.message}`);
      logger.info('Using fallback implementation for narrative understanding service');
    }
    
    // Use the imported adaptiveContextSelector instance
    if (!adaptiveContextSelector) {
      throw new Error('Adaptive context selector instance not available');
    }
    
    // Update configuration if options are provided
    if (Object.keys(options).length > 0 && adaptiveContextSelector.config) {
      // Update the configuration directly
      adaptiveContextSelector.config = {
        ...adaptiveContextSelector.config,
        ...options
      };
      logger.info('Updated adaptive context selector configuration');
    }
    
    // Inject required services if possible
    if (typeof adaptiveContextSelector.setServices === 'function') {
      adaptiveContextSelector.setServices({
        conversationMemoryManager,
        narrativeUnderstandingService
      });
      logger.info('Injected services into adaptive context selector');
    }
    
    // Emit initialization event
    eventBus.emit('component:initialized', { 
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    module.exports.isInitialized = true;
    return true;
  } catch (error) {
    logger.error(`Error initializing adaptive context selector adapter: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to initialize adaptive context selector adapter', 
      error: error.message 
    });
    
    return false;
  }
}

/**
 * Select context for a query based on analysis
 * @param {string} query - The query text
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Standardized result with selected context and metadata
 */
async function selectContext(query, options = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Adaptive context selector adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize adaptive context selector adapter',
          context: {
            enhancedContext: `# Error in Context Selection\n\nThere was an error selecting context: Failed to initialize adaptive context selector adapter\n\nPlease try again or rephrase your query.`,
            codeContext: '',
            conversationContext: '',
            narrativeContext: ''
          },
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    logger.info(`Selecting context for query: "${query}"`);
    
    // Get config from adaptiveContextSelector or use defaults
    const config = adaptiveContextSelector.config || {
      MAX_CODE_CONTEXT_ITEMS: 10,
      MAX_CONVERSATION_CONTEXT_ITEMS: 5,
      MAX_NARRATIVE_CONTEXT_ITEMS: 3,
      DEFAULT_SIMILARITY_THRESHOLD: 0.65,
      ENABLE_DEDUPLICATION: true,
      ENABLE_DIVERSITY: true
    };
    
    // Default options
    const defaultOptions = {
      maxCodeContextItems: config.MAX_CODE_CONTEXT_ITEMS,
      maxConversationContextItems: config.MAX_CONVERSATION_CONTEXT_ITEMS,
      maxNarrativeContextItems: config.MAX_NARRATIVE_CONTEXT_ITEMS,
      similarityThreshold: config.DEFAULT_SIMILARITY_THRESHOLD,
      enableDeduplication: config.ENABLE_DEDUPLICATION,
      enableDiversity: config.ENABLE_DIVERSITY,
      includeMetadata: true,
      format: 'markdown'
    };
    
    // Merge with provided options
    const mergedOptions = {
      ...defaultOptions,
      ...options
    };
    
    // Use adaptiveContextSelector to select context if available
    let result = {};
    
    if (adaptiveContextSelector && typeof adaptiveContextSelector.selectContext === 'function') {
      result = await adaptiveContextSelector.selectContext(query, mergedOptions);
    } else {
      // Fallback implementation
      logger.warn('Using fallback implementation for context selection');
      
      // Get code context
      let codeContext = '';
      try {
        const semanticContextManager = require('../services/semantic-context-manager');
        const codeResults = await semanticContextManager.search(query, { 
          limit: mergedOptions.maxCodeContextItems,
          threshold: mergedOptions.similarityThreshold
        });
        codeContext = codeResults.map(item => item.content).join('\n\n');
      } catch (error) {
        logger.error(`Error getting code context: ${error.message}`);
      }
      
      // Get conversation context
      let conversationContext = '';
      try {
        const conversationResults = await conversationMemoryManager.searchMemory(query, {
          limit: mergedOptions.maxConversationContextItems,
          threshold: mergedOptions.similarityThreshold
        });
        conversationContext = conversationResults.results.map(item => item.content).join('\n\n');
      } catch (error) {
        logger.error(`Error getting conversation context: ${error.message}`);
      }
      
      // Get narrative context
      let narrativeContext = '';
      try {
        if (narrativeUnderstandingService && typeof narrativeUnderstandingService.retrieveNarrativeContext === 'function') {
          const narrativeResults = await narrativeUnderstandingService.retrieveNarrativeContext(query, {
            limit: mergedOptions.maxNarrativeContextItems,
            threshold: mergedOptions.similarityThreshold
          });
          narrativeContext = narrativeResults.results.map(item => item.content).join('\n\n');
        }
      } catch (error) {
        logger.error(`Error getting narrative context: ${error.message}`);
      }
      
      // Build enhanced context
      const enhancedContext = _buildEnhancedContext(
        query,
        codeContext,
        conversationContext,
        narrativeContext
      );
      
      result = {
        codeContext,
        conversationContext,
        narrativeContext,
        enhancedContext
      };
    }
    
    // If the result doesn't have an enhanced context, build it ourselves
    if (!result.enhancedContext && (result.codeContext || result.conversationContext || result.narrativeContext)) {
      logger.info('Building enhanced context using adapter method');
      result.enhancedContext = _buildEnhancedContext(
        query,
        result.codeContext || '',
        result.conversationContext || '',
        result.narrativeContext || ''
      );
    }
    
    // Return standardized result
    return {
      success: true,
      context: {
        enhancedContext: result.enhancedContext || '',
        codeContext: result.codeContext || '',
        conversationContext: result.conversationContext || '',
        narrativeContext: result.narrativeContext || ''
      },
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'success',
        options: mergedOptions
      }
    };
  } catch (error) {
    logger.error(`Error selecting context: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to select context', 
      error: error.message 
    });
    
    // Return a standardized error response
    return {
      success: false,
      error: error.message,
      context: {
        enhancedContext: `# Error in Context Selection\n\nThere was an error selecting context: ${error.message}\n\nPlease try again or rephrase your query.`,
        codeContext: '',
        conversationContext: '',
        narrativeContext: ''
      },
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Combine context from different sources
 * @param {string} codeContext - Code context
 * @param {string} conversationContext - Conversation context
 * @param {string} narrativeContext - Narrative context
 * @param {Object} analysis - Query analysis
 * @returns {Promise<Object>} Standardized result with combined context and metadata
 */
async function combineContext(codeContext, conversationContext, narrativeContext, analysis = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Adaptive context selector adapter not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize adaptive context selector adapter',
          enhancedContext: '# Error Combining Context\n\nFailed to initialize adaptive context selector adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    logger.info('Combining context from different sources');
    
    // Use adaptiveContextSelector to combine context if available
    let enhancedContext;
    
    if (adaptiveContextSelector && typeof adaptiveContextSelector._combineContext === 'function') {
      logger.info('Using adaptiveContextSelector method to combine context');
      enhancedContext = adaptiveContextSelector._combineContext(codeContext, conversationContext, narrativeContext, analysis);
    } else {
      logger.info('Using adapter method to build enhanced context');
      // Use our own implementation
      enhancedContext = _buildEnhancedContext(
        analysis?.query || 'Unknown query',
        codeContext || '',
        conversationContext || '',
        narrativeContext || ''
      );
    }
    
    // Return standardized result
    return {
      success: true,
      enhancedContext,
      metadata: {
        timestamp: Date.now(),
        status: 'success',
        contextSources: {
          code: Boolean(codeContext),
          conversation: Boolean(conversationContext),
          narrative: Boolean(narrativeContext)
        },
        analysisType: analysis?.type || 'unknown'
      }
    };
  } catch (error) {
    logger.error(`Error combining context: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to combine context', 
      error: error.message 
    });
    
    // Return a standardized error response
    return {
      success: false,
      error: error.message,
      enhancedContext: `# Error Combining Context\n\nThere was an error combining context: ${error.message}`,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Update the configuration of the adaptive context selector
 * @param {Object} config - New configuration options
 * @returns {Promise<Object>} Standardized result with update status and metadata
 */
async function updateConfig(config = {}) {
  try {
    // Check initialization status
    if (!module.exports.isInitialized) {
      logger.warn('Adaptive context selector adapter not initialized, initializing now...');
      const initSuccess = await initialize(config);
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize adaptive context selector adapter',
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
      
      return {
        success: true,
        metadata: {
          timestamp: Date.now(),
          status: 'success',
          message: 'Initialized with provided configuration'
        }
      };
    }
    
    logger.info('Updating adaptive context selector configuration');
    
    // Update the configuration if available
    if (adaptiveContextSelector && adaptiveContextSelector.config) {
      // Update the configuration
      adaptiveContextSelector.config = {
        ...adaptiveContextSelector.config,
        ...config
      };
      
      logger.info('Adaptive context selector configuration updated successfully');
      
      // Return standardized result
      return {
        success: true,
        metadata: {
          timestamp: Date.now(),
          status: 'success',
          updatedKeys: Object.keys(config)
        }
      };
    } else {
      throw new Error('Cannot update configuration: adaptiveContextSelector or config not available');
    }
  } catch (error) {
    logger.error(`Error updating adaptive context selector configuration: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to update adaptive context selector configuration', 
      error: error.message 
    });
    
    // Return a standardized error response
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
 * Build enhanced context by integrating different context types with metadata and structure
 * @param {string} query - The original query
 * @param {string} codeContext - Code context
 * @param {string} conversationContext - Conversation context
 * @param {string} narrativeContext - Narrative context
 * @returns {string} Enhanced context with integrated structure
 * @private
 */
function _buildEnhancedContext(query, codeContext, conversationContext, narrativeContext) {
  try {
    logger.info('Building enhanced context');
    
    // Create a header with metadata
    let enhancedContext = `# Enhanced Context for Query: ${query}

`;
    enhancedContext += `*Generated at ${new Date().toISOString()} by Leo's Adaptive Context Selector*\n\n`;
    
    // Add a table of contents if we have multiple context types
    const hasCodeContext = Boolean(codeContext?.trim());
    const hasConversationContext = Boolean(conversationContext?.trim());
    const hasNarrativeContext = Boolean(narrativeContext?.trim());
    
    if ((hasCodeContext ? 1 : 0) + (hasConversationContext ? 1 : 0) + (hasNarrativeContext ? 1 : 0) > 1) {
      enhancedContext += '## Table of Contents\n\n';
      if (hasCodeContext) enhancedContext += '1. [Code Context](#code-context)\n';
      if (hasConversationContext) enhancedContext += '2. [Conversation Context](#conversation-context)\n';
      if (hasNarrativeContext) enhancedContext += '3. [Narrative Context](#narrative-context)\n';
      enhancedContext += '\n';
    }
    
    // Add code context if available
    if (hasCodeContext) {
      enhancedContext += '## Code Context {#code-context}\n\n';
      enhancedContext += codeContext.trim();
      enhancedContext += '\n\n';
    }
    
    // Add conversation context if available
    if (hasConversationContext) {
      enhancedContext += '## Conversation Context {#conversation-context}\n\n';
      enhancedContext += conversationContext.trim();
      enhancedContext += '\n\n';
    }
    
    // Add narrative context if available
    if (hasNarrativeContext) {
      enhancedContext += '## Narrative Context {#narrative-context}\n\n';
      enhancedContext += narrativeContext.trim();
      enhancedContext += '\n\n';
    }
    
    // Add a footer with summary information
    enhancedContext += '---\n';
    enhancedContext += '*This enhanced context combines information from ';
    
    const contextSources = [];
    if (hasCodeContext) contextSources.push('code');
    if (hasConversationContext) contextSources.push('conversation history');
    if (hasNarrativeContext) contextSources.push('development narrative');
    
    enhancedContext += contextSources.join(', ');
    enhancedContext += ' to provide the most relevant information for your query.*';
    
    return enhancedContext;
  } catch (error) {
    logger.error(`Error building enhanced context: ${error.message}`);
    return `# Error Building Enhanced Context

There was an error building the enhanced context: ${error.message}

## Available Context

${codeContext || conversationContext || narrativeContext || 'No context available'}`;
  }
}

// Export the adapter API
module.exports = {
  initialize,
  selectContext,
  combineContext,
  updateConfig,
  _buildEnhancedContext,
  isInitialized: false
};
