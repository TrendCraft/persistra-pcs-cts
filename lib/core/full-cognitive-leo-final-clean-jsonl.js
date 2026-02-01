const fs = require('fs');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const DATA_DIR = path.resolve(__dirname, '../../data');
const CHUNKS_FILE = path.join(DATA_DIR, 'chunks.jsonl');
const EMBEDDINGS_FILE = path.join(DATA_DIR, 'embeddings.json');
const CONTEXT_FILE = path.join(DATA_DIR, 'emergency-context/meta-programming-session-1.json');

class CognitiveLeo {
  constructor() {
    this.sessionId = `cognitive-leo-${Date.now()}`;
    this.memoryChunks = [];
    this.embeddings = [];
    this.context = {};
    console.log(`🧠 Minimal Cognitive Leo created (Session: ${this.sessionId})`);
  }

  initialize() {
    console.log('🚀 Initializing Minimal Cognitive Leo...');
    this.loadMemoryGraph();
    this.loadEmergencyContext();
    this.setupClaudeBindings();
    this.startHttpBridge();
    console.log(`📊 Session ID: ${this.sessionId}`);
    console.log(`📂 Data directory: ${DATA_DIR}`);
    console.log(`🏠 Project root: ${path.resolve(__dirname, '../../')}`);
    console.log('🧠 Leo is running with embedded Claude.');
    console.log('Type `global.claudeFunctionBindings.searchLeoMemoryGraph({ query: "..." })` to begin.');
  }

  loadMemoryGraph() {
    try {
      const lines = fs.readFileSync(CHUNKS_FILE, 'utf-8').trim().split('\n');
      this.memoryChunks = lines.map(line => JSON.parse(line));
      const rawEmbeddings = fs.readFileSync(EMBEDDINGS_FILE, 'utf-8');
      this.embeddings = JSON.parse(rawEmbeddings);
      console.log(`✅ Memory graph chunks found: ${this.memoryChunks.length} items`);
      console.log(`✅ Memory graph embeddings found: ${this.embeddings.length} items`);
    } catch (error) {
      console.error('❌ Failed to load memory graph or embeddings:', error);
    }
  }

  loadEmergencyContext() {
    try {
      const rawContext = fs.readFileSync(CONTEXT_FILE, 'utf-8');
      this.context = JSON.parse(rawContext);
      console.log('🚨 Emergency context loaded successfully!');
      console.log(`   Previous session: ${this.context.conversationContext.sessionId}`);
      console.log(`   Topic: ${this.context.conversationContext.topic}`);
      console.log(`   Phase: ${this.context.conversationContext.criticalPhase}`);
    } catch (error) {
      console.warn('⚠️ No emergency context found or failed to load:', error.message);
    }
  }

  setupClaudeBindings() {
    const anthropic = require('@anthropic-ai/sdk');
    const client = new anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('✅ Anthropic SDK ready');

    function searchLeoMemoryGraph({ query, limit = 5, threshold = 0.15 }) {
      const results = this.memoryChunks
        .map((chunk, index) => {
          const relevance = Math.random(); // Placeholder scoring
          return { chunk, relevance };
        })
        .filter(item => item.relevance >= threshold)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, limit);
      return results;
    }

    global.claudeFunctionBindings = {
      searchLeoMemoryGraph: searchLeoMemoryGraph.bind(this),
    };
    console.log('🔗 Claude function bindings registered');
  }

  startHttpBridge() {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/search') {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          const { query, limit, threshold } = JSON.parse(body);
          const results = global.claudeFunctionBindings.searchLeoMemoryGraph({ query, limit, threshold });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(8181, () => {
      console.log('🌐 HTTP bridge active on http://localhost:8181');
    });
  }
}

const leo = new CognitiveLeo();
leo.initialize();
