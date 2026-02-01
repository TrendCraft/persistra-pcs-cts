/**
 * Conversation Summarizer Service
 * 
 * This service generates summaries of conversations, extracts key insights,
 * and links them to code changes. It's part of Phase 3 of the Conversation-Aware
 * Leo implementation, focusing on conversation summarization.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Component name for logging and events
const COMPONENT_NAME = 'conversation-summarizer';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  STORAGE_DIR: process.env.LEO_SUMMARY_DIR || path.join(process.cwd(), 'data', 'summaries'),
  MAX_SUMMARY_AGE_DAYS: 60,
  AUTO_SUMMARIZE: true,
  SUMMARY_FILE: 'summary_metadata.json',
  MIN_CONVERSATION_LENGTH: 4, // Minimum number of messages to trigger summarization
  SUMMARY_TYPES: ['concise', 'detailed', 'technical', 'actionable']
};

// Initialization state
let isInitialized = false;
let summaryMetadata = {};

/**
 * Initialize the conversation summarizer service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing conversation summarizer service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationSummarizer) {
        Object.assign(CONFIG, config.conversationSummarizer);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure storage directory exists
    try {
      await fs.mkdir(CONFIG.STORAGE_DIR, { recursive: true });
      logger.info(`Summary storage directory created: ${CONFIG.STORAGE_DIR}`);
    } catch (dirError) {
      logger.error(`Failed to create summary storage directory: ${dirError.message}`);
      throw dirError;
    }
    
    // Load summary metadata
    await loadMetadata();
    
    // Subscribe to events
    if (CONFIG.AUTO_SUMMARIZE) {
      eventBus.on('conversation:end', handleConversationEnd, COMPONENT_NAME);
    }
    
    isInitialized = true;
    logger.info('Conversation summarizer service initialized successfully');
    
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
 * Load summary metadata from storage
 * @private
 */
async function loadMetadata() {
  try {
    const metadataPath = path.join(CONFIG.STORAGE_DIR, CONFIG.SUMMARY_FILE);
    
    // Check if metadata file exists
    try {
      await fs.access(metadataPath);
    } catch (accessError) {
      // Create empty metadata file if it doesn't exist
      summaryMetadata = { summaries: [] };
      await saveMetadata();
      return;
    }
    
    // Read and parse metadata file
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    summaryMetadata = JSON.parse(metadataContent);
    
    // Ensure the summaries array exists
    if (!summaryMetadata.summaries) {
      summaryMetadata.summaries = [];
    }
    
    logger.info(`Loaded metadata for ${summaryMetadata.summaries.length} summaries`);
  } catch (error) {
    logger.error(`Failed to load summary metadata: ${error.message}`);
    summaryMetadata = { summaries: [] };
  }
}

/**
 * Save summary metadata to storage
 * @private
 */
async function saveMetadata() {
  try {
    const metadataPath = path.join(CONFIG.STORAGE_DIR, CONFIG.SUMMARY_FILE);
    await fs.writeFile(metadataPath, JSON.stringify(summaryMetadata, null, 2), 'utf8');
    logger.info('Summary metadata saved successfully');
  } catch (error) {
    logger.error(`Failed to save summary metadata: ${error.message}`);
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
    
    logger.info(`Processing ended conversation for summarization: ${conversationId}`);
    
    // Get the conversation data from the event or fetch it
    const conversation = data.conversation;
    
    if (!conversation) {
      logger.warn(`No conversation data provided for ${conversationId}`);
      return;
    }
    
    // Check if conversation meets minimum length requirement
    if (!conversation.messages || conversation.messages.length < CONFIG.MIN_CONVERSATION_LENGTH) {
      logger.info(`Conversation ${conversationId} too short for summarization (${conversation.messages?.length || 0} messages)`);
      return;
    }
    
    // Generate summary
    await summarizeConversation(conversation);
  } catch (error) {
    logger.error(`Error handling conversation end event: ${error.message}`);
  }
}

/**
 * Extract key topics from conversation
 * @param {Object} conversation - Conversation data
 * @returns {Array<string>} Array of key topics
 * @private
 */
