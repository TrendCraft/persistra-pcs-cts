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
const { metaPromptLayer: defaultMetaPromptLayer } = require('../integration/meta-prompt-layer');
const { contextInjectionSystem: defaultContextInjectionSystem } = require('../integration/context-injection-system');
const { ensureDirectoryExists, writeJsonFile, readJsonFile } = require('../utils/file-utils');

// Create logger
const logger = createComponentLogger('windsurf-platform-adapter');

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
    maxTokensPerResponse = 8192,
    contextFilePath = path.join(process.cwd(), 'data', 'context', 'windsurf-context.json')
  } = {}) {
    this.initialized = false;
    this.platformName = 'windsurf';
    this.sessionBoundaryManager = sessionBoundaryManager;
    this.sessionAwarenessAdapter = sessionAwarenessAdapter;
    this.metaPromptLayer = metaPromptLayer;
    this.contextInjectionSystem = contextInjectionSystem;
    
    // Enhanced checkpoint patterns to detect various formats with improved coverage
    this.checkpointPatterns = [
      // Standard formats
      /{{ CHECKPOINT[\s]*(\d+)[\s]*}}/, // Standard format with flexible spacing
      /CHECKPOINT[\s-]*(\d+)/, // Alternative format
      /Checkpoint ID:?[\s]*(\d+)/, // Explicit ID format with optional colon;
  // Windsurf-specific formats
      /Step Id:?[\s]*(\d+)/, // Windsurf step ID format
      /Step[\s-]*(\d+)/, // Simple step format;
  // Token boundary explicit markers
      /Token Boundary[\s-]*(\d+)/, // Explicit token boundary format
      /Boundary ID:?[\s]*(\d+)/, // Boundary ID format;
  // System message indicators (likely token boundaries)
      /EPHEMERAL_MESSAGE/, // Ephemeral message indicator
      /<EPHEMERAL_MESSAGE>/, // Tagged ephemeral message
      /SYSTEM:?[\s]*CHECKPOINT[\s]*(\d+)/, // System checkpoint message;
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
    
    try {
      // Get injected dependencies or use existing ones
      const logger = injectedDependencies.logger || this.logger || createComponentLogger('windsurf-platform-adapter');
      const eventBus = injectedDependencies.eventBus || this.eventBus || require('../utils/event-bus').eventBus;
      
      // Store dependencies for later use
      this.logger = logger;
      this.eventBus = eventBus;
      
      // Log initialization
      if (this.logger) {
        this.logger.info('Initializing Windsurf Platform Adapter');
      } else {
        console.log('No logger provided to Windsurf platform adapter');
      }
      
      // Check if we should skip dependency checks (for testing)
      const skipDependencyChecks = injectedDependencies.skipDependencyChecks === true;
      
      // Verify required dependencies
      if (!this.sessionBoundaryManager && !skipDependencyChecks) {
        try {
          this.sessionBoundaryManager = injectedDependencies.sessionBoundaryManager || 
            require('../integration/session-boundary-manager').sessionBoundaryManager;
          
          if (this.logger) {
            this.logger.info('Session boundary manager loaded successfully');
          }
        }
  } catch (depError) {
          if (this.logger) {
            this.logger.warn(`Failed to load session boundary manager: ${depError.message}`);
          }
        }
      }
      
      if (!this.sessionAwarenessAdapter && !skipDependencyChecks) {
        try {
          this.sessionAwarenessAdapter = injectedDependencies.sessionAwarenessAdapter || 
            require('../integration/session-awareness-adapter').sessionAwarenessAdapter;
          
          if (this.logger) {
            this.logger.info('Session awareness adapter loaded successfully');
          }
        }
  } catch (depError) {
          if (this.logger) {
            this.logger.warn(`Failed to load session awareness adapter: ${depError.message}`);
          }
        }
      }
      
      // Try to load context injection system if not provided
      if (!this.contextInjectionSystem && !skipDependencyChecks) {
        try {
          this.contextInjectionSystem = injectedDependencies.contextInjectionSystem || 
            require('../integration/context-injection-system').contextInjectionSystem;
          
          if (this.logger) {
            this.logger.info('Context injection system loaded successfully');
          }
        }
  } catch (depError) {
          if (this.logger) {
            this.logger.warn(`Failed to load context injection system: ${depError.message}`);
          }
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
    }
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
    if (!this.initialized) return;
    
    try {
      if (this.logger) {
        this.logger.info(`Handling token boundary: ${JSON.stringify(boundaryInfo)}`);
      }
      
      // Record the boundary
      this.lastBoundaryId = boundaryInfo.id;
      this.lastBoundaryTime = Date.now();
      
      // Emit event for other components
      if (this.eventBus) {
        this.eventBus.emit('windsurf:boundary-detected', boundaryInfo);
      }
    }
  } catch (error) {
      if (this.logger) {
        this.logger.error(`Error handling token boundary: ${error.message}`);
      }
    }
  }
  
  /**
   * Handle context injection events
   * @param {Object} injectionInfo - Information about the injected context
   * @private
   */
  async handleContextInjection(injectionInfo) {
    if (!this.initialized) return;
    
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
    }
  } catch (error) {
      if (this.logger) {
        this.logger.error(`Error handling context injection: ${error.message}`);
      }
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
  }`);
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
      /Checkpoint ID:?[\s]*(\d+)/, // Explicit ID format with optional colon;
  // Windsurf-specific formats
      /Step Id:?[\s]*(\d+)/, // Windsurf step ID format
      /Step[\s-]*(\d+)/, // Simple step format;
  // Token boundary explicit markers
      /Token Boundary[\s-]*(\d+)/, // Explicit token boundary format
      /Boundary ID:?[\s]*(\d+)/, // Boundary ID format;
  // System message indicators (likely token boundaries)
      /EPHEMERAL_MESSAGE/, // Ephemeral message indicator
      /<EPHEMERAL_MESSAGE>/, // Tagged ephemeral message
      /SYSTEM:?[\s]*CHECKPOINT[\s]*(\d+)/, // System checkpoint message;
  // Memory-related patterns (often indicate token boundaries)
      /MEMORIES are being retrieved/, // Memory retrieval indicator
      /<MEMORY\[.*?\]>/, // Memory tag;
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
  detectTokenBoundary(prompt) {
    // Initialize if not already initialized
    if (!this.initialized) {
      try {
        this.initialize({ skipDependencyChecks: true, enableTokenBoundaryDetection: true });
      } catch (error) {
        this.handleBoundaryError(error);
        return { success: false, error: error.message };
      }
    }
  } catch (error) {
        if (this.logger) {
          this.logger.warn(`Failed to initialize during token boundary detection: ${error.message}`);
        } else {
          console.warn(`Failed to initialize during token boundary detection: ${error.message}`);
        }
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
        }
  } catch (error) {
          if (this.logger) this.logger.warn(`Failed to write checkpoint detection: ${error.message}`);
        }
        
        // Trigger context injection if available
        this.triggerContextInjection({
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
    }
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
    }
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
  
  // Emit boundary error event
    if (this.eventBus) {
      this.eventBus.emit('adapter:boundary_error', {
        };
        await this.handleTokenBoundary(implicitBoundaryInfo);
      }
      // Handle explicit token boundary if detected
      else if (boundaryInfo.detected) {
        await this.handleTokenBoundary(boundaryInfo);
      }
      // For continuing sessions without boundary, still inject context periodically
      else if (Date.now() - (this.lastContextInjection || 0) > 300000) { // 5 minutes
        if (this.logger) this.logger.info('Periodic context injection for continuing session');
        await this.contextInjectionSystem.injectContext(prompt, {
          strategy: 'minimal',
          periodic: true
        });
        this.lastContextInjection = Date.now();
      }
      
      // Use meta-prompt layer to enhance the prompt
      const enhancedPromptResult = await this.metaPromptLayer.enhancePrompt(prompt, {
        platform: this.platformName,
        boundaryInfo,
        isNewSession,
        ...options
      });
      
      // Write enhanced prompt to file for debugging
      await this.writeEnhancedPrompt({
        timestamp: new Date(),
        originalPrompt: prompt.substring(0, 200),
        enhancedPrompt: enhancedPromptResult.enhancedPrompt.substring(0, 500),
        template: enhancedPromptResult.template,
        contextCount: enhancedPromptResult.contextCount,
        boundaryDetected: boundaryInfo.detected,
        isNewSession
      });
      
      // Emit prompt enhancement event
      if (this.eventBus) {
        this.eventBus.emit('adapter:prompt_enhanced', {
          platform: this.platformName,
          timestamp: Date.now(),
          originalLength: prompt.length,
          enhancedLength: enhancedPromptResult.enhancedPrompt.length,
          boundaryDetected: boundaryInfo.detected,
          isNewSession
        });
      }
      
      return enhancedPromptResult.enhancedPrompt;
    }
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
   * @private
   */
  async writeCheckpointDetection(detectionInfo) {
    try {
      const contextDir = path.dirname(this.contextFilePath);
      await ensureDirectoryExists(contextDir);
      
      const detectionsPath = path.join(contextDir, 'checkpoint-detections.json');
      const detections = await readJsonFile(detectionsPath, []);
      
      // Add new detection and keep only the last 10
      detections.unshift(detectionInfo);
      if (detections.length > 10) {
        detections.length = 10;
      }
      
      await writeJsonFile(detectionsPath, detections);
    }
  } catch (error) {
      if (this.logger) this.logger.error(`Error writing checkpoint detection: ${error.message}`, error);
      // Emit diagnostic event instead of failing silently
      if (this.eventBus) {
        this.eventBus.emit('adapter:diagnostic_error', {
          platform: this.platformName,
          operation: 'writeCheckpointDetection',
          error: error.message,
          timestamp: Date.now()
        });
      }
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
    }
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
   * Write enhanced prompt information to file
   * @param {Object} promptInfo - Information about the enhanced prompt
   * @private
   */
  async writeEnhancedPrompt(promptInfo) {
    try {
      const contextDir = path.dirname(this.contextFilePath);
      await ensureDirectoryExists(contextDir);
      
      const enhancedPromptsPath = path.join(contextDir, 'enhanced-prompts.json');
      const enhancedPrompts = await readJsonFile(enhancedPromptsPath, []);
      
      // Add new prompt and keep only the last 10
      enhancedPrompts.unshift(promptInfo);
      if (enhancedPrompts.length > 10) {
        enhancedPrompts.length = 10;
      }
      
      await writeJsonFile(enhancedPromptsPath, enhancedPrompts);
    }
  } catch (error) {
      if (this.logger) this.logger.error(`Error writing enhanced prompt: ${error.message}`, error);
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
    }
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
          }
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
