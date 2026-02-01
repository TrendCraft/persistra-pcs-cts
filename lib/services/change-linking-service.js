/**
 * Change Linking Service
 * 
 * This service creates metadata that links conversation summaries to specific code changes.
 * It's part of Phase 3 of the Conversation-Aware Leo implementation, focusing on
 * conversation summarization and linking discussions to code.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Component name for logging and events
const COMPONENT_NAME = 'change-linking-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  GIT_ENABLED: true,
  LINK_STORAGE_DIR: process.env.LEO_LINK_DIR || path.join(process.cwd(), 'data', 'links'),
  PROJECT_ROOT: process.cwd(),
  MAX_LINK_AGE_DAYS: 90,
  AUTO_LINK_CHANGES: true,
  LINK_FILE: 'change_links.json'
};

// Initialization state
let isInitialized = false;
let linkData = {
  links: [],
  lastUpdated: Date.now()
};

/**
 * Initialize the change linking service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing change linking service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.changeLinking) {
        Object.assign(CONFIG, config.changeLinking);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure storage directory exists
    try {
      await fs.mkdir(CONFIG.LINK_STORAGE_DIR, { recursive: true });
      logger.info(`Link storage directory created: ${CONFIG.LINK_STORAGE_DIR}`);
    } catch (dirError) {
      logger.error(`Failed to create link storage directory: ${dirError.message}`);
      throw dirError;
    }
    
    // Check if git is available
    if (CONFIG.GIT_ENABLED) {
      try {
        await execPromise('git --version');
        logger.info('Git is available for change tracking');
      } catch (gitError) {
        logger.warn('Git is not available, disabling git-based change tracking');
        CONFIG.GIT_ENABLED = false;
      }
    }
    
    // Load link data
    await loadLinkData();
    
    // Subscribe to events
    if (CONFIG.AUTO_LINK_CHANGES) {
      eventBus.on('conversation:summarized', handleSummarizedEvent, COMPONENT_NAME);
      
      // If git is enabled, we could also listen for git events
      if (CONFIG.GIT_ENABLED) {
        // This would require a git hook integration
        logger.info('Git-based change tracking enabled');
      }
    }
    
    isInitialized = true;
    logger.info('Change linking service initialized successfully');
    
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
 * Load link data from storage
 * @private
 */
async function loadLinkData() {
  try {
    const linkFilePath = path.join(CONFIG.LINK_STORAGE_DIR, CONFIG.LINK_FILE);
    
    // Check if link file exists
    try {
      await fs.access(linkFilePath);
    } catch (accessError) {
      // Create empty link file if it doesn't exist
      linkData = { 
        links: [],
        lastUpdated: Date.now()
      };
      await saveLinkData();
      return;
    }
    
    // Read and parse link file
    const linkContent = await fs.readFile(linkFilePath, 'utf8');
    linkData = JSON.parse(linkContent);
    
    // Ensure the links array exists
    if (!linkData.links) {
      linkData.links = [];
    }
    
    logger.info(`Loaded ${linkData.links.length} change links`);
  } catch (error) {
    logger.error(`Failed to load link data: ${error.message}`);
    linkData = { 
      links: [],
      lastUpdated: Date.now()
    };
  }
}

/**
 * Save link data to storage
 * @private
 */
async function saveLinkData() {
  try {
    const linkFilePath = path.join(CONFIG.LINK_STORAGE_DIR, CONFIG.LINK_FILE);
    linkData.lastUpdated = Date.now();
    await fs.writeFile(linkFilePath, JSON.stringify(linkData, null, 2), 'utf8');
    logger.info('Link data saved successfully');
  } catch (error) {
    logger.error(`Failed to save link data: ${error.message}`);
  }
}

/**
 * Handle summarized event
 * @param {Object} data - Event data
 * @private
 */
async function handleSummarizedEvent(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { summaryId } = data;
    
    if (!summaryId) {
      logger.warn('Received conversation:summarized event without summaryId');
      return;
    }
    
    logger.info(`Processing summarized event for change linking: ${summaryId}`);
    
    // Get the summary data
    const summarizer = require('./conversation-summarizer');
    const summary = await summarizer.getSummary(summaryId);
    
    if (!summary) {
      logger.warn(`Could not find summary ${summaryId}`);
      return;
    }
    
    // Get recent code changes
    const recentChanges = await getRecentCodeChanges();
    
    // Link the summary to code changes
    const links = await linkSummaryToChanges(summary, recentChanges);
    
    if (links.length > 0) {
      logger.info(`Created ${links.length} links between summary ${summaryId} and code changes`);
      
      // Emit event
      eventBus.emit('changes:linked', {
        component: COMPONENT_NAME,
        summaryId,
        links
      });
    } else {
      logger.info(`No relevant code changes found for summary ${summaryId}`);
    }
  } catch (error) {
    logger.error(`Error handling summarized event: ${error.message}`);
  }
}

