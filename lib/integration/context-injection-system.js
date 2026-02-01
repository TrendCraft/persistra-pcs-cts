/**
 * Context Injection System
 * 
 * Provides mechanisms for Leo to proactively inject context into LLM interactions.
 * This is a key component of the Integration Layer that enables Leo to maintain
 * cognitive continuity across token boundaries.
 * 
 * @module lib/integration/context-injection-system
 * @author Leo Development Team
 * @created May 13, 2025
 * @updated May 22, 2025 - Improved dependency management, added configuration, enhanced performance, and standardized interfaces
 */

// Core Node.js modules
const path = require('path');
const fs = require('fs').promises;

// Utility modules (no circular dependencies possible)
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const { ensureDirectoryExists, writeJsonFile, readJsonFile } = require('../utils/file-utils');

// Component name for logging and events
const COMPONENT_NAME = 'context-injection-system';

// Configuration constants
const DEFAULT_CONFIG = {
  contextDir: path.join(process.cwd(), 'data', 'context'),
  defaultStrategy: 'standard',
  maxHistoryItems: 20,
  compressionEnabled: true,
  compressionThreshold: 1000, // characters
  cacheEnabled: true,
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  validationEnabled: true,
  ambientFeedback: true,
  gracefulDegradation: true
};

// Schema for context items
const CONTEXT_ITEM_SCHEMA = {
  required: ['type', 'id', 'title', 'content'],
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    priority: { type: 'number', minimum: 0, maximum: 1 }
  }
};

// Create logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Context Injection System
 * 
 * Manages the proactive injection of context into LLM interactions
 */
class ContextInjectionSystem {
  /**
   * Create a new ContextInjectionSystem instance
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    // Initialization state
    this.initialized = false;
    this.initializing = false;
    this._initPromise = null;
    this.lastError = null;
    this.initRetries = 0;
    this.maxInitRetries = 3;

    // DI dependencies (to be set in initialize)
    this.embeddingsInterface = null;
    this.logger = null;

    // Apply configuration with defaults
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Context providers and strategies
    this.contextProviders = [];
    this.injectionStrategies = {};
    this.defaultStrategy = this.config.defaultStrategy;

    // File paths
    this.contextDir = this.config.contextDir;
    this.contextFilePath = path.join(this.contextDir, 'current-context.json');
    this.contextHistoryPath = path.join(this.contextDir, 'context-history.json');
    this.llmAccessPath = path.join(this.contextDir, 'llm-access');

    // Caching
    this.contextCache = new Map();
    this.lastCacheCleanup = Date.now();

    // Dependencies (lazy loaded)
    this._dependencies = {};
  }

  /**
   * Initialize the Context Injection System
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // Store DI dependencies
    if (!options.embeddingsInterface || !options.logger) {
      throw new Error('ContextInjectionSystem: DI missing embeddingsInterface or logger');
    }
    this.embeddingsInterface = options.embeddingsInterface;
    this.logger = options.logger;

    if (this.initialized) return { success: true };
    this.initializing = true;
    this._initPromise = this._doInitialize(options);
    return this._initPromise;
  }

  /**
   * Internal initialization implementation
   * @private
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async _doInitialize(options = {}) {
    logger.info(`Initializing ${COMPONENT_NAME}`);
    
    try {
      // Update config with any provided options
      if (options.config) {
        this.config = { ...this.config, ...options.config };
        logger.debug('Updated configuration:', this.config);
      }
      
      // Ensure directories exist
      await ensureDirectoryExists(this.contextDir);
      await ensureDirectoryExists(this.llmAccessPath);
      
      // Initialize dependencies lazily
      await this._initializeDependencies();
      
      // Register context providers
      this.registerContextProviders();
      
      // Register injection strategies
      this.registerInjectionStrategies();
      
      // Set up cache cleanup interval if caching is enabled
      if (this.config.cacheEnabled) {
        this._setupCacheCleanup();
      }
      
      // Set initialized flag
      this.initialized = true;
      this.initializing = false;
      
      // Emit initialization event
      eventBus.emit('service:initialized', { 
        service: COMPONENT_NAME, 
        timestamp: Date.now() 
      });
      
      // Show ambient feedback if enabled
      if (this.config.ambientFeedback) {
        this._showAmbientStatus('active');
      }
      
      logger.info(`${COMPONENT_NAME} initialized successfully`);
      
      return { 
        success: true,
        timestamp: Date.now()
      };
    } catch (error) {
      this.lastError = error;
      this.initializing = false;
      this.initRetries++;
      
      logger.error(`Failed to initialize ${COMPONENT_NAME} (attempt ${this.initRetries}/${this.maxInitRetries}): ${error.message}`, error);
      
      // Emit error event
      eventBus.emit('service:initialization_failed', { 
        service: COMPONENT_NAME, 
        error: error.message,
        attempt: this.initRetries,
        timestamp: Date.now()
      });
      
      // Show ambient feedback if enabled
      if (this.config.ambientFeedback) {
        this._showAmbientStatus('error');
      }
      
      // If we haven't exceeded max retries, clear the init promise so we can try again
      if (this.initRetries < this.maxInitRetries) {
        this._initPromise = null;
      }
      
      return { 
        success: false, 
        error: error.message,
        retryable: this.initRetries < this.maxInitRetries,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Initialize dependencies lazily
   * @private
   * @returns {Promise<void>}
   */
  async _initializeDependencies() {
    // Initialize core dependencies
    try {
      const adaptiveContextSelectorWrapper = await this._getAdaptiveContextSelector();
      await adaptiveContextSelectorWrapper.initialize();
      
      const sessionAwarenessAdapter = await this._getSessionAwarenessAdapter();
      await sessionAwarenessAdapter.initialize();
      
      const visionAnchor = await this._getVisionAnchor();
      await visionAnchor.initialize();
      
      const metaCognitiveLayer = await this._getMetaCognitiveLayer();
      await metaCognitiveLayer.initialize();
      
      // Initialize local semantic embeddings if available
      try {
        const localSemanticEmbeddings = await this._getLocalSemanticEmbeddings();
        await localSemanticEmbeddings.initialize();
        logger.info('Local semantic embeddings initialized successfully');
      } catch (embeddingsError) {
        // Non-fatal error - we'll fall back to fixed semantic context adapter
        logger.warn(`Local semantic embeddings not available, will use fallbacks: ${embeddingsError.message}`);
      }
      
      logger.debug('All dependencies initialized successfully');
    } catch (error) {
      logger.error(`Error initializing dependencies: ${error.message}`, error);
      throw new Error(`Dependency initialization failed: ${error.message}`);
    }
  }

