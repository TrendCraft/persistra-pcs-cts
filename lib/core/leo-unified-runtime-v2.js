// leo-unified-runtime-v2.js
// Cognitive Leo Runtime with True Semantic Embeddings & Claude Integration
// ====================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const express = require('express');
const chokidar = require('chokidar');
require('dotenv').config();

// === Embedding Adapter Integration ===
const {
  loadEmbeddingsFromFile,
  compareQueryToEmbeddings
} = require('./true-semantic-embeddings-adapter');

// === Claude Interface ===
const { loadClaudeSDK, registerClaudeFunctions } = require('./claude-interface');

// === Cognitive Leo Class ===
class CognitiveLeo {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.projectRoot = process.cwd();
    this.dataDir = path.join(this.projectRoot, 'data');
    this.memoryGraph = [];
    this.embeddings = [];
    this.schemaBootstrap = [];
    this.sdk = null;
  }

  initialize() {
    console.log("\n🧠 Starting Cognitive Leo Runtime...");
    this.loadSchemaNodes();
    this.loadMemoryGraph();
    this.loadEmbeddings();
    this.injectSchemaToGraph();
    this.initializeClaude();
    this.setupHTTPBridge();
    this.launchREPL();
    this.watchFileSystem();
  }

  loadSchemaNodes() {
    const schemaPath = path.join(this.dataDir, 'leo_meta_schema.jsonl');
    if (!fs.existsSync(schemaPath)) {
      console.warn("⚠️ Schema file not found.");
      return;
    }
    const lines = fs.readFileSync(schemaPath, 'utf-8').split('\n').filter(Boolean);
    this.schemaBootstrap = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.schemaBootstrap.length} schema meta-nodes.`);
  }

  injectSchemaToGraph() {
    this.memoryGraph.unshift(...this.schemaBootstrap);
    console.log("📌 Injected schema nodes into memory graph with salience priority.");
  }

  loadMemoryGraph() {
    const chunkPath = path.join(this.dataDir, 'chunks.jsonl');
    if (!fs.existsSync(chunkPath)) {
      console.warn("❌ chunks.jsonl not found.");
      return;
    }
    const lines = fs.readFileSync(chunkPath, 'utf-8').split('\n').filter(Boolean);
    this.memoryGraph = lines.map(line => JSON.parse(line));
    console.log(`✅ Loaded ${this.memoryGraph.length} memory chunks.`);
  }

  async loadEmbeddings() {
    const embedPath = path.join(this.dataDir, 'embeddings.jsonl');
    if (!fs.existsSync(embedPath)) {
      console.warn("⚠️ embeddings.jsonl not found.");
      return;
    }
    this.embeddings = await loadEmbeddingsFromFile(embedPath);
    console.log(`✅ Loaded ${this.embeddings.length} embeddings.`);
  }

  semanticSearch(query, threshold = 0.2, limit = 5) {
    const results = compareQueryToEmbeddings(query, this.embeddings, this.memoryGraph);
    return results.filter(r => r.score >= threshold).slice(0, limit);
  }

  setupHTTPBridge() {
    const app = express();
    app.use(express.json());
    app.post('/search', (req, res) => {
      const { query, limit, threshold } = req.body;
      const results = this.semanticSearch(query, threshold, limit);
      res.json(results);
    });
    app.listen(8181, () => {
      console.log("🌐 HTTP bridge active on http://localhost:8181");
    });
  }

  initializeClaude() {
    this.sdk = loadClaudeSDK();
    if (this.sdk) {
      registerClaudeFunctions(this);
      console.log("✅ Anthropic SDK ready");
    }
  }

  launchREPL() {
    console.log("💬 Leo REPL started. Type your thoughts:");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (input) => {
      const matches = this.semanticSearch(input);
      matches.forEach(m => console.log(`🔍 ${m.score.toFixed(3)}: ${m.node.text || '[No Text]'}`));
    });
  }

  watchFileSystem() {
    const watcher = chokidar.watch(this.projectRoot, {
      ignored: /node_modules|\.git|\.DS_Store/,
      persistent: true
    });
    watcher.on('change', filePath => {
      console.log(`🔄 Detected file change: ${filePath}`);
      // Future: re-chunk and re-embed
    });
  }
}

// === Bootstrap ===
const leo = new CognitiveLeo("cognitive-leo-" + Date.now());
leo.initialize();
console.log("📂 Data directory:", leo.dataDir);
console.log("🧠 Leo is running with embedded Claude.");
console.log("Type global.claudeFunctionBindings.searchLeoMemoryGraph({ query: '...' }) to begin.");
