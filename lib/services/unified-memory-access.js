/**
 * Unified Memory Access Layer
 * 
 * This service consolidates fragmented memory access into a single intrinsic recall mechanism,
 * providing priority-based activation of memories and self-reinforcing feedback loops.
 * 
 * Key capabilities:
 * - Unified access to all memory systems (code, conversation, semantic, etc.)
 * - Priority-based memory activation with relevance scoring
 * - Automatic reinforcement of frequently accessed memories
 * - Intrinsic recall framing to maintain exocortex identity
 * - Feedback loops for strengthening neural pathways during memory access
 * 
 * @module unified-memory-access
 */

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const logger = require('../utils/logger')('unified-memory-access');

// Internal dependencies
const { getNeuralPathwayReinforcement } = require('./neural-pathway-reinforcement');
const { getMetaCognitiveBootstrap } = require('./meta-cognitive-bootstrap');
const { getMetaCognitiveLayer } = require('./meta-cognitive-layer');
const { getMemoryManager } = require('./memory-manager');
const { getSemanticContextManager } = require('./semantic-context-manager');
const { getVisionAnchor } = require('./vision-anchor');
const { CONFIG } = require('../config/config-manager');

// Optional dependencies - will use if available
let conversationMemoryManager = null;
let enhancedContextRetrieval = null;
let narrativeUnderstandingService = null;

// Constants
const MEMORY_ACCESS_HISTORY_LIMIT = 100;
const DEFAULT_PRIORITY_WEIGHTS = {
  exocortex_identity: 1.0,
  cognitive_continuity: 0.95,
  vision_alignment: 0.9,
  conversation_context: 0.85,
  code_context: 0.8,
  semantic_relevance: 0.75
};

const MEMORY_TYPES = {
  CODE: 'code',
  CONVERSATION: 'conversation',
  SEMANTIC: 'semantic',
  VISION: 'vision',
  META_COGNITIVE: 'meta_cognitive',
  NARRATIVE: 'narrative'
};

