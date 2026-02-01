/**
 * Cross-Token Boundary Functions
 * 
 * Provides the global functions needed for cross-token boundary continuity
 * using the simplified Enhanced Prompting System v3 approach.
 * 
 * This module replaces the complex Session Boundary Manager with direct
 * context preservation and restoration.
 * 
 * @module lib/services/cross-token-boundary
 * @created June 2, 2025
 */

const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const eventBus = require('../utils/event-bus');
const { createComponentLogger } = require('../utils/logger');

// Create component logger
const COMPONENT_NAME = 'cross-token-boundary';
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration
const COGNITIVE_STATE_DIR = process.env.LEO_COGNITIVE_STATE_DIR || 
                           path.join(process.cwd(), 'data', 'cognitive-state');
const CONTEXT_PRESERVATION_FILE = path.join(COGNITIVE_STATE_DIR, 'preserved-context.json');

/**
 * Initialize the cross-token boundary system
 * @param {Object} options Configuration options
 * @returns {Object} Exposed global functions
 */
function initializeCrossTokenBoundary(options = {}) {
  // Create cognitive state directory if it doesn't exist
  fs.mkdir(COGNITIVE_STATE_DIR, { recursive: true })
    .catch(err => console.error(`Failed to create cognitive state directory: ${err.message}`));
  
  // Setup global functions for cross-token boundary
  global.preserveCognitiveState = preserveCognitiveState;
  global.restoreCognitiveState = restoreCognitiveState;
  
  // Include this in leoStatus if it exists
  if (typeof global.leoStatus === 'function') {
    const originalLeoStatus = global.leoStatus;
    global.leoStatus = () => {
      const status = originalLeoStatus();
      return {
        ...status,
        crossTokenBoundary: true,
        cognitiveStatePreservation: true,
        enhancedPromptingV3: true
      };
    };
  } else {
    global.leoStatus = () => ({
      crossTokenBoundary: true,
      cognitiveStatePreservation: true,
      enhancedPromptingV3: true
    });
  }
  
  console.log('Cross-Token Boundary system initialized');
  
  return {
    preserveCognitiveState,
    restoreCognitiveState,
    getCognitiveState
  };
}

/**
 * Preserve cognitive state for cross-token continuity
 * @param {Object} contextData Context data to preserve
 * @returns {Promise<boolean>} Success status
 */
async function preserveCognitiveState(contextData) {
  try {
    // Ensure directory exists
    await fs.mkdir(COGNITIVE_STATE_DIR, { recursive: true });
    
    const preservedContext = {
      timestamp: Date.now(),
      sessionId: `session-${Date.now()}`,
      ...contextData
    };
    
    // Write context to file (atomic operation)
    const tempFile = `${CONTEXT_PRESERVATION_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(preservedContext, null, 2));
    await fs.rename(tempFile, CONTEXT_PRESERVATION_FILE);
    
    // Emit boundary:detected event for components like Vision Anchor to respond
    logger.debug('Emitting boundary:detected event');
    eventBus.emit('boundary:detected', {
      timestamp: Date.now(),
      source: COMPONENT_NAME,
      preservedContext
    });
    
    return true;
  } catch (error) {
    logger.error(`Failed to preserve cognitive state: ${error.message}`, error);
    // Still emit the event but with an error flag
    eventBus.emit('boundary:detected', {
      timestamp: Date.now(),
      source: COMPONENT_NAME,
      error: true,
      errorMessage: error.message
    });
    return false;
  }
}

/**
 * Restore cognitive state from previous session
 * @param {Object} options Options for restoration
 * @returns {Promise<Object|null>} Restored context or null
 */
async function restoreCognitiveState(options = {}) {
  try {
    const data = await fs.readFile(CONTEXT_PRESERVATION_FILE, 'utf8');
    const preservedContext = JSON.parse(data);
    
    // Check if context is recent (default 24 hours or configurable)
    const maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    const age = Date.now() - preservedContext.timestamp;
    
    if (age < maxAge) {
      // Emit context:injected event for components like Vision Anchor to respond
      logger.debug('Emitting context:injected event');
      eventBus.emit('context:injected', {
        timestamp: Date.now(),
        source: COMPONENT_NAME,
        restoredContext: preservedContext
      });
      
      return preservedContext;
    } else {
      logger.info('Previous context expired, returning null');
      return null;
    }
  } catch (error) {
    // No previous context available or error reading
    logger.debug(`No previous cognitive state available or error reading: ${error.message}`);
    return null;
  }
}

/**
 * Get current cognitive state
 * @returns {Promise<Object|null>} Current cognitive state or null
 */
async function getCognitiveState() {
  try {
    const data = await fs.readFile(CONTEXT_PRESERVATION_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

module.exports = {
  initializeCrossTokenBoundary,
  preserveCognitiveState,
  restoreCognitiveState,
  getCognitiveState
};
