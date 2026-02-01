/**
 * Memory Integration Service
 * 
 * This service integrates conversation memory with Leo's code knowledge graph,
 * creating bidirectional links between conversations and code components.
 * It's part of Phase 4: Memory Integration for the Conversation-Aware Leo implementation.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const conversationMemoryManager = require('./conversation-memory-manager');
const semanticContextManager = require('./semantic-context-manager');
const changeLinkingService = require('./change-linking-service');
const conversationSemanticSearch = require('./conversation-semantic-search');

// Component name for logging and events
const COMPONENT_NAME = 'memory-integration-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  INTEGRATION_DIR: process.env.LEO_INTEGRATION_DIR || path.join(process.cwd(), 'data', 'memory-integration'),
  INTEGRATION_INDEX_FILE: 'integration-index.jsonl',
  ENABLE_BIDIRECTIONAL_LINKING: true,
  SIMILARITY_THRESHOLD: 0.65,
  MAX_LINKS_PER_ENTITY: 20
};

// Initialization state
let isInitialized = false;
let integrationIndex = [];

/**
 * Initialize the memory integration service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing memory integration service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.memoryIntegration) {
        Object.assign(CONFIG, config.memoryIntegration);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure required directory exists
    await fs.mkdir(CONFIG.INTEGRATION_DIR, { recursive: true });
    
    // Initialize required services
    const initResults = await initializeDependencies();
    
    // Load integration index
    await loadIntegrationIndex();
    
    // Subscribe to events
    eventBus.on('conversation:memory:created', handleMemoryCreated, COMPONENT_NAME);
    eventBus.on('code:context:updated', handleCodeContextUpdated, COMPONENT_NAME);
    eventBus.on('changes:linked', handleChangesLinked, COMPONENT_NAME);
    
    isInitialized = true;
    logger.info('Memory integration service initialized successfully');
    
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
 * Initialize dependencies
 * @returns {Promise<Object>} Initialization results
 * @private
 */
async function initializeDependencies() {
  const results = {
    conversationMemoryManager: false,
    semanticContextManager: false,
    changeLinkingService: false,
    conversationSemanticSearch: false
  };
  
  try {
    if (!conversationMemoryManager.isInitialized) {
      results.conversationMemoryManager = await conversationMemoryManager.initialize();
    } else {
      results.conversationMemoryManager = true;
    }
  } catch (error) {
    logger.warn(`Failed to initialize conversation memory manager: ${error.message}`);
  }
  
  try {
    if (!semanticContextManager.isInitialized) {
      results.semanticContextManager = await semanticContextManager.initialize();
    } else {
      results.semanticContextManager = true;
    }
  } catch (error) {
    logger.warn(`Failed to initialize semantic context manager: ${error.message}`);
  }
  
  try {
    if (!changeLinkingService.isInitialized) {
      results.changeLinkingService = await changeLinkingService.initialize();
    } else {
      results.changeLinkingService = true;
    }
  } catch (error) {
    logger.warn(`Failed to initialize change linking service: ${error.message}`);
  }
  
  try {
    if (!conversationSemanticSearch.isInitialized) {
      results.conversationSemanticSearch = await conversationSemanticSearch.initialize();
    } else {
      results.conversationSemanticSearch = true;
    }
  } catch (error) {
    logger.warn(`Failed to initialize conversation semantic search: ${error.message}`);
  }
  
  return results;
}

/**
 * Load integration index from disk
 * @private
 */
async function loadIntegrationIndex() {
  try {
    const indexPath = path.join(CONFIG.INTEGRATION_DIR, CONFIG.INTEGRATION_INDEX_FILE);
    
    try {
      await fs.access(indexPath);
    } catch (accessError) {
      // Create empty index if it doesn't exist
      integrationIndex = [];
      await saveIntegrationIndex();
      return;
    }
    
    // Read and parse index file
    const indexContent = await fs.readFile(indexPath, 'utf8');
    integrationIndex = indexContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    logger.info(`Loaded ${integrationIndex.length} integration links from index`);
  } catch (error) {
    logger.error(`Failed to load integration index: ${error.message}`);
    integrationIndex = [];
  }
}

/**
 * Save integration index to disk
 * @private
 */
