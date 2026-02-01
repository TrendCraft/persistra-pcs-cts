#!/usr/bin/env node

/**
 * Full Cognitive Leo - Complete Embedded Claude+Leo System
 * 
 * This implements the embedded Claude cognitive engine within Leo's cognitive shell.
 * Claude operates as Leo's reasoning process with direct memory access.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────┐
 * │                    Leo Cognitive Shell                   │
 * │  ┌─────────────────────────────────────────────────────┐ │
 * │  │              Claude Cognitive Engine                │ │
 * │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
 * │  │  │   Reasoning │  │   Memory    │  │   Action    │  │ │
 * │  │  │   Process   │  │   Access    │  │   Execution │  │ │
 * │  │  └─────────────┘  └─────────────┘  └─────────────┘  │ │
 * │  └─────────────────────────────────────────────────────┘ │
 * └─────────────────────────────────────────────────────────┘
 */

//!/usr/bin/env node

/**
 * Full Cognitive Leo - Complete Embedded Claude+Leo System
 */

//!/usr/bin/env node

/**
 * Full Cognitive Leo - Embedded Claude Engine (Live Tool-Binding Version)
 *
 * This script launches Leo with Claude fully embedded and enables real-time
 * memory access via tool-calling functions exposed at runtime.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MinimalCognitiveLeo } = require('./minimal-cognitive-leo');

class ClaudeMemoryInterface {
  constructor({ projectRoot = process.cwd(), dataDir = path.join(process.cwd(), 'data') } = {}) {
    this.projectRoot = projectRoot;
    this.dataDir = dataDir;
    this.initialized = false;
    this.chunks = [];
    this.embeddings = [];
  }

  async initialize() {
    console.log('🧠 Initializing Claude Memory Interface...');
    await this.loadChunks();
    await this.loadEmbeddings();
    this.initialized = true;
    console.log(`✅ Ready: ${this.chunks.length} chunks, ${this.embeddings.length} embeddings`);
  }

  async loadChunks() {
    const file = path.join(this.dataDir, 'chunks.jsonl');
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      this.chunks = raw.split('\n').filter(Boolean).map(JSON.parse);
    } else {
      console.warn('⚠️ No memory chunks found.');
    }
  }

  async loadEmbeddings() {
    const file = path.join(this.dataDir, 'embeddings.jsonl');
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      this.embeddings = raw.split('\n').filter(Boolean).map(JSON.parse);
    }
  }

  async search(query, { limit = 5, threshold = 0.1 } = {}) {
    if (!this.initialized) await this.initialize();
    const q = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    return this.chunks.map(chunk => {
      const text = (chunk.content || chunk.text || '').toLowerCase();
      let score = 0;
      if (text.includes(query.toLowerCase())) score += 10;
      q.forEach(word => {
        const count = (text.match(new RegExp(word, 'g')) || []).length;
        score += count;
      });
      return { score, chunk };
    })
    .filter(res => res.score >= threshold * 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      content: chunk.content || chunk.text,
      file: chunk.file || chunk.source,
      id: chunk.id || chunk.chunk_id,
      relevanceScore: score / 10
    }));
  }
}

class FullCognitiveLeo extends MinimalCognitiveLeo {
  constructor(options = {}) {
    super(options);
    this.claudeMemoryInterface = new ClaudeMemoryInterface();
    this.anthropic = null;
  }

  async initialize() {
    const ok = await super.initialize();
    if (!ok) return false;

    await this.claudeMemoryInterface.initialize();

    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log('✅ Anthropic SDK ready');
    } catch (e) {
      console.warn('⚠️ Claude SDK not available');
    }

    this.registerToolBindings();
    return true;
  }

  registerToolBindings() {
    global.claudeFunctionBindings = {
      searchLeoMemoryGraph: async ({ query, limit = 5, threshold = 0.15 }) => {
        return await this.claudeMemoryInterface.search(query, { limit, threshold });
      },
      listAvailableFunctions: async () => Object.keys(global.claudeFunctionBindings),
    };
    console.log('🔗 Claude function bindings registered');
  }
}

(async () => {
  const leo = new FullCognitiveLeo({ apiKey: process.env.ANTHROPIC_API_KEY });
  await leo.initialize();

  console.log('🧠 Leo is running with embedded Claude.');
  console.log('Type `global.claudeFunctionBindings.searchLeoMemoryGraph({ query: \"...\" })` to begin.');

  // Keep process alive to accept tool calls
  process.stdin.resume();
})();