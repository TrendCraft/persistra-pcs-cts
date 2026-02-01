/**
 * Orchestrator Ports Interface
 * 
 * Defines the minimal interface that the OrchestratorAgentLoop needs
 * from the orchestrator. This breaks the circular dependency by avoiding
 * direct class imports between orchestrator and agent loop.
 * 
 * @created 2025-09-08
 * @phase Circular Dependency Fix
 */

/**
 * @typedef {Object} OrchestratorPorts
 * @property {Function} generateResponse - Generate LLM response with context
 * @property {Function} getSalientContext - Get relevant context from CSE
 * @property {Function} updateMemory - Update memory graph with new information
 * @property {Function} searchMemory - Search memory graph for relevant information
 * @property {Function} getAgentState - Get current agent state
 * @property {Function} updateAgentState - Update agent state
 * @property {Function} logInteraction - Log interaction for debugging
 * @property {Function} emitEvent - Emit events through event bus
 */

/**
 * Validates that an object implements the OrchestratorPorts interface
 * @param {Object} ports - The ports object to validate
 * @throws {Error} If ports object is missing required methods
 */
function validateOrchestratorPorts(ports) {
  const requiredMethods = [
    'generateResponse',
    'getSalientContext', 
    'updateMemory',
    'searchMemory',
    'getAgentState',
    'updateAgentState',
    'logInteraction',
    'emitEvent'
  ];

  for (const method of requiredMethods) {
    if (typeof ports[method] !== 'function') {
      throw new Error(`OrchestratorPorts missing required method: ${method}`);
    }
  }
}

module.exports = {
  validateOrchestratorPorts
};
