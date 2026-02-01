/**
 * Memory Graph Integration Service
 * 
 * This service integrates the Conversation Capture Service with the Memory Graph,
 * providing bidirectional linking between conversations and code components.
 * It's part of the Conversation-Aware Leo implementation, enhancing context retrieval
 * with conversation memory.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
// semanticContextManager will be initialized with injected embeddingsInterface
const semanticContextManager = require('./semantic-context-manager');
const conversationCaptureService = require('./conversation-capture-service');
const memoryIntegrationService = require('./memory-integration-service');
const { calculateCosineSimilarity } = require('../utils/vector-utils');

// Component name for logging and events
const COMPONENT_NAME = 'memory-graph-integration';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  MEMORY_GRAPH_DIR: process.env.LEO_MEMORY_GRAPH_DIR || path.join(process.cwd(), 'data'),
  MEMORY_CHUNKS_FILE: 'chunks.jsonl',
  MEMORY_EMBEDDINGS_FILE: 'embeddings.jsonl',
  MEMORY_LINKS_FILE: 'links.jsonl',
  SIMILARITY_THRESHOLD: 0.65,
  MAX_LINKS_PER_ENTITY: 20,
  ENABLE_AUTO_LINKING: true,
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200
};

// Initialization state
let isInitialized = false;

/**
 * Initialize the memory graph integration service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  // Accept embeddingsInterface in options and propagate to dependencies
  if (options.embeddingsInterface) {
    global._leoInjectedEmbeddingsInterface = options.embeddingsInterface;
  }

  try {
    logger.info('Initializing memory graph integration service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.memoryGraphIntegration) {
        Object.assign(CONFIG, config.memoryGraphIntegration);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure required directories exist
    await fs.mkdir(CONFIG.MEMORY_GRAPH_DIR, { recursive: true });
    
    // Initialize required services
    // Subscribe to events
    eventBus.on('conversation:session:saved', handleConversationSaved, COMPONENT_NAME);
    eventBus.on('code:context:updated', handleCodeContextUpdated, COMPONENT_NAME);

    isInitialized = true;
    logger.info('Memory graph integration initialized');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize memory graph integration: ${error.message}`);
    return false;
  }
}

/**
 * Initialize dependencies
 * @returns {Promise<Object>} Initialization results
 * @private
 */
async function initializeDependencies(di = {}) {
  const { embeddingsInterface, logger } = di;
  try {
    // Initialize conversation capture service if not already initialized
    if (!conversationCaptureService.isInitialized) {
      await conversationCaptureService.initialize({ embeddingsInterface, logger });
    }

    // Initialize semantic context manager if not already initialized
    if (!semanticContextManager.isInitialized) {
      await semanticContextManager.initialize({ embeddingsInterface, logger });
    }

    // Initialize memory integration service if not already initialized
    if (!memoryIntegrationService.isInitialized) {
      await memoryIntegrationService.initialize({ embeddingsInterface, logger });
    }

    return true;
  } catch (error) {
    logger.error(`Error initializing dependencies: ${error.message}`);
    return false;
  }
}

/**
 * Handle conversation saved event
 * @param {Object} data - Event data
 * @private
 */
async function handleConversationSaved(data) {
  try {
    if (!data || !data.sessionId) {
      logger.warn('Received conversation:session:saved event without valid session ID');
      return;
    }
    
    logger.info(`Processing saved conversation: ${data.sessionId}`);
    
    // Get conversation data
    const conversation = await conversationCaptureService.getConversation(data.sessionId);
    
    if (!conversation) {
      logger.warn(`Could not retrieve conversation: ${data.sessionId}`);
      return;
    }
    
    // Store in memory graph
    await conversationCaptureService.storeConversationInMemoryGraph(conversation);
    
    // Find related code components
    const relatedComponents = await findRelatedCodeComponents(conversation);
    
    if (relatedComponents.length > 0) {
      // Create links between conversation and code components
      await createLinks(data.sessionId, 'conversation', relatedComponents);
      
      logger.info(`Created ${relatedComponents.length} links for conversation: ${data.sessionId}`);
      
      // Emit event for other services
      eventBus.emit('memory:graph:linked', {
        sourceId: data.sessionId,
        sourceType: 'conversation',
        links: relatedComponents.map(comp => ({
          targetId: comp.id,
          targetType: 'code',
          similarity: comp.similarity
        })),
        timestamp: Date.now()
      });
    }
  } catch (error) {
    logger.error(`Error handling conversation saved event: ${error.message}`);
  }
}

