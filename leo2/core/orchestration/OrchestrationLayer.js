/**
 * Thin Configurable Orchestration Layer
 * 
 * Provides strategic control over Leo's cognitive processes through configurable
 * orchestration strategies and skill plugin management with automatic fallback.
 * 
 * @created 2025-08-01
 * @phase COS Implementation
 */

const { OrchestrationStrategy } = require('./OrchestrationStrategy');
const { SkillPluginSystem } = require('./SkillPluginSystem');
const { EmergentBehaviorCoordinator } = require('../emergence/EmergentBehaviorCoordinator');
const { createComponentLogger } = require('../../../lib/utils/logger');
const EmergentSkillSystem = require('../emergence/EmergentSkillSystem');
const AdaptiveStrategy = require('./AdaptiveStrategy');
const { v4: uuidv4 } = require('uuid');
const { SESSION_ID_KEY } = require('../constants/session');

// Component name for logging
const COMPONENT_NAME = 'orchestration-layer';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Orchestration Layer Class
 * 
 * Thin layer that coordinates strategy and skill systems for cognitive processing
 */
class OrchestrationLayer {
  /**
   * Constructor
   * @param {Object} config - Orchestration configuration
   */
  constructor(config = {}) {
    // Initialize strategy system
    this.strategy = new OrchestrationStrategy({
      strategy: config.strategy || 'default',
      customConfig: config.customConfig || {},
      overrides: config.overrides || {}
    });
    
    // Initialize skill plugin system (legacy support)
    this.skillSystem = new SkillPluginSystem({
      enableFallback: config.enableFallback !== false,
      fallbackSkill: config.fallbackSkill || 'llm_conversation',
      maxExecutionTime: config.maxExecutionTime || 30000,
      enableCaching: config.enableCaching !== false
    });
    
    // Initialize emergent behavior coordinator
    this.emergentCoordinator = new EmergentBehaviorCoordinator({
      salienceThreshold: config.salienceThreshold || 0.1,
      maxContextItems: config.maxContextItems || 15,
      maxCapabilities: config.maxCapabilities || 20,
      emergentIdentityEnabled: config.emergentIdentityEnabled !== false,
      behaviorLearningEnabled: config.behaviorLearningEnabled !== false,
      contextEvolutionEnabled: config.contextEvolutionEnabled !== false
    });
    
    // Enable emergent behavior by default
    this.useEmergentBehavior = config.useEmergentBehavior !== false;
    
    // Orchestration state
    this.state = {
      initialized: false,
      currentSession: null,
      executionCount: 0,
      lastExecution: null,
      errors: []
    };
    
    // Configuration
    this.config = {
      enableLogging: config.enableLogging !== false,
      enableMetrics: config.enableMetrics !== false,
      enableAdaptation: config.enableAdaptation !== false,
      adaptationThreshold: config.adaptationThreshold || 0.1,
      ...config
    };
    
    logger.info('OrchestrationLayer initialized', {
      strategy: this.strategy.currentStrategy,
      skillCount: this.skillSystem.getAvailableSkills().length,
      config: this.config
    });
    
    this.state.initialized = true;
  }
  