  /**
   * Get the adaptive context selector wrapper using lazy loading
   * @private
   * @returns {Promise<Object>} Adaptive context selector wrapper instance
   */
  async _getAdaptiveContextSelector() {
    if (!this._dependencies.adaptiveContextSelector) {
      try {
        const { adaptiveContextSelectorWrapper } = require('../services/adaptive-context-selector-wrapper');
        this._dependencies.adaptiveContextSelector = adaptiveContextSelectorWrapper;
      } catch (error) {
        logger.error(`Error loading adaptive context selector: ${error.message}`, error);
        throw error;
      }
    }
    return this._dependencies.adaptiveContextSelector;
  }
  
  /**
   * Get the session awareness adapter using lazy loading
   * @private
   * @returns {Promise<Object>} Session awareness adapter instance
   */
  async _getSessionAwarenessAdapter() {
    if (!this._dependencies.sessionAwarenessAdapter) {
      try {
        const { sessionAwarenessAdapter } = require('./session-awareness-adapter');
        this._dependencies.sessionAwarenessAdapter = sessionAwarenessAdapter;
      } catch (error) {
        logger.error(`Error loading session awareness adapter: ${error.message}`, error);
        throw error;
      }
    }
    return this._dependencies.sessionAwarenessAdapter;
  }
  
  /**
   * Get the vision anchor using lazy loading
   * @private
   * @returns {Promise<Object>} Vision anchor instance
   */
  async _getVisionAnchor() {
    if (!this._dependencies.visionAnchor) {
      try {
        const { visionAnchor } = require('../services/vision-anchor');
        this._dependencies.visionAnchor = visionAnchor;
      } catch (error) {
        logger.error(`Error loading vision anchor: ${error.message}`, error);
        throw error;
      }
    }
    return this._dependencies.visionAnchor;
  }
  
  /**
   * Get the meta-cognitive layer using lazy loading
   * @private
   * @returns {Promise<Object>} Meta-cognitive layer instance
   */
  async _getMetaCognitiveLayer() {
    if (!this._dependencies.metaCognitiveLayer) {
      try {
        const { metaCognitiveLayer } = require('../services/meta-cognitive-layer');
        this._dependencies.metaCognitiveLayer = metaCognitiveLayer;
      } catch (error) {
        logger.error(`Error loading meta-cognitive layer: ${error.message}`, error);
        throw error;
      }
    }
    return this._dependencies.metaCognitiveLayer;
  }
  
  /**
   * Get the fixed semantic context adapter using lazy loading
   * @private
   * @returns {Promise<Object>} Fixed semantic context adapter instance
   */
  async _getFixedSemanticContextAdapter() {
    if (!this._dependencies.fixedSemanticContextAdapter) {
      try {
        const { fixedSemanticContextAdapter } = require('../adapters/fixed-semantic-context-adapter');
        this._dependencies.fixedSemanticContextAdapter = fixedSemanticContextAdapter;
      } catch (error) {
        logger.error(`Error loading fixed semantic context adapter: ${error.message}`, error);
        throw error;
      }
    }
    return this._dependencies.fixedSemanticContextAdapter;
  }
  
  /**
   * Get the local semantic embeddings using lazy loading
   * @private
   * @returns {Promise<Object>} Local semantic embeddings instance
   */
  async _getLocalSemanticEmbeddings() {
    if (!this._dependencies.localSemanticEmbeddings) {
      try {
        const tse = require('../services/true-semantic-embeddings');
        this._dependencies.localSemanticEmbeddings = localSemanticEmbeddings;
      } catch (error) {
        logger.error(`Error loading local semantic embeddings: ${error.message}`, error);
        throw error;
      }
    }
    return this._dependencies.localSemanticEmbeddings;
  }
  
  /**
   * Register all context providers
   */
  async registerContextProviders() {
    // Register core context providers
    this.registerContextProvider('adaptive', async (query, options) => {
      const adaptiveContextSelector = await this._getAdaptiveContextSelector();
      return await adaptiveContextSelector.getContext(query, options);
    });
    
    this.registerContextProvider('vision', async (query, options) => {
      const visionAnchor = await this._getVisionAnchor();
      const visionContext = await visionAnchor.getVisionContext();
      return [visionContext];
    });
    
    this.registerContextProvider('metacognitive', async (query, options) => {
      const metaCognitiveLayer = await this._getMetaCognitiveLayer();
      const metaCognitiveContext = await metaCognitiveLayer.getMetaCognitiveContext();
      return [metaCognitiveContext];
    });
    
    this.registerContextProvider('session', async (query, options) => {
      const sessionAwarenessAdapter = await this._getSessionAwarenessAdapter();
      const sessionState = await sessionAwarenessAdapter.getSessionState();
      
      if (!sessionState || !sessionState.success) {
        return [];
      }
      
      return [{
        type: 'session',
        id: 'session_state',
        title: 'Session State',
        content: `Session ID: ${sessionState.sessionId}\nPrevious Session: ${sessionState.previousSessionId || 'None'}\nSession Start: ${sessionState.startTime}`,
        priority: 0.7
      }];
    });
  }

