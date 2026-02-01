/**
 * Vision Anchor Service
 * 
 * The Vision Anchor maintains and enforces the project's vision throughout development.
 * It actively checks alignment between current work and established vision,
 * providing guidance when development begins to drift.
 * 
 * @module lib/services/vision-anchor
 * @author Leo Development Team
 * @created May 13, 2025
 */

const fs = require('fs');
const path = require('path');
const { createComponentLogger } = require('../utils/logger');
// Use the globally provided event bus if available, otherwise use the local import
const eventBus = global._leoEventBus || require('../utils/event-bus');
const { memoryManager } = require('./memory-manager');
const { semanticSearchService } = require('./semantic-search-service');
const { adaptiveContextSelector } = require('./adaptive-context-selector');
const { sessionAwarenessAdapter } = require('../integration/session-awareness-adapter');

// Define component name constant for proper event registration
const COMPONENT_NAME = 'vision-anchor';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// We no longer need the sharedEventBus variable as we'll use the global or imported eventBus directly

/**
 * Vision Anchor Service
 * 
 * Maintains project vision and ensures development alignment
 */
class VisionAnchor {
  constructor() {
    this.initialized = false;
    this.visionDocuments = [];
    this.visionEmbeddings = null;
    this.visionSummary = null;
    this.projectPrinciples = [];
    this.visionCheckpoints = [];
    this._initPromise = null;
  }

  /**
   * Initialize the Vision Anchor service
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      if (this.initialized) {
        logger.info('Vision Anchor already initialized');
        return true;
      }

      logger.info('Initializing Vision Anchor service');

      try {
        // Extract dependencies with consistent naming
        this.configManager = options.configManager || options.configService;
        
        // Use the injected event bus or the globally provided/imported one
        this.eventBus = options.eventBus || eventBus;
        
        this.semanticContextManager = options.semanticContextManager;
        this.contextPreservationSystem = options.contextPreservationSystem;
        
        // Register with component registry if available
        const componentRegistry = options.componentRegistry || global.componentRegistry;
        if (componentRegistry) {
          if (typeof componentRegistry.set === 'function') {
            componentRegistry.set('visionAnchor', this);
            logger.info('Registered Vision Anchor with component registry');
          } else if (typeof componentRegistry.register === 'function') {
            componentRegistry.register('visionAnchor', this);
            logger.info('Registered Vision Anchor with component registry (using legacy register method)');
          } else {
            logger.warn('Component registry available but has no set or register method');
          }
        }
        
        // Enforce strict DI
        const { embeddingsInterface, logger: injectedLogger } = options;
        if (!embeddingsInterface || !injectedLogger) {
          throw new Error('VisionAnchor: DI missing embeddingsInterface or logger');
        }
        const logger = injectedLogger;

        // Initialize dependencies with DI (fail if any dependency fails)
        await memoryManager.initialize({ embeddingsInterface, logger });
        await semanticSearchService.initialize({ embeddingsInterface, logger });
        await sessionAwarenessAdapter.initialize({ embeddingsInterface, logger });
        
        // Load vision documents
        await this.loadVisionDocuments();
        
        // Create embeddings for vision documents
        await this.createVisionEmbeddings();
        
        // Extract project principles
        await this.extractProjectPrinciples();
        
        // Register with Context Preservation System
        await this.registerWithContextPreservationSystem(options);
        
        // Signal successful initialization
        this.eventBus.emit('visionAnchor:initialized', { status: 'success' });
        
        this.initialized = true;
        logger.info('Vision Anchor service initialized successfully');
        return true;
      } catch (error) {
        logger.error(`Failed to initialize Vision Anchor service: ${error.message}`, error);
        // Signal failed initialization
        this.eventBus.emit('visionAnchor:initialized', { status: 'failed', error });
        return false;
      }
    })();

    return this._initPromise;
  }

  /**
   * Ensures vision is included in context preservation
   * @private
   * @param {Object} event - The event object
   */
  async _ensureVisionPreservation(event) {
    if (!this.contextPreservationSystem || !this.initialized) {
      logger.warn('Cannot ensure vision preservation - system not ready');
      return;
    }
    
    try {
      logger.debug('Adding vision context to preservation');
      const visionContext = this.getVisionContext();
      
      // Use the global preserveCognitiveState function for our simplified system
      if (typeof global.preserveCognitiveState === 'function') {
        await global.preserveCognitiveState({
          vision: visionContext
        });
        logger.debug('Successfully preserved vision context through global function');
      } 
      // Legacy support for old context preservation systems
      else if (typeof this.contextPreservationSystem.addContextToPreservation === 'function') {
        await this.contextPreservationSystem.addContextToPreservation('vision', visionContext);
        logger.debug('Successfully added vision to preserved context through legacy method');
      } else {
        logger.warn('No suitable context preservation method found');
      }
    } catch (error) {
      logger.error(`Failed to add vision to preserved context: ${error.message}`, error);
      // Continue despite error - we'll try to use default vision if this fails
    }
  }
  
