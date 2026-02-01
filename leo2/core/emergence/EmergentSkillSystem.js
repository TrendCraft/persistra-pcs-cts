/**
 * Emergent Skill System
 * 
 * Dynamically discovers skills and capabilities from memory graph contents
 * via salience weighting. No hardcoded skills or identity - everything emerges
 * from actual memory data.
 * 
 * @created 2025-08-01
 * @phase COS Implementation - Emergent Behavior
 */

const { createComponentLogger } = require('../../../lib/utils/logger');

// Component name for logging
const COMPONENT_NAME = 'emergent-skill-system';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Emergent Skill System Class
 * 
 * Discovers skills and capabilities dynamically from memory graph
 */
class EmergentSkillSystem {
  /**
   * Constructor
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      minSalienceThreshold: config.minSalienceThreshold || 0.1,
      maxSkillsToDiscover: config.maxSkillsToDiscover || 20,
      skillCacheTimeout: config.skillCacheTimeout || 300000, // 5 minutes
      enableSkillLearning: config.enableSkillLearning !== false,
      enableCapabilityEvolution: config.enableCapabilityEvolution !== false,
      ...config
    };
    
    // Dynamic skill cache
    this.discoveredSkills = new Map();
    this.skillCache = new Map();
    this.lastDiscoveryTime = 0;
    
    // Skill usage statistics for learning
    this.skillUsageStats = new Map();
    this.capabilityEvolution = new Map();
    
    logger.info('EmergentSkillSystem initialized', {
      config: this.config
    });
  }
  
  /**
   * Discover skills dynamically from memory graph
   * @param {Object} memoryGraph - Memory graph instance
   * @param {Object} context - Current context
   * @returns {Promise<Array>} Discovered skills
   */
  async discoverSkillsFromMemory(memoryGraph, context = {}) {
    try {
      const startTime = Date.now();
      
      // Check cache first
      const cacheKey = this.generateCacheKey(context);
      if (this.shouldUseCachedSkills(cacheKey)) {
        logger.debug('Using cached skill discovery');
        return this.skillCache.get(cacheKey);
      }
      
      logger.debug('Discovering skills from memory graph');
      
      // Search for skill-related content in memory
      const skillQueries = [
        'capability',
        'skill',
        'ability',
        'function',
        'tool',
        'method',
        'technique',
        'approach',
        'strategy',
        'process'
      ];
      
      const discoveredSkills = [];
      
      for (const query of skillQueries) {
        const results = await memoryGraph.search(query, {
          maxResults: 10,
          salienceThreshold: this.config.minSalienceThreshold,
          includeMetadata: true
        });
        
        for (const result of results) {
          const skill = await this.extractSkillFromMemoryChunk(result, context);
          if (skill && this.isValidSkill(skill)) {
            discoveredSkills.push(skill);
          }
        }
      }
      
      // Search for context-specific capabilities
      if (context.userInput) {
        const contextResults = await this.discoverContextualSkills(
          memoryGraph, 
          context.userInput, 
          context
        );
        discoveredSkills.push(...contextResults);
      }
      
      // Remove duplicates and rank by salience
      const uniqueSkills = this.deduplicateAndRankSkills(discoveredSkills);
      
      // Limit to max skills
      const finalSkills = uniqueSkills.slice(0, this.config.maxSkillsToDiscover);
      
      // Cache results
      this.skillCache.set(cacheKey, finalSkills);
      this.lastDiscoveryTime = Date.now();
      
      const duration = Date.now() - startTime;
      
      logger.info('Skills discovered from memory', {
        totalFound: discoveredSkills.length,
        uniqueSkills: uniqueSkills.length,
        finalSkills: finalSkills.length,
        duration,
        queries: skillQueries.length
      });
      
      return finalSkills;
      
    } catch (error) {
      logger.error('Failed to discover skills from memory', { error: error.message });
      return [];
    }
  }
  
