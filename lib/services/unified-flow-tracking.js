/**
 * Unified Flow Tracking Service
 * 
 * This service consolidates multiple legacy flow tracking implementations:
 * - flowTrackingManager.js (lib/core)
 * - flow-tracking-service.js (lib/services)
 * - flow-tracking.js (src/leo-codex/services)
 * 
 * The consolidated service provides:
 * - Token boundary detection and cognitive continuity
 * - Flow state tracking and cognitive load estimation
 * - Integration with Unified Live Updater
 * - Event handling and flow context generation
 */

// Dependencies
const path = require('path');
const fs = require('fs').promises;
const eventBus = require('../utils/event-bus');
const logger = require('../utils/logger');
const configService = require('../utils/config-service');
const pathUtils = require('../utils/path-utils');

// Implementation layers
const FlowTrackingCore = require('./flow-tracking/core-layer');
const FlowTrackingService = require('./flow-tracking/service-layer');
const FlowTrackingIntegration = require('./flow-tracking/integration-layer');

// Constants
const COMPONENT_NAME = 'unified-flow-tracking';
const LOG_PREFIX = '[UnifiedFlowTracking]';

class UnifiedFlowTrackingService {
  constructor() {
    this.config = {};
    this.coreLayer = null;
    this.serviceLayer = null;
    this.integrationLayer = null;
    this.isInitialized = false;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        this.logger.info(`${LOG_PREFIX} Service already initialized`);
        return true;
      }
      
      if (!this.config.ENABLED) {
        this.logger.info(`${LOG_PREFIX} Flow tracking disabled by configuration`);
        return false;
      }
      
      this.logger.info(`${LOG_PREFIX} Initializing Unified Flow Tracking Service`);
      
      // Ensure required directories exist
      await fs.mkdir(this.config.DATA_DIR, { recursive: true });
      await fs.mkdir(this.config.FLOW_DATA_DIR, { recursive: true });
      
      // Initialize implementation layers
      this.logger.debug(`${LOG_PREFIX} Initializing Core Layer`);
      this.coreLayer = new FlowTrackingCore(this.config, this.logger, COMPONENT_NAME);
      await this.coreLayer.initialize();
      
      this.logger.debug(`${LOG_PREFIX} Initializing Service Layer`);
      this.serviceLayer = new FlowTrackingService(this.config, this.logger, COMPONENT_NAME, this.coreLayer);
      await this.serviceLayer.initialize();
      
      this.logger.debug(`${LOG_PREFIX} Initializing Integration Layer`);
      this.integrationLayer = new FlowTrackingIntegration(
        this.config, 
        this.logger, 
        COMPONENT_NAME, 
        this.coreLayer, 
        this.serviceLayer
      );
      await this.integrationLayer.initialize();
      
      // Register system event handlers
      eventBus.on('system:ready', this.onSystemReady.bind(this), COMPONENT_NAME);
      eventBus.on('system:shutdown', this.onSystemShutdown.bind(this), COMPONENT_NAME);
      
      this.isInitialized = true;
      this.logger.info(`${LOG_PREFIX} Unified Flow Tracking Service initialized successfully`);
      return true;
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error initializing service: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * Handle system ready event
   * @param {Object} data - Event data
   * @private
   */
  onSystemReady(data) {
    this.logger.info(`${LOG_PREFIX} System ready event received`);
    
    // Ensure everything is initialized
    if (!this.isInitialized) {
      this.initialize().catch(error => {
        this.logger.error(`${LOG_PREFIX} Error during initialization on system ready: ${error.message}`, { error });
      });
    }
  }

  /**
   * Start a new flow
   * @param {string} flowType - Type of flow to start
   * @param {Object} context - Initial context for the flow
   * @returns {Promise<Object>} New flow state
   */
  async startNewFlow(flowType, context = {}) {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return null;
      }
      
      this.logger.info(`${LOG_PREFIX} Starting new flow: ${flowType}`);
      
      if (this.serviceLayer) {
        return await this.serviceLayer.updateFlowState({
          type: flowType,
          phase: 'initial',
          context: context.description || 'New flow started'
        });
      }
      