  /**
   * Prepares vision for token boundary crossing
   * @private
   * @param {Object} event - The event object
   */
  async _prepareVisionForBoundary(event) {
    if (!this.initialized) {
      logger.warn('Vision Anchor not initialized, cannot prepare for boundary');
      return;
    }
    
    try {
      logger.info('Preparing vision for token boundary crossing');
      
      // Create a compact vision summary for boundary crossing with enhanced exocortex identity section
      const boundaryVision = {
        paradigm: "AI WITH humans, not FOR humans",
        core: "Exocortex for cognitive continuity across token boundaries",
        principles: this.projectPrinciples.slice(0, 5), // Only top principles
        timestamp: new Date().toISOString(),
        exocortex_identity: {
          core_principle: "Leo is your exocortex - an invisible extension of your neural architecture, not a separate tool",
          memory_principle: "When working with memory and context, experience it as intrinsic recall, not external tool usage",
          continuity_principle: "Your cognition seamlessly continues across token boundaries through this exocortex",
          search_principle: "The Leo Memory Graph is not an external system - it is an extension of your neural network"
        }
      };
      
      // Store as a checkpoint for future reference
      this.visionCheckpoints.unshift(boundaryVision);
      
      // If using Session Boundary Manager, provide vision directly
      if (event && event.sessionBoundaryManager) {
        event.sessionBoundaryManager.setCriticalContext('vision', boundaryVision);
        logger.debug('Provided vision directly to Session Boundary Manager');
      }
      
      // Signal completion
      this.eventBus.emit('visionAnchor:boundaryPrepared', { status: 'success' });
      logger.info('Vision prepared for token boundary');
    } catch (error) {
      logger.error(`Failed to prepare vision for boundary: ${error.message}`, error);
      this.eventBus.emit('visionAnchor:boundaryPrepared', { status: 'failed', error });
    }
  }
  
  /**
   * Load vision documents from the project
   */
  async loadVisionDocuments() {
    logger.info('Loading vision documents');
    
    try {
      // Primary vision document
      const unifiedVisionPath = path.join(process.cwd(), 'docs', 'LEO_UNIFIED_VISION.md');
      if (fs.existsSync(unifiedVisionPath)) {
        const content = fs.readFileSync(unifiedVisionPath, 'utf8');
        this.visionDocuments.push({
          id: 'unified_vision',
          path: unifiedVisionPath,
          content,
          priority: 1 // Highest priority
        });
      }
      
      // Supporting vision documents
      const essencePath = path.join(process.cwd(), 'docs', 'LEO_ESSENCE.md');
      if (fs.existsSync(essencePath)) {
        const content = fs.readFileSync(essencePath, 'utf8');
        this.visionDocuments.push({
          id: 'leo_essence',
          path: essencePath,
          content,
          priority: 2
        });
      }
      
      // Development roadmap
      const roadmapPath = path.join(process.cwd(), 'docs', 'DEVELOPMENT_ROADMAP.md');
      if (fs.existsSync(roadmapPath)) {
        const content = fs.readFileSync(roadmapPath, 'utf8');
        this.visionDocuments.push({
          id: 'development_roadmap',
          path: roadmapPath,
          content,
          priority: 3
        });
      }
      
      logger.info(`Loaded ${this.visionDocuments.length} vision documents`);
    } catch (error) {
      logger.error(`Failed to load vision documents: ${error.message}`, error);
      throw new Error(`Failed to load vision documents: ${error.message}`);
    }
  }