/**
 * Get recent code changes
 * @param {Object} options - Options for retrieving changes
 * @returns {Promise<Array>} Recent code changes
 * @private
 */
async function getRecentCodeChanges(options = {}) {
  try {
    const {
      since = '1 day ago',
      maxChanges = 50
    } = options;
    
    if (!CONFIG.GIT_ENABLED) {
      logger.warn('Git is not enabled, cannot retrieve recent changes');
      return [];
    }
    
    // Get recent git commits
    const { stdout } = await execPromise(
      `git -C "${CONFIG.PROJECT_ROOT}" log --since="${since}" --name-status --pretty=format:"%h|%an|%at|%s"`
    );
    
    if (!stdout.trim()) {
      logger.info(`No git commits found since ${since}`);
      return [];
    }
    
    // Parse git log output
    const changes = [];
    const lines = stdout.split('\n');
    let currentCommit = null;
    
    for (const line of lines) {
      if (line.includes('|')) {
        // This is a commit line
        const [hash, author, timestamp, message] = line.split('|');
        currentCommit = {
          hash,
          author,
          timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
          message,
          files: []
        };
        changes.push(currentCommit);
      } else if (line.trim() && currentCommit) {
        // This is a file change line
        const [status, ...fileParts] = line.trim().split('\t');
        const file = fileParts.join('\t'); // Handle filenames with tabs
        
        if (file) {
          currentCommit.files.push({
            status: getChangeType(status),
            file
          });
        }
      }
    }
    
    // Limit the number of changes
    return changes.slice(0, maxChanges);
  } catch (error) {
    logger.error(`Error getting recent code changes: ${error.message}`);
    return [];
  }
}

/**
 * Get change type from git status
 * @param {string} status - Git status code
 * @returns {string} Change type
 * @private
 */
function getChangeType(status) {
  switch (status.charAt(0)) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'unknown';
  }
}

/**
 * Link a summary to code changes
 * @param {Object} summary - Summary data
 * @param {Array} changes - Code changes
 * @returns {Promise<Array>} Created links
 * @private
 */
async function linkSummaryToChanges(summary, changes) {
  try {
    const createdLinks = [];
    
    // Extract file references from summary
    const fileReferences = [];
    
    // Add files from code references
    if (summary.codeReferences) {
      summary.codeReferences
        .filter(ref => ref.type === 'file')
        .forEach(ref => {
          const filePath = ref.path;
          if (filePath && !fileReferences.includes(filePath)) {
            fileReferences.push(filePath);
          }
        });
    }
    
    // Add files from extracted metadata
    if (summary.extractedMetadata && summary.extractedMetadata.files) {
      summary.extractedMetadata.files.forEach(file => {
        const filePath = file.path;
        if (filePath && !fileReferences.includes(filePath)) {
          fileReferences.push(filePath);
        }
      });
    }
    
    // For each file reference, find matching changes
    for (const filePath of fileReferences) {
      const matchingChanges = changes.filter(change => 
        change.files.some(file => 
          file.file.includes(path.basename(filePath))
        )
      );
      
      if (matchingChanges.length > 0) {
        // Create a link for each matching change
        for (const change of matchingChanges) {
          const link = {
            id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            summaryId: summary.id,
            conversationId: summary.conversationId,
            changeHash: change.hash,
            changeTimestamp: change.timestamp,
            changeMessage: change.message,
            filePath,
            confidence: calculateLinkConfidence(summary, change, filePath),
            createdAt: Date.now()
          };
          
          // Add to link data
          linkData.links.push(link);
          createdLinks.push(link);
        }
      }
    }
    
    // Save link data if links were created
    if (createdLinks.length > 0) {
      await saveLinkData();
    }
    
    return createdLinks;
  } catch (error) {
    logger.error(`Error linking summary to changes: ${error.message}`);
    return [];
  }
}

/**
 * Calculate confidence score for a link
 * @param {Object} summary - Summary data
 * @param {Object} change - Change data
 * @param {string} filePath - File path
 * @returns {number} Confidence score (0-1)
 * @private
 */
function calculateLinkConfidence(summary, change, filePath) {
  try {
    let score = 0.5; // Base score
    
    // Increase score if the file is mentioned multiple times in the summary
    const fileReferences = summary.codeReferences
      .filter(ref => ref.type === 'file' && ref.path === filePath)
      .length;
    
    score += Math.min(0.2, fileReferences * 0.05);
    
    // Increase score if the change message contains any of the summary topics
    if (summary.topics && change.message) {
      const topicsInMessage = summary.topics.filter(topic => 
        change.message.toLowerCase().includes(topic.toLowerCase())
      ).length;
      
      score += Math.min(0.2, topicsInMessage * 0.05);
    }
    
    // Increase score if the change is recent relative to the conversation
    const timeDiff = Math.abs(change.timestamp - summary.timestamp);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff < 1) {
      score += 0.1; // Very recent (within an hour)
    } else if (hoursDiff < 24) {
      score += 0.05; // Same day
    }
    
    return Math.min(1, score);
  } catch (error) {
    logger.error(`Error calculating link confidence: ${error.message}`);
    return 0.5; // Default confidence
  }
}