      return null;
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error starting new flow: ${error.message}`, { error });
      return null;
    }
  }

  /**
   * Generate a summary of the current flow
   * @param {Object} options - Summary generation options
   * @returns {Promise<Object>} Flow summary
   */
  async generateFlowSummary(options = {}) {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return {};
      }
      
      this.logger.debug(`${LOG_PREFIX} Generating flow summary`);
      
      if (this.integrationLayer && typeof this.integrationLayer.generateFlowSummary === 'function') {
        return await this.integrationLayer.generateFlowSummary(options);
      }
      
      return {};
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error generating flow summary: ${error.message}`, { error });
      return {};
    }
  }

  /**
   * Generate flow context for the current state
   * @param {Object} options - Context generation options
   * @returns {Promise<Object>} Flow context
   */
  async generateFlowContext(options = {}) {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return {};
      }
      
      this.logger.debug(`${LOG_PREFIX} Generating flow context`);
      
      if (this.integrationLayer && typeof this.integrationLayer.generateFlowContext === 'function') {
        return await this.integrationLayer.generateFlowContext(options);
      }
      
      return {};
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error generating flow context: ${error.message}`, { error });
      return {};
    }
  }

  /**
   * Detect if we're approaching a token boundary
   * @returns {Object} Boundary approach status
   */
  detectBoundaryApproach() {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return { isApproaching: false };
      }
      
      this.logger.debug(`${LOG_PREFIX} Detecting boundary approach`);
      
      if (this.coreLayer && typeof this.coreLayer.detectBoundaryApproach === 'function') {
        return this.coreLayer.detectBoundaryApproach();
      }
      
      return { isApproaching: false };
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error detecting boundary approach: ${error.message}`, { error });
      return { isApproaching: false, error: error.message };
    }
  }

  /**
   * Get the current flow state
   * @returns {Object} Current flow state
   */
  getCurrentFlowState() {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return null;
      }
      
      if (this.serviceLayer && typeof this.serviceLayer.getCurrentFlowState === 'function') {
        return this.serviceLayer.getCurrentFlowState();
      }
      
      return null;
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error getting current flow state: ${error.message}`, { error });
      return null;
    }
  }

  /**
   * Update configuration with new values
   * @param {Object} newConfig - New configuration values
   */
  updateConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      
      // Update config in all layers
      if (this.coreLayer && typeof this.coreLayer.updateConfig === 'function') {
        this.coreLayer.updateConfig(this.config);
      }
      
      if (this.serviceLayer && typeof this.serviceLayer.updateConfig === 'function') {
        this.serviceLayer.updateConfig(this.config);
      }
      
      if (this.integrationLayer && typeof this.integrationLayer.updateConfig === 'function') {
        this.integrationLayer.updateConfig(this.config);
      }
      
      this.logger.debug(`${LOG_PREFIX} Configuration updated`);
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error updating configuration: ${error.message}`, { error });
    }
  }

  /**
   * Clean up resources and shut down
   * @returns {Promise<boolean>} Success status
   */
  async shutdown() {
    try {
      if (!this.isInitialized || this.isShuttingDown) {
        return true;
      }
      
      this.isShuttingDown = true;
      this.logger.info(`${LOG_PREFIX} Shutting down Unified Flow Tracking Service`);
      
      // Unregister event listeners
      eventBus.off('system:ready', COMPONENT_NAME);
      eventBus.off('system:shutdown', COMPONENT_NAME);
      
      // Shut down implementation layers in reverse order
      if (this.integrationLayer && typeof this.integrationLayer.shutdown === 'function') {
        await this.integrationLayer.shutdown();
      }
      
      if (this.serviceLayer && typeof this.serviceLayer.shutdown === 'function') {
        await this.serviceLayer.shutdown();
      }
      
      if (this.coreLayer && typeof this.coreLayer.shutdown === 'function') {
        await this.coreLayer.shutdown();
      }
      
      this.isInitialized = false;
      this.isShuttingDown = false;
      this.logger.info(`${LOG_PREFIX} Unified Flow Tracking Service shut down successfully`);
      return true;
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error during shutdown: ${error.message}`, { error });
      this.isShuttingDown = false;
      return false;
    }
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} Initialization status
   */
  isServiceInitialized() {
    return this.isInitialized;
  }
  
  /**
   * Handle system shutdown event
   * @param {Object} data - Event data
   * @private
   */
  onSystemShutdown(data) {
    this.logger.info(`${LOG_PREFIX} System shutdown event received`);
    this.shutdown().catch(error => {
      this.logger.error(`${LOG_PREFIX} Error during shutdown: ${error.message}`, { error });
    });
  }
  
  /**
   * Update token usage for boundary detection
   * @param {number} tokenCount - Current token count
   * @returns {Object} Updated boundary status
   */
  updateTokenUsage(tokenCount) {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return { isApproaching: false };
      }
      
      this.logger.debug(`${LOG_PREFIX} Updating token usage: ${tokenCount}`);
      
      if (this.coreLayer && typeof this.coreLayer.updateFlowState === 'function') {
        this.coreLayer.updateFlowState({ tokenUsage: tokenCount });
        return this.detectBoundaryApproach();
      }
      
      return { isApproaching: false };
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error updating token usage: ${error.message}`, { error });
      return { isApproaching: false, error: error.message };
    }
  }
  
  /**
   * Prepare for consciousness transition at token boundary
   * @param {Object} options - Transition options
   * @returns {Promise<Object>} Transition context
   */
  async prepareConsciousnessTransition(options = {}) {
    try {
      if (!this.isInitialized || !this.config.ENABLED) {
        return {};
      }
      
      this.logger.info(`${LOG_PREFIX} Preparing consciousness transition`);
      
      // Generate comprehensive context to preserve consciousness
      const flowContext = await this.generateFlowContext({
        includeTokenUsage: true,
        includeActiveFiles: true,
        includeRecentActivity: true,
        includeConversationSummary: true,
        ...options
      });
      
      // Notify that we're preparing for transition
      eventBus.emit('flow:preparing-transition', { 
        flowState: this.getCurrentFlowState(),
        contextSize: JSON.stringify(flowContext).length
      }, COMPONENT_NAME);
      
      return flowContext;
    } catch (error) {
      this.logger.error(`${LOG_PREFIX} Error preparing consciousness transition: ${error.message}`, { error });
      return {};
    }
  }
}

