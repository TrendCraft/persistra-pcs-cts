/**
 * Conversation Semantic Search Service
 * 
 * This service provides semantic search capabilities for conversation data,
 * allowing Leo to find relevant past conversations based on semantic similarity.
 * It leverages the conversation chunker and embeddings adapters to process
 * conversations into searchable semantic units.
 * 
 * This is part of Phase 2: Semantic Understanding for the Conversation-Aware Leo implementation.
 */

const { createComponentLogger } = require('../utils/logger');
const conversationChunkerAdapter = require('../adapters/conversation-chunker-adapter');
const conversationEmbeddingsAdapter = require('../adapters/conversation-embeddings-adapter');
const conversationCaptureService = require('./conversation-capture-service');
const eventBus = require('../utils/event-bus');
const configService = require('../config/config');
const path = require('path');
const fs = require('fs').promises;

// Component name for logging and events
const COMPONENT_NAME = 'conversation-semantic-search';

// Logger is now injected via DI, not created here
let logger = null; // Will be set in initialize()


// Configuration with sensible defaults
let CONFIG = {
  INDEX_DIR: process.env.LEO_CONVERSATION_INDEX_DIR || path.join(process.cwd(), 'data', 'indexes', 'conversations'),
  INDEX_FILE: 'conversation-index.jsonl',
  AUTO_INDEX_NEW_CONVERSATIONS: true,
  INDEX_BATCH_SIZE: 10,
  DEFAULT_SEARCH_LIMIT: 5,
  DEFAULT_SIMILARITY_THRESHOLD: 0.7,
  REINDEX_INTERVAL_DAYS: 7
};

// Initialization state
let isInitialized = false;

// In-memory index for fast searching
let conversationIndex = [];
let lastIndexUpdate = 0;

/**
 * Initialize the conversation semantic search service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  // Enforce strict DI
  const { embeddingsInterface, logger: injectedLogger } = options;
  if (!embeddingsInterface || !injectedLogger) {
    throw new Error('conversation-semantic-search: DI missing embeddingsInterface or logger');
  }
  logger = injectedLogger;

  try {
    logger.info('Initializing conversation semantic search service');

    // Merge options with defaults (excluding DI)
    const nonDIOptions = { ...options };
    delete nonDIOptions.embeddingsInterface;
    delete nonDIOptions.logger;
    Object.assign(CONFIG, nonDIOptions);

    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationSemanticSearch) {
        Object.assign(CONFIG, config.conversationSemanticSearch);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }

    // Ensure required components are initialized with DI
    if (!await conversationChunkerAdapter.initialize({ embeddingsInterface, logger })) {
      throw new Error('Failed to initialize conversation chunker adapter');
    }

    if (!await conversationEmbeddingsAdapter.initialize({ embeddingsInterface, logger })) {
      throw new Error('Failed to initialize conversation embeddings adapter');
    }

    // Ensure index directory exists
    await fs.mkdir(CONFIG.INDEX_DIR, { recursive: true });

    // Load the conversation index
    await loadIndex();

    // Subscribe to events
    if (CONFIG.AUTO_INDEX_NEW_CONVERSATIONS) {
      eventBus.on('conversation:end', handleConversationEnd, COMPONENT_NAME);
    }
    
    isInitialized = true;
    logger.info('Conversation semantic search service initialized successfully');
    
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
 * Load the conversation index from disk
 * @private
 */
async function loadIndex() {
  try {
    const indexPath = path.join(CONFIG.INDEX_DIR, CONFIG.INDEX_FILE);
    
    try {
      await fs.access(indexPath);
    } catch (accessError) {
      // Index file doesn't exist, create empty index
      conversationIndex = [];
      lastIndexUpdate = Date.now();
      logger.info('Created new conversation index');
      return;
    }
    
    // Read index file line by line (JSONL format)
    const indexContent = await fs.readFile(indexPath, 'utf8');
    const lines = indexContent.split('\n').filter(line => line.trim());
    
    conversationIndex = lines.map(line => JSON.parse(line));
    lastIndexUpdate = Date.now();
    
    logger.info(`Loaded ${conversationIndex.length} chunks from conversation index`);
  } catch (error) {
    logger.error(`Failed to load conversation index: ${error.message}`);
    conversationIndex = [];
    lastIndexUpdate = Date.now();
  }
}