async function saveIntegrationIndex() {
  try {
    const indexPath = path.join(CONFIG.INTEGRATION_DIR, CONFIG.INTEGRATION_INDEX_FILE);
    const indexContent = integrationIndex.map(item => JSON.stringify(item)).join('\n');
    
    await fs.writeFile(indexPath, indexContent, 'utf8');
    logger.info(`Saved ${integrationIndex.length} integration links to index`);
  } catch (error) {
    logger.error(`Failed to save integration index: ${error.message}`);
  }
}

/**
 * Handle memory created event
 * @param {Object} data - Event data
 * @private
 */
async function handleMemoryCreated(data) {
  try {
    const memoryItem = data.memoryItem;
    
    if (!memoryItem || !memoryItem.id) {
      logger.warn('Received memory:created event without valid memory item');
      return;
    }
    
    logger.info(`Processing new memory item: ${memoryItem.id}`);
    
    // Find related code components
    const relatedComponents = await findRelatedCodeComponents(memoryItem);
    
    // Create bidirectional links
    if (relatedComponents.length > 0) {
      await createBidirectionalLinks(memoryItem, relatedComponents);
      
      // Emit event for other services
      eventBus.emit('memory:integrated', {
        memoryId: memoryItem.id,
        relatedComponents: relatedComponents.map(comp => comp.id),
        timestamp: Date.now()
      });
    }
  } catch (error) {
    logger.error(`Error handling memory created event: ${error.message}`);
  }
}

/**
 * Handle code context updated event
 * @param {Object} data - Event data
 * @private
 */
async function handleCodeContextUpdated(data) {
  try {
    const contextItem = data.contextItem;
    
    if (!contextItem || !contextItem.id) {
      logger.warn('Received code:context:updated event without valid context item');
      return;
    }
    
    logger.info(`Processing updated code context: ${contextItem.id}`);
    
    // Find related memory items
    const relatedMemory = await findRelatedMemoryItems(contextItem);
    
    // Create bidirectional links
    if (relatedMemory.length > 0) {
      await createBidirectionalLinks(contextItem, relatedMemory, false);
      
      // Emit event for other services
      eventBus.emit('code:integrated', {
        contextId: contextItem.id,
        relatedMemory: relatedMemory.map(mem => mem.id),
        timestamp: Date.now()
      });
    }
  } catch (error) {
    logger.error(`Error handling code context updated event: ${error.message}`);
  }
}

/**
 * Handle changes linked event
 * @param {Object} data - Event data
 * @private
 */
async function handleChangesLinked(data) {
  try {
    const links = data.links;
    
    if (!links || !Array.isArray(links) || links.length === 0) {
      logger.warn('Received changes:linked event without valid links');
      return;
    }
    
    logger.info(`Processing ${links.length} change links`);
    
    // Process each link
    for (const link of links) {
      await processChangeLink(link);
    }
  } catch (error) {
    logger.error(`Error handling changes linked event: ${error.message}`);
  }
}

/**
 * Find related code components for a memory item
 * @param {Object} memoryItem - Memory item
 * @returns {Promise<Array>} Related code components
 * @private
 */
async function findRelatedCodeComponents(memoryItem) {
  try {
    // Extract keywords and concepts from memory item
    const keywords = extractKeywords(memoryItem);
    
    // Use semantic context manager to find related code
    if (!semanticContextManager.isInitialized) {
      logger.warn('Semantic context manager not initialized, cannot find related code components');
      return [];
    }
    
    // Construct a query from memory content
    const query = `${memoryItem.title} ${memoryItem.content.substring(0, 200)}`;
    
    // Search for related code
    const searchResults = await semanticContextManager.searchContext(query, {
      limit: CONFIG.MAX_LINKS_PER_ENTITY,
      threshold: CONFIG.SIMILARITY_THRESHOLD
    });
    
    if (!searchResults.success || !searchResults.results) {
      logger.warn(`Failed to search for related code components: ${searchResults.error || 'Unknown error'}`);
      return [];
    }
    
    return searchResults.results.map(result => ({
      id: result.id,
      type: 'code',
      filePath: result.filePath,
      similarity: result.similarity,
      content: result.content
    }));
  } catch (error) {
    logger.error(`Error finding related code components: ${error.message}`);
    return [];
  }
}

/**
 * Find related memory items for a code context item
 * @param {Object} contextItem - Code context item
 * @returns {Promise<Array>} Related memory items
 * @private
 */
