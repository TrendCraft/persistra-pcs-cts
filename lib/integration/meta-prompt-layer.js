/**
 * Meta-Prompt Layer
 * 
 * Provides a layer that enhances LLM prompts with Leo's awareness.
 * This component transforms standard prompts into Leo-aware prompts
 * that maintain cognitive continuity across token boundaries.
 * 
 * @module lib/integration/meta-prompt-layer
 * @author Leo Development Team
 * @created May 13, 2025
 */

// Component name for event bus registration
const COMPONENT_NAME = 'meta-prompt-layer';

// Dependencies will be injected during initialization
let logger;
let eventBus;
let sessionAwarenessAdapter;
let contextInjectionSystem;
let contextPreservationSystem;
let visionAnchor;
let metaCognitiveLayer;

/**
 * Meta-Prompt Layer
 * 
 * Enhances LLM prompts with Leo's awareness
 */
class MetaPromptLayer {
  constructor() {
    this.initialized = false;
    this._initPromise = null;
    this.promptTemplates = new Map();
    this.defaultTemplate = 'standard';
  }

  /**
   * Initialize the Meta-Prompt Layer with injected dependencies
   * 
   * @param {Object} injectedDependencies - Dependencies to inject
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(injectedDependencies = {}, options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      if (this.initialized) {
        if (logger) logger.info('Meta-Prompt Layer already initialized');
        return { success: true, message: 'Already initialized' };
      }

      try {
        // Set up dependencies from injection or fallbacks
        logger = injectedDependencies.logger || require('../utils/logger').createComponentLogger(COMPONENT_NAME);
        eventBus = injectedDependencies.eventBus || require('../utils/event-bus');
        sessionAwarenessAdapter = injectedDependencies.sessionAwarenessAdapter || require('../adapters/session-awareness-adapter');
        contextInjectionSystem = injectedDependencies.contextInjectionSystem || require('./context-injection-system');
        contextPreservationSystem = injectedDependencies.contextPreservationSystem || require('../services/context-preservation-system');
        visionAnchor = injectedDependencies.visionAnchor || require('../services/vision-anchor');
        metaCognitiveLayer = injectedDependencies.metaCognitiveLayer || require('../services/meta-cognitive-layer');
        
        logger.info('Initializing Meta-Prompt Layer with injected dependencies');

        try {
          // Initialize dependencies
          if (sessionAwarenessAdapter && typeof sessionAwarenessAdapter.initialize === 'function') {
            await sessionAwarenessAdapter.initialize();
          }
          
          if (contextInjectionSystem && typeof contextInjectionSystem.initialize === 'function') {
            await contextInjectionSystem.initialize();
          }
          
          if (visionAnchor && typeof visionAnchor.initialize === 'function') {
            await visionAnchor.initialize();
          }
          
          if (metaCognitiveLayer && typeof metaCognitiveLayer.initialize === 'function') {
            await metaCognitiveLayer.initialize();
          }
          
          // Register prompt templates
          this.registerPromptTemplates();
          
          this.initialized = true;
          logger.info('Meta-Prompt Layer initialized successfully');
          
          // Emit initialization event
          if (eventBus && typeof eventBus.emit === 'function') {
            eventBus.emit('meta-prompt-layer:initialized', {
              timestamp: Date.now()
            }, COMPONENT_NAME);
          }
          
          return { success: true, message: 'Initialized successfully' };
        } catch (innerError) {
          logger.error(`Failed to initialize Meta-Prompt Layer dependencies: ${innerError.message}`);
          throw new Error(`Meta-Prompt Layer dependency initialization failed: ${innerError.message}`);
        }
      } catch (outerError) {
        logger.error(`Failed to set up Meta-Prompt Layer: ${outerError.message}`);
        return { success: false, error: outerError.message };
      }
    })();

    return this._initPromise;
  }

  /**
   * Enhance a prompt with preserved context
   * 
   * @param {string} prompt - Original prompt
   * @param {Array|Object} contextItems - Context items to include or options object
   * @returns {Promise<string>} Enhanced prompt
   */
  async enhancePrompt(prompt, contextItems = []) {
    if (!this.initialized) {
      logger.warn('Meta-Prompt Layer not initialized, returning original prompt', { component: COMPONENT_NAME });
      return this.createBasicEnhancedPrompt(prompt);
    }
    
    try {
      // Handle different parameter patterns for backward compatibility
      let context = null;
      let options = {};
      
      // If second parameter is an array, it's context items
      if (Array.isArray(contextItems)) {
        context = contextItems;
        options = {};
      }
      if ((!context || (Array.isArray(context) && context.length === 0))) {
        try {
          // Try multiple approaches to get context
          if (this.contextPreservationSystem && typeof this.contextPreservationSystem.retrieveContext === 'function') {
            const retrievalResult = await this.contextPreservationSystem.retrieveContext();
            if (retrievalResult && retrievalResult.success) {
              context = retrievalResult.context;
            }
          } else if (this.contextInjectionSystem) {
            // Try different methods to get context from the injection system
            if (typeof this.contextInjectionSystem.getContextItems === 'function') {
              context = await this.contextInjectionSystem.getContextItems(prompt);
            } else if (typeof this.contextInjectionSystem.getContext === 'function') {
              context = await this.contextInjectionSystem.getContext(prompt);
            } else if (this.contextInjectionSystem.contextItems) {
              // Direct access to contextItems if available
              context = this.contextInjectionSystem.contextItems;
            }
          }
        } catch (retrievalError) {
          logger.warn(`Error retrieving context: ${retrievalError.message}`, { component: COMPONENT_NAME });
        }
      }
      
      // If still no context, create some default items
      if (!context || (Array.isArray(context) && context.length === 0)) {
        // Default context about Leo system
        context = [
          {
            title: 'Leo Architecture',
            content: 'Leo is an AI exocortex system that provides enhanced cognitive capabilities through token boundary awareness, context preservation, and meta-prompting.'
          },
          {
            title: 'Token Boundary System',
            content: 'The token boundary detection system identifies session boundaries and preserves context to ensure continuity of awareness.'
          },
          {
            title: 'Current Project',
            content: 'Working on enhanced prompting functionality to maintain cognitive continuity across token boundaries.'
          }
        ];
      }
      
      // Format context for injection
      let formattedContext = '';
      if (context) {
        if (typeof context === 'string') {
          formattedContext = context;
        } else if (Array.isArray(context)) {
          formattedContext = context.map(item => {
            const title = item.title || 'Untitled';
            const content = item.content || (typeof item === 'string' ? item : JSON.stringify(item, null, 2));
            return `### ${title}\n${content}`;
          }).join('\n\n');
        } else {
          formattedContext = JSON.stringify(context, null, 2);
        }
      }
      
      // If we still don't have context, create a basic prompt
      if (!formattedContext) {
        logger.warn('No context available for prompt enhancement', { component: COMPONENT_NAME });
        return this.createBasicEnhancedPrompt(prompt);
      }
      
      // Select template
      const templateName = options.template || this.defaultTemplate;
      const templateFn = this.promptTemplates.get(templateName) || this.promptTemplates.get(this.defaultTemplate);
      
      if (!templateFn) {
        logger.warn(`Template '${templateName}' not found, using basic format`, { component: COMPONENT_NAME });
        return this.createBasicEnhancedPrompt(prompt, formattedContext);
      }
      
      // Apply template
      const enhancedPrompt = await templateFn(prompt, {
        formattedContext,
        preservedContext: context,
        options
      });
      
      // Emit event
      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('meta-prompt-layer:prompt-enhanced', {
          timestamp: Date.now(),
          templateName,
          originalLength: prompt.length,
          enhancedLength: enhancedPrompt.length
        }, COMPONENT_NAME);
      }
      
      return enhancedPrompt;
    } catch (error) {
      logger.error(`Error enhancing prompt: ${error.message}`, { component: COMPONENT_NAME });
      return this.createBasicEnhancedPrompt(prompt);
    }
  }

  /**
   * Create a basic enhanced prompt with context
   * For use as a fallback when templates or normal enhancement fails
   * 
   * @param {string} prompt - Original prompt
   * @param {string} context - Optional context to include
   * @returns {string} Enhanced prompt
   */
  createBasicEnhancedPrompt(prompt, context = '') {
    const timestamp = new Date().toISOString();
    
    // If no context provided, create default context about Leo
    if (!context) {
      const defaultContextItems = [
        {
          title: 'Leo Architecture',
          content: 'Leo is an AI exocortex system that provides enhanced cognitive capabilities through token boundary awareness, context preservation, and meta-prompting.'
        },
        {
          title: 'Token Boundary System',
          content: 'The token boundary detection system identifies session boundaries and preserves context to ensure continuity of awareness.'
        },
        {
          title: 'Current Project',
          content: 'Working on enhanced prompting functionality to maintain cognitive continuity across token boundaries.'
        },
        {
          title: 'Open Files',
          content: 'Currently editing: windsurf-platform-adapter.js, session-boundary-manager.js, leo-mvl-unified-v3.js, and files related to the Leo cognitive architecture.'
        }
      ];
      
      // Format the default context items
      context = defaultContextItems.map(item => {
        return `- ${item.title}:\n${item.content}`;
      }).join('\n\n');
    }
    
    return `/* ========== LEO CONTEXT INJECTION - START ========== */
# Leo Enhanced Context

## Context Metadata
- Timestamp: ${timestamp}
- Context Type: Standard
- Context Items: 4

## Working Memory

## Project Context

${context}



## Token Boundary Awareness
If you detect a token boundary (indicated by patterns like "{{ CHECKPOINT X }}" or "Step Id: X"),
please maintain cognitive continuity by preserving awareness of project structure, implementation details,
and recent decisions across the boundary.
/* ========== LEO CONTEXT INJECTION - END ========== */

# Original Prompt

${prompt}`;
  }
  
  /**
   * Inject preserved context into a response
   * 
   * @param {string} response - Original response
   * @param {Object} options - Processing options
   * @returns {Promise<string>} Processed response
   */
  async processResponse(response, options = {}) {
    if (!this.initialized) {
      logger.warn('Meta-Prompt Layer not initialized, returning original response');
      return response;
    }
    
    try {
      // Process response with meta-cognitive layer if available
      if (metaCognitiveLayer && typeof metaCognitiveLayer.processResponse === 'function') {
        const processedResponse = await metaCognitiveLayer.processResponse(response, options);
        return processedResponse;
      }
      
      return response;
    } catch (error) {
      logger.error(`Error processing response: ${error.message}`);
      return response;
    }
  }
  
  /**
   * Inject preserved context into a prompt
   * 
   * @param {string} prompt - Original prompt
   * @param {Object} context - Context to inject
   * @returns {Promise<string>} Enhanced prompt with injected context
   */
  async injectPreservedContext(prompt, context) {
    if (!this.initialized) {
      logger.warn('Meta-Prompt Layer not initialized, returning original prompt');
      return prompt;
    }
    
    try {
      // Format context if needed
      const formattedContext = typeof context === 'string' 
        ? context 
        : JSON.stringify(context, null, 2);
      
      // Use standard template for injection
      return `
/* Preserved Context */
${formattedContext}
/* End Preserved Context */

${prompt}
`;
    } catch (error) {
      logger.error(`Error injecting preserved context: ${error.message}`);
      return prompt;
    }
  }
  
  /**
   * Register all prompt templates
   */
  registerPromptTemplates() {
    // Standard template - balanced approach with explicit context markers
    this.registerPromptTemplate('standard', async (prompt, context) => {
      let template = '';
      
      // Add Leo version and timestamp header
      template += `
/* ========== LEO CONTEXT INJECTION - START ========== */
# Leo Enhanced Context

## Context Metadata
- Timestamp: ${new Date().toISOString()}
- Context Type: Standard
- Context Items: ${context.contextCount || 'Unknown'}
`;
      
      // Add session information if available
      if (context.sessionInfo) {
        template += `- Session ID: ${context.sessionInfo.id || 'Unknown'}
- Session Start: ${context.sessionInfo.startTime ? new Date(context.sessionInfo.startTime).toISOString() : 'Unknown'}
`;
      }
      
      // Add working memory section with explicit markers
      template += `
## Working Memory

${context.formattedContext}
`;
      
      // Add token boundary awareness instructions
      template += `
## Token Boundary Awareness
If you detect a token boundary (indicated by patterns like "{{ CHECKPOINT X }}" or "Step Id: X"),
please maintain cognitive continuity by preserving awareness of project structure, implementation details,
and recent decisions across the boundary.
/* ========== LEO CONTEXT INJECTION - END ========== */

`;
      
      // Add the original prompt with a clear separator
      template += `# Original Prompt

${prompt}
`;
      
      return template;
    });
    
    // Minimal template - less intrusive
    this.registerPromptTemplate('minimal', async (prompt, context) => {
      return `
/* Project Context */
${context.formattedContext}
/* End Project Context */

${prompt}
`;
    });
    
    // Comprehensive template - full awareness
    this.registerPromptTemplate('comprehensive', async (prompt, context) => {
      // Get additional awareness information
      const visionSummary = await visionAnchor.getVisionSummary();
      const trajectory = await metaCognitiveLayer.getDevelopmentTrajectory();
      const sessionState = await sessionAwarenessAdapter.getSessionState();
      
      return `
/* Project Context */
${context.formattedContext}

/* Project Awareness */
Vision: ${visionSummary.summary.split('\n')[0]}
Trajectory: ${trajectory.direction || 'Unknown'} direction, ${trajectory.consistency || 'Unknown'} consistency
Session: ${sessionState && sessionState.previousSessionId ? 'Continuing from previous session' : 'New session'}
/* End Project Awareness */

${prompt}
`;
    });
    
    // Vision-focused template - emphasizes project vision
    this.registerPromptTemplate('vision-focused', async (prompt, context) => {
      // Get additional vision information
      const visionSummary = await visionAnchor.getVisionSummary();
      
      return `
/* Project Context */
${context.formattedContext}

/* Vision Principles */
${visionSummary.principles.map((p, i) => `${i+1}. ${p.name}: ${p.description}`).join('\n')}
/* End Vision Principles */

${prompt}
`;
    });
    
    // Meta-cognitive template - emphasizes insights and patterns
    this.registerPromptTemplate('metacognitive-focused', async (prompt, context) => {
      // Get additional meta-cognitive information
      const insights = await metaCognitiveLayer.getRecentInsights({ limit: 3 });
      
      return `
/* Project Context */
${context.formattedContext}

/* Development Insights */
${insights.map((i, index) => `${index+1}. ${i.description}`).join('\n')}
/* End Development Insights */

${prompt}
`;
    });
    
    // Cognitive continuity template - maintains awareness across token boundaries
    this.registerPromptTemplate('cognitive-continuity', async (prompt, context) => {
      let template = '';
      
      // Add preserved context marker if available
      if (context.preservedContext) {
        template += `
/* ========== LEO COGNITIVE CONTINUITY MARKER - START ========== */
# Context from Leo

${JSON.stringify(context.preservedContext, null, 2)}
`;
        
        // Add a human-readable summary section
        template += `
## Context Summary

${context.preservedContext.summary || 'No summary available'}
`;
        
        if (context.preservedContext.criticalElements && Array.isArray(context.preservedContext.criticalElements)) {
          template += `
## Critical Elements

${context.preservedContext.criticalElements.map(element => `- **${element.key}**: ${element.value}`).join('\n')}
`;
        }
        
        if (context.preservedContext.userObjectives) {
          template += `
## User Objectives

${context.preservedContext.userObjectives}
`;
        }
        
        if (context.preservedContext.sessionState) {
          template += `
## Session State

${context.preservedContext.sessionState}
`;
        }
        
        // Add token boundary marker
        if (context.boundaryInfo) {
          template += `
## Token Boundary Information

- Boundary ID: ${context.boundaryInfo.id || 'Unknown'}
- Timestamp: ${new Date(context.boundaryInfo.timestamp || Date.now()).toISOString()}
- Type: ${context.boundaryInfo.type || 'Standard'}
`;
        }
        
        template += `
/* ========== LEO COGNITIVE CONTINUITY MARKER - END ========== */

`;
      }
      
      // Add current context with improved formatting
      template += `
/* ========== LEO PROJECT CONTEXT - START ========== */
${context.formattedContext}
/* ========== LEO PROJECT CONTEXT - END ========== */

# Original Prompt

${prompt}
`;
      
      return template;
    });
  }

  /**
   * Register a prompt template
   * 
   * @param {string} name - The name of the template
   * @param {Function} template - The template function
   */
  registerPromptTemplate(name, template) {
    this.promptTemplates.set(name, template);
    
    logger.debug(`Registered prompt template: ${name}`);
  }

  /**
   * Format context as markdown
   * 
   * @param {Object} context - The context to format
   * @returns {string} Markdown-formatted context
   */
  formatContextAsMarkdown(context) {
    try {
      let markdown = `## Project Context\n\n`;
      
      // Handle case where contextItems might not exist or not be iterable
      if (!context || !context.contextItems || !Array.isArray(context.contextItems)) {
        logger.warn('Context is missing or malformed:', { context });
        return markdown + "No context items available. This may indicate an issue with context retrieval.\n\n";
      }
      
      // Check if we have any context items
      if (context.contextItems.length === 0) {
        logger.warn('Empty context items array');
        return markdown + "No context items were found for this query.\n\n";
      }
      
      // Format each context item
      let hasValidContent = false;
      for (const item of context.contextItems) {
        if (!item) continue;
        
        const title = item.title || 'Untitled';
        const type = item.type || 'unknown';
        const id = item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const priority = item.priority || 0;
        const content = item.content || 'No content available';
        
        // Skip items with no real content
        if (content === 'No content available' || content === 'No context available') {
          continue;
        }
        
        markdown += `### ${title} (${type})\n\n`;
        markdown += `${content}\n\n`;
        hasValidContent = true;
      }
      
      // If no valid content was found
      if (!hasValidContent) {
        logger.warn('No valid content in context items');
        return markdown + "Context items were found but contained no valid content.\n\n";
      }
      
      return markdown;
    } catch (error) {
      logger.error(`Error formatting context as markdown: ${error.message}`, error);
      return "## Project Context\n\nError formatting context: " + error.message + "\n\n";
    }
  }

  /**
   * Enhance a prompt with Leo's awareness
   * 
   * @param {string} prompt - The original prompt
   * @param {Object} options - Options for prompt enhancement
   * @returns {Object} The enhanced prompt
   */
  async enhancePrompt(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!prompt) {
      throw new Error('Invalid prompt: prompt cannot be empty');
    }
    
    logger.info(`Enhancing prompt with Leo's awareness`);
    
    try {
      // Check for preserved context from previous sessions
      let preservedContext = null;
      try {
        const preservedData = await sessionAwarenessAdapter.retrieveData('preserved_context');
        if (preservedData && preservedData.preservedContext) {
          preservedContext = preservedData.preservedContext;
          logger.info('Retrieved preserved context from previous session');
        }
      } catch (preservedError) {
        logger.warn(`Error retrieving preserved context: ${preservedError.message}`);
      }
      
      // Generate context for the prompt
      const contextOptions = {
        strategy: options.contextStrategy || 'standard',
        format: options.contextFormat || 'markdown'
      };
      
      // Get context and handle potential errors
      let context = { success: false, contextItems: [], contextCount: 0 };
      try {
        // Use different methods to get context items depending on what's available
        if (this.contextInjectionSystem) {
          if (typeof this.contextInjectionSystem.getContextItems === 'function') {
            const items = await this.contextInjectionSystem.getContextItems(prompt, contextOptions);
            if (items && Array.isArray(items)) {
              context.contextItems = items;
              context.contextCount = items.length;
              context.success = true;
            }
          } else if (typeof this.contextInjectionSystem.getContext === 'function') {
            const result = await this.contextInjectionSystem.getContext(prompt, contextOptions);
            if (result) {
              context = result;
              if (!context.contextItems) context.contextItems = [];
            }
          }
        }
      } catch (contextError) {
        logger.error(`Error getting context: ${contextError.message}`, contextError);
        context = { success: false, contextItems: [], contextCount: 0, error: contextError.message };
      }
      
      // Format context as markdown
      context.formattedContext = this.formatContextAsMarkdown(context);
      
      // Add preserved context if available
      if (preservedContext) {
        context.preservedContext = preservedContext;
        
        // If cognitive continuity template is available and not explicitly overridden, use it
        if (this.promptTemplates.has('cognitive-continuity') && !options.template) {
          options.template = 'cognitive-continuity';
          logger.info('Using cognitive continuity template for preserved context');
        }
      }
      
      // Select template
      const templateName = options.template || this.defaultTemplate;
      const template = this.promptTemplates.get(templateName);
      
      if (!template) {
        logger.warn(`Prompt template not found: ${templateName}, using default`);
        const defaultTemplate = this.promptTemplates.get(this.defaultTemplate);
        return await defaultTemplate(prompt, context);
      }
      
      // Apply template
      const enhancedPrompt = await template(prompt, context);
      
      // Record this prompt enhancement in session awareness
      await sessionAwarenessAdapter.storeData('last_prompt_enhancement', {
        timestamp: new Date(),
        originalPrompt: prompt,
        template: templateName,
        contextStrategy: contextOptions.strategy,
        hasPreservedContext: !!preservedContext
      });
      
      return {
        timestamp: new Date(),
        originalPrompt: prompt,
        enhancedPrompt,
        template: templateName,
        contextStrategy: contextOptions.strategy,
        contextCount: context.contextItems ? context.contextItems.length : 0,
        hasPreservedContext: !!preservedContext
      };
    } catch (error) {
      logger.error(`Prompt enhancement failed: ${error.message}`, error);
      throw new Error(`Prompt enhancement failed: ${error.message}`);
    }
  }

  /**
   * Get the enhanced prompt text
   * 
   * @param {string} prompt - The original prompt
   * @param {Object} options - Options for prompt enhancement
   * @returns {string} The enhanced prompt text
   */
  async getEnhancedPromptText(prompt, options = {}) {
    const result = await this.enhancePrompt(prompt, options);
    return result.enhancedPrompt;
  }

  /**
   * Inject preserved context from previous sessions
   * 
   * @param {Object} preservedContext - The preserved context to inject (optional)
   * @param {string} prompt - The original prompt (optional)
   * @param {Object} options - Options for prompt enhancement
   * @returns {Object} The enhanced prompt or status object
   */
  async injectPreservedContext(preservedContext = null, prompt = '', options = {}) {
    if (!this.initialized) {
      try {
        await this.initialize();
      } catch (error) {
        logger.error(`Failed to initialize Meta-Prompt Layer: ${error.message}`);
        return { success: false, error: `Initialization failed: ${error.message}` };
      }
    }
    
    logger.info('Injecting preserved context into cognitive continuity system');
    
    try {
      // If preservedContext is not provided, try to retrieve it
      if (!preservedContext) {
        if (!contextPreservationSystem) {
          throw new Error('Context Preservation System not available');
        }
        
        // Check if the system is initialized
        if (typeof contextPreservationSystem.isInitialized === 'function' && !contextPreservationSystem.isInitialized()) {
          logger.warn('Context Preservation System not initialized, attempting to initialize');
          try {
            await contextPreservationSystem.initialize();
          } catch (initError) {
            logger.error(`Failed to initialize Context Preservation System: ${initError.message}`);
          }
        }
        
        // Retrieve preserved context
        const result = await contextPreservationSystem.restoreContext();
        
        if (!result || !result.success) {
          logger.warn(`Failed to restore context: ${result ? result.error : 'Unknown error'}`);
          return { 
            success: false, 
            error: result ? result.error : 'Failed to restore context', 
            prompt: prompt || null 
          };
        }
        
        preservedContext = result.context;
      }
      
      if (!preservedContext) {
        logger.warn('No preserved context available for injection');
        return { success: false, error: 'No preserved context available', prompt: prompt || null };
      }
      
      logger.info(`Successfully retrieved preserved context (${JSON.stringify(preservedContext).length} bytes)`);
      
      // Store preserved context in session awareness for future use if available
      if (sessionAwarenessAdapter && typeof sessionAwarenessAdapter.storeData === 'function') {
        try {
          await sessionAwarenessAdapter.storeData('preserved_context', {
            timestamp: new Date(),
            preservedContext: preservedContext
          });
          logger.debug('Preserved context stored in session awareness');
        } catch (storeError) {
          logger.warn(`Failed to store preserved context in session awareness: ${storeError.message}`);
        }
      }
      
      // Register cognitive continuity template if not already registered
      if (!this.promptTemplates.has('cognitive-continuity')) {
        this.registerCognitiveContTemplate();
      }
      
      // Set options to use cognitive continuity template
      options.template = options.template || 'cognitive-continuity';
      options.preservedContext = preservedContext;
      
      // Emit event for context injection
      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('meta-prompt-layer:context-injected', {
          timestamp: new Date(),
          contextType: 'preserved',
          sessionId: preservedContext.sessionMetadata ? preservedContext.sessionMetadata.sessionId : 'unknown',
          contextSize: JSON.stringify(preservedContext).length
        }, COMPONENT_NAME);
      }
      
      // If prompt is provided, enhance it with the preserved context
      if (prompt) {
        return await this.enhancePrompt(prompt, options);
      }
      
      // Otherwise, just return success status
      return {
        success: true,
        message: 'Preserved context injected successfully',
        contextSize: JSON.stringify(preservedContext).length
      };
    } catch (error) {
      logger.error(`Error injecting preserved context: ${error.message}`);
      return { success: false, error: `Context injection failed: ${error.message}` };
    }
  }
  
  /**
   * Register a cognitive continuity template
   * 
   * @param {string} name - The name of the template (defaults to 'cognitive-continuity')
   * @param {Function} template - Custom template function (optional)
   */
  registerCognitiveContTemplate(name = 'cognitive-continuity', template = null) {
    if (template) {
      this.registerPromptTemplate(name, template);
    } else if (!this.promptTemplates.has(name)) {
      // Register default cognitive continuity template if not already registered
      this.registerPromptTemplate(name, async (prompt, context) => {
        let template = '';
        
        // Add preserved context marker if available
        if (context.preservedContext) {
          template += `
/* COGNITIVE CONTINUITY MARKER */
The following context was preserved from a previous session to maintain cognitive continuity:

${context.preservedContext.summary || ''}
`;
          
          if (context.preservedContext.criticalElements && Array.isArray(context.preservedContext.criticalElements)) {
            template += `
Critical Elements:
${context.preservedContext.criticalElements.map(element => `- ${element.key}: ${element.value}`).join('\n')}
`;
          }
          
          if (context.preservedContext.userObjectives) {
            template += `
User Objectives:
${context.preservedContext.userObjectives}
`;
          }
          
          if (context.preservedContext.sessionState) {
            template += `
Session State: ${context.preservedContext.sessionState}
`;
          }
          
          template += `/* END COGNITIVE CONTINUITY MARKER */

`;
        }
        
        // Add current context
        template += `
/* Project Context */
${context.formattedContext}

${prompt}
`;
        
        return template;
      });
    }
    
    logger.info(`Cognitive continuity template registered as '${name}'`);
  }

  /**
   * Register preserved context from an external source
   * 
   * @param {Object} preservedContext - The preserved context from previous sessions
   * @returns {Promise<Object>} Result of the injection operation
   */
  async registerExternalPreservedContext(preservedContext) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!preservedContext) {
      return {
        success: false,
        error: 'Invalid preserved context: context cannot be empty'
      };
    }
    
    logger.info(`Injecting preserved context from previous session`);
    
    try {
      // Register a new cognitive continuity template if it doesn't exist
      if (!this.promptTemplates.has('cognitive-continuity')) {
        this.registerPromptTemplate('cognitive-continuity', async (prompt, context) => {
          return `
/* IMPORTANT: YOUR PREVIOUS COGNITIVE STATE */
You are continuing a conversation across token boundaries. The following represents your previous understanding and cognitive state from before the token boundary. This is NOT external information - this is your own previous knowledge and understanding that you should integrate into your current thinking.

${context.preservedContext ? JSON.stringify(context.preservedContext, null, 2) : 'No preserved context available'}
/* END PREVIOUS COGNITIVE STATE */

${prompt}
`;
        });
        
        logger.info('Registered cognitive continuity template');
      }
      
      // Store the preserved context for use in templates
      await sessionAwarenessAdapter.storeData('preserved_context', {
        timestamp: new Date(),
        preservedContext
      });
      
      // Set the default template to cognitive-continuity for the next prompt
      this.defaultTemplate = 'cognitive-continuity';
      
      // Emit event for successful injection
      eventBus.emit('meta-prompt-layer:context-injected', {
        timestamp: new Date(),
        size: JSON.stringify(preservedContext).length
      });
      
      return {
        success: true,
        timestamp: new Date(),
        message: 'Preserved context injected successfully'
      };
    } catch (error) {
      logger.error(`Preserved context injection failed: ${error.message}`, error);
      
      return {
        success: false,
        error: `Preserved context injection failed: ${error.message}`
      };
    }
  }
}

// Create singleton instance
const metaPromptLayer = new MetaPromptLayer();

// Export the singleton instance directly
module.exports = metaPromptLayer;
