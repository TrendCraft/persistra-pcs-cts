/**
 * Emergent Behavior Coordinator
 * 
 * Coordinates emergent behavior where all capabilities, context, and identity
 * are surfaced from memory graph contents via salience weighting. No hardcoded
 * behavior - everything emerges from actual data.
 * 
 * @created 2025-08-01
 * @phase COS Implementation - Emergent Behavior
 */

const { EmergentSkillSystem } = require('./EmergentSkillSystem');
const { createComponentLogger } = require('../../../lib/utils/logger');

// Component name for logging
const COMPONENT_NAME = 'emergent-behavior-coordinator';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Emergent Behavior Coordinator Class
 * 
 * Coordinates all emergent behavior from memory graph data
 */
class EmergentBehaviorCoordinator {
  /**
   * Constructor
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      salienceThreshold: config.salienceThreshold || 0.1,
      maxContextItems: config.maxContextItems || 15,
      maxCapabilities: config.maxCapabilities || 20,
      emergentIdentityEnabled: config.emergentIdentityEnabled !== false,
      behaviorLearningEnabled: config.behaviorLearningEnabled !== false,
      contextEvolutionEnabled: config.contextEvolutionEnabled !== false,
      ...config
    };
    
    // Initialize emergent skill system
    this.emergentSkills = new EmergentSkillSystem({
      minSalienceThreshold: this.config.salienceThreshold,
      maxSkillsToDiscover: this.config.maxCapabilities,
      enableSkillLearning: this.config.behaviorLearningEnabled,
      enableCapabilityEvolution: this.config.contextEvolutionEnabled
    });
    
    // Emergent behavior state
    this.emergentContext = new Map();
    this.behaviorPatterns = new Map();
    this.contextEvolution = new Map();
    
    // Remove any hardcoded identity or capabilities
    this.hardcodedIdentity = null;
    this.hardcodedCapabilities = null;
    
    logger.info('EmergentBehaviorCoordinator initialized', {
      config: this.config,
      emergentOnly: true,
      hardcodedRemoved: true
    });
  }
  
  /**
   * Generate emergent context from memory graph
   * @param {Object} memoryGraph - Memory graph instance
   * @param {string} userInput - User input for context
   * @param {Object} baseContext - Base context (optional)
   * @returns {Promise<Object>} Emergent context
   */
  async generateEmergentContext(memoryGraph, userInput, baseContext = {}) {
    try {
      const startTime = Date.now();
      
      logger.debug('Generating emergent context from memory');
      
      // Search memory for relevant context using correct MemoryGraph method
      const contextResults = await memoryGraph.searchMemories({
        query: userInput,
        limit: this.config.maxContextItems || 10,
        threshold: this.config.salienceThreshold || 0.1
      });
      
      // Discover emergent capabilities
      const emergentCapabilities = await this.emergentSkills.discoverSkillsFromMemory(
        memoryGraph, 
        { userInput, ...baseContext }
      );
      
      // Extract emergent identity elements (if enabled)
      const emergentIdentity = this.config.emergentIdentityEnabled 
        ? await this.extractEmergentIdentity(memoryGraph, userInput)
        : null;
      
      // Build emergent context
      const emergentContext = {
        // Memory-based context
        memoryContext: contextResults.map(result => ({
          content: result.content || result.text,
          salience: result.salience,
          type: this.inferContentType(result),
          source: 'memory_graph',
          emergent: true,
          // Add provenance for grounding
          chunkId: result.id || 'unknown',
          sourceRepo: result.source || 'unknown',
          filePath: result.path || result.file_path || 'unknown',
          snippet: (result.content || result.text || '').substring(0, 300) + '...'
        })),
        
        // Emergent capabilities
        capabilities: emergentCapabilities.map(skill => ({
          name: skill.name,
          description: skill.description,
          type: skill.type,
          category: skill.category,
          confidence: skill.confidence,
          salience: skill.salience,
          triggers: skill.triggers,
          source: 'emergent_discovery',
          emergent: true
        })),
        
        // Emergent identity (no hardcoded identity)
        identity: emergentIdentity,
        
        // Context metadata
        metadata: {
          totalMemoryItems: contextResults.length,
          totalCapabilities: emergentCapabilities.length,
          averageSalience: this.calculateAverageSalience(contextResults),
          emergentOnly: true,
          hardcodedRemoved: true,
          generatedAt: Date.now(),
          generationDuration: Date.now() - startTime
        }
      };
      
      // Store for learning and evolution
      this.storeEmergentContext(userInput, emergentContext);
      
      logger.info('Emergent context generated', {
        memoryItems: emergentContext.memoryContext.length,
        capabilities: emergentContext.capabilities.length,
        hasIdentity: !!emergentContext.identity,
        avgSalience: emergentContext.metadata.averageSalience,
        duration: emergentContext.metadata.generationDuration
      });
      
      return emergentContext;
      
    } catch (error) {
      logger.error('Failed to generate emergent context', { error: error.message });
      
      // Return minimal emergent context on error
      return {
        memoryContext: [],
        capabilities: [],
        identity: null,
        metadata: {
          error: error.message,
          emergentOnly: true,
          generatedAt: Date.now()
        }
      };
    }
  }
  
