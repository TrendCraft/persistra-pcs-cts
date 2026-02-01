/**
 * Conversation Capture Adapter
 * 
 * This adapter connects the Enhanced Prompting System with the Conversation Capture Service,
 * allowing for seamless capture of conversations while maintaining the existing functionality.
 * It follows Leo's standardized adapter pattern.
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../utils/logger');
const conversationCaptureService = require('../services/conversation-capture-service');
const eventBus = require('../utils/event-bus');
const configService = require('../config/config');

// Create component logger
const logger = createComponentLogger('conversation-capture-adapter');

// Component name for event and config subscriptions
const COMPONENT_NAME = 'conversation-capture-adapter';

// Configuration with sensible defaults
let CONFIG = {
  ENABLE_AUTO_CAPTURE: true,
  AUTO_TAG_FILES: true,
  CAPTURE_SYSTEM_MESSAGES: false,
  INCLUDE_ACTIVE_FILES: true
};

// Adapter state
let isInitialized = false;
let activeFiles = new Set();
let currentSessionId = null;

/**
 * Initialize the conversation capture adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing conversation capture adapter...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationCaptureAdapter) {
        Object.assign(CONFIG, config.conversationCaptureAdapter);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Enforce strict DI
    const { embeddingsInterface, logger: injectedLogger } = options;
    if (!embeddingsInterface || !injectedLogger) {
      throw new Error('conversation-capture-adapter: DI missing embeddingsInterface or logger');
    }
    logger = injectedLogger;

    // Remove DI from options before passing config
    const nonDIOptions = { ...options };
    delete nonDIOptions.embeddingsInterface;
    delete nonDIOptions.logger;

    // Initialize the conversation capture service with DI
    await conversationCaptureService.initialize({
      ...nonDIOptions,
      embeddingsInterface,
      logger
    });

    // Subscribe to events
    eventBus.on('file:opened', handleFileOpened, COMPONENT_NAME);
    eventBus.on('file:closed', handleFileClosed, COMPONENT_NAME);
    eventBus.on('prompt:processed', handlePromptProcessed, COMPONENT_NAME);
    eventBus.on('response:received', handleResponseReceived, COMPONENT_NAME);

    isInitialized = true;
    logger.info('Conversation capture adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('adapter:initialized', { 
      adapter: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Handle file opened event
 * @param {Object} data - Event data
 * @private
 */
function handleFileOpened(data) {
  if (!isInitialized) return;
  
  if (data.filePath) {
    activeFiles.add(data.filePath);
    logger.debug(`Added ${data.filePath} to active files, total: ${activeFiles.size}`);
  }
}

/**
 * Handle file closed event
 * @param {Object} data - Event data
 * @private
 */
function handleFileClosed(data) {
  if (!isInitialized) return;
  
  if (data.filePath && activeFiles.has(data.filePath)) {
    activeFiles.delete(data.filePath);
    logger.debug(`Removed ${data.filePath} from active files, total: ${activeFiles.size}`);
  }
}

/**
 * Handle prompt processed event
 * @param {Object} data - Event data
 * @private
 */
async function handlePromptProcessed(data) {
  if (!isInitialized || !CONFIG.ENABLE_AUTO_CAPTURE) return;
  
  try {
    // If no active session, start one
    if (!currentSessionId) {
      const sessionOptions = {
        title: `Conversation ${new Date().toLocaleString()}`,
        tags: ['prompt'],
        activeFiles: CONFIG.INCLUDE_ACTIVE_FILES ? Array.from(activeFiles) : []
      };
      
      // Auto-tag with file extensions if enabled
      if (CONFIG.AUTO_TAG_FILES && CONFIG.INCLUDE_ACTIVE_FILES) {
        const extensions = new Set();
        for (const file of activeFiles) {
          const ext = path.extname(file).toLowerCase().replace('.', '');
          if (ext) extensions.add(ext);
        }
        
        if (extensions.size > 0) {
          sessionOptions.tags = [...sessionOptions.tags, ...Array.from(extensions)];
        }
      }
      
      currentSessionId = await conversationCaptureService.startConversation(sessionOptions);
      logger.info(`Started new conversation session: ${currentSessionId}`);
    }
    
    // Capture the prompt
    await conversationCaptureService.captureMessage({
      role: 'user',
      content: data.prompt,
      metadata: {
        enhancedPrompt: data.enhancedPrompt,
        timestamp: Date.now(),
        activeFiles: CONFIG.INCLUDE_ACTIVE_FILES ? Array.from(activeFiles) : []
      }
    });
    
    logger.debug('Captured user prompt');
  } catch (error) {
    logger.error(`Failed to handle prompt processed event: ${error.message}`);
  }
}

/**
 * Handle response received event
 * @param {Object} data - Event data
 * @private
 */
