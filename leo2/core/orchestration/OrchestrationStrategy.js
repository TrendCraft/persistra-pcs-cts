/**
 * Orchestration Strategy Configuration
 * 
 * Provides thin, configurable orchestration layer for Leo's cognitive processes.
 * Allows strategic control over agent loop behavior through simple configuration flags.
 * 
 * @created 2025-08-01
 * @phase COS Implementation
 */

const { createComponentLogger } = require('../../../lib/utils/logger');

// Component name for logging
const COMPONENT_NAME = 'orchestration-strategy';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Predefined orchestration strategies
 */
const PREDEFINED_STRATEGIES = {
  default: {
    name: 'default',
    description: 'Balanced cognitive processing with moderate reflection and memory usage',
    config: {
      memoryDepth: 3,
      salienceThreshold: 0.12,
      reflectionEnabled: true,
      reflectionThreshold: 0.7,
      maxReflectionDepth: 2,
      updateEnabled: true,
      learningEnabled: true,
      skillSelectionStrategy: 'balanced',
      fallbackStrategy: 'llm_with_context',
      timeoutMs: 30000,
      maxRetries: 2
    }
  },
  
  'reflection-heavy': {
    name: 'reflection-heavy',
    description: 'Deep cognitive processing with extensive reflection and high memory usage',
    config: {
      memoryDepth: 8,
      salienceThreshold: 0.08,
      reflectionEnabled: true,
      reflectionThreshold: 0.5,
      maxReflectionDepth: 5,
      updateEnabled: true,
      learningEnabled: true,
      skillSelectionStrategy: 'comprehensive',
      fallbackStrategy: 'llm_with_context',
      timeoutMs: 60000,
      maxRetries: 3
    }
  },
  
  fast: {
    name: 'fast',
    description: 'Quick cognitive processing with minimal reflection for rapid responses',
    config: {
      memoryDepth: 1,
      salienceThreshold: 0.2,
      reflectionEnabled: false,
      reflectionThreshold: 0.9,
      maxReflectionDepth: 1,
      updateEnabled: true,
      learningEnabled: false,
      skillSelectionStrategy: 'quick',
      fallbackStrategy: 'llm_minimal',
      timeoutMs: 10000,
      maxRetries: 1
    }
  },
  
  'memory-focused': {
    name: 'memory-focused',
    description: 'Memory-intensive processing with high context injection',
    config: {
      memoryDepth: 10,
      salienceThreshold: 0.05,
      reflectionEnabled: true,
      reflectionThreshold: 0.6,
      maxReflectionDepth: 3,
      updateEnabled: true,
      learningEnabled: true,
      skillSelectionStrategy: 'memory_priority',
      fallbackStrategy: 'llm_with_context',
      timeoutMs: 45000,
      maxRetries: 2
    }
  },
  
  'skill-heavy': {
    name: 'skill-heavy',
    description: 'Skill-focused processing that prioritizes capability execution',
    config: {
      memoryDepth: 5,
      salienceThreshold: 0.1,
      reflectionEnabled: true,
      reflectionThreshold: 0.6,
      maxReflectionDepth: 2,
      updateEnabled: true,
      learningEnabled: true,
      skillSelectionStrategy: 'skill_priority',
      fallbackStrategy: 'llm_with_context',
      timeoutMs: 40000,
      maxRetries: 3
    }
  }
};

/**
 * Orchestration Strategy Class
 * 
 * Manages cognitive processing strategies and configuration
 */
class OrchestrationStrategy {
  /**
   * Constructor
   * @param {Object} config - Strategy configuration
   */
  constructor(config = {}) {
    this.currentStrategy = config.strategy || 'default';
    this.customConfig = config.customConfig || {};
    this.overrides = config.overrides || {};
    
    // Build final configuration
    this.config = this.buildConfiguration();
    
    logger.info('OrchestrationStrategy created', {
      strategy: this.currentStrategy,
      config: this.config
    });
  }
  
