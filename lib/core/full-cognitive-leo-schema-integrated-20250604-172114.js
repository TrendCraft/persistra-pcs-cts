// full-cognitive-leo.js with embedded schema bootstrapping
// Generated: {timestamp}

const fs = require('fs');
const path = require('path');
const express = require('express');
const readline = require('readline');
const chokidar = require('chokidar');
const { spawn } = require('child_process');
const { createServer } = require('http');
const { parse } = require('jsonlines');
const { loadEmbeddings, cosineSimilarity } = require('./generate-embedding.js'); // hypothetical helper
const { loadClaudeSDK, registerClaudeFunctions } = require('./claude-interface'); // hypothetical helper

// Load the core CognitiveLeo class and schema loader
class CognitiveLeo {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.projectRoot = process.cwd();
        this.dataDir = path.join(this.projectRoot, 'data');
        this.memoryGraph = [];
        this.embeddings = [];
        this.schemaBootstrap = [];
    }

    initialize() {
        this.loadSchemaNodes();
        this.loadMemoryGraph();
        this.loadEmbeddings();
        this.injectSchemaToGraph();
        this.setupHTTPBridge();
        this.launchREPL();
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

    semanticSearch(query) {
        return this.memoryGraph.map((node, idx) => {
            const sim = cosineSimilarity(query, this.embeddings[idx].embedding);
            return { node, score: sim };
        }).sort((a, b) => b.score - a.score).slice(0, 5);
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
}

// Initialize Leo
const leo = new CognitiveLeo("cognitive-leo-" + Date.now());
leo.initialize();
