// Leo Unified Runtime with Schema + Claude Integration
// Generated: 2025-06-04T18:14:58.376141

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const express = require('express');
const chokidar = require('chokidar');
require('dotenv').config();
const { Anthropic } = require('@anthropic-ai/sdk');

// === Embedding Loader ===
const { loadEmbeddings, cosineSimilarity } = require('./generate-embedding');

// === Claude Integration (Mocked here, modularize if needed) ===
function loadClaudeSDK() {
    try {
        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });
        return anthropic;
    } catch (err) {
        console.error("❌ Failed to initialize Anthropic:", err);
        return null;
    }
}

function registerClaudeFunctions(anthropic) {
    global.claudeFunctionBindings = {
        searchLeoMemoryGraph: async ({ query }) => {
            return leo.semanticSearch(query);
        }
    };
    console.log("🔗 Claude function bindings registered");
}

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
        console.log("🧠 Starting Cognitive Leo...");
        this.loadSchemaNodes();
        this.loadMemoryGraph();
        this.loadEmbeddings();
        this.injectSchemaToGraph();
        this.setupHTTPBridge();
        this.initializeClaude();
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
        this.memoryGraph.push(...lines.map(line => JSON.parse(line)));
        console.log(`✅ Loaded ${lines.length} memory chunks.`);
    }

    loadEmbeddings() {
        const embedPath = path.join(this.dataDir, 'embeddings.jsonl');
        if (!fs.existsSync(embedPath)) {
            console.warn("⚠️ embeddings.jsonl not found.");
            return;
        }
        const lines = fs.readFileSync(embedPath, 'utf-8').split('\n').filter(Boolean);
        this.embeddings = lines.map(line => JSON.parse(line));
        console.log(`✅ Loaded ${this.embeddings.length} embeddings.`);
    }

    semanticSearch(query) {
        return this.memoryGraph.map((node, idx) => {
            const sim = cosineSimilarity(query, this.embeddings[idx]?.embedding || []);
            return { node, score: sim };
        }).sort((a, b) => b.score - a.score).slice(0, 5);
    }

    setupHTTPBridge() {
        const app = express();
        app.use(express.json());
        app.post('/search', (req, res) => {
            const query = req.body.query;
            const results = this.semanticSearch(query);
            res.json(results);
        });
        app.listen(8181, () => {
            console.log("🌐 HTTP bridge active on http://localhost:8181");
        });
    }

    initializeClaude() {
        this.sdk = loadClaudeSDK();
        if (this.sdk) {
            registerClaudeFunctions(this.sdk);
            console.log('✅ Anthropic SDK ready');
        }
    }

    launchREPL() {
        console.log("💬 Leo REPL started. Type your thoughts:");
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.on('line', (input) => {
            const thoughts = this.semanticSearch(input);
            console.log("🧠 Top relevant memory:", thoughts.map(t => t.node.text || '[No Text]'));
        });
    }

    watchFileSystem() {
        const watcher = chokidar.watch(this.projectRoot, {
            ignored: /node_modules|\.git|\.DS_Store/,
            persistent: true
        });
        watcher.on('change', (filePath) => {
            console.log(`🔄 Detected file change: ${filePath}`);
            // Future: trigger re-chunking + embedding
        });
    }
}

const leo = new CognitiveLeo("cognitive-leo-" + Date.now());
leo.initialize();
console.log("📂 Data directory:", leo.dataDir);
console.log("🧠 Leo is running with embedded Claude.");
console.log("Type global.claudeFunctionBindings.searchLeoMemoryGraph({ query: '...' }) to begin.");