function extractKeyTopics(conversation) {
  try {
    // Simple keyword extraction based on frequency and importance
    const stopWords = ['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'like', 'through'];
    const importantPrefixes = ['implement', 'creat', 'develop', 'build', 'design', 'refactor', 'optimiz', 'fix', 'add', 'remov', 'updat'];
    
    // Combine all message content
    const allText = conversation.messages
      .map(msg => msg.content)
      .join(' ')
      .toLowerCase();
    
    // Split into words and count frequency
    const words = allText.split(/\s+/);
    const wordFrequency = {};
    
    words.forEach(word => {
      // Clean word of punctuation
      const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
      if (cleanWord.length < 3 || stopWords.includes(cleanWord)) return;
      
      wordFrequency[cleanWord] = (wordFrequency[cleanWord] || 0) + 1;
    });
    
    // Score words based on frequency and importance
    const wordScores = {};
    Object.keys(wordFrequency).forEach(word => {
      let score = wordFrequency[word];
      
      // Boost score for important prefixes
      if (importantPrefixes.some(prefix => word.startsWith(prefix))) {
        score *= 2;
      }
      
      // Boost score for technical terms (longer words are often technical)
      if (word.length > 8) {
        score *= 1.5;
      }
      
      wordScores[word] = score;
    });
    
    // Get top scoring words
    const topWords = Object.keys(wordScores)
      .sort((a, b) => wordScores[b] - wordScores[a])
      .slice(0, 10);
    
    return topWords;
  } catch (error) {
    logger.error(`Error extracting key topics: ${error.message}`);
    return [];
  }
}

/**
 * Extract code references from conversation
 * @param {Object} conversation - Conversation data
 * @returns {Array<Object>} Array of code references
 * @private
 */
function extractCodeReferences(conversation) {
  try {
    const codeReferences = [];
    const filePathRegex = /(?:\/[\w-]+)+\.[\w-]+/g; // Simple regex for file paths
    const functionRegex = /\b\w+\([^)]*\)/g; // Simple regex for function calls
    
    // Extract from each message
    conversation.messages.forEach(message => {
      const content = message.content;
      
      // Extract file paths
      const filePaths = content.match(filePathRegex) || [];
      filePaths.forEach(path => {
        if (!codeReferences.some(ref => ref.type === 'file' && ref.path === path)) {
          codeReferences.push({
            type: 'file',
            path,
            context: content.substring(Math.max(0, content.indexOf(path) - 20), 
                                      Math.min(content.length, content.indexOf(path) + path.length + 20))
          });
        }
      });
      
      // Extract function references
      const functions = content.match(functionRegex) || [];
      functions.forEach(func => {
        if (!codeReferences.some(ref => ref.type === 'function' && ref.name === func)) {
          codeReferences.push({
            type: 'function',
            name: func,
            context: content.substring(Math.max(0, content.indexOf(func) - 20), 
                                      Math.min(content.length, content.indexOf(func) + func.length + 20))
          });
        }
      });
    });
    
    return codeReferences;
  } catch (error) {
    logger.error(`Error extracting code references: ${error.message}`);
    return [];
  }
}

/**
 * Extract decisions from conversation
 * @param {Object} conversation - Conversation data
 * @returns {Array<Object>} Array of decisions
 * @private
 */
function extractDecisions(conversation) {
  try {
    const decisions = [];
    const decisionPhrases = [
      'decided to', 'agreed to', 'will use', 'should use', 'going with',
      'selected', 'chosen', 'opted for', 'concluded that', 'determined that'
    ];
    
    // Extract from each message
    conversation.messages.forEach((message, index) => {
      const content = message.content.toLowerCase();
      
      decisionPhrases.forEach(phrase => {
        if (content.includes(phrase)) {
          // Get the sentence containing the decision
          const sentences = message.content.split(/[.!?]+/);
          const decisionSentence = sentences.find(s => s.toLowerCase().includes(phrase));
          
          if (decisionSentence) {
            decisions.push({
              text: decisionSentence.trim(),
              by: message.role,
              messageIndex: index,
              timestamp: message.timestamp
            });
          }
        }
      });
    });
    
    return decisions;
  } catch (error) {
    logger.error(`Error extracting decisions: ${error.message}`);
    return [];
  }
}

/**
 * Generate a concise summary of the conversation
 * @param {Object} conversation - Conversation data
 * @returns {string} Concise summary
 * @private
 */
function generateConciseSummary(conversation) {
  try {
    // Extract basic conversation stats
    const messageCount = conversation.messages.length;
    const userMessages = conversation.messages.filter(m => m.role === 'user').length;
    const assistantMessages = conversation.messages.filter(m => m.role === 'assistant').length;
    const topics = extractKeyTopics(conversation);
    const decisions = extractDecisions(conversation);
    
    // Generate summary
    let summary = `Conversation with ${messageCount} messages (${userMessages} from user, ${assistantMessages} from assistant)`;
    
    if (topics.length > 0) {
      summary += ` about ${topics.slice(0, 3).join(', ')}`;
    }
    
    if (decisions.length > 0) {
      summary += `. Key decisions: ${decisions.length}`;
    }
    
    return summary;
  } catch (error) {
    logger.error(`Error generating concise summary: ${error.message}`);
    return 'Error generating summary';
  }
}