/**
 * Get links for a summary
 * @param {string} summaryId - Summary ID
 * @returns {Promise<Array>} Links for the summary
 */
async function getLinksForSummary(summaryId) {
  if (!isInitialized) {
    logger.warn('Change linking service not initialized');
    return [];
  }
  
  try {
    return linkData.links.filter(link => link.summaryId === summaryId);
  } catch (error) {
    logger.error(`Error getting links for summary ${summaryId}: ${error.message}`);
    return [];
  }
}

/**
 * Get links for a conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Array>} Links for the conversation
 */
async function getLinksForConversation(conversationId) {
  if (!isInitialized) {
    logger.warn('Change linking service not initialized');
    return [];
  }
  
  try {
    return linkData.links.filter(link => link.conversationId === conversationId);
  } catch (error) {
    logger.error(`Error getting links for conversation ${conversationId}: ${error.message}`);
    return [];
  }
}

/**
 * Get links for a file
 * @param {string} filePath - File path
 * @returns {Promise<Array>} Links for the file
 */
async function getLinksForFile(filePath) {
  if (!isInitialized) {
    logger.warn('Change linking service not initialized');
    return [];
  }
  
  try {
    return linkData.links.filter(link => link.filePath === filePath);
  } catch (error) {
    logger.error(`Error getting links for file ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Create a manual link between a summary and a code change
 * @param {Object} linkInfo - Link information
 * @returns {Promise<Object>} Created link
 */
async function createManualLink(linkInfo) {
  if (!isInitialized) {
    logger.warn('Change linking service not initialized');
    return null;
  }
  
  try {
    // Validate link data
    if (!linkInfo.summaryId || !linkInfo.filePath) {
      throw new Error('Invalid link data: summaryId and filePath are required');
    }
    
    // Get summary to ensure it exists and get conversationId
    const summarizer = require('./conversation-summarizer');
    const summary = await summarizer.getSummary(linkInfo.summaryId);
    
    if (!summary) {
      throw new Error(`Summary ${linkInfo.summaryId} not found`);
    }
    
    // Create link object
    const link = {
      id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      summaryId: linkInfo.summaryId,
      conversationId: summary.conversationId,
      changeHash: linkInfo.changeHash || null,
      changeTimestamp: linkInfo.changeTimestamp || Date.now(),
      changeMessage: linkInfo.changeMessage || 'Manual link',
      filePath: linkInfo.filePath,
      confidence: linkInfo.confidence || 1.0, // High confidence for manual links
      createdAt: Date.now(),
      manual: true
    };
    
    // Add to link data
    if (!linkData.links) {
      linkData.links = [];
    }
    linkData.links.push(link);
    await saveLinkData();
    
    logger.info(`Created manual link ${link.id} between summary ${link.summaryId} and file ${link.filePath}`);
    
    // Emit event
    eventBus.emit('changes:linked', {
      component: COMPONENT_NAME,
      summaryId: link.summaryId,
      links: [link],
      manual: true
    });
    
    return link;
  } catch (error) {
    logger.error(`Error creating manual link: ${error.message}`);
    return null;
  }
}

/**
 * Delete a link
 * @param {string} linkId - Link ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteLink(linkId) {
  if (!isInitialized) {
    logger.warn('Change linking service not initialized');
    return false;
  }
  
  try {
    const initialLength = linkData.links.length;
    linkData.links = linkData.links.filter(link => link.id !== linkId);
    
    if (linkData.links.length < initialLength) {
      await saveLinkData();
      logger.info(`Deleted link ${linkId}`);
      return true;
    } else {
      logger.warn(`Link ${linkId} not found`);
      return false;
    }
  } catch (error) {
    logger.error(`Error deleting link ${linkId}: ${error.message}`);
    return false;
  }
}

/**
 * Clean up old links
 * @returns {Promise<number>} Number of links deleted
 */
async function cleanupOldLinks() {
  if (!isInitialized) {
    logger.warn('Change linking service not initialized');
    return 0;
  }
  
  try {
    const now = Date.now();
    const maxAge = CONFIG.MAX_LINK_AGE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = now - maxAge;
    
    const initialLength = linkData.links.length;
    linkData.links = linkData.links.filter(link => link.createdAt >= cutoffTime);
    
    const deletedCount = initialLength - linkData.links.length;
    
    if (deletedCount > 0) {
      await saveLinkData();
      logger.info(`Deleted ${deletedCount} old links`);
    }
    
    return deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up old links: ${error.message}`);
    return 0;
  }
}

// Export public API
module.exports = {
  initialize,
  getLinksForSummary,
  getLinksForConversation,
  getLinksForFile,
  createManualLink,
  deleteLink,
  cleanupOldLinks
};
