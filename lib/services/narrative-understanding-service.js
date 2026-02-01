/**
 * Narrative Understanding Service
 * 
 * This service develops a system that tracks how decisions evolved over time,
 * creating a narrative layer that connects conversations, summaries, and code changes.
 * It's part of Phase 4: Memory Integration for the Conversation-Aware Leo implementation.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const conversationMemoryManager = require('./conversation-memory-manager');
const conversationSummarizer = require('./conversation-summarizer');
const changeLinkingService = require('./change-linking-service');

// Component name for logging and events
const COMPONENT_NAME = 'narrative-understanding-service';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  NARRATIVE_DIR: process.env.LEO_NARRATIVE_DIR || path.join(process.cwd(), 'data', 'narrative'),
  NARRATIVE_INDEX_FILE: 'narrative-index.jsonl',
  TIMELINE_DIR: process.env.LEO_TIMELINE_DIR || path.join(process.cwd(), 'data', 'timeline'),
  MAX_NARRATIVE_AGE_DAYS: 90,
  ENABLE_DECISION_TRACKING: true,
  ENABLE_TIMELINE_GENERATION: true
};

// Initialization state
let isInitialized = false;
let narrativeIndex = [];

/**
 * Initialize the narrative understanding service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing narrative understanding service...');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.narrativeUnderstanding) {
        Object.assign(CONFIG, config.narrativeUnderstanding);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Ensure required directories exist
    await ensureDirectoriesExist();
    
    // Initialize required services
    await Promise.all([
      conversationMemoryManager.initialize(),
      conversationSummarizer.initialize(),
      changeLinkingService.initialize()
    ]);
    
    // Load narrative index
    await loadNarrativeIndex();
    
    // Subscribe to events
    eventBus.on('memory:created', handleMemoryCreated, COMPONENT_NAME);
    eventBus.on('memory:updated', handleMemoryUpdated, COMPONENT_NAME);
    eventBus.on('changes:linked', handleChangesLinked, COMPONENT_NAME);
    
    isInitialized = true;
    logger.info('Narrative understanding service initialized successfully');
    
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
 * Ensure required directories exist
 * @private
 */
async function ensureDirectoriesExist() {
  try {
    await fs.mkdir(CONFIG.NARRATIVE_DIR, { recursive: true });
    logger.info(`Narrative directory created: ${CONFIG.NARRATIVE_DIR}`);
    
    if (CONFIG.ENABLE_TIMELINE_GENERATION) {
      await fs.mkdir(CONFIG.TIMELINE_DIR, { recursive: true });
      logger.info(`Timeline directory created: ${CONFIG.TIMELINE_DIR}`);
    }
  } catch (error) {
    logger.error(`Failed to create directories: ${error.message}`);
    throw error;
  }
}

/**
 * Load narrative index from disk
 * @private
 */
async function loadNarrativeIndex() {
  try {
    const indexPath = path.join(CONFIG.NARRATIVE_DIR, CONFIG.NARRATIVE_INDEX_FILE);
    
    try {
      await fs.access(indexPath);
    } catch (accessError) {
      // Create empty index if it doesn't exist
      narrativeIndex = [];
      await saveNarrativeIndex();
      return;
    }
    
    // Read and parse index file
    const indexContent = await fs.readFile(indexPath, 'utf8');
    narrativeIndex = indexContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    logger.info(`Loaded ${narrativeIndex.length} narratives from index`);
  } catch (error) {
    logger.error(`Failed to load narrative index: ${error.message}`);
    narrativeIndex = [];
  }
}

/**
 * Save narrative index to disk
 * @private
 */
async function saveNarrativeIndex() {
  try {
    const indexPath = path.join(CONFIG.NARRATIVE_DIR, CONFIG.NARRATIVE_INDEX_FILE);
    const indexContent = narrativeIndex
      .map(item => JSON.stringify(item))
      .join('\n');
    
    await fs.writeFile(indexPath, indexContent, 'utf8');
    logger.info(`Saved ${narrativeIndex.length} narratives to index`);
  } catch (error) {
    logger.error(`Failed to save narrative index: ${error.message}`);
  }
}

