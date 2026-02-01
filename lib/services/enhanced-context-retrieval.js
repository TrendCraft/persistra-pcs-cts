/**
 * Enhanced Context Retrieval Service
 * 
 * This service integrates conversation context into the retrieval system,
 * providing a unified interface for retrieving context from both code and conversations.
 * It's part of Phase 4: Memory Integration for the Conversation-Aware Leo implementation.
 * 
 * Updated with adaptive context selection and improved context stitching capabilities.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const configServiceAdapter = require('../adapters/config-service-adapter');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const semanticContextManager = require('./semantic-context-manager');
const conversationMemoryManager = require('./conversation-memory-manager');
const narrativeUnderstandingService = require('./narrative-understanding-service');
const conversationSemanticSearch = require('./conversation-semantic-search');
const memoryIntegrationService = require('./memory-integration-service');
const QueryAnalyzer = require('./query-analyzer');

// Component name for logging and events
const COMPONENT_NAME = 'enhanced-context-retrieval';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  CACHE_DIR: process.env.LEO_CONTEXT_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'context'),
  CACHE_EXPIRATION_MS: 30 * 60 * 1000, // 30 minutes
  MAX_CODE_CONTEXT_ITEMS: 10,
  MAX_CONVERSATION_CONTEXT_ITEMS: 5,
  MAX_NARRATIVE_CONTEXT_ITEMS: 3,
  MAX_MEMORY_GRAPH_ITEMS: 5,
  CODE_WEIGHT: 0.5,
  CONVERSATION_WEIGHT: 0.3,
  NARRATIVE_WEIGHT: 0.1,
  MEMORY_GRAPH_WEIGHT: 0.1,
  DEFAULT_SIMILARITY_THRESHOLD: 0.65,
  ENABLE_CONTEXT_BLENDING: true,
  ENABLE_QUERY_ANALYSIS: true,
  ENABLE_ADAPTIVE_SELECTION: true,
  ENABLE_DEDUPLICATION: true,
  ENABLE_MEMORY_GRAPH_INTEGRATION: true,
  MEMORY_GRAPH_DIR: process.env.LEO_MEMORY_GRAPH_DIR || path.join(process.cwd(), 'data'),
  MEMORY_CHUNKS_FILE: 'chunks.jsonl',
  MEMORY_EMBEDDINGS_FILE: 'embeddings.jsonl'
};

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  // Initialize the config service adapter if needed
  if (!configServiceAdapter.isInitialized) {
    configServiceAdapter.initialize();
  }
  
  // Load configuration values using standardized property paths
  CONFIG = {
    CACHE_DIR: configServiceAdapter.getValue('enhancedContextRetrieval.cacheDir', 
      process.env.LEO_CONTEXT_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'context')),
    CACHE_EXPIRATION_MS: configServiceAdapter.getValue('enhancedContextRetrieval.cacheExpirationMinutes', 30) * 60 * 1000,
    MAX_CODE_CONTEXT_ITEMS: configServiceAdapter.getValue('enhancedContextRetrieval.maxCodeContextItems', 10),
    MAX_CONVERSATION_CONTEXT_ITEMS: configServiceAdapter.getValue('enhancedContextRetrieval.maxConversationContextItems', 5),
    MAX_NARRATIVE_CONTEXT_ITEMS: configServiceAdapter.getValue('enhancedContextRetrieval.maxNarrativeContextItems', 3),
    MAX_MEMORY_GRAPH_ITEMS: configServiceAdapter.getValue('enhancedContextRetrieval.maxMemoryGraphItems', 5),
    CODE_WEIGHT: configServiceAdapter.getValue('enhancedContextRetrieval.codeWeight', 0.5),
    CONVERSATION_WEIGHT: configServiceAdapter.getValue('enhancedContextRetrieval.conversationWeight', 0.3),
    NARRATIVE_WEIGHT: configServiceAdapter.getValue('enhancedContextRetrieval.narrativeWeight', 0.1),
    MEMORY_GRAPH_WEIGHT: configServiceAdapter.getValue('enhancedContextRetrieval.memoryGraphWeight', 0.1),
    DEFAULT_SIMILARITY_THRESHOLD: configServiceAdapter.getValue('enhancedContextRetrieval.defaultSimilarityThreshold', 0.65),
    ENABLE_CONTEXT_BLENDING: configServiceAdapter.getValue('enhancedContextRetrieval.enableContextBlending', true),
    ENABLE_QUERY_ANALYSIS: configServiceAdapter.getValue('enhancedContextRetrieval.enableQueryAnalysis', true),
    ENABLE_ADAPTIVE_SELECTION: configServiceAdapter.getValue('enhancedContextRetrieval.enableAdaptiveSelection', true),
    ENABLE_DEDUPLICATION: configServiceAdapter.getValue('enhancedContextRetrieval.enableDeduplication', true),
    ENABLE_MEMORY_GRAPH_INTEGRATION: configServiceAdapter.getValue('enhancedContextRetrieval.enableMemoryGraphIntegration', true),
    MEMORY_GRAPH_DIR: configServiceAdapter.getValue('enhancedContextRetrieval.memoryGraphDir',
      process.env.LEO_MEMORY_GRAPH_DIR || path.join(process.cwd(), 'data')),
    MEMORY_CHUNKS_FILE: configServiceAdapter.getValue('enhancedContextRetrieval.memoryChunksFile', 'chunks.jsonl'),
    MEMORY_EMBEDDINGS_FILE: configServiceAdapter.getValue('enhancedContextRetrieval.memoryEmbeddingsFile', 'embeddings.jsonl')
  };
  
  logger.info('Configuration initialized with standardized property paths');
}

// Initialize configuration
initializeConfig();

// Subscribe to configuration changes
configServiceAdapter.subscribeToChanges(COMPONENT_NAME, () => {
  logger.info('Configuration changed, reinitializing...');
  initializeConfig();
});

// Initialization state and cache
let isInitialized = false;
let queryCache = new Map();

// Service instances
let queryAnalyzer = null;
let adaptiveContextSelector = null;

/**
 * Initialize the enhanced context retrieval service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  // Lazy-load dependencies to avoid circular dependency
  if (!adaptiveContextSelector) {
    adaptiveContextSelector = require('./adaptive-context-selector');
  }
  try {
    // Prevent duplicate initialization
    if (isInitialized) {
      logger.warn('Enhanced context retrieval service already initialized, skipping duplicate initialization');
      return true;
    }
    
    logger.info('Initializing enhanced context retrieval service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Ensure config service adapter is initialized
    if (!configServiceAdapter.isInitialized) {
      try {
        await configServiceAdapter.initialize();
        logger.info('Config service adapter initialized successfully');
      } catch (configError) {
        logger.warn(`Could not initialize config service adapter: ${configError.message}`);
      }
    }
    
    // Refresh configuration using standardized access patterns
    try {
      initializeConfig();
      logger.info('Configuration refreshed successfully');
    } catch (configError) {
      logger.warn(`Could not refresh configuration: ${configError.message}`);
    }
    
    // Ensure cache directory exists
    try {
      await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
      logger.info(`Cache directory created: ${CONFIG.CACHE_DIR}`);
    } catch (error) {
      logger.error(`Failed to create cache directory: ${error.message}`);
      // Continue initialization despite cache directory error
    }
    
    // Initialize dependencies with proper error handling and timeouts
    const dependencyResults = await initializeDependencies(options);
    
    // Check if critical dependencies were initialized
    if (!dependencyResults.semanticContextManager) {
      logger.warn('Semantic context manager failed to initialize - context retrieval will be limited');
    }
    
    // Set up query analyzer
    try {
      queryAnalyzer = new QueryAnalyzer();
      logger.info('Query analyzer initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize query analyzer: ${error.message}`);
      // Continue without query analyzer, will use defaults
    }
    
    // Initialize the adaptive context selector singleton
    try {
      await adaptiveContextSelector.initialize({
        semanticContextAvailable: dependencyResults.semanticContextManager,
        conversationMemoryAvailable: dependencyResults.conversationMemoryManager,
        narrativeUnderstandingAvailable: dependencyResults.narrativeUnderstandingService,
        ...options
      });
      logger.info('Adaptive context selector initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize adaptive context selector: ${error.message}`);
      // Continue without adaptive context selector, will use fallback methods
    }
    
    // Mark as initialized
    isInitialized = true;
    
    // Register with event bus
    eventBus.emit('service:initialized', {
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    // Clear expired cache entries
    clearExpiredCache();
    
    // Schedule periodic cache cleanup
    setInterval(clearExpiredCache, CONFIG.CACHE_EXPIRATION_MS);
    
    logger.info('Enhanced context retrieval service initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Initialize dependencies with proper error handling and timeouts
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Status of each dependency
 * @private
 */
