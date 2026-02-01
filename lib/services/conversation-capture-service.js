/**
 * Conversation Capture Service
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This service captures conversations between the user and Leo, storing them
 * with timestamps and metadata for future retrieval and analysis. It provides
 * the foundation for Leo's conversation awareness capabilities.
 *
 * The service follows Leo's standardized interfaces and adapter patterns.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const { calculateCosineSimilarity } = require('../utils/vector-utils');
const memoryIntegrationService = require('./memory-integration-service');
const semanticContextManager = require('./semantic-context-manager');

// Logger and embeddingsInterface will be set via DI
let logger = null;
let embeddingsInterface = null;

// Component name for event and config subscriptions
const COMPONENT_NAME = 'conversation-capture-service';

// Configuration with sensible defaults
let CONFIG = {
  STORAGE_DIR: process.env.LEO_CONVERSATION_DIR || path.join(process.cwd(), 'data', 'conversations'),
  MAX_CONVERSATION_AGE_DAYS: 30,
  ENABLE_AUTO_CAPTURE: true,
  METADATA_FILE: 'conversation_metadata.json',
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  ENABLE_SEMANTIC_SIMILARITY: true,
  SIMILARITY_THRESHOLD: 0.65,
  CACHE_EMBEDDINGS: true,
  MEMORY_GRAPH_DIR: process.env.LEO_MEMORY_GRAPH_DIR || path.join(process.cwd(), 'data'),
  MEMORY_CHUNKS_FILE: 'chunks.jsonl',
  MEMORY_EMBEDDINGS_FILE: 'embeddings.jsonl',
  ENABLE_MEMORY_GRAPH_INTEGRATION: true,
  CHUNK_SIZE: 1000, // Maximum size of a memory chunk in characters
  CHUNK_OVERLAP: 200, // Overlap between chunks in characters
  RELEVANCE_CATEGORIES: [
    { threshold: 0.85, label: 'highly-relevant', description: 'Highly relevant to current context' },
    { threshold: 0.70, label: 'relevant', description: 'Relevant to current context' },
    { threshold: 0.50, label: 'somewhat-relevant', description: 'Somewhat relevant to current context' },
    { threshold: 0.30, label: 'low-relevance', description: 'Low relevance to current context' },
    { threshold: 0.0, label: 'not-relevant', description: 'Not relevant to current context' }
  ]
};

// Conversation session state
let currentSession = null;
let isInitialized = false;
let conversationMetadata = {};

// Cache for embeddings to avoid redundant calculations
let embeddingsCache = new Map();

/**
 * Initialize the conversation capture service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[conversation-capture-service] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[conversation-capture-service] DI MIGRATION: logger not provided! Falling back to console.');
  }
  try {
    logger.info && logger.info('Initializing conversation capture service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationCapture) {
        Object.assign(CONFIG, config.conversationCapture);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure storage directory exists
    try {
      await fs.mkdir(CONFIG.STORAGE_DIR, { recursive: true });
      logger.info(`Conversation storage directory created: ${CONFIG.STORAGE_DIR}`);
    } catch (dirError) {
      logger.error(`Failed to create conversation storage directory: ${dirError.message}`);
      throw dirError;
    }
    
    // Load conversation metadata
    await loadMetadata();
    
    // Subscribe to events
    eventBus.on('conversation:message', async (data) => {
      try {
        await handleConversationMessage(data);
      } catch (error) {
        logger.error(`Error handling conversation message: ${error.message}`);
      }
    }, COMPONENT_NAME);
    eventBus.on('conversation:end', handleConversationEnd, COMPONENT_NAME);
    eventBus.on('conversation:start', handleConversationStart, COMPONENT_NAME);
    
    // Create a new session
    currentSession = createNewSession();
    
    isInitialized = true;
    logger.info('Conversation capture service initialized successfully');
    
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
 * Load conversation metadata from storage
 * @private
 */
async function loadMetadata() {
  try {
    const metadataPath = path.join(CONFIG.STORAGE_DIR, CONFIG.METADATA_FILE);
    
    // Check if metadata file exists
    try {
      await fs.access(metadataPath);
    } catch (accessError) {
      // Create empty metadata file if it doesn't exist
      conversationMetadata = { conversations: [] };
      await saveMetadata();
      return;
    }
    
    // Read and parse metadata file
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    conversationMetadata = JSON.parse(metadataContent);
    
    // Ensure the conversations array exists
    if (!conversationMetadata.conversations) {
      conversationMetadata.conversations = [];
    }
    
    logger.info(`Loaded metadata for ${conversationMetadata.conversations.length} conversations`);
  } catch (error) {
    logger.error(`Failed to load conversation metadata: ${error.message}`);
    conversationMetadata = { conversations: [] };
  }
}