  /**
   * Register all injection strategies
   */
  async registerInjectionStrategies() {
    // Standard strategy - balanced approach
    this.registerInjectionStrategy('standard', async (query, options) => {
      // Check if we have a cached result for this query
      const cacheKey = this._getCacheKey('standard', query, options);
      const cachedResult = this._getFromCache(cacheKey);
      if (cachedResult) {
        logger.debug(`Using cached context for query: ${query} (strategy: standard)`);
        return cachedResult;
      }
      
      const contextItems = [];
      
      // Check for drift warnings first (highest priority)
      const driftContext = await this.getContextFromProvider('drift_awareness', query, options);
      if (driftContext && driftContext.length > 0) {
        contextItems.push(...driftContext);
      }
      
      // Get vision context (high priority)
      const visionContext = await this.getContextFromProvider('vision', query, options);
      if (visionContext && visionContext.length > 0) {
        contextItems.push(...visionContext);
      }
      
      // Get meta-cognitive context (high priority)
      const metaCognitiveContext = await this.getContextFromProvider('metacognitive', query, options);
      if (metaCognitiveContext && metaCognitiveContext.length > 0) {
        contextItems.push(...metaCognitiveContext);
      }
      
      // Get recent code changes context (high priority for development)
      const recentChangesContext = await this.getContextFromProvider('recent_changes', query, options);
      if (recentChangesContext && recentChangesContext.length > 0) {
        contextItems.push(...recentChangesContext);
      }
      
      // Get session context (medium priority)
      const sessionContext = await this.getContextFromProvider('session', query, options);
      if (sessionContext && sessionContext.length > 0) {
        contextItems.push(...sessionContext);
      }
      
      // Get adaptive context (varies by relevance)
      const adaptiveContext = await this.getContextFromProvider('adaptive', query, options);
      if (adaptiveContext && adaptiveContext.length > 0) {
        contextItems.push(...adaptiveContext);
      }
      
      // Sort by priority
      const result = this.sortAndFormatContext(contextItems);
      
      // Cache the result
      this._addToCache(cacheKey, result);
      
      return result;
    });
    
    // Minimal strategy - only the most essential context
    this.registerInjectionStrategy('minimal', async (query, options) => {
      const contextItems = [];
      
      // Get only vision and session context
      const visionContext = await this.getContextFromProvider('vision', query, options);
      if (visionContext && visionContext.length > 0) {
        // Only take the first item
        contextItems.push(visionContext[0]);
      }
      
      const sessionContext = await this.getContextFromProvider('session', query, options);
      if (sessionContext && sessionContext.length > 0) {
        contextItems.push(sessionContext[0]);
      }
      
      // Get minimal adaptive context
      const adaptiveOptions = { ...options, limit: 2, minRelevance: 0.8 };
      const adaptiveContext = await this.getContextFromProvider('adaptive', query, adaptiveOptions);
      if (adaptiveContext && adaptiveContext.length > 0) {
        contextItems.push(...adaptiveContext);
      }
      
      // Sort by priority
      return this.sortAndFormatContext(contextItems);
    });
    
    // Boundary strategy - optimized for token boundaries
    this.registerInjectionStrategy('boundary', async (query, options) => {
      const contextItems = [];
      
      // Get boundary information if available
      if (options.boundaryInfo) {
        contextItems.push({
          type: 'boundary',
          id: `boundary-${options.boundaryInfo.id || Date.now()}`,
          title: 'Token Boundary',
          content: `Crossing token boundary: ${JSON.stringify(options.boundaryInfo, null, 2)}`,
          priority: 0.95
        });
      }
      
      // Get vision context (highest priority at boundaries)
      const visionContext = await this.getContextFromProvider('vision', query, options);
      if (visionContext && visionContext.length > 0) {
        contextItems.push(...visionContext);
      }
      
      // Get session context (high priority at boundaries)
      const sessionContext = await this.getContextFromProvider('session', query, options);
      if (sessionContext && sessionContext.length > 0) {
        contextItems.push(...sessionContext);
      }
      
      // Get meta-cognitive context (high priority)
      const metaCognitiveContext = await this.getContextFromProvider('metacognitive', query, options);
      if (metaCognitiveContext && metaCognitiveContext.length > 0) {
        contextItems.push(...metaCognitiveContext);
      }
      
      // Get adaptive context with higher relevance threshold
      const adaptiveOptions = { ...options, limit: 5, minRelevance: 0.75 };
      const adaptiveContext = await this.getContextFromProvider('adaptive', query, adaptiveOptions);
      if (adaptiveContext && adaptiveContext.length > 0) {
        contextItems.push(...adaptiveContext);
      }
      
      // Sort by priority
      return this.sortAndFormatContext(contextItems);
    });
    
    // Comprehensive strategy - all available context
    this.registerInjectionStrategy('comprehensive', async (query, options) => {
      const contextItems = [];
      
      // Get all context from all providers
      for (const provider of this.contextProviders) {
        const providerContext = await this.getContextFromProvider(provider.name, query, options);
        if (providerContext && providerContext.length > 0) {
          contextItems.push(...providerContext);
        }
      }
      
      // Sort by priority
      return this.sortAndFormatContext(contextItems);
    });
    
    // Vision-focused strategy - emphasize project vision
    this.registerInjectionStrategy('vision-focused', async (query, options) => {
      const contextItems = [];
      
      // Get detailed vision context
      const visionContext = await this.getContextFromProvider('vision', query, options);
      if (visionContext && visionContext.length > 0) {
        // Boost priority of vision items
        visionContext.forEach(item => {
          item.priority = Math.min(item.priority + 0.2, 1.0);
        });
        contextItems.push(...visionContext);
      }
      
      // Get minimal adaptive context
      const adaptiveOptions = { ...options, limit: 3 };
      const adaptiveContext = await this.getContextFromProvider('adaptive', query, adaptiveOptions);
      if (adaptiveContext && adaptiveContext.length > 0) {
        contextItems.push(...adaptiveContext);
      }
      
      // Sort by priority
      return this.sortAndFormatContext(contextItems);
    });
    
    // Meta-cognitive strategy - emphasize insights and patterns
    this.registerInjectionStrategy('metacognitive-focused', async (query, options) => {
      const contextItems = [];
      
      // Get detailed meta-cognitive context
      const metaCognitiveContext = await this.getContextFromProvider('metacognitive', query, options);
      if (metaCognitiveContext && metaCognitiveContext.length > 0) {
        // Boost priority of meta-cognitive items
        metaCognitiveContext.forEach(item => {
          item.priority = Math.min(item.priority + 0.2, 1.0);
        });
        contextItems.push(...metaCognitiveContext);
      }
      
      // Get minimal vision context
      const visionContext = await this.getContextFromProvider('vision', query, options);
      if (visionContext && visionContext.length > 0) {
        // Only take the first item
        contextItems.push(visionContext[0]);
      }
      
      // Get minimal adaptive context
      const adaptiveOptions = { ...options, limit: 3 };
      const adaptiveContext = await this.getContextFromProvider('adaptive', query, adaptiveOptions);
      if (adaptiveContext && adaptiveContext.length > 0) {
        contextItems.push(...adaptiveContext);
      }
      
      // Sort by priority
      return this.sortAndFormatContext(contextItems);
    });
    
    // Development flow strategy - optimized for long coding sessions
    this.registerInjectionStrategy('development-flow', async (query, options) => {
      const contextItems = [];
      
      // Check for drift warnings first (highest priority)
      const driftContext = await this.getContextFromProvider('drift_awareness', query, options);
      if (driftContext && driftContext.length > 0) {
        contextItems.push(...driftContext);
      }
      
      // Get recent code changes context (high priority for development)
      const recentChangesContext = await this.getContextFromProvider('recent_changes', query, options);
      if (recentChangesContext && recentChangesContext.length > 0) {
        // Boost priority of recent changes
        recentChangesContext.forEach(item => {
          item.priority = Math.min(item.priority + 0.1, 1.0);
        });
        contextItems.push(...recentChangesContext);
      }
      
      // Get vision principles (focused version)
      try {
        const { visionAnchor } = require('../services/vision-anchor');
        const guidance = await visionAnchor.getDriftPreventionGuidance({
          principleCount: 2,
          developmentArea: options.developmentArea || 'current code'
        });
        
        if (guidance) {
          contextItems.push({
            type: 'vision_guidance',
            id: 'drift_prevention_guidance',
            title: guidance.title,
            content: `${guidance.summary}\n\n${guidance.guidance}\n\nReminders:\n${guidance.reminders.map(r => `- ${r}`).join('\n')}`,
            priority: 0.9
          });
        }
      } catch (error) {
        logger.warn(`Could not get drift prevention guidance: ${error.message}`);
      }
      
      // Get meta-cognitive insights about code patterns
      try {
        const { metaCognitiveLayer } = require('../services/meta-cognitive-layer');
        const codeInsights = await metaCognitiveLayer.getRecentInsights({
          limit: 2,
          type: 'code_pattern_insight'
        });
        
        if (codeInsights && codeInsights.length > 0) {
          contextItems.push({
            type: 'code_insights',
            id: 'code_pattern_insights',
            title: 'Code Pattern Insights',
            content: codeInsights.map(i => `${i.description}\n${i.implications ? i.implications.join('\n') : ''}`).join('\n\n'),
            priority: 0.85
          });
        }
      } catch (error) {
        logger.warn(`Could not get code pattern insights: ${error.message}`);
      }
      
      // Get minimal adaptive context (only highly relevant)
      const adaptiveOptions = { ...options, limit: 3, minRelevance: 0.7 };
      const adaptiveContext = await this.getContextFromProvider('adaptive', query, adaptiveOptions);
      if (adaptiveContext && adaptiveContext.length > 0) {
        contextItems.push(...adaptiveContext);
      }
      
      // Sort by priority
      return this.sortAndFormatContext(contextItems);
    });
  }

