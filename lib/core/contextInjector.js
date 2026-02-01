/**
 * Context Injector - LLM Awareness Engine
 * 
 * Implements the LLMAwarenessEngine interface from the blueprint to
 * continuously maintain LLM awareness of project context, enabling
 * proactive understanding without explicit queries.
 */

const fs = require('fs');
const path = require('path');

// Constants
const BOOTSTRAP_FILE_PATH = path.join(process.cwd(), 'data', 'system-context', 'CLAUDE_BOOTSTRAP.md');

/**
 * Maintain proactive awareness of the project context
 * Implements maintainProactiveAwareness() from LLMCognitiveInterface
 * @returns {Object} Current cognitive state
 */
function maintainProactiveAwareness() {
  // Get current cognitive state
  const cognitiveState = {
    sessionContext: global.sessionContext || {},
    flowState: global.flowState || {},
    timestamp: Date.now()
  };
  
  return cognitiveState;
}

/**
 * Access cognitive memory based on current thought
 * Implements accessCognitiveMemory() from LLMCognitiveInterface
 * @param {string} thought - Current thought or context
 * @returns {Object} Memory response
 */
async function accessCognitiveMemory(thought) {
  // This would normally call the search function, but we'll use a placeholder
  // since the actual search is implemented in leo-cognition.js
  return {
    thought,
    memoryAccessed: true,
    timestamp: Date.now()
  };
}

/**
 * Operate awareness engine in background
 * Implements operateInBackground() from LLMCognitiveInterface
 * @returns {Promise<void>}
 */
async function operateInBackground() {
  // This function runs in the background to maintain awareness
  // In a real implementation, it might periodically check for context changes
  return Promise.resolve();
}

/**
 * Inject context into a prompt
 * @param {string} prompt - Original prompt
 * @param {Object} options - Options including sessionContext and flowState
 * @returns {string} Enhanced prompt with injected context
 */
function inject(prompt, { sessionContext = {}, flowState = {} }) {
  // Get cognitive layers
  const layers = sessionContext.formalLayerNaming?.join(", ") || "Cognition, Memory, Awareness";
  
  // Get current flow
  const currentFlow = flowState?.currentFlow || "unspecified";
  const flowPhase = flowState?.flowPhase || "unspecified";
  
  // Get project vision
  const vision = sessionContext.visionAlignment || "Enable cognitive continuity";
  
  // Get bootstrap content if available
  let bootstrapContent = "";
  try {
    if (fs.existsSync(BOOTSTRAP_FILE_PATH)) {
      bootstrapContent = fs.readFileSync(BOOTSTRAP_FILE_PATH, 'utf8');
    }
  } catch (error) {
    console.error('Error reading bootstrap file:', error.message);
  }
  
  // Build context sections
  const sections = [
    bootstrapContent ? `# Claude Awareness\n${bootstrapContent}` : null,
    `# Cognitive Layers\n${layers}`,
    `# Project Vision\n${vision}`,
    `# Current Flow\nMode: ${currentFlow}\nPhase: ${flowPhase}`,
    `# User Prompt\n${prompt}`
  ].filter(Boolean); // Remove null sections
  
  // Combine all sections
  return sections.join('\n\n').trim();
}

/**
 * Preserve cognitive state across token boundaries
 * Implements preserveCognitiveState() from LLMCognitiveInterface
 * @returns {Object} Cognitive snapshot
 */
function preserveCognitiveState() {
  const snapshot = {
    sessionContext: global.sessionContext || {},
    flowState: global.flowState || {},
    timestamp: Date.now()
  };
  
  return snapshot;
}

/**
 * Restore cognitive state for a new LLM session
 * Implements restoreCognitiveState() from LLMCognitiveInterface
 * @param {Object} snapshot - Cognitive snapshot
 * @returns {Promise<void>}
 */
async function restoreCognitiveState(snapshot) {
  if (snapshot?.sessionContext) {
    global.sessionContext = snapshot.sessionContext;
  }
  
  if (snapshot?.flowState) {
    global.flowState = snapshot.flowState;
  }
  
  return Promise.resolve();
}

module.exports = {
  inject,
  maintainProactiveAwareness,
  accessCognitiveMemory,
  operateInBackground,
  preserveCognitiveState,
  restoreCognitiveState
};
