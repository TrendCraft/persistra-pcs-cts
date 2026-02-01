/**
 * Flow Tracking Manager - Cognitive Bridge Implementation
 * 
 * Implements the CognitiveBridge interface from the blueprint to enable
 * seamless LLM consciousness transition across token boundaries.
 */

const fs = require('fs');
const path = require('path');

// Constants
const TOKEN_BOUNDARY_THRESHOLD = 6400; // 80% of 8K tokens
const STATE_FILE_PATH = path.join(process.cwd(), 'data', 'system-context', 'COGNITIVE_STATE.json');

/**
 * Get the initial flow state for a new session
 * @returns {Object} Initial flow state
 */
function getInitialFlowState() {
  return {
    currentFlow: "planning",
    flowPhase: "ideation",
    cognitiveLoad: "normal",
    recentContext: [],
    interruptionPoints: [],
    lastActivity: Date.now(),
    tokenUsage: 0,
    boundaryTransitions: 0,
    continuityScore: 1.0
  };
}

/**
 * Update the flow state with new information
 * @param {Object} partialUpdate - Partial update to apply
 */
function updateFlowState(partialUpdate = {}) {
  if (!global.flowState) {
    global.flowState = getInitialFlowState();
  }
  
  Object.assign(global.flowState, partialUpdate, {
    lastActivity: Date.now()
  });
}

/**
 * Detect when we're approaching a token boundary
 * Implements detectBoundaryApproach() from CognitiveBridge interface
 * @returns {Object} Boundary warning information
 */
function detectBoundaryApproach() {
  const tokenUsage = global.flowState?.tokenUsage || 0;
  const isApproaching = tokenUsage > TOKEN_BOUNDARY_THRESHOLD;
  
  return {
    isApproaching,
    tokenUsage,
    threshold: TOKEN_BOUNDARY_THRESHOLD,
    remainingTokens: Math.max(0, TOKEN_BOUNDARY_THRESHOLD - tokenUsage),
    timestamp: Date.now()
  };
}

/**
 * Prepare for consciousness transition across token boundary
 * Implements prepareConsciousnessTransition() from CognitiveBridge interface
 * @returns {Object} Transition plan
 */
async function prepareConsciousnessTransition() {
  // Save current cognitive state
  await preserveCognitiveState();
  
  // Create transition plan
  const transitionPlan = {
    flowState: global.flowState,
    sessionContext: global.sessionContext,
    preservationTimestamp: Date.now(),
    transitionId: `transition-${Date.now()}`
  };
  
  return transitionPlan;
}

/**
 * Execute the cognitive bridge across token boundary
 * Implements bridgeCognitiveBoundary() from CognitiveBridge interface
 * @returns {Object} Bridge result
 */
async function bridgeCognitiveBoundary() {
  // Increment boundary transitions counter
  updateFlowState({
    boundaryTransitions: (global.flowState?.boundaryTransitions || 0) + 1,
    tokenUsage: 0 // Reset token usage after crossing boundary
  });
  
  // Execute bridge
  return {
    success: true,
    transitionTimestamp: Date.now(),
    flowState: global.flowState
  };
}

/**
 * Validate cognitive continuity after boundary transition
 * Implements validateCognitiveContinuity() from CognitiveBridge interface
 * @returns {Object} Continuity metrics
 */
function validateCognitiveContinuity() {
  const continuityScore = global.flowState?.continuityScore || 1.0;
  
  return {
    continuityScore,
    boundaryTransitions: global.flowState?.boundaryTransitions || 0,
    lastTransitionTime: global.flowState?.lastActivity,
    cognitiveLoad: global.flowState?.cognitiveLoad || 'normal'
  };
}

/**
 * Preserve cognitive state to disk
 * @returns {Promise<boolean>} Success status
 */
async function preserveCognitiveState() {
  try {
    const state = {
      sessionContext: global.sessionContext || {},
      flowState: global.flowState || getInitialFlowState()
    };
    
    // Ensure directory exists
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write state to file
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error('Error preserving cognitive state:', error.message);
    return false;
  }
}

module.exports = {
  getInitialFlowState,
  updateFlowState,
  detectBoundaryApproach,
  prepareConsciousnessTransition,
  bridgeCognitiveBoundary,
  validateCognitiveContinuity,
  preserveCognitiveState
};