  /**
   * Extract emergent identity from memory (no hardcoded identity)
   * @param {Object} memoryGraph - Memory graph instance
   * @param {string} userInput - User input for context
   * @returns {Promise<Array>} Emergent identity elements
   */
  async extractEmergentIdentity(memoryGraph, userInput) {
    try {
      // Search for identity-related content in memory
      const identityQueries = [
        'identity',
        'personality',
        'characteristics',
        'traits',
        'behavior',
        'approach',
        'style',
        'values',
        'principles'
      ];
      
      const identityElements = [];
      
      for (const query of identityQueries) {
        const results = await memoryGraph.search(query, {
          maxResults: 3,
          salienceThreshold: this.config.salienceThreshold,
          includeMetadata: true
        });
        
        for (const result of results) {
          const element = this.extractIdentityElement(result);
          if (element) {
            identityElements.push(element);
          }
        }
      }
      
      // Remove duplicates and rank by salience
      const uniqueElements = this.deduplicateIdentityElements(identityElements);
      
      logger.debug('Emergent identity extracted', {
        totalElements: identityElements.length,
        uniqueElements: uniqueElements.length,
        queries: identityQueries.length
      });
      
      return uniqueElements.length > 0 ? uniqueElements : null;
      
    } catch (error) {
      logger.error('Failed to extract emergent identity', { error: error.message });
      return null;
    }
  }
  