/**
 * Handle memory created event
 * @param {Object} data - Event data
 * @private
 */
async function handleMemoryCreated(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { memoryId, summaryId } = data;
    
    if (!memoryId || !summaryId) {
      logger.warn('Received memory:created event with missing data');
      return;
    }
    
    logger.info(`Processing memory creation for narrative: ${memoryId}`);
    
    // Get the memory item
    const memoryItem = await conversationMemoryManager.getMemoryItem(memoryId);
    
    if (!memoryItem) {
      logger.warn(`Could not find memory item ${memoryId}`);
      return;
    }
    
    // Create or update narrative
    await createOrUpdateNarrative(memoryItem);
  } catch (error) {
    logger.error(`Error handling memory created event: ${error.message}`);
  }
}

/**
 * Handle memory updated event
 * @param {Object} data - Event data
 * @private
 */
async function handleMemoryUpdated(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { memoryId } = data;
    
    if (!memoryId) {
      logger.warn('Received memory:updated event without memoryId');
      return;
    }
    
    logger.info(`Processing memory update for narrative: ${memoryId}`);
    
    // Get the memory item
    const memoryItem = await conversationMemoryManager.getMemoryItem(memoryId);
    
    if (!memoryItem) {
      logger.warn(`Could not find memory item ${memoryId}`);
      return;
    }
    
    // Update narrative
    await updateNarrativeWithMemory(memoryItem);
  } catch (error) {
    logger.error(`Error handling memory updated event: ${error.message}`);
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
    
    logger.info(`Processing ${links.length} linked changes for narrative: ${summaryId}`);
    
    // Get the summary
    const summary = await conversationSummarizer.getSummary(summaryId);
    
    if (!summary) {
      logger.warn(`Could not find summary ${summaryId}`);
      return;
    }
    
    // Update narrative with linked changes
    await updateNarrativeWithLinks(summary, links);
    
    // Update timeline if enabled
    if (CONFIG.ENABLE_TIMELINE_GENERATION) {
      await updateTimelineWithLinks(summary, links);
    }
  } catch (error) {
    logger.error(`Error handling changes linked event: ${error.message}`);
  }
}

/**
 * Create or update a narrative from a memory item
 * @param {Object} memoryItem - Memory item
 * @returns {Promise<Object>} Narrative object
 * @private
 */
