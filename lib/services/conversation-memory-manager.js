/**
 * Conversation Memory Manager
 * 
 * This service integrates conversation memory with Leo's existing knowledge graph,
 * creating bidirectional links between conversations and code components.
 * It's part of Phase 4: Memory Integration for the Conversation-Aware Leo implementation.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('./config-service');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const conversationCaptureService = require('./conversation-capture-service');
const conversationSemanticSearch = require('./conversation-semantic-search');
const conversationSummarizer = require('./conversation-summarizer');
const changeLinkingService = require('./change-linking-service');
const dependencyResolver = require('../utils/dependency-resolver');
// System health monitor removed - no longer needed

// Component name for logging and events
const COMPONENT_NAME = 'conversation-memory-manager';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Make this dependency optional for testing purposes
let fixedSemanticContextAdapter;
try {
  fixedSemanticContextAdapter = require('../adapters/fixed-semantic-context-adapter').fixedSemanticContextAdapter;
} catch (error) {
  logger.warn('Semantic Context Adapter not available, some features will be limited');
  fixedSemanticContextAdapter = {
    isInitialized: false,
    initialize: async () => ({ success: false, error: 'Not implemented' }),
    searchContext: async () => ({ success: false, error: 'Not implemented', results: [] })
  };
}

// Configuration with sensible defaults
let CONFIG = {
  MEMORY_DIR: process.env.LEO_MEMORY_DIR || path.join(process.cwd(), 'data', 'memory'),
  MEMORY_INDEX_FILE: 'memory-index.jsonl',
  NARRATIVE_DIR: process.env.LEO_NARRATIVE_DIR || path.join(process.cwd(), 'data', 'narrative'),
  ENABLE_NARRATIVE_TRACKING: true,
  MAX_MEMORY_AGE_DAYS: 90,
  SIMILARITY_THRESHOLD: 0.65,
  CONTEXT_WEIGHT: 0.7,
  CONVERSATION_WEIGHT: 0.3,
  MAX_MEMORY_ITEMS: 20
};

// Initialization state
let isInitialized = false;
let memoryIndex = [];

/**
 * Initialize the conversation memory manager
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing conversation memory manager...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.conversationMemory) {
        Object.assign(CONFIG, config.conversationMemory);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure required directories exist
    await ensureDirectoriesExist();
    
    // Register with dependency resolver
    dependencyResolver.registerComponent(COMPONENT_NAME, [
      'conversation-semantic-search',
      'conversation-summarizer',
      'change-linking-service',
      'fixed-semantic-context-adapter'
    ], {
      timeout: 60000, // 60 seconds timeout
      required: false  // Continue even if some dependencies fail
    });
    
    // System health monitor has been removed - no longer needed
    
    // Initialize required services using dependency resolver
    await dependencyResolver.initializeComponent('conversation-semantic-search', 
      conversationSemanticSearch, 
      conversationSemanticSearch.initialize.bind(conversationSemanticSearch)
    );
    
    await dependencyResolver.initializeComponent('conversation-summarizer', 
      conversationSummarizer, 
      conversationSummarizer.initialize.bind(conversationSummarizer)
    );
    
    await dependencyResolver.initializeComponent('change-linking-service', 
      changeLinkingService, 
      changeLinkingService.initialize.bind(changeLinkingService)
    );
    
    // Handle fixed semantic context adapter with special care due to previous issues
    try {
      await dependencyResolver.initializeComponent('fixed-semantic-context-adapter', 
        fixedSemanticContextAdapter, 
        fixedSemanticContextAdapter.initialize.bind(fixedSemanticContextAdapter)
      );
    } catch (adapterError) {
      logger.warn(`Fixed semantic context adapter initialization failed: ${adapterError.message}`);
      // Continue without this adapter - it's not critical for basic functionality
    }
    
    // Load memory index
    await loadMemoryIndex();
    
    // Subscribe to events
    eventBus.on('conversation:summarized', handleConversationSummarized, COMPONENT_NAME);
    eventBus.on('changes:linked', handleChangesLinked, COMPONENT_NAME);
    eventBus.on('code:context:updated', handleCodeContextUpdated, COMPONENT_NAME);
    
    isInitialized = true;
    // Update the exported isInitialized property
    module.exports.isInitialized = true;
    logger.info('Conversation memory manager initialized successfully');
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    // Emit error event for standardized error handling
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to initialize conversation memory manager', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Ensure required directories exist
 * @private
 */
