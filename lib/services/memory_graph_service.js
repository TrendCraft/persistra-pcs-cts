// memory-graph-service.js

const fs = require('fs');
const path = require('path');

class MemoryGraphService {
  constructor(config = {}) {
    this.graph = {
      nodes: new Map(), // nodeId => { id, content, salience }
      edges: [], // { from, to, type }
    };
    this.graphFilePath = config.graphFilePath || path.resolve(__dirname, '../../data/memory-graph.jsonl');
  }

  async initialize() {
    try {
      const fileData = await fs.promises.readFile(this.graphFilePath, 'utf-8');
      const lines = fileData.split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.type === 'node') this.graph.nodes.set(entry.id, entry);
        else if (entry.type === 'edge') this.graph.edges.push(entry);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  getNode(id) {
    return this.graph.nodes.get(id);
  }

  getAllNodes(minSalience = 0) {
    return Array.from(this.graph.nodes.values()).filter(n => (n.salience || 0) >= minSalience);
  }

  getEdgesFrom(id) {
    return this.graph.edges.filter(e => e.from === id);
  }

  addNode(node) {
    this.graph.nodes.set(node.id, node);
  }

  addEdge(edge) {
    this.graph.edges.push(edge);
  }

  async saveGraph() {
    const entries = [];
    for (const node of this.graph.nodes.values()) {
      entries.push(JSON.stringify({ type: 'node', ...node }));
    }
    for (const edge of this.graph.edges) {
      entries.push(JSON.stringify({ type: 'edge', ...edge }));
    }
    await fs.promises.writeFile(this.graphFilePath, entries.join('\n'));
  }

  semanticSearchChunks(queryEmbedding, similarityFn, threshold = 0.75, max = 10) {
    return this.getAllNodes()
      .map(node => ({
        node,
        score: similarityFn(queryEmbedding, node.embedding)
      }))
      .filter(res => res.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, max);
  }
}

module.exports = MemoryGraphService;