/**
 * Handle code context updated event
 * @param {Object} data - Event data
 * @private
 */
async function handleCodeContextUpdated(data) {
  try {
    if (!data || !data.contextId) {
      logger.warn('Received code:context:updated event without valid context ID');
      return;
    }
    
    logger.info(`Processing updated code context: ${data.contextId}`);
    
    // Get code context
    const codeContext = await semanticContextManager.getContextById(data.contextId);
    
    if (!codeContext) {
      logger.warn(`Could not retrieve code context: ${data.contextId}`);
      return;
    }
    
    // Find related conversations
    const relatedConversations = await findRelatedConversations(codeContext);
    
    if (relatedConversations.length > 0) {
      // Create links between code context and conversations
      await createLinks(data.contextId, 'code', relatedConversations);
      
      logger.info(`Created ${relatedConversations.length} links for code context: ${data.contextId}`);
      
      // Emit event for other services
      eventBus.emit('memory:graph:linked', {
        sourceId: data.contextId,
        sourceType: 'code',
        links: relatedConversations.map(conv => ({
          targetId: conv.id,
          targetType: 'conversation',
          similarity: conv.similarity
        })),
        timestamp: Date.now()
      });
    }
  } catch (error) {
    logger.error(`Error handling code context updated event: ${error.message}`);
  }
}

/**
 * Find related code components for a conversation
 * @param {Object} conversation - Conversation object
 * @returns {Promise<Array>} Related code components
 * @private
 */
