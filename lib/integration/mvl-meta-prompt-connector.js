/**
 * MVL Meta-Prompt Connector
 * 
 * This module connects the MVL (Minimally Viable Leo) with the existing meta-prompting layer.
 * It synchronizes session context, search results, and other shared state between the two systems.
 * 
 * @module lib/integration/mvl-meta-prompt-connector
 * @author Leo Development Team
 * @created May 27, 2025
 */

const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Import meta-prompt layer components
const metaPromptLayer = require('./meta-prompt-layer');
const unifiedPromptingService = require('../services/unified-prompting-service').unifiedPromptingService;
const sessionAwarenessAdapter = require('../adapters/session-awareness-adapter');
const clipboardBridge = require('../core/clipboard-bridge');

// Component name for logging and events
const COMPONENT_NAME = 'mvl-meta-prompt-connector';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Initialization state
let initialized = false;
let initializing = false;
let initPromise = null;

/**
 * Initialize the MVL Meta-Prompt Connector
 * 
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
async function initialize(options = {}) {
  // If already initialized, return immediately
  if (initialized) {
    logger.debug(`${COMPONENT_NAME} already initialized`);
    return { success: true, alreadyInitialized: true };
  }
  
  // If initialization is in progress, return the existing promise
  if (initPromise) {
    logger.debug(`${COMPONENT_NAME} initialization already in progress`);
    return initPromise;
  }
  
  // Set initializing flag and create initialization promise
  initializing = true;
  initPromise = doInitialize(options);
  return initPromise;
}

/**
 * Internal initialization implementation
 * 
 * @private
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
async function doInitialize(options = {}) {
  logger.info(`Initializing ${COMPONENT_NAME}`);
  
  try {
    // Initialize meta-prompt layer components
    logger.info('Initializing meta-prompt layer components');
    
    try {
      await metaPromptLayer.initialize();
      logger.info('Meta-prompt layer initialized successfully');
    } catch (error) {
      logger.warn(`Meta-prompt layer initialization failed: ${error.message}`);
    }
    
    try {
      await unifiedPromptingService.initialize();
      logger.info('Unified prompting service initialized successfully');
    } catch (error) {
      logger.warn(`Unified prompting service initialization failed: ${error.message}`);
    }
    
    // Set up event listeners for synchronization
    setupEventListeners();
    
    // Set up global function overrides
    setupGlobalFunctionOverrides();
    
    // Set initialization flags
    initialized = true;
    initializing = false;
    
    logger.info(`${COMPONENT_NAME} initialized successfully`);
    
    // Emit initialization event
    eventBus.emit('service:initialized', { 
      service: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return { success: true, message: 'Initialized successfully' };
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    initializing = false;
    return { success: false, error: error.message };
  }
}

/**
 * Set up event listeners for synchronization between MVL and meta-prompt layer
 * 
 * @private
 */
function setupEventListeners() {
  logger.info('Setting up event listeners for synchronization');
  
  // Listen for session context updates from MVL
  eventBus.on('mvl:sessionContextUpdated', (data) => {
    logger.debug('Received session context update from MVL');
    
    try {
      // Update session context in meta-prompt layer
      sessionAwarenessAdapter.updateSessionContext(data);
      logger.debug('Updated session context in meta-prompt layer');
    } catch (error) {
      logger.error(`Failed to update session context in meta-prompt layer: ${error.message}`);
    }
  }, COMPONENT_NAME);
  
  // Listen for session context updates from meta-prompt layer
  eventBus.on('meta-prompt-layer:sessionContextUpdated', (data) => {
    logger.debug('Received session context update from meta-prompt layer');
    
    try {
      // Update session context in MVL
      if (global.sessionContext) {
        Object.assign(global.sessionContext, data);
        logger.debug('Updated session context in MVL');
      } else {
        logger.warn('Cannot update MVL session context: global.sessionContext is not defined');
      }
    } catch (error) {
      logger.error(`Failed to update session context in MVL: ${error.message}`);
    }
  }, COMPONENT_NAME);
  
  // Listen for cognitive state preservation events
  eventBus.on('mvl:cognitiveStatePreserved', (data) => {
    logger.debug('Cognitive state preserved by MVL');
    
    try {
      // Notify meta-prompt layer
      eventBus.emit('meta-prompt-layer:externalStatePreserved', data, COMPONENT_NAME);
    } catch (error) {
      logger.error(`Failed to notify meta-prompt layer of state preservation: ${error.message}`);
    }
  }, COMPONENT_NAME);
}

/**
 * Set up global function overrides to integrate with meta-prompt layer
 * 
 * @private
 */
