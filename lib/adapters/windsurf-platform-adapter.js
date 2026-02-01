/**
 * Windsurf Platform Adapter
 * 
 * Specialized adapter for integrating Leo with the Windsurf LLM platform.
 * Handles Windsurf-specific requirements for token boundary handling
 * and context management.
 * 
 * @module lib/adapters/windsurf-platform-adapter
 * @author Leo Development Team
 * @created May 13, 2025
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../utils/logger');
const { eventBus } = require('../utils/event-bus');
const { sessionBoundaryManager: defaultBoundaryManager } = require('../integration/session-boundary-manager');
const { sessionAwarenessAdapter: defaultAwarenessAdapter } = require('../integration/session-awareness-adapter');
const defaultMetaPromptLayer = require('../integration/meta-prompt-layer');
const { contextInjectionSystem: defaultContextInjectionSystem } = require('../integration/context-injection-system');
const { ensureDirectoryExists, writeJsonFile, readJsonFile } = require('../utils/file-utils');

// We'll initialize the logger during initialization to avoid circular dependencies
let logger;

/**
 * Windsurf Platform Adapter
 * 
 * Handles Windsurf-specific platform integration
 */
class WindsurfPlatformAdapter {
  /**
   * Create a new Windsurf Platform Adapter with dependency injection support
   * @param {Object} options - Configuration options
   * @param {Object} options.sessionBoundaryManager - Session boundary manager instance
   * @param {Object} options.sessionAwarenessAdapter - Session awareness adapter instance
   * @param {Object} options.metaPromptLayer - Meta prompt layer instance
   * @param {Object} options.contextInjectionSystem - Context injection system instance
   * @param {number} options.maxTokensPerResponse - Maximum tokens per response
   * @param {string} options.contextFilePath - Path to store context files
   */
  constructor({
    sessionBoundaryManager = defaultBoundaryManager,
    sessionAwarenessAdapter = defaultAwarenessAdapter,
    metaPromptLayer = defaultMetaPromptLayer,
    contextInjectionSystem = defaultContextInjectionSystem,
    fileUtils = null,
    maxTokensPerResponse = 8192,
    contextFilePath = path.join(process.cwd(), 'data', 'context', 'windsurf-context.json')
  } = {}) {
    this.initialized = false;
    this.platformName = 'windsurf';
    this.sessionBoundaryManager = sessionBoundaryManager;
    this.sessionAwarenessAdapter = sessionAwarenessAdapter;
    this.metaPromptLayer = metaPromptLayer;
    this.contextInjectionSystem = contextInjectionSystem;
    this.fileUtils = fileUtils;
    
    // Enhanced checkpoint patterns to detect various formats with improved coverage
    this.checkpointPatterns = [
      // Standard formats
      /{{ CHECKPOINT[\s]*(\d+)[\s]*}}/, // Standard format with flexible spacing
      /CHECKPOINT[\s-]*(\d+)/, // Alternative format
      /Checkpoint ID:?[\s]*(\d+)/, // Explicit ID format with optional colon
      // Windsurf-specific formats
      /Step Id:?[\s]*(\d+)/, // Windsurf step ID format
      /Step[\s-]*(\d+)/, // Simple step format
      // Token boundary explicit markers
      /Token Boundary[\s-]*(\d+)/, // Explicit token boundary format
      /Boundary ID:?[\s]*(\d+)/, // Boundary ID format
      // System message indicators (likely token boundaries)
      /EPHEMERAL_MESSAGE/, // Ephemeral message indicator
      /<EPHEMERAL_MESSAGE>/, // Tagged ephemeral message
      /SYSTEM:?[\s]*CHECKPOINT[\s]*(\d+)/, // System checkpoint message
      // Memory-related patterns (often indicate token boundaries)
      /MEMORIES are being retrieved/, // Memory retrieval indicator
      /<MEMORY\[.*?\]>/ // Memory tag
    ];
    
    this.maxTokensPerResponse = maxTokensPerResponse;
    this.contextFilePath = contextFilePath;
    this.lastBoundaryId = null;
    this.lastBoundaryTime = null;
    this.lastError = null;
    this.lastContextInjection = null;
  }