  /**
   * Build final configuration by merging strategy, custom config, and overrides
   * @returns {Object} Final configuration
   */
  buildConfiguration() {
    // Start with predefined strategy
    const baseStrategy = PREDEFINED_STRATEGIES[this.currentStrategy];
    if (!baseStrategy) {
      logger.warn(`Unknown strategy '${this.currentStrategy}', falling back to 'default'`);
      this.currentStrategy = 'default';
      return this.buildConfiguration();
    }
    
    // Merge: base strategy -> custom config -> overrides
    const config = {
      ...baseStrategy.config,
      ...this.customConfig,
      ...this.overrides
    };
    
    // Validate configuration
    this.validateConfiguration(config);
    
    return config;
  }
  
  /**
   * Validate configuration parameters
   * @param {Object} config - Configuration to validate
   */
  validateConfiguration(config) {
    const validations = [
      { key: 'memoryDepth', min: 0, max: 20, type: 'number' },
      { key: 'salienceThreshold', min: 0, max: 1, type: 'number' },
      { key: 'reflectionThreshold', min: 0, max: 1, type: 'number' },
      { key: 'maxReflectionDepth', min: 0, max: 10, type: 'number' },
      { key: 'timeoutMs', min: 1000, max: 300000, type: 'number' },
      { key: 'maxRetries', min: 0, max: 10, type: 'number' }
    ];
    
    validations.forEach(validation => {
      const value = config[validation.key];
      
      if (typeof value !== validation.type) {
        logger.warn(`Invalid type for ${validation.key}: expected ${validation.type}, got ${typeof value}`);
        return;
      }
      
      if (value < validation.min || value > validation.max) {
        logger.warn(`Invalid value for ${validation.key}: ${value} (expected ${validation.min}-${validation.max})`);
      }
    });
  }
  
  /**
   * Get current strategy configuration
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return { ...this.config };
  }
  
  /**
   * Update strategy
   * @param {string} strategyName - New strategy name
   * @param {Object} overrides - Configuration overrides
   */
  updateStrategy(strategyName, overrides = {}) {
    this.currentStrategy = strategyName;
    this.overrides = { ...this.overrides, ...overrides };
    this.config = this.buildConfiguration();
    
    logger.info('Strategy updated', {
      strategy: this.currentStrategy,
      overrides,
      config: this.config
    });
  }
  
  /**
   * Apply configuration overrides
   * @param {Object} overrides - Configuration overrides
   */
  applyOverrides(overrides) {
    this.overrides = { ...this.overrides, ...overrides };
    this.config = this.buildConfiguration();
    
    logger.info('Configuration overrides applied', {
      overrides,
      config: this.config
    });
  }
  
  /**
   * Get memory configuration for CSE
   * @returns {Object} Memory configuration
   */
  getMemoryConfig() {
    return {
      maxResults: this.config.memoryDepth,
      salienceThreshold: this.config.salienceThreshold,
      includeIdentity: true,
      includeCapabilities: true,
      rankBySalience: true
    };
  }
  
  /**
   * Get reflection configuration for agent loop
   * @returns {Object} Reflection configuration
   */
  getReflectionConfig() {
    return {
      enabled: this.config.reflectionEnabled,
      threshold: this.config.reflectionThreshold,
      maxDepth: this.config.maxReflectionDepth
    };
  }
  
  /**
   * Get skill selection configuration
   * @returns {Object} Skill selection configuration
   */
  getSkillSelectionConfig() {
    return {
      strategy: this.config.skillSelectionStrategy,
      fallbackStrategy: this.config.fallbackStrategy,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries
    };
  }
  
  /**
   * Get update configuration for agent loop
   * @returns {Object} Update configuration
   */
  getUpdateConfig() {
    return {
      enabled: this.config.updateEnabled,
      learningEnabled: this.config.learningEnabled
    };
  }
  