  /**
   * Extract skill definition from memory chunk
   * @param {Object} memoryChunk - Memory chunk containing skill info
   * @param {Object} context - Current context
   * @returns {Promise<Object>} Extracted skill or null
   */
  async extractSkillFromMemoryChunk(memoryChunk, context) {
    try {
      const content = memoryChunk.content || memoryChunk.text || '';
      const metadata = memoryChunk.metadata || {};
      const salience = memoryChunk.salience || 0;
      
      // Analyze content for skill patterns
      const skillPatterns = {
        capability: /(?:can|able to|capability to|skill in)\s+([^.!?]+)/gi,
        function: /(?:function|method|tool)\s+(?:for|to)\s+([^.!?]+)/gi,
        process: /(?:process|approach|technique)\s+(?:for|to|of)\s+([^.!?]+)/gi,
        ability: /(?:ability|talent|expertise)\s+(?:in|with|for)\s+([^.!?]+)/gi
      };
      
      const extractedSkills = [];
      
      for (const [type, pattern] of Object.entries(skillPatterns)) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const skillDescription = match[1].trim();
          
          if (skillDescription.length > 5 && skillDescription.length < 100) {
            const skill = {
              id: this.generateSkillId(skillDescription),
              name: this.generateSkillName(skillDescription),
              description: skillDescription,
              type: this.inferSkillType(skillDescription, content),
              category: this.inferSkillCategory(skillDescription, content),
              salience: salience,
              source: 'memory_graph',
              sourceChunk: memoryChunk.id || memoryChunk._id,
              extractionType: type,
              confidence: this.calculateSkillConfidence(skillDescription, content, salience),
              triggers: this.generateSkillTriggers(skillDescription),
              parameters: this.inferSkillParameters(skillDescription, content),
              emergent: true,
              discoveredAt: Date.now()
            };
            
            extractedSkills.push(skill);
          }
        }
      }
      
      // If no patterns matched, try semantic extraction
      if (extractedSkills.length === 0) {
        const semanticSkill = await this.extractSemanticSkill(content, metadata, salience);
        if (semanticSkill) {
          extractedSkills.push(semanticSkill);
        }
      }
      