/**
 * Generate a detailed summary of the conversation
 * @param {Object} conversation - Conversation data
 * @returns {string} Detailed summary
 * @private
 */
function generateDetailedSummary(conversation) {
  try {
    // Extract conversation components
    const topics = extractKeyTopics(conversation);
    const decisions = extractDecisions(conversation);
    const codeReferences = extractCodeReferences(conversation);
    
    // Generate summary sections
    let summary = '# Conversation Summary\n\n';
    
    // Add basic information
    summary += `## Overview\n\n`;
    summary += `- **Date**: ${new Date(conversation.startTime).toLocaleString()}\n`;
    summary += `- **Duration**: ${Math.round((conversation.lastActivity - conversation.startTime) / 60000)} minutes\n`;
    summary += `- **Messages**: ${conversation.messages.length}\n`;
    
    // Add topics section
    if (topics.length > 0) {
      summary += `\n## Key Topics\n\n`;
      topics.forEach(topic => {
        summary += `- ${topic}\n`;
      });
    }
    
    // Add decisions section
    if (decisions.length > 0) {
      summary += `\n## Decisions Made\n\n`;
      decisions.forEach(decision => {
        summary += `- ${decision.text}\n`;
      });
    }
    
    // Add code references section
    if (codeReferences.length > 0) {
      summary += `\n## Code References\n\n`;
      const files = codeReferences.filter(ref => ref.type === 'file');
      const functions = codeReferences.filter(ref => ref.type === 'function');
      
      if (files.length > 0) {
        summary += `### Files\n\n`;
        files.forEach(file => {
          summary += `- \`${file.path}\`\n`;
        });
      }
      
      if (functions.length > 0) {
        summary += `\n### Functions\n\n`;
        functions.forEach(func => {
          summary += `- \`${func.name}\`\n`;
        });
      }
    }
    
    return summary;
  } catch (error) {
    logger.error(`Error generating detailed summary: ${error.message}`);
    return 'Error generating detailed summary';
  }
}

/**
 * Generate a technical summary of the conversation
 * @param {Object} conversation - Conversation data
 * @returns {string} Technical summary
 * @private
 */
function generateTechnicalSummary(conversation) {
  try {
    // Extract technical components
    const codeReferences = extractCodeReferences(conversation);
    const decisions = extractDecisions(conversation);
    
    // Generate summary
    let summary = '# Technical Summary\n\n';
    
    // Add code references section with more technical detail
    if (codeReferences.length > 0) {
      summary += `## Code Components Discussed\n\n`;
      
      const files = codeReferences.filter(ref => ref.type === 'file');
      if (files.length > 0) {
        summary += `### Files\n\n`;
        files.forEach(file => {
          summary += `- \`${file.path}\`\n`;
          summary += `  Context: "${file.context.trim()}"\n\n`;
        });
      }
      
      const functions = codeReferences.filter(ref => ref.type === 'function');
      if (functions.length > 0) {
        summary += `### Functions\n\n`;
        functions.forEach(func => {
          summary += `- \`${func.name}\`\n`;
          summary += `  Context: "${func.context.trim()}"\n\n`;
        });
      }
    }
    
    // Add technical decisions
    if (decisions.length > 0) {
      summary += `## Technical Decisions\n\n`;
      decisions.forEach(decision => {
        summary += `- ${decision.text}\n`;
      });
    }
    
    return summary;
  } catch (error) {
    logger.error(`Error generating technical summary: ${error.message}`);
    return 'Error generating technical summary';
  }
}

/**
 * Generate an actionable summary of the conversation
 * @param {Object} conversation - Conversation data
 * @returns {string} Actionable summary
 * @private
 */
function generateActionableSummary(conversation) {
  try {
    // Look for action items in the conversation
    const actionItems = [];
    const actionPhrases = [
      'need to', 'should', 'will', 'must', 'todo', 'to-do', 'action item',
      'follow up', 'follow-up', 'task', 'implement', 'create', 'update', 'fix'
    ];
    
    // Extract from each message
    conversation.messages.forEach((message, index) => {
      const content = message.content.toLowerCase();
      
      actionPhrases.forEach(phrase => {
        if (content.includes(phrase)) {
          // Get the sentence containing the action
          const sentences = message.content.split(/[.!?]+/);
          const actionSentences = sentences.filter(s => s.toLowerCase().includes(phrase));
          
          actionSentences.forEach(sentence => {
            if (sentence && sentence.trim()) {
              actionItems.push({
                text: sentence.trim(),
                by: message.role,
                messageIndex: index,
                timestamp: message.timestamp
              });
            }
          });
        }
      });
    });
    
    // Generate summary
    let summary = '# Action Items\n\n';
    
    if (actionItems.length > 0) {
      actionItems.forEach((item, index) => {
        summary += `${index + 1}. ${item.text}\n`;
      });
    } else {
      summary += 'No specific action items identified in this conversation.\n';
    }
    
    return summary;
  } catch (error) {
    logger.error(`Error generating actionable summary: ${error.message}`);
    return 'Error generating actionable summary';
  }
}