  /**
   * Initialize orchestration layer with external dependencies
   * @param {Object} dependencies - External dependencies
   */
  async initialize(dependencies = {}) {
    try {
      // Store dependencies for skill execution
      this.dependencies = {
        memoryGraph: dependencies.memoryGraph,
        cse: dependencies.cse,
        llmInterface: dependencies.llmInterface,
        capabilityRegistry: dependencies.capabilityRegistry,
        ...dependencies
      };
      
      logger.info('OrchestrationLayer dependencies initialized', {
        dependencies: Object.keys(this.dependencies)
      });
      
      this.state.initialized = true;
      
    } catch (error) {
      logger.error('Failed to initialize OrchestrationLayer', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Process user input through orchestrated cognitive pipeline
   * @param {Object} input - User input and analysis
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Processing result
   */
  async processInput(input, context = {}) {
    const startTime = Date.now();
    const sessionId = context[SESSION_ID_KEY] || context.sessionId || uuidv4();
    
    try {
      this.state.currentSession = sessionId;
      this.state.executionCount++;
      
      logger.info('Processing input through orchestration layer', {
        sessionId,
        inputLength: input.userInput?.length || 0,
        strategy: this.strategy.currentStrategy
      });
      
      // Phase 1: Strategy Configuration
      const strategyConfig = this.getStrategyConfiguration(input, context);
      
      // Phase 2: Skill Discovery
      const availableSkills = await this.discoverSkills(input, strategyConfig);
      
      // Phase 3: Skill Selection
      const skillSelection = this.selectSkill(availableSkills, strategyConfig, context);
      
      // Phase 4: Skill Execution
      const executionResult = await this.executeSkill(skillSelection, {
        ...context,
        ...strategyConfig,
        sessionId
      });
      
      // Phase 5: Result Processing
      const processedResult = this.processResult(executionResult, skillSelection, context);
      
      const duration = Date.now() - startTime;
      
      // Update state
      this.state.lastExecution = {
        sessionId,
        duration,
        strategy: this.strategy.currentStrategy,
        skillUsed: skillSelection.skill.name,
        success: processedResult.success,
        timestamp: Date.now()
      };
      
      // Adaptive strategy adjustment
      if (this.config.enableAdaptation) {
        await this.adaptStrategy(processedResult, duration);
      }
      
      logger.info('Input processing completed', {
        sessionId,
        duration,
        skillUsed: skillSelection.skill.name,
        success: processedResult.success,
        fallback: skillSelection.fallback
      });
      
      return {
        ...processedResult,
        orchestration: {
          sessionId,
          duration,
          strategy: this.strategy.currentStrategy,
          skillUsed: skillSelection.skill.name,
          fallback: skillSelection.fallback,
          skillsConsidered: availableSkills.length,
          strategyConfig: strategyConfig
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.state.errors.push({
        sessionId,
        error: error.message,
        duration,
        timestamp: Date.now()
      });
      
      logger.error('Input processing failed', {
        sessionId,
        error: error.message,
        duration
      });
      
      // Attempt fallback processing
      if (this.config.enableFallback !== false) {
        try {
          logger.info('Attempting fallback processing');
          
          const fallbackSelection = this.skillSystem.getFallbackSkill('orchestration_error', context);
          const fallbackResult = await this.skillSystem.executeSkill(fallbackSelection, {
            ...context,
            sessionId
          });
          
          return {
            ...fallbackResult,
            orchestration: {
              sessionId,
              duration: Date.now() - startTime,
              strategy: this.strategy.currentStrategy,
              skillUsed: fallbackSelection.skill.name,
              fallback: true,
              error: error.message
            }
          };
          
        } catch (fallbackError) {
          logger.error('Fallback processing failed', {
            sessionId,
            error: fallbackError.message
          });
        }
      }
      
      return {
        success: false,
        error: error.message,
        orchestration: {
          sessionId,
          duration: Date.now() - startTime,
          strategy: this.strategy.currentStrategy,
          error: error.message
        }
      };
    }
  }
  
  /**
   * Get strategy configuration for current input
   * @param {Object} input - User input
   * @param {Object} context - Execution context
   * @returns {Object} Strategy configuration
   */
  getStrategyConfiguration(input, context) {
    const baseConfig = this.strategy.getConfiguration();
    
    // Apply context-specific adjustments
    const adjustments = {};
    
    // Adjust based on input complexity
    if (input.userInput && input.userInput.length > 500) {
      adjustments.memoryDepth = Math.min(baseConfig.memoryDepth + 2, 10);
      adjustments.reflectionEnabled = true;
    }
    
    // Adjust based on input type
    if (input.inputAnalysis?.isSpecialCommand) {
      adjustments.reflectionEnabled = true;
      adjustments.memoryDepth = Math.max(baseConfig.memoryDepth, 5);
    }
    
    // Adjust based on context
    if (context.urgency === 'high') {
      adjustments.reflectionEnabled = false;
      adjustments.memoryDepth = Math.min(baseConfig.memoryDepth, 2);
    }
    
    return {
      ...baseConfig,
      ...adjustments,
      memoryConfig: this.strategy.getMemoryConfig(),
      reflectionConfig: this.strategy.getReflectionConfig(),
      skillSelectionConfig: this.strategy.getSkillSelectionConfig(),
      updateConfig: this.strategy.getUpdateConfig()
    };
  }
  
  /**
   * Discover available skills for input
   * @param {Object} input - User input
   * @param {Object} strategyConfig - Strategy configuration
   * @returns {Array} Available skills
   */
  async discoverSkills(input, strategyConfig) {
    const context = {
      memoryDepth: strategyConfig.memoryDepth,
      salienceThreshold: strategyConfig.salienceThreshold,
      ...input
    };
    
    let skills = [];
    
    if (this.useEmergentBehavior && this.dependencies?.memoryGraph) {
      // Use emergent behavior to discover skills from memory
      logger.debug('Discovering skills using emergent behavior');
      
      try {
        const emergentSkills = await this.emergentCoordinator.emergentSkills.discoverSkillsFromMemory(
          this.dependencies.memoryGraph,
          {
            userInput: input.userInput,
            inputAnalysis: input.inputAnalysis,
            cseContext: input.cseContext,
            ...context
          }
        );
        
        // Ensure emergentSkills is always an array
        if (Array.isArray(emergentSkills)) {
          skills = emergentSkills;
        } else {
          logger.warn('Emergent skills returned non-array, using empty array', { 
            type: typeof emergentSkills, 
            value: emergentSkills 
          });
          skills = [];
        }
        
        logger.debug('Emergent skills discovered', {
          emergentSkills: skills.length,
          strategy: strategyConfig.skillSelectionStrategy
        });
        
      } catch (error) {
        logger.error('Emergent skill discovery failed, falling back to legacy', {
          error: error.message
        });
        
        // Fallback to legacy skill system
        const legacySkills = this.skillSystem.discoverSkills(input, context);
        skills = Array.isArray(legacySkills) ? legacySkills : [];
      }
    } else {
      // Use legacy skill system
      logger.debug('Using legacy skill discovery');
      const legacySkills = this.skillSystem.discoverSkills(input, context);
      skills = Array.isArray(legacySkills) ? legacySkills : [];
    }
    
    // Apply strategy-specific filtering
    const filteredSkills = skills.filter(skill => {
      // Filter by strategy preferences
      switch (strategyConfig.skillSelectionStrategy) {
        case 'quick':
          return skill.confidence > 0.3;
        case 'comprehensive':
          return skill.confidence > 0.1;
        case 'memory_priority':
          return skill.category === 'memory' || skill.confidence > 0.4;
        case 'skill_priority':
          return !skill.fallback || skill.confidence > 0.6;
        default:
          return skill.confidence > 0.2;
      }
    });
    
    logger.debug('Skills discovered and filtered', {
      totalSkills: skills.length,
      filteredSkills: filteredSkills.length,
      strategy: strategyConfig.skillSelectionStrategy,
      emergentUsed: this.useEmergentBehavior && !!this.dependencies?.memoryGraph
    });
    
    return filteredSkills;
  }
  
  /**
   * Select best skill for execution
   * @param {Array} availableSkills - Available skills
   * @param {Object} strategyConfig - Strategy configuration
   * @param {Object} context - Execution context
   * @returns {Object} Selected skill
   */
  selectSkill(availableSkills, strategyConfig, context) {
    const selection = this.skillSystem.selectSkill(
      availableSkills,
      strategyConfig.skillSelectionConfig,
      {
        ...context,
        memoryDepth: strategyConfig.memoryDepth,
        salienceThreshold: strategyConfig.salienceThreshold,
        useMemoryContext: true,
        useCSEContext: true
      }
    );
    
    logger.info('Skill selected through orchestration', {
      skill: selection.skill.name,
      confidence: selection.skill.confidence,
      fallback: selection.fallback,
      reason: selection.selectionReason
    });
    
    return selection;
  }
  
  /**
   * Execute selected skill
   * @param {Object} skillSelection - Selected skill
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeSkill(skillSelection, context) {
    // Enhance context with dependencies
    const enhancedContext = {
      ...context,
      dependencies: this.dependencies,
      strategy: this.strategy.currentStrategy,
      orchestrationLayer: this
    };
    
    const result = await this.skillSystem.executeSkill(skillSelection, enhancedContext);
    
    return result;
  }
  
  /**
   * Process execution result
   * @param {Object} executionResult - Skill execution result
   * @param {Object} skillSelection - Selected skill
   * @param {Object} context - Execution context
   * @returns {Object} Processed result
   */
  processResult(executionResult, skillSelection, context) {
    const processedResult = {
      ...executionResult,
      skillSelection: {
        name: skillSelection.skill.name,
        type: skillSelection.skill.type,
        category: skillSelection.skill.category,
        confidence: skillSelection.skill.confidence,
        fallback: skillSelection.fallback
      },
      strategy: this.strategy.currentStrategy,
      timestamp: Date.now()
    };
    
    // Apply result post-processing based on strategy
    if (this.strategy.getConfiguration().learningEnabled && executionResult.success) {
      processedResult.learningEvents = this.extractLearningEvents(executionResult, skillSelection);
    }
    
    return processedResult;
  }
  
  /**
   * Extract learning events from execution result
   * @param {Object} executionResult - Execution result
   * @param {Object} skillSelection - Skill selection
   * @returns {Array} Learning events
   */
  extractLearningEvents(executionResult, skillSelection) {
    const events = [];
    
    // Skill performance learning
    if (executionResult.duration) {
      events.push({
        type: 'skill_performance',
        skill: skillSelection.skill.name,
        duration: executionResult.duration,
        success: executionResult.success,
        significance: executionResult.duration > 5000 ? 'high' : 'low'
      });
    }
    
    // Strategy effectiveness learning
    events.push({
      type: 'strategy_effectiveness',
      strategy: this.strategy.currentStrategy,
      skill: skillSelection.skill.name,
      success: executionResult.success,
      fallback: skillSelection.fallback,
      significance: skillSelection.fallback ? 'high' : 'medium'
    });
    
    return events;
  }
  
  /**
   * Adapt strategy based on execution results
   * @param {Object} result - Execution result
   * @param {number} duration - Execution duration
   */
  async adaptStrategy(result, duration) {
    const currentConfig = this.strategy.getConfiguration();
    const adaptations = {};
    
    // Adapt based on performance
    if (duration > currentConfig.timeoutMs * 0.8) {
      // Execution taking too long - speed up strategy
      adaptations.memoryDepth = Math.max(currentConfig.memoryDepth - 1, 1);
      adaptations.reflectionEnabled = false;
      
      logger.info('Adapting strategy for performance', {
        reason: 'slow_execution',
        duration,
        adaptations
      });
    }
    
    // Adapt based on fallback usage
    const stats = this.skillSystem.getStatistics();
    if (stats.fallbackRate > 30) {
      // Too many fallbacks - adjust thresholds
      adaptations.salienceThreshold = Math.max(currentConfig.salienceThreshold - 0.02, 0.05);
      
      logger.info('Adapting strategy for fallback rate', {
        reason: 'high_fallback_rate',
        fallbackRate: stats.fallbackRate,
        adaptations
      });
    }
    
    // Apply adaptations
    if (Object.keys(adaptations).length > 0) {
      this.strategy.applyOverrides(adaptations);
    }
  }
  
  /**
   * Update orchestration strategy
   * @param {string} strategyName - New strategy name
   * @param {Object} overrides - Configuration overrides
   */
  updateStrategy(strategyName, overrides = {}) {
    this.strategy.updateStrategy(strategyName, overrides);
    
    logger.info('Orchestration strategy updated', {
      strategy: strategyName,
      overrides
    });
  }
  
  /**
   * Get orchestration statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      orchestration: {
        executionCount: this.state.executionCount,
        currentStrategy: this.strategy.currentStrategy,
        lastExecution: this.state.lastExecution,
        errorCount: this.state.errors.length,
        initialized: this.state.initialized
      },
      strategy: this.strategy.getSummary(),
      skills: this.skillSystem.getStatistics()
    };
  }
  
  /**
   * Get available strategies
   * @returns {Array} Available strategies
   */
  getAvailableStrategies() {
    return OrchestrationStrategy.getAvailableStrategies();
  }
  
  /**
   * Get available skills
   * @returns {Array} Available skills
   */
  getAvailableSkills() {
    return this.skillSystem.getAvailableSkills();
  }
  
  /**
   * Export orchestration configuration
   * @returns {Object} Exportable configuration
   */
  exportConfiguration() {
    return {
      strategy: this.strategy.exportConfig(),
      orchestration: {
        config: this.config,
        state: {
          executionCount: this.state.executionCount,
          initialized: this.state.initialized
        }
      },
      skills: this.skillSystem.getStatistics(),
      timestamp: Date.now()
    };
  }
  
  /**
   * Import orchestration configuration
   * @param {Object} config - Configuration to import
   */
  importConfiguration(config) {
    if (config.strategy) {
      this.strategy = OrchestrationStrategy.importConfig(config.strategy);
    }
    
    if (config.orchestration?.config) {
      this.config = { ...this.config, ...config.orchestration.config };
    }
    
    logger.info('Orchestration configuration imported', {
      strategy: this.strategy.currentStrategy,
      timestamp: config.timestamp
    });
  }
  
  /**
   * Shutdown orchestration layer
   */
  async shutdown() {
    logger.info('Shutting down orchestration layer');
    
    // Clear caches
    this.skillSystem.executionCache.clear();
    
    // Reset state
    this.state.initialized = false;
    this.state.currentSession = null;
    
    logger.info('Orchestration layer shutdown complete');
  }
}

module.exports = {
  OrchestrationLayer
};
