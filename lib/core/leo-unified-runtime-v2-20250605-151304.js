// Leo Unified Runtime v2 with Identity Injector and Claude Integration
// Generated: 2025-06-05T15:13:04

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const express = require('express');
const chokidar = require('chokidar');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Anthropic } = require('@anthropic-ai/sdk');

const { embedAndScore } = require('./true-semantic-embeddings-adapter');
const { initializeClaudeInterface } = require('./claude-interface');

class CognitiveLeo {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.projectRoot = process.cwd();
    this.dataDir = path.join(this.projectRoot, 'data');
    this.identityPath = path.join(this.dataDir, 'identity');
    this.memoryGraph = [];
    this.embeddings = [];
    this.schemaBootstrap = [];
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
    this.loadIdentityNodes();
    this.loadMemoryGraph();
    this.loadEmbeddings();
    this.injectSchemaToGraph();
    this.injectIdentityToGraph();
    this.initializeClaude();
    this.setupHTTPBridge();
    this.launchREPL();
    this.watchFileSystem();
  }

  loadSchemaNodes() {
    const schemaPath = path.join(this.dataDir, 'leo_meta_schema.jsonl');
    if (!fs.existsSync(schemaPath)) {
      console.warn('⚠️ Schema file not found.');
      return;
    }
    const lines = fs.readFileSync(schemaPath, 'utf-8').split('\n').filter(Boolean);
    this.schemaBootstrap = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.schemaBootstrap.length} schema meta-nodes.`);
  }

  injectSchemaToGraph() {
    this.memoryGraph.unshift(...this.schemaBootstrap);
    console.log('📌 Injected schema nodes into memory graph with salience priority.');
  }

  loadIdentityNodes() {
    const identityFile = path.join(this.identityPath, 'identity-core.jsonl');
    if (!fs.existsSync(identityFile)) {
      console.warn('⚠️ Identity node file not found.');
      this.identityNodes = [];
      return;
    }
    const lines = fs.readFileSync(identityFile, 'utf-8').split('\n').filter(Boolean);
    this.identityNodes = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.identityNodes.length} identity nodes.`);
  }

  injectIdentityToGraph() {
    if (this.identityNodes?.length) {
      this.memoryGraph.unshift(...this.identityNodes);
      console.log('📌 Injected identity nodes into memory graph.');
    }
  }

  loadMemoryGraph() {
    const chunkPath = path.join(this.dataDir, 'chunks.jsonl');
    if (!fs.existsSync(chunkPath)) {
      console.warn('❌ chunks.jsonl not found.');
      return;
    }
    const lines = fs.readFileSync(chunkPath, 'utf-8').split('\n').filter(Boolean);
    this.memoryGraph.push(...lines.map(line => JSON.parse(line)));
    console.log(`✅ Loaded ${lines.length} memory chunks.`);
  }

  loadEmbeddings() {
    const embedPath = path.join(this.dataDir, 'embeddings.jsonl');
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
