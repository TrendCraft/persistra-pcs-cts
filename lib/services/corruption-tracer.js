#!/usr/bin/env node
/**
 * Embedding Corruption Tracer
 * Traces embeddings through generation, storage, retrieval, and CSE processing.
 */
const fs = require('fs');
const path = require('path');

// Load TSE and CSE modules as needed
const tse = require('./true-semantic-embeddings');
let EmergentCSE;
try {
  EmergentCSE = require('../../leo2/core/emergence/EmergentCSE');
} catch {}

// Utility to print embedding summary
function printEmbedding(label, emb) {
  if (!emb) {
    console.log(`[${label}] MISSING`);
    return;
  }
  const arr = Array.from(emb);
  console.log(`[${label}] type: ${Object.prototype.toString.call(emb)}, length: ${arr.length}, first 5:`, arr.slice(0, 5));
  if (arr.every(x => x === 0)) console.log(`[${label}] ALL ZEROS - CORRUPTED!`);
}

(async () => {
  // 1. Generate embedding directly
  const testText = 'embedding corruption test';
  const embDirect = await tse.generate(testText);
  printEmbedding('Direct Generation', embDirect);

  // 2. Simulate storing and loading
  const serialized = JSON.stringify(Array.from(embDirect));
  const loaded = JSON.parse(serialized);
  printEmbedding('After JSON round-trip', loaded);

  // 3. If you use Float32Array, test conversion
  const floatArr = new Float32Array(loaded);
  printEmbedding('Float32Array from loaded', floatArr);

  // 4. If you have a memory/chunk loading function, test it
  try {
    const chunkPath = path.resolve(__dirname, '../../leo2/core/emergence/chunks-sample.json');
    if (fs.existsSync(chunkPath)) {
      const chunks = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
      for (let i = 0; i < Math.min(3, chunks.length); ++i) {
        printEmbedding(`Chunk[${i}] embedding`, chunks[i].embedding);
      }
    }
  } catch (err) {
    console.warn('Could not test chunk file:', err.message);
  }

  // 5. If CSE is available, test its chunk loading
  if (EmergentCSE && typeof EmergentCSE === 'function') {
    try {
      const cse = new EmergentCSE();
      if (typeof cse.loadChunks === 'function') {
        await cse.loadChunks();
        const chunks = cse.chunks || [];
        for (let i = 0; i < Math.min(3, chunks.length); ++i) {
          printEmbedding(`CSE Chunk[${i}] embedding`, chunks[i].embedding);
        }
      }
    } catch (err) {
      console.warn('Could not test EmergentCSE:', err.message);
    }
  }
})();