async function createOrUpdateNarrative(memoryItem) {
  try {
    // Generate narrative ID
    const narrativeId = `narrative-${memoryItem.conversationId}`;
    const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${narrativeId}.json`);
    
    // Check if narrative already exists
    let narrative;
    try {
      await fs.access(narrativePath);
      const narrativeContent = await fs.readFile(narrativePath, 'utf8');
      narrative = JSON.parse(narrativeContent);
    } catch (error) {
      // Create new narrative
      narrative = {
        id: narrativeId,
        conversationId: memoryItem.conversationId,
        title: memoryItem.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        decisions: [],
        codeChanges: []
      };
      
      // Add to narrative index
      narrativeIndex.push({
        id: narrativeId,
        conversationId: memoryItem.conversationId,
        title: memoryItem.title,
        createdAt: narrative.createdAt,
        updatedAt: narrative.updatedAt
      });
      
      await saveNarrativeIndex();
    }
    
    // Add memory as a narrative event
    narrative.events.push({
      type: 'memory',
      memoryId: memoryItem.id,
      summaryId: memoryItem.summaryId,
      timestamp: Date.now(),
      title: memoryItem.title,
      content: memoryItem.content,
      topics: memoryItem.topics
    });
    
    // Add decisions if enabled
    if (CONFIG.ENABLE_DECISION_TRACKING && memoryItem.decisions) {
      memoryItem.decisions.forEach(decision => {
        narrative.decisions.push({
          text: decision,
          timestamp: Date.now(),
          memoryId: memoryItem.id,
          summaryId: memoryItem.summaryId
        });
      });
    }
    
    // Update narrative
    narrative.updatedAt = Date.now();
    
    // Save narrative
    await fs.writeFile(narrativePath, JSON.stringify(narrative, null, 2), 'utf8');
    
    // Update index
    const indexItem = narrativeIndex.find(item => item.id === narrativeId);
    if (indexItem) {
      indexItem.updatedAt = narrative.updatedAt;
      indexItem.title = narrative.title;
      await saveNarrativeIndex();
    }
    
    logger.info(`Created/updated narrative ${narrativeId} with memory ${memoryItem.id}`);
    
    // Emit event
    eventBus.emit('narrative:updated', {
      component: COMPONENT_NAME,
      narrativeId,
      memoryId: memoryItem.id
    });
    
    return narrative;
  } catch (error) {
    logger.error(`Error creating/updating narrative: ${error.message}`);
    return null;
  }
}

/**
 * Update a narrative with a memory item
 * @param {Object} memoryItem - Memory item
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function updateNarrativeWithMemory(memoryItem) {
  try {
    // Generate narrative ID
    const narrativeId = `narrative-${memoryItem.conversationId}`;
    const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${narrativeId}.json`);
    
    // Check if narrative exists
    try {
      await fs.access(narrativePath);
    } catch (error) {
      logger.warn(`Narrative ${narrativeId} not found, creating new one`);
      await createOrUpdateNarrative(memoryItem);
      return true;
    }
    
    // Load narrative
    const narrativeContent = await fs.readFile(narrativePath, 'utf8');
    const narrative = JSON.parse(narrativeContent);
    
    // Check if memory event already exists
    const existingEventIndex = narrative.events.findIndex(
      event => event.type === 'memory' && event.memoryId === memoryItem.id
    );
    
    if (existingEventIndex >= 0) {
      // Update existing event
      narrative.events[existingEventIndex] = {
        type: 'memory',
        memoryId: memoryItem.id,
        summaryId: memoryItem.summaryId,
        timestamp: Date.now(),
        title: memoryItem.title,
        content: memoryItem.content,
        topics: memoryItem.topics
      };
    } else {
      // Add new event
      narrative.events.push({
        type: 'memory',
        memoryId: memoryItem.id,
        summaryId: memoryItem.summaryId,
        timestamp: Date.now(),
        title: memoryItem.title,
        content: memoryItem.content,
        topics: memoryItem.topics
      });
    }
    
    // Update decisions if enabled
    if (CONFIG.ENABLE_DECISION_TRACKING && memoryItem.decisions) {
      // Remove existing decisions for this memory
      narrative.decisions = narrative.decisions.filter(
        decision => decision.memoryId !== memoryItem.id
      );
      
      // Add updated decisions
      memoryItem.decisions.forEach(decision => {
        narrative.decisions.push({
          text: decision,
          timestamp: Date.now(),
          memoryId: memoryItem.id,
          summaryId: memoryItem.summaryId
        });
      });
    }
    
    // Update narrative
    narrative.updatedAt = Date.now();
    narrative.title = memoryItem.title || narrative.title;
    
    // Save narrative
    await fs.writeFile(narrativePath, JSON.stringify(narrative, null, 2), 'utf8');
    
    // Update index
    const indexItem = narrativeIndex.find(item => item.id === narrativeId);
    if (indexItem) {
      indexItem.updatedAt = narrative.updatedAt;
      indexItem.title = narrative.title;
      await saveNarrativeIndex();
    }
    
    logger.info(`Updated narrative ${narrativeId} with memory ${memoryItem.id}`);
    
    // Emit event
    eventBus.emit('narrative:updated', {
      component: COMPONENT_NAME,
      narrativeId,
      memoryId: memoryItem.id
    });
    
    return true;
  } catch (error) {
    logger.error(`Error updating narrative with memory: ${error.message}`);
    return false;
  }
}

