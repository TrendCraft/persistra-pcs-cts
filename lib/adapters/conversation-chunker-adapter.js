/**
 * Conversation Chunker Adapter
 * 
 * This adapter extends the semantic chunker to work specifically with conversation data.
 * It processes conversation text into semantic chunks optimized for understanding
 * the flow and meaning of conversations, taking into account the unique structure
 * of dialogue between users and Leo.
 * 
 * This is part of Phase 2: Semantic Understanding for the Conversation-Aware Leo implementation.
 */

const { createComponentLogger } = require('../utils/logger');
const semanticChunkerAdapter = require('./semantic-chunker-adapter');
const eventBus = require('../utils/event-bus');
const configService = require('../config/config');
const path = require('path');
const crypto = require('crypto');

// Component name for logging and events
const COMPONENT_NAME = 'conversation-chunker-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  MAX_CHUNK_SIZE: 1000,
  MIN_CHUNK_SIZE: 200,
  OVERLAP_SIZE: 50,
  PRESERVE_TURNS: true, // Try to keep conversation turns together
  CONTEXT_WINDOW: 2,    // Include N previous turns for context
  INCLUDE_METADATA: true // Include conversation metadata in chunks
};

// Initialization state
let isInitialized = false;

/**
 * Initialize the conversation chunker adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing conversation chunker adapter');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationChunker) {
        Object.assign(CONFIG, config.conversationChunker);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure the semantic chunker adapter is initialized
    if (!await semanticChunkerAdapter.initialize()) {
      throw new Error('Failed to initialize semantic chunker adapter');
    }
    
    isInitialized = true;
    logger.info('Conversation chunker adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('component:initialized', { 
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Preprocess conversation data for chunking
 * @param {Object} conversation - Conversation data
 * @returns {string} Preprocessed text
 * @private
 */
function preprocessConversation(conversation) {
  try {
    if (!conversation || !conversation.messages || !Array.isArray(conversation.messages)) {
      throw new Error('Invalid conversation data: missing or invalid messages array');
    }
    
    let preprocessedText = '';
    
    // Add conversation metadata if available and configured
    if (CONFIG.INCLUDE_METADATA && conversation.metadata) {
      preprocessedText += `# Conversation: ${conversation.metadata.title || 'Untitled'}\n`;
      preprocessedText += `# Date: ${new Date(conversation.startTime).toISOString()}\n`;
      
      if (conversation.metadata.tags && conversation.metadata.tags.length > 0) {
        preprocessedText += `# Tags: ${conversation.metadata.tags.join(', ')}\n`;
      }
      
      if (conversation.metadata.description) {
        preprocessedText += `# Description: ${conversation.metadata.description}\n`;
      }
      
      if (conversation.metadata.projectContext) {
        preprocessedText += `# Project Context: ${conversation.metadata.projectContext}\n`;
      }
      
      preprocessedText += '\n';
    }
    
    // Process messages
    conversation.messages.forEach((message, index) => {
      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      const timestamp = message.timestamp 
        ? new Date(message.timestamp).toISOString() 
        : 'Unknown time';
      
      preprocessedText += `[${role} - ${timestamp}]\n${message.content}\n\n`;
    });
    
    return preprocessedText;
  } catch (error) {
    logger.error(`Error preprocessing conversation: ${error.message}`);
    throw error;
  }
}

/**
 * Chunk a conversation into semantic units
 * @param {Object} conversation - Conversation data
 * @param {Object} options - Chunking options
 * @returns {Promise<Array>} Array of chunks
 */