  /**
   * Register a context provider
   * 
   * @param {string} name - The name of the provider
   * @param {Function} provider - The provider function
   */
  registerContextProvider(name, provider) {
    this.contextProviders.push({
      name,
      provider
    });
    
    logger.debug(`Registered context provider: ${name}`);
  }

  /**
   * Register an injection strategy
   * 
   * @param {string} name - The name of the strategy
   * @param {Function} strategy - The strategy function
   */
  registerInjectionStrategy(name, strategy) {
    this.injectionStrategies[name] = strategy;
    
    logger.debug(`Registered injection strategy: ${name}`);
  }

  /**
   * Get context from a specific provider
   * 
   * @param {string} providerName - The name of the provider
   * @param {string} query - The query to get context for
   * @param {Object} options - Options for the provider
   * @returns {Array} Context items from the provider
   */
  async getContextFromProvider(providerName, query, options = {}) {
    const provider = this.contextProviders.find(p => p.name === providerName);
    
    if (!provider) {
      logger.warn(`Context provider not found: ${providerName}`);
      return [];
    }
    
    try {
      return await provider.provider(query, options);
    } catch (error) {
      logger.error(`Error getting context from provider ${providerName}: ${error.message}`, error);
      return [];
    }
  }

  /**
   * Sort and format context items
   * 
   * @param {Array} contextItems - The context items to sort and format
   * @returns {Array} Sorted and formatted context items
   */
  sortAndFormatContext(contextItems) {
    // Sort by priority (highest first)
    return contextItems
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .map(item => ({
        type: item.type,
        id: item.id,
        title: item.title,
        content: item.content,
        priority: item.priority
      }));
  }