async function ensureDirectoriesExist() {
  try {
    await fs.mkdir(CONFIG.MEMORY_DIR, { recursive: true });
    logger.info(`Memory directory created: ${CONFIG.MEMORY_DIR}`);
    
    if (CONFIG.ENABLE_NARRATIVE_TRACKING) {
      await fs.mkdir(CONFIG.NARRATIVE_DIR, { recursive: true });
      logger.info(`Narrative directory created: ${CONFIG.NARRATIVE_DIR}`);
    }
  } catch (error) {
    logger.error(`Failed to create directories: ${error.message}`);
    throw error;
  }
}

/**
 * Load memory index from disk
 * @private
 */
async function loadMemoryIndex() {
  try {
    const indexPath = path.join(CONFIG.MEMORY_DIR, CONFIG.MEMORY_INDEX_FILE);
    
    try {
      await fs.access(indexPath);
    } catch (accessError) {
      // Create empty index if it doesn't exist
      memoryIndex = [];
      await saveMemoryIndex();
      return;
    }
    
    // Read and parse index file
    const indexContent = await fs.readFile(indexPath, 'utf8');
    memoryIndex = indexContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    logger.info(`Loaded ${memoryIndex.length} memory items from index`);
  } catch (error) {
    logger.error(`Failed to load memory index: ${error.message}`);
    memoryIndex = [];
  }
}

/**
 * Save memory index to disk
 * @private
 */
async function saveMemoryIndex() {
  try {
    const indexPath = path.join(CONFIG.MEMORY_DIR, CONFIG.MEMORY_INDEX_FILE);
    const indexContent = memoryIndex
      .map(item => JSON.stringify(item))
      .join('\n');
    
    await fs.writeFile(indexPath, indexContent, 'utf8');
    logger.info(`Saved ${memoryIndex.length} memory items to index`);
  } catch (error) {
    logger.error(`Failed to save memory index: ${error.message}`);
  }
}

/**
 * Handle conversation summarized event
 * @param {Object} data - Event data
 * @private
 */
async function handleConversationSummarized(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { summaryId } = data;
    
    if (!summaryId) {
      logger.warn('Received conversation:summarized event without summaryId');
      return;
    }
    
    logger.info(`Processing summarized conversation for memory integration: ${summaryId}`);
    
    // Get the summary
    const summary = await conversationSummarizer.getSummary(summaryId);
    
    if (!summary) {
      logger.warn(`Could not find summary ${summaryId}`);
      return;
    }
    
    // Create memory from summary
    await createMemoryFromSummary(summary);
    
    // Update narrative if enabled
    if (CONFIG.ENABLE_NARRATIVE_TRACKING) {
      await updateNarrative(summary);
    }
  } catch (error) {
    logger.error(`Error handling conversation summarized event: ${error.message}`);
  }
}

/**
 * Handle changes linked event
 * @param {Object} data - Event data
 * @private
 */
async function handleChangesLinked(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { summaryId, links } = data;
    
    if (!summaryId || !links) {
      logger.warn('Received changes:linked event with missing data');
      return;
    }
    
    logger.info(`Processing ${links.length} linked changes for memory integration: ${summaryId}`);
    
    // Get the summary
    const summary = await conversationSummarizer.getSummary(summaryId);
    
    if (!summary) {
      logger.warn(`Could not find summary ${summaryId}`);
      return;
    }
    
    // Create bidirectional links
    await createBidirectionalLinks(summary, links);
  } catch (error) {
    logger.error(`Error handling changes linked event: ${error.message}`);
  }
}

/**
 * Handle code context updated event
 * @param {Object} data - Event data
 * @private
 */
async function handleCodeContextUpdated(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { filePath } = data;
    
    if (!filePath) {
      logger.warn('Received code:context:updated event without filePath');
      return;
    }
    
    logger.info(`Processing code context update for memory integration: ${filePath}`);
    
    // Find memory items related to this file
    const relatedMemory = await findMemoryByFilePath(filePath);
    
    // Update memory with new context
    for (const memoryItem of relatedMemory) {
      await updateMemoryWithCodeContext(memoryItem, filePath);
    }
  } catch (error) {
    logger.error(`Error handling code context updated event: ${error.message}`);
  }
}

