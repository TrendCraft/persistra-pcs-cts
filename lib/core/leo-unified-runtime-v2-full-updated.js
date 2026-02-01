// Leo Unified Runtime v2 with Claude Adapter + True Semantic Embedding Integration + Identity Evolution Logging
// Generated: 2025-06-05

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const express = require('express');
const chokidar = require('chokidar');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { embedAndScore } = require('./true-semantic-embeddings-adapter');
const { initializeClaudeInterface } = require('./claude-interface');
const { logIdentityEvolution } = require('../utils/identity-evolution-log');

class CognitiveLeo {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.projectRoot = path.join(__dirname, '..', '..'); // 👈 Go up from /lib/core → /Leo
    this.dataDir = path.join(this.projectRoot, 'data');  // → /Leo/data
    this.identityDir = path.join(this.dataDir, 'identity'); // → /Leo/data/identity
    console.log("🧭 identityDir resolves to:", this.identityDir);
    this.memoryGraph = [];
    this.embeddings = [];
    this.schemaBootstrap = [];
    this.identityBootstrap = [];
    this.sdk = null;
  }

  async generateQueryEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error("Invalid input to generateQueryEmbedding");
    }
    const { getEmbedding } = require('./true-semantic-embeddings-adapter');
    return await getEmbedding(text);
  }

  initialize() {
    console.log('🧠 Starting Cognitive Leo...');
    this.loadSchemaNodes();
    this.loadMemoryGraph();
    this.loadEmbeddings();
    this.loadIdentityBootstrap();
    this.injectSchemaToGraph();
    this.injectIdentityToGraph();
    this.initializeClaude();
    this.setupHTTPBridge();
    this.launchREPL();
    this.watchFileSystem();
  }

  loadSchemaNodes() {
    const schemaPath = path.join(this.identityDir, 'identity-meta-reflective.jsonl');
    if (!fs.existsSync(schemaPath)) {
      console.warn('⚠️ Schema file not found.');
      return;
    }
    const lines = fs.readFileSync(schemaPath, 'utf-8').split('\n').filter(Boolean);
    this.schemaBootstrap = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.schemaBootstrap.length} schema meta-nodes.`);
  }

  loadIdentityBootstrap() {
    const identityPath = path.join(this.identityDir, 'identity-core.jsonl');
    if (!fs.existsSync(identityPath)) {
      console.warn('⚠️ identity-core.jsonl not found.');
      return;
    }
    const lines = fs.readFileSync(identityPath, 'utf-8').split('\n').filter(Boolean);
    this.identityBootstrap = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.identityBootstrap.length} identity nodes.`);
  }

  injectSchemaToGraph() {
    this.memoryGraph.unshift(...this.schemaBootstrap);
    console.log('📌 Injected schema nodes into memory graph with salience priority.');
  }

  injectIdentityToGraph() {
    this.memoryGraph.unshift(...this.identityBootstrap);
    console.log('📌 Injected identity core nodes into memory graph.');
  }

  loadMemoryGraph() {
   const chunkPath = path.join(this.dataDir, 'chunks', 'chunks.jsonl');
    if (!fs.existsSync(chunkPath)) {
      console.warn('❌ chunks.jsonl not found.');
      return;
    }
    const lines = fs.readFileSync(chunkPath, 'utf-8').split('\n').filter(Boolean);
    this.memoryGraph.push(...lines.map(line => JSON.parse(line)));
    console.log(`✅ Loaded ${lines.length} memory chunks.`);
  }

  loadEmbeddings() {
    const embedPath = path.join(this.dataDir, 'embeddings', 'embeddings.jsonl');
    if (!fs.existsSync(embedPath)) {
      console.warn('⚠️ embeddings.jsonl not found.');
      return;
    }
    const lines = fs.readFileSync(embedPath, 'utf-8').split('\n').filter(Boolean);
    this.embeddings = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.embeddings.length} embeddings.`);
  }

  semanticSearch(query, limit = 5, threshold = 0.15) {
    return embedAndScore(query, this.memoryGraph, this.embeddings, limit, threshold);
  }

  updateIdentityNode(originalNode, updatedNode) {
    const timestamp = new Date().toISOString();
    logIdentityEvolution({
      id: originalNode.id,
      timestamp,
      original: originalNode,
      updated: updatedNode
    });
    const index = this.memoryGraph.findIndex(n => n.id === originalNode.id);
    if (index !== -1) this.memoryGraph[index] = updatedNode;
  }

  setupHTTPBridge() {
    const app = express();
    app.use(express.json());
    app.post('/search', (req, res) => {
      const { query, limit, threshold } = req.body;
      const results = this.semanticSearch(query, limit, threshold);
      res.json(results);
    });
    app.listen(8181, () => {
      console.log('🌐 HTTP bridge active on http://localhost:8181');
    });
  }

  initializeClaude() {
    try {
      this.sdk = initializeClaudeInterface(this);
      console.log('✅ Anthropic SDK ready');
    } catch (err) {
      console.error('❌ Anthropic SDK failed to initialize:', err);
    }
  }

  launchREPL() {
    console.log('💬 Leo REPL started. Type your thoughts:');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', input => {
      const results = this.semanticSearch(input);
      console.log('🧠 Top memory nodes:');
      results.forEach(r => console.log(`- ${r.node.text || '[No text]'} (${r.score.toFixed(3)})`));
    });
  }

  watchFileSystem() {
    const watcher = chokidar.watch(this.projectRoot, {
      ignored: /node_modules|\.git|\.DS_Store/,
      persistent: true
    });
    watcher.on('change', filePath => {
      console.log(`🔄 Detected file change: ${filePath}`);
    });
  }
}

const leo = new CognitiveLeo("cognitive-leo-v2-" + Date.now());
global.leo = leo;
leo.initialize();
console.log("📂 Data directory:", leo.dataDir);
console.log("🧠 Leo is running with embedded Claude.");
console.log("Type global.claudeFunctionBindings.searchLeoMemoryGraph({ query: '...' }) to begin.");