/**
 * Save conversation metadata to storage
 * @private
 */
async function saveMetadata() {
  try {
    const metadataPath = path.join(CONFIG.STORAGE_DIR, CONFIG.METADATA_FILE);
    await fs.writeFile(metadataPath, JSON.stringify(conversationMetadata, null, 2), 'utf8');
    logger.info('Conversation metadata saved successfully');
  } catch (error) {
    logger.error(`Failed to save conversation metadata: ${error.message}`);
  }
}

/**
 * Create a new conversation session
 * @param {Object} options - Session options
 * @returns {Object} New session object
 * @private
 */
function createNewSession(options = {}) {
  const sessionId = crypto.randomUUID();
  const timestamp = Date.now();
  
  const session = {
    id: sessionId,
    startTime: timestamp,
    lastActivity: timestamp,
    messages: [],
    metadata: {
      tags: options.tags || [],
      title: options.title || `Conversation ${new Date(timestamp).toLocaleString()}`,
      description: options.description || '',
      activeFiles: options.activeFiles || [],
      projectContext: options.projectContext || ''
    }
  };
  
  logger.info(`Created new conversation session: ${sessionId}`);
  
  return session;
}

/**
 * Handle conversation message event
 * @param {Object} data - Message data
 * @private
 */
async function handleConversationMessage(data) {
  if (!isInitialized || !currentSession) {
    logger.warn('Received message but service is not initialized or no active session');
    return;
  }
  
  // Check if session has timed out
  const now = Date.now();
  if (now - currentSession.lastActivity > CONFIG.SESSION_TIMEOUT_MS) {
    logger.info(`Session ${currentSession.id} has timed out, creating new session`);
    
    // Save the current session
    await saveCurrentSession();
    
    // Create a new session
    currentSession = createNewSession();
  }
  
  // Update last activity
  currentSession.lastActivity = now;
  
  // Add message to session
  currentSession.messages.push({
    timestamp: now,
    role: data.role || 'user',
    content: data.content,
    metadata: data.metadata || {}
  });
  
  logger.debug(`Added message to session ${currentSession.id}, total messages: ${currentSession.messages.length}`);
  
  // Save the session after each message
  await saveCurrentSession();
}

/**
 * Handle conversation start event
 * @param {Object} data - Start data
 * @private
 */
function handleConversationStart(data) {
  if (!isInitialized) {
    logger.warn('Received start event but service is not initialized');
    return;
  }
  
  // Save current session if it exists and has messages
  if (currentSession && currentSession.messages.length > 0) {
    saveCurrentSession();
  }
  
  // Create a new session with provided metadata
  currentSession = createNewSession({
    tags: data.tags || [],
    title: data.title,
    description: data.description,
    activeFiles: data.activeFiles || [],
    projectContext: data.projectContext || ''
  });
  
  logger.info(`Started new conversation session: ${currentSession.id}`);
  
  // Emit event for other components
  eventBus.emit('conversation:session:started', {
    sessionId: currentSession.id,
    timestamp: currentSession.startTime
  });
}

/**
 * Handle conversation end event
 * @param {Object} data - End data
 * @private
 */
function handleConversationEnd(data) {
  if (!isInitialized || !currentSession) {
    logger.warn('Received end event but service is not initialized or no active session');
    return;
  }
  
  // Update session metadata if provided
  if (data.tags) {
    currentSession.metadata.tags = [...new Set([...currentSession.metadata.tags, ...data.tags])];
  }
  
  if (data.title) {
    currentSession.metadata.title = data.title;
  }
  
  if (data.summary) {
    currentSession.metadata.summary = data.summary;
  }
  
  // Save the session
  saveCurrentSession();
  
  logger.info(`Ended conversation session: ${currentSession.id}`);
  
  // Create a new empty session
  currentSession = createNewSession();
  
  // Emit event for other components
  eventBus.emit('conversation:session:ended', {
    sessionId: currentSession.id,
    timestamp: Date.now()
  });
}

/**
 * Save the current session to storage
 * @private
 */