/**
 * Summarize a conversation
 * @param {Object} conversation - Conversation data
 * @returns {Promise<Object>} Summary data
 */
async function summarizeConversation(conversation) {
  if (!isInitialized) {
    logger.warn('Conversation summarizer service not initialized');
    return null;
  }
  
  try {
    const conversationId = conversation.id;
    logger.info(`Summarizing conversation: ${conversationId}`);
    
    // Generate a summary ID
    const summaryId = crypto.randomUUID();
    
    // Extract key components
    const topics = extractKeyTopics(conversation);
    const decisions = extractDecisions(conversation);
    const codeReferences = extractCodeReferences(conversation);
    
    // Generate different types of summaries
    const summaries = {
      concise: generateConciseSummary(conversation),
      detailed: generateDetailedSummary(conversation),
      technical: generateTechnicalSummary(conversation),
      actionable: generateActionableSummary(conversation)
    };
    
    // Create summary object
    const summary = {
      id: summaryId,
      conversationId,
      timestamp: Date.now(),
      topics,
      decisions,
      codeReferences,
      summaries,
      metadata: {
        title: conversation.metadata?.title || 'Untitled Conversation',
        tags: conversation.metadata?.tags || [],
        startTime: conversation.startTime,
        endTime: conversation.lastActivity || conversation.endTime,
        messageCount: conversation.messages.length
      }
    };
    
    // Save summary
    await saveSummary(summary);
    
    // Add to metadata
    summaryMetadata.summaries.push({
      id: summaryId,
      conversationId,
      timestamp: summary.timestamp,
      title: summary.metadata.title,
      topics: topics.slice(0, 5),
      tags: summary.metadata.tags
    });
    
    // Save metadata
    await saveMetadata();
    
    logger.info(`Generated summary ${summaryId} for conversation ${conversationId}`);
    
    // Emit event
    eventBus.emit('conversation:summarized', {
      component: COMPONENT_NAME,
      summaryId,
      conversationId
    });
    
    return summary;
  } catch (error) {
    logger.error(`Error summarizing conversation: ${error.message}`);
    
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to summarize conversation', 
      error: error.message 
    });
    
    return null;
  }
}

/**
 * Save a summary to storage
 * @param {Object} summary - Summary data
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function saveSummary(summary) {
  try {
    // Create summary directory
    const summaryDir = path.join(CONFIG.STORAGE_DIR, summary.id);
    await fs.mkdir(summaryDir, { recursive: true });
    
    // Save summary data
    const summaryPath = path.join(summaryDir, 'summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    
    logger.info(`Saved summary ${summary.id} to ${summaryPath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save summary: ${error.message}`);
    return false;
  }
}

/**
 * Get a summary by ID
 * @param {string} summaryId - Summary ID
 * @returns {Promise<Object>} Summary data
 */
async function getSummary(summaryId) {
  if (!isInitialized) {
    logger.warn('Conversation summarizer service not initialized');
    return null;
  }
  
  try {
    const summaryPath = path.join(CONFIG.STORAGE_DIR, summaryId, 'summary.json');
    
    try {
      await fs.access(summaryPath);
    } catch (accessError) {
      logger.warn(`Summary ${summaryId} not found`);
      return null;
    }
    
    const summaryContent = await fs.readFile(summaryPath, 'utf8');
    const summary = JSON.parse(summaryContent);
    
    logger.info(`Retrieved summary ${summaryId}`);
    return summary;
  } catch (error) {
    logger.error(`Failed to get summary ${summaryId}: ${error.message}`);
    return null;
  }
}

/**
 * Search for summaries by criteria
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Matching summaries
 */
