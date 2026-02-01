/**
 * Claude Memory Integration Module
 * 
 * This module enables Claude to proactively use Leo's memory graph during development,
 * providing direct access to semantic search capabilities, relevant memory suggestions,
 * and vision alignment validation.
 */

const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'claude-memory-integration';

// Create logger
const logger = createComponentLogger(COMPONENT_NAME);

// Import required services
let semanticContextManager;
let memoryGraphIntegration;
let configService;

// Track initialization state
let _isInitialized = false;

/**
 * Initialize the Claude Memory Integration module
 * @param {Object} options - Initialization options
 * @returns {Promise<void>}
 */
async function initialize({
  semanticContextManager: semanticContextMgr,
  memoryGraphIntegration: memoryGraph,
  configService: configSvc
} = {}) {
  try {
    if (_isInitialized) {
      logger.warn('Claude Memory Integration already initialized');
      return;
    }

    logger.info('Initializing Claude Memory Integration');

    // Store service references
    semanticContextManager = semanticContextMgr;
    memoryGraphIntegration = memoryGraph;
    configService = configSvc;

    // Setup proactive memory usage
    await enableProactiveMemoryUsage();

    _isInitialized = true;
    logger.info('Claude Memory Integration initialized successfully');

    // Emit initialization event
    eventBus.emit('claudeMemoryIntegration.initialized', { component: COMPONENT_NAME });
  } catch (error) {
    logger.error(`Failed to initialize Claude Memory Integration: ${error.message}`);
    throw error;
  }
}

/**
 * Enable proactive memory usage for Claude
 * @returns {Promise<void>}
 */
async function enableProactiveMemoryUsage() {
  logger.info('Enabling proactive memory usage');

  try {
    // Make semantic search available globally
    global.searchMemoryGraph = async (query) => {
      logger.info(`Direct memory search for: ${query}`);
      return await semanticContextManager.search(query);
    };

    // Setup automatic context injection
    await setupAutomaticContextInjection();

    // Setup memory usage monitoring
    await setupMemoryUsageMonitoring();

    logger.info('Proactive memory usage enabled');
  } catch (error) {
    logger.error(`Failed to enable proactive memory usage: ${error.message}`);
    throw error;
  }
}

/**
 * Setup automatic context injection into development prompts
 * @returns {Promise<void>}
 */
async function setupAutomaticContextInjection() {
  logger.info('Setting up automatic context injection');

  try {
    // Listen for prompt generation events
    eventBus.on('promptGeneration.beforeGenerate', async (event) => {
      if (!event || !event.prompt) {
        return;
      }

      try {
        // Get current task from prompt
        const currentTask = extractTaskFromPrompt(event.prompt);

        // Get relevant memory suggestions
        const suggestions = await suggestRelevantMemory(currentTask);

        // Add memory suggestions to prompt
        event.prompt = injectMemorySuggestionsIntoPrompt(event.prompt, suggestions);
        
        logger.info('Injected memory suggestions into prompt');
      } catch (error) {
        logger.error(`Failed to inject memory suggestions: ${error.message}`);
      }
    }, COMPONENT_NAME);

    logger.info('Automatic context injection setup complete');
  } catch (error) {
    logger.error(`Failed to setup automatic context injection: ${error.message}`);
    throw error;
  }
}

/**
 * Extract task description from prompt
 * @param {string} prompt - The prompt
 * @returns {string} The extracted task
 */
function extractTaskFromPrompt(prompt) {
  // Simple task extraction by taking the first 100 characters
  // In a real implementation, this would use NLP to extract the task
  return prompt.substring(0, 100);
}

/**
 * Inject memory suggestions into prompt
 * @param {string} prompt - The original prompt
 * @param {Array} suggestions - Memory suggestions
 * @returns {string} Enhanced prompt with suggestions
 */
function injectMemorySuggestionsIntoPrompt(prompt, suggestions) {
  if (!suggestions || !suggestions.length) {
    return prompt;
  }

  // Format suggestions
  const formattedSuggestions = suggestions
    .map(suggestion => `- ${suggestion.title}: ${suggestion.excerpt}`)
    .join('\n');

  // Add suggestions to prompt
  return `${prompt}\n\nRELEVANT CONTEXT FROM YOUR MEMORY:\n${formattedSuggestions}`;
}

/**
 * Setup memory usage monitoring
 * @returns {Promise<void>}
 */
async function setupMemoryUsageMonitoring() {
  logger.info('Setting up memory usage monitoring');

  try {
    // Track memory usage
    global.memoryUsageStats = {
      searches: 0,
      suggestions: 0,
      alignmentChecks: 0,
      lastSearchTimestamp: null,
      lastSuggestionTimestamp: null,
      lastAlignmentCheckTimestamp: null
    };

    // Wrap search function to track usage
    const originalSearch = global.searchMemoryGraph;
    global.searchMemoryGraph = async (query) => {
      global.memoryUsageStats.searches++;
      global.memoryUsageStats.lastSearchTimestamp = new Date().toISOString();
      return await originalSearch(query);
    };

    logger.info('Memory usage monitoring setup complete');
  } catch (error) {
    logger.error(`Failed to setup memory usage monitoring: ${error.message}`);
    throw error;
  }
}

/**
 * Suggest relevant memory based on current task
 * @param {string} currentTask - The current development task
 * @returns {Promise<Array>} Memory suggestions
 */
