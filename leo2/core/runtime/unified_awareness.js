/**
 * UnifiedAwareness Stub (Leo 2.0)
 * Implements UnifiedAwareness contract.
 */
class UnifiedAwareness {
  constructor({ memoryGraph, llm, identity, logger }) {
    this.memoryGraph = memoryGraph;
    this.llm = llm;
    this.identity = identity;
    this.logger = logger;
  }
  async initialize() {
    this.logger.info('[UnifiedAwareness] Initialized');
    return true;
  }
  async process(input, context = {}) {
    // Compose a simple prompt using identity and memory
    const id = this.identity.getContext();
    const memories = await this.memoryGraph.searchMemories('');
    const prompt = (() => {
  if (Array.isArray(memories) && memories.length > 1) {
    this.logger && this.logger.warn && this.logger.warn('[UnifiedAwareness] More than one memory found, only injecting the first.');
  }
  const memoryContent = Array.isArray(memories) && memories.length > 0 ? memories[0].content : '';
  return `You are ${id.name}. ${id.description}\nMemory: ${memoryContent}\nUser: ${input}`;
})();
    return await this.llm.generate(prompt);
  }
}
module.exports = UnifiedAwareness;
