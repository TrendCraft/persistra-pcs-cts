#!/usr/bin/env node

/**
 * Full Cognitive Leo - HTTP Bridged Version
 * Claude Cognitive Engine embedded with HTTP access to Leo functions
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { MinimalCognitiveLeo } = require('./minimal-cognitive-leo');
dotenv.config();

class FullCognitiveLeo extends MinimalCognitiveLeo {
  constructor(options = {}) {
    super(options);
    this.api = null;
    this.memoryInterface = null;
    this.sessionId = `cognitive-leo-${Date.now()}`;
    this.projectRoot = process.cwd();
    this.dataDir = path.join(this.projectRoot, 'data');
  }

  async initialize() {
    console.log(`🧠 Minimal Cognitive Leo created (Session: ${this.sessionId})`);
    console.log(`🚀 Initializing Minimal Cognitive Leo...`);
    const chunksPath = path.join(this.dataDir, 'chunks.jsonl');
    const embeddingsPath = path.join(this.dataDir, 'embeddings.jsonl');
    const emergencyContext = path.join(this.dataDir, 'emergency-context', 'meta-programming-session-1.json');

    this.chunks = fs.readFileSync(chunksPath, 'utf-8').split('\n').filter(Boolean).map(JSON.parse);
    this.embeddings = fs.readFileSync(embeddingsPath, 'utf-8').split('\n').filter(Boolean).map(JSON.parse);

    console.log(`✅ Memory graph chunks found: ${this.chunks.length} items`);
    console.log(`✅ Memory graph embeddings found: ${this.embeddings.length} items`);

    if (fs.existsSync(emergencyContext)) {
      const ctx = JSON.parse(fs.readFileSync(emergencyContext, 'utf-8'));
      console.log('🚨 Emergency context loaded successfully!');
      console.log(`   Previous session: ${ctx.conversationContext.sessionId}`);
      console.log(`   Topic: ${ctx.conversationContext.topic}`);
      console.log(`   Phase: ${ctx.conversationContext.criticalPhase}`);
    }

    console.log(`📊 Session ID: ${this.sessionId}`);
    console.log(`📂 Data directory: ${this.dataDir}`);
    console.log(`🏠 Project root: ${this.projectRoot}`);

    // Anthropic API Setup
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    this.api = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log(`✅ Anthropic SDK ready`);

    // Bind search interface
    this.memoryInterface = {
      searchLeoMemoryGraph: ({ query, limit = 5, threshold = 0.15 }) => {
        const queryLower = query.toLowerCase();
        return this.chunks
          .map(chunk => {
            const content = (chunk.content || chunk.text || '').toLowerCase();
            let score = 0;
            if (content.includes(queryLower)) score += 10;
            queryLower.split(' ').forEach(word => {
              score += (content.match(new RegExp(word, 'g')) || []).length;
            });
            return { content: chunk.content, file: chunk.file, score };
          })
          .filter(r => r.score >= threshold * 10)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }
    };

    console.log(`🔗 Claude function bindings registered`);
    this.startHttpBridge();
  }

  startHttpBridge() {
    const app = express();
    app.use(express.json());

    app.post('/search', (req, res) => {
      const { query, limit, threshold } = req.body;
      const results = this.memoryInterface.searchLeoMemoryGraph({ query, limit, threshold });
      res.json(results);
    });

    const port = process.env.LEO_PORT || 7788;
    app.listen(port, () => {
      console.log(`🌐 HTTP bridge online at http://localhost:${port}/search`);
      console.log(`🧠 Leo is running with embedded Claude + HTTP access.`);
      console.log(`Use: curl -X POST http://localhost:${port}/search -H "Content-Type: application/json" -d '{ "query": "Leo architecture", "limit": 5 }'`);
    });
  }
}

const fullLeo = new FullCognitiveLeo();
fullLeo.initialize();