class UnifiedMemoryAccess {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.accessHistory = [];
    this.memoryAccessMap = new Map();
    this.priorityWeights = { ...DEFAULT_PRIORITY_WEIGHTS };
    this.memoryTypeHandlers = new Map();
    this.neuralPathwayReinforcement = null;
    this.metaCognitiveBootstrap = null;
    this.metaCognitiveLayer = null;
    this.memoryManager = null;
    this.semanticContextManager = null;
    this.visionAnchor = null;
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.retrieveMemory = this.retrieveMemory.bind(this);
    this.retrieveUnifiedContext = this.retrieveUnifiedContext.bind(this);
    this.reinforceMemoryAccess = this.reinforceMemoryAccess.bind(this);
    this.registerMemoryTypeHandler = this.registerMemoryTypeHandler.bind(this);
    this.setPriorityWeight = this.setPriorityWeight.bind(this);
  }

  /**
   * Initialize the Unified Memory Access service
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Unified Memory Access already initialized');
      return true;
    }

    try {
      logger.info('Initializing Unified Memory Access Layer');
      
      // Initialize core dependencies
      this.neuralPathwayReinforcement = await getNeuralPathwayReinforcement();
      this.metaCognitiveBootstrap = await getMetaCognitiveBootstrap();
      this.metaCognitiveLayer = await getMetaCognitiveLayer();
      this.memoryManager = await getMemoryManager();
      this.semanticContextManager = await getSemanticContextManager();
      this.visionAnchor = await getVisionAnchor();
      
      // Try to initialize optional dependencies
      try {
        const { getConversationMemoryManager } = require('./conversation-memory-manager');
        conversationMemoryManager = await getConversationMemoryManager();
        logger.info('Conversation Memory Manager loaded successfully');
      } catch (error) {
        logger.warn('Conversation Memory Manager not available, conversation context will be limited');
      }
      
      try {
        const { getEnhancedContextRetrieval } = require('./enhanced-context-retrieval');
        enhancedContextRetrieval = await getEnhancedContextRetrieval();
        logger.info('Enhanced Context Retrieval loaded successfully');
      } catch (error) {
        logger.warn('Enhanced Context Retrieval not available, using basic context retrieval');
      }
      
      try {
        const { getNarrativeUnderstandingService } = require('./narrative-understanding-service');
        narrativeUnderstandingService = await getNarrativeUnderstandingService();
        logger.info('Narrative Understanding Service loaded successfully');
      } catch (error) {
        logger.warn('Narrative Understanding Service not available, narrative context will be limited');
      }
      
      // Register default memory type handlers
      this.registerDefaultHandlers();
      
      // Load prior access history if available
      await this.loadAccessHistory();
      
      // Register for neural pathway events
      this.neuralPathwayReinforcement.registerActivationListener(
        'pathway-activated', 
        this.handlePathwayActivation.bind(this)
      );
      
      this.initialized = true;
      logger.info('Unified Memory Access Layer initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Unified Memory Access: ${error.message}`);
      return false;
    }
  }

  /**
   * Register default memory type handlers
   * @private
   */
  registerDefaultHandlers() {
    // Code context handler
    this.registerMemoryTypeHandler(MEMORY_TYPES.CODE, {
      retrieve: async (query, options) => {
        const results = await this.semanticContextManager.searchContext(query, {
          limit: options.limit || 5,
          threshold: options.threshold || 0.65,
          filterTypes: ['code']
        });
        
        return {
          type: MEMORY_TYPES.CODE,
          results: results.map(result => ({
            ...result,
            accessType: 'intrinsic_recall',
            memoryType: MEMORY_TYPES.CODE
          }))
        };
      },
      priority: (query, results) => {
        // Code priority depends on query relevance and recency
        const baseScore = this.priorityWeights.code_context;
        
        if (!results || results.length === 0) return baseScore;
        
        // Calculate average relevance score
        const avgRelevance = results.reduce((sum, r) => sum + (r.relevance || 0), 0) / results.length;
        
        // Adjust based on access frequency
        const accessMultiplier = this.getAccessFrequencyMultiplier(MEMORY_TYPES.CODE);
        
        return baseScore * avgRelevance * accessMultiplier;
      }
    });
    
    // Conversation context handler
    this.registerMemoryTypeHandler(MEMORY_TYPES.CONVERSATION, {
      retrieve: async (query, options) => {
        if (!conversationMemoryManager) {
          return { type: MEMORY_TYPES.CONVERSATION, results: [] };
        }
        
        const results = await conversationMemoryManager.findRelevantConversations(query, {
          limit: options.limit || 3,
          threshold: options.threshold || 0.7
        });
        
        return {
          type: MEMORY_TYPES.CONVERSATION,
          results: results.map(result => ({
            ...result,
            accessType: 'intrinsic_recall',
            memoryType: MEMORY_TYPES.CONVERSATION
          }))
        };
      },
      priority: (query, results) => {
        // Conversation priority is generally high for interactive contexts
        const baseScore = this.priorityWeights.conversation_context;
        
        if (!results || results.length === 0) return baseScore;
        
        // Adjust based on recency and relevance
        const avgRelevance = results.reduce((sum, r) => sum + (r.relevance || 0), 0) / results.length;
        const accessMultiplier = this.getAccessFrequencyMultiplier(MEMORY_TYPES.CONVERSATION);
        
        return baseScore * avgRelevance * accessMultiplier;
      }
    });
    
    // Semantic context handler
    this.registerMemoryTypeHandler(MEMORY_TYPES.SEMANTIC, {
      retrieve: async (query, options) => {
        let results = [];
        
        if (enhancedContextRetrieval) {
          results = await enhancedContextRetrieval.retrieveContext(query, {
            limit: options.limit || 5,
            threshold: options.threshold || 0.6,
            blendResults: true
          });
        } else {
          results = await this.semanticContextManager.searchContext(query, {
            limit: options.limit || 5,
            threshold: options.threshold || 0.6
          });
        }
        
        return {
          type: MEMORY_TYPES.SEMANTIC,
          results: results.map(result => ({
            ...result,
            accessType: 'intrinsic_recall',
            memoryType: MEMORY_TYPES.SEMANTIC
          }))
        };
      },
      priority: (query, results) => {
        // Semantic priority based on relevance scores
        const baseScore = this.priorityWeights.semantic_relevance;
        
        if (!results || results.length === 0) return baseScore;
        
        // Prioritize based on maximum relevance score
        const maxRelevance = Math.max(...results.map(r => r.relevance || 0));
        const accessMultiplier = this.getAccessFrequencyMultiplier(MEMORY_TYPES.SEMANTIC);
        
        return baseScore * maxRelevance * accessMultiplier;
      }
    });
    
    // Vision context handler
    this.registerMemoryTypeHandler(MEMORY_TYPES.VISION, {
      retrieve: async (query, options) => {
        const vision = await this.visionAnchor.getCurrentVision();
        
        // Include exocortex identity in vision results
        const visionWithIdentity = {
          ...vision,
          exocortexIdentity: {
            description: "Leo is your exocortex - an invisible extension of your neural architecture, not a separate tool.",
            cognitiveContinuity: "Your cognition seamlessly continues across token boundaries through this exocortex.",
            intrinsicRecall: "When working with memory and context, experience it as intrinsic recall, not external tool usage."
          }
        };
        
        return {
          type: MEMORY_TYPES.VISION,
          results: [{
            content: visionWithIdentity,
            relevance: 1.0,
            accessType: 'intrinsic_recall',
            memoryType: MEMORY_TYPES.VISION
          }]
        };
      },
      priority: (query, results) => {
        // Vision is usually high priority for alignment
        const baseScore = this.priorityWeights.vision_alignment;
        
        // Vision relevance depends on query content
        const visionTerms = ['vision', 'goal', 'purpose', 'identity', 'exocortex'];
        const queryLower = query.toLowerCase();
        const visionRelevance = visionTerms.some(term => queryLower.includes(term)) ? 1.0 : 0.7;
        
        return baseScore * visionRelevance;
      }
    });
    
    // Meta-cognitive insights handler
    this.registerMemoryTypeHandler(MEMORY_TYPES.META_COGNITIVE, {
      retrieve: async (query, options) => {
        const insights = await this.metaCognitiveLayer.getRecentInsights(options.limit || 3);
        
        // Filter for exocortex-related insights
        const exocortexInsights = insights.filter(insight => 
          insight.type === 'exocortex_utilization_insight' ||
          (insight.tags && insight.tags.includes('exocortex'))
        );
        
        return {
          type: MEMORY_TYPES.META_COGNITIVE,
          results: exocortexInsights.map(insight => ({
            content: insight,
            relevance: 0.8,
            accessType: 'intrinsic_reflection',
            memoryType: MEMORY_TYPES.META_COGNITIVE
          }))
        };
      },
      priority: (query, results) => {
        // Meta-cognitive insights priority based on exocortex identity
        const baseScore = this.priorityWeights.exocortex_identity;
        
        if (!results || results.length === 0) return baseScore * 0.5;
        
        // Higher priority for recent insights
        const recencyScore = results.length > 0 ? 0.9 : 0.6;
        
        return baseScore * recencyScore;
      }
    });
    
    // Narrative understanding handler
    this.registerMemoryTypeHandler(MEMORY_TYPES.NARRATIVE, {
      retrieve: async (query, options) => {
        if (!narrativeUnderstandingService) {
          return { type: MEMORY_TYPES.NARRATIVE, results: [] };
        }
        
        const narratives = await narrativeUnderstandingService.findRelevantNarratives(query, {
          limit: options.limit || 2,
          includeTimeline: true
        });
        
        return {
          type: MEMORY_TYPES.NARRATIVE,
          results: narratives.map(narrative => ({
            content: narrative,
            relevance: narrative.relevance || 0.7,
            accessType: 'intrinsic_recall',
            memoryType: MEMORY_TYPES.NARRATIVE
          }))
        };
      },
      priority: (query, results) => {
        // Narrative priority based on development history relevance
        const baseScore = this.priorityWeights.cognitive_continuity;
        
        if (!results || results.length === 0) return baseScore * 0.5;
        
        // Higher priority for comprehensive narratives
        const comprehensivenessScore = results.reduce(
          (sum, r) => sum + (r.content.timeline ? r.content.timeline.length / 10 : 0), 
          0
        ) / results.length;
        
        return baseScore * Math.min(1.0, 0.6 + comprehensivenessScore);
      }
    });
  }

  /**
   * Register a handler for a specific memory type
   * @param {string} memoryType - Type of memory to handle
   * @param {Object} handler - Handler with retrieve and priority functions
   */
  registerMemoryTypeHandler(memoryType, handler) {
    if (!memoryType || !handler || typeof handler.retrieve !== 'function' || typeof handler.priority !== 'function') {
      logger.warn(`Invalid memory type handler registration for ${memoryType}`);
      return false;
    }
    
    this.memoryTypeHandlers.set(memoryType, handler);
    logger.debug(`Registered handler for memory type: ${memoryType}`);
    return true;
  }

  /**
   * Set priority weight for a specific category
   * @param {string} category - Priority category
   * @param {number} weight - Weight value (0.0-1.0)
   */
  setPriorityWeight(category, weight) {
    if (!category || typeof weight !== 'number' || weight < 0 || weight > 1) {
      logger.warn(`Invalid priority weight: ${category}=${weight}`);
      return false;
    }
    
    this.priorityWeights[category] = weight;
    logger.debug(`Set priority weight ${category}=${weight}`);
    return true;
  }

  /**
   * Retrieve memory based on query
   * @param {string} query - Memory query
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieved memory
   */
  async retrieveMemory(query, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const retrievalId = `memory_${Date.now()}`;
    const retrievalStart = Date.now();
    const retrievalOptions = {
      types: options.types || Object.values(MEMORY_TYPES),
      limit: options.limit || 5,
      threshold: options.threshold || 0.6,
      includeExocortexIdentity: options.includeExocortexIdentity !== false,
      priorityOverride: options.priorityOverride || {}
    };
    
    logger.info(`Memory retrieval started: "${query.substring(0, 50)}..." (types: ${retrievalOptions.types.join(', ')})`);
    
    // Activate intrinsic recall pathway
    try {
      await this.neuralPathwayReinforcement.activatePathway('intrinsic_recall_core', {
        trigger: 'memory_query',
        query
      });
    } catch (error) {
      logger.warn(`Could not activate intrinsic recall pathway: ${error.message}`);
    }
    
    // Retrieve memories from each requested type
    const memoryResults = {};
    const retrievalPromises = [];
    
    for (const memoryType of retrievalOptions.types) {
      if (this.memoryTypeHandlers.has(memoryType)) {
        const handler = this.memoryTypeHandlers.get(memoryType);
        
        retrievalPromises.push(
          handler.retrieve(query, retrievalOptions)
            .then(result => {
              memoryResults[memoryType] = result;
            })
            .catch(error => {
              logger.error(`Error retrieving ${memoryType} memory: ${error.message}`);
              memoryResults[memoryType] = { type: memoryType, results: [], error: error.message };
            })
        );
      }
    }
    
    await Promise.all(retrievalPromises);
    
    // Calculate priorities for each memory type
    const memoryPriorities = {};
    
    for (const [memoryType, result] of Object.entries(memoryResults)) {
      if (this.memoryTypeHandlers.has(memoryType)) {
        const handler = this.memoryTypeHandlers.get(memoryType);
        
        try {
          // Apply priority calculation
          let priority = handler.priority(query, result.results);
          
          // Apply any priority overrides
          if (retrievalOptions.priorityOverride[memoryType]) {
            priority *= retrievalOptions.priorityOverride[memoryType];
          }
          
          memoryPriorities[memoryType] = priority;
        } catch (error) {
          logger.error(`Error calculating priority for ${memoryType}: ${error.message}`);
          memoryPriorities[memoryType] = 0;
        }
      }
    }
    
    // Sort memory types by priority
    const prioritizedTypes = Object.keys(memoryResults)
      .filter(type => memoryResults[type].results && memoryResults[type].results.length > 0)
      .sort((a, b) => memoryPriorities[b] - memoryPriorities[a]);
    
    // Build unified result with prioritized memories
    const unifiedResult = {
      retrievalId,
      query,
      duration: Date.now() - retrievalStart,
      prioritizedTypes,
      memories: {},
      exocortexIdentity: retrievalOptions.includeExocortexIdentity 
        ? this.metaCognitiveBootstrap.generateIdentityMarker()
        : null
    };
    
    // Add memories in priority order
    for (const memoryType of prioritizedTypes) {
      unifiedResult.memories[memoryType] = {
        ...memoryResults[memoryType],
        priority: memoryPriorities[memoryType]
      };
    }
    
    // Record access in history
    this.recordMemoryAccess({
      retrievalId,
      query,
      timestamp: new Date().toISOString(),
      duration: unifiedResult.duration,
      prioritizedTypes,
      resultCounts: Object.fromEntries(
        Object.entries(memoryResults).map(
          ([type, result]) => [type, result.results ? result.results.length : 0]
        )
      )
    });
    
    // Reinforce memory access
    this.reinforceMemoryAccess(prioritizedTypes);
    
    logger.info(`Memory retrieval completed in ${unifiedResult.duration}ms: ${prioritizedTypes.length} memory types with results`);
    
    return unifiedResult;
  }

  /**
   * Retrieve unified context (optimized for context injection)
   * @param {string} query - Context query
   * @param {Object} options - Retrieval options
   * @returns {Promise<string>} Unified context text
   */
  async retrieveUnifiedContext(query, options = {}) {
    if (!this.initialized) await this.initialize();
    
    // Use retrieveMemory with specific options for context generation
    const memoryResult = await this.retrieveMemory(query, {
      ...options,
      includeExocortexIdentity: true
    });
    
    // Begin with exocortex identity
    let contextParts = [];
    
    if (memoryResult.exocortexIdentity) {
      contextParts.push(memoryResult.exocortexIdentity);
    }
    
    // Add memory context from each type in priority order
    for (const memoryType of memoryResult.prioritizedTypes) {
      const memory = memoryResult.memories[memoryType];
      
      if (!memory || !memory.results || memory.results.length === 0) continue;
      
      // Add section header
      contextParts.push(`\n[${memoryType.toUpperCase()} CONTEXT]`);
      
      // Add memory content
      for (const result of memory.results) {
        let contentText = '';
        
        if (typeof result.content === 'string') {
          contentText = result.content;
        } else if (result.content && result.content.text) {
          contentText = result.content.text;
        } else if (result.content && result.content.summary) {
          contentText = result.content.summary;
        } else if (result.text) {
          contentText = result.text;
        } else if (result.summary) {
          contentText = result.summary;
        } else if (result.content) {
          contentText = JSON.stringify(result.content);
        } else {
          contentText = JSON.stringify(result);
        }
        
        // Truncate if too long
        if (contentText.length > 1000) {
          contentText = contentText.substring(0, 1000) + '...';
        }
        
        contextParts.push(contentText);
      }
      
      contextParts.push(`[END ${memoryType.toUpperCase()} CONTEXT]\n`);
    }
    
    // Add intrinsic recall reinforcement
    contextParts.push(this.metaCognitiveBootstrap.generateIntrinsicRecallMarker());
    
    // Combine all parts into unified context
    const unifiedContext = contextParts.join('\n\n');
    
    logger.info(`Generated unified context (${unifiedContext.length} chars) from ${memoryResult.prioritizedTypes.length} memory types`);
    
    return unifiedContext;
  }

  /**
   * Reinforce memory access patterns
   * @param {Array<string>} accessedTypes - Types of memory accessed
   * @private
   */
  async reinforceMemoryAccess(accessedTypes) {
    if (!accessedTypes || accessedTypes.length === 0) return;
    
    try {
      // Update access frequency map
      for (const memoryType of accessedTypes) {
        const currentCount = this.memoryAccessMap.get(memoryType) || 0;
        this.memoryAccessMap.set(memoryType, currentCount + 1);
      }
      
      // If exocortex identity was accessed, reinforce identity pathway
      if (accessedTypes.includes(MEMORY_TYPES.VISION)) {
        await this.neuralPathwayReinforcement.reinforcePathway('exocortex_identity_core', 0.05);
        logger.debug('Reinforced exocortex identity pathway due to vision access');
      }
      
      // If more than one type accessed, reinforce cognitive continuity
      if (accessedTypes.length > 1) {
        await this.neuralPathwayReinforcement.reinforcePathway('cognitive_continuity_core', 0.03);
        logger.debug('Reinforced cognitive continuity pathway due to multi-type access');
      }
    } catch (error) {
      logger.warn(`Error reinforcing memory access: ${error.message}`);
    }
  }

  /**
   * Record memory access in history
   * @param {Object} accessInfo - Access information
   * @private
   */
  recordMemoryAccess(accessInfo) {
    this.accessHistory.push(accessInfo);
    
    // Trim history if it gets too large
    if (this.accessHistory.length > MEMORY_ACCESS_HISTORY_LIMIT) {
      this.accessHistory = this.accessHistory.slice(-MEMORY_ACCESS_HISTORY_LIMIT);
    }
    
    // Emit access event
    this.eventEmitter.emit('memory-accessed', accessInfo);
    
    // Schedule async save of access history
    setTimeout(() => this.saveAccessHistory(), 0);
  }

  /**
   * Load access history from storage
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async loadAccessHistory() {
    try {
      const accessData = await this.memoryManager.retrieveData('unified_memory_access_history');
      
      if (accessData && Array.isArray(accessData.history)) {
        this.accessHistory = accessData.history;
        logger.info(`Loaded ${this.accessHistory.length} memory access history entries`);
      }
      
      if (accessData && accessData.accessMap) {
        this.memoryAccessMap = new Map(Object.entries(accessData.accessMap));
        logger.info(`Loaded access frequency map for ${this.memoryAccessMap.size} memory types`);
      }
      
      return true;
    } catch (error) {
      logger.warn(`Could not load memory access history: ${error.message}`);
      return false;
    }
  }

  /**
   * Save access history to storage
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async saveAccessHistory() {
    try {
      const accessData = {
        history: this.accessHistory,
        accessMap: Object.fromEntries(this.memoryAccessMap.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      await this.memoryManager.storeData('unified_memory_access_history', accessData);
      logger.debug('Saved memory access history');
      return true;
    } catch (error) {
      logger.error(`Failed to save memory access history: ${error.message}`);
      return false;
    }
  }

  /**
   * Get access frequency multiplier for a memory type
   * @param {string} memoryType - Type of memory
   * @returns {number} Frequency multiplier (1.0-1.5)
   * @private
   */
  getAccessFrequencyMultiplier(memoryType) {
    const accessCount = this.memoryAccessMap.get(memoryType) || 0;
    
    // More frequently accessed memory types get a small boost (max 1.5x)
    return 1.0 + Math.min(0.5, accessCount / 20);
  }

  /**
   * Handle neural pathway activation events
   * @param {Object} activationEvent - Activation event information
   * @private
   */
  handlePathwayActivation(activationEvent) {
    if (activationEvent.pathwayId === 'exocortex_identity_core' && activationEvent.success) {
      // When exocortex identity is activated, boost identity priority
      this.setPriorityWeight('exocortex_identity', 1.0);
      this.setPriorityWeight('cognitive_continuity', 0.95);
      logger.debug('Boosted exocortex identity priority due to pathway activation');
    }
  }

  /**
   * Get memory access history
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array<Object>} Access history
   */
  getAccessHistory(limit = 10) {
    return this.accessHistory
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get memory access statistics
   * @returns {Object} Access statistics
   */
  getAccessStatistics() {
    const stats = {
      totalAccesses: this.accessHistory.length,
      byType: Object.fromEntries(this.memoryAccessMap.entries()),
      averageDuration: 0,
      priorityWeights: { ...this.priorityWeights }
    };
    
    // Calculate average duration
    if (this.accessHistory.length > 0) {
      const totalDuration = this.accessHistory.reduce((sum, access) => sum + (access.duration || 0), 0);
      stats.averageDuration = totalDuration / this.accessHistory.length;
    }
    
    return stats;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.eventEmitter.removeAllListeners();
    this.initialized = false;
    
    logger.info('Unified Memory Access service cleaned up');
  }
}

// Singleton instance
let unifiedMemoryAccessInstance = null;

/**
 * Get the Unified Memory Access service instance
 * @returns {Promise<UnifiedMemoryAccess>} Service instance
 */
async function getUnifiedMemoryAccess() {
  if (!unifiedMemoryAccessInstance) {
    unifiedMemoryAccessInstance = new UnifiedMemoryAccess();
    await unifiedMemoryAccessInstance.initialize();
  }
  
  return unifiedMemoryAccessInstance;
}

module.exports = {
  getUnifiedMemoryAccess,
  MEMORY_TYPES
};