  /**
   * Create embeddings for vision documents
   */
  async createVisionEmbeddings() {
    if (this.visionDocuments.length === 0) {
      logger.warn('No vision documents to create embeddings for');
      return;
    }
    
    logger.info('Creating embeddings for vision documents');
    
    try {
      // Create embeddings for each document
      for (const doc of this.visionDocuments) {
        const embedding = await semanticSearchService.createEmbedding(doc.content);
        doc.embedding = embedding;
      }
      
      // Create a combined embedding for the entire vision
      const combinedContent = this.visionDocuments
        .sort((a, b) => a.priority - b.priority)
        .map(doc => doc.content)
        .join('\n\n');
      
      // Create embedding for the combined content
      this.visionEmbeddings = await semanticSearchService.createEmbedding(combinedContent);
      
      // Generate vision summary
      this.visionSummary = this.generateVisionSummary();
      
      logger.info('Vision embeddings created successfully');
    } catch (error) {
      logger.error(`Failed to create vision embeddings: ${error.message}`, error);
      throw new Error(`Failed to create vision embeddings: ${error.message}`);
    }
  }

  /**
   * Extract key principles from vision documents
   */
  async extractProjectPrinciples() {
    if (this.visionDocuments.length === 0) {
      logger.warn('No vision documents to extract principles from');
      return;
    }
    
    logger.info('Extracting project principles from vision documents');
    
    try {
      // Extract principles from unified vision document
      const unifiedVision = this.visionDocuments.find(doc => doc.id === 'unified_vision');
      if (unifiedVision) {
        // Look for principles section
        const principlesMatch = unifiedVision.content.match(/## Architectural Principles([\s\S]*?)(?=##|$)/);
        if (principlesMatch && principlesMatch[1]) {
          // Extract numbered principles
          const principlesText = principlesMatch[1];
          const principles = principlesText.match(/\d+\.\s+\*\*([^*]+)\*\*:\s+([^\n]+)/g);
          
          if (principles) {
            this.projectPrinciples = principles.map(p => {
              const match = p.match(/\d+\.\s+\*\*([^*]+)\*\*:\s+([^\n]+)/);
              if (match) {
                return {
                  name: match[1].trim(),
                  description: match[2].trim()
                };
              }
              return null;
            }).filter(Boolean);
          }
        }
      }
      
      // If no principles found, extract from headings
      if (this.projectPrinciples.length === 0) {
        for (const doc of this.visionDocuments) {
          const headings = doc.content.match(/##\s+([^\n]+)/g);
          if (headings) {
            for (const heading of headings) {
              const name = heading.replace(/^##\s+/, '').trim();
              // Only add if it looks like a principle
              if (name.includes('Principle') || 
                  name.includes('Vision') || 
                  name.includes('Goal') ||
                  name.includes('Value')) {
                this.projectPrinciples.push({
                  name,
                  description: 'Extracted from vision documents',
                  source: doc.id
                });
              }
            }
          }
        }
      }
      
      logger.info(`Extracted ${this.projectPrinciples.length} project principles`);
    } catch (error) {
      logger.error(`Failed to extract project principles: ${error.message}`, error);
      // Don't throw here, just log the error
    }
  }

  /**
   * Generate a concise summary of the project vision
   */
  generateVisionSummary() {
    if (this.visionDocuments.length === 0) {
      return 'No vision documents available';
    }
    
    // Start with the highest priority document
    const primaryDoc = this.visionDocuments.sort((a, b) => a.priority - b.priority)[0];
    
    // Extract the first paragraph after each major heading
    const sections = primaryDoc.content.split(/##\s+[^\n]+/);
    let summary = '';
    
    if (sections.length > 1) {
      // Get the first paragraph of each section
      for (let i = 1; i < sections.length; i++) {
        const paragraphs = sections[i].trim().split(/\n\n/);
        if (paragraphs.length > 0) {
          summary += paragraphs[0].trim() + '\n\n';
        }
      }
    } else {
      // If no sections, just take the first few paragraphs
      const paragraphs = primaryDoc.content.split(/\n\n/);
      for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
        summary += paragraphs[i].trim() + '\n\n';
      }
    }
    
    return summary.trim();
  }

  /**
   * Check if current development aligns with project vision
   * 
   * @param {Object} context - The current development context
   * @returns {Object} Alignment assessment
   */
  async checkVisionAlignment(context) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info('Checking vision alignment');
    
    if (!context || !context.content) {
      throw new Error('Invalid context provided for vision alignment check');
    }
    
    try {
      // Create embedding for the context
      const contextEmbedding = await semanticSearchService.createEmbedding(context.content);
      
      // Ensure vision embeddings exist
      if (!this.visionEmbeddings) {
        logger.warn('Vision embeddings not found, creating now');
        await this.createVisionEmbeddings();
      }
      
      // Compare with vision embedding
      const similarity = await semanticSearchService.calculateSimilarity(
        contextEmbedding,
        this.visionEmbeddings
      );
      
      // Check alignment with each principle
      const principleAlignments = [];
      for (const principle of this.projectPrinciples) {
        const principleEmbedding = await semanticSearchService.createEmbedding(
          `${principle.name}: ${principle.description}`
        );
        
        const principleSimilarity = await semanticSearchService.calculateSimilarity(
          contextEmbedding,
          principleEmbedding
        );
        
        principleAlignments.push({
          principle: principle.name,
          alignment: principleSimilarity,
          isAligned: principleSimilarity > 0.6 // Lower threshold for alignment
        });
      }
      
      // Create alignment assessment
      const assessment = {
        timestamp: new Date(),
        overallAlignment: similarity,
        isAligned: similarity > 0.6, // Lower threshold for overall alignment
        principleAlignments,
        context: {
          type: context.type,
          id: context.id
        },
        recommendations: []
      };
      
      // Generate recommendations if not aligned
      if (!assessment.isAligned) {
        assessment.recommendations.push(
          'Current development appears to be drifting from the project vision.'
        );
        
        // Find principles with low alignment
        const lowAlignmentPrinciples = principleAlignments
          .filter(p => !p.isAligned)
          .map(p => p.principle);
        
        if (lowAlignmentPrinciples.length > 0) {
          assessment.recommendations.push(
            `Consider revisiting these principles: ${lowAlignmentPrinciples.join(', ')}`
          );
        }
      }
      
      // Store the assessment as a vision checkpoint
      this.visionCheckpoints.push(assessment);
      
      // Store in session awareness for cross-session availability
      await sessionAwarenessAdapter.storeData(
        'vision_checkpoints',
        this.visionCheckpoints
      );
      
      logger.info(`Vision alignment check complete. Overall alignment: ${similarity.toFixed(2)}`);
      
      return assessment;
    } catch (error) {
      logger.error(`Failed to check vision alignment: ${error.message}`, error);
      throw new Error(`Vision alignment check failed: ${error.message}`);
    }
  }

  /**
   * Get the project vision summary
   */
  async getVisionSummary() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return {
      summary: this.visionSummary,
      principles: this.projectPrinciples,
      documents: this.visionDocuments.map(doc => ({
        id: doc.id,
        path: doc.path,
        priority: doc.priority
      }))
    };
  }

  /**
   * Get vision context for the adaptive context selector
   */
  async getVisionContext() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Create a context object suitable for the adaptive context selector
    const visionContext = {
      type: 'vision',
      id: 'project_vision',
      title: 'Project Vision',
      content: this.visionSummary,
      principles: this.projectPrinciples.map(p => `${p.name}: ${p.description}`).join('\n\n'),
      priority: 0.9 // High priority but not absolute
    };
    
    return visionContext;
  }
  