async function saveCurrentSession() {
  if (!currentSession || currentSession.messages.length === 0) {
    logger.debug('No active session or empty session, nothing to save');
    return;
  }
  
  try {
    // Create session directory
    const sessionDir = path.join(CONFIG.STORAGE_DIR, currentSession.id);
    await fs.mkdir(sessionDir, { recursive: true });
    
    // Save session data
    const sessionPath = path.join(sessionDir, 'session.json');
    await fs.writeFile(sessionPath, JSON.stringify(currentSession, null, 2), 'utf8');
    
    // Add to metadata
    const metadataEntry = {
      id: currentSession.id,
      title: currentSession.metadata.title,
      startTime: currentSession.startTime,
      endTime: currentSession.lastActivity,
      messageCount: currentSession.messages.length,
      tags: currentSession.metadata.tags,
      summary: currentSession.metadata.summary || ''
    };
    
    conversationMetadata.conversations.push(metadataEntry);
    
    // Save metadata
    await saveMetadata();
    
    logger.info(`Saved conversation session: ${currentSession.id} with ${currentSession.messages.length} messages`);
    
    // Store in memory graph format if enabled
    if (CONFIG.ENABLE_MEMORY_GRAPH_INTEGRATION) {
      await storeConversationInMemoryGraph(currentSession);
    }
    
    // Clean up old conversations
    cleanupOldConversations();
    
    // Emit event for other services
    eventBus.emit('conversation:session:saved', {
      sessionId: currentSession.id,
      metadata: metadataEntry,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Failed to save conversation session: ${error.message}`);
    return false;
  }
}

/**
 * Clean up old conversations based on configuration
 * @private
 */
async function cleanupOldConversations() {
  try {
    const maxAgeMs = CONFIG.MAX_CONVERSATION_AGE_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Filter conversations to keep
    const oldConversations = conversationMetadata.conversations.filter(
      conv => (now - conv.endTime) > maxAgeMs
    );
    
    if (oldConversations.length === 0) {
      return;
    }
    
    logger.info(`Cleaning up ${oldConversations.length} old conversations`);
    
    // Delete old conversation directories
    for (const conv of oldConversations) {
      try {
        const convDir = path.join(CONFIG.STORAGE_DIR, conv.id);
        await fs.rm(convDir, { recursive: true, force: true });
        logger.debug(`Deleted old conversation: ${conv.id}`);
      } catch (deleteError) {
        logger.warn(`Failed to delete old conversation ${conv.id}: ${deleteError.message}`);
      }
    }
    
    // Update metadata
    conversationMetadata.conversations = conversationMetadata.conversations.filter(
      conv => (now - conv.endTime) <= maxAgeMs
    );
    
    // Save updated metadata
    await saveMetadata();
    
    logger.info(`Cleaned up ${oldConversations.length} old conversations`);
  } catch (error) {
    logger.error(`Failed to clean up old conversations: ${error.message}`);
  }
}

/**
 * Capture a conversation message
 * @param {Object} message - Message data
 * @param {string} message.role - Message role (user, assistant, system)
 * @param {string} message.content - Message content
 * @param {Object} message.metadata - Additional metadata
 * @returns {Promise<boolean>} Success status
 */
async function captureMessage(message) {
  if (!isInitialized) {
    logger.warn('Service not initialized, cannot capture message');
    return false;
  }
  
  try {
    // Add message directly to the current session
    const now = Date.now();
    
    if (!currentSession) {
      logger.warn('No active session, creating new session');
      currentSession = createNewSession();
    }
    
    // Update last activity
    currentSession.lastActivity = now;
    
    // Add message to session
    currentSession.messages.push({
      timestamp: now,
      role: message.role || 'user',
      content: message.content,
      metadata: message.metadata || {}
    });
    
    logger.debug(`Added message to session ${currentSession.id}, total messages: ${currentSession.messages.length}`);
    
    // Save the session after each message
    await saveCurrentSession();
    
    return true;
  } catch (error) {
    logger.error(`Failed to capture message: ${error.message}`);
    return false;
  }
}

/**
 * Start a new conversation session
 * @param {Object} options - Session options
 * @param {string[]} options.tags - Session tags
 * @param {string} options.title - Session title
 * @param {string} options.description - Session description
 * @param {string[]} options.activeFiles - Active files during the session
 * @param {string} options.projectContext - Project context
 * @returns {Promise<string>} Session ID
 */
async function startConversation(options = {}) {
  if (!isInitialized) {
    logger.warn('Service not initialized, cannot start conversation');
    return null;
  }
  
  try {
    // Emit event to trigger the handler
    eventBus.emit('conversation:start', options);
    return currentSession.id;
  } catch (error) {
    logger.error(`Failed to start conversation: ${error.message}`);
    return null;
  }
}

/**
 * End the current conversation session
 * @param {Object} options - End options
 * @param {string[]} options.tags - Additional tags to add
 * @param {string} options.title - Updated title
 * @param {string} options.summary - Conversation summary
 * @returns {Promise<boolean>} Success status
 */
async function endConversation(options = {}) {
  if (!isInitialized || !currentSession) {
    logger.warn('Service not initialized or no active session, cannot end conversation');
    return false;
  }
  
  try {
    // Emit event to trigger the handler
    eventBus.emit('conversation:end', options);
    return true;
  } catch (error) {
    logger.error(`Failed to end conversation: ${error.message}`);
    return false;
  }
}

/**
 * Get the current conversation session
 * @returns {Object} Current session
 */
function getCurrentSession() {
  return currentSession;
}

/**
 * Search for conversations by criteria
 * @param {Object} criteria - Search criteria
 * @param {string[]} criteria.tags - Tags to search for
 * @param {string} criteria.text - Text to search for in title or summary
 * @param {number} criteria.startTime - Minimum start time
 * @param {number} criteria.endTime - Maximum end time
 * @param {number} criteria.limit - Maximum number of results
 * @param {string} criteria.semanticQuery - Semantic query for similarity search
 * @param {number} criteria.similarityThreshold - Minimum similarity threshold
 * @returns {Promise<Array>} Matching conversations
 */
async function searchConversations(criteria = {}) {
  try {
    if (!isInitialized) {
      await initialize();
    }
    
    logger.info(`Searching conversations with criteria: ${JSON.stringify(criteria)}`);
    
    // Load metadata if not already loaded
    if (Object.keys(conversationMetadata).length === 0) {
      await loadMetadata();
    }
    
    // Filter conversations based on criteria
    let results = Object.values(conversationMetadata);
    
    // Filter by tags
    if (criteria.tags && Array.isArray(criteria.tags) && criteria.tags.length > 0) {
      results = results.filter(conversation => {
        if (!conversation.tags || !Array.isArray(conversation.tags)) {
          return false;
        }
        return criteria.tags.some(tag => conversation.tags.includes(tag));
      });
    }
    
    // Filter by text
    if (criteria.text && typeof criteria.text === 'string') {
      const searchText = criteria.text.toLowerCase();
      results = results.filter(conversation => {
        const title = (conversation.title || '').toLowerCase();
        const summary = (conversation.summary || '').toLowerCase();
        return title.includes(searchText) || summary.includes(searchText);
      });
    }
    
    // Filter by time range
    if (criteria.startTime && typeof criteria.startTime === 'number') {
      results = results.filter(conversation => conversation.startTime >= criteria.startTime);
    }
    
    if (criteria.endTime && typeof criteria.endTime === 'number') {
      results = results.filter(conversation => conversation.endTime <= criteria.endTime);
    }
    
    // Apply semantic similarity search if enabled and query provided
    if (CONFIG.ENABLE_SEMANTIC_SIMILARITY && criteria.semanticQuery) {
      try {
        // Generate embedding for the query
        const queryEmbedding = await getOrCreateEmbedding(criteria.semanticQuery);
        
        // Calculate similarity for each conversation
        const similarityThreshold = criteria.similarityThreshold || CONFIG.SIMILARITY_THRESHOLD;
        
        // Process each conversation for similarity
        const conversationsWithSimilarity = await Promise.all(
          results.map(async conversation => {
            // Use summary, title, and a sample of messages for similarity calculation
            const conversationText = [
              conversation.title || '',
              conversation.summary || '',
              // Get full conversation content
              await getConversationContent(conversation.id)
            ].join(' ');
            
            // Generate embedding for conversation text
            const conversationEmbedding = await getOrCreateEmbedding(conversationText);
            
            // Calculate similarity
            const similarity = calculateCosineSimilarity(queryEmbedding, conversationEmbedding);
            
            // Categorize relevance
            const relevanceCategory = categorizeRelevance(similarity);
            
            return {
              ...conversation,
              _semanticMetadata: {
                similarity,
                relevanceCategory
              }
            };
          })
        );
        
        // Filter by similarity threshold
        results = conversationsWithSimilarity
          .filter(conversation => conversation._semanticMetadata.similarity >= similarityThreshold)
          .sort((a, b) => b._semanticMetadata.similarity - a._semanticMetadata.similarity);
        
        logger.info(`Found ${results.length} semantically similar conversations`);
      } catch (semanticError) {
        logger.error(`Error in semantic search: ${semanticError.message}`);
        // Fall back to non-semantic results if semantic search fails
      }
    }
    
    // Sort by start time (most recent first) if not already sorted by similarity
    if (!criteria.semanticQuery) {
      results.sort((a, b) => b.startTime - a.startTime);
    }
    
    // Apply limit
    if (criteria.limit && typeof criteria.limit === 'number') {
      results = results.slice(0, criteria.limit);
    }
    
    logger.info(`Found ${results.length} matching conversations`);
    return results;
  } catch (error) {
    logger.error(`Error searching conversations: ${error.message}`);
    throw error;
  }
}

/**
 * Get a conversation by ID
 * @private
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation data
 * @throws {Error} If conversation not found or other error occurs
 */
async function getConversation(conversationId) {
  if (!isInitialized) {
    const error = new Error('Service not initialized, cannot get conversation');
    logger.warn(error.message);
    throw error;
  }
  
  if (!conversationId) {
    const error = new Error('Conversation ID is required');
    logger.warn(error.message);
    throw error;
  }
  
  try {
    const sessionPath = path.join(CONFIG.STORAGE_DIR, conversationId, 'session.json');
    
    try {
      await fs.access(sessionPath);
    } catch (accessError) {
      const error = new Error(`Conversation ${conversationId} not found`);
      logger.warn(error.message);
      throw error;
    }
    
    const sessionContent = await fs.readFile(sessionPath, 'utf8');
    
    try {
      const session = JSON.parse(sessionContent);
      logger.info(`Retrieved conversation ${conversationId} with ${session.messages.length} messages`);
      return session;
    } catch (parseError) {
      const error = new Error(`Failed to parse conversation data: ${parseError.message}`);
      logger.error(error.message);
      throw error;
    }
  } catch (error) {
    if (!error.message.includes('not found')) {
      logger.error(`Failed to get conversation ${conversationId}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Update conversation metadata
 * @param {string} conversationId - Conversation ID
 * @param {Object} updates - Metadata updates
 * @returns {Promise<boolean>} Success status
 */
async function updateConversationMetadata(conversationId, updates) {
  if (!isInitialized) {
    logger.warn('Service not initialized, cannot update conversation metadata');
    return false;
  }
  
  try {
    // Find the conversation in metadata
    const conversationIndex = conversationMetadata.conversations.findIndex(
      conv => conv.id === conversationId
    );
    
    if (conversationIndex === -1) {
      logger.warn(`Conversation ${conversationId} not found in metadata`);
      return false;
    }
    
    // Update metadata
    const conversation = conversationMetadata.conversations[conversationIndex];
    
    if (updates.tags) {
      conversation.tags = [...new Set([...conversation.tags, ...updates.tags])];
    }
    
    if (updates.title) {
      conversation.title = updates.title;
    }
    
    if (updates.summary) {
      conversation.summary = updates.summary;
    }
    
    // Save metadata
    await saveMetadata();
    
    // Update the session file if it exists
    try {
      const sessionPath = path.join(CONFIG.STORAGE_DIR, conversationId, 'session.json');
      
      try {
        await fs.access(sessionPath);
      } catch (accessError) {
        logger.warn(`Conversation ${conversationId} session file not found`);
        return true; // Metadata was updated successfully
      }
      
      const sessionContent = await fs.readFile(sessionPath, 'utf8');
      const session = JSON.parse(sessionContent);
      
      // Update session metadata
      if (updates.tags) {
        session.metadata.tags = [...new Set([...session.metadata.tags, ...updates.tags])];
      }
      
      if (updates.title) {
        session.metadata.title = updates.title;
      }
      
      if (updates.summary) {
        session.metadata.summary = updates.summary;
      }
      
      // Save updated session
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf8');
      
      logger.info(`Updated metadata for conversation ${conversationId}`);
      return true;
    } catch (sessionError) {
      logger.warn(`Failed to update session file for ${conversationId}: ${sessionError.message}`);
      return true; // Metadata was updated successfully
    }
  } catch (error) {
    logger.error(`Failed to update conversation metadata: ${error.message}`);
    return false;
  }
}

/**
 * Delete a conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteConversation(conversationId) {
  if (!isInitialized) {
    logger.warn('Service not initialized, cannot delete conversation');
    return false;
  }
  
  try {
    // Remove from metadata
    conversationMetadata.conversations = conversationMetadata.conversations.filter(
      conv => conv.id !== conversationId
    );
    
    // Save metadata
    await saveMetadata();
    
    // Delete conversation directory
    const convDir = path.join(CONFIG.STORAGE_DIR, conversationId);
    await fs.rm(convDir, { recursive: true, force: true });
    
    logger.info(`Deleted conversation ${conversationId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete conversation ${conversationId}: ${error.message}`);
    return false;
  }
}

// Export public API
/**
 * Get or create an embedding for text
 * @param {string} text - Text to get embedding for
 * @param {Object} options - Options for embedding generation
 * @param {boolean} options.forceRefresh - Force refresh the embedding even if cached
 * @param {boolean} options.useCache - Whether to use cache (overrides CONFIG.CACHE_EMBEDDINGS)
 * @returns {Promise<Array<number>>} Embedding vector
 * @private
 */
async function getOrCreateEmbedding(text, options = {}) {
  if (!text || typeof text !== 'string') {
    logger.warn('Invalid text provided for embedding');
    return null;
  }
  
  // Use shorter text for embedding if too long
  const maxEmbeddingLength = 8192;
  let textForEmbedding = text;
  if (text.length > maxEmbeddingLength) {
    // For long text, use a combination of beginning and end
    const halfLength = Math.floor(maxEmbeddingLength / 2);
    textForEmbedding = text.substring(0, halfLength) + '\n\n[...content omitted...]\n\n' + 
                       text.substring(text.length - halfLength);
    logger.debug(`Text truncated for embedding: ${text.length} -> ${textForEmbedding.length} chars`);
  }
  
  // Normalize text to improve cache hits
  const normalizedText = textForEmbedding.trim();
  
  // Determine if we should use cache
  const useCache = options.useCache !== undefined ? options.useCache : CONFIG.CACHE_EMBEDDINGS;
  
  // Check cache first if enabled and not forcing refresh
  if (useCache && !options.forceRefresh) {
    const cacheKey = crypto.createHash('md5').update(normalizedText).digest('hex');
    if (embeddingsCache.has(cacheKey)) {
      logger.debug('Using cached embedding');
      return embeddingsCache.get(cacheKey);
    }
    
    try {
      logger.debug('Generating new embedding');
      const embedding = await embeddings.generate(normalizedText);
      
      // Cache the result
      embeddingsCache.set(cacheKey, embedding);
      
      // Limit cache size to prevent memory issues
      if (embeddingsCache.size > 1000) {
        // Remove oldest entries (convert to array, sort, and keep newest 800)
        const entries = [...embeddingsCache.entries()];
        embeddingsCache = new Map(
          entries.slice(Math.max(0, entries.length - 800))
        );
        logger.debug(`Pruned embeddings cache to ${embeddingsCache.size} entries`);
      }
      
      return embedding;
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      return null;
    }
  } else {
    try {
      logger.debug(`Generating embedding ${options.forceRefresh ? '(forced refresh)' : '(cache disabled)'}`);
      return await embeddings.generate(normalizedText);
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      return null;
    }
  }
}

/**
 * Categorize relevance based on similarity score
 * @param {number} similarity - Similarity score
 * @returns {Object} Relevance category
 * @private
 */
function categorizeRelevance(similarity) {
  for (const category of CONFIG.RELEVANCE_CATEGORIES) {
    if (similarity >= category.threshold) {
      return category;
    }
  }
  return CONFIG.RELEVANCE_CATEGORIES[CONFIG.RELEVANCE_CATEGORIES.length - 1];
}

/**
 * Get full conversation content
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<string>} Conversation content
 * @private
 */
async function getConversationContent(conversationId) {
  try {
    const conversation = await getConversation(conversationId);
    if (!conversation || !conversation.messages) {
      return '';
    }
    
    return conversation.messages
      .map(message => message.content || '')
      .join(' ');
  } catch (error) {
    logger.error(`Error getting conversation content: ${error.message}`);
    return '';
  }
}

/**
 * Calculate lexical similarity between query and content
 * @param {string} query - Query string
 * @param {string} content - Content to compare against
 * @returns {number} Lexical similarity score (0-1)
 * @private
 */
function calculateLexicalSimilarity(query, content) {
  if (!query || !content) return 0;
  
  // Normalize text
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedContent = content.toLowerCase().trim();
  
  // Extract key terms from query (words with 4+ characters)
  const queryTerms = normalizedQuery
    .split(/\s+/)
    .filter(term => term.length >= 4)
    .map(term => term.replace(/[^a-z0-9]/g, ''));
  
  if (queryTerms.length === 0) return 0;
  
  // Count term occurrences
  let matchCount = 0;
  for (const term of queryTerms) {
    // Use regex to count occurrences
    const regex = new RegExp(`\\b${term}\\b`, 'g');
    const matches = normalizedContent.match(regex);
    if (matches) {
      matchCount += matches.length;
    }
  }
  
  // Calculate score based on matches and content length
  const contentWordCount = normalizedContent.split(/\s+/).length;
  const queryTermCount = queryTerms.length;
  
  // Normalize score (0-1 range)
  return Math.min(1, matchCount / (queryTermCount * 2));
}

/**
 * Generate an explanation for the relevance score
 * @param {number} similarity - Similarity score
 * @param {Object} conversation - Conversation object
 * @param {string} query - Query string
 * @returns {string} Explanation of relevance
 * @private
 */
function generateRelevanceExplanation(similarity, conversation, query) {
  // Base explanation on similarity score
  let explanation = '';
  
  if (similarity >= 0.85) {
    explanation = 'This conversation is highly relevant to your query. ';
  } else if (similarity >= 0.7) {
    explanation = 'This conversation is relevant to your query. ';
  } else if (similarity >= 0.5) {
    explanation = 'This conversation is somewhat relevant to your query. ';
  } else if (similarity >= 0.3) {
    explanation = 'This conversation has low relevance to your query. ';
  } else {
    explanation = 'This conversation does not appear to be relevant to your query. ';
  }
  
  // Add context about the conversation
  if (conversation.title) {
    explanation += `The conversation titled "${conversation.title}" `;
  } else {
    explanation += 'This conversation ';
  }
  
  // Add time context
  const conversationAge = Date.now() - (conversation.timestamp || 0);
  const daysAgo = Math.floor(conversationAge / (1000 * 60 * 60 * 24));
  
  if (daysAgo === 0) {
    explanation += 'occurred today. ';
  } else if (daysAgo === 1) {
    explanation += 'occurred yesterday. ';
  } else {
    explanation += `occurred ${daysAgo} days ago. `;
  }
  
  // Add information about message count if available
  if (conversation.messageCount) {
    explanation += `It contains ${conversation.messageCount} messages. `;
  }
  
  return explanation;
}

/**
 * Enhance conversation with semantic similarity
 * @param {Object} conversation - Conversation object
 * @param {string} query - Query to compare against
 * @param {Object} options - Options for enhancement
 * @param {boolean} options.includeReasons - Whether to include detailed reasons for scoring
 * @param {boolean} options.includeLexicalMatch - Whether to include lexical matching in scoring
 * @param {boolean} options.forceRefreshEmbeddings - Whether to force refresh embeddings
 * @returns {Promise<Object>} Enhanced conversation
 */
async function enhanceWithSemanticSimilarity(conversation, query, options = {}) {
  if (!CONFIG.ENABLE_SEMANTIC_SIMILARITY || !query) {
    return conversation;
  }
  
  try {
    // Get conversation content
    const content = await getConversationContent(conversation.id);
    if (!content) {
      logger.warn(`No content found for conversation ${conversation.id}`);
      return conversation;
    }
    
    // Generate embeddings with options
    const queryEmbedding = await getOrCreateEmbedding(query, {
      forceRefresh: options.forceRefreshEmbeddings
    });
    
    const contentEmbedding = await getOrCreateEmbedding(content, {
      forceRefresh: options.forceRefreshEmbeddings
    });
    
    if (!queryEmbedding || !contentEmbedding) {
      logger.warn('Could not generate embeddings for semantic similarity calculation');
      return conversation;
    }
    
    // Calculate semantic similarity
    const semanticSimilarity = calculateCosineSimilarity(queryEmbedding, contentEmbedding);
    
    // Calculate lexical similarity if requested
    let lexicalSimilarity = 0;
    if (options.includeLexicalMatch) {
      lexicalSimilarity = calculateLexicalSimilarity(query, content);
    }
    
    // Combine similarities (weighted average favoring semantic similarity)
    const combinedSimilarity = options.includeLexicalMatch
      ? (semanticSimilarity * 0.8) + (lexicalSimilarity * 0.2)
      : semanticSimilarity;
    
    // Categorize relevance
    const relevance = categorizeRelevance(combinedSimilarity);
    
    // Prepare detailed reasons if requested
    let scoringReasons = null;
    if (options.includeReasons) {
      scoringReasons = {
        semanticSimilarity,
        lexicalSimilarity: options.includeLexicalMatch ? lexicalSimilarity : null,
        combinedSimilarity,
        relevanceCategory: relevance.label,
        relevanceThreshold: relevance.threshold,
        explanation: generateRelevanceExplanation(combinedSimilarity, conversation, query)
      };
    }
    
    // Add to conversation
    return {
      ...conversation,
      similarity: combinedSimilarity,
      relevance,
      scoringReasons,
      _semanticMetadata: {
        queryProcessed: query,
        processedAt: Date.now()
      }
    };
  } catch (error) {
    logger.error(`Error enhancing conversation with semantic similarity: ${error.message}`);
    return conversation;
  }
}

/**
 * Store a conversation in memory graph format
 * @param {Object} session - Conversation session
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function storeConversationInMemoryGraph(session) {
  try {
    logger.info(`Storing conversation ${session.id} in memory graph format`);
    
    // Create chunks from the conversation
    const chunks = createConversationChunks(session);
    
    if (chunks.length === 0) {
      logger.warn(`No chunks created for conversation ${session.id}`);
      return false;
    }
    
    // Store chunks in memory graph
    const memoryGraphDir = CONFIG.MEMORY_GRAPH_DIR;
    const chunksPath = path.join(memoryGraphDir, CONFIG.MEMORY_CHUNKS_FILE);
    const embeddingsPath = path.join(memoryGraphDir, CONFIG.MEMORY_EMBEDDINGS_FILE);
    
    // Ensure memory graph directory exists
    await fs.mkdir(memoryGraphDir, { recursive: true });
    
    // Process each chunk
    for (const chunk of chunks) {
      // Generate embedding for chunk
      const embedding = await getOrCreateEmbedding(chunk.content, { forceRefresh: true });
      
      if (!embedding) {
        logger.warn(`Failed to generate embedding for chunk ${chunk.id}`);
        continue;
      }
      
      // Create chunk entry
      const chunkEntry = JSON.stringify(chunk) + '\n';
      
      // Create embedding entry
      const embeddingEntry = JSON.stringify({
        id: chunk.id,
        embedding: embedding
      }) + '\n';
      
      // Append to files
      await fs.appendFile(chunksPath, chunkEntry);
      await fs.appendFile(embeddingsPath, embeddingEntry);
      
      logger.debug(`Stored chunk ${chunk.id} in memory graph`);
    }
    
    logger.info(`Successfully stored ${chunks.length} chunks for conversation ${session.id} in memory graph`);
    
    // Emit event for memory integration
    eventBus.emit('conversation:memory:created', {
      memoryItem: {
        id: session.id,
        title: session.metadata.title,
        content: chunks.map(chunk => chunk.content).join('\n\n'),
        tags: session.metadata.tags,
        type: 'conversation',
        timestamp: Date.now()
      }
    });
    
    return true;
  } catch (error) {
    logger.error(`Error storing conversation in memory graph: ${error.message}`);
    return false;
  }
}

/**
 * Create chunks from a conversation session
 * @param {Object} session - Conversation session
 * @returns {Array} Conversation chunks
 * @private
 */
function createConversationChunks(session) {
  const chunks = [];
  
  // Create metadata chunk
  const metadataChunk = {
    id: `conv_meta_${session.id}`,
    type: 'conversation_metadata',
    conversationId: session.id,
    title: session.metadata.title,
    summary: session.metadata.summary || '',
    tags: session.metadata.tags || [],
    startTime: session.startTime,
    endTime: session.lastActivity,
    content: `# Conversation: ${session.metadata.title}\n\n` +
             `**Start Time**: ${new Date(session.startTime).toISOString()}\n` +
             `**End Time**: ${new Date(session.lastActivity).toISOString()}\n` +
             `**Tags**: ${(session.metadata.tags || []).join(', ')}\n\n` +
             `**Summary**: ${session.metadata.summary || 'No summary available.'}\n\n` +
             `**Context**: ${session.metadata.projectContext || 'No context available.'}`
  };
  
  chunks.push(metadataChunk);
  
  // Process messages
  if (session.messages && session.messages.length > 0) {
    // First, create a full conversation text
    let conversationText = '';
    
    for (const message of session.messages) {
      const timestamp = new Date(message.timestamp).toISOString();
      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      
      conversationText += `## ${role} (${timestamp})\n\n${message.content}\n\n`;
    }
    
    // Split into chunks with overlap
    const chunkSize = CONFIG.CHUNK_SIZE;
    const overlap = CONFIG.CHUNK_OVERLAP;
    
    // If conversation is small enough, create a single chunk
    if (conversationText.length <= chunkSize) {
      chunks.push({
        id: `conv_full_${session.id}`,
        type: 'conversation_content',
        conversationId: session.id,
        title: session.metadata.title,
        index: 0,
        total: 1,
        content: conversationText
      });
    } else {
      // Split into multiple chunks
      let position = 0;
      let chunkIndex = 0;
      
      while (position < conversationText.length) {
        // Calculate chunk boundaries
        const end = Math.min(position + chunkSize, conversationText.length);
        
        // Extract chunk text
        const chunkText = conversationText.substring(position, end);
        
        // Create chunk
        chunks.push({
          id: `conv_${session.id}_${chunkIndex}`,
          type: 'conversation_content',
          conversationId: session.id,
          title: `${session.metadata.title} (Part ${chunkIndex + 1})`,
          index: chunkIndex,
          total: Math.ceil(conversationText.length / (chunkSize - overlap)),
          content: chunkText
        });
        
        // Move position for next chunk, accounting for overlap
        position = end - overlap;
        if (position < 0) position = 0;
        
        chunkIndex++;
      }
    }
  }
  
  return chunks;
}

module.exports = {
  initialize,
  captureMessage,
  startConversation,
  endConversation,
  getCurrentSession,
  searchConversations,
  getConversation,
  updateConversationMetadata,
  deleteConversation,
  enhanceWithSemanticSimilarity,
  storeConversationInMemoryGraph
};
