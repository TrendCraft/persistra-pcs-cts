// leo-unified-runtime-20250604-174938.js
// === Leo+Claude Unified Cognitive Runtime ===
// Fully integrated runtime for initializing Leo + embedded Claude with live memory, schema bootstrapping, and file monitoring

const fs = require('fs');
const path = require('path');
const http = require('http');
const chokidar = require('chokidar');
require('dotenv').config();
const jsonlines = require('jsonlines');
const readline = require('readline');
const { Anthropic } = require('@anthropic-ai/sdk');

// === Embedding + Claude Utilities ===
const { generateEmbeddingsForChunks, cosineSimilarity, embedText } = require('./generate-embedding.js');
const { callClaude, registerClaudeFunctionBindings } = require('./claude-interface');

// === Constants ===
const DATA_DIR = path.join(__dirname, '../../data');
const MEMORY_FILE = path.join(DATA_DIR, 'chunks.jsonl');
const EMBEDDINGS_FILE = path.join(DATA_DIR, 'embeddings.json');
const SCHEMA_FILE = path.join(DATA_DIR, 'leo_meta_schema.jsonl');
const SESSION_ID = `cognitive-leo-${Date.now()}`;
const PORT = 8181;

// === In-Memory Graph ===
let memoryChunks = [];
let embeddings = [];

// === Load Memory from JSONL ===
function loadMemoryGraph() {
  memoryChunks = [];
  embeddings = [];
  const parser = jsonlines.parse();
  const stream = fs.createReadStream(MEMORY_FILE).pipe(parser);

  return new Promise((resolve, reject) => {
    parser.on('data', chunk => {
      memoryChunks.push(chunk);
    });
    parser.on('end', async () => {
      try {
        embeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
        resolve();
      } catch (err) {
        console.error('❌ Failed to load embeddings:', err);
        reject(err);
      }
    });
  });
}

// === Load Self-Identity Schema and Boost ===
async function injectSelfSchema() {
  const parser = jsonlines.parse();
  const stream = fs.createReadStream(SCHEMA_FILE).pipe(parser);
  const schemaChunks = [];
  for await (const chunk of stream) schemaChunks.push(chunk);
  const enriched = await generateEmbeddingsForChunks(schemaChunks);
  memoryChunks.push(...schemaChunks);
  embeddings.push(...enriched);
  console.log(`📌 Injected ${schemaChunks.length} schema awareness chunks.`);
}

// === Semantic Search ===
function searchLeoMemoryGraph({ query, topK = 5 }) {
  const queryEmbedding = embedText(query);
  const scored = embeddings.map((e, i) => ({
    score: cosineSimilarity(queryEmbedding, e.vector),
    chunk: memoryChunks[i],
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// === Emergency Context ===
function loadEmergencyContext() {
  const contextPath = path.join(DATA_DIR, 'emergency-context.json');
  if (fs.existsSync(contextPath)) {
    const raw = fs.readFileSync(contextPath, 'utf-8');
    return JSON.parse(raw);
  }
  return null;
}

// === File Watcher for Live Updates ===
function startFileWatcher() {
  const watcher = chokidar.watch(path.join(__dirname, '../../'), {
    ignored: /node_modules|\.git|\.DS_Store|backups/,
    ignoreInitial: true,
    persistent: true
  });

  watcher.on('change', async (filepath) => {
    const content = fs.readFileSync(filepath, 'utf-8');
    const chunk = { file: filepath, content, timestamp: Date.now() };
    const [embedded] = await generateEmbeddingsForChunks([chunk]);
    memoryChunks.push(chunk);
    embeddings.push(embedded);
    console.log(`📡 Live update: ${filepath} → memory graph.`);
  });

  console.log('🧠 Unified Live Updater active. Watching files...');
}

// === Claude REPL with Conversation Capture ===
function startClaudeREPL() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('💬 Claude REPL started. Type to interact.');
  rl.on('line', async (input) => {
    const results = searchLeoMemoryGraph({ query: input });
    const context = results.map(r => r.chunk.content).join('\n---\n');
    const reply = await callClaude(input, context);
    console.log('🤖 Claude:', reply);
    fs.appendFileSync(path.join(DATA_DIR, 'conversation.log'), `User: ${input}\nClaude: ${reply}\n\n`);
  });
}

// === HTTP Bridge ===
function startHTTPBridge() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/search') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { query } = JSON.parse(body);
        const results = searchLeoMemoryGraph({ query });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(PORT, () => {
    console.log(`🌐 HTTP bridge active on http://localhost:${PORT}`);
  });
}

// === Boot Sequence ===
(async () => {
  console.log('🧠 Minimal Cognitive Leo created (Session: ' + SESSION_ID + ')');
  console.log('🚀 Initializing Minimal Cognitive Leo...');

  try {
    await loadMemoryGraph();
    await injectSelfSchema();
  } catch (err) {
    console.warn('⚠️ Memory boot failed. Starting with schema only.');
  }

  const emergency = loadEmergencyContext();
  if (emergency) console.log('🚨 Emergency context loaded successfully!');

  global.claudeFunctionBindings = { searchLeoMemoryGraph };
  registerClaudeFunctionBindings(global.claudeFunctionBindings);

  console.log('✅ Anthropic SDK ready');
  console.log('🔗 Claude function bindings registered');
  console.log('📊 Session ID:', SESSION_ID);
  console.log('📂 Data directory:', DATA_DIR);
  console.log('🧠 Leo is running with embedded Claude.');
  console.log('Type global.claudeFunctionBindings.searchLeoMemoryGraph({ query: "..." }) to begin.');

  startHTTPBridge();
  startFileWatcher();
  startClaudeREPL();
})();