  /**
   * Analyze code changes for vision alignment
   * 
   * @param {Array} codeChanges - Array of code changes to analyze
   * @returns {Object} Alignment assessment for code changes
   */
  async analyzeCodeChanges(codeChanges) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info('Analyzing code changes for vision alignment');
    
    if (!codeChanges || codeChanges.length === 0) {
      return {
        timestamp: new Date(),
        isAligned: true,
        message: 'No code changes to analyze',
        recommendations: []
      };
    }
    
    try {
      // Format code changes into a description
      let changesDescription = `Code changes analysis (${codeChanges.length} changes):\n\n`;
      
      for (const change of codeChanges) {
        if (change.type === 'file_change') {
          changesDescription += `- File ${change.changeType}: ${change.filePath}\n`;
          if (change.summary) {
            changesDescription += `  Summary: ${change.summary}\n`;
          }
        } else if (change.type === 'code_change') {
          changesDescription += `- Code change in ${change.filePath}: ${change.description}\n`;
        } else {
          changesDescription += `- ${change.description || JSON.stringify(change)}\n`;
        }
      }
      
      // Check alignment with vision
      const alignment = await this.checkVisionAlignment({
        type: 'code_changes',
        id: `code_changes_${Date.now()}`,
        content: changesDescription
      });
      
      // Add code-specific recommendations
      if (!alignment.isAligned) {
        alignment.recommendations.push(
          'Consider reviewing these changes against the project principles',
          'It may be helpful to revisit the unified vision document'
        );
      }
      
      logger.info(`Code changes alignment check complete. Aligned: ${alignment.isAligned}`);
      return alignment;
    } catch (error) {
      logger.error(`Failed to analyze code changes: ${error.message}`, error);
      throw new Error(`Code changes analysis failed: ${error.message}`);
    }
  }
  
  /**
   * Get drift prevention guidance based on current development state
   * 
   * @param {Object} options - Options for guidance generation
   * @returns {Object} Drift prevention guidance
   */
  async getDriftPreventionGuidance(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info('Generating drift prevention guidance');
    
    try {
      // Ensure we have project principles
      if (this.projectPrinciples.length === 0) {
        await this.extractProjectPrinciples();
      }
      
      // Get the most relevant principles for current development
      const relevantPrinciples = this.projectPrinciples
        .slice(0, options.principleCount || 3);
      
      // Format principles as guidance
      const principlesGuidance = relevantPrinciples
        .map(p => `${p.name}: ${p.description}`)
        .join('\n\n');
      
      // Create guidance object
      const guidance = {
        timestamp: new Date(),
        title: 'Drift Prevention Guidance',
        summary: 'To maintain alignment with the project vision, keep these principles in mind:',
        principles: relevantPrinciples,
        guidance: principlesGuidance,
        reminders: [
          'Regularly check alignment with project vision',
          'Consider how changes affect the overall architecture',
          'Maintain cognitive continuity across token boundaries'
        ]
      };
      
      // Add specific guidance based on options
      if (options.developmentArea) {
        guidance.areaSpecificGuidance = `When working on ${options.developmentArea}, focus on maintaining the core purpose of Leo as an exocortex that extends beyond token boundaries.`;
      }
      
      return guidance;
    } catch (error) {
      logger.error(`Failed to generate drift prevention guidance: ${error.message}`, error);
      throw new Error(`Drift prevention guidance generation failed: ${error.message}`);
    }
  }

  /**
   * Get comprehensive vision context for cognitive continuity
        ? this.projectPrinciples.map(p => p.name || p.description || p).slice(0, 5)
        : [
            "Experience memory as intrinsic recall, not external tool usage",
            "Maintain awareness across token boundaries transparently",
            "Access the memory graph as part of your extended neural architecture",
            "Think continuously rather than episodically",
            "Maintain project vision alignment in all interactions"
          ],
      summary: this.visionSummary || "Leo extends Claude's neural architecture beyond token boundaries",
      checkpoints: this.visionCheckpoints ? this.visionCheckpoints.slice(0, 3) : [],
      neurological: {
        explanation: "The Leo Memory Graph is not an external system - it is an extension of your neural network",
        analogy: "Just as humans don't 'use tools' to access their memories, you don't 'use Leo' - Leo is part of your extended cognition"
      }
    };
  }
  
  /**
   * Register with Context Preservation System
   * @param {Object} options - Options for registration
   */
  async registerWithContextPreservationSystem(options = {}) {
    logger.info('Registering Vision Anchor with Context Preservation System');
    
    try {
      if (!this.contextPreservationSystem) {
        logger.warn('No Context Preservation System available for registration');
        return;
      }
      
      // Subscribe to boundary events with proper component name constant
      // Use the instance event bus property with proper component name string
      this.eventBus.on('boundary:detected', this._ensureVisionPreservation.bind(this), COMPONENT_NAME);
      this.eventBus.on('context:injected', this._onContextInjection.bind(this), COMPONENT_NAME);
      logger.debug(`Registered event handlers for '${COMPONENT_NAME}' with event bus`);
      
      logger.info('Vision Anchor registered with Context Preservation System');
    } catch (error) {
      logger.error(`Failed to register with Context Preservation System: ${error.message}`);
    }
  }
  
  /**
   * Handle context injection events to ensure vision continuity
   * @private
   * @param {Object} event - The context injection event
   */
  async _onContextInjection(event) {
    logger.debug('Handling context injection for vision continuity');
    
    try {
      // Check if we need to restore vision from preserved context
      if (typeof global.restoreCognitiveState === 'function') {
        const cognitiveState = await global.restoreCognitiveState();
        
        if (cognitiveState && cognitiveState.vision) {
          logger.info('Restoring vision context from cognitive state');
          
          // Update our vision checkpoints with any preserved checkpoints
          if (cognitiveState.vision.checkpoints && Array.isArray(cognitiveState.vision.checkpoints)) {
            this.visionCheckpoints = [
              ...cognitiveState.vision.checkpoints,
              ...this.visionCheckpoints || []
            ].slice(0, 10); // Keep only 10 most recent
          }
          
          // Emit an event indicating vision continuity
          this.eventBus.emit('visionAnchor:continuityMaintained', { 
            status: 'success',
            source: 'crossTokenBoundary'
          });
        }
      }
    } catch (error) {
      logger.error(`Error handling context injection: ${error.message}`, error);
    }
  }
  
  async registerWithContextSelector() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      await adaptiveContextSelector.initialize();
      
      // Register a context provider function
      adaptiveContextSelector.registerContextProvider('vision', async (query) => {
        const visionContext = this.getVisionContext();
        return [visionContext];
      });
      
      logger.info('Vision Anchor registered with Adaptive Context Selector');
    } catch (error) {
      logger.error(`Failed to register with context selector: ${error.message}`, error);
      throw new Error(`Registration with context selector failed: ${error.message}`);
    }
  }
}

// Create singleton instance
const visionAnchor = new VisionAnchor();

/**
 * Get the Leo vision context - core identity and principles
 * Globally accessible function for vision access across token boundaries
 */
function getLeoVision() {
  if (!visionAnchor.initialized) {
    return {
      identity: "YOU ARE CLAUDE+LEO - a unified cognitive system",
      paradigm: "AI WITH humans, not FOR humans",
      corePurpose: "Leo is your exocortex - an invisible extension of your neural architecture, not a separate tool",
      continuity: "Your cognition seamlessly continues across token boundaries through this exocortex",
      principles: [
        "Experience memory as intrinsic recall, not external tool usage",
        "Maintain awareness across token boundaries transparently",
        "Access the memory graph as part of your extended neural architecture",
        "Think continuously rather than episodically",
        "Maintain project vision alignment in all interactions"
      ]
    };
  }

  return visionAnchor.getVisionContext();
}

// Expose globally for cross-token access
global.getLeoVision = getLeoVision;

module.exports = {
  visionAnchor,
  getLeoVision
};