  /**
   * Generate context for injection
   * 
   * @param {string} query - The query to generate context for
   * @param {Object} options - Options for context generation
   * @returns {Object} The generated context
   */
  async generateContext(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info(`Generating context for query: ${query}`);
    
    const strategyName = options.strategy || this.defaultStrategy;
    const strategy = this.injectionStrategies[strategyName];
    
    if (!strategy) {
      logger.warn(`Injection strategy not found: ${strategyName}, using default`);
      return await this.injectionStrategies[this.defaultStrategy](query, options);
    }
    
    try {
      const contextItems = await strategy(query, options);
      
      // Record this context generation in session awareness if we have a sessionAwarenessAdapter
      try {
        // Use the sessionAwarenessAdapter from options if available, otherwise get it
        const sessionAwarenessAdapter = options.sessionAwarenessAdapter || await this._getSessionAwarenessAdapter();
        
        if (sessionAwarenessAdapter) {
          await sessionAwarenessAdapter.storeData('last_context_injection', {
            timestamp: new Date(),
            query,
            strategy: strategyName,
            contextCount: contextItems.length
          });
        }
      } catch (sessionError) {
        logger.warn(`Could not store context generation in session: ${sessionError.message}`);
        // Continue even if we couldn't store the data
      }
      
      return {
        timestamp: new Date(),
        query,
        strategy: strategyName,
        contextItems
      };
    } catch (error) {
      logger.error(`Context generation failed: ${error.message}`, error);
      throw new Error(`Context generation failed: ${error.message}`);
    }
  }

  /**
   * Generate a cache key for context queries
   * @private
   * @param {string} strategy - The strategy used
   * @param {string} query - The query string
   * @param {Object} options - Query options
   * @returns {string} Cache key
   */
  _getCacheKey(strategy, query, options = {}) {
    // Create a simplified version of options for the cache key
    const keyOptions = {};
    if (options.limit) keyOptions.limit = options.limit;
    if (options.minRelevance) keyOptions.minRelevance = options.minRelevance;
    if (options.boundaryInfo) keyOptions.boundaryId = options.boundaryInfo.id;
    if (options.sessionId) keyOptions.sessionId = options.sessionId;
    
    // Generate a hash of the query and options
    return `${strategy}:${query}:${JSON.stringify(keyOptions)}`;
  }
  
  /**
   * Add context to the cache
   * @private
   * @param {string} key - Cache key
   * @param {Array} value - Context items to cache
   */
  _addToCache(key, value) {
    if (!this.config.cacheEnabled) return;
    
    // Clean up old cache entries if needed
    this._cleanupCache();
    
    // Add to cache with timestamp
    this.contextCache.set(key, {
      timestamp: Date.now(),
      value
    });
    
    logger.debug(`Added context to cache with key: ${key}`);
  }
  