async function searchSummaries(criteria = {}) {
  if (!isInitialized) {
    logger.warn('Conversation summarizer service not initialized');
    return [];
  }
  
  try {
    // Extract search criteria
    const { 
      conversationId,
      topics = [],
      tags = [],
      startTime,
      endTime,
      limit = 10
    } = criteria;
    
    logger.info(`Searching summaries with criteria: ${JSON.stringify({
      conversationId,
      topics: topics.length,
      tags: tags.length,
      startTime,
      endTime,
      limit
    })}`);
    
    // Filter summaries based on criteria
    let matchingSummaries = [...summaryMetadata.summaries];
    
    if (conversationId) {
      matchingSummaries = matchingSummaries.filter(s => s.conversationId === conversationId);
    }
    
    if (topics.length > 0) {
      matchingSummaries = matchingSummaries.filter(s => 
        topics.some(topic => s.topics && s.topics.some(t => t.includes(topic)))
      );
    }
    
    if (tags.length > 0) {
      matchingSummaries = matchingSummaries.filter(s => 
        tags.some(tag => s.tags && s.tags.includes(tag))
      );
    }
    
    if (startTime) {
      matchingSummaries = matchingSummaries.filter(s => s.timestamp >= startTime);
    }
    
    if (endTime) {
      matchingSummaries = matchingSummaries.filter(s => s.timestamp <= endTime);
    }
    
    // Sort by timestamp (newest first) and limit results
    matchingSummaries = matchingSummaries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
    
    logger.info(`Found ${matchingSummaries.length} matching summaries`);
    
    // Load full summary data for matching summaries
    const fullSummaries = [];
    
    for (const metaSummary of matchingSummaries) {
      const summary = await getSummary(metaSummary.id);
      if (summary) {
        fullSummaries.push(summary);
      }
    }
    
    return fullSummaries;
  } catch (error) {
    logger.error(`Error searching summaries: ${error.message}`);
    return [];
  }
}

/**
 * Delete a summary
 * @param {string} summaryId - Summary ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteSummary(summaryId) {
  if (!isInitialized) {
    logger.warn('Conversation summarizer service not initialized');
    return false;
  }
  
  try {
    const summaryDir = path.join(CONFIG.STORAGE_DIR, summaryId);
    
    try {
      await fs.access(summaryDir);
    } catch (accessError) {
      logger.warn(`Summary ${summaryId} not found`);
      return false;
    }
    
    // Remove directory recursively
    await fs.rm(summaryDir, { recursive: true });
    
    // Remove from metadata
    summaryMetadata.summaries = summaryMetadata.summaries.filter(s => s.id !== summaryId);
    await saveMetadata();
    
    logger.info(`Deleted summary ${summaryId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete summary ${summaryId}: ${error.message}`);
    return false;
  }
}

/**
 * Clean up old summaries
 * @returns {Promise<number>} Number of summaries deleted
 */
async function cleanupOldSummaries() {
  if (!isInitialized) {
    logger.warn('Conversation summarizer service not initialized');
    return 0;
  }
  
  try {
    const now = Date.now();
    const maxAge = CONFIG.MAX_SUMMARY_AGE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = now - maxAge;
    
    const oldSummaries = summaryMetadata.summaries.filter(s => s.timestamp < cutoffTime);
    
    logger.info(`Found ${oldSummaries.length} summaries older than ${CONFIG.MAX_SUMMARY_AGE_DAYS} days`);
    
    let deletedCount = 0;
    
    for (const summary of oldSummaries) {
      const success = await deleteSummary(summary.id);
      if (success) {
        deletedCount++;
      }
    }
    
    logger.info(`Deleted ${deletedCount} old summaries`);
    return deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up old summaries: ${error.message}`);
    return 0;
  }
}

/**
 * Update an existing summary
 * @param {Object} summary - Updated summary data
 * @returns {Promise<boolean>} Success status
 */
async function updateSummary(summary) {
  if (!isInitialized) {
    logger.warn('Conversation summarizer service not initialized');
    return false;
  }
  
  try {
    if (!summary || !summary.id) {
      throw new Error('Invalid summary data: id is required');
    }
    
    // Save updated summary
    await saveSummary(summary);
    
    // Update metadata entry if it exists
    const metaIndex = summaryMetadata.summaries.findIndex(s => s.id === summary.id);
    if (metaIndex >= 0) {
      summaryMetadata.summaries[metaIndex] = {
        id: summary.id,
        conversationId: summary.conversationId,
        timestamp: summary.timestamp,
        title: summary.metadata.title,
        topics: summary.topics.slice(0, 5),
        tags: summary.metadata.tags
      };
      
      await saveMetadata();
    }
    
    logger.info(`Updated summary ${summary.id}`);
    return true;
  } catch (error) {
    logger.error(`Failed to update summary: ${error.message}`);
    return false;
  }
}

// Export public API
module.exports = {
  initialize,
  summarizeConversation,
  getSummary,
  searchSummaries,
  deleteSummary,
  cleanupOldSummaries,
  updateSummary
};