  /**
   * Determine if reflection should be performed based on confidence
   * @param {number} confidence - Current confidence score
   * @returns {boolean} Whether to perform reflection
   */
  shouldReflect(confidence) {
    if (!this.config.reflectionEnabled) {
      return false;
    }
    
    return confidence < this.config.reflectionThreshold;
  }
  
  /**
   * Determine if skill execution should timeout
   * @param {number} duration - Current execution duration
   * @returns {boolean} Whether to timeout
   */
  shouldTimeout(duration) {
    return duration > this.config.timeoutMs;
  }
  
  /**
   * Get fallback strategy for skill selection
   * @param {string} reason - Reason for fallback
   * @returns {Object} Fallback configuration
   */
  getFallbackStrategy(reason = 'no_skill_selected') {
    const strategy = this.config.fallbackStrategy;
    
    switch (strategy) {
      case 'llm_with_context':
        return {
          skill: 'llm_conversation',
          useMemoryContext: true,
          useCSEContext: true,
          reason: `Fallback: ${reason} - using LLM with full context`
        };
        
      case 'llm_minimal':
        return {
          skill: 'llm_conversation',
          useMemoryContext: false,
          useCSEContext: false,
          reason: `Fallback: ${reason} - using LLM with minimal context`
        };
        
      case 'memory_search':
        return {
          skill: 'memory_search',
          useMemoryContext: true,
          useCSEContext: true,
          reason: `Fallback: ${reason} - searching memory`
        };
        
      default:
        return {
          skill: 'llm_conversation',
          useMemoryContext: true,
          useCSEContext: true,
          reason: `Fallback: ${reason} - default LLM with context`
        };
    }
  }
  
  /**
   * Get available strategies
   * @returns {Array} List of available strategies
   */
  static getAvailableStrategies() {
    return Object.keys(PREDEFINED_STRATEGIES).map(key => ({
      name: key,
      description: PREDEFINED_STRATEGIES[key].description,
      config: PREDEFINED_STRATEGIES[key].config
    }));
  }
  
  /**
   * Create strategy from configuration
   * @param {Object} config - Strategy configuration
   * @returns {OrchestrationStrategy} Strategy instance
   */
  static fromConfig(config) {
    return new OrchestrationStrategy(config);
  }
  
  /**
   * Create strategy with overrides
   * @param {string} baseStrategy - Base strategy name
   * @param {Object} overrides - Configuration overrides
   * @returns {OrchestrationStrategy} Strategy instance
   */
  static withOverrides(baseStrategy, overrides) {
    return new OrchestrationStrategy({
      strategy: baseStrategy,
      overrides
    });
  }
  
  /**
   * Get strategy summary for logging/debugging
   * @returns {Object} Strategy summary
   */
  getSummary() {
    return {
      strategy: this.currentStrategy,
      description: PREDEFINED_STRATEGIES[this.currentStrategy]?.description || 'Custom strategy',
      key_settings: {
        memoryDepth: this.config.memoryDepth,
        salienceThreshold: this.config.salienceThreshold,
        reflectionEnabled: this.config.reflectionEnabled,
        skillSelectionStrategy: this.config.skillSelectionStrategy,
        fallbackStrategy: this.config.fallbackStrategy
      }
    };
  }
  
  /**
   * Export configuration for persistence
   * @returns {Object} Exportable configuration
   */
  exportConfig() {
    return {
      strategy: this.currentStrategy,
      customConfig: this.customConfig,
      overrides: this.overrides,
      timestamp: Date.now()
    };
  }
  
  /**
   * Import configuration from persistence
   * @param {Object} exportedConfig - Exported configuration
   * @returns {OrchestrationStrategy} Strategy instance
   */
  static importConfig(exportedConfig) {
    return new OrchestrationStrategy({
      strategy: exportedConfig.strategy,
      customConfig: exportedConfig.customConfig,
      overrides: exportedConfig.overrides
    });
  }
}

module.exports = {
  OrchestrationStrategy,
  PREDEFINED_STRATEGIES
};