/**
 * Create memory from a conversation summary
 * @param {Object} summary - Summary data
 * @returns {Promise<Object>} Created memory item
 * @private
 */
async function createMemoryFromSummary(summary) {
  try {
    const memoryId = `memory-${summary.id}`;
    const memoryPath = path.join(CONFIG.MEMORY_DIR, `${memoryId}.json`);
    
    // Check if this is an exocortex integration session that should be prioritized
    const isExocortexSession = checkIfExocortexSession(summary);
    
    // Create memory item
    const memoryItem = {
      id: memoryId,
      summaryId: summary.id,
      conversationId: summary.conversationId,
      title: summary.metadata.title || 'Untitled conversation',
      createdAt: Date.now(),
      content: summary.summaries.detailed || summary.summaries.concise,
      topics: summary.topics || [],
      decisions: summary.decisions || [],
      codeReferences: summary.codeReferences || [],
      links: [],
      confidenceScore: isExocortexSession ? 1.0 : 0.75, // High confidence for exocortex sessions
      priorityTags: isExocortexSession ? ['exocortex_identity', 'intrinsic_recall', 'cognitive_continuity'] : [],
      searchableContent: generateSearchableContent(summary)
    };
    
    // Add to memory index
    memoryIndex.push(memoryItem);
    await saveMemoryIndex();
    
    // Save full memory item
    await saveMemoryItem(memoryItem);
    
    logger.info(`Created memory item ${memoryItem.id} from summary ${summary.id}`);
    
    // Emit event
    eventBus.emit('memory:created', {
      component: COMPONENT_NAME,
      memoryId: memoryItem.id,
      summaryId: summary.id
    });
    
    return memoryItem;
  } catch (error) {
    logger.error(`Error creating memory from summary: ${error.message}`);
    return null;
  }
}

/**
 * Save a memory item to disk
 * @param {Object} memoryItem - Memory item
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function saveMemoryItem(memoryItem) {
  try {
    const memoryPath = path.join(CONFIG.MEMORY_DIR, `${memoryItem.id}.json`);
    await fs.writeFile(memoryPath, JSON.stringify(memoryItem, null, 2), 'utf8');
    logger.info(`Saved memory item ${memoryItem.id}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save memory item ${memoryItem.id}: ${error.message}`);
    return false;
  }
}

/**
 * Create bidirectional links between a summary and code changes
 * @param {Object} summary - Summary data
 * @param {Array} links - Links data
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function createBidirectionalLinks(summary, links) {
  try {
    // Find memory item for this summary
    const memoryItem = memoryIndex.find(item => item.summaryId === summary.id);
    
    if (!memoryItem) {
      logger.warn(`Could not find memory item for summary ${summary.id}`);
      return false;
    }
    
    // Add links to memory item
    memoryItem.links = [
      ...(memoryItem.links || []),
      ...links.map(link => ({
        id: link.id,
        type: 'code',
        filePath: link.filePath,
        changeHash: link.changeHash,
        changeMessage: link.changeMessage,
        confidence: link.confidence
      }))
    ];
    
    // Save updated memory item
    await saveMemoryItem(memoryItem);
    
    // Update memory index
    const itemIndex = memoryIndex.findIndex(item => item.id === memoryItem.id);
    if (itemIndex >= 0) {
      memoryIndex[itemIndex] = memoryItem;
      await saveMemoryIndex();
    }
    
    logger.info(`Added ${links.length} bidirectional links to memory item ${memoryItem.id}`);
    
    // Emit event
    eventBus.emit('memory:updated', {
      component: COMPONENT_NAME,
      memoryId: memoryItem.id,
      summaryId: summary.id,
      linksAdded: links.length
    });
    
    return true;
  } catch (error) {
    logger.error(`Error creating bidirectional links: ${error.message}`);
    return false;
  }
}

/**
 * Find memory items related to a file path
 * @param {string} filePath - File path
 * @returns {Promise<Array>} Related memory items
 * @private
 */
