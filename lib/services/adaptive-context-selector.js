/**
 * AdaptiveContextSelector Class
 * 
 * This class selects and organizes context based on query analysis.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const { semanticContextAdapter } = require('../adapters/semantic-context-adapter');
const QueryAnalyzer = require('./query-analyzer');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Component name for logging and events
const COMPONENT_NAME = 'adaptive-context-selector';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Default configuration
const DEFAULT_CONFIG = {
  CACHE_DIR: process.env.LEO_CONTEXT_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'context'),
  CACHE_EXPIRATION_MS: 30 * 60 * 1000, // 30 minutes
  MAX_CODE_CONTEXT_ITEMS: 10,
  MAX_CONVERSATION_CONTEXT_ITEMS: 5,
  MAX_NARRATIVE_CONTEXT_ITEMS: 3,
  DEFAULT_SIMILARITY_THRESHOLD: 0.65,
  ENABLE_DEDUPLICATION: true,
  SIMILARITY_THRESHOLD_FOR_DEDUPLICATION: 0.85,
  ENABLE_DIVERSITY: true,
  DIVERSITY_PENALTY_FACTOR: 0.15
};

/**
 * Adaptive Context Selector class
 */
class AdaptiveContextSelector {
  /**
   * Create a new AdaptiveContextSelector instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Initialize configuration
    this.config = {
      ...DEFAULT_CONFIG,
      ...options
    };
    
    this.initialized = false;
  }

  /**
   * Initialize the adaptive context selector
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} Success status
   */
  async initialize(options = {}) {
    if (this.initialized) {
      logger.warn('Adaptive context selector already initialized');
      return true;
    }

    logger.info('Initializing adaptive context selector');

    try {
      // Create cache directory if it doesn't exist
      if (!fs.existsSync(this.config.CACHE_DIR)) {
        fs.mkdirSync(this.config.CACHE_DIR, { recursive: true });
      }

      this.initialized = true;
      eventBus.emit('service:initialized', { service: 'adaptive-context-selector', timestamp: Date.now() });
      logger.info('Adaptive context selector initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize adaptive context selector: ${error.message}`, error);
      return false;
    }
  
    // Initialize internal state
    this.isInitialized = false;
    this.initializationError = null;
    this._initPromises = [];
    
    // Attempt initialization
    try {
      this._initialize();
    } catch (error) {
      this.initializationError = error;
      logger.error(`Failed to initialize adaptive context selector: ${error.message}`);
      // We don't throw here to allow graceful degradation
      // The error will be stored and can be checked later
    }
  }
  
  /**
   * Initialize the adaptive context selector
   * @private
   */
  _initialize() {
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.config.CACHE_DIR)) {
      fs.mkdirSync(this.config.CACHE_DIR, { recursive: true });
      logger.info(`Cache directory created: ${this.config.CACHE_DIR}`);
    }
    
    // Initialize query analyzer
    try {
      this.queryAnalyzer = new QueryAnalyzer();
    } catch (error) {
      logger.error(`Failed to initialize query analyzer: ${error.message}`);
      throw new Error('Failed to initialize adaptive context selector: query analyzer initialization failed');
    }
    
    // Check for semantic context adapter availability
    this.config.semanticContextAvailable = typeof semanticContextAdapter.retrieveContext === 'function';
    
    // Check for conversation memory manager availability
    this.config.conversationMemoryAvailable = false;
    try {
      // If the conversation memory manager is already injected, use it
      if (this.conversationMemoryManager) {
        logger.info('Using injected conversation memory manager');
        this.config.conversationMemoryAvailable = typeof this.conversationMemoryManager.searchMemory === 'function';
      } else {
        // Otherwise try to require it
        const conversationMemoryManager = require('./conversation-memory-manager');
        this.conversationMemoryManager = conversationMemoryManager;
        this.config.conversationMemoryAvailable = typeof conversationMemoryManager.searchMemory === 'function';
      }
      
      if (this.config.conversationMemoryAvailable) {
        logger.info('Conversation memory manager is available');
      } else {
        logger.warn('Conversation memory manager does not have searchMemory function');
      }
    } catch (error) {
      logger.warn(`Conversation memory manager not available: ${error.message}`);
    }
    
    // Check for narrative understanding service availability
    this.config.narrativeUnderstandingAvailable = false;
    try {
      // If the narrative understanding service is already injected, use it
      if (this.narrativeUnderstandingService) {
        logger.info('Using injected narrative understanding service');
        this.config.narrativeUnderstandingAvailable = typeof this.narrativeUnderstandingService.retrieveNarrativeContext === 'function';
      } else {
        // Otherwise try to require it
        const narrativeUnderstandingService = require('./narrative-understanding-service');
        this.narrativeUnderstandingService = narrativeUnderstandingService;
        this.config.narrativeUnderstandingAvailable = typeof narrativeUnderstandingService.retrieveNarrativeContext === 'function';
      }
      
      if (this.config.narrativeUnderstandingAvailable) {
        logger.info('Narrative understanding service is available');
      } else {
        logger.warn('Narrative understanding service does not have retrieveNarrativeContext function');
      }
    } catch (error) {
      logger.warn(`Narrative understanding service not available: ${error.message}`);
    }
    
    // Check for session awareness adapter availability
    this.config.sessionAwarenessAvailable = false;
    try {
      // If the session awareness adapter is already injected, use it
      if (this.sessionAwarenessAdapter) {
        logger.info('Using injected session awareness adapter');
        this.config.sessionAwarenessAvailable = typeof this.sessionAwarenessAdapter.applySessionAwareness === 'function';
      } else {
        // Otherwise try to require it
        const sessionAwarenessAdapter = require('../adapters/session-awareness-adapter');
        this.sessionAwarenessAdapter = sessionAwarenessAdapter;
        this.config.sessionAwarenessAvailable = typeof sessionAwarenessAdapter.applySessionAwareness === 'function';
      }
      
      if (this.config.sessionAwarenessAvailable) {
        logger.info('Session awareness adapter is available');
        // Initialize the session awareness adapter if not already initialized
        if (!this.sessionAwarenessAdapter.isInitialized) {
          try {
            // First check if the session boundary manager is available and initialized
            const sessionBoundaryManager = require('../services/session-boundary-manager');
            
            // Create a promise that initializes both components in the correct order
            const initPromise = (async () => {
              try {
                // First ensure session boundary manager is initialized
                if (!sessionBoundaryManager.isInitialized) {
                  await sessionBoundaryManager.initialize();
                }
                
                // Then initialize the session awareness adapter
                const success = await this.sessionAwarenessAdapter.initialize();
                if (success) {
                  logger.info('Session awareness adapter initialized successfully');
                  return true;
                } else {
                  logger.warn('Session awareness adapter initialization failed');
                  return false;
                }
              } catch (error) {
                logger.warn(`Error initializing session awareness adapter: ${error.message}`);
                return false;
              }
            })();
            
            // Add the initialization promise to the queue
            this._initPromises.push(initPromise);
          } catch (error) {
            logger.warn(`Error setting up session awareness initialization: ${error.message}`);
          }
        }
      } else {
        logger.warn('Session awareness adapter does not have applySessionAwareness function');
      }
    } catch (error) {
      logger.warn(`Session awareness adapter not available: ${error.message}`);
    }
    