/**
 * Update a narrative with linked changes
 * @param {Object} summary - Summary data
 * @param {Array} links - Links data
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function updateNarrativeWithLinks(summary, links) {
  try {
    // Generate narrative ID
    const narrativeId = `narrative-${summary.conversationId}`;
    const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${narrativeId}.json`);
    
    // Check if narrative exists
    let narrative;
    try {
      await fs.access(narrativePath);
      const narrativeContent = await fs.readFile(narrativePath, 'utf8');
      narrative = JSON.parse(narrativeContent);
    } catch (error) {
      logger.warn(`Narrative ${narrativeId} not found for linking changes`);
      return false;
    }
    
    // Add links as code changes
    links.forEach(link => {
      // Check if change already exists
      const existingChangeIndex = narrative.codeChanges.findIndex(
        change => change.linkId === link.id
      );
      
      if (existingChangeIndex >= 0) {
        // Update existing change
        narrative.codeChanges[existingChangeIndex] = {
          linkId: link.id,
          filePath: link.filePath,
          changeHash: link.changeHash,
          changeMessage: link.changeMessage,
          timestamp: Date.now(),
          summaryId: summary.id
        };
      } else {
        // Add new change
        narrative.codeChanges.push({
          linkId: link.id,
          filePath: link.filePath,
          changeHash: link.changeHash,
          changeMessage: link.changeMessage,
          timestamp: Date.now(),
          summaryId: summary.id
        });
      }
      
      // Add code change event
      narrative.events.push({
        type: 'codeChange',
        linkId: link.id,
        filePath: link.filePath,
        changeHash: link.changeHash,
        changeMessage: link.changeMessage,
        timestamp: Date.now(),
        summaryId: summary.id
      });
    });
    
    // Update narrative
    narrative.updatedAt = Date.now();
    
    // Save narrative
    await fs.writeFile(narrativePath, JSON.stringify(narrative, null, 2), 'utf8');
    
    // Update index
    const indexItem = narrativeIndex.find(item => item.id === narrativeId);
    if (indexItem) {
      indexItem.updatedAt = narrative.updatedAt;
      await saveNarrativeIndex();
    }
    
    logger.info(`Updated narrative ${narrativeId} with ${links.length} code changes`);
    
    // Emit event
    eventBus.emit('narrative:updated', {
      component: COMPONENT_NAME,
      narrativeId,
      summaryId: summary.id,
      linksAdded: links.length
    });
    
    return true;
  } catch (error) {
    logger.error(`Error updating narrative with links: ${error.message}`);
    return false;
  }
}

/**
 * Update timeline with linked changes
 * @param {Object} summary - Summary data
 * @param {Array} links - Links data
 * @returns {Promise<boolean>} Success status
 * @private
 */
async function updateTimelineWithLinks(summary, links) {
  try {
    if (!CONFIG.ENABLE_TIMELINE_GENERATION) {
      return false;
    }
    
    // Generate timeline ID (global timeline)
    const timelineId = 'global-timeline';
    const timelinePath = path.join(CONFIG.TIMELINE_DIR, `${timelineId}.json`);
    
    // Check if timeline exists
    let timeline;
    try {
      await fs.access(timelinePath);
      const timelineContent = await fs.readFile(timelinePath, 'utf8');
      timeline = JSON.parse(timelineContent);
    } catch (error) {
      // Create new timeline
      timeline = {
        id: timelineId,
        title: 'Global Development Timeline',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: []
      };
    }
    
    // Add summary event if it doesn't exist
    const existingSummaryEvent = timeline.events.find(
      event => event.type === 'summary' && event.summaryId === summary.id
    );
    
    if (!existingSummaryEvent) {
      timeline.events.push({
        type: 'summary',
        summaryId: summary.id,
        conversationId: summary.conversationId,
        timestamp: summary.timestamp || Date.now(),
        title: summary.metadata.title,
        content: summary.summaries.concise,
        topics: summary.topics
      });
    }
    
    // Add code change events
    links.forEach(link => {
      timeline.events.push({
        type: 'codeChange',
        linkId: link.id,
        filePath: link.filePath,
        changeHash: link.changeHash,
        changeMessage: link.changeMessage,
        timestamp: Date.now(),
        summaryId: summary.id,
        conversationId: summary.conversationId
      });
    });
    
    // Sort events by timestamp
    timeline.events.sort((a, b) => a.timestamp - b.timestamp);
    
    // Update timeline
    timeline.updatedAt = Date.now();
    
    // Save timeline
    await fs.writeFile(timelinePath, JSON.stringify(timeline, null, 2), 'utf8');
    
    logger.info(`Updated timeline ${timelineId} with events from summary ${summary.id}`);
    
    // Emit event
    eventBus.emit('timeline:updated', {
      component: COMPONENT_NAME,
      timelineId,
      summaryId: summary.id,
      eventsAdded: links.length + (existingSummaryEvent ? 0 : 1)
    });
    
    return true;
  } catch (error) {
    logger.error(`Error updating timeline with links: ${error.message}`);
    return false;
  }
}

