// leo2/core/cse/cse.js
const path = require('path');
const { rankMemories } = require('./salience_ranker');

class ContextualSalienceEngine {
  constructor({ memoryGraph, flowMonitor, interactionMemory }) {
    this.memoryGraph = memoryGraph;
    this.flowMonitor = flowMonitor;
    this.interactionMemory = interactionMemory;
  }

  /**
   * Selects the most salient context for a prompt using recency, frequency, and identity weighting.
   * @param {Object} params - { query: string, flowState: any }
   * @returns {Promise<{memories: Array, flowState: any, identity: string}>}
   */
  /**
   * Returns a hybrid context object with both salient facts and recency memories
   * @param {Object} params - { query: string, flowState: any }
   * @returns {Promise<{memories: Array, salientMemories: Array<string>, flowState: any, identity: string}>}
   */
  async getHybridContext({ query, flowState }) {
    // Recency: last N dialog turns
    const N = 7;
    const recentMemories = await this.memoryGraph.getRecentMemories({ limit: N });
    // Salience: rank and summarize top K salient facts
    const K = 3;
    const allForSalience = await this.memoryGraph.getRecentMemories({ limit: 30 });
    const ranked = rankMemories(allForSalience, { query });
    const salientMemories = ranked.slice(0, K).map(r => {
      // Try to make a human-readable summary for each salient memory
      const m = r.memory;
      if (m.userInput && m.llmResponse) {
        return `On ${new Date(m.timestamp).toLocaleDateString()}, you said: ${m.userInput} → Leo: ${m.llmResponse}`;
      } else if (m.content) {
        return m.content;
      }
      return JSON.stringify(m);
    });
    // Logging assertion: ensure top-1 salient memory is atomic, not merged
    const Logger = require('../../services/logger');
    const logger = new Logger();
    if (salientMemories.length > 0) {
      const top1 = salientMemories[0] || '';
      const lineCount = (top1.match(/\n/g) || []).length + 1;
      const tokenCount = top1.split(/\s+/).length;
      if (lineCount > 8 || tokenCount > 512) {
        logger.warn(`[CSE] Top-1 salient memory block is too large! Lines: ${lineCount}, Tokens: ${tokenCount}`);
        logger.warn('[CSE] Top-1 salient memory block content:', top1);
        throw new Error('[CSE] Top-1 salient memory block is not atomic—pipeline halted for debugging.');
      }
    }
    const flow = this.flowMonitor.currentFlow;
    return {
      memories: recentMemories,
      salientMemories,
      flowState: flow,
      identity: 'Leo'
    };
  }
}

module.exports = ContextualSalienceEngine;