/**
 * Save the conversation index to disk
 * @private
 */
async function saveIndex() {
  try {
    const indexPath = path.join(CONFIG.INDEX_DIR, CONFIG.INDEX_FILE);
    
    // Convert index to JSONL format
    const indexContent = conversationIndex.map(chunk => JSON.stringify(chunk)).join('\n');
    
    await fs.writeFile(indexPath, indexContent, 'utf8');
    lastIndexUpdate = Date.now();
    
    logger.info(`Saved ${conversationIndex.length} chunks to conversation index`);
  } catch (error) {
    logger.error(`Failed to save conversation index: ${error.message}`);
  }
}

/**
 * Handle conversation end event
 * @param {Object} data - Event data
 * @private
 */
async function handleConversationEnd(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const conversationId = data.conversationId;
    
    if (!conversationId) {
      logger.warn('Received conversation:end event without conversationId');
      return;
    }
    
    logger.info(`Processing ended conversation: ${conversationId}`);
    
    // Get the conversation data
    const conversation = await conversationCaptureService.getConversation(conversationId);
    
    if (!conversation) {
      logger.warn(`Could not find conversation ${conversationId}`);
      return;
    }
    
    // Index the conversation
    await indexConversation(conversation);
  } catch (error) {
    logger.error(`Error handling conversation end event: ${error.message}`);
  }
}

/**
 * Index a conversation for semantic search
 * @param {Object} conversation - Conversation data
 * @returns {Promise<boolean>} Success status
 */
async function indexConversation(conversation) {
  if (!isInitialized) {
    logger.warn('Conversation semantic search service not initialized');
    return false;
  }
  
  try {
    const conversationId = conversation.id;
    
    logger.info(`Indexing conversation: ${conversationId}`);
    
    // Check if conversation is already indexed
    const existingChunks = conversationIndex.filter(chunk => 
      chunk.metadata && chunk.metadata.conversationId === conversationId
    );
    
    if (existingChunks.length > 0) {
      logger.info(`Conversation ${conversationId} already has ${existingChunks.length} chunks indexed`);
      
      // Remove existing chunks for this conversation
      conversationIndex = conversationIndex.filter(chunk => 
        !chunk.metadata || chunk.metadata.conversationId !== conversationId
      );
      
      logger.info(`Removed ${existingChunks.length} existing chunks for conversation ${conversationId}`);
    }
    
    // Chunk the conversation
    const chunks = await conversationChunkerAdapter.chunkConversation(conversation);
    
    if (chunks.length === 0) {
      logger.warn(`No chunks generated for conversation ${conversationId}`);
      return false;
    }
    
    // Generate embeddings for chunks
    const chunksWithEmbeddings = await conversationEmbeddingsAdapter.generateChunkEmbeddings(chunks);
    
    if (chunksWithEmbeddings.length === 0) {
      logger.warn(`No embeddings generated for conversation ${conversationId}`);
      return false;
    }
    
    // Add chunks to index
    conversationIndex.push(...chunksWithEmbeddings);
    
    // Save the updated index
    await saveIndex();
    
    logger.info(`Indexed conversation ${conversationId} with ${chunksWithEmbeddings.length} chunks`);
    
    // Emit event for monitoring
    eventBus.emit('conversation:indexed', { 
      component: COMPONENT_NAME,
      conversationId,
      chunkCount: chunksWithEmbeddings.length
    });
    
    return true;
  } catch (error) {
    logger.error(`Error indexing conversation: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to index conversation', 
      error: error.message 
    });
    
    return false;
  }
}

/**
 * Index multiple conversations for semantic search
 * @param {Array<Object>} conversations - Array of conversation objects
 * @returns {Promise<Object>} Result with success count and errors
 */
async function indexConversations(conversations) {
  if (!isInitialized) {
    logger.warn('Conversation semantic search service not initialized');
    return { success: 0, failed: conversations.length, errors: ['Service not initialized'] };
  }
  
  if (!Array.isArray(conversations)) {
    logger.error('Invalid input: conversations must be an array');
    return { success: 0, failed: 1, errors: ['Invalid input: conversations must be an array'] };
  }
  
  try {
    logger.info(`Indexing ${conversations.length} conversations`);
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    // Process conversations in batches to avoid memory issues
    const batchSize = CONFIG.INDEX_BATCH_SIZE;
    
    for (let i = 0; i < conversations.length; i += batchSize) {
      const batch = conversations.slice(i, i + batchSize);
      logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(conversations.length / batchSize)}`);
      
      for (const conversation of batch) {
        try {
          const success = await indexConversation(conversation);
          
          if (success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`Failed to index conversation ${conversation.id}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Error indexing conversation ${conversation.id}: ${error.message}`);
        }
      }
    }
    
    logger.info(`Indexed ${results.success} conversations successfully, ${results.failed} failed`);
    
    return results;
  } catch (error) {
    logger.error(`Error indexing conversations: ${error.message}`);
    return { 
      success: 0, 
      failed: conversations.length, 
      errors: [`Error indexing conversations: ${error.message}`] 
    };
  }
}