/**
 * Get a narrative by ID
 * @param {string} narrativeId - Narrative ID
 * @returns {Promise<Object>} Narrative object
 */
async function getNarrative(narrativeId) {
  if (!isInitialized) {
    logger.warn('Narrative understanding service not initialized');
    return null;
  }
  
  try {
    const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${narrativeId}.json`);
    
    try {
      await fs.access(narrativePath);
    } catch (accessError) {
      logger.warn(`Narrative ${narrativeId} not found`);
      return null;
    }
    
    const narrativeContent = await fs.readFile(narrativePath, 'utf8');
    const narrative = JSON.parse(narrativeContent);
    
    logger.info(`Retrieved narrative ${narrativeId}`);
    return narrative;
  } catch (error) {
    logger.error(`Failed to get narrative ${narrativeId}: ${error.message}`);
    return null;
  }
}

/**
 * Get all narratives
 * @returns {Promise<Array>} Array of narratives
 */
async function getAllNarratives() {
  if (!isInitialized) {
    logger.warn('Narrative understanding service not initialized');
    return [];
  }
  
  try {
    return narrativeIndex.map(item => ({
      id: item.id,
      conversationId: item.conversationId,
      title: item.title,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
  } catch (error) {
    logger.error(`Failed to get all narratives: ${error.message}`);
    return [];
  }
}

/**
 * Get the global timeline
 * @returns {Promise<Object>} Timeline object
 */
async function getGlobalTimeline() {
  if (!isInitialized || !CONFIG.ENABLE_TIMELINE_GENERATION) {
    logger.warn('Timeline generation not enabled or service not initialized');
    return null;
  }
  
  try {
    const timelineId = 'global-timeline';
    const timelinePath = path.join(CONFIG.TIMELINE_DIR, `${timelineId}.json`);
    
    try {
      await fs.access(timelinePath);
    } catch (accessError) {
      logger.warn('Global timeline not found');
      return null;
    }
    
    const timelineContent = await fs.readFile(timelinePath, 'utf8');
    const timeline = JSON.parse(timelineContent);
    
    logger.info('Retrieved global timeline');
    return timeline;
  } catch (error) {
    logger.error(`Failed to get global timeline: ${error.message}`);
    return null;
  }
}

/**
 * Get decisions across all narratives
 * @returns {Promise<Array>} Array of decisions
 */
async function getAllDecisions() {
  if (!isInitialized || !CONFIG.ENABLE_DECISION_TRACKING) {
    logger.warn('Decision tracking not enabled or service not initialized');
    return [];
  }
  
  try {
    const decisions = [];
    
    // Get all narratives
    for (const indexItem of narrativeIndex) {
      try {
        const narrative = await getNarrative(indexItem.id);
        
        if (narrative && narrative.decisions) {
          // Add narrative context to each decision
          narrative.decisions.forEach(decision => {
            decisions.push({
              ...decision,
              narrativeId: narrative.id,
              conversationId: narrative.conversationId,
              narrativeTitle: narrative.title
            });
          });
        }
      } catch (error) {
        logger.warn(`Error getting decisions from narrative ${indexItem.id}: ${error.message}`);
      }
    }
    
    // Sort by timestamp (newest first)
    decisions.sort((a, b) => b.timestamp - a.timestamp);
    
    logger.info(`Retrieved ${decisions.length} decisions across all narratives`);
    return decisions;
  } catch (error) {
    logger.error(`Failed to get all decisions: ${error.message}`);
    return [];
  }
}

/**
 * Clean up old narratives
 * @returns {Promise<number>} Number of narratives deleted
 */
async function cleanupOldNarratives() {
  if (!isInitialized) {
    logger.warn('Narrative understanding service not initialized');
    return 0;
  }
  
  try {
    const now = Date.now();
    const maxAge = CONFIG.MAX_NARRATIVE_AGE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = now - maxAge;
    
    // Find old narratives
    const oldNarratives = narrativeIndex.filter(item => item.updatedAt < cutoffTime);
    
    logger.info(`Found ${oldNarratives.length} narratives older than ${CONFIG.MAX_NARRATIVE_AGE_DAYS} days`);
    
    // Delete old narratives
    let deletedCount = 0;
    
    for (const item of oldNarratives) {
      try {
        const narrativePath = path.join(CONFIG.NARRATIVE_DIR, `${item.id}.json`);
        await fs.unlink(narrativePath);
        deletedCount++;
      } catch (error) {
        logger.warn(`Error deleting narrative ${item.id}: ${error.message}`);
      }
    }
    
    // Update narrative index
    narrativeIndex = narrativeIndex.filter(item => item.updatedAt >= cutoffTime);
    await saveNarrativeIndex();
    
    logger.info(`Deleted ${deletedCount} old narratives`);
    return deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up old narratives: ${error.message}`);
    return 0;
  }
}

