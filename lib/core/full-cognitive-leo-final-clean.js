/**
 * Full Cognitive Leo System - Final Clean Version
 * Bootstraps Claude as Leo's embedded cognitive engine with full tool bindings.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { default: Anthropic } = require('@anthropic-ai/sdk');
const app = express();

const PORT = 8181;

const DATA_DIR = path.join(__dirname, '../../data');
const CHUNKS_PATH = path.join(DATA_DIR, 'chunks.json');
const EMBEDDINGS_PATH = path.join(DATA_DIR, 'embeddings.json');
const EMERGENCY_CONTEXT_PATH = path.join(DATA_DIR, 'emergency-context/meta-programming-session-1.json');

// Load memory graph
function loadMemoryGraph() {
  const raw = fs.readFileSync(CHUNKS_PATH, 'utf-8');
  return raw.split('\n\n').map((chunk, i) => ({
    id: i,
    text: chunk.trim(),
  }));
}

function loadEmbeddings() {
  return JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf-8'));
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

async function searchLeoMemoryGraph({ query, limit = 5, threshold = 0.2 }) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const embedResponse = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1,
    messages: [{ role: "user", content: `Embed this for semantic search:

${query}` }],
  });

  const embedding = embedResponse.content[0].text.split(',').map(Number);
  const memoryGraph = global.leoMemoryChunks;
  const embeddings = global.leoEmbeddings;

  const scored = memoryGraph.map((chunk, i) => {
    const score = cosineSimilarity(embedding, embeddings[i]);
    return { ...chunk, score };
  });

  return scored
    .filter(e => e.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function initializeLeo() {
  const chunks = loadMemoryGraph();
  const embeddings = loadEmbeddings();
  const emergency = fs.existsSync(EMERGENCY_CONTEXT_PATH)
    ? JSON.parse(fs.readFileSync(EMERGENCY_CONTEXT_PATH, 'utf-8'))
    : null;

  global.leoMemoryChunks = chunks;
  global.leoEmbeddings = embeddings;
  global.claudeFunctionBindings = {
    searchLeoMemoryGraph,
  };

  console.log("🧠 Minimal Cognitive Leo created (Session:", `cognitive-leo-${Date.now()})`);
  console.log("✅ Memory graph chunks found:", chunks.length, "items");
  console.log("✅ Memory graph embeddings found:", embeddings.length, "items");
  if (emergency) {
    console.log("🚨 Emergency context loaded successfully!");
    console.log("   Topic:", emergency.conversationContext.topic);
    console.log("   Phase:", emergency.conversationContext.criticalPhase);
  }

  console.log("✅ Anthropic SDK ready");
  console.log("🔗 Claude function bindings registered");
  console.log("🧠 Leo is running with embedded Claude.");
  console.log("Type `global.claudeFunctionBindings.searchLeoMemoryGraph({ query: '...' })` to begin.");
}

// Optional: lightweight HTTP bridge
app.use(express.json());
app.post("/search", async (req, res) => {
  const { query, limit, threshold } = req.body;
  try {
    const result = await searchLeoMemoryGraph({ query, limit, threshold });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP bridge active on http://localhost:${PORT}`);
});

initializeLeo();