/**
 * Search for semantically similar conversations
 * @param {string} query - Search query text
 * @param {Object} options - Search options
 * @returns {Promise<Array<Object>>} Matching conversations with similarity scores
 */
async function searchConversations(query, options = {}) {
  if (!isInitialized) {
    logger.warn('Conversation semantic search service not initialized');
    return [];
  }
  
  try {
    // Extract options with defaults
    const { 
      limit = CONFIG.DEFAULT_SEARCH_LIMIT,
      threshold = CONFIG.DEFAULT_SIMILARITY_THRESHOLD,
      conversationIds = [],
      tags = [],
      startTime,
      endTime
    } = options;
    
    logger.info(`Searching conversations with query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
    
    // Check if index needs reindexing
    const indexAge = Date.now() - lastIndexUpdate;
    const reindexThreshold = CONFIG.REINDEX_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    
    if (indexAge > reindexThreshold) {
      logger.info(`Index is older than ${CONFIG.REINDEX_INTERVAL_DAYS} days, consider reindexing`);
    }
    
    // Create a query chunk
    const queryChunk = {
      text: query,
      id: 'query',
      metadata: {}
    };
    
    // Generate embedding for query
    const queryWithEmbedding = await conversationEmbeddingsAdapter.generateChunkEmbedding(queryChunk);
    
    if (!queryWithEmbedding || queryWithEmbedding.length === 0) {
      logger.error('Failed to generate embedding for query');
      return [];
    }
    
    // Filter index based on metadata criteria
    let filteredIndex = [...conversationIndex];
    
    if (conversationIds.length > 0) {
      filteredIndex = filteredIndex.filter(chunk => 
        chunk.metadata && 
        chunk.metadata.conversationId && 
        conversationIds.includes(chunk.metadata.conversationId)
      );
    }
    
    if (tags.length > 0) {
      filteredIndex = filteredIndex.filter(chunk => {
        if (!chunk.metadata || !chunk.metadata.tags) return false;
        return tags.some(tag => chunk.metadata.tags.includes(tag));
      });
    }
    
    if (startTime) {
      filteredIndex = filteredIndex.filter(chunk => 
        chunk.metadata && 
        chunk.metadata.startTime && 
        chunk.metadata.startTime >= startTime
      );
    }
    
    if (endTime) {
      filteredIndex = filteredIndex.filter(chunk => 
        chunk.metadata && 
        chunk.metadata.endTime && 
        chunk.metadata.endTime <= endTime
      );
    }
    
    logger.debug(`Filtered index to ${filteredIndex.length} chunks based on metadata criteria`);
    
    // Find similar chunks
    const similarChunks = conversationEmbeddingsAdapter.findSimilarChunks(
      { ...queryChunk, embedding: queryWithEmbedding },
      filteredIndex,
      { limit: limit * 3, threshold } // Get more chunks than needed to ensure diverse conversations
    );
    
    if (similarChunks.length === 0) {
      logger.info('No similar chunks found');
      return [];
    }
    
    // Group by conversation and calculate average similarity
    const conversationSimilarities = {};
    
    for (const chunk of similarChunks) {
      const conversationId = chunk.metadata.conversationId;
      
      if (!conversationId) continue;
      
      if (!conversationSimilarities[conversationId]) {
        conversationSimilarities[conversationId] = {
          conversationId,
          chunks: [],
          totalSimilarity: 0,
          averageSimilarity: 0,
          metadata: { ...chunk.metadata }
        };
      }
      
      conversationSimilarities[conversationId].chunks.push(chunk);
      conversationSimilarities[conversationId].totalSimilarity += chunk.similarity;
    }
    
    // Calculate average similarity for each conversation
    for (const conversationId in conversationSimilarities) {
      const conversation = conversationSimilarities[conversationId];
      conversation.averageSimilarity = conversation.totalSimilarity / conversation.chunks.length;
    }
    
    // Convert to array and sort by average similarity
    const results = Object.values(conversationSimilarities)
      .sort((a, b) => b.averageSimilarity - a.averageSimilarity)
      .slice(0, limit);
    
    logger.info(`Found ${results.length} similar conversations`);
    
    // Emit event for monitoring
    eventBus.emit('conversation:search:completed', { 
      component: COMPONENT_NAME,
      query: query.substring(0, 50),
      resultCount: results.length
    });
    
    return results;
  } catch (error) {
    logger.error(`Error searching conversations: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to search conversations', 
      error: error.message 
    });
    
    return [];
  }
}