/**
 * Search narratives based on a query
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum number of results to return (default: 5)
 * @param {number} options.similarityThreshold - Similarity threshold (default: 0.7)
 * @returns {Promise<Array>} Array of matching narratives with similarity scores
 */
async function searchNarratives(query, options = {}) {
  if (!isInitialized) {
    logger.warn('Narrative understanding service not initialized');
    return [];
  }

  try {
    logger.info(`Searching narratives for: ${query}`);
    
    const maxResults = options.maxResults || 5;
    const similarityThreshold = options.similarityThreshold || 0.7;
    
    // Get all narratives
    const allNarratives = await getAllNarratives();
    
    if (allNarratives.length === 0) {
      logger.info('No narratives available for search');
      return [];
    }
    
    // Use the conversation embeddings adapter to generate embeddings for the query
    // This assumes we have access to the conversation embeddings adapter
    let conversationEmbeddingsAdapter;
    try {
      conversationEmbeddingsAdapter = require('../adapters/conversation-embeddings-adapter');
    } catch (error) {
      logger.error(`Failed to load conversation embeddings adapter: ${error.message}`);
      return [];
    }
    
    // Generate embedding for the query
    const queryEmbedding = await conversationEmbeddingsAdapter.generateEmbedding(query);
    
    if (!queryEmbedding) {
      logger.error('Failed to generate embedding for query');
      return [];
    }
    
    // Calculate similarity scores for each narrative
    const narrativesWithScores = await Promise.all(
      allNarratives.map(async (narrative) => {
        try {
          // For each narrative, we'll use its summary as the text to compare against
          const narrativeText = narrative.summary || narrative.title || '';
          
          // Generate embedding for the narrative text
          const narrativeEmbedding = await conversationEmbeddingsAdapter.generateEmbedding(narrativeText);
          
          if (!narrativeEmbedding) {
            return { narrative, similarity: 0 };
          }
          
          // Calculate cosine similarity
          const similarity = calculateCosineSimilarity(queryEmbedding, narrativeEmbedding);
          
          return { narrative, similarity };
        } catch (error) {
          logger.error(`Error processing narrative ${narrative.id}: ${error.message}`);
          return { narrative, similarity: 0 };
        }
      })
    );
    
    // Filter by similarity threshold and sort by similarity (descending)
    const results = narrativesWithScores
      .filter(item => item.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
    
    logger.info(`Found ${results.length} matching narratives`);
    
    return results;
  } catch (error) {
    logger.error(`Error searching narratives: ${error.message}`);
    return [];
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {Array<number>} embedding1 - First embedding
 * @param {Array<number>} embedding2 - Second embedding
 * @returns {number} Cosine similarity (0-1)
 * @private
 */
function calculateCosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }
  
  try {
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }
    
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }
    
    return dotProduct / (magnitude1 * magnitude2);
  } catch (error) {
    logger.error(`Error calculating cosine similarity: ${error.message}`);
    return 0;
  }
}

// Export public API
module.exports = {
  initialize,
  getNarrative,
  getAllNarratives,
  getGlobalTimeline,
  getAllDecisions,
  cleanupOldNarratives,
  searchNarratives
};