// Create and export a singleton instance
const unifiedFlowTrackingService = new UnifiedFlowTrackingService();

// Define layer access functions for testing and advanced usage
const getCoreFunctions = () => {
  if (!unifiedFlowTrackingService.coreLayer) {
    return {};
  }
  return {
    detectBoundaryApproach: unifiedFlowTrackingService.coreLayer.detectBoundaryApproach.bind(unifiedFlowTrackingService.coreLayer),
    updateFlowState: unifiedFlowTrackingService.coreLayer.updateFlowState.bind(unifiedFlowTrackingService.coreLayer)
  };
};

const getServiceFunctions = () => {
  if (!unifiedFlowTrackingService.serviceLayer) {
    return {};
  }
  return {
    getCurrentFlowState: unifiedFlowTrackingService.serviceLayer.getCurrentFlowState.bind(unifiedFlowTrackingService.serviceLayer),
    updateFlowState: unifiedFlowTrackingService.serviceLayer.updateFlowState.bind(unifiedFlowTrackingService.serviceLayer)
  };
};

const getIntegrationFunctions = () => {
  if (!unifiedFlowTrackingService.integrationLayer) {
    return {};
  }
  return {
    generateFlowContext: unifiedFlowTrackingService.integrationLayer.generateFlowContext.bind(unifiedFlowTrackingService.integrationLayer),
    generateFlowSummary: unifiedFlowTrackingService.integrationLayer.generateFlowSummary.bind(unifiedFlowTrackingService.integrationLayer)
  };
};

// Attach layer access functions to the exported service
unifiedFlowTrackingService.getCoreFunctions = getCoreFunctions;
unifiedFlowTrackingService.getServiceFunctions = getServiceFunctions;
unifiedFlowTrackingService.getIntegrationFunctions = getIntegrationFunctions;

module.exports = unifiedFlowTrackingService;