async function findRelatedMemoryItems(contextItem) {
  try {
    // Use conversation memory manager to find related memory
    if (!conversationMemoryManager.isInitialized) {
      logger.warn('Conversation memory manager not initialized, cannot find related memory items');
      return [];
    }
    
    // Construct a query from context content
    const query = contextItem.content.substring(0, 200);
    
    // Search for related memory
    const searchResults = await conversationMemoryManager.searchMemory(query, {
      limit: CONFIG.MAX_LINKS_PER_ENTITY,
      threshold: CONFIG.SIMILARITY_THRESHOLD
    });
    
    if (!searchResults.success || !searchResults.items) {
      logger.warn(`Failed to search for related memory items: ${searchResults.error || 'Unknown error'}`);
      return [];
    }
    
    return searchResults.items.map(item => ({
      id: item.id,
      type: 'memory',
      title: item.title,
      similarity: item.similarity,
      content: item.content
    }));
  } catch (error) {
    logger.error(`Error finding related memory items: ${error.message}`);
    return [];
  }
}

/**
 * Create bidirectional links between entities
 * @param {Object} sourceEntity - Source entity
 * @param {Array} targetEntities - Target entities
 * @param {boolean} isMemorySource - Whether the source is a memory item
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function createBidirectionalLinks(sourceEntity, targetEntities, isMemorySource = true) {
  try {
    const newLinks = [];
    
    for (const targetEntity of targetEntities) {
      const sourceType = isMemorySource ? 'memory' : 'code';
      const targetType = isMemorySource ? 'code' : 'memory';
      
      // Create link data
      const linkData = {
        id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId: sourceEntity.id,
        sourceType: sourceType,
        targetId: targetEntity.id,
        targetType: targetType,
        similarity: targetEntity.similarity || 0,
        createdAt: Date.now()
      };
      
      // Add to integration index
      integrationIndex.push(linkData);
      newLinks.push(linkData);
      
      logger.info(`Created bidirectional link: ${sourceType}:${sourceEntity.id} <-> ${targetType}:${targetEntity.id}`);
    }
    
    // Save updated index
    await saveIntegrationIndex();
    
    return true;
  } catch (error) {
    logger.error(`Error creating bidirectional links: ${error.message}`);
    return false;
  }
}

/**
 * Process a change link
 * @param {Object} link - Change link
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function processChangeLink(link) {
  try {
    if (!link.summaryId || !link.filePath) {
      logger.warn('Invalid change link data');
      return false;
    }
    
    // Find code context for the file
    const codeContext = await findCodeContextForFile(link.filePath);
    
    if (!codeContext) {
      logger.warn(`No code context found for file: ${link.filePath}`);
      return false;
    }
    
    // Find memory item for the summary
    const memoryItem = await findMemoryForSummary(link.summaryId);
    
    if (!memoryItem) {
      logger.warn(`No memory item found for summary: ${link.summaryId}`);
      return false;
    }
    
    // Create bidirectional link
    const linkData = {
      id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceId: memoryItem.id,
      sourceType: 'memory',
      targetId: codeContext.id,
      targetType: 'code',
      filePath: link.filePath,
      changeType: link.changeType,
      confidence: link.confidence,
      createdAt: Date.now()
    };
    
    // Add to integration index
    integrationIndex.push(linkData);
    
    // Save updated index
    await saveIntegrationIndex();
    
    logger.info(`Processed change link for summary ${link.summaryId} and file ${link.filePath}`);
    return true;
  } catch (error) {
    logger.error(`Error processing change link: ${error.message}`);
    return false;
  }
}

/**
 * Find code context for a file
 * @param {string} filePath - File path
 * @returns {Promise<Object>} Code context
 * @private
 */