async function findMemoryByFilePath(filePath) {
  try {
    // Find memory items with links to this file
    const directlyLinked = memoryIndex.filter(item => 
      item.links && item.links.some(link => link.filePath === filePath)
    );
    
    // Find memory items with code references to this file
    const referencedIn = memoryIndex.filter(item =>
      item.codeReferences && item.codeReferences.some(ref => 
        ref.type === 'file' && ref.path === filePath
      )
    );
    
    // Combine and deduplicate
    const allRelated = [...directlyLinked, ...referencedIn];
    const uniqueIds = new Set(allRelated.map(item => item.id));
    
    const uniqueItems = [];
    for (const id of uniqueIds) {
      const item = allRelated.find(item => item.id === id);
      if (item) {
        uniqueItems.push(item);
      }
    }
    
    logger.info(`Found ${uniqueItems.length} memory items related to ${filePath}`);
    return uniqueItems;
  } catch (error) {
    logger.error(`Error finding memory by file path: ${error.message}`);
    return [];
  }
}

/**
 * Update memory with code context
 * @param {Object} memoryItem - Memory item
 * @param {string} filePath - File path
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function updateMemoryWithCodeContext(memoryItem, filePath) {
  try {
    // Get current code context
    const codeContext = await fixedSemanticContextAdapter.getFileContext(filePath);
    
    if (!codeContext) {
      logger.warn(`Could not get code context for ${filePath}`);
      return false;
    }
    
    // Update memory item with code context
    memoryItem.codeContext = {
      filePath,
      context: codeContext,
      updatedAt: Date.now()
    };
    
    // Save updated memory item
    await saveMemoryItem(memoryItem);
    
    // Update memory index
    const itemIndex = memoryIndex.findIndex(item => item.id === memoryItem.id);
    if (itemIndex >= 0) {
      memoryIndex[itemIndex] = memoryItem;
      await saveMemoryIndex();
    }
    
    logger.info(`Updated memory item ${memoryItem.id} with code context for ${filePath}`);
    
    // Emit event
    eventBus.emit('memory:updated', {
      component: COMPONENT_NAME,
      memoryId: memoryItem.id,
      filePath
    });
    
    return true;
  } catch (error) {
    logger.error(`Error updating memory with code context: ${error.message}`);
    return false;
  }
}

/**
 * Check if a summary is from an exocortex integration session
 * @param {Object} summary - Summary data
 * @returns {boolean} True if this is an exocortex session
 * @private
 */
function checkIfExocortexSession(summary) {
  // Check title for exocortex-related keywords
  const exocortexKeywords = ['exocortex', 'memory integration', 'cognitive continuity', 'intrinsic recall'];
  const titleMatch = summary.metadata.title && 
                    exocortexKeywords.some(keyword => 
                      summary.metadata.title.toLowerCase().includes(keyword.toLowerCase()));
                      
  // Check content for exocortex-related concepts
  const contentToCheck = summary.summaries.detailed || summary.summaries.concise;
  const contentMatch = contentToCheck && 
                     exocortexKeywords.some(keyword => 
                       contentToCheck.toLowerCase().includes(keyword.toLowerCase()));
  
  // Check topics for exocortex-related tags
  const topicsMatch = summary.topics && 
                     summary.topics.some(topic => 
                      exocortexKeywords.some(keyword => 
                        topic.toLowerCase().includes(keyword.toLowerCase())));
  
  // Consider it an exocortex session if at least two of the checks match
  const matchCount = [titleMatch, contentMatch, topicsMatch].filter(Boolean).length;
  return matchCount >= 2;
}

/**
 * Update narrative with a new summary
 * @param {Object} summary - Summary data
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function updateNarrative(summary) {
  try {
    if (!CONFIG.ENABLE_NARRATIVE_TRACKING) {
      return false;
    }
    
    // Get existing narrative or create new one
    const narrativeId = `narrative-${summary.conversationId}`;
    const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${narrativeId}.json`);
    
    let narrative;
    try {
      await fs.access(narrativePath);
      const narrativeContent = await fs.readFile(narrativePath, 'utf8');
      narrative = JSON.parse(narrativeContent);
    } catch (error) {
      // Create new narrative
      narrative = {
        id: narrativeId,
        conversationId: summary.conversationId,
        title: summary.metadata.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: []
      };
    }
    
    // Add summary as a narrative event
    narrative.events.push({
      type: 'summary',
      summaryId: summary.id,
      timestamp: Date.now(),
      title: summary.metadata.title,
      content: summary.summaries.concise,
      topics: summary.topics,
      decisions: summary.decisions.map(d => d.text)
    });
    
    // Update narrative
    narrative.updatedAt = Date.now();
    
    // Save narrative
    await fs.writeFile(narrativePath, JSON.stringify(narrative, null, 2), 'utf8');
    
    logger.info(`Updated narrative ${narrativeId} with summary ${summary.id}`);
    
    // Emit event
    eventBus.emit('narrative:updated', {
      component: COMPONENT_NAME,
      narrativeId,
      summaryId: summary.id
    });
    
    return true;
  } catch (error) {
    logger.error(`Error updating narrative: ${error.message}`);
    return false;
  }
}

/**
 * Search for relevant memory based on a query
 * @param {string} query - Query text
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Standardized result with memory items and metadata
 */