async function chunkConversation(conversation, options = {}) {
  if (!isInitialized) {
    logger.warn('Conversation chunker adapter not initialized');
    return [];
  }
  
  try {
    // Generate a conversation ID if not provided
    const conversationId = conversation.id || crypto.randomUUID();
    
    // Preprocess the conversation into text format
    const preprocessedText = preprocessConversation(conversation);
    
    // Extract options with defaults from CONFIG
    const { 
      maxChunkSize = CONFIG.MAX_CHUNK_SIZE,
      minChunkSize = CONFIG.MIN_CHUNK_SIZE,
      overlapSize = CONFIG.OVERLAP_SIZE
    } = options;
    
    // Create a virtual file path for the conversation
    const virtualFilePath = `conversations/${conversationId}.md`;
    
    logger.debug(`Chunking conversation ${conversationId} with options: ${JSON.stringify({ 
      maxChunkSize, minChunkSize, overlapSize 
    })}`);
    
    // For conversations, we'll use a simpler chunking approach instead of relying on
    // the semantic chunker's language-specific features which are designed for code
    const chunks = [];
    
    // Simple chunking by size with overlap
    if (preprocessedText.length <= maxChunkSize) {
      // If the entire conversation fits in one chunk, use it as is
      chunks.push({
        id: `${conversationId}-chunk-1`,
        text: preprocessedText,
        filePath: virtualFilePath,
        startIndex: 0,
        endIndex: preprocessedText.length,
        metadata: {
          type: 'conversation',
          language: 'markdown'
        }
      });
    } else {
      // Split into chunks with overlap
      let startIndex = 0;
      let chunkIndex = 1;
      
      while (startIndex < preprocessedText.length) {
        const endIndex = Math.min(startIndex + maxChunkSize, preprocessedText.length);
        const chunkText = preprocessedText.substring(startIndex, endIndex);
        
        chunks.push({
          id: `${conversationId}-chunk-${chunkIndex}`,
          text: chunkText,
          filePath: virtualFilePath,
          startIndex,
          endIndex,
          metadata: {
            type: 'conversation',
            language: 'markdown',
            chunkIndex
          }
        });
        
        // Move start index for next chunk, accounting for overlap
        startIndex = endIndex - overlapSize;
        if (startIndex < 0) startIndex = 0;
        if (startIndex >= preprocessedText.length) break;
        
        chunkIndex++;
      }
    }
    
    // Enhance chunks with conversation-specific metadata
    const enhancedChunks = chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        conversationId,
        startTime: conversation.startTime,
        endTime: conversation.lastActivity || conversation.endTime,
        tags: conversation.metadata?.tags || [],
        title: conversation.metadata?.title || 'Untitled Conversation'
      }
    }));
    
    logger.info(`Generated ${enhancedChunks.length} chunks for conversation ${conversationId}`);
    
    // Emit event for monitoring
    eventBus.emit('conversation:chunks:created', { 
      component: COMPONENT_NAME,
      conversationId,
      count: enhancedChunks.length
    });
    
    return enhancedChunks;
  } catch (error) {
    logger.error(`Error chunking conversation: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to chunk conversation', 
      error: error.message 
    });
    
    return [];
  }
}

/**
 * Process multiple conversations to generate chunks
 * @param {Array<Object>} conversations - Array of conversation objects
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of chunks
 */
async function processConversations(conversations, options = {}) {
  if (!isInitialized) {
    logger.warn('Conversation chunker adapter not initialized');
    return [];
  }
  
  if (!Array.isArray(conversations)) {
    logger.error('Invalid input: conversations must be an array');
    return [];
  }
  
  try {
    logger.info(`Processing ${conversations.length} conversations`);
    
    const allChunks = [];
    
    // Process each conversation
    for (const conversation of conversations) {
      const chunks = await chunkConversation(conversation, options);
      allChunks.push(...chunks);
    }
    
    logger.info(`Generated a total of ${allChunks.length} chunks from ${conversations.length} conversations`);
    
    return allChunks;
  } catch (error) {
    logger.error(`Error processing conversations: ${error.message}`);
    return [];
  }
}

/**
 * Get metrics about the chunker
 * @returns {Object} Metrics object
 */
function getMetrics() {
  return {
    component: COMPONENT_NAME,
    isInitialized,
    config: { ...CONFIG }
  };
}

// Export the adapter API
module.exports = {
  initialize,
  chunkConversation,
  processConversations,
  getMetrics
};