      return extractedSkills.length > 0 ? extractedSkills[0] : null;
      
    } catch (error) {
      logger.error('Failed to extract skill from memory chunk', { error: error.message });
      return null;
    }
  }
  
  /**
   * Discover contextual skills based on user input
   * @param {Object} memoryGraph - Memory graph instance
   * @param {string} userInput - User input
   * @param {Object} context - Context
   * @returns {Promise<Array>} Contextual skills
   */
  async discoverContextualSkills(memoryGraph, userInput, context) {
    try {
      // Search memory for content related to user input
      const results = await memoryGraph.search(userInput, {
        maxResults: 15,
        salienceThreshold: this.config.minSalienceThreshold * 0.8, // Lower threshold for context
        includeMetadata: true
      });
      
      const contextualSkills = [];
      
      for (const result of results) {
        // Look for action words and capabilities in the content
        const actionSkill = this.extractActionSkill(result, userInput, context);
        if (actionSkill) {
          contextualSkills.push(actionSkill);
        }
      }
      
      return contextualSkills;
      
    } catch (error) {
      logger.error('Failed to discover contextual skills', { error: error.message });
      return [];
    }
  }
  
  /**
   * Extract action-based skill from memory content
   * @param {Object} memoryChunk - Memory chunk
   * @param {string} userInput - User input
   * @param {Object} context - Context
   * @returns {Object} Action skill or null
   */
  extractActionSkill(memoryChunk, userInput, context) {
    const content = memoryChunk.content || memoryChunk.text || '';
    const salience = memoryChunk.salience || 0;
    
    // Look for action verbs that might indicate capabilities
    const actionVerbs = [
      'analyze', 'search', 'find', 'create', 'generate', 'write', 'read',
      'process', 'transform', 'convert', 'calculate', 'compute', 'solve',
      'explain', 'describe', 'summarize', 'compare', 'evaluate', 'assess',
      'plan', 'organize', 'manage', 'coordinate', 'execute', 'implement',
      'debug', 'fix', 'optimize', 'improve', 'enhance', 'modify'
    ];
    
    const userWords = userInput.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    
    // Find matching action verbs
    const matchingActions = actionVerbs.filter(verb => 
      userWords.includes(verb) && contentWords.includes(verb)
    );
    
    if (matchingActions.length > 0) {
      const primaryAction = matchingActions[0];
      
      return {
        id: this.generateSkillId(`${primaryAction}_capability`),
        name: `${primaryAction}_capability`,
        description: `Capability to ${primaryAction} based on memory content`,
        type: 'emergent',
        category: this.inferCategoryFromAction(primaryAction),
        salience: salience,
        source: 'contextual_discovery',
        sourceChunk: memoryChunk.id || memoryChunk._id,
        extractionType: 'action_based',
        confidence: salience * 0.8, // Slightly lower confidence for contextual
        triggers: [primaryAction, ...this.generateActionTriggers(primaryAction)],
        parameters: this.inferActionParameters(primaryAction, content),
        emergent: true,
        contextual: true,
        discoveredAt: Date.now()
      };
    }
    
    return null;
  }
  
  /**
   * Extract semantic skill from content
   * @param {string} content - Content to analyze
   * @param {Object} metadata - Metadata
   * @param {number} salience - Salience score
   * @returns {Object} Semantic skill or null
   */
  async extractSemanticSkill(content, metadata, salience) {
    // Look for domain expertise indicators
    const domainPatterns = {
      programming: /(?:code|programming|development|software|algorithm)/gi,
      analysis: /(?:analysis|analyze|evaluation|assessment|research)/gi,
      communication: /(?:explain|describe|communicate|discuss|present)/gi,
      problem_solving: /(?:solve|solution|problem|issue|challenge)/gi,
      creativity: /(?:create|design|generate|innovate|imagine)/gi,
      learning: /(?:learn|study|understand|knowledge|education)/gi
    };
    
    for (const [domain, pattern] of Object.entries(domainPatterns)) {
      if (pattern.test(content)) {
        return {
          id: this.generateSkillId(`${domain}_expertise`),
          name: `${domain}_expertise`,
          description: `Expertise in ${domain} based on memory content`,
          type: 'emergent',
          category: domain,
          salience: salience,
          source: 'semantic_extraction',
          extractionType: 'domain_expertise',
          confidence: salience * 0.6, // Lower confidence for semantic
          triggers: this.generateDomainTriggers(domain),
          parameters: { domain, contentSource: true },
          emergent: true,
          semantic: true,
          discoveredAt: Date.now()
        };
      }
    }
    
    return null;
  }
  
  /**
   * Validate if extracted skill is valid
   * @param {Object} skill - Skill to validate
   * @returns {boolean} Is valid skill
   */
  isValidSkill(skill) {
    return skill &&
           skill.name &&
           skill.description &&
           skill.confidence > 0.1 &&
           skill.salience >= this.config.minSalienceThreshold &&
           skill.triggers &&
           skill.triggers.length > 0;
  }
  
  /**
   * Deduplicate and rank skills by salience
   * @param {Array} skills - Skills to process
   * @returns {Array} Deduplicated and ranked skills
   */
  deduplicateAndRankSkills(skills) {
    const skillMap = new Map();
    
    // Deduplicate by skill ID, keeping highest salience
    skills.forEach(skill => {
      const existing = skillMap.get(skill.id);
      if (!existing || skill.salience > existing.salience) {
        skillMap.set(skill.id, skill);
      }
    });
    
    // Convert to array and sort by salience
    return Array.from(skillMap.values())
      .sort((a, b) => b.salience - a.salience);
  }
  
  /**
   * Generate cache key for skill discovery
   * @param {Object} context - Context
   * @returns {string} Cache key
   */
  generateCacheKey(context) {
    const keyParts = [
      context.userInput ? context.userInput.substring(0, 50) : 'no_input',
      context.sessionId || 'no_session',
      Math.floor(Date.now() / this.config.skillCacheTimeout)
    ];
    return keyParts.join('|');
  }
  
  /**
   * Check if cached skills should be used
   * @param {string} cacheKey - Cache key
   * @returns {boolean} Should use cache
   */
  shouldUseCachedSkills(cacheKey) {
    return this.skillCache.has(cacheKey) &&
           (Date.now() - this.lastDiscoveryTime) < this.config.skillCacheTimeout;
  }
  
  /**
   * Generate skill ID from description
   * @param {string} description - Skill description
   * @returns {string} Skill ID
   */
  generateSkillId(description) {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }
  
  /**
   * Generate skill name from description
   * @param {string} description - Skill description
   * @returns {string} Skill name
   */
  generateSkillName(description) {
    return description
      .split(' ')
      .slice(0, 4)
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  }
  
  /**
   * Infer skill type from description and content
   * @param {string} description - Skill description
   * @param {string} content - Full content
   * @returns {string} Skill type
   */
  inferSkillType(description, content) {
    const techKeywords = ['code', 'program', 'algorithm', 'system', 'technical'];
    const cognitiveKeywords = ['think', 'analyze', 'understand', 'reason', 'learn'];
    
    const lowerDesc = description.toLowerCase();
    const lowerContent = content.toLowerCase();
    
    if (techKeywords.some(keyword => lowerDesc.includes(keyword) || lowerContent.includes(keyword))) {
      return 'technical';
    }
    
    if (cognitiveKeywords.some(keyword => lowerDesc.includes(keyword) || lowerContent.includes(keyword))) {
      return 'cognitive';
    }
    
    return 'emergent';
  }
  
  /**
   * Infer skill category from description and content
   * @param {string} description - Skill description
   * @param {string} content - Full content
   * @returns {string} Skill category
   */
  inferSkillCategory(description, content) {
    const categories = {
      development: ['code', 'program', 'develop', 'build', 'create'],
      analysis: ['analyze', 'evaluate', 'assess', 'examine', 'study'],
      communication: ['explain', 'describe', 'communicate', 'present', 'discuss'],
      problem_solving: ['solve', 'fix', 'resolve', 'address', 'handle'],
      learning: ['learn', 'understand', 'comprehend', 'grasp', 'master'],
      creativity: ['create', 'design', 'generate', 'innovate', 'imagine']
    };
    
    const lowerDesc = description.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }
  
  /**
   * Calculate skill confidence based on various factors
   * @param {string} description - Skill description
   * @param {string} content - Full content
   * @param {number} salience - Salience score
   * @returns {number} Confidence score
   */
  calculateSkillConfidence(description, content, salience) {
    let confidence = salience;
    
    // Boost confidence for specific patterns
    if (description.includes('expert') || description.includes('specialized')) {
      confidence += 0.2;
    }
    
    if (content.length > 100) {
      confidence += 0.1; // More content = higher confidence
    }
    
    if (description.length > 20 && description.length < 80) {
      confidence += 0.1; // Good description length
    }
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Generate skill triggers from description
   * @param {string} description - Skill description
   * @returns {Array} Trigger words
   */
  generateSkillTriggers(description) {
    const words = description.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    
    return words
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 5);
  }
  
  /**
   * Infer skill parameters from description and content
   * @param {string} description - Skill description
   * @param {string} content - Full content
   * @returns {Object} Skill parameters
   */
  inferSkillParameters(description, content) {
    const parameters = {
      useMemoryContext: true,
      useCSEContext: true,
      emergent: true
    };
    
    // Add specific parameters based on content
    if (content.includes('memory') || content.includes('remember')) {
      parameters.requiresMemory = true;
    }
    
    if (content.includes('analyze') || content.includes('analysis')) {
      parameters.analysisType = 'general';
    }
    
    if (content.includes('create') || content.includes('generate')) {
      parameters.generative = true;
    }
    
    return parameters;
  }
  
  /**
   * Generate action triggers for action-based skills
   * @param {string} action - Primary action
   * @returns {Array} Action triggers
   */
  generateActionTriggers(action) {
    const actionSynonyms = {
      analyze: ['examine', 'study', 'evaluate', 'assess'],
      search: ['find', 'look', 'locate', 'discover'],
      create: ['make', 'build', 'generate', 'produce'],
      write: ['compose', 'draft', 'author', 'document'],
      solve: ['resolve', 'fix', 'address', 'handle']
    };
    
    return actionSynonyms[action] || [action];
  }
  
  /**
   * Infer category from action
   * @param {string} action - Action verb
   * @returns {string} Category
   */
  inferCategoryFromAction(action) {
    const actionCategories = {
      analyze: 'analysis',
      search: 'information',
      create: 'creativity',
      write: 'communication',
      solve: 'problem_solving',
      code: 'development',
      plan: 'strategy'
    };
    
    return actionCategories[action] || 'general';
  }
  
  /**
   * Infer action parameters
   * @param {string} action - Action verb
   * @param {string} content - Content context
   * @returns {Object} Action parameters
   */
  inferActionParameters(action, content) {
    const baseParams = {
      action: action,
      useMemoryContext: true,
      emergent: true
    };
    
    // Add action-specific parameters
    switch (action) {
      case 'analyze':
        baseParams.analysisType = 'general';
        baseParams.includeEvidence = true;
        break;
      case 'search':
        baseParams.searchType = 'memory';
        baseParams.maxResults = 5;
        break;
      case 'create':
        baseParams.generative = true;
        baseParams.creative = true;
        break;
    }
    
    return baseParams;
  }
  
  /**
   * Generate domain triggers
   * @param {string} domain - Domain name
   * @returns {Array} Domain triggers
   */
  generateDomainTriggers(domain) {
    const domainTriggers = {
      programming: ['code', 'program', 'develop', 'software', 'algorithm'],
      analysis: ['analyze', 'evaluate', 'assess', 'examine', 'research'],
      communication: ['explain', 'describe', 'communicate', 'present'],
      problem_solving: ['solve', 'problem', 'issue', 'challenge', 'fix'],
      creativity: ['create', 'design', 'generate', 'innovate'],
      learning: ['learn', 'study', 'understand', 'knowledge']
    };
    
    return domainTriggers[domain] || [domain];
  }
  
  /**
   * Record skill usage for learning
   * @param {string} skillId - Skill ID
   * @param {Object} usageData - Usage data
   */
  recordSkillUsage(skillId, usageData) {
    if (!this.config.enableSkillLearning) return;
    
    const existing = this.skillUsageStats.get(skillId) || {
      usageCount: 0,
      successCount: 0,
      totalDuration: 0,
      lastUsed: 0
    };
    
    existing.usageCount++;
    existing.lastUsed = Date.now();
    
    if (usageData.success) {
      existing.successCount++;
    }
    
    if (usageData.duration) {
      existing.totalDuration += usageData.duration;
    }
    
    this.skillUsageStats.set(skillId, existing);
    
    logger.debug('Skill usage recorded', {
      skillId,
      usageCount: existing.usageCount,
      successRate: existing.successCount / existing.usageCount
    });
  }
  
  /**
   * Get skill usage statistics
   * @returns {Object} Usage statistics
   */
  getSkillUsageStats() {
    const stats = {};
    
    this.skillUsageStats.forEach((data, skillId) => {
      stats[skillId] = {
        ...data,
        successRate: data.usageCount > 0 ? data.successCount / data.usageCount : 0,
        avgDuration: data.usageCount > 0 ? data.totalDuration / data.usageCount : 0
      };
    });
    
    return stats;
  }
  
  /**
   * Clear skill cache
   */
  clearCache() {
    this.skillCache.clear();
    this.lastDiscoveryTime = 0;
    logger.info('Skill cache cleared');
  }
  
  /**
   * Get system statistics
   * @returns {Object} System statistics
   */
  getStatistics() {
    return {
      discoveredSkillsCount: this.discoveredSkills.size,
      cachedSkillsCount: this.skillCache.size,
      lastDiscoveryTime: this.lastDiscoveryTime,
      skillUsageStats: this.getSkillUsageStats(),
      config: this.config
    };
  }
}

module.exports = {
  EmergentSkillSystem
};