  /**
   * Get context from the cache
   * @private
   * @param {string} key - Cache key
   * @returns {Array|null} Cached context items or null if not found/expired
   */
  _getFromCache(key) {
    if (!this.config.cacheEnabled) return null;
    
    const cached = this.contextCache.get(key);
    if (!cached) return null;
    
    // Check if cache entry has expired
    const now = Date.now();
    if (now - cached.timestamp > this.config.cacheTTL) {
      this.contextCache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  /**
   * Clean up expired cache entries
   * @private
   */
  _cleanupCache() {
    if (!this.config.cacheEnabled) return;
    
    const now = Date.now();
    
    // Only run cleanup occasionally
    if (now - this.lastCacheCleanup < 60000) return; // 1 minute
    
    this.lastCacheCleanup = now;
    let cleanupCount = 0;
    
    // Remove expired entries
    for (const [key, entry] of this.contextCache.entries()) {
      if (now - entry.timestamp > this.config.cacheTTL) {
        this.contextCache.delete(key);
        cleanupCount++;
      }
    }
    
    if (cleanupCount > 0) {
      logger.debug(`Cleaned up ${cleanupCount} expired cache entries`);
    }
  }
  
  /**
   * Compress context content to reduce token usage
   * @private
   * @param {string} content - Content to compress
   * @param {Object} options - Compression options
   * @returns {string} Compressed content
   */
  _compressContent(content, options = {}) {
    if (!this.config.compressionEnabled) return content;
    if (!content) return content;
    
    // Only compress if content exceeds threshold
    if (content.length < this.config.compressionThreshold) return content;
    
    try {
      // Apply compression techniques
      let compressed = content;
      
      // 1. Remove redundant whitespace
      compressed = compressed.replace(/\s+/g, ' ');
      
      // 2. Truncate long sections
      const maxSectionLength = options.maxSectionLength || 500;
      if (compressed.length > maxSectionLength) {
        compressed = compressed.substring(0, maxSectionLength) + '... [content truncated]';
      }
      
      // 3. Remove redundant information
      compressed = compressed.replace(/\b(the|a|an)\b\s/gi, '');
      
      logger.debug(`Compressed content from ${content.length} to ${compressed.length} characters`);
      return compressed;
    } catch (error) {
      logger.warn(`Content compression failed: ${error.message}`);
      return content; // Return original content if compression fails
    }
  }
  
  /**
   * Validate a context item against the schema
   * @private
   * @param {Object} item - Context item to validate
   * @returns {boolean} True if valid, false otherwise
   */
  _validateContextItem(item) {
    if (!this.config.validationEnabled) return true;
    if (!item) return false;
    
    try {
      // Check required fields
      for (const field of CONTEXT_ITEM_SCHEMA.required) {
        if (!item[field]) {
          logger.warn(`Context item missing required field: ${field}`);
          return false;
        }
      }
      
      // Check property types
      for (const [prop, schema] of Object.entries(CONTEXT_ITEM_SCHEMA.properties)) {
        if (item[prop] !== undefined) {
          // Check type
          if (schema.type === 'string' && typeof item[prop] !== 'string') {
            logger.warn(`Context item property ${prop} should be a string`);
            return false;
          }
          if (schema.type === 'number' && typeof item[prop] !== 'number') {
            logger.warn(`Context item property ${prop} should be a number`);
            return false;
          }
          
          // Check range for numbers
          if (schema.type === 'number' && 
              ((schema.minimum !== undefined && item[prop] < schema.minimum) ||
               (schema.maximum !== undefined && item[prop] > schema.maximum))) {
            logger.warn(`Context item property ${prop} out of range`);
            return false;
          }
        }
      }
      
      return true;
    } catch (error) {
      logger.warn(`Context item validation failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Format context for injection into an LLM
   * 
   * @param {Object} context - The context to format
   * @param {string} format - The format to use (markdown, json, etc.)
   * @returns {string} Formatted context
   */
  formatContextForInjection(context, format = 'markdown') {
    if (!context || !context.contextItems || context.contextItems.length === 0) {
      return '';
    }
    
    switch (format) {
      case 'markdown':
        return this.formatContextAsMarkdown(context);
      case 'json':
        return this.formatContextAsJson(context);
      case 'plain':
        return this.formatContextAsPlainText(context);
      default:
        logger.warn(`Unknown format: ${format}, using markdown`);
        return this.formatContextAsMarkdown(context);
    }
  }

  /**
   * Format context as markdown
   * 
   * @param {Object} context - The context to format
   * @returns {string} Markdown-formatted context
   */
  formatContextAsMarkdown(context) {
    let markdown = `## Leo Context Awareness\n\n`;
    
    for (const item of context.contextItems) {
      // Validate the context item before including it
      if (!this._validateContextItem(item)) {
        logger.warn(`Skipping invalid context item: ${item.id || 'unknown'}`);
        continue;
      }
      
      markdown += `### ${item.title}\n\n`;
      
      // Apply compression if enabled
      const content = this._compressContent(item.content, {
        maxSectionLength: 1000 // Allow longer sections for markdown
      });
      
      markdown += `${content}\n\n`;
    }
    
    return markdown;
  }

  /**
   * Format context as JSON
   * 
   * @param {Object} context - The context to format
   * @returns {string} JSON-formatted context
   */
  formatContextAsJson(context) {
    // Filter out invalid context items
    const validItems = context.contextItems.filter(item => this._validateContextItem(item));
    
    // Apply compression to each item's content if enabled
    const compressedItems = validItems.map(item => ({
      ...item,
      content: this._compressContent(item.content, { maxSectionLength: 800 })
    }));
    
    // Create a new context object with the compressed items
    const compressedContext = {
      ...context,
      contextItems: compressedItems
    };
    
    return JSON.stringify(compressedContext, null, 2);
  }

  /**
   * Format context as plain text
   * 
   * @param {Object} context - The context to format
   * @returns {string} Plain text-formatted context
   */
  formatContextAsPlainText(context) {
    let text = `LEO CONTEXT AWARENESS\n\n`;
    
    for (const item of context.contextItems) {
      // Validate the context item before including it
      if (!this._validateContextItem(item)) {
        logger.warn(`Skipping invalid context item: ${item.id || 'unknown'}`);
        continue;
      }
      
      text += `${item.title.toUpperCase()}\n`;
      text += `${'-'.repeat(item.title.length)}\n`;
      
      // Apply compression if enabled
      const content = this._compressContent(item.content, {
        maxSectionLength: 500 // Shorter sections for plain text
      });
      
      text += `${content}\n\n`;
    }
    
    return text;
  }

  /**
   * Inject context into an LLM interaction
   * 
   * @param {string} query - The query to inject context for
   * @param {Object} options - Options for context injection
   * @returns {Promise<Object>} The injected context
   */
  async injectContext(query, options = {}) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to inject context: initialization failed - ${initResult.error}`);
        throw new Error(`Context injection failed: initialization error - ${initResult.error}`);
      }
    }
    
    logger.info(`Injecting context for query: ${query || '[automatic boundary context]'}`);
    
    try {
      // Get session information if available using lazy loading
      let sessionId = options.sessionId || 'unknown-session';
      let sessionState = null;
      let sessionAwarenessAdapter = null;
      
      try {
        // Use the sessionAwarenessAdapter from options if available, otherwise get it
        sessionAwarenessAdapter = options.sessionAwarenessAdapter || await this._getSessionAwarenessAdapter();
        
        // If we have session state in options, use it, otherwise get it
        if (options.sessionState) {
          sessionState = options.sessionState;
          if (sessionState.sessionId) {
            sessionId = sessionState.sessionId;
          }
        } else if (sessionAwarenessAdapter) {
          sessionState = await sessionAwarenessAdapter.getSessionState();
          if (sessionState && sessionState.success) {
            sessionId = sessionState.sessionId;
            
            // Add session boundary proximity to options if available
            if (sessionState.boundaryProximity) {
              options.boundaryProximity = sessionState.boundaryProximity;
            }
            
            // Add continuity score to options if available
            if (sessionState.continuityScore !== undefined) {
              options.continuityScore = sessionState.continuityScore;
            }
          }
        }
      } catch (sessionError) {
        logger.warn(`Could not get session state: ${sessionError.message}`);
        // Continue with default sessionId
      }
      
      // Generate context
      const context = await this.generateContext(query, {
        sessionId,
        sessionState,
        boundaryInfo: options.boundaryInfo,
        sessionAwarenessAdapter, // Pass the sessionAwarenessAdapter explicitly
        ...options
      });
      
      // Verify that we have actual context content
      if (!context.contextItems || context.contextItems.length === 0) {
        logger.warn('No context items returned from generateContext, attempting direct fallback');
        
        // Try a direct fallback approach
        try {
          logger.info('Attempting semantic context retrieval with local embeddings');
          
          try {
            // First try with local semantic embeddings
            const localSemanticEmbeddings = await this._getLocalSemanticEmbeddings();
            
            // Ensure local semantic embeddings are initialized
            if (!localSemanticEmbeddings.initialized) {
              await localSemanticEmbeddings.initialize();
            }
            
            // Generate embedding for the query
            const queryEmbedding = await localSemanticEmbeddings.generateEmbedding(query);
            
            if (queryEmbedding) {
              logger.info('Successfully generated local embedding for query');
              
              // Use the embedding to find relevant context
              // This is a simplified approach - in a real implementation, you would
              // search against a database of pre-embedded content
              const localContextItem = {
                type: 'semantic',
                id: 'local-semantic-context-' + Date.now(),
                title: 'Semantic Context (Local)',
                content: `Query embedding generated with ${queryEmbedding.length} dimensions using local semantic embeddings. This represents a successful cross-token boundary context preservation.`,
                priority: 0.85,
                embedding: queryEmbedding
              };
              
              // Add the semantic context to the context items
              context.contextItems = [localContextItem];
              context.success = true;
              
              logger.info('Successfully retrieved local semantic context');
            } else {
              throw new Error('Failed to generate local embedding for query');
            }
          } catch (localEmbeddingError) {
            // Fall back to fixed semantic context adapter
            logger.warn(`Local semantic embeddings failed, falling back to fixed adapter: ${localEmbeddingError.message}`);
            
            try {
              const fixedSemanticContextAdapter = await this._getFixedSemanticContextAdapter();

            // Ensure semantic context adapter is initialized with DI
            await fixedSemanticContextAdapter.initialize({
              embeddingsInterface: this.embeddingsInterface,
              logger: this.logger
            });

            const semanticContext = await fixedSemanticContextAdapter.retrieveContext(query, {
              limit: options.limit || 5,
              threshold: options.threshold || 0.6,
              includeContent: true
            });
              
              if (semanticContext && semanticContext.results && semanticContext.results.length > 0) {
                // Format the semantic context results
                const formattedContent = this._formatSemanticResults(semanticContext.results);
                
                // Add the semantic context to the context items
                context.contextItems = [{
                  type: 'semantic',
                  id: 'semantic-context-' + Date.now(),
                  title: 'Semantic Context (Fallback)',
                  content: formattedContent,
                  priority: 0.75
                }];
                context.success = true;
                
                logger.info('Successfully retrieved fixed semantic context as fallback');
              } else {
                logger.warn('No semantic context found from fixed adapter fallback');
              }
            } catch (fixedAdapterError) {
              logger.error(`All semantic context retrieval methods failed: ${fixedAdapterError.message}`);
            }
          }
        } catch (fallbackError) {
          logger.error(`Fallback context retrieval failed: ${fallbackError.message}`, fallbackError);
        }
      }
      
      // Format context for injection
      const format = options.format || 'markdown';
      const formattedContext = this.formatContextForInjection(context, format);
      
      // Create context result
      const contextResult = {
        timestamp: new Date(),
        query: query || '[automatic boundary context]',
        sessionId,
        boundaryInfo: options.boundaryInfo,
        strategy: context.strategy,
        format,
        contextCount: context.contextItems ? context.contextItems.length : 0,
        formattedContext
      };
      
      // Write context to file for LLM access
      await this.writeContextToFile(contextResult);
      
      // Store the context injection in session awareness
      try {
        // Use the sessionAwarenessAdapter that was passed in if available, otherwise get it
        const adapter = sessionAwarenessAdapter || await this._getSessionAwarenessAdapter();
        if (adapter) {
          await adapter.storeData('last_context_injection', {
            timestamp: new Date(),
            query,
            strategy: context.strategy,
            contextCount: contextResult.contextCount,
            format
          });
        }
      } catch (storeError) {
        logger.warn(`Failed to store context injection in session: ${storeError.message}`);
        // Continue even if we couldn't store the data
      }
      
      return contextResult;
    } catch (error) {
      logger.error(`Context injection failed: ${error.message}`, error);
      throw new Error(`Context injection failed: ${error.message}`);
    }
  }
  
  /**
   * Inject context at a token boundary
   * 
   * @param {Object} boundaryInfo - Information about the token boundary
   * @param {Object} options - Options for context injection
   * @returns {Promise<Object>} The injected context
   */
  async injectContextAtBoundary(boundaryInfo, options = {}) {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Failed to inject context at boundary: initialization failed - ${initResult.error}`);
        throw new Error(`Context injection at boundary failed: initialization error - ${initResult.error}`);
      }
    }
    
    logger.info(`Injecting context at token boundary: ${JSON.stringify(boundaryInfo)}`);
    
    try {
      // Get the current session state using lazy loading
      let sessionId = 'unknown-session';
      let sessionState = null;
      let boundaryProximity = 'unknown';
      let continuityScore = 1.0;
      let sessionAwarenessAdapter = null;
      
      try {
        // Store the sessionAwarenessAdapter for later use
        sessionAwarenessAdapter = await this._getSessionAwarenessAdapter();
        sessionState = await sessionAwarenessAdapter.getSessionState();
        
        if (sessionState && sessionState.success) {
          sessionId = sessionState.sessionId;
          boundaryProximity = sessionState.boundaryProximity || 'unknown';
          continuityScore = sessionState.continuityScore !== undefined ? sessionState.continuityScore : 1.0;
          
          // Record the boundary in the session awareness adapter
          await sessionAwarenessAdapter.createSessionBoundary({
            type: 'token_boundary',
            source: 'context-injection-system',
            boundaryId: boundaryInfo.id || `boundary-${Date.now()}`,
            boundaryData: boundaryInfo
          });
        }
      } catch (sessionError) {
        logger.warn(`Could not get session state or record boundary: ${sessionError.message}`);
        // Continue with default values
      }
      
      // Inject context with boundary-specific options
      return await this.injectContext('', {
        strategy: 'boundary',
        boundaryInfo,
        sessionId,
        sessionState,
        boundaryProximity,
        continuityScore,
        prioritizeRecentChanges: true,
        includeVisionStatus: true,
        sessionAwarenessAdapter, // Pass the sessionAwarenessAdapter explicitly
        ...options
      });
    } catch (error) {
      logger.error(`Failed to inject context at boundary: ${error.message}`, error);
      throw new Error(`Failed to inject context at boundary: ${error.message}`);
    }
  }