function setupGlobalFunctionOverrides() {
  logger.info('Setting up global function overrides');
  
  // Store original functions if they exist
  const originalSearchMemoryGraph = global.searchMemoryGraph;
  const originalPreserveCognitiveState = global.preserveCognitiveState;
  const originalLeoStatus = global.leoStatus;
  
  // Override searchMemoryGraph to use meta-prompt layer's search
  if (typeof originalSearchMemoryGraph === 'function') {
    logger.debug('Overriding global.searchMemoryGraph');
    
    global.searchMemoryGraph = async (query, options = {}) => {
      logger.debug(`searchMemoryGraph called with query: "${query}"`);
      
      try {
        // Call original function
        const originalResults = await originalSearchMemoryGraph(query, options);
        
        // Also search using meta-prompt layer
        try {
          const semanticContextManager = require('../services/semantic-context-manager');
          const metaPromptResults = await semanticContextManager.search(query, {
            maxResults: options.maxResults || 8,
            minRelevanceScore: options.minRelevanceScore || 0.3,
            ...options
          });
          
          // Merge results (could be more sophisticated)
          if (metaPromptResults && metaPromptResults.results) {
            logger.debug(`Found ${metaPromptResults.results.length} results from meta-prompt layer`);
            
            // Add meta-prompt results to original results if they don't already exist
            if (originalResults && originalResults.results) {
              const existingIds = new Set(originalResults.results.map(r => r.id || r.chunk_id));
              
              for (const result of metaPromptResults.results) {
                if (!existingIds.has(result.id || result.chunk_id)) {
                  originalResults.results.push(result);
                }
              }
              
              // Update result count
              if (originalResults.resultCount !== undefined) {
                originalResults.resultCount = originalResults.results.length;
              }
              
              logger.debug(`Merged results, total: ${originalResults.results.length}`);
            }
          }
        } catch (metaPromptError) {
          logger.warn(`Failed to search using meta-prompt layer: ${metaPromptError.message}`);
        }
        
        return originalResults;
      } catch (error) {
        logger.error(`searchMemoryGraph failed: ${error.message}`);
        
        // Try to fall back to meta-prompt layer's search
        try {
          logger.debug('Falling back to meta-prompt layer search');
          const semanticContextManager = require('../services/semantic-context-manager');
          return await semanticContextManager.search(query, options);
        } catch (fallbackError) {
          logger.error(`Fallback search failed: ${fallbackError.message}`);
          throw error; // Throw original error
        }
      }
    };
  }
  
  // Override preserveCognitiveState to also preserve state in meta-prompt layer
  if (typeof originalPreserveCognitiveState === 'function') {
    logger.debug('Overriding global.preserveCognitiveState');
    
    global.preserveCognitiveState = async () => {
      logger.debug('preserveCognitiveState called');
      
      try {
        // Call original function
        const originalResult = await originalPreserveCognitiveState();
        
        // Also preserve state using meta-prompt layer
        try {
          const contextPreservationSystem = require('../services/context-preservation-system');
          await contextPreservationSystem.preserveState();
          logger.debug('State preserved in meta-prompt layer');
        } catch (metaPromptError) {
          logger.warn(`Failed to preserve state in meta-prompt layer: ${metaPromptError.message}`);
        }
        
        return originalResult;
      } catch (error) {
        logger.error(`preserveCognitiveState failed: ${error.message}`);
        
        // Try to fall back to meta-prompt layer's state preservation
        try {
          logger.debug('Falling back to meta-prompt layer state preservation');
          const contextPreservationSystem = require('../services/context-preservation-system');
          return await contextPreservationSystem.preserveState();
        } catch (fallbackError) {
          logger.error(`Fallback state preservation failed: ${fallbackError.message}`);
          throw error; // Throw original error
        }
      }
    };
  }
  
  // Override leoStatus to include meta-prompt layer status
  if (typeof originalLeoStatus === 'function') {
    logger.debug('Overriding global.leoStatus');
    
    global.leoStatus = () => {
      logger.debug('leoStatus called');
      
      try {
        // Call original function
        const originalStatus = originalLeoStatus();
        
        // Add meta-prompt layer status
        try {
          const metaPromptStatus = {
            metaPromptLayer: {
              initialized: metaPromptLayer.isInitialized ? metaPromptLayer.isInitialized() : false,
              unifiedPromptingInitialized: unifiedPromptingService.initialized || false
            }
          };
          
          // Merge statuses
          return { ...originalStatus, ...metaPromptStatus };
        } catch (metaPromptError) {
          logger.warn(`Failed to get meta-prompt layer status: ${metaPromptError.message}`);
          return originalStatus;
        }
      } catch (error) {
        logger.error(`leoStatus failed: ${error.message}`);
        
        // Return basic status
        return {
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    };
  }
}

/**
 * Launch the enhanced prompting terminal UI
 * 
 * @param {Object} options - Launch options
 * @returns {Promise<Object>} Launch result
 */
async function launchEnhancedPromptingTerminal(options = {}) {
  logger.info('Launching enhanced prompting terminal UI');
  
  try {
    const { spawn } = require('child_process');
    
    // Determine the path to the enhanced prompting script
    const scriptPath = path.join(process.cwd(), 'bin', 'leo-enhanced-prompt-with-clipboard.js');
    
    // Check if the script exists
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      logger.error(`Enhanced prompting script not found: ${scriptPath}`);
      return { success: false, error: 'Enhanced prompting script not found' };
    }
    
    // Make the script executable
    try {
      fs.chmodSync(scriptPath, '755');
    } catch (chmodError) {
      logger.warn(`Failed to make script executable: ${chmodError.message}`);
    }
    
    // Launch the script
    const enhancedPromptProcess = spawn('node', [scriptPath], {
      stdio: options.stdio || 'inherit',
      detached: options.detached !== false,
      env: { ...process.env, LEO_MVL_INTEGRATED: 'true' }
    });
    
    // Handle process events
    enhancedPromptProcess.on('error', (error) => {
      logger.error(`Enhanced prompting process error: ${error.message}`);
    });
    
    enhancedPromptProcess.on('exit', (code) => {
      logger.info(`Enhanced prompting process exited with code ${code}`);
    });
    
    logger.info('Enhanced prompting terminal UI launched successfully');
    
    return { 
      success: true, 
      message: 'Enhanced prompting terminal UI launched successfully',
      process: enhancedPromptProcess
    };
  } catch (error) {
    logger.error(`Failed to launch enhanced prompting terminal UI: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Export the module API
module.exports = {
  initialize,
  launchEnhancedPromptingTerminal,
  isInitialized: () => initialized
};
