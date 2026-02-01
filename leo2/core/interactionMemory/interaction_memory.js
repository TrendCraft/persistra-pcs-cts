/**
 * InteractionMemory Stub (Leo 2.0)
 * Implements InteractionMemory contract.
 */
class InteractionMemory {
  async initialize(config = {}) {
    this.history = [];
    return true;
  }
  async recordInteraction(input, output, meta = {}) {
    const rec = { id: `int_${this.history.length+1}`, input, output, timestamp: Date.now(), metadata: meta };
    this.history.push(rec);
    return rec.id;
  }
  async getRecentInteractions(limit = 10) {
    return this.history.slice(-limit);
  }
}
module.exports = InteractionMemory;