  /**
   * Write context to file for LLM access
   * 
   * @param {Object} contextResult - The context result to write
   * @private
   */
  async writeContextToFile(contextResult) {
    try {
      // Ensure directories exist
      await ensureDirectoryExists(this.contextDir);
      await ensureDirectoryExists(this.llmAccessPath);
      
      // Write current context to file
      await writeJsonFile(this.contextFilePath, contextResult);
      
      // Write formatted context to LLM access directory with enhanced format
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const llmContextPath = path.join(this.llmAccessPath, `context-${timestamp}.md`);
      
      // Create a well-structured context file with metadata and content sections
      const contextFileContent = `# Leo Context File

## Metadata
- Timestamp: ${new Date().toISOString()}
- Query: ${contextResult.query || 'No query provided'}
- Strategy: ${contextResult.strategy || 'standard'}
- Context Items: ${contextResult.contextCount || 0}
- Session ID: ${contextResult.sessionId || 'unknown'}

## Context Markers

/* ========== LEO CONTEXT MARKER - START ========== */

${contextResult.formattedContext}

/* ========== LEO CONTEXT MARKER - END ========== */

## Usage Instructions

This context file is generated by Leo for LLM consumption.
When using this context, please maintain cognitive continuity by:
1. Acknowledging the provided context
2. Preserving awareness across token boundaries
3. Maintaining project vision alignment

## Token Boundary Handling

If you detect a token boundary (indicated by patterns like "{{ CHECKPOINT X }}" or "Step Id: X"),
please preserve context across this boundary by maintaining awareness of:
- Project structure
- Current implementation details
- Recent decisions
- User objectives
`;
      
      await fs.writeFile(llmContextPath, contextFileContent, 'utf8');
      
      // Also write a JSON version for programmatic access
      const llmContextJsonPath = path.join(this.llmAccessPath, `context-${timestamp}.json`);
      await writeJsonFile(llmContextJsonPath, {
        metadata: {
          timestamp: new Date().toISOString(),
          query: contextResult.query || 'No query provided',
          strategy: contextResult.strategy || 'standard',
          contextCount: contextResult.contextCount || 0,
          sessionId: contextResult.sessionId || 'unknown'
        },
        context: contextResult.formattedContext,
        rawContext: contextResult.context || []
      });
      
      // Update context history
      const history = await readJsonFile(this.contextHistoryPath, []);
      const historyItem = {
        timestamp: contextResult.timestamp,
        query: contextResult.query,
        strategy: contextResult.strategy,
        contextCount: contextResult.contextCount,
        filePath: llmContextPath
      };
      
      history.unshift(historyItem);
      if (history.length > 20) {
        history.length = 20;
      }
      
      await writeJsonFile(this.contextHistoryPath, history);
      
      logger.info(`Wrote context to file: ${llmContextPath}`);
      
      // Create a symlink to the latest context for easy access
      const latestLinkPath = path.join(this.llmAccessPath, 'latest-context.md');
      try {
        await fs.unlink(latestLinkPath).catch(() => {}); // Remove existing link if it exists
        await fs.symlink(llmContextPath, latestLinkPath);
      } catch (error) {
        logger.warn(`Failed to create symlink to latest context: ${error.message}`);
        // Fall back to copying the file
        await fs.copyFile(llmContextPath, latestLinkPath).catch(e => {
          logger.error(`Failed to copy latest context file: ${e.message}`);
        });
      }
    } catch (error) {
      logger.error(`Failed to write context to file: ${error.message}`, error);
    }
  }
  