/**
 * Reindex all conversations
 * @returns {Promise<Object>} Result with success count and errors
 */
async function reindexAllConversations() {
  if (!isInitialized) {
    logger.warn('Conversation semantic search service not initialized');
    return { success: 0, failed: 0, errors: ['Service not initialized'] };
  }
  
  try {
    logger.info('Reindexing all conversations');
    
    // Clear existing index
    conversationIndex = [];
    
    // Get all conversations
    const conversations = await conversationCaptureService.searchConversations({});
    
    if (!conversations || conversations.length === 0) {
      logger.info('No conversations found to reindex');
      await saveIndex();
      return { success: 0, failed: 0, errors: [] };
    }
    
    logger.info(`Found ${conversations.length} conversations to reindex`);
    
    // Index all conversations
    const results = await indexConversations(conversations);
    
    logger.info(`Reindexing completed: ${results.success} succeeded, ${results.failed} failed`);
    
    return results;
  } catch (error) {
    logger.error(`Error reindexing conversations: ${error.message}`);
    return { 
      success: 0, 
      failed: 0, 
      errors: [`Error reindexing conversations: ${error.message}`] 
    };
  }
}

/**
 * Get metrics about the search service
 * @returns {Object} Metrics object
 */
function getMetrics() {
  return {
    component: COMPONENT_NAME,
    isInitialized,
    indexSize: conversationIndex.length,
    lastIndexUpdate,
    config: { ...CONFIG }
  };
}

// Export the service API
module.exports = {
  initialize,
  indexConversation,
  indexConversations,
  searchConversations,
  reindexAllConversations,
  getMetrics
};