async function suggestRelevantMemory(currentTask) {
  logger.info(`Suggesting relevant memory for task: ${currentTask}`);

  try {
    // Track suggestion usage
    if (global.memoryUsageStats) {
      global.memoryUsageStats.suggestions++;
      global.memoryUsageStats.lastSuggestionTimestamp = new Date().toISOString();
    }

    // Get semantic search results
    const searchResults = await semanticContextManager.search(currentTask, {
      maxResults: 5,
      minSimilarity: 0.7
    });

    // Format suggestions
    const suggestions = formatMemorySuggestions(searchResults);

    logger.info(`Found ${suggestions.length} relevant memory suggestions`);
    return suggestions;
  } catch (error) {
    logger.error(`Failed to suggest relevant memory: ${error.message}`);
    return [];
  }
}

/**
 * Format memory search results as suggestions
 * @param {Array} searchResults - Search results
 * @returns {Array} Formatted suggestions
 */
function formatMemorySuggestions(searchResults) {
  if (!searchResults || !searchResults.length) {
    return [];
  }

  return searchResults.map(result => ({
    id: result.id || Math.random().toString(36).substring(2, 9),
    title: result.title || 'Memory Item',
    excerpt: result.content?.substring(0, 150) || 'No content available',
    similarity: result.similarity || 0,
    source: result.source || 'memory-graph',
    timestamp: result.timestamp || new Date().toISOString()
  }));
}

/**
 * Validate if proposed changes align with Leo's vision
 * @param {string} proposedChange - The proposed change
 * @returns {Promise<Object>} Alignment validation result
 */
async function validateVisionAlignment(proposedChange) {
  logger.info('Validating vision alignment for proposed change');

  try {
    // Track alignment check usage
    if (global.memoryUsageStats) {
      global.memoryUsageStats.alignmentChecks++;
      global.memoryUsageStats.lastAlignmentCheckTimestamp = new Date().toISOString();
    }

    // Get Leo's vision context
    const visionContext = await semanticContextManager.search("Leo exocortex vision", {
      maxResults: 3,
      minSimilarity: 0.8
    });

    // Check alignment
    const alignmentResult = checkAlignment(proposedChange, visionContext);

    logger.info(`Vision alignment check completed: ${alignmentResult.aligned ? 'Aligned' : 'Not aligned'}`);
    return alignmentResult;
  } catch (error) {
    logger.error(`Failed to validate vision alignment: ${error.message}`);
    return {
      aligned: true, // Default to aligned in case of errors
      confidence: 0,
      reasoning: `Error during alignment check: ${error.message}`
    };
  }
}

/**
 * Check if proposed change aligns with vision context
 * @param {string} proposedChange - The proposed change
 * @param {Array} visionContext - Vision context
 * @returns {Object} Alignment result
 */
function checkAlignment(proposedChange, visionContext) {
  if (!visionContext || !visionContext.length) {
    return {
      aligned: true,
      confidence: 0.5,
      reasoning: 'No vision context available for alignment check'
    };
  }

  // In a real implementation, this would use more sophisticated analysis
  // For now, we'll do a simple keyword check
  const visionText = visionContext.map(item => item.content).join(' ');
  
  // Check for WITH vs FOR paradigm
  const withHumansCount = (visionText.match(/WITH humans/gi) || []).length;
  const forHumansCount = (visionText.match(/FOR humans/gi) || []).length;
  
  const withEmphasis = withHumansCount > forHumansCount;
  
  // Check if proposed change mentions tool vs partner language
  const toolTerms = ['tool', 'utility', 'service', 'application', 'product', 'assistant'];
  const partnerTerms = ['partner', 'companion', 'collaborator', 'colleague', 'copilot', 'extension'];
  
  let toolCount = 0;
  toolTerms.forEach(term => {
    toolCount += (proposedChange.match(new RegExp(term, 'gi')) || []).length;
  });
  
  let partnerCount = 0;
  partnerTerms.forEach(term => {
    partnerCount += (proposedChange.match(new RegExp(term, 'gi')) || []).length;
  });
  
  const partnerEmphasis = partnerCount > toolCount;
  
  // Check for continuity emphasis
  const continuityConcepts = ['continuity', 'persistence', 'memory', 'awareness', 'context'];
  let continuityCount = 0;
  continuityConcepts.forEach(term => {
    continuityCount += (proposedChange.match(new RegExp(term, 'gi')) || []).length;
  });
  
  const hasContinuityFocus = continuityCount > 0;
  
  // Overall alignment
  const aligned = (withEmphasis && partnerEmphasis) || hasContinuityFocus;
  const confidence = 0.5 + (partnerEmphasis ? 0.2 : 0) + (hasContinuityFocus ? 0.3 : 0);
  
  let reasoning = '';
  if (aligned) {
    reasoning = `The proposed change aligns with Leo's vision because it `;
    if (partnerEmphasis) {
      reasoning += `emphasizes partner/collaborator language over tool language, `;
    }
    if (hasContinuityFocus) {
      reasoning += `focuses on cognitive continuity concepts, `;
    }
    reasoning = reasoning.slice(0, -2) + '.';
  } else {
    reasoning = `The proposed change may not fully align with Leo's vision because it `;
    if (!partnerEmphasis) {
      reasoning += `uses more tool-oriented language than partner/collaborator language, `;
    }
    if (!hasContinuityFocus) {
      reasoning += `lacks focus on cognitive continuity concepts, `;
    }
    reasoning = reasoning.slice(0, -2) + '.';
  }
  
  return {
    aligned,
    confidence,
    reasoning
  };
}

/**
 * Get memory usage statistics
 * @returns {Object} Memory usage statistics
 */
function getMemoryUsageStats() {
  return global.memoryUsageStats || {
    searches: 0,
    suggestions: 0,
    alignmentChecks: 0
  };
}

/**
 * Check if the module is initialized
 * @returns {boolean} Initialization status
 */
function checkInitialized() {
  return _isInitialized;
}

module.exports = {
  initialize,
  suggestRelevantMemory,
  validateVisionAlignment,
  getMemoryUsageStats,
  isInitialized: checkInitialized
};