    // Initialize context cache
    this.contextCache = new Map();
    
    // Mark as initialized
    this.isInitialized = true;
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    logger.info('AdaptiveContextSelector initialized with configuration', this.config);
  }

  /**
   * Get context for a query (wrapper for selectContext for compatibility)
   * @param {string} query - The query text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Selected context and metadata in standardized format
   */
  async getContext(query, options = {}) {
    try {
      const contextResult = await this.selectContext(query, options);
      return {
        success: true,
        contextItems: [
          {
            type: 'adaptive',
            id: 'adaptive-context-' + Date.now(),
            title: 'Adaptive Context',
            content: contextResult.enhancedContext || 'No context available',
            priority: 0.9
          }
        ],
        metadata: contextResult.metadata || {}
      };
    } catch (error) {
      logger.error(`Error getting context: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        contextItems: []
      };
    }
  }

  /**
   * Select context for a query based on analysis
   * @param {string} query - The query text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Selected context and metadata in standardized format
   */
  async selectContext(query, options = {}) {
    // Start timing for performance monitoring
    const startTime = Date.now();
    
    try {
      // Validate query to prevent "Invalid query" errors
      if (!query || typeof query !== 'string' || query.trim() === '') {
        logger.warn('Empty or invalid query provided to selectContext');
        return {
          success: false,
          error: 'Invalid query: Query must be a non-empty string',
          context: '',
          metadata: {
            timestamp: Date.now(),
            duration: Date.now() - startTime,
            source: 'adaptive-context-selector',
            queryValidation: 'failed'
          }
        };
      }
      
      // Check if initialized
      if (!this.isInitialized) {
        if (this.initializationError) {
          logger.error(`Cannot select context: Adaptive context selector failed to initialize: ${this.initializationError.message}`);
          return this._createFallbackResult(query, `Initialization error: ${this.initializationError.message}`);
        }
        
        // Try to initialize again
        try {
          logger.warn('Adaptive context selector not initialized, attempting to initialize');
          this._initialize();
        } catch (error) {
          this.initializationError = error;
          logger.error(`Failed to initialize adaptive context selector: ${error.message}`);
          return this._createFallbackResult(query, `Initialization error: ${error.message}`);
        }
      }
      
      // Check if this is a meta-programming query and update session boundary manager if available
      if (this.config.sessionAwarenessAvailable && this.sessionAwarenessAdapter) {
        try {
          // Detect if this is a meta-programming query (simple heuristic)
          const isMetaProgramming = /implement|create|develop|build|extend|refactor|design|architecture/i.test(query);
          if (isMetaProgramming) {
            // Set meta-programming info asynchronously (don't wait for completion)
            this.sessionAwarenessAdapter.setMetaProgrammingInfo({
              isMetaProgramming: true,
              feature: this._extractFeatureName(query),
              purpose: this._extractPurpose(query),
              timestamp: Date.now()
            }).catch(error => {
              logger.warn(`Error setting meta-programming info: ${error.message}`);
            });
          }
        } catch (error) {
          logger.warn(`Error processing meta-programming detection: ${error.message}`);
        }
      }
      
      // Validate input
      if (!query || typeof query !== 'string') {
        throw new Error('Invalid query: Query must be a non-empty string');
      }
      
      // Log received options for debugging
      logger.info(`Received options for query: ${query.substring(0, 30)}...`, {
        hasSignal: !!options.signal,
        similarityThreshold: options.similarityThreshold,
        maxCodeItems: options.maxCodeItems,
        maxConversationItems: options.maxConversationItems,
        maxNarrativeItems: options.maxNarrativeItems,
        includeCodeContext: options.includeCodeContext,
        includeConversationContext: options.includeConversationContext,
        includeNarrativeContext: options.includeNarrativeContext
      });
      
      // Check for abort signal before starting
      if (options.signal && options.signal.aborted) {
        const abortError = new Error('Context retrieval aborted before starting');
        abortError.name = 'AbortError';
        throw abortError;
      }
      
      // Analyze the query to determine context needs
      const analysis = await this.queryAnalyzer.analyzeQuery(query);
      logger.info(`Query analysis results for "${query.substring(0, 30)}..."`, analysis);
      
      // Calculate context limits based on analysis and provided options
      const contextLimits = this._calculateContextLimits(analysis, {
        maxCodeItems: options.maxCodeItems,
        maxConversationItems: options.maxConversationItems,
        maxNarrativeItems: options.maxNarrativeItems
      });
      
      // Adjust similarity threshold based on query complexity and type
      const baseThreshold = options.similarityThreshold || this.config.DEFAULT_SIMILARITY_THRESHOLD;
      const adjustedThreshold = this._adjustSimilarityThreshold(baseThreshold, analysis.complexity, analysis.queryType);
      
      // Create abort controller for timeout handling
      const controller = new AbortController();
      const signal = options.signal || controller.signal;
      
      // Set timeout for the entire context retrieval process
      const timeoutMs = options.timeoutMs || 15000; // Default 15 seconds
      const timeoutId = setTimeout(() => {
        controller.abort();
        logger.warn(`Context retrieval timed out after ${timeoutMs}ms for query: ${query}`);
      }, timeoutMs);
      
      try {
        // Determine which context types to retrieve based on options
        const retrieveCodeContext = options.includeCodeContext !== false; // Default to true
        const retrieveConversationContext = options.includeConversationContext !== false; // Default to true
        const retrieveNarrativeContext = options.includeNarrativeContext !== false; // Default to true
        
        // Retrieve different types of context in parallel
        const [codeContext, conversationContext, narrativeContext] = await Promise.all([
          retrieveCodeContext ? 
            this._retrieveCodeContext(
              query, 
              contextLimits.codeContextLimit, 
              adjustedThreshold, 
              analysis,
              signal
            ) : Promise.resolve(''),
          retrieveConversationContext ? 
            this._retrieveConversationContext(
              query, 
              contextLimits.conversationContextLimit, 
              adjustedThreshold, 
              analysis,
              signal
            ) : Promise.resolve(''),
          retrieveNarrativeContext ? 
            this._retrieveNarrativeContext(
              query, 
              contextLimits.narrativeContextLimit, 
              adjustedThreshold, 
              analysis,
              signal
            ) : Promise.resolve('')
        ]);
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        // Log the retrieved context sizes
        logger.info('Retrieved context sizes - ' + 
          `Code: ${codeContext.length}, ` + 
          `Conversation: ${conversationContext.length}, ` + 
          `Narrative: ${narrativeContext.length}`);
        
        // Combine the contexts into a single enhanced context
        const enhancedContext = this._buildEnhancedContext(query, codeContext, conversationContext, narrativeContext);
        
        // Calculate processing time
        const processingTime = Date.now() - startTime;
        
        // Return the result in standardized format
        return {
          codeContext,
          conversationContext,
          narrativeContext,
          enhancedContext,
          metadata: {
            query,
            timestamp: Date.now(),
            source: 'adaptive',
            processingTime,
            analysis: {
              codeRelevance: analysis.codeRelevance,
              conversationRelevance: analysis.conversationRelevance,
              narrativeRelevance: analysis.narrativeRelevance,
              complexity: analysis.complexity,
              complexityScore: analysis.complexityScore,
              queryType: analysis.queryType
            },
            contextLimits: {
              code: contextLimits.codeContextLimit,
              conversation: contextLimits.conversationContextLimit,
              narrative: contextLimits.narrativeContextLimit
            },
            similarityThreshold: adjustedThreshold
          }
        };
      } catch (error) {
        // Clear the timeout
        clearTimeout(timeoutId);
        
        // Check if this was an abort error
        if (error.name === 'AbortError') {
          logger.warn(`Context retrieval aborted: ${error.message}`);
          throw error; // Re-throw abort errors
        }
        
        // For other errors, log and return a fallback result
        logger.error(`Error retrieving context: ${error.message}`);
        return this._createFallbackResult(query, error.message);
      }
    } catch (error) {
      // Check if this was an abort error
      if (error.name === 'AbortError') {
        logger.warn(`Context retrieval aborted: ${error.message}`);
        
        // Return a standardized abort result
        return this._createFallbackResult(query, 'Context retrieval was aborted', {
          aborted: true,
          processingTime: Date.now() - startTime
        });
      }
      
      // For other errors, log and return a fallback result
      logger.error(`Error in selectContext: ${error.message}`);
      return this._createFallbackResult(query, error.message, {
        processingTime: Date.now() - startTime
      });
    }
  }

  /**
   * Calculate context limits based on query analysis and provided options
   * @param {Object} analysis - Query analysis results
   * @param {Object} [options] - Optional overrides for context limits
   * @returns {Object} Context limits
   * @private
   */
  _calculateContextLimits(analysis, options = {}) {
    // Start with default limits
    const limits = {
      codeContextLimit: this.config.MAX_CODE_CONTEXT_ITEMS,
      conversationContextLimit: this.config.MAX_CONVERSATION_CONTEXT_ITEMS,
      narrativeContextLimit: this.config.MAX_NARRATIVE_CONTEXT_ITEMS
    };
    
    // Apply any explicit limits provided in options
    if (options.maxCodeItems !== undefined) {
      limits.codeContextLimit = options.maxCodeItems;
      logger.info(`Using explicit code context limit: ${limits.codeContextLimit}`);
    }
    
    if (options.maxConversationItems !== undefined) {
      limits.conversationContextLimit = options.maxConversationItems;
      logger.info(`Using explicit conversation context limit: ${limits.conversationContextLimit}`);
    }
    
    if (options.maxNarrativeItems !== undefined) {
      limits.narrativeContextLimit = options.maxNarrativeItems;
      logger.info(`Using explicit narrative context limit: ${limits.narrativeContextLimit}`);
    }
    
    // If explicit limits were provided, return them without further adjustment
    if (options.maxCodeItems !== undefined || 
        options.maxConversationItems !== undefined || 
        options.maxNarrativeItems !== undefined) {
      return limits;
    }
    
    // Otherwise, apply adaptive adjustments based on analysis
    
    // Adjust based on relevance scores
    if (analysis.codeRelevance > 0.7) {
      // For highly code-relevant queries, increase code context limit
      limits.codeContextLimit = Math.min(this.config.MAX_CODE_CONTEXT_ITEMS + 3, 15);
      // And slightly reduce other limits
      limits.conversationContextLimit = Math.max(1, limits.conversationContextLimit - 1);
      limits.narrativeContextLimit = Math.max(1, limits.narrativeContextLimit - 1);
      logger.info('Adjusted limits for high code relevance');
    } else if (analysis.conversationRelevance > 0.7) {
      // For highly conversation-relevant queries, increase conversation context limit
      limits.conversationContextLimit = Math.min(this.config.MAX_CONVERSATION_CONTEXT_ITEMS + 2, 10);
      // And slightly reduce other limits
      limits.codeContextLimit = Math.max(1, limits.codeContextLimit - 1);
      logger.info('Adjusted limits for high conversation relevance');
    } else if (analysis.narrativeRelevance > 0.7) {
      // For highly narrative-relevant queries, increase narrative context limit
      limits.narrativeContextLimit = Math.min(this.config.MAX_NARRATIVE_CONTEXT_ITEMS + 2, 7);
      // And slightly reduce other limits
      limits.codeContextLimit = Math.max(1, limits.codeContextLimit - 1);
      logger.info('Adjusted limits for high narrative relevance');
    }
    
    // Adjust based on complexity
    if (analysis.complexity === 'high') {
      // For complex queries, we need more context overall
      limits.codeContextLimit = Math.min(limits.codeContextLimit + 2, 15);
      limits.conversationContextLimit = Math.min(limits.conversationContextLimit + 1, 10);
      limits.narrativeContextLimit = Math.min(limits.narrativeContextLimit + 1, 7);
      logger.info('Adjusted limits for high complexity');
    } else if (analysis.complexity === 'low') {
      // For simple queries, we need less context
      limits.codeContextLimit = Math.max(1, limits.codeContextLimit - 1);
      limits.conversationContextLimit = Math.max(1, limits.conversationContextLimit - 1);
      limits.narrativeContextLimit = Math.max(0, limits.narrativeContextLimit - 1);
      logger.info('Adjusted limits for low complexity');
    }
    
    logger.info('Final context limits:', limits);
    return limits;
  }

  /**
   * Adjust similarity threshold based on query complexity and type
   * @param {number} baseThreshold - Base similarity threshold
   * @param {string} complexity - Query complexity
   * @param {string} queryType - Query type
   * @returns {number} Adjusted similarity threshold
   * @private
   */
  _adjustSimilarityThreshold(baseThreshold, complexity, queryType) {
    // Start with the base threshold
    let adjustedThreshold = baseThreshold;
    
    // Adjust based on complexity
    if (complexity === 'high') {
      // For complex queries, lower the threshold to include more diverse context
      adjustedThreshold -= 0.05;
    } else if (complexity === 'low') {
      // For simple queries, raise the threshold to get more precise context
      adjustedThreshold += 0.05;
    }
    
    // Adjust based on query type
    if (queryType === 'factual') {
      // Factual queries need precise information
      adjustedThreshold += 0.03;
    } else if (queryType === 'conceptual') {
      // Conceptual queries benefit from broader context
      adjustedThreshold -= 0.03;
    } else if (queryType === 'comparative') {
      // Comparative queries need diverse perspectives
      adjustedThreshold -= 0.05;
    }
    
    // Ensure threshold stays within reasonable bounds
    return Math.max(0.5, Math.min(0.9, adjustedThreshold));
  }

  /**
   * Retrieve code context from semantic context manager
   * @param {string} query - Query text
   * @param {number} maxItems - Maximum number of items to retrieve
   * @param {number} similarityThreshold - Similarity threshold
   * @param {Object} analysis - Query analysis
   * @param {AbortSignal} signal - Abort signal for timeout control
   * @returns {Promise<string>} Code context
   * @private
   */
  async _retrieveCodeContext(query, maxItems, similarityThreshold, analysis, signal) {
    // Generate a cache key for this specific context retrieval
    const cacheKey = `code_${crypto.createHash('md5').update(query).digest('hex')}_${maxItems}_${similarityThreshold}`;
    
    // Check if we have this result in cache
    if (this.contextCache.has(cacheKey)) {
      const cachedResult = this.contextCache.get(cacheKey);
      if (Date.now() - cachedResult.timestamp < this.config.CACHE_EXPIRATION_MS) {
        logger.info(`Retrieved code context from cache for query: ${query}`);
        return cachedResult.context;
      }
    }
    
    // Set a timeout to abort the operation if it takes too long
    const timeoutId = setTimeout(() => {
      if (signal && !signal.aborted) {
        signal.abort();
        logger.warn(`Aborting code context retrieval after timeout for query: ${query}`);
      }
    }, 10000); // 10 second timeout
    
    try {
      // Check if the semantic context manager is available
      if (!semanticContextAdapter || typeof semanticContextAdapter.retrieveContext !== 'function') {
        logger.warn('Semantic context manager or searchContext function not available, using fallback');
        return this._generateFallbackCodeContext(query, analysis);
      }
      
      // For code-focused queries, adjust the retrieval strategy
      const options = {
        maxResults: maxItems,
        similarityThreshold: analysis.codeRelevance > 0.7 ? 
          similarityThreshold - 0.05 : // For highly code-relevant queries, lower the threshold
          similarityThreshold,
        includeContent: true,
        signal: signal // Pass the abort signal
      };
      
      // Get code context
      const codeResults = await semanticContextAdapter.retrieveContext(query, options);
      
      // Format the results
      let formattedContext = '';
      
      if (codeResults && codeResults.length > 0) {
        // Add a header for the code context
        formattedContext = this._formatCodeResults(codeResults, analysis);
        
        // Cache the result
        this.contextCache.set(cacheKey, {
          context: formattedContext,
          timestamp: Date.now()
        });
        
        return formattedContext;
      } else {
        // No results found, generate fallback context
        return this._generateFallbackCodeContext(query, analysis);
      }
    } catch (error) {
      // Handle abort errors specially
      if (error.name === 'AbortError') {
        logger.warn('Code context retrieval aborted');
        throw error; // Propagate abort errors
      }
      
      logger.error(`Error retrieving code context: ${error.message}`);
      return this._generateFallbackCodeContext(query, analysis);
    } finally {
      // Always clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }
  }

  /**
   * Format code results into a readable context
   * @param {Array} results - Code search results
   * @param {Object} analysis - Query analysis
   * @returns {string} Formatted code context
   * @private
   */
  _formatCodeResults(results, analysis) {
    if (!results || results.length === 0) {
      return '';
    }
    
    let formattedContext = '## Code Context\n\n';
    
    results.forEach((result, index) => {
      // Add a separator between results
      if (index > 0) {
        formattedContext += '\n---\n\n';
      }
      
      // Add file path and description
      formattedContext += `### ${result.path || 'Unknown file'}\n\n`;
      
      if (result.description) {
        formattedContext += `${result.description}\n\n`;
      }
      
      // Add code content in a code block
      if (result.content) {
        const language = this._detectLanguage(result.path);
        formattedContext += `\`\`\`${language}\n${result.content}\n\`\`\`\n\n`;
      }
      
      // Add metadata if available
      if (result.metadata) {
        formattedContext += '**Metadata:** ';
        formattedContext += Object.entries(result.metadata)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        formattedContext += '\n\n';
      }
    });
    
    return formattedContext;
  }

  /**
   * Detect programming language from file path
   * @param {string} filePath - Path to the file
   * @returns {string} Detected language
   * @private
   */
  _detectLanguage(filePath) {
    if (!filePath) return '';
    
    const extension = path.extname(filePath).toLowerCase();
    
    const extensionMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.md': 'markdown',
      '.sh': 'bash',
      '.bat': 'batch',
      '.ps1': 'powershell',
      '.sql': 'sql',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml'
    };
    
    return extensionMap[extension] || '';
  }

  /**
   * Generate fallback code context when semantic context manager is unavailable
   * @param {string} query - Query text
   * @param {Object} analysis - Query analysis
   * @returns {string} Fallback code context
   * @private
   */
  _generateFallbackCodeContext(query, analysis) {
    return `## Code Context (Fallback Mode)

I couldn't retrieve specific code context for your query. This could be because:
- The semantic context manager is not available
- No relevant code was found for your query
- The query timeout was reached

Please try to be more specific in your query or check if the code you're asking about exists in the codebase.
`;
  }

  /**
   * Retrieve conversation context
   * @param {string} query - Query text
   * @param {number} maxItems - Maximum number of items to retrieve
   * @param {number} similarityThreshold - Similarity threshold
   * @param {Object} analysis - Query analysis
   * @param {AbortSignal} signal - Abort signal for timeout control
   * @returns {Promise<string>} Conversation context
   * @private
   */
  async _retrieveConversationContext(query, maxItems, similarityThreshold, analysis, signal) {
    // Generate a cache key for this specific context retrieval
    const cacheKey = `conversation_${crypto.createHash('md5').update(query).digest('hex')}_${maxItems}_${similarityThreshold}`;
    
    // Check if we have this result in cache
    if (this.contextCache.has(cacheKey)) {
      const cachedResult = this.contextCache.get(cacheKey);
      if (Date.now() - cachedResult.timestamp < this.config.CACHE_EXPIRATION_MS) {
        logger.info(`Retrieved conversation context from cache for query: ${query}`);
        return cachedResult.context;
      }
    }
    
    // Set a timeout to abort the operation if it takes too long
    const timeoutId = setTimeout(() => {
      if (signal && !signal.aborted) {
        signal.abort();
        logger.warn(`Aborting conversation context retrieval after timeout for query: ${query}`);
      }
    }, 8000); // 8 second timeout (slightly less than code context)
    
    try {
      // Check if the conversation memory manager is available
      if (!this.conversationMemoryManager) {
        logger.error('Conversation memory manager is not defined');
        return this._generateFallbackConversationContext(query, analysis);
      }
      
      // Check if the required function is available
      if (typeof this.conversationMemoryManager.searchMemory !== 'function') {
        logger.warn('Conversation memory manager searchMemory function not available, using fallback');
        return this._generateFallbackConversationContext(query, analysis);
      }
      
      const options = {
        maxResults: maxItems,
        similarityThreshold: analysis.conversationRelevance > 0.7 ? 
          similarityThreshold - 0.05 : // For highly conversation-relevant queries, lower the threshold
          similarityThreshold,
        includeMetadata: true,
        signal: signal
      };
      
      // Get conversation context
      const conversations = await this.conversationMemoryManager.searchMemory(query, options);
      
      // Format the results
      let formattedContext = '';
      
      if (conversations && conversations.length > 0) {
        // Add a header for the conversation context
        formattedContext = this._formatConversationResults(conversations, analysis);
        
        // Cache the result
        this.contextCache.set(cacheKey, {
          context: formattedContext,
          timestamp: Date.now()
        });
        
        return formattedContext;
      } else {
        // No results found, generate fallback context
        return this._generateFallbackConversationContext(query, analysis);
      }
    } catch (error) {
      // Handle abort errors specially
      if (error.name === 'AbortError') {
        logger.warn('Conversation context retrieval aborted');
        throw error; // Propagate abort errors
      }
      
      logger.error(`Error retrieving conversation context: ${error.message}`);
      return this._generateFallbackConversationContext(query, analysis);
    } finally {
      // Always clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }
  }

  /**
   * Format conversation results into a readable context
   * @param {Array} conversations - Conversation search results
   * @param {Object} analysis - Query analysis
   * @returns {string} Formatted conversation context
   * @private
   */
  _formatConversationResults(conversations, analysis) {
    if (!conversations || conversations.length === 0) {
      return '';
    }
    
    let formattedContext = '## Conversation History\n\n';
    
    conversations.forEach((conversation, index) => {
      // Add a separator between conversations
      if (index > 0) {
        formattedContext += '\n---\n\n';
      }
      
      // Add conversation metadata
      if (conversation.metadata) {
        formattedContext += `### Conversation ${conversation.metadata.id || index + 1}\n\n`;
        
        if (conversation.metadata.timestamp) {
          const date = new Date(conversation.metadata.timestamp);
          formattedContext += `**Date:** ${date.toLocaleString()}\n\n`;
        }
        
        if (conversation.metadata.topic) {
          formattedContext += `**Topic:** ${conversation.metadata.topic}\n\n`;
        }
      } else {
        formattedContext += `### Conversation ${index + 1}\n\n`;
      }
      
      // Add conversation content
      if (conversation.content) {
        formattedContext += conversation.content + '\n\n';
      }
    });
    
    return formattedContext;
  }

  /**
   * Generate fallback conversation context when conversation memory manager is unavailable
   * @param {string} query - Query text
   * @param {Object} analysis - Query analysis
   * @returns {string} Fallback conversation context
   * @private
   */
  _generateFallbackConversationContext(query, analysis) {
    return `## Conversation History (Fallback Mode)

I couldn't retrieve specific conversation history for your query. This could be because:
- The conversation memory manager is not available
- No relevant conversations were found for your query
- The query timeout was reached

If you're referring to a previous conversation, please provide more details about when it occurred or what it was about.
`;
  }

  /**
   * Retrieve narrative context
   * @param {string} query - Query text
   * @param {number} maxItems - Maximum number of items to retrieve
   * @param {number} similarityThreshold - Similarity threshold
   * @param {Object} analysis - Query analysis
   * @param {AbortSignal} signal - Abort signal for timeout control
   * @returns {Promise<string>} Narrative context
   * @private
   */
  async _retrieveNarrativeContext(query, maxItems, similarityThreshold, analysis, signal) {
    // Generate a cache key for this specific context retrieval
    const cacheKey = `narrative_${crypto.createHash('md5').update(query).digest('hex')}_${maxItems}_${similarityThreshold}`;
    
    // Check if we have this result in cache
    if (this.contextCache.has(cacheKey)) {
      const cachedResult = this.contextCache.get(cacheKey);
      if (Date.now() - cachedResult.timestamp < this.config.CACHE_EXPIRATION_MS) {
        logger.info(`Retrieved narrative context from cache for query: ${query}`);
        return cachedResult.context;
      }
    }
    
    // Set a timeout to abort the operation if it takes too long
    const timeoutId = setTimeout(() => {
      if (signal && !signal.aborted) {
        signal.abort();
        logger.warn(`Aborting narrative context retrieval after timeout for query: ${query}`);
      }
    }, 6000); // 6 second timeout (less than other contexts)
    
    try {
      // Check if the narrative understanding service is available
      if (!this.narrativeUnderstandingService) {
        logger.error('Narrative understanding service is not defined');
        return this._generateFallbackNarrativeContext(query, analysis);
      }
      
      // Check if the required function is available
      if (typeof this.narrativeUnderstandingService.retrieveNarrativeContext !== 'function') {
        logger.warn('Narrative understanding service retrieveNarrativeContext function not available, using fallback');
        return this._generateFallbackNarrativeContext(query, analysis);
      }
      
      const options = {
        maxResults: maxItems,
        similarityThreshold: analysis.narrativeRelevance > 0.7 ? 
          similarityThreshold - 0.05 : // For highly narrative-relevant queries, lower the threshold
          similarityThreshold,
        includeMetadata: true,
        signal: signal
      };
      
      // Get narrative context
      const narratives = await this.narrativeUnderstandingService.retrieveNarrativeContext(query, options);
      
      // Format the results
      let formattedContext = '';
      
      if (narratives && narratives.length > 0) {
        // Add a header for the narrative context
        formattedContext = this._formatNarrativeResults(narratives, analysis);
        
        // Cache the result
        this.contextCache.set(cacheKey, {
          context: formattedContext,
          timestamp: Date.now()
        });
        
        return formattedContext;
      } else {
        // No results found, generate fallback context
        return this._generateFallbackNarrativeContext(query, analysis);
      }
    } catch (error) {
      // Handle abort errors specially
      if (error.name === 'AbortError') {
        logger.warn('Narrative context retrieval aborted');
        throw error; // Propagate abort errors
      }
      
      logger.error(`Error retrieving narrative context: ${error.message}`);
      return this._generateFallbackNarrativeContext(query, analysis);
    } finally {
      // Always clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }
  }

  /**
   * Format narrative results into a readable context
   * @param {Array} narratives - Narrative search results
   * @param {Object} analysis - Query analysis
   * @returns {string} Formatted narrative context
   * @private
   */
  _formatNarrativeResults(narratives, analysis) {
    if (!narratives || narratives.length === 0) {
      return '';
    }
    
    let formattedContext = '## Narrative Context\n\n';
    
    narratives.forEach((narrative, index) => {
      // Add a separator between narratives
      if (index > 0) {
        formattedContext += '\n---\n\n';
      }
      
      // Add narrative metadata
      if (narrative.metadata) {
        formattedContext += `### ${narrative.metadata.title || `Narrative ${index + 1}`}\n\n`;
        
        if (narrative.metadata.type) {
          formattedContext += `**Type:** ${narrative.metadata.type}\n\n`;
        }
        
        if (narrative.metadata.relevance) {
          formattedContext += `**Relevance:** ${narrative.metadata.relevance.toFixed(2)}\n\n`;
        }
      } else {
        formattedContext += `### Narrative ${index + 1}\n\n`;
      }
      
      // Add narrative content
      if (narrative.content) {
        formattedContext += narrative.content + '\n\n';
      }
    });
    
    return formattedContext;
  }

  /**
   * Generate fallback narrative context when narrative understanding service is unavailable
   * @param {string} query - Query text
   * @param {Object} analysis - Query analysis
   * @returns {string} Fallback narrative context
   * @private
   */
  _generateFallbackNarrativeContext(query, analysis) {
    return `## Narrative Context (Fallback Mode)

I couldn't retrieve specific narrative context for your query. This could be because:
- The narrative understanding service is not available
- No relevant narratives were found for your query
- The query timeout was reached

If you're asking about a specific concept or topic, please provide more details.
`;
  }

  /**
   * Deduplicate context to remove redundant information
   * @param {string} codeContext - Code context
   * @param {string} conversationContext - Conversation context
   * @param {string} narrativeContext - Narrative context
   * @returns {Object} Deduplicated context
   * @private
   */
  _deduplicateContext(codeContext, conversationContext, narrativeContext) {
    if (!this.config.ENABLE_DEDUPLICATION) {
      return {
        codeContext,
        conversationContext,
        narrativeContext
      };
    }
    
    try {
      // If any context is empty, no need to deduplicate
      if (!codeContext || !conversationContext || !narrativeContext) {
        return {
          codeContext,
          conversationContext,
          narrativeContext
        };
      }
      
      // Create content fingerprints for each context
      const codeFingerprints = this._createContentFingerprints(codeContext);
      const conversationFingerprints = this._createContentFingerprints(conversationContext);
      const narrativeFingerprints = this._createContentFingerprints(narrativeContext);
      
      // Find duplicates between code and conversation context
      const codeConversationDuplicates = this._findDuplicates(
        codeFingerprints, 
        conversationFingerprints, 
        this.config.SIMILARITY_THRESHOLD_FOR_DEDUPLICATION
      );
      
      // Find duplicates between code and narrative context
      const codeNarrativeDuplicates = this._findDuplicates(
        codeFingerprints, 
        narrativeFingerprints, 
        this.config.SIMILARITY_THRESHOLD_FOR_DEDUPLICATION
      );
      
      // Find duplicates between conversation and narrative context
      const conversationNarrativeDuplicates = this._findDuplicates(
        conversationFingerprints, 
        narrativeFingerprints, 
        this.config.SIMILARITY_THRESHOLD_FOR_DEDUPLICATION
      );
      
      // Remove duplicates from conversation context (prefer code context)
      let dedupedConversationContext = conversationContext;
      if (codeConversationDuplicates.length > 0) {
        dedupedConversationContext = this._removeContentByFingerprints(
          conversationContext,
          codeConversationDuplicates.map(dup => dup.fingerprint2)
        );
      }
      
      // Remove duplicates from narrative context (prefer code and conversation context)
      let dedupedNarrativeContext = narrativeContext;
      if (codeNarrativeDuplicates.length > 0) {
        dedupedNarrativeContext = this._removeContentByFingerprints(
          dedupedNarrativeContext,
          codeNarrativeDuplicates.map(dup => dup.fingerprint2)
        );
      }
      if (conversationNarrativeDuplicates.length > 0) {
        dedupedNarrativeContext = this._removeContentByFingerprints(
          dedupedNarrativeContext,
          conversationNarrativeDuplicates.map(dup => dup.fingerprint2)
        );
      }
      
      return {
        codeContext,
        conversationContext: dedupedConversationContext,
        narrativeContext: dedupedNarrativeContext
      };
    } catch (error) {
      logger.error(`Error deduplicating context: ${error.message}`);
      
      // Return original context if deduplication fails
      return {
        codeContext,
        conversationContext,
        narrativeContext
      };
    }
  }

  /**
   * Create content fingerprints for a context string
   * @param {string} content - Context content
   * @returns {Array} Array of content fingerprints
   * @private
   */
  _createContentFingerprints(content) {
    if (!content) return [];
    
    // Split content into sections (using markdown headers as delimiters)
    const sections = content.split(/^#{2,3}\s+/m).filter(section => section.trim().length > 0);
    
    // Create fingerprints for each section
    return sections.map(section => this._createContentFingerprint(section));
  }

  /**
   * Create a fingerprint for a content section
   * @param {string} content - Content section
   * @returns {Object} Content fingerprint
   * @private
   */
  _createContentFingerprint(content) {
    // Create a normalized version of the content
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
    
    // Create a hash of the normalized content
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    
    return {
      hash,
      content: content.trim(),
      normalized
    };
  }

  /**
   * Find duplicates between two sets of fingerprints
   * @param {Array} fingerprints1 - First set of fingerprints
   * @param {Array} fingerprints2 - Second set of fingerprints
   * @param {number} similarityThreshold - Similarity threshold
   * @returns {Array} Array of duplicate pairs
   * @private
   */
  _findDuplicates(fingerprints1, fingerprints2, similarityThreshold) {
    const duplicates = [];
    
    // Compare each fingerprint in the first set with each fingerprint in the second set
    fingerprints1.forEach(fp1 => {
      fingerprints2.forEach(fp2 => {
        // Check for exact hash match
        if (fp1.hash === fp2.hash) {
          duplicates.push({
            fingerprint1: fp1,
            fingerprint2: fp2,
            similarity: 1.0
          });
          return;
        }
        
        // Calculate similarity between normalized content
        const similarity = this._calculateSimilarity(fp1.normalized, fp2.normalized);
        
        // If similarity is above threshold, consider it a duplicate
        if (similarity >= similarityThreshold) {
          duplicates.push({
            fingerprint1: fp1,
            fingerprint2: fp2,
            similarity
          });
        }
      });
    });
    
    return duplicates;
  }

  /**
   * Calculate similarity between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   * @private
   */
  _calculateSimilarity(str1, str2) {
    // Simple Jaccard similarity for now
    // In a real implementation, this would use a more sophisticated algorithm
    
    // Convert strings to sets of words
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    // Calculate intersection and union
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    // Calculate Jaccard similarity
    return intersection.size / union.size;
  }

  /**
   * Remove content sections by fingerprints
   * @param {string} content - Content to remove sections from
   * @param {Array} fingerprints - Fingerprints of sections to remove
   * @returns {string} Content with sections removed
   * @private
   */
  _removeContentByFingerprints(content, fingerprints) {
    if (!content || fingerprints.length === 0) {
      return content;
    }
    
    let modifiedContent = content;
    
    // Remove each section that matches a fingerprint
    fingerprints.forEach(fingerprint => {
      modifiedContent = modifiedContent.replace(fingerprint.content, '');
    });
    
    // Clean up any double newlines or empty sections
    return modifiedContent
      .replace(/\n{3,}/g, '\n\n')
      .replace(/#{2,3}\s+\n\n#{2,3}/g, '###')
      .trim();
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
  _buildEnhancedContext(query, codeContext, conversationContext, narrativeContext) {
    try {
      // Start with a header for the enhanced context
      let enhancedContext = '# Enhanced Leo Context\n\n';
      
      // Add the original query
      enhancedContext += '## Your Query\n';
      enhancedContext += query + '\n\n';
      
      // Deduplicate context to avoid redundancy
      const dedupedContext = this.config.ENABLE_DEDUPLICATION ? 
        this._deduplicateContext(codeContext, conversationContext, narrativeContext) : 
        { codeContext, conversationContext, narrativeContext };
      
      // Add context summary
      enhancedContext += '## Context Summary\n';
      enhancedContext += 'The following context has been retrieved based on your query:\n\n';
      
      // Add context availability indicators
      const hasCodeContext = dedupedContext.codeContext && dedupedContext.codeContext.trim().length > 0;
      const hasConversationContext = dedupedContext.conversationContext && dedupedContext.conversationContext.trim().length > 0;
      const hasNarrativeContext = dedupedContext.narrativeContext && dedupedContext.narrativeContext.trim().length > 0;
      
      enhancedContext += '- **Code Context**: ' + (hasCodeContext ? 'Available' : 'Not available') + '\n';
      enhancedContext += '- **Conversation Context**: ' + (hasConversationContext ? 'Available' : 'Not available') + '\n';
      enhancedContext += '- **Narrative Context**: ' + (hasNarrativeContext ? 'Available' : 'Not available') + '\n\n';
      
      // Add the actual context sections
      if (hasCodeContext) {
        enhancedContext += dedupedContext.codeContext + '\n\n';
      }
      
      if (hasConversationContext) {
        enhancedContext += dedupedContext.conversationContext + '\n\n';
      }
      
      if (hasNarrativeContext) {
        enhancedContext += dedupedContext.narrativeContext + '\n\n';
      }
      
      // If no context is available, add a note
      if (!hasCodeContext && !hasConversationContext && !hasNarrativeContext) {
        enhancedContext += '## Note\n';
        enhancedContext += 'No relevant context found for this query.\n\n';
        enhancedContext += '## Instructions\n';
        enhancedContext += 'Please answer the query based on your general knowledge.\n\n';
      } else {
        // Add instructions for using the context
        enhancedContext += '## Instructions for Using This Context\n\n';
        enhancedContext += 'Please use the provided context to answer the original query. ';
        enhancedContext += 'If the context does not contain all the necessary information, ';
        enhancedContext += 'use your general knowledge but acknowledge when you\'re doing so.\n\n';
      }
      
      // Apply session awareness to the context if available
      if (this.config.sessionAwarenessAvailable && this.sessionAwarenessAdapter) {
        try {
          // This is done asynchronously, but we'll handle it synchronously here
          // to ensure we don't block the context retrieval process
          this.sessionAwarenessAdapter.applySessionAwareness(enhancedContext)
            .then(result => {
              if (result.success) {
                // If session awareness was successfully applied, update the context cache
                // This ensures that future retrievals of this context will include session awareness
                // without requiring a full context retrieval
                const cacheKey = crypto.createHash('md5').update(query).digest('hex');
                if (this.contextCache.has(cacheKey)) {
                  const cachedItem = this.contextCache.get(cacheKey);
                  cachedItem.enhancedContext = result.context;
                  this.contextCache.set(cacheKey, cachedItem);
                }
                
                // Emit an event to notify other components that session awareness has been applied
                eventBus.emit('context:session:awareness:applied', {
                  component: COMPONENT_NAME,
                  timestamp: Date.now(),
                  sessionId: result.metadata.sessionId,
                  boundaryStatus: result.metadata.boundaryStatus
                });
              }
            })
            .catch(error => {
              logger.warn(`Error applying session awareness: ${error.message}`);
            });
          
          // Return the original enhanced context without waiting for session awareness
          // This ensures that the context retrieval process is not blocked
          return enhancedContext;
        } catch (error) {
          logger.warn(`Error applying session awareness: ${error.message}`);
          return enhancedContext;
        }
      }
      
      return enhancedContext;
    } catch (error) {
      logger.error(`Error building enhanced context: ${error.message}`);
      
      // Fallback to a simple context if there's an error
      let fallbackContext = '# Enhanced Leo Context (Fallback Mode)\n\n';
      fallbackContext += '## Your Query\n';
      fallbackContext += query + '\n\n';
      fallbackContext += '## Available Context\n\n';
      
      if (codeContext && codeContext.trim().length > 0) {
        fallbackContext += codeContext + '\n\n';
      }
      
      if (conversationContext && conversationContext.trim().length > 0) {
        fallbackContext += conversationContext + '\n\n';
      }
      
      if (narrativeContext && narrativeContext.trim().length > 0) {
        fallbackContext += narrativeContext + '\n\n';
      }
      
      return fallbackContext;
    }
  }

  /**
   * Combine different types of context based on analysis
   * @param {string} codeContext - Code context
   * @param {string} conversationContext - Conversation context
   * @param {string} narrativeContext - Narrative context
   * @param {Object} analysis - Query analysis
   * @returns {string} Combined context
   * @private
   */
  _combineContext(codeContext, conversationContext, narrativeContext, analysis) {
    try {
      // Start with an empty combined context
      let combinedContext = '';
      
      // Add a header for the enhanced context
      combinedContext += '# Leo Enhanced Context\n\n';
      
      // Determine the order of context sections based on relevance scores
      const contextTypes = [
        { type: 'code', content: codeContext, relevance: analysis.codeRelevance },
        { type: 'conversation', content: conversationContext, relevance: analysis.conversationRelevance },
        { type: 'narrative', content: narrativeContext, relevance: analysis.narrativeRelevance }
      ];
      
      // Sort context types by relevance (highest first)
      contextTypes.sort((a, b) => b.relevance - a.relevance);
      
      // Add each context type in order of relevance
      contextTypes.forEach(contextType => {
        if (contextType.content && contextType.content.trim().length > 0) {
          combinedContext += contextType.content + '\n\n';
        }
      });
      
      // Add instructions for using the context
      combinedContext += '## Instructions for Using This Context\n\n';
      combinedContext += 'Please use the provided context to answer the original query. If the context does not contain all the necessary information, use your general knowledge but acknowledge when you\'re doing so.\n\n';
      
      return combinedContext;
    } catch (error) {
      logger.error(`Error combining context: ${error.message}`);
      
      // Fallback to a simple concatenation if there's an error
      let fallbackContext = '# Leo Context (Fallback Mode)\n\n';
      
      if (codeContext && codeContext.trim().length > 0) {
        fallbackContext += codeContext + '\n\n';
      }
      
      if (conversationContext && conversationContext.trim().length > 0) {
        fallbackContext += conversationContext + '\n\n';
      }
      
      if (narrativeContext && narrativeContext.trim().length > 0) {
        fallbackContext += narrativeContext + '\n\n';
      }
      
      return fallbackContext;
    }
  }

  /**
   * Create a standardized fallback result for error cases
   * @param {string} query - The original query
   * @param {string} errorMessage - Error message to include
   * @param {Object} additionalMetadata - Additional metadata to include
   * @returns {Object} Fallback result in standardized format
   * @private
   */
  _createFallbackResult(query, errorMessage = '', additionalMetadata = {}) {
    // Create fallback context components
    const codeContext = '';
    const conversationContext = '';
    const narrativeContext = '';
    
    // Create fallback enhanced context
    let enhancedContext = `# Enhanced Leo Context\n\n## Your Query\n${query}\n\n`;
    
    // Add error section if there's an error message
    if (errorMessage) {
      enhancedContext += `## Error\n${errorMessage}\n\n`;
    }
    
    // Add note about fallback mode
    enhancedContext += `## Note\nNo relevant context found for this query.\n\n## Instructions\nPlease answer the query based on your general knowledge.\n\n`;
    
    // Return standardized result
    return {
      codeContext,
      conversationContext,
      narrativeContext,
      enhancedContext,
      metadata: {
        query,
        timestamp: Date.now(),
        source: 'adaptive-fallback',
        error: errorMessage || undefined,
        ...additionalMetadata
      }
    };
  }
}

/**
 * Extract feature name from a query
 * @param {string} query - The query to analyze
 * @returns {string} Extracted feature name or default value
 * @private
 */
AdaptiveContextSelector.prototype._extractFeatureName = function(query) {
  // Simple heuristic to extract feature name from query
  const featureMatches = query.match(/(?:implement|create|develop|build|extend|refactor|design)\s+(?:a|an|the)?\s+([\w\s-]+?)(?:\s+(?:for|to|that|which|with|using|in)\b|\.|$)/i);
  if (featureMatches && featureMatches[1]) {
    return featureMatches[1].trim();
  }
  return 'Unknown feature';
};

/**
 * Extract purpose from a query
 * @param {string} query - The query to analyze
 * @returns {string} Extracted purpose or default value
 * @private
 */
AdaptiveContextSelector.prototype._extractPurpose = function(query) {
  // Simple heuristic to extract purpose from query
  const purposeMatches = query.match(/(?:for|to|that|which|with)\s+([^.]+?)(?:\.|$)/i);
  if (purposeMatches && purposeMatches[1]) {
    return purposeMatches[1].trim();
  }
  return 'Not specified';
};

/**
 * Combine context from different sources
 * @param {string} codeContext - Context from code
 * @param {string} conversationContext - Context from conversations
 * @param {string} narrativeContext - Context from narrative understanding
 * @param {Object} weights - Weights for different context types
 * @returns {string} Combined context
 * @private
 */
AdaptiveContextSelector.prototype._combineContext = function(codeContext, conversationContext, narrativeContext, weights = {}) {
  try {
    // Set default weights if not provided
    const contextWeights = {
      code: weights.codeWeight || 0.6,
      conversation: weights.conversationWeight || 0.3,
      narrative: weights.narrativeWeight || 0.1,
      ...weights
    };
    
    // Normalize weights to ensure they sum to 1
    const totalWeight = contextWeights.code + contextWeights.conversation + contextWeights.narrative;
    if (totalWeight !== 1) {
      contextWeights.code /= totalWeight;
      contextWeights.conversation /= totalWeight;
      contextWeights.narrative /= totalWeight;
    }
    
    // Prepare sections with headers
    let combinedContext = "\n## CONTEXT FROM LEO EXOCORTEX:\n";
    
    // Add code context if available
    if (codeContext && codeContext.trim()) {
      combinedContext += "\n### Code Context\n\n";
      combinedContext += codeContext.trim();
    }
    
    // Add conversation context if available
    if (conversationContext && conversationContext.trim()) {
      combinedContext += "\n\n### Conversation Context\n\n";
      combinedContext += conversationContext.trim();
    }
    
    // Add narrative context if available
    if (narrativeContext && narrativeContext.trim()) {
      combinedContext += "\n\n### Development Narrative\n\n";
      combinedContext += narrativeContext.trim();
    }
    
    // Add metadata about context composition
    combinedContext += "\n\n### Context Composition\n\n";
    combinedContext += `- Code Context Weight: ${Math.round(contextWeights.code * 100)}%\n`;
    combinedContext += `- Conversation Context Weight: ${Math.round(contextWeights.conversation * 100)}%\n`;
    combinedContext += `- Narrative Context Weight: ${Math.round(contextWeights.narrative * 100)}%\n`;
    
    return combinedContext;
  } catch (error) {
    logger.error(`Error combining context: ${error.message}`, error);
    return "\n## CONTEXT FROM LEO EXOCORTEX:\n\nError combining context: " + error.message;
  }
};

// Create singleton instance
const adaptiveContextSelector = new AdaptiveContextSelector();

module.exports = {
  adaptiveContextSelector
};