async function handleResponseReceived(data) {
  if (!isInitialized || !CONFIG.ENABLE_AUTO_CAPTURE) return;
  
  try {
    // If no active session, start one (shouldn't happen normally)
    if (!currentSessionId) {
      currentSessionId = await conversationCaptureService.startConversation({
        title: `Conversation ${new Date().toLocaleString()}`,
        tags: ['response'],
        activeFiles: CONFIG.INCLUDE_ACTIVE_FILES ? Array.from(activeFiles) : []
      });
      logger.info(`Started new conversation session: ${currentSessionId}`);
    }
    
    // Capture the response
    await conversationCaptureService.captureMessage({
      role: 'assistant',
      content: data.response,
      metadata: {
        timestamp: Date.now(),
        activeFiles: CONFIG.INCLUDE_ACTIVE_FILES ? Array.from(activeFiles) : []
      }
    });
    
    logger.debug('Captured assistant response');
  } catch (error) {
    logger.error(`Failed to handle response received event: ${error.message}`);
  }
}

/**
 * Start a new conversation session
 * @param {Object} options - Session options
 * @returns {Promise<string>} Session ID
 */
async function startConversation(options = {}) {
  if (!isInitialized) {
    logger.warn('Adapter not initialized, cannot start conversation');
    return null;
  }
  
  try {
    // End current session if exists
    if (currentSessionId) {
      await endConversation();
    }
    
    // Include active files if enabled
    if (CONFIG.INCLUDE_ACTIVE_FILES && !options.activeFiles) {
      options.activeFiles = Array.from(activeFiles);
    }
    
    // Start new session
    currentSessionId = await conversationCaptureService.startConversation(options);
    logger.info(`Started new conversation session: ${currentSessionId}`);
    
    return currentSessionId;
  } catch (error) {
    logger.error(`Failed to start conversation: ${error.message}`);
    return null;
  }
}

/**
 * End the current conversation session
 * @param {Object} options - End options
 * @returns {Promise<boolean>} Success status
 */
async function endConversation(options = {}) {
  if (!isInitialized || !currentSessionId) {
    logger.warn('Adapter not initialized or no active session, cannot end conversation');
    return false;
  }
  
  try {
    await conversationCaptureService.endConversation(options);
    logger.info(`Ended conversation session: ${currentSessionId}`);
    
    currentSessionId = null;
    return true;
  } catch (error) {
    logger.error(`Failed to end conversation: ${error.message}`);
    return false;
  }
}

/**
 * Capture a message in the current conversation
 * @param {Object} message - Message data
 * @returns {Promise<boolean>} Success status
 */
async function captureMessage(message) {
  if (!isInitialized) {
    logger.warn('Adapter not initialized, cannot capture message');
    return false;
  }
  
  try {
    // If no active session, start one
    if (!currentSessionId) {
      currentSessionId = await conversationCaptureService.startConversation({
        title: `Conversation ${new Date().toLocaleString()}`,
        tags: ['manual-capture'],
        activeFiles: CONFIG.INCLUDE_ACTIVE_FILES ? Array.from(activeFiles) : []
      });
      logger.info(`Started new conversation session: ${currentSessionId}`);
    }
    
    // Include active files if enabled
    if (CONFIG.INCLUDE_ACTIVE_FILES && !message.metadata) {
      message.metadata = { activeFiles: Array.from(activeFiles) };
    } else if (CONFIG.INCLUDE_ACTIVE_FILES && message.metadata) {
      message.metadata.activeFiles = Array.from(activeFiles);
    }
    
    // Capture the message
    await conversationCaptureService.captureMessage(message);
    logger.debug(`Captured ${message.role} message`);
    
    return true;
  } catch (error) {
    logger.error(`Failed to capture message: ${error.message}`);
    return false;
  }
}

/**
 * Get the current conversation session
 * @returns {Promise<Object>} Current session
 */
async function getCurrentSession() {
  if (!isInitialized || !currentSessionId) {
    return null;
  }
  
  try {
    return await conversationCaptureService.getConversation(currentSessionId);
  } catch (error) {
    logger.error(`Failed to get current session: ${error.message}`);
    return null;
  }
}

/**
 * Search for conversations by criteria
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Matching conversations
 */
async function searchConversations(criteria = {}) {
  if (!isInitialized) {
    logger.warn('Adapter not initialized, cannot search conversations');
    return [];
  }
  
  try {
    return await conversationCaptureService.searchConversations(criteria);
  } catch (error) {
    logger.error(`Failed to search conversations: ${error.message}`);
    return [];
  }
}

/**
 * Get a conversation by ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation data
 */
async function getConversation(conversationId) {
  if (!isInitialized) {
    logger.warn('Adapter not initialized, cannot get conversation');
    return null;
  }
  
  try {
    return await conversationCaptureService.getConversation(conversationId);
  } catch (error) {
    logger.error(`Failed to get conversation: ${error.message}`);
    return null;
  }
}

// Export public API
module.exports = {
  initialize,
  startConversation,
  endConversation,
  captureMessage,
  getCurrentSession,
  searchConversations,
  getConversation
};