async function findCodeContextForFile(filePath) {
  try {
    if (!semanticContextManager.isInitialized) {
      logger.warn('Semantic context manager not initialized, cannot find code context');
      return null;
    }
    
    // Get context for file
    const contextResult = await semanticContextManager.getContextForFile(filePath);
    
    if (!contextResult.success || !contextResult.context) {
      logger.warn(`Failed to get context for file ${filePath}: ${contextResult.error || 'Unknown error'}`);
      return null;
    }
    
    return {
      id: `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'code',
      filePath: filePath,
      content: contextResult.context
    };
  } catch (error) {
    logger.error(`Error finding code context for file: ${error.message}`);
    return null;
  }
}

/**
 * Find memory item for a summary
 * @param {string} summaryId - Summary ID
 * @returns {Promise<Object>} Memory item
 * @private
 */
async function findMemoryForSummary(summaryId) {
  try {
    if (!conversationMemoryManager.isInitialized) {
      logger.warn('Conversation memory manager not initialized, cannot find memory item');
      return null;
    }
    
    // Get memory item
    const memoryResult = await conversationMemoryManager.getMemoryItem(summaryId);
    
    if (!memoryResult.success || !memoryResult.item) {
      logger.warn(`Failed to get memory item for summary ${summaryId}: ${memoryResult.error || 'Unknown error'}`);
      return null;
    }
    
    return memoryResult.item;
  } catch (error) {
    logger.error(`Error finding memory item for summary: ${error.message}`);
    return null;
  }
}

/**
 * Extract keywords from a memory item
 * @param {Object} memoryItem - Memory item
 * @returns {Array<string>} Keywords
 * @private
 */
function extractKeywords(memoryItem) {
  const keywords = [];
  
  // Extract from title
  if (memoryItem.title) {
    keywords.push(...memoryItem.title.split(/\s+/).filter(word => word.length > 3));
  }
  
  // Extract from tags
  if (memoryItem.tags && Array.isArray(memoryItem.tags)) {
    keywords.push(...memoryItem.tags);
  }
  
  // Extract from content
  if (memoryItem.content) {
    // Extract code references
    const codeRefs = memoryItem.content.match(/`[^`]+`/g) || [];
    keywords.push(...codeRefs.map(ref => ref.replace(/`/g, '')));
    
    // Extract capitalized terms (likely component names)
    const capitalizedTerms = memoryItem.content.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
    keywords.push(...capitalizedTerms);
  }
  
  // Remove duplicates and return
  return [...new Set(keywords)];
}

/**
 * Get links for a memory item
 * @param {string} memoryId - Memory ID
 * @returns {Promise<Object>} Standardized result with links
 */
async function getLinksForMemory(memoryId) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Memory integration service not initialized',
        links: []
      };
    }
    
    const links = integrationIndex.filter(link => 
      (link.sourceType === 'memory' && link.sourceId === memoryId) ||
      (link.targetType === 'memory' && link.targetId === memoryId)
    );
    
    return {
      success: true,
      links: links,
      count: links.length
    };
  } catch (error) {
    logger.error(`Error getting links for memory: ${error.message}`);
    return {
      success: false,
      error: error.message,
      links: []
    };
  }
}

/**
 * Get links for a code component
 * @param {string} codeId - Code component ID
 * @returns {Promise<Object>} Standardized result with links
 */
async function getLinksForCode(codeId) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Memory integration service not initialized',
        links: []
      };
    }
    
    const links = integrationIndex.filter(link => 
      (link.sourceType === 'code' && link.sourceId === codeId) ||
      (link.targetType === 'code' && link.targetId === codeId)
    );
    
    return {
      success: true,
      links: links,
      count: links.length
    };
  } catch (error) {
    logger.error(`Error getting links for code: ${error.message}`);
    return {
      success: false,
      error: error.message,
      links: []
    };
  }
}

/**
 * Get links for a file path
 * @param {string} filePath - File path
 * @returns {Promise<Object>} Standardized result with links
 */
async function getLinksForFile(filePath) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Memory integration service not initialized',
        links: []
      };
    }
    
    const links = integrationIndex.filter(link => link.filePath === filePath);
    
    return {
      success: true,
      links: links,
      count: links.length
    };
  } catch (error) {
    logger.error(`Error getting links for file: ${error.message}`);
    return {
      success: false,
      error: error.message,
      links: []
    };
  }
}

/**
 * Delete a link
 * @param {string} linkId - Link ID
 * @returns {Promise<Object>} Standardized result
 */
async function deleteLink(linkId) {
  try {
    if (!isInitialized) {
      return {
        success: false,
        error: 'Memory integration service not initialized'
      };
    }
    
    const initialLength = integrationIndex.length;
    integrationIndex = integrationIndex.filter(link => link.id !== linkId);
    
    if (integrationIndex.length === initialLength) {
      return {
        success: false,
        error: `Link with ID ${linkId} not found`
      };
    }
    
    // Save updated index
    await saveIntegrationIndex();
    
    return {
      success: true,
      message: `Link ${linkId} deleted successfully`
    };
  } catch (error) {
    logger.error(`Error deleting link: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export public API
module.exports = {
  initialize,
  getLinksForMemory,
  getLinksForCode,
  getLinksForFile,
  deleteLink,
  isInitialized: false // Will be updated during initialization
};