async function searchMemory(query, options = {}) {
  if (!isInitialized) {
    try {
      await initialize();
    } catch (error) {
      logger.error(`Failed to initialize during searchMemory: ${error.message}`);
      return {
        success: false,
        query,
        error: `Initialization failed: ${error.message}`,
        items: []
      };
    }
  }
  
  logger.info(`Searching memory for: ${query.substring(0, 50)}...`);
  
  const searchOptions = {
    limit: options.limit || CONFIG.maxContextItems,
    threshold: options.threshold || CONFIG.relevanceThreshold,
    ...options
  };
  
  try {
    // Check if semantic search is initialized
    if (!dependencyResolver.isComponentInitialized('conversation-semantic-search')) {
      throw new Error('Conversation semantic search is not initialized');
    }
    
    // Use the semantic search service to find relevant memories
    const searchResults = await conversationSemanticSearch.search(query, searchOptions);
    
    // Enrich results with full memory content
    const enrichedResults = await Promise.all(
      searchResults.results.map(async result => {
        try {
          const memoryContent = await fs.readFile(
            path.join(CONFIG.memoryPath, result.id + '.json'),
            'utf8'
          );
          const memory = JSON.parse(memoryContent);
          
          return {
            ...result,
            memory
          };
        } catch (error) {
          logger.warn(`Could not load memory ${result.id}: ${error.message}`);
          
          // System health monitor removed - health check no longer needed
          
          return result;
        }
      })
    );
    
    return {
      success: true,
      query,
      results: enrichedResults,
      metadata: {
        total: memoryIndex.length,
        returned: enrichedResults.length,
        threshold: searchOptions.threshold
      }
    };
  } catch (error) {
    logger.error(`Memory search failed: ${error.message}`);
    eventBus.emit('error', {
      component: COMPONENT_NAME,
      message: 'Memory search failed',
      error: error.message
    });
    
    // System health monitor removed - health check no longer needed
    
    return {
      success: false,
      query,
      error: error.message,
      results: []
    };
  }
}

/**
 * Get a memory item by ID
 * @param {string} memoryId - Memory ID
 * @returns {Promise<Object>} Standardized result with memory item and metadata
 */