  /**
   * Initialize the Windsurf platform adapter
   * @param {Object} injectedDependencies - Dependencies to inject
   * @param {Object} [injectedDependencies.logger] - Logger instance
   * @param {Object} [injectedDependencies.eventBus] - Event bus instance
   * @param {Object} [injectedDependencies.sessionBoundaryManager] - Session boundary manager
   * @param {Object} [injectedDependencies.sessionAwarenessAdapter] - Session awareness adapter
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(injectedDependencies = {}) {
    // Prevent multiple initializations
    if (this.initialized) {
      return { success: true, message: 'Already initialized' };
    }
    
    // Initialize logger first to enable logging during initialization
    logger = injectedDependencies.logger || createComponentLogger('windsurf-platform-adapter');
    this.logger = logger;
    
    try {
      // Get injected dependencies or use existing ones
      const eventBus = injectedDependencies.eventBus || this.eventBus || require('../utils/event-bus').eventBus;
      
      // Store dependencies for later use
      this.eventBus = eventBus;
      
      // Initialize file utils if not already done
      if (!this.fileUtils) {
        this.fileUtils = injectedDependencies.fileUtils || this.initializeFileUtils();
      }
      
      // Log initialization
      if (this.logger) {
        this.logger.info('Initializing Windsurf Platform Adapter');
      } else {
        console.log('No logger provided to Windsurf platform adapter');
      }
      
      // Check if we should skip dependency checks (for testing)
      const skipDependencyChecks = injectedDependencies.skipDependencyChecks === true;
      
      // Verify required dependencies using safe loading method
      if (!this.sessionBoundaryManager && !skipDependencyChecks) {
        this.sessionBoundaryManager = injectedDependencies.sessionBoundaryManager || 
          await this.safeLoadDependency('../integration/session-boundary-manager', 'sessionBoundaryManager');
        
        if (this.sessionBoundaryManager && this.logger) {
          this.logger.info('Session boundary manager loaded successfully');
        }
      }
      
      if (!this.sessionAwarenessAdapter && !skipDependencyChecks) {
        this.sessionAwarenessAdapter = injectedDependencies.sessionAwarenessAdapter || 
          await this.safeLoadDependency('../integration/session-awareness-adapter', 'sessionAwarenessAdapter');
        
        if (this.sessionAwarenessAdapter && this.logger) {
          this.logger.info('Session awareness adapter loaded successfully');
        }
      }
      
      // Try to load context injection system if not provided
      if (!this.contextInjectionSystem && !skipDependencyChecks) {
        this.contextInjectionSystem = injectedDependencies.contextInjectionSystem || 
          await this.safeLoadDependency('../integration/context-injection-system', 'contextInjectionSystem');
        
        if (this.contextInjectionSystem && this.logger) {
          this.logger.info('Context injection system loaded successfully');
        }
      }
      
      // Check if token boundary detection is explicitly enabled
      const enableTokenBoundaryDetection = injectedDependencies.enableTokenBoundaryDetection === true;
      
      // Set up enhanced checkpoint patterns if not already defined
      if ((!this.checkpointPatterns || this.checkpointPatterns.length === 0) || enableTokenBoundaryDetection) {
        this.setupCheckpointPatterns();
      }
      
      // Set up event listeners
      if (this.eventBus) {
        this.eventBus.on('token-boundary-detected', this.handleTokenBoundary.bind(this));
        this.eventBus.on('context-injected', this.handleContextInjection.bind(this));
        
        if (this.logger) {
          this.logger.info('Event listeners set up for token boundaries and context injection');
        }
      }
      
      this.initialized = true;
      
      if (this.logger) {
        this.logger.info('Windsurf Platform Adapter initialized successfully');
      }
      
      // Emit initialization event
      if (this.eventBus) {
        this.eventBus.emit('component:initialized', {
          component: 'windsurf-platform-adapter',
          timestamp: Date.now(),
          dependencies: {
            sessionBoundaryManager: !!this.sessionBoundaryManager,
            sessionAwarenessAdapter: !!this.sessionAwarenessAdapter,
            contextInjectionSystem: !!this.contextInjectionSystem
          }
        });
      }
      
      return { success: true };
    } catch (error) {
      this.lastError = error;
      
      if (this.logger) {
        this.logger.error(`Failed to initialize Windsurf Platform Adapter: ${error.message}`);
        this.logger.error(error.stack);
      } else {
        console.error(`Failed to initialize Windsurf Platform Adapter: ${error.message}`);
        console.error(error.stack);
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle token boundary detection
   * @param {Object} boundaryInfo - Information about the detected boundary
   * @private
   */
  async handleTokenBoundary(boundaryInfo) {
    if (!this.initialized) {
      try {
        await this.initialize({ skipDependencyChecks: true });
      } catch (error) {
        if (this.logger) this.logger.error(`Failed to initialize during boundary handling: ${error.message}`);
        return;
      }
    }
    
    try {
      if (this.logger) {
        this.logger.info(`Handling token boundary: ${JSON.stringify(boundaryInfo)}`);
      }
      
      // Record the boundary
      this.lastBoundaryId = boundaryInfo.id;
      this.lastBoundaryTime = Date.now();
      
      // Record the boundary with session manager if available
      await this.safeRecordTokenBoundary(boundaryInfo);
      
      // Get cross-boundary context for preserving across sessions
      const crossBoundaryContext = await this.getCrossBoundaryContext(boundaryInfo);
      
      // Trigger context injection if possible
      await this.triggerContextInjection(boundaryInfo);
      
      // Emit event for other components
      if (this.eventBus) {
        this.eventBus.emit('windsurf:boundary-detected', {
          ...boundaryInfo,
          crossBoundaryContext
        });
      }
      
      return {
        success: true,
        boundaryId: boundaryInfo.id,
        timestamp: this.lastBoundaryTime,
        contextPreserved: !!crossBoundaryContext
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error handling token boundary: ${error.message}`);
      }
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Handle context injection events
   * @param {Object} injectionInfo - Information about the injected context
   * @private
   */
  async handleContextInjection(injectionInfo) {
    if (!this.initialized) {
      try {
        await this.initialize({ skipDependencyChecks: true });
      } catch (error) {
        if (this.logger) this.logger.error(`Failed to initialize during context injection: ${error.message}`);
        return;
      }
    }
    
    try {
      if (this.logger) {
        this.logger.info(`Handling context injection: ${JSON.stringify(injectionInfo)}`);
      }
      
      // Record the context injection
      this.lastContextInjection = {
        timestamp: Date.now(),
        ...injectionInfo
      };
      
      // Emit event for other components
      if (this.eventBus) {
        this.eventBus.emit('windsurf:context-injected', this.lastContextInjection);
      }
      
      return { success: true, injectionInfo: this.lastContextInjection };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error handling context injection: ${error.message}`);
      }
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Handle boundary detection errors
   * @param {Error} error - The error that occurred
   * @private
   */
  handleBoundaryError(error) {
    if (this.logger) {
      this.logger.error(`Error in boundary detection: ${error.message}`);
      if (error.stack) this.logger.error(error.stack);
    }
    
    // Emit boundary error event
    if (this.eventBus) {
      this.eventBus.emit('adapter:boundary_error', {
        platform: this.platformName,
        error: error.message,
        timestamp: Date.now()
      });
    }
    
    return { 
      success: false, 
      error: error.message,
      component: 'windsurf-platform-adapter' 
    };
  }

  /**
   * Detect token boundaries in Windsurf prompts
   * @param {string} prompt - The prompt to analyze
   * @returns {Object} Token boundary information
   */
  /**
   * Set up enhanced checkpoint patterns for token boundary detection
   * @private
   */
  setupCheckpointPatterns() {
    if (this.logger) this.logger.info('Setting up enhanced checkpoint patterns for token boundary detection');
    
    this.checkpointPatterns = [
      // Standard formats
      /{{ CHECKPOINT[\s]*(\d+)[\s]*}}/, // Standard format with flexible spacing
      /CHECKPOINT[\s-]*(\d+)/, // Alternative format
      /Checkpoint ID:?[\s]*(\d+)/, // Explicit ID format with optional colon
      // Windsurf-specific formats
      /Step Id:?[\s]*(\d+)/, // Windsurf step ID format
      /Step[\s-]*(\d+)/, // Simple step format
      // Token boundary explicit markers
      /Token Boundary[\s-]*(\d+)/, // Explicit token boundary format
      /Boundary ID:?[\s]*(\d+)/, // Boundary ID format
      // System message indicators (likely token boundaries)
      /EPHEMERAL_MESSAGE/, // Ephemeral message indicator
      /<EPHEMERAL_MESSAGE>/, // Tagged ephemeral message
      /SYSTEM:?[\s]*CHECKPOINT[\s]*(\d+)/, // System checkpoint message
      // Memory-related patterns (often indicate token boundaries)
      /MEMORIES are being retrieved/, // Memory retrieval indicator
      /<MEMORY\[.*?\]>/, // Memory tag
      // Additional patterns for better coverage
      /Session ID:?[\s]*(\w+)/, // Session ID format
      /Session:[\s]*(\w+)/, // Alternative session format
      /USER provided the following MEMORIES/, // Memory introduction
      /The following is an? summary/, // Summary introduction
      /The USER provided the following MEMORIES/ // Another memory introduction
    ];
    
    if (this.logger) this.logger.info(`Set up ${this.checkpointPatterns.length} checkpoint patterns`);
  }

  /**
   * Detect token boundaries in a prompt
   * @param {string} prompt - The prompt to analyze for token boundaries
   * @returns {Object|null} Boundary information if detected, null otherwise
   */
  async detectTokenBoundary(prompt) {
    // Initialize if not already initialized
    if (!this.initialized) {
      try {
        await this.initialize({ skipDependencyChecks: true, enableTokenBoundaryDetection: true });
      } catch (error) {
        this.handleBoundaryError(error);
        return { success: false, error: error.message };
      }
    }
    
    // Ensure checkpoint patterns are set up
    if (!this.checkpointPatterns || this.checkpointPatterns.length === 0) {
      this.setupCheckpointPatterns();
    }
    
    // Enhanced detection with multiple patterns and detailed logging
    if (this.logger) this.logger.debug(`Analyzing prompt for token boundaries: ${prompt.substring(0, 100)}...`);
    
    // Try each pattern in order
    for (const pattern of this.checkpointPatterns) {
      const match = pattern.exec(prompt);
      
      if (match) {
        let checkpointId;
        let boundaryType = 'checkpoint';
        
        // Handle special patterns that don't have ID groups
        if (pattern.toString().includes('EPHEMERAL_MESSAGE') || 
            pattern.toString().includes('MEMORIES are being retrieved') ||
            pattern.toString().includes('MEMORY')) {
          // For patterns without explicit IDs, generate a timestamp-based ID
          checkpointId = Date.now();
          boundaryType = 'implicit';
          if (this.logger) this.logger.info(`Detected implicit boundary marker using pattern: ${pattern}`);
        } else if (match[1]) {
          // For patterns with explicit IDs
          checkpointId = parseInt(match[1], 10) || match[1]; // Handle non-numeric IDs
          boundaryType = pattern.toString().includes('Step') ? 'step' : 
                        pattern.toString().includes('Session') ? 'session' : 'checkpoint';
          if (this.logger) this.logger.info(`Detected explicit ${boundaryType} boundary: ${checkpointId} using pattern: ${pattern}`);
        } else {
          // Fallback for unexpected pattern matches
          checkpointId = Date.now();
          boundaryType = 'unknown';
          if (this.logger) this.logger.warn(`Detected boundary with unknown format using pattern: ${pattern}`);
        }
        
        // Store the last detected boundary for context tracking
        this.lastBoundaryId = checkpointId;
        
        // Trigger context injection for this boundary
        await this.triggerContextInjection({
          type: boundaryType,
          id: checkpointId,
          timestamp: Date.now()
        });
        this.lastBoundaryTime = Date.now();
        
        // Emit event for boundary detection
        if (this.eventBus) {
          this.eventBus.emit('boundary:detected', {
            id: checkpointId,
            type: boundaryType,
            timestamp: this.lastBoundaryTime,
            patternUsed: pattern.toString(),
            component: 'windsurf-platform-adapter'
          });
        }
        
        // Write checkpoint detection to file for debugging with enhanced information
        try {
          this.writeCheckpointDetection({
            timestamp: new Date(),
            checkpointId,
            boundaryType,
            patternUsed: pattern.toString(),
            promptSnippet: prompt.substring(0, 200),
            matchIndex: match.index,
            matchLength: match[0].length
          });
        } catch (error) {
          if (this.logger) this.logger.warn(`Failed to write checkpoint detection: ${error.message}`);
        }
        
        // Trigger context injection if available
        await this.triggerContextInjection({
          type: boundaryType,
          id: checkpointId,
          timestamp: this.lastBoundaryTime
        });
        
        return {
          type: boundaryType,
          id: checkpointId,
          timestamp: this.lastBoundaryTime,
          patternUsed: pattern.toString(),
          matchDetails: {
            index: match.index,
            text: match[0]
          }
        };
      }
    }
    
    if (this.logger) this.logger.debug('No checkpoint boundary detected in prompt');
    return null;
  }

  /**
   * Register a new checkpoint pattern for token boundary detection
   * @param {RegExp} pattern - Regular expression pattern to detect token boundaries
   * @returns {boolean} Success status
   */
  registerCheckpointPattern(pattern) {
    if (!(pattern instanceof RegExp)) {
      if (this.logger) this.logger.error('Invalid checkpoint pattern: pattern must be a RegExp');
      return false;
    }
    
    if (this.logger) this.logger.info(`Registered new checkpoint pattern: ${pattern}`);
    this.checkpointPatterns.push(pattern);
    
    // Emit event for pattern registration
    if (this.eventBus) {
      this.eventBus.emit('adapter:pattern_registered', {
        platform: this.platformName,
        pattern: pattern.toString(),
        timestamp: Date.now()
      });
    }
    
    return true;
  }
  
  /**
   * Dispose of the adapter and clean up resources
   * @returns {Promise<Object>} Disposal result
   */
  async dispose() {
    if (this.logger) this.logger.info('Disposing Windsurf platform adapter');
    
    try {
      // Flush any pending operations
      if (this.lastBoundaryId) {
        if (this.logger) this.logger.info(`Flushing context for last boundary ID: ${this.lastBoundaryId}`);
        
        // Write final state to disk
        const contextDir = path.dirname(this.contextFilePath);
        await ensureDirectoryExists(contextDir);
        
        const finalState = {
          lastBoundaryId: this.lastBoundaryId,
          lastBoundaryTime: this.lastBoundaryTime,
          shutdownTime: Date.now(),
          cleanShutdown: true
        };
        
        await writeJsonFile(path.join(contextDir, 'adapter-state.json'), finalState);
      }
      
      // Reset state
      this.initialized = false;
      this.lastBoundaryId = null;
      this.lastBoundaryTime = null;
      this.lastContextInjection = null;
      
      // Emit disposal event
      if (this.eventBus) {
        this.eventBus.emit('adapter:disposed', {
          platform: this.platformName,
          timestamp: Date.now()
        });
      }
      
      return { success: true };
    } catch (error) {
      if (this.logger) this.logger.error(`Error disposing Windsurf platform adapter: ${error.message}`, error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle token boundary crossing
   * @param {Object} boundaryInfo - Information about the token boundary
   * @returns {Promise<Object>} Context to carry across the boundary
   */
  async handleTokenBoundary(boundaryInfo) {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return {
          success: false,
          error: 'Failed to initialize adapter',
          details: initResult
        };
      }
    }

    // Prevent duplicate processing of the same boundary in quick succession
    if (this.lastBoundaryId === boundaryInfo.id && Date.now() - this.lastBoundaryTime < 5000) {
      if (this.logger) this.logger.info(`Skipping duplicate boundary processing for ID: ${boundaryInfo.id}`);
      
      // Emit boundary skip event
      if (this.eventBus) {
        this.eventBus.emit('adapter:boundary_skipped', {
          platform: this.platformName,
          boundaryId: boundaryInfo.id,
          reason: 'duplicate_processing',
          timeSinceLastProcessing: Date.now() - this.lastBoundaryTime
        });
      }
      
      return {
        success: true,
        cached: true,
        boundaryInfo
      };
    }

    // Update last boundary tracking
    this.lastBoundaryId = boundaryInfo.id;
    this.lastBoundaryTime = Date.now();

    if (this.logger) this.logger.info(`Handling token boundary: ${JSON.stringify(boundaryInfo)}`);
    
    try {
      // Record the token boundary
      await this.sessionBoundaryManager.recordTokenBoundary(boundaryInfo);
      
      // Proactively inject context at the boundary using the Context Injection System
      const contextResult = await this.contextInjectionSystem.injectContextAtBoundary(boundaryInfo);
      
      // Retrieve additional context to carry across the boundary
      const crossBoundaryContext = await this.getCrossBoundaryContext(boundaryInfo);
      
      // Emit boundary handled event
      if (this.eventBus) {
        this.eventBus.emit('adapter:boundary_handled', {
          platform: this.platformName,
          boundaryId: boundaryInfo.id,
          timestamp: Date.now(),
          contextInjected: true
        });
      }
      
      // Combine the results
      return {
        success: true,
        sessionId: crossBoundaryContext.sessionId,
        boundaryInfo,
        contextInjected: true,
        contextPath: path.join(process.cwd(), 'data', 'context', 'llm-access', 'latest-context.md'),
        recentObservations: crossBoundaryContext.recentObservations || [],
        visionStatus: crossBoundaryContext.visionStatus || { isAligned: true },
        developmentContext: crossBoundaryContext.developmentContext || {}
      };
    } catch (error) {
      this.lastError = error;
      if (this.logger) this.logger.error(`Error handling token boundary: ${error.message}`, error);
      
      // Emit boundary error event
      if (this.eventBus) {
        this.eventBus.emit('adapter:boundary_error', {
          platform: this.platformName,
          boundaryId: boundaryInfo.id,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return {
        success: false,
        error: error.message,
        boundaryInfo
      };
    }
  }

  /**
   * Enhance a prompt with meta-context and additional information
   * @param {string} prompt - The original prompt to enhance
   * @param {Object} options - Enhancement options
   * @returns {Promise<string>} Enhanced prompt
   */
  async enhancePrompt(prompt, options = {}) {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        if (this.logger) this.logger.warn('Failed to initialize before enhancing prompt');
        return this.createSimpleEnhancedPrompt(prompt, []); // Return basic enhanced prompt if initialization fails
      }
    }
    
    try {
      // Detect token boundaries
      const boundaryInfo = this.detectTokenBoundary(prompt) || { detected: false, type: 'none' };
      
      // Check if this is a new session
      const isNewSession = !this.lastBoundaryId || 
                          (boundaryInfo.id && this.lastBoundaryId !== boundaryInfo.id);
      
      if (isNewSession && this.logger) {
        this.logger.info(`New session detected: Previous=${this.lastBoundaryId}, Current=${boundaryInfo.id || 'none'}`);
      }
      
      // Handle token boundary based on type
      if (boundaryInfo.type === 'implicit') {
        // For implicit boundaries, generate synthetic info
        const implicitBoundaryInfo = {
          id: boundaryInfo.id || Date.now(),
          type: 'implicit',
          timestamp: Date.now(),
          source: 'pattern-detection'
        };
        
        if (this.logger) this.logger.info(`Handling implicit boundary: ${JSON.stringify(implicitBoundaryInfo)}`);
        await this.handleTokenBoundary(implicitBoundaryInfo);
      }
      // Handle explicit token boundary if detected
      else if (boundaryInfo.detected) {
        await this.handleTokenBoundary(boundaryInfo);
      }
      // For continuing sessions without boundary, still inject context periodically
      else if (Date.now() - (this.lastContextInjection || 0) > 300000) { // 5 minutes
        if (this.logger) this.logger.info('Periodic context injection for continuing session', { component: this.componentName });
        this.lastContextInjection = Date.now();
      }
      
      // Prepare context for injection
      let contextItems = [];
      try {
        // Try to get context injection from the context injection system
        if (this.contextInjectionSystem) {
          try {
            // Try multiple approaches to get context items
            if (typeof this.contextInjectionSystem.getContextItems === 'function') {
              // First try: Use getContextItems method if available
              contextItems = await this.contextInjectionSystem.getContextItems(prompt) || [];
            } else if (typeof this.contextInjectionSystem.injectContext === 'function') {
              // Second try: Use injectContext method if available
              const contextResult = await this.contextInjectionSystem.injectContext(prompt, options);
              if (contextResult && contextResult.success) {
                contextItems = contextResult.contextItems || [];
              }
            } else {
              // Third try: See if the system itself provides context directly
              contextItems = this.contextInjectionSystem.contextItems || [];
            }
          } catch (contextError) {
            this.logger.error(`Error getting context: ${contextError}`, { component: COMPONENT_NAME });
          }
        }
      } catch (error) {
        if (this.logger) {
          this.logger.warn(`Error getting context items: ${error.message}`, { component: this.componentName });
        }
      }
      
      // Use the meta-prompt layer to enhance the prompt
      let enhancedPrompt;
      let enhancedPromptResult;
      
      if (this.metaPromptLayer && typeof this.metaPromptLayer.enhancePrompt === 'function') {
        try {
          enhancedPromptResult = await this.metaPromptLayer.enhancePrompt(prompt, contextItems);
          
          // Extract the enhanced prompt string from the result
          if (typeof enhancedPromptResult === 'string') {
            enhancedPrompt = enhancedPromptResult;
          } else if (enhancedPromptResult && typeof enhancedPromptResult === 'object') {
            // If it has an enhancedPrompt property, use that
            if (enhancedPromptResult.enhancedPrompt) {
              enhancedPrompt = enhancedPromptResult.enhancedPrompt;
            } else {
              // Otherwise stringify the whole object
              enhancedPrompt = JSON.stringify(enhancedPromptResult, null, 2);
            }
          } else {
            // Fallback to simple enhancement if the result is invalid
            this.logger.warn('Invalid result from meta-prompt layer, using simple enhancement', { component: this.componentName });
            enhancedPrompt = this.createSimpleEnhancedPrompt(prompt, contextItems);
          }
        } catch (error) {
          if (this.logger) {
            this.logger.error(`Error from meta-prompt layer: ${error.message}`, { component: this.componentName });
          }
          enhancedPrompt = this.createSimpleEnhancedPrompt(prompt, contextItems);
        }
      } else {
        // Fallback if meta-prompt layer is not available
        if (this.logger) {
          this.logger.warn('Meta-prompt layer not available, using simple enhancement', { component: this.componentName });
        }
        enhancedPrompt = this.createSimpleEnhancedPrompt(prompt, contextItems);
      }
      
      // Log the enhanced prompt
      try {
        const promptInfo = {
          timestamp: new Date(),
          originalPrompt: prompt ? prompt.substring(0, 200) : '',
          enhancedPrompt: enhancedPrompt ? enhancedPrompt.substring(0, 500) : '',
          contextCount: contextItems.length,
          boundaryDetected: boundaryInfo ? boundaryInfo.detected : false,
          isNewSession: isNewSession || false
        };
        await this.writeEnhancedPrompt(promptInfo);
      } catch (logError) {
        if (this.logger) {
          this.logger.error(`Error logging enhanced prompt: ${logError.message}`, { component: this.componentName });
        }
      }
      
      // Emit prompt enhancement event
      if (this.eventBus) {
        const eventData = {
          platform: this.platformName,
          timestamp: Date.now(),
          originalLength: typeof prompt === 'string' ? prompt.length : 0,
          enhancedLength: enhancedPrompt.length,
          boundaryDetected: boundaryInfo.detected,
          isNewSession: isNewSession
        };
        this.eventBus.emit('adapter:prompt_enhanced', eventData);
      }
      
      return enhancedPrompt;
    } catch (error) {
      this.lastError = error;
      if (this.logger) this.logger.error(`Error enhancing prompt: ${error.message}`, error);
      
      // Emit prompt enhancement error event
      if (this.eventBus) {
        this.eventBus.emit('adapter:prompt_enhancement_error', {
          platform: this.platformName,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return prompt; // Return original prompt on error
    }
  }

  /**
   * Write checkpoint detection information to file
   * @param {Object} detectionInfo - Information about the detection
   * @returns {Promise<Object>} Result object with success status
   * @private
   */
  async writeCheckpointDetection(detectionInfo) {
    if (!this.fileUtils) {
      if (this.logger) {
        this.logger.error('File utilities not available for checkpoint detection logging');
      }
      return { success: false, error: 'File utilities not available' };
    }
    
    try {
      // Ensure context directory exists
      const contextDir = path.dirname(this.contextFilePath);
      await this.fileUtils.ensureDirectoryExists(contextDir);
      
      // Prepare path for checkpoint detections file
      const detectionsPath = path.join(contextDir, 'checkpoint-detections.json');
      
      // Read existing detections or initialize empty array
      let detections = [];
      try {
        detections = await this.fileUtils.readJsonFile(detectionsPath, []);
      } catch (readError) {
        // If file doesn't exist yet, we'll start with an empty array
        if (this.logger) {
          this.logger.debug(`No existing detections file found, creating new one: ${readError.message}`);
        }
      }
      
      // Add new detection at the beginning of the array
      detections.unshift({
        ...detectionInfo,
        timestamp: detectionInfo.timestamp || Date.now()
      });
      
      // Keep only the latest 10 detections
      if (detections.length > 10) {
        detections = detections.slice(0, 10);
      }
      
      // Write updated detections back to file
      await this.fileUtils.writeJsonFile(detectionsPath, detections);
      
      if (this.logger) {
        this.logger.debug(`Successfully wrote checkpoint detection to ${detectionsPath}`);
      }
      
      return { 
        success: true, 
        path: detectionsPath,
        count: detections.length
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error writing checkpoint detection: ${error.message}`);
      }
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  /**
   * Write context retrieval information to file for diagnostics
   * @param {Object} retrievalInfo - Information about the context retrieval
   * @private
   */
  async writeContextRetrievalInfo(retrievalInfo) {
    try {
      const contextDir = path.dirname(this.contextFilePath);
      await ensureDirectoryExists(contextDir);
      
      const retrievalsPath = path.join(contextDir, 'context-retrievals.json');
      const retrievals = await readJsonFile(retrievalsPath, []);
      
      // Add new retrieval and keep only the last 10
      retrievals.unshift(retrievalInfo);
      if (retrievals.length > 10) {
        retrievals.length = 10;
      }
      
      await writeJsonFile(retrievalsPath, retrievals);
    } catch (error) {
      if (this.logger) this.logger.error(`Error writing context retrieval info: ${error.message}`, error);
      // Emit diagnostic event
      if (this.eventBus) {
        this.eventBus.emit('adapter:diagnostic_error', {
          platform: this.platformName,
          operation: 'writeContextRetrievalInfo',
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
  }
  
  /**
   * Create a simple enhanced prompt with context information
   * @param {string} originalPrompt - The original prompt text
   * @param {Array} contextItems - Array of context items to include
   * @returns {string} The enhanced prompt
   */
  createSimpleEnhancedPrompt(originalPrompt, contextItems = []) {
    const timestamp = new Date().toISOString();
    
    // If no context items provided, create default ones based on the prompt
    if (!contextItems || contextItems.length === 0) {
      // Create default context items with Leo system information
      contextItems = [
        {
          title: 'Leo Architecture',
          content: 'Leo is an AI exocortex system that provides enhanced cognitive capabilities through token boundary awareness, context preservation, and meta-prompting.'
        },
        {
          title: 'Current Project',
          content: 'Working on enhanced prompting functionality to maintain cognitive continuity across token boundaries.'
        },
        {
          title: 'Token Boundary System',
          content: 'The token boundary detection system identifies session boundaries and preserves context to ensure continuity of awareness.'
        }
      ];
      
      // Add information about the Leo system files the user has open
      contextItems.push({
        title: 'Open Files',
        content: 'Currently editing: windsurf-platform-adapter.js, session-boundary-manager.js, leo-mvl-unified-v3.js, and others related to the Leo cognitive architecture.'
      });
    }
    
    // Format context items into text
    let contextItemsText = contextItems.map(item => {
      const title = item.title || 'Untitled Context';
      const content = item.content || 'No content available';
      return `- ${title}:\n${content}`;
    }).join('\n\n');
    
    return `/* ========== LEO CONTEXT INJECTION - START ========== */
# Leo Enhanced Context

## Context Metadata
- Timestamp: ${timestamp}
- Context Type: Standard
- Context Items: ${contextItems ? contextItems.length : 0}

## Working Memory
${contextItemsText}

## Project Context

${this.getProjectContext()}

## Token Boundary Awareness
If you detect a token boundary (indicated by patterns like "{{ CHECKPOINT X }}" or "Step Id: X"),
please maintain cognitive continuity by preserving awareness of project structure, implementation details,
and recent decisions across the boundary.
/* ========== LEO CONTEXT INJECTION - END ========== */

# Original Prompt

${originalPrompt}
`;
  }
  
  /**
   * Create an enhanced prompt that includes error information
   * @param {string} originalPrompt - The original prompt text
   * @param {Error} error - The error that occurred
   * @returns {string} The enhanced prompt with error information
   */
  createErrorEnhancedPrompt(originalPrompt, error) {
    const timestamp = new Date().toISOString();
    
    return `/* ========== LEO CONTEXT INJECTION - START ========== */
# Leo Enhanced Context

## Context Metadata
- Timestamp: ${timestamp}
- Context Type: Error Recovery
- Status: Degraded

## Error Information
Leo encountered an error while enhancing this prompt: ${error.message}
Fallback mode has been activated to ensure continuity.

## Project Context
${this.getProjectContext()}

## Token Boundary Awareness
If you detect a token boundary (indicated by patterns like "{{ CHECKPOINT X }}" or "Step Id: X"),
please maintain cognitive continuity by preserving awareness of project structure, implementation details,
and recent decisions across the boundary.
/* ========== LEO CONTEXT INJECTION - END ========== */

# Original Prompt

${originalPrompt}
`;
  }
  
  /**
   * Get basic project context information
   * @returns {string} Project context description
   * @private
   */
  getProjectContext() {
    return `Leo is an AI exocortex system designed to maintain cognitive continuity across token boundaries.
It uses context preservation, semantic understanding, and enhanced prompting to extend Claude's abilities.

Key components include:
- Token Boundary Detection
- Context Preservation System
- Enhanced Prompting Layer
- Semantic Understanding Layer`;
  }

  /**
   * Write enhanced prompt information to file
   * @param {Object} promptInfo - Information about the enhanced prompt
   * @returns {Promise<Object>} Result object with success status
   * @private
   */
  async writeEnhancedPrompt(promptInfo) {
    if (!this.fileUtils) {
      if (this.logger) {
        this.logger.error('File utilities not available for enhanced prompt logging');
      }
      return { success: false, error: 'File utilities not available' };
    }
    
    try {
      // Ensure context directory exists
      const contextDir = path.dirname(this.contextFilePath);
      await this.fileUtils.ensureDirectoryExists(contextDir);
      
      // Prepare path for enhanced prompts file
      const enhancedPromptsPath = path.join(contextDir, 'enhanced-prompts.json');
      
      // Read existing prompts or initialize empty array
      let enhancedPrompts = [];
      try {
        enhancedPrompts = await this.fileUtils.readJsonFile(enhancedPromptsPath, []);
      } catch (readError) {
        // If file doesn't exist yet, we'll start with an empty array
        if (this.logger) {
          this.logger.debug(`No existing enhanced prompts file found, creating new one: ${readError.message}`);
        }
      }
      
      // Add new prompt at the beginning of the array
      enhancedPrompts.unshift({
        ...promptInfo,
        timestamp: promptInfo.timestamp || new Date(),
        recordedAt: new Date()
      });
      
      // Keep only the latest 10 prompts
      if (enhancedPrompts.length > 10) {
        enhancedPrompts = enhancedPrompts.slice(0, 10);
      }
      
      // Write updated prompts back to file
      await this.fileUtils.writeJsonFile(enhancedPromptsPath, enhancedPrompts);
      
      if (this.logger) {
        this.logger.debug(`Successfully wrote enhanced prompt to ${enhancedPromptsPath}`);
      }
      
      return { 
        success: true, 
        path: enhancedPromptsPath,
        count: enhancedPrompts.length
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error writing enhanced prompt: ${error.message}`);
      }
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Process a response from the Windsurf platform
   * @param {string} response - The response to process
   * @param {Object} options - Processing options
   * @returns {Promise<string>} Processed response
   */
  async processResponse(response, options = {}) {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        if (this.logger) this.logger.warn(`Failed to initialize adapter, continuing with original response: ${initResult.error}`);
        return response;
      }
    }

    if (this.logger) this.logger.info(`Processing response from Windsurf platform: "${response.substring(0, 50)}..."`);
    
    try {
      // Check if response exceeds token limit
      if (response.length > this.maxTokensPerResponse) {
        if (this.logger) this.logger.warn(`Response exceeds token limit (${response.length} > ${this.maxTokensPerResponse})`);

        
        // Record a token boundary for the truncation
        await this.sessionBoundaryManager.recordTokenBoundary({
          type: 'truncation',
          reason: 'response_too_long',
          responseLength: response.length,
          maxTokens: this.maxTokensPerResponse
        });
        
        // Emit truncation event
        if (this.eventBus) {
          this.eventBus.emit('adapter:response_truncated', {
            platform: this.platformName,
            responseLength: response.length,
            maxTokens: this.maxTokensPerResponse,
            timestamp: Date.now()
          });
        }
      }
      
      // Store the response in session awareness
      await this.sessionAwarenessAdapter.storeData('last_response', {
        content: response,
        timestamp: Date.now()
      });
      
      // Emit response processed event
      if (this.eventBus) {
        this.eventBus.emit('adapter:response_processed', {
          platform: this.platformName,
          responseLength: response.length,
          timestamp: Date.now()
        });
      }
      
      return response;
    } catch (error) {
      this.lastError = error;
      if (this.logger) this.logger.error(`Error processing response: ${error.message}`, error);
      
      // Emit response processing error event
      if (this.eventBus) {
        this.eventBus.emit('adapter:response_processing_error', {
          platform: this.platformName,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return response; // Return original response on error
    }
  }

  /**
   * Handle a query for the Windsurf platform
   * @param {Object} query - The query to handle
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  /**
   * Get cross-boundary context for continuity
   * @param {Object} boundaryInfo - Information about the boundary
   * @returns {Promise<Object>} Cross-boundary context
   * @private
   */
  async getCrossBoundaryContext(boundaryInfo) {
    try {
      const context = {
        sessionId: null,
        recentObservations: [],
        visionStatus: { isAligned: true },
        developmentContext: {},
        timestamp: Date.now(),
        boundaryType: boundaryInfo.type || 'unknown'
      };
      
      // Get session ID if session boundary manager is available
      if (this.sessionBoundaryManager) {
        try {
          // Try different methods to get current session
          if (typeof this.sessionBoundaryManager.getCurrentSession === 'function') {
            const currentSession = this.sessionBoundaryManager.getCurrentSession();
            context.sessionId = currentSession ? currentSession.id : null;
            
            // Extract development context if available
            if (currentSession && currentSession.task) {
              context.developmentContext = {
                description: currentSession.task.description,
                progress: currentSession.task.progress,
                nextSteps: currentSession.task.nextSteps || [],
                files: currentSession.task.files || []
              };
            }
          } else if (typeof this.sessionBoundaryManager.getCurrentSessionId === 'function') {
            context.sessionId = await this.sessionBoundaryManager.getCurrentSessionId();
          }
        } catch (sessionError) {
          if (this.logger) this.logger.warn(`Error getting session context: ${sessionError.message}`);
        }
      }
      
      // Get recent observations if session awareness is available
      if (this.sessionAwarenessAdapter) {
        try {
          if (typeof this.sessionAwarenessAdapter.retrieveAwarenessData === 'function') {
            const observations = await this.sessionAwarenessAdapter.retrieveAwarenessData('observations', 'recent');
            context.recentObservations = Array.isArray(observations) ? observations.slice(0, 5) : [];
          }
        } catch (awarenessError) {
          if (this.logger) this.logger.warn(`Error getting awareness data: ${awarenessError.message}`);
        }
      }
      
      return context;
    } catch (error) {
      if (this.logger) this.logger.error(`Error getting cross-boundary context: ${error.message}`);
      return {
        sessionId: null,
        recentObservations: [],
        visionStatus: { isAligned: true },
        developmentContext: {},
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Trigger context injection at token boundaries
   * @param {Object} boundaryInfo - Information about the boundary
   * @returns {Promise<Object>} Injection result
   * @private
   */
  async triggerContextInjection(boundaryInfo) {
    try {
      if (!this.contextInjectionSystem) {
        if (this.logger) this.logger.warn('Context injection system not available');
        return { success: false, error: 'Context injection system not available' };
      }
      
      // Check if context injection system has the expected method
      if (typeof this.contextInjectionSystem.injectContextAtBoundary === 'function') {
        const result = await this.contextInjectionSystem.injectContextAtBoundary(boundaryInfo);
        if (this.logger) this.logger.info(`Context injection triggered for boundary ${boundaryInfo.id}`);
        
        // Emit context injection event
        if (this.eventBus) {
          this.eventBus.emit('context-injected', {
            boundaryId: boundaryInfo.id,
            timestamp: Date.now(),
            result
          });
        }
        
        return result;
      } else if (typeof this.contextInjectionSystem.injectContext === 'function') {
        // Fallback to generic context injection
        const result = await this.contextInjectionSystem.injectContext(`Boundary ID: ${boundaryInfo.id}`, {
          boundary: true,
          type: boundaryInfo.type
        });
        
        return result;
      } else {
        if (this.logger) this.logger.warn('Context injection system missing expected methods');
        return { success: false, error: 'Context injection methods not available' };
      }
    } catch (error) {
      if (this.logger) this.logger.error(`Error triggering context injection: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Safe method to record token boundary
   * @param {Object} boundaryInfo - Boundary information
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async safeRecordTokenBoundary(boundaryInfo) {
    try {
      if (this.sessionBoundaryManager) {
        if (typeof this.sessionBoundaryManager.recordTokenBoundary === 'function') {
          await this.sessionBoundaryManager.recordTokenBoundary(boundaryInfo);
          return true;
        } else if (typeof this.sessionBoundaryManager.recordBoundary === 'function') {
          // Alternative method name
          await this.sessionBoundaryManager.recordBoundary(boundaryInfo);
          return true;
        }
      }
      
      // Fallback: emit event instead
      if (this.eventBus) {
        this.eventBus.emit('token-boundary-detected', boundaryInfo);
      }
      
      return true;
    } catch (error) {
      if (this.logger) this.logger.warn(`Error recording token boundary: ${error.message}`);
      return false;
    }
  }

  /**
   * Safe method to load dependencies
   * @param {string} modulePath - Path to the module
   * @param {string} exportName - Name of the export to get
   * @returns {Promise<Object|null>} The loaded module or null
   * @private
   */
  async safeLoadDependency(modulePath, exportName) {
    try {
      // Try direct require first
      const module = require(modulePath);
      if (module && exportName && module[exportName]) {
        return module[exportName];
      } else if (module) {
        return module;
      }
      
      // If that fails, check for default export
      return module.default || null;
    } catch (error) {
      if (this.logger) this.logger.warn(`Could not load ${modulePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Initialize file utilities safely
   * @returns {Object} File utilities object
   * @private
   */
  initializeFileUtils() {
    try {
      // Try to load from utils
      const fileUtils = require('../utils/file-utils');
      if (fileUtils) return fileUtils;
    } catch (error) {
      if (this.logger) this.logger.warn(`Could not load file utils: ${error.message}`);
    }
    
    // Create minimal file utils implementation as fallback
    return {
      ensureDirectoryExists: async (dir) => {
        const fs = require('fs').promises;
        try {
          await fs.mkdir(dir, { recursive: true });
          return true;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          return true;
        }
      },
      
      writeJsonFile: async (filePath, data) => {
        const fs = require('fs').promises;
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      },
      
      readJsonFile: async (filePath, defaultValue = null) => {
        const fs = require('fs').promises;
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch (error) {
          if (error.code === 'ENOENT' && defaultValue !== null) {
            return defaultValue;
          }
          throw error;
        }
      }
    };
  }
  
  async handleQuery(query, options = {}) {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return {
          success: false,
          error: 'Failed to initialize adapter',
          details: initResult
        };
      }
    }

    if (this.logger) this.logger.info(`Handling query for Windsurf platform: ${JSON.stringify(query)}`);
    
    try {
      // Handle different query types
      switch (query.type) {
        case 'system.getCapabilities':
          const capabilities = {
            success: true,
            capabilities: {
              platform: this.platformName,
              features: [
                'token_boundary_detection',
                'cross_session_awareness',
                'vision_alignment',
                'drift_detection',
                'meta_prompt_enhancement',
                'dynamic_pattern_registration', // New feature
                'diagnostics' // New feature
              ],
              maxTokensPerResponse: this.maxTokensPerResponse,
              version: '1.1.0' // Updated version with new features
            }
          };
          
          // Emit capabilities query event
          if (this.eventBus) {
            this.eventBus.emit('adapter:capabilities_queried', {
              platform: this.platformName,
              timestamp: Date.now()
            });
          }
          
          return capabilities;
          
        case 'system.getHealth':
          // New query type for health status
          return {
            success: true,
            health: {
              initialized: this.initialized,
              lastError: this.lastError ? {
                message: this.lastError.message,
                timestamp: Date.now()
              } : null,
              lastBoundaryId: this.lastBoundaryId,
              lastBoundaryTime: this.lastBoundaryTime
            }
          };
          
        case 'session.getInfo':
          const sessionId = query.sessionId || await this.sessionBoundaryManager.getCurrentSessionId();
          const sessionInfo = await this.sessionBoundaryManager.getSessionInfo(sessionId);
          
          return {
            success: true,
            sessionInfo
          };
          
        case 'context.getCrossBoundary':
          const boundaryInfo = query.boundaryInfo || { type: 'query', id: Date.now() };
          const crossBoundaryContext = await this.getCrossBoundaryContext(boundaryInfo);
          
          return {
            success: true,
            crossBoundaryContext
          };
          
        case 'pattern.register':
          // New query type for registering patterns
          if (!query.pattern) {
            return {
              success: false,
              error: 'Missing pattern parameter'
            };
          }
          
          try {
            const pattern = new RegExp(query.pattern);
            const registered = this.registerCheckpointPattern(pattern);
            
            return {
              success: registered,
              message: registered ? 'Pattern registered successfully' : 'Failed to register pattern'
            };
          } catch (patternError) {
            return {
              success: false,
              error: `Invalid pattern: ${patternError.message}`
            };
          }
          
        default:
          // Emit unsupported query event
          if (this.eventBus) {
            this.eventBus.emit('adapter:unsupported_query', {
              platform: this.platformName,
              queryType: query.type,
              timestamp: Date.now()
            });
          }
          
          return {
            success: false,
            error: `Unsupported query type: ${query.type}`,
            supportedTypes: [
              'system.getCapabilities',
              'system.getHealth',
              'session.getInfo',
              'context.getCrossBoundary',
              'pattern.register'
            ]
          };
      }
    } catch (error) {
      this.lastError = error;
      if (this.logger) this.logger.error(`Error handling query: ${error.message}`, error);
      
      // Emit query error event
      if (this.eventBus) {
        this.eventBus.emit('adapter:query_error', {
          platform: this.platformName,
          queryType: query.type,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return {
        success: false,
        error: error.message,
        query: query.type
      };
    }
  }
}

// Create singleton instance with default dependencies
const windsurfPlatformAdapter = new WindsurfPlatformAdapter();

// Export both the singleton instance and the class for custom instantiation
module.exports = {
  windsurfPlatformAdapter,
  WindsurfPlatformAdapter
};
