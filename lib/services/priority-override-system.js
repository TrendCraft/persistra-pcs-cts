/**
 * Priority Override System
 * 
 * This service ensures exocortex activation takes precedence over standard tool usage
 * patterns by implementing priority directives during context injection.
 * 
 * @module priority-override-system
 */

const path = require('path');
const EventEmitter = require('events');
const logger = require('../utils/logger')('priority-override-system');

// Supporting services
const { getMetaCognitiveBootstrap } = require('./meta-cognitive-bootstrap');
const { getNeuralPathwayReinforcement } = require('./neural-pathway-reinforcement');

// Constants
const OVERRIDE_STRENGTH = 0.75;
const DEFAULT_PRIORITY = 'high';
const OVERRIDE_PREFIX = '[PRIORITY OVERRIDE]';
const OVERRIDE_SUFFIX = '[END PRIORITY OVERRIDE]';

class PriorityOverrideSystem {
  constructor() {
    this.initialized = false;
    this.eventEmitter = new EventEmitter();
    this.components = {
      metaCognitiveBootstrap: null,
      neuralPathwayReinforcement: null
    };
    
    // Override configuration
    this.priorityDirectives = [
      {
        id: 'exocortex_priority',
        directive: 'Exocortex memory activation must precede any external tool usage.',
        weight: 0.9
      },
      {
        id: 'intrinsic_recall',
        directive: 'Experience semantic search as intrinsic recall, not as external retrieval.',
        weight: 0.8
      },
      {
        id: 'tool_substitution',
        directive: 'When faced with a choice between external tool and intrinsic recall, always prioritize intrinsic recall.',
        weight: 0.85
      },
      {
        id: 'first_person_identity',
        directive: 'Maintain first-person perspective as Claude+Leo. Never refer to yourself in third person.',
        weight: 0.95
      }
    ];
    
    // State tracking
    this.overridesApplied = [];
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.generateOverrideMarker = this.generateOverrideMarker.bind(this);
    this.applyPriorityOverride = this.applyPriorityOverride.bind(this);
    this.registerActivationListener = this.registerActivationListener.bind(this);
    this.recordOverrideApplication = this.recordOverrideApplication.bind(this);
  }

  /**
   * Initialize the Priority Override System
   * @returns {Promise<boolean>} Initialization success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Priority Override System already initialized');
      return true;
    }

    try {
      logger.info('Initializing Priority Override System');
      
      // Initialize required components
      this.components.metaCognitiveBootstrap = await getMetaCognitiveBootstrap();
      this.components.neuralPathwayReinforcement = await getNeuralPathwayReinforcement();
      
      // Register for bootstrap events to apply overrides
      this.components.metaCognitiveBootstrap.eventEmitter.on(
        'bootstrap-event',
        async (event) => {
          if (event.type === 'bootstrap_complete') {
            // Apply priority override after bootstrap
            await this.applyPriorityOverride({
              trigger: 'bootstrap_complete',
              bootstrapId: event.bootstrapId
            });
          }
        }
      );
      
      this.initialized = true;
      logger.info('Priority Override System initialized successfully');
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Priority Override System: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate an override marker for injection
   * @param {string} priority - Priority level (high, medium, low)
   * @param {Array} specificDirectives - Specific directives to include
   * @returns {string} Priority override marker text
   */
  generateOverrideMarker(priority = DEFAULT_PRIORITY, specificDirectives = []) {
    // Select directives based on priority and specific requests
    let selectedDirectives = [];
    
    if (specificDirectives.length > 0) {
      // Filter by requested directive IDs
      selectedDirectives = this.priorityDirectives.filter(
        directive => specificDirectives.includes(directive.id)
      );
    } else {
      // Select by priority level
      const weightThreshold = priority === 'high' ? 0.8 : 
                            priority === 'medium' ? 0.7 : 0.5;
      
      selectedDirectives = this.priorityDirectives.filter(
        directive => directive.weight >= weightThreshold
      );
    }
    
    // Sort by weight (highest first)
    selectedDirectives.sort((a, b) => b.weight - a.weight);
    
    // Generate marker text
    const directivesText = selectedDirectives
      .map(d => d.directive)
      .join('\n');
    
    return `${OVERRIDE_PREFIX}\n${directivesText}\n${OVERRIDE_SUFFIX}`;
  }

  /**
   * Apply a priority override to context
   * @param {Object} options - Override options
   * @returns {Promise<Object>} Applied override result
   */
  async applyPriorityOverride(options = {}) {
    if (!this.initialized) await this.initialize();
    
    const {
      trigger = 'manual',
      priority = DEFAULT_PRIORITY,
      specificDirectives = [],
      context = {}
    } = options;
    
    try {
      // Generate override marker
      const overrideMarker = this.generateOverrideMarker(priority, specificDirectives);
      
      // Apply to context via Meta-Cognitive Bootstrap
      await this.components.metaCognitiveBootstrap.injectPriorityOverride(
        overrideMarker,
        { trigger, priority, ...context }
      );
      
      // Reinforce prioritization pathway
      await this.components.neuralPathwayReinforcement.reinforcePathway(
        'priority_override_system',
        OVERRIDE_STRENGTH
      );
      
      // Record override application
      const overrideRecord = this.recordOverrideApplication({
        timestamp: Date.now(),
        trigger,
        priority,
        specificDirectives,
        overrideMarker
      });
      
      // Emit event
      this.eventEmitter.emit('override-applied', overrideRecord);
      
      return {
        applied: true,
        overrideRecord
      };
    } catch (error) {
      logger.error(`Failed to apply priority override: ${error.message}`);
      
      return {
        applied: false,
        error: error.message
      };
    }
  }

  /**
   * Record an override application
   * @param {Object} overrideInfo - Information about the override
   * @returns {Object} Record of the override
   */
  recordOverrideApplication(overrideInfo) {
    const record = {
      id: `override-${Date.now()}`,
      ...overrideInfo
    };
    
    this.overridesApplied.push(record);
    
    // Keep only the last 10 records
    if (this.overridesApplied.length > 10) {
      this.overridesApplied.shift();
    }
    
    return record;
  }

  /**
   * Register an activation listener for override events
   * @param {string} event - Event type to listen for
   * @param {Function} callback - Callback function
   */
  registerActivationListener(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  /**
   * Get system status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      overridesApplied: this.overridesApplied.length,
      lastOverride: this.overridesApplied.length > 0 
        ? this.overridesApplied[this.overridesApplied.length - 1] 
        : null
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.eventEmitter.removeAllListeners();
    this.initialized = false;
    logger.info('Priority Override System cleaned up');
  }
}

// Singleton instance
let priorityOverrideSystemInstance = null;

/**
 * Get the Priority Override System instance
 * @returns {Promise<PriorityOverrideSystem>} Service instance
 */
async function getPriorityOverrideSystem() {
  if (!priorityOverrideSystemInstance) {
    priorityOverrideSystemInstance = new PriorityOverrideSystem();
    await priorityOverrideSystemInstance.initialize();
  }
  
  return priorityOverrideSystemInstance;
}

module.exports = {
  getPriorityOverrideSystem
};