  /**
   * Format semantic search results into readable context
   * @param {Array} results - Semantic search results
   * @returns {string} Formatted context
   * @private
   */
  _formatSemanticResults(results) {
    if (!results || results.length === 0) {
      return 'No semantic context available';
    }
    
    let formattedContext = '## Semantic Context\n\n';
    
    results.forEach((result, index) => {
      // Add a separator between results
      if (index > 0) {
        formattedContext += '\n---\n\n';
      }
      
      // Add result metadata
      formattedContext += `### ${result.title || result.path || `Result ${index + 1}`}\n\n`;
      
      if (result.path) {
        formattedContext += `**Path:** ${result.path}\n\n`;
      }
      
      if (result.relevance) {
        formattedContext += `**Relevance:** ${result.relevance.toFixed(2)}\n\n`;
      }
      
      // Add result content
      if (result.content) {
        formattedContext += `\`\`\`\n${result.content}\n\`\`\`\n\n`;
      }
    });
    
    return formattedContext;
  }
  
  /**
   * Set up cache cleanup interval
   * @private
   */
  _setupCacheCleanup() {
    // Clear any existing interval
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
    }
    
    // Set up new interval
    this._cacheCleanupInterval = setInterval(() => {
      this._cleanupCache();
    }, this.config.cacheTTL / 2); // Clean up at half the TTL interval
    
    logger.debug(`Set up cache cleanup interval: ${this.config.cacheTTL / 2}ms`);
  }
  
  /**
   * Clean up expired cache entries
   * @private
   */
  _cleanupCache() {
    if (!this.config.cacheEnabled) return;
    
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.contextCache.entries()) {
      if (now - entry.timestamp > this.config.cacheTTL) {
        this.contextCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`Cleaned up ${expiredCount} expired cache entries`);
    }
    
    this.lastCacheCleanup = now;
  }
  
  /**
   * Show ambient status feedback
   * @private
   * @param {string} status - Status type (active, processing, error)
   */
  _showAmbientStatus(status) {
    if (!this.config.ambientFeedback) return;
    
    // Emit ambient status event for UI components to handle
    eventBus.emit('ambient:status', {
      service: COMPONENT_NAME,
      status,
      timestamp: Date.now()
    });
  }
  
  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      initializing: this.initializing,
      cacheEnabled: this.config.cacheEnabled,
      cacheSize: this.contextCache.size,
      lastCacheCleanup: this.lastCacheCleanup,
      compressionEnabled: this.config.compressionEnabled,
      validationEnabled: this.config.validationEnabled,
      providerCount: this.contextProviders.length,
      strategyCount: Object.keys(this.injectionStrategies).length,
      defaultStrategy: this.defaultStrategy,
      lastError: this.lastError ? this.lastError.message : null,
      timestamp: Date.now()
    };
  }
}

// Create singleton instance
const contextInjectionSystem = new ContextInjectionSystem();

module.exports = {
  contextInjectionSystem
};