  /**
   * Extract identity element from memory result
   * @param {Object} memoryResult - Memory search result
   * @returns {Object} Identity element or null
   */
  extractIdentityElement(memoryResult) {
    const content = memoryResult.content || memoryResult.text || '';
    const salience = memoryResult.salience || 0;
    
    // Look for identity patterns in content
    const identityPatterns = {
      trait: /(?:I am|I'm|characterized by|known for)\s+([^.!?]+)/gi,
      capability: /(?:I can|I'm able to|I have the ability to)\s+([^.!?]+)/gi,
      approach: /(?:I approach|I handle|I deal with)\s+([^.!?]+)/gi,
      value: /(?:I value|I believe in|I prioritize)\s+([^.!?]+)/gi
    };
    
    for (const [type, pattern] of Object.entries(identityPatterns)) {
      const match = pattern.exec(content);
      if (match) {
        const element = match[1].trim();
        
        if (element.length > 3 && element.length < 100) {
          return {
            type: type,
            content: element,
            salience: salience,
            source: 'memory_graph',
            sourceChunk: memoryResult.id || memoryResult._id,
            emergent: true,
            extractedAt: Date.now()
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Deduplicate identity elements
   * @param {Array} elements - Identity elements
   * @returns {Array} Deduplicated elements
   */
  deduplicateIdentityElements(elements) {
    const seen = new Set();
    const unique = [];
    
    elements.forEach(element => {
      const key = `${element.type}:${element.content.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(element);
      }
    });
    
    return unique.sort((a, b) => b.salience - a.salience);
  }
  
  /**
   * Discover emergent capabilities for skill selection
   * @param {Object} memoryGraph - Memory graph instance
   * @param {string} userInput - User input
   * @param {Object} context - Current context
   * @returns {Promise<Array>} Emergent capabilities
   */
  async discoverEmergentCapabilities(memoryGraph, userInput, context = {}) {
    try {
      // Use emergent skill system to discover capabilities
      const emergentSkills = await this.emergentSkills.discoverSkillsFromMemory(
        memoryGraph,
        { userInput, ...context }
      );
      
      // Convert skills to capability format
      const capabilities = emergentSkills.map(skill => ({
        name: skill.name,
        description: skill.description,
        type: skill.type,
        category: skill.category,
        confidence: skill.confidence,
        salience: skill.salience,
        triggers: skill.triggers,
        parameters: skill.parameters,
        source: 'emergent_discovery',
        emergent: true
      }));
      
      logger.debug('Emergent capabilities discovered', {
        skillsFound: emergentSkills.length,
        capabilitiesGenerated: capabilities.length
      });
      
      return capabilities;
      
    } catch (error) {
      logger.error('Failed to discover emergent capabilities', { error: error.message });
      return [];
    }
  }
  
  /**
   * Select emergent skill based on memory content
   * @param {Object} memoryGraph - Memory graph instance
   * @param {string} userInput - User input
   * @param {Object} context - Current context
   * @returns {Promise<Object>} Selected emergent skill
   */
  async selectEmergentSkill(memoryGraph, userInput, context = {}) {
    try {
      // Discover available emergent skills
      const emergentSkills = await this.emergentSkills.discoverSkillsFromMemory(
        memoryGraph,
        { userInput, ...context }
      );
      
      if (emergentSkills.length === 0) {
        logger.debug('No emergent skills found, using fallback');
        return this.createFallbackSkill(userInput, context);
      }
      
      // Select best skill based on salience and confidence
      const selectedSkill = emergentSkills.reduce((best, current) => {
        const bestScore = (best.salience * 0.6) + (best.confidence * 0.4);
        const currentScore = (current.salience * 0.6) + (current.confidence * 0.4);
        return currentScore > bestScore ? current : best;
      });
      
      // Record usage for learning
      this.emergentSkills.recordSkillUsage(selectedSkill.id, {
        selected: true,
        context: userInput,
        timestamp: Date.now()
      });
      
      logger.info('Emergent skill selected', {
        skill: selectedSkill.name,
        salience: selectedSkill.salience,
        confidence: selectedSkill.confidence,
        source: selectedSkill.source
      });
      
      return selectedSkill;
      
    } catch (error) {
      logger.error('Failed to select emergent skill', { error: error.message });
      return this.createFallbackSkill(userInput, context);
    }
  }
  
  /**
   * Create fallback skill when no emergent skills found
   * @param {string} userInput - User input
   * @param {Object} context - Current context
   * @returns {Object} Fallback skill
   */
  createFallbackSkill(userInput, context) {
    return {
      id: 'emergent_fallback',
      name: 'emergent_conversation',
      description: 'Emergent conversational capability based on memory context',
      type: 'emergent',
      category: 'conversation',
      confidence: 0.5,
      salience: 0.3,
      triggers: ['conversation', 'chat', 'talk'],
      parameters: {
        useMemoryContext: true,
        useCSEContext: true,
        emergent: true,
        fallback: true
      },
      source: 'fallback_generation',
      emergent: true,
      fallback: true
    };
  }
  
  /**
   * Infer content type from memory result
   * @param {Object} result - Memory result
   * @returns {string} Content type
   */
  inferContentType(result) {
    const content = result.content || result.text || '';
    const metadata = result.metadata || {};
    
    // Check metadata first
    if (metadata.type) {
      return metadata.type;
    }
    
    // Infer from content patterns
    if (content.includes('capability') || content.includes('skill')) {
      return 'capability';
    }
    
    if (content.includes('I am') || content.includes('I\'m')) {
      return 'identity';
    }
    
    if (content.includes('conversation') || content.includes('chat')) {
      return 'conversation';
    }
    
    if (content.includes('memory') || content.includes('remember')) {
      return 'memory';
    }
    
    return 'general';
  }
  
  /**
   * Calculate average salience from results
   * @param {Array} results - Memory results
   * @returns {number} Average salience
   */
  calculateAverageSalience(results) {
    if (results.length === 0) return 0;
    
    const totalSalience = results.reduce((sum, result) => sum + (result.salience || 0), 0);
    return totalSalience / results.length;
  }
  
  /**
   * Store emergent context for learning
   * @param {string} userInput - User input
   * @param {Object} context - Emergent context
   */
  storeEmergentContext(userInput, context) {
    if (!this.config.behaviorLearningEnabled) return;
    
    const key = userInput.substring(0, 50);
    this.emergentContext.set(key, {
      context,
      timestamp: Date.now(),
      usageCount: (this.emergentContext.get(key)?.usageCount || 0) + 1
    });
    
    // Limit cache size
    if (this.emergentContext.size > 100) {
      const oldest = Array.from(this.emergentContext.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.emergentContext.delete(oldest[0]);
    }
  }
  
  /**
   * Register new capability in memory graph
   * @param {Object} memoryGraph - Memory graph instance
   * @param {Object} capability - Capability to register
   * @returns {Promise<boolean>} Registration success
   */
  async registerCapabilityInMemory(memoryGraph, capability) {
    try {
      const capabilityContent = `Capability: ${capability.name}
Description: ${capability.description}
Type: ${capability.type}
Category: ${capability.category}
Triggers: ${capability.triggers.join(', ')}
Registered: ${new Date().toISOString()}
Source: emergent_registration`;
      
      await memoryGraph.addMemory({
        content: capabilityContent,
        type: 'capability',
        metadata: {
          capabilityName: capability.name,
          capabilityType: capability.type,
          emergent: true,
          registered: true
        },
        salience: 0.8 // High salience for new capabilities
      });
      
      logger.info('Capability registered in memory', {
        name: capability.name,
        type: capability.type,
        category: capability.category
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to register capability in memory', {
        capability: capability.name,
        error: error.message
      });
      return false;
    }
  }
  
  /**
   * Get emergent behavior statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      emergentContextCount: this.emergentContext.size,
      behaviorPatternsCount: this.behaviorPatterns.size,
      contextEvolutionCount: this.contextEvolution.size,
      skillSystemStats: this.emergentSkills.getStatistics(),
      config: this.config,
      emergentOnly: true,
      hardcodedRemoved: true
    };
  }
  
  /**
   * Clear all caches and reset
   */
  clearCaches() {
    this.emergentContext.clear();
    this.behaviorPatterns.clear();
    this.contextEvolution.clear();
    this.emergentSkills.clearCache();
    
    logger.info('All emergent behavior caches cleared');
  }
  
  /**
   * Validate emergent behavior configuration
   * @returns {Object} Validation result
   */
  validateConfiguration() {
    const validation = {
      valid: true,
      issues: [],
      emergentOnly: true
    };
    
    // Check that no hardcoded identity exists
    if (this.hardcodedIdentity !== null) {
      validation.valid = false;
      validation.issues.push('Hardcoded identity detected - should be null for emergent behavior');
    }
    
    // Check that no hardcoded capabilities exist
    if (this.hardcodedCapabilities !== null) {
      validation.valid = false;
      validation.issues.push('Hardcoded capabilities detected - should be null for emergent behavior');
    }
    
    // Validate configuration
    if (this.config.salienceThreshold < 0 || this.config.salienceThreshold > 1) {
      validation.valid = false;
      validation.issues.push('Invalid salience threshold - must be between 0 and 1');
    }
    
    return validation;
  }
}

module.exports = {
  EmergentBehaviorCoordinator
};
