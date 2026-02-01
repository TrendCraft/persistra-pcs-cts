/**
 * MemoryGraph Stub (Leo 2.0)
 * Implements MemoryGraph contract.
 */
class MemoryGraph {
  async initialize(options = {}) {
    this.memories = [];
    this.embeddings = options.embeddings;
    return true;
  }
  async storeMemory(memory) {
    memory.id = `mem_${this.memories.length+1}`;
    this.memories.push(memory);
    return memory.id;
  }
  async retrieveMemory(id) {
    return this.memories.find(m => m.id === id) || null;
  }
  async searchMemories(query, options = {}) {
    // Returns all memories for now
    return this.memories;
  }
  async getRelatedNodes(id, opts = {}) {
    return [];
  }

  async addMemory(memory) {
    return this.storeMemory(memory);
  }

  async getMemoryCount() {
    return this.memories.length;
  }

  // Stub: return all memories as 'chunks'
  async getAllChunks(options = {}) {
    // Normalize all returned chunks so each has both .id and .chunk_id
    for (const obj of this.memories) {
      if (obj && obj.chunk_id && !obj.id) obj.id = obj.chunk_id;
      if (obj && obj.id && !obj.chunk_id) obj.chunk_id = obj.id;
    }
    return this.memories;
  }

  async saveToDisk() {
    return true;
  }
  async loadFromDisk() {
    return true;
  }

  // Flexible stub for updateFile
  async updateFile(arg1, arg2) {
    let memory;
    if (typeof arg1 === 'string') {
      // Called as updateFile(filePath, changeType)
      memory = {
        id: `mem_${this.memories.length+1}`,
        file: arg1,
        summary: 'Semantic summary placeholder',
        meta: { changeType: arg2 },
        salient: true
      };
    } else if (typeof arg1 === 'object' && arg1 !== null) {
      // Called as updateFile({ file, summary, meta })
      memory = {
        id: `mem_${this.memories.length+1}`,
        file: arg1.file,
        summary: arg1.summary,
        meta: arg1.meta,
        salient: true
      };
    } else {
      throw new Error('Invalid arguments to updateFile');
    }
    this.memories.push(memory);
    return memory.id;
  }
}
module.exports = MemoryGraph;