async function findRelatedCodeComponents(conversation) {
  try {
    // Extract content from conversation
    const content = conversation.messages
      .map(message => message.content || '')
      .join(' ');
    
    // Use semantic context manager to find related code
    const searchResults = await semanticContextManager.searchContext(content, {
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
 * Find related conversations for a code component
 * @param {Object} codeContext - Code context object
 * @returns {Promise<Array>} Related conversations
 * @private
 */
async function findRelatedConversations(codeContext) {
  try {
    // Use conversation capture service to search for related conversations
    const searchResults = await conversationCaptureService.searchConversations({
      semanticQuery: codeContext.content,
      similarityThreshold: CONFIG.SIMILARITY_THRESHOLD,
      limit: CONFIG.MAX_LINKS_PER_ENTITY
    });
    
    if (!searchResults || !Array.isArray(searchResults)) {
      logger.warn('Failed to search for related conversations');
      return [];
    }
    
    return searchResults.map(result => ({
      id: result.id,
      type: 'conversation',
      title: result.title,
      similarity: result._semanticMetadata ? result._semanticMetadata.similarity : 0.5,
      summary: result.summary
    }));
  } catch (error) {
    logger.error(`Error finding related conversations: ${error.message}`);
    return [];
  }
}

/**
 * Create links between entities with bidirectional integrity
 * @param {string} sourceId - Source entity ID
 * @param {string} sourceType - Source entity type
 * @param {Array} targets - Target entities
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function createLinks(sourceId, sourceType, targets) {
  try {
    const linksPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_LINKS_FILE);
    const createdLinks = [];
    
    // Process each target
    for (const target of targets) {
      // Create forward link data
      const forwardLinkData = {
        id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId,
        sourceType,
        targetId: target.id,
        targetType: target.type,
        similarity: target.similarity || 0,
        createdAt: Date.now(),
        direction: 'forward',
        metadata: {
          creator: COMPONENT_NAME,
          reason: target.reason || 'semantic_similarity'
        }
      };
      
      // Create reverse link data
      const reverseLinkData = {
        id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId: target.id,
        sourceType: target.type,
        targetId: sourceId,
        targetType: sourceType,
        similarity: target.similarity || 0,
        createdAt: Date.now(),
        direction: 'reverse',
        metadata: {
          creator: COMPONENT_NAME,
          reason: target.reason || 'semantic_similarity',
          pairedWithLink: forwardLinkData.id
        }
      };
      
      // Update forward link with paired info
      forwardLinkData.metadata.pairedWithLink = reverseLinkData.id;
      
      // Store both links for atomic operation
      createdLinks.push(forwardLinkData, reverseLinkData);
      
      logger.debug(`Created bidirectional link: ${sourceType}:${sourceId} <-> ${target.type}:${target.id}`);
    }
    
    // Write all links in a single operation for atomicity
    const linksData = createdLinks.map(link => JSON.stringify(link)).join('\n') + '\n';
    await fs.appendFile(linksPath, linksData);
    
    // Verify link integrity
    await verifyRelationshipIntegrity(sourceId, sourceType);
    
    return true;
  } catch (error) {
    logger.error(`Error creating links: ${error.message}`);
    return false;
  }
}

/**
 * Get links for an entity
 * @param {string} entityId - Entity ID
 * @param {string} entityType - Entity type
 * @returns {Promise<Array>} Links
 */
async function getLinks(entityId, entityType) {
  try {
    const linksPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_LINKS_FILE);
    
    try {
      await fs.access(linksPath);
    } catch (accessError) {
      logger.warn(`Links file not found: ${linksPath}`);
      return [];
    }
    
    const linksContent = await fs.readFile(linksPath, 'utf8');
    const links = linksContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .filter(link => 
        (link.sourceId === entityId && link.sourceType === entityType) ||
        (link.targetId === entityId && link.targetType === entityType)
      );
    
    return links;
  } catch (error) {
    logger.error(`Error getting links: ${error.message}`);
    return [];
  }
}

/**
 * Delete a link
 * @param {string} linkId - Link ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteLink(linkId) {
  try {
    const linksPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_LINKS_FILE);
    
    try {
      await fs.access(linksPath);
    } catch (accessError) {
      logger.warn(`Links file not found: ${linksPath}`);
      return false;
    }
    
    const linksContent = await fs.readFile(linksPath, 'utf8');
    const links = linksContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    const filteredLinks = links.filter(link => link.id !== linkId);
    
    if (filteredLinks.length === links.length) {
      logger.warn(`Link not found: ${linkId}`);
      return false;
    }
    
    const newLinksContent = filteredLinks
      .map(link => JSON.stringify(link))
      .join('\n') + '\n';
    
    await fs.writeFile(linksPath, newLinksContent, 'utf8');
    
    logger.info(`Deleted link: ${linkId}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting link: ${error.message}`);
    return false;
  }
}

/**
 * Get all links
 * @returns {Promise<Array>} All links
 */
async function getAllLinks() {
  try {
    const linksPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_LINKS_FILE);
    
    try {
      await fs.access(linksPath);
    } catch (accessError) {
      logger.warn(`Links file not found: ${linksPath}`);
      return [];
    }
    
    const linksContent = await fs.readFile(linksPath, 'utf8');
    const links = linksContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    return links;
  } catch (error) {
    logger.error(`Error getting all links: ${error.message}`);
    return [];
  }
}

/**
 * Verify relationship integrity for an entity
 * @param {string} entityId - Entity ID
 * @param {string} entityType - Entity type
 * @returns {Promise<Object>} Verification results
 */
async function verifyRelationshipIntegrity(entityId, entityType) {
  try {
    logger.debug(`Verifying relationship integrity for ${entityType}:${entityId}`);
    
    // Get all links for this entity
    const entityLinks = await getLinks(entityId, entityType);
    
    const results = {
      verified: 0,
      repaired: 0,
      failed: 0,
      details: []
    };
    
    // Check each link
    for (const link of entityLinks) {
      // Check if reverse link exists
      const reverseLinks = await getLinks(link.targetId, link.targetType);
      const reverseLink = reverseLinks.find(rl => rl.targetId === entityId && rl.targetType === entityType);
      
      if (reverseLink) {
        // Link integrity verified
        results.verified++;
        results.details.push({
          status: 'verified',
          link: `${entityType}:${entityId} -> ${link.targetType}:${link.targetId}`
        });
      } else {
        // Reverse link missing, create it
        try {
          const repairLinkData = {
            id: `link_repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sourceId: link.targetId,
            sourceType: link.targetType,
            targetId: entityId,
            targetType: entityType,
            similarity: link.similarity || 0,
            createdAt: Date.now(),
            direction: 'reverse',
            metadata: {
              creator: `${COMPONENT_NAME}_repair`,
              reason: 'integrity_repair',
              originalLink: link.id
            }
          };
          
          const linksPath = path.join(CONFIG.MEMORY_GRAPH_DIR, CONFIG.MEMORY_LINKS_FILE);
          await fs.appendFile(linksPath, JSON.stringify(repairLinkData) + '\n');
          
          results.repaired++;
          results.details.push({
            status: 'repaired',
            link: `${link.targetType}:${link.targetId} -> ${entityType}:${entityId}`
          });
          
          logger.info(`Repaired missing reverse link: ${link.targetType}:${link.targetId} -> ${entityType}:${entityId}`);
        } catch (repairError) {
          results.failed++;
          results.details.push({
            status: 'failed',
            link: `${link.targetType}:${link.targetId} -> ${entityType}:${entityId}`,
            error: repairError.message
          });
          
          logger.error(`Failed to repair link: ${repairError.message}`);
        }
      }
    }
    
    logger.info(`Relationship integrity verification complete: ${results.verified} verified, ${results.repaired} repaired, ${results.failed} failed`);
    return results;
  } catch (error) {
    logger.error(`Error verifying relationship integrity: ${error.message}`);
    return {
      verified: 0,
      repaired: 0,
      failed: 0,
      error: error.message
    };
  }
}

/**
 * Perform system-wide relationship integrity check
 * @returns {Promise<Object>} Verification results
 */
async function verifySystemIntegrity() {
  try {
    logger.info('Starting system-wide relationship integrity verification');
    
    const allLinks = await getAllLinks();
    const processedEntities = new Set();
    const results = {
      entitiesChecked: 0,
      linksVerified: 0,
      linksRepaired: 0,
      linksFailed: 0
    };
    
    // Process unique entities
    for (const link of allLinks) {
      const entityKey = `${link.sourceType}:${link.sourceId}`;
      
      if (!processedEntities.has(entityKey)) {
        processedEntities.add(entityKey);
        
        const entityResults = await verifyRelationshipIntegrity(link.sourceId, link.sourceType);
        
        results.entitiesChecked++;
        results.linksVerified += entityResults.verified;
        results.linksRepaired += entityResults.repaired;
        results.linksFailed += entityResults.failed;
      }
    }
    
    logger.info(`System-wide integrity verification complete: ${results.entitiesChecked} entities checked, ${results.linksVerified} links verified, ${results.linksRepaired} links repaired, ${results.linksFailed} links failed`);
    return results;
  } catch (error) {
    logger.error(`Error in system-wide integrity verification: ${error.message}`);
    return {
      error: error.message
    };
  }
}

module.exports = {
  initialize,
  getLinks,
  deleteLink,
  getAllLinks,
  verifyRelationshipIntegrity,
  verifySystemIntegrity,
  isInitialized: () => isInitialized
};