async function getMemoryItem(memoryId) {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Conversation memory manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize conversation memory manager',
          item: null,
          metadata: {
            memoryId,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }

    const memoryPath = path.join(CONFIG.MEMORY_DIR, `${memoryId}.json`);

    try {
      await fs.access(memoryPath);
    } catch (accessError) {
      logger.warn(`Memory item ${memoryId} not found`);
      return {
        success: false,
        error: `Memory item ${memoryId} not found`,
        item: null,
        metadata: {
          memoryId,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }

    const memoryContent = await fs.readFile(memoryPath, 'utf8');
    const memoryItem = JSON.parse(memoryContent);

    logger.info(`Retrieved memory item ${memoryId}`);

    // Return standardized result format
    return {
      success: true,
      item: memoryItem,
      metadata: {
        memoryId,
        timestamp: Date.now(),
        status: 'success'
      }
    };
  } catch (error) {
    logger.error(`Failed to get memory item ${memoryId}: ${error.message}`);
    // Emit error event for standardized error handling
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to get memory item ${memoryId}`, 
      error: error.message 
    });
    // Return standardized error format
    return {
      success: false,
      error: error.message,
      item: null,
      metadata: {
        memoryId,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Generate enhanced context with memory integration
 * @param {string} query - User query
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Standardized result with enhanced context and metadata
 */
async function generateEnhancedContext(query, options = {}) {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Conversation memory manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize conversation memory manager',
          context: '## Memory Context (Unavailable)\n\nThe conversation memory system is currently unavailable. Please try again later.',
          metadata: {
            query,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }

    // Start timing for performance monitoring
    const startTime = Date.now();

    // Parse options with defaults
    const {
      maxResults = 5,
      similarityThreshold = 0.65, // Lowered threshold to capture more relevant conversations
      includeDecisions = true,
      includeTimestamps = true,
      includeMetadata = true,
      signal = null // For abort control
    } = options;

    logger.info(`Searching memory for query: "${query}" with options:`, {
      maxResults,
      similarityThreshold,
      includeDecisions,
      includeTimestamps,
      includeMetadata
    });

    // Perform semantic search on memory items
    const memoryResults = await searchMemory(query, {
      maxResults: maxResults * 2, // Get more results initially for filtering
      similarityThreshold,
      signal
    });

    // Search conversations directly using the conversation semantic search
    logger.info(`Searching conversations with query: "${query}"`);
    const conversationResults = await conversationSemanticSearch.searchConversations(query, {
      maxResults: maxResults * 2, // Get more results initially for filtering
      similarityThreshold: similarityThreshold - 0.1, // Lower threshold for conversations
      signal
    });

    // Generate conversation context
    let conversationContext = '';

    // Create a set to track conversation IDs we've already included
    const includedConversationIds = new Set();

    // Check if we have any relevant results
    if (memoryResults.success && memoryResults.items.length > 0 || conversationResults.length > 0) {
      // Add header for conversation history section
      conversationContext = `## Conversation History\n\n`;

      // Add explanation of what this section contains
      conversationContext += `The following are previous conversations related to your query:\n\n`;

      // Process memory results first (they're typically more relevant)
      const conversationItems = memoryResults.items
        .filter(item => item.type === 'conversation')
        .slice(0, maxResults);

      logger.info(`Found ${conversationItems.length} relevant memory items for query`);

      // Add memory items to context
      if (conversationItems.length > 0) {
        for (const item of conversationItems) {
          // Get full memory item
          const memoryItem = await getMemoryItem(item.id);

          if (memoryItem.success && memoryItem.item && !includedConversationIds.has(memoryItem.item.id)) {
            // Add this ID to our tracking set
            includedConversationIds.add(memoryItem.item.id);

            // Add title with timestamp if available
            let title = memoryItem.item.title || 'Conversation';
            if (includeTimestamps && memoryItem.item.timestamp) {
              const date = new Date(memoryItem.item.timestamp);
              title += ` (${date.toLocaleDateString()} ${date.toLocaleTimeString()})`;
            }

            conversationContext += `### ${title}\n`;

            // Format the content with proper markdown
            let formattedContent = memoryItem.item.content;

            // Clean up the content for better readability
            formattedContent = formattedContent
              .replace(/\n\s*\n/g, '\n') // Remove extra blank lines
              .replace(/\n/g, '\n> ') // Add quote formatting
              .trim();

            // Add the formatted content
            conversationContext += `> ${formattedContent}\n\n`;

            // Add decisions if available and requested
            if (includeDecisions && memoryItem.item.decisions && memoryItem.item.decisions.length > 0) {
              conversationContext += `**Key decisions:**\n`;
              memoryItem.item.decisions.forEach(decision => {
                conversationContext += `- ${decision}\n`;
              });
              conversationContext += `\n`;
            }

            // Add metadata if available and requested
            if (includeMetadata && memoryItem.item.metadata) {
              // Only include relevant metadata fields
              const relevantMetadata = [];

              if (memoryItem.item.metadata.topic) {
                relevantMetadata.push(`Topic: ${memoryItem.item.metadata.topic}`);
              }

              if (memoryItem.item.metadata.components) {
                relevantMetadata.push(`Components: ${memoryItem.item.metadata.components}`);
              }

              if (memoryItem.item.metadata.files) {
                relevantMetadata.push(`Files: ${memoryItem.item.metadata.files}`);
              }

              if (relevantMetadata.length > 0) {
                conversationContext += `**Context:** ${relevantMetadata.join(' | ')}\n\n`;
              }
            }
          }
        }
      }

      // Add conversation results if we don't have enough from memory
      if (includedConversationIds.size < maxResults && conversationResults.length > 0) {
        logger.info(`Found ${conversationResults.length} similar conversations`);

        // Only add a few conversations to avoid overwhelming the context
        const remainingSlots = maxResults - includedConversationIds.size;
        const maxToAdd = Math.min(remainingSlots, conversationResults.length);

        for (let i = 0; i < maxToAdd; i++) {
          const conversation = conversationResults[i];

          // Skip if we've already included this conversation
          if (conversation && conversation.id && !includedConversationIds.has(conversation.id)) {
            // Add this ID to our tracking set
            includedConversationIds.add(conversation.id);

            // Add title with timestamp if available
            let title = conversation.title || 'Conversation';
            if (includeTimestamps && conversation.timestamp) {
              const date = new Date(conversation.timestamp);
              title += ` (${date.toLocaleDateString()} ${date.toLocaleTimeString()})`;
            }

            conversationContext += `### ${title}\n`;

            // Format the content with proper markdown
            let formattedContent = conversation.content || '';

            // Clean up the content for better readability
            formattedContent = formattedContent
              .replace(/\n\s*\n/g, '\n') // Remove extra blank lines
              .replace(/\n/g, '\n> ') // Add quote formatting
              .trim();

            // Add the formatted content
            conversationContext += `> ${formattedContent}\n\n`;

            // Add metadata if available and requested
            if (includeMetadata && conversation.metadata) {
              // Only include relevant metadata fields
              const relevantMetadata = [];

              if (conversation.metadata.topic) {
                relevantMetadata.push(`Topic: ${conversation.metadata.topic}`);
              }

              if (conversation.metadata.components) {
                relevantMetadata.push(`Components: ${conversation.metadata.components}`);
              }

              if (relevantMetadata.length > 0) {
                conversationContext += `**Context:** ${relevantMetadata.join(' | ')}\n\n`;
              }
            }
          }
        }
      }

      // Add a reference to the query to help connect the conversation history to the current query
      if (includedConversationIds.size > 0) {
        conversationContext += `These previous conversations are relevant to your query: "${query}"\n\n`;
      }
    } else {
      // No relevant conversations found
      logger.info(`No relevant conversations found for query: ${query}`);
    }

    // Log performance metrics
    const processingTime = Date.now() - startTime;
    logger.info(`Generated enhanced context with ${includedConversationIds.size} conversations in ${processingTime}ms`);

    // Return standardized result format
    return {
      success: true,
      context: conversationContext,
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'success',
        options
      }
    };
  } catch (error) {
    logger.error(`Failed to generate enhanced context: ${error.message}`);
    // Emit error event for standardized error handling
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to generate enhanced context', 
      error: error.message 
    });
    // Return standardized error format with fallback context
    return {
      success: false,
      error: error.message,
      context: '## Memory Context (Error)\n\nThere was an error retrieving memory context: ' + error.message,
      metadata: {
        query,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Get a narrative by ID
 * @param {string} narrativeId - Narrative ID
 * @returns {Promise<Object>} Standardized result with narrative and metadata
 */
async function getNarrative(narrativeId) {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Conversation memory manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize conversation memory manager',
          narrative: null,
          metadata: {
            narrativeId,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    if (!CONFIG.ENABLE_NARRATIVE_TRACKING) {
      logger.warn('Narrative tracking not enabled');
      return {
        success: false,
        error: 'Narrative tracking not enabled',
        narrative: null,
        metadata: {
          narrativeId,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${narrativeId}.json`);
    
    try {
      await fs.access(narrativePath);
    } catch (accessError) {
      logger.warn(`Narrative ${narrativeId} not found`);
      return {
        success: false,
        error: `Narrative ${narrativeId} not found`,
        narrative: null,
        metadata: {
          narrativeId,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    const narrativeContent = await fs.readFile(narrativePath, 'utf8');
    const narrative = JSON.parse(narrativeContent);
    
    logger.info(`Retrieved narrative ${narrativeId}`);
    
    return {
      success: true,
      narrative,
      metadata: {
        narrativeId,
        timestamp: Date.now(),
        status: 'success'
      }
    };
  } catch (error) {
    logger.error(`Failed to get narrative ${narrativeId}: ${error.message}`);
    
    // Emit error event for standardized error handling
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to get narrative ${narrativeId}`, 
      error: error.message 
    });
    
    return {
      success: false,
      error: error.message,
      narrative: null,
      metadata: {
        narrativeId,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Get all narratives
 * @returns {Promise<Object>} Standardized result with narratives and metadata
 */
async function getAllNarratives() {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Conversation memory manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize conversation memory manager',
          narratives: [],
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    if (!CONFIG.ENABLE_NARRATIVE_TRACKING) {
      logger.warn('Narrative tracking not enabled');
      return {
        success: false,
        error: 'Narrative tracking not enabled',
        narratives: [],
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    
    const narrativeFiles = await fs.readdir(CONFIG.NARRATIVE_DIR);
    const narratives = [];
    
    for (const file of narrativeFiles) {
      if (file.endsWith('.json')) {
        try {
          const narrativePath = path.join(CONFIG.NARRATIVE_DIR, file);
          const narrativeContent = await fs.readFile(narrativePath, 'utf8');
          const narrative = JSON.parse(narrativeContent);
          narratives.push(narrative);
        } catch (error) {
          logger.warn(`Error reading narrative file ${file}: ${error.message}`);
        }
      }
    }
    
    logger.info(`Retrieved ${narratives.length} narratives`);
    
    return {
      success: true,
      narratives,
      metadata: {
        count: narratives.length,
        timestamp: Date.now(),
        status: 'success'
      }
    };
  } catch (error) {
    logger.error(`Failed to get narratives: ${error.message}`);
    
    // Emit error event for standardized error handling
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to get narratives', 
      error: error.message 
    });
    
    return {
      success: false,
      error: error.message,
      narratives: [],
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Clean up old memory items
 * @returns {Promise<Object>} Standardized result with cleanup information
 */
async function cleanupOldMemory() {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Conversation memory manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize conversation memory manager',
          deletedCount: 0,
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    
    const now = Date.now();
    const maxAge = CONFIG.MAX_MEMORY_AGE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = now - maxAge;
    
    // Find old memory items
    const oldItems = memoryIndex.filter(item => item.timestamp < cutoffTime);
    
    logger.info(`Found ${oldItems.length} memory items older than ${CONFIG.MAX_MEMORY_AGE_DAYS} days`);
    
    // Delete old items
    let deletedCount = 0;
    
    for (const item of oldItems) {
      try {
        const memoryPath = path.join(CONFIG.MEMORY_DIR, `${item.id}.json`);
        await fs.unlink(memoryPath);
        deletedCount++;
      } catch (error) {
        logger.warn(`Error deleting memory item ${item.id}: ${error.message}`);
      }
    }
    
    // Update memory index
    memoryIndex = memoryIndex.filter(item => item.timestamp >= cutoffTime);
    await saveMemoryIndex();
    
    logger.info(`Deleted ${deletedCount} old memory items`);
    
    return {
      success: true,
      deletedCount,
      metadata: {
        totalFound: oldItems.length,
        timestamp: Date.now(),
        status: 'success'
      }
    };
  } catch (error) {
    logger.error(`Error cleaning up old memory: ${error.message}`);
    
    // Emit error event for standardized error handling
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Error cleaning up old memory', 
      error: error.message 
    });
    
    return {
      success: false,
      error: error.message,
      deletedCount: 0,
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

/**
 * Retrieves the full memory graph.
 * Ensures that the memory index is loaded.
 * @returns {Promise<Array>} Array of memory items.
 */
async function getFullMemoryGraph() {
  if (!isInitialized) {
    logger.warn('getFullMemoryGraph called before ConversationMemoryManager is initialized. Attempting to initialize...');
    await initialize(); // Or handle error if auto-init is not desired
    if (!isInitialized) {
      logger.error('Failed to initialize ConversationMemoryManager for getFullMemoryGraph.');
      return [];
    }
  }
  // loadMemoryIndex is called by initialize()
  return memoryIndex; // memoryIndex is populated by loadMemoryIndex
}

// Export public API
module.exports = {
  initialize,
  searchMemory,
  getMemoryItem,
  getNarrative,
  getAllNarratives,
  cleanupOldMemory,
  generateEnhancedContext,
  getFullMemoryGraph,
  isInitialized: false // Add standardized isInitialized property
};