async function initializeDependencies(options = {}) {
  // Create an AbortController for timeout control
  const initializationTimeout = options.timeout || 60000; // 60 seconds default timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), initializationTimeout);
  
  try {
    // Track initialization status of dependencies
    const dependencyStatus = {
      semanticContextManager: false,
      conversationMemoryManager: false,
      narrativeUnderstandingService: false,
      conversationSemanticSearch: false,
      memoryIntegrationService: false
    };
    
    // Initialize services in the correct dependency order
    // 1. First initialize semantic context manager as it's the most critical dependency
    try {
      logger.info('Initializing semantic context manager...');
      if (!semanticContextManager.isInitialized) {
        await Promise.race([
          semanticContextManager.initialize({ signal: controller.signal }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Semantic context manager initialization timed out')), 30000);
          })
        ]);
      }
      dependencyStatus.semanticContextManager = true;
      logger.info('Semantic context manager initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize semantic context manager: ${error.message}`);
    }
    
    // 2. Initialize conversation memory manager if available
    try {
      logger.info('Initializing conversation memory manager...');
      if (conversationMemoryManager && typeof conversationMemoryManager.initialize === 'function') {
        await Promise.race([
          conversationMemoryManager.initialize({ signal: controller.signal }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Conversation memory manager initialization timed out')), 30000);
          })
        ]);
        dependencyStatus.conversationMemoryManager = true;
        logger.info('Conversation memory manager initialized successfully');
      } else {
        logger.warn('Conversation memory manager not available or lacks initialize method');
      }
    } catch (error) {
      logger.error(`Failed to initialize conversation memory manager: ${error.message}`);
    }
    
    // 3. Initialize narrative understanding service if available
    try {
      logger.info('Initializing narrative understanding service...');
      if (narrativeUnderstandingService && typeof narrativeUnderstandingService.initialize === 'function') {
        await Promise.race([
          narrativeUnderstandingService.initialize({ signal: controller.signal }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Narrative understanding service initialization timed out')), 30000);
          })
        ]);
        dependencyStatus.narrativeUnderstandingService = true;
        logger.info('Narrative understanding service initialized successfully');
      } else {
        logger.warn('Narrative understanding service not available or lacks initialize method');
      }
    } catch (error) {
      logger.error(`Failed to initialize narrative understanding service: ${error.message}`);
    }
    
    // 4. Initialize conversation semantic search
    try {
      logger.info('Initializing conversation semantic search...');
      if (conversationSemanticSearch && typeof conversationSemanticSearch.initialize === 'function') {
        await Promise.race([
          conversationSemanticSearch.initialize({ signal: controller.signal }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Conversation semantic search initialization timed out')), 30000);
          })
        ]);
        dependencyStatus.conversationSemanticSearch = true;
        logger.info('Conversation semantic search initialized successfully');
      } else {
        logger.warn('Conversation semantic search not available or lacks initialize method');
      }
    } catch (error) {
      logger.error(`Failed to initialize conversation semantic search: ${error.message}`);
    }
    
    // 5. Initialize memory integration service
    try {
      logger.info('Initializing memory integration service...');
      if (memoryIntegrationService && typeof memoryIntegrationService.initialize === 'function') {
        await Promise.race([
          memoryIntegrationService.initialize({ signal: controller.signal }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Memory integration service initialization timed out')), 30000);
          })
        ]);
        dependencyStatus.memoryIntegrationService = true;
        logger.info('Memory integration service initialized successfully');
      } else {
        logger.warn('Memory integration service not available or lacks initialize method');
      }
    } catch (error) {
      logger.error(`Failed to initialize memory integration service: ${error.message}`);
    }
    
    return dependencyStatus;
  } catch (error) {
    logger.error(`Error initializing dependencies: ${error.message}`);
    return {
      semanticContextManager: false,
      conversationMemoryManager: false,
      narrativeUnderstandingService: false,
      conversationSemanticSearch: false,
      memoryIntegrationService: false
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Clear expired cache entries
 * @private
 */
function clearExpiredCache() {
  try {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, value] of queryCache.entries()) {
      if (now - value.timestamp > CONFIG.CACHE_EXPIRATION_MS) {
        queryCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.info(`Cleared ${expiredCount} expired cache entries`);
    }
  } catch (error) {
    logger.error(`Error clearing expired cache: ${error.message}`);
  }
}

/**
 * Analyze query to determine context needs
 * @param {string} query - Query text
 * @returns {Object} Query analysis
 * @private
 */
function analyzeQuery(query) {
  try {
    if (!CONFIG.ENABLE_QUERY_ANALYSIS) {
      return {
        codeRelevance: 1.0,
        conversationRelevance: 1.0,
        narrativeRelevance: 1.0
      };
    }
    
    // Default weights
    let codeRelevance = CONFIG.CODE_WEIGHT;
    let conversationRelevance = CONFIG.CONVERSATION_WEIGHT;
    let narrativeRelevance = CONFIG.NARRATIVE_WEIGHT;
    
    // Code-related keywords
    const codeKeywords = [
      'code', 'function', 'class', 'method', 'variable', 'import', 
      'export', 'module', 'library', 'package', 'dependency', 'bug', 
      'error', 'fix', 'implement', 'refactor', 'optimize'
    ];
    
    // Conversation-related keywords
    const conversationKeywords = [
      'conversation', 'discussion', 'talk', 'chat', 'said', 'mentioned',
      'discussed', 'agreed', 'decided', 'conclusion', 'summary'
    ];
    
    // Narrative-related keywords
    const narrativeKeywords = [
      'history', 'timeline', 'evolution', 'progress', 'development',
      'journey', 'story', 'narrative', 'decision', 'rationale', 'why'
    ];
    
    // Count keyword occurrences
    const lowerQuery = query.toLowerCase();
    const codeCount = codeKeywords.filter(word => lowerQuery.includes(word)).length;
    const conversationCount = conversationKeywords.filter(word => lowerQuery.includes(word)).length;
    const narrativeCount = narrativeKeywords.filter(word => lowerQuery.includes(word)).length;
    
    // Adjust weights based on keyword counts
    const totalCount = codeCount + conversationCount + narrativeCount;
    if (totalCount > 0) {
      codeRelevance = 0.3 + (codeCount / totalCount) * 0.7;
      conversationRelevance = 0.3 + (conversationCount / totalCount) * 0.7;
      narrativeRelevance = 0.3 + (narrativeCount / totalCount) * 0.7;
    }
    
    // Normalize weights
    const sum = codeRelevance + conversationRelevance + narrativeRelevance;
    codeRelevance /= sum;
    conversationRelevance /= sum;
    narrativeRelevance /= sum;
    
    logger.info(`Query analysis: code=${codeRelevance.toFixed(2)}, conversation=${conversationRelevance.toFixed(2)}, narrative=${narrativeRelevance.toFixed(2)}`);
    
    return {
      codeRelevance,
      conversationRelevance,
      narrativeRelevance
    };
  } catch (error) {
    logger.error(`Error analyzing query: ${error.message}`);
    return {
      codeRelevance: CONFIG.CODE_WEIGHT,
      conversationRelevance: CONFIG.CONVERSATION_WEIGHT,
      narrativeRelevance: CONFIG.NARRATIVE_WEIGHT
    };
  }
  
  // Add analysis section if available
  if (analysis && analysis.trim()) {
    enhancedContext += `## Query Analysis\n${analysis}\n\n`;
  }
  
  // Add code context if available
  if (codeContext && codeContext.trim()) {
    enhancedContext += `## Code Context\n${codeContext}\n\n`;
  }
  
  // Add conversation context if available
  if (conversationContext && conversationContext.trim()) {
    enhancedContext += `## Conversation Context\n${conversationContext}\n\n`;
  }
  
  // Add memory graph context if available
  if (memoryGraphContext && memoryGraphContext.trim()) {
    enhancedContext += `## Memory Graph Context\n${memoryGraphContext}\n\n`;
  }
  
  // Add narrative context if available
  if (narrativeContext && narrativeContext.trim()) {
    enhancedContext += `## Narrative Context\n${narrativeContext}\n\n`;
  }
  
  return enhancedContext;
}

/**
 * Retrieve enhanced context for a query
 * @param {string} query - Query to retrieve context for
 * @param {Object} options - Options for context retrieval
 * @param {boolean} options.useCache - Whether to use cache
 * @param {number} options.similarityThreshold - Minimum similarity threshold
 * @param {number} options.maxCodeItems - Maximum number of code items to include
 * @param {number} options.maxConversationItems - Maximum number of conversation items to include
 * @param {number} options.maxNarrativeItems - Maximum number of narrative items to include
 * @param {number} options.maxMemoryGraphItems - Maximum number of memory graph items to include
 * @param {boolean} options.includeCodeContext - Whether to include code context
 * @param {boolean} options.includeConversationContext - Whether to include conversation context
 * @param {boolean} options.includeNarrativeContext - Whether to include narrative context
 * @param {boolean} options.includeMemoryIntegration - Whether to include memory graph data
 * @param {boolean} options.includeAnalysis - Whether to include query analysis
 * @param {AbortSignal} options.signal - Abort signal for cancellation
 * @returns {Promise<Object>} Enhanced context object
 */
async function retrieveContext(query, options = {}) {
  if (!isInitialized) {
    await initialize();
  }
  
  if (!query || typeof query !== 'string') {
    return {
      enhancedContext: `# Enhanced Leo Context\n\n## Error\nNo valid query provided.\n\n`,
      error: 'No valid query provided'
    };
  }
  
  // Set default options
  const useCache = options.useCache !== undefined ? options.useCache : true;
  const similarityThreshold = options.similarityThreshold || CONFIG.DEFAULT_SIMILARITY_THRESHOLD;
  const maxCodeItems = options.maxCodeItems || CONFIG.MAX_CODE_CONTEXT_ITEMS;
  const maxConversationItems = options.maxConversationItems || CONFIG.MAX_CONVERSATION_CONTEXT_ITEMS;
  const maxNarrativeItems = options.maxNarrativeItems || CONFIG.MAX_NARRATIVE_CONTEXT_ITEMS;
  const maxMemoryGraphItems = options.maxMemoryGraphItems || CONFIG.MAX_MEMORY_GRAPH_ITEMS;
  const includeCodeContext = options.includeCodeContext !== undefined ? options.includeCodeContext : true;
  const includeConversationContext = options.includeConversationContext !== undefined ? options.includeConversationContext : true;
  const includeNarrativeContext = options.includeNarrativeContext !== undefined ? options.includeNarrativeContext : true;
  const includeMemoryIntegration = options.includeMemoryIntegration !== undefined ? options.includeMemoryIntegration : CONFIG.ENABLE_MEMORY_GRAPH_INTEGRATION;
  const includeAnalysis = options.includeAnalysis !== undefined ? options.includeAnalysis : CONFIG.ENABLE_QUERY_ANALYSIS;
  const signal = options.signal;
  
  // Check for abort signal before starting
  if (signal && signal.aborted) {
    const abortError = new Error('Context retrieval aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }
  
  // Retrieve context from different sources in parallel
  const [codeContext, conversationContext, narrativeContext, memoryGraphContext, queryAnalysis] = await Promise.all([
    includeCodeContext ? retrieveCodeContext(query, { similarityThreshold, maxItems: maxCodeItems, signal }) : Promise.resolve(''),
    includeConversationContext ? retrieveConversationContext(query, { similarityThreshold, maxItems: maxConversationItems, signal }) : Promise.resolve(''),
    includeNarrativeContext ? retrieveNarrativeContext(query, { similarityThreshold, maxItems: maxNarrativeItems, signal }) : Promise.resolve(''),
    includeMemoryIntegration ? retrieveMemoryGraphContext(query, { similarityThreshold, maxItems: maxMemoryGraphItems, signal }) : Promise.resolve(''),
    includeAnalysis ? analyzeQuery(query) : Promise.resolve('')
  ]);
  
  // Clean up any outdated formatting in the contexts
  const codeContextCleaned = cleanFormatting(codeContext);
  const conversationContextCleaned = cleanFormatting(conversationContext);
  const narrativeContextCleaned = cleanFormatting(narrativeContext);
  const memoryGraphContextCleaned = cleanFormatting(memoryGraphContext);
  
  // Combine context using the adaptive context selector's method if available
  let combinedContext = '';
  if (adaptiveContextSelector && typeof adaptiveContextSelector._combineContext === 'function') {
    logger.info('Using adaptive context selector to combine contexts');
    combinedContext = adaptiveContextSelector._combineContext(
      codeContextCleaned,
      conversationContextCleaned,
      narrativeContextCleaned,
      memoryGraphContextCleaned,
      queryAnalysis
    );
  } else {
    // Fallback to simple combination if adaptive selector not available
    logger.info('Using simple context combination');
    combinedContext = combineContext(
      codeContextCleaned,
      conversationContextCleaned,
      narrativeContextCleaned,
      memoryGraphContextCleaned,
      queryAnalysis
    );
  }
  
  // Return result
  const result = {
    codeContext: codeContextCleaned,
    conversationContext: conversationContextCleaned,
    narrativeContext: narrativeContextCleaned,
    memoryGraphContext: memoryGraphContextCleaned,
    queryAnalysis: queryAnalysis,
    enhancedContext: combinedContext,
    metadata: {
      timestamp: Date.now(),
      query,
      analysis: queryAnalysis
    }
  };
  
  return result;
}

/**
 * Retrieve context from memory graph
 * @param {string} query - Query to retrieve context for
 * @param {Object} options - Options for context retrieval
 * @param {number} options.similarityThreshold - Minimum similarity threshold
 * @param {number} options.maxItems - Maximum number of items to include
 * @param {AbortSignal} options.signal - Abort signal for cancellation
 * @returns {Promise<string>} Memory graph context
 * @private
 */
async function retrieveMemoryGraphContext(query, options = {}) {
  try {
    if (!CONFIG.ENABLE_MEMORY_GRAPH_INTEGRATION) {
      return '';
    }
    
    logger.info(`Retrieving memory graph context for query: ${query.substring(0, 50)}...`);
    
    // Check for abort signal
    if (options.signal && options.signal.aborted) {
      logger.info('Memory graph context retrieval aborted');
      return '';
    }
    
    const similarityThreshold = options.similarityThreshold || CONFIG.DEFAULT_SIMILARITY_THRESHOLD;
    const maxItems = options.maxItems || CONFIG.MAX_MEMORY_GRAPH_ITEMS;
    
    // Get memory graph chunks and embeddings
    const chunks = await loadMemoryGraphChunks();
    const embeddings = await loadMemoryGraphEmbeddings();
    
    if (!chunks.length || !embeddings.length) {
      logger.warn('No memory graph chunks or embeddings found');
      return '';
    }
    
    // Generate embedding for query
    const queryEmbedding = await generateQueryEmbedding(query);
    
    if (!queryEmbedding) {
      logger.warn('Failed to generate embedding for query');
      return '';
    }
    
    // Calculate similarity for each chunk
    const chunkSimilarities = [];
    
    for (const embedding of embeddings) {
      // Find corresponding chunk
      const chunk = chunks.find(c => c.id === embedding.id);
      
      if (!chunk) {
        continue;
      }
      
      // Calculate similarity
      const similarity = calculateCosineSimilarity(queryEmbedding, embedding.embedding);
      
      if (similarity >= similarityThreshold) {
        chunkSimilarities.push({
          chunk,
          similarity
        });
      }
    }
    
    // Sort by similarity (descending)
    chunkSimilarities.sort((a, b) => b.similarity - a.similarity);
    
    // Limit to max items
    const topChunks = chunkSimilarities.slice(0, maxItems);
    
    if (topChunks.length === 0) {
      logger.info('No relevant memory graph chunks found');
      return '';
    }
    
    // Format context
    let context = '';
    
    for (const { chunk, similarity } of topChunks) {
      // Format chunk based on type
      if (chunk.type === 'conversation_metadata') {
        context += `### Conversation: ${chunk.title}\n`;
        context += `**Relevance**: ${(similarity * 100).toFixed(1)}%\n`;
        context += `${chunk.content}\n\n`;
      } else if (chunk.type === 'conversation_content') {
        context += `### Conversation Content: ${chunk.title}\n`;
        context += `**Relevance**: ${(similarity * 100).toFixed(1)}%\n`;
        context += `${chunk.content}\n\n`;
      } else {
        context += `### Memory: ${chunk.id}\n`;
        context += `**Relevance**: ${(similarity * 100).toFixed(1)}%\n`;
        context += `${chunk.content}\n\n`;
      }
    }
    
    logger.info(`Retrieved ${topChunks.length} memory graph chunks`);
    return context;
  } catch (error) {
    logger.error(`Error retrieving memory graph context: ${error.message}`);
    return '';
  }
}

/**
 * Load memory graph chunks
 * @returns {Promise<Array>} Memory graph chunks
 * @private
 */
async function loadMemoryGraphChunks() {
  try {
    const chunksPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_CHUNKS_FILE);
    
    try {
      await fs.access(chunksPath);
    } catch (accessError) {
      logger.warn(`Memory graph chunks file not found: ${chunksPath}`);
      return [];
    }
    
    const chunksContent = await fs.readFile(chunksPath, 'utf8');
    const chunks = chunksContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    return chunks;
  } catch (error) {
    logger.error(`Error loading memory graph chunks: ${error.message}`);
    return [];
  }
}

/**
 * Load memory graph embeddings
 * @returns {Promise<Array>} Memory graph embeddings
 * @private
 */
async function loadMemoryGraphEmbeddings() {
  try {
    const embeddingsPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_EMBEDDINGS_FILE);
    
    try {
      await fs.access(embeddingsPath);
    } catch (accessError) {
      logger.warn(`Memory graph embeddings file not found: ${embeddingsPath}`);
      return [];
    }
    
    const embeddingsContent = await fs.readFile(embeddingsPath, 'utf8');
    const embeddings = embeddingsContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    return embeddings;
  } catch (error) {
    logger.error(`Error loading memory graph embeddings: ${error.message}`);
    return [];
  }
}

/**
 * Generate embedding for query
 * @param {string} query - Query to generate embedding for
 * @returns {Promise<Array>} Query embedding
 * @private
 */
async function generateQueryEmbedding(query) {
  try {
    // Use semantic context manager to generate embedding
    if (semanticContextManager.isInitialized) {
      const result = await semanticContextManager.generateEmbedding(query);
      
      if (result.success && result.embedding) {
        return result.embedding;
      }
    }
    
    // Fallback to conversation semantic search
    if (conversationSemanticSearch.isInitialized) {
      const result = await conversationSemanticSearch.generateEmbedding(query);
      
      if (result.success && result.embedding) {
        return result.embedding;
      }
    }
    
    logger.warn('Could not generate embedding for query using available services');
    return null;
  } catch (error) {
    logger.error(`Error generating query embedding: ${error.message}`);
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array} vec1 - First vector
 * @param {Array} vec2 - Second vector
 * @returns {number} Cosine similarity
 * @private
 */
function calculateCosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || !Array.isArray(vec1) || !Array.isArray(vec2) || vec1.length !== vec2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }
  
  return dotProduct / (mag1 * mag2);
}

module.exports = {
  initialize,
  retrieveContext,
  isInitialized: () => isInitialized
};
