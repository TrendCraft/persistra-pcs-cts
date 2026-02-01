#!/usr/bin/env node
/**
 * TSE Embedding Backfill Script
 *
 * Generates TSE embeddings for all existing memories that don't have them.
 */

const path = require('path');
const fs = require('fs');

async function backfillTSEEmbeddings() {
  console.log('🔄 TSE EMBEDDING BACKFILL');
  console.log('='.repeat(40));

  // Load MemoryGraph
  const MemoryGraph = require('./memoryGraph');
  const memoryGraph = new MemoryGraph();
  if (typeof memoryGraph.initialize === 'function') {
    await memoryGraph.initialize();
  }

  // Load all memories
  const { memoryManager } = require('../../../lib/services/memory-manager.js');
  let allMemories = await memoryManager.searchMemories('semantic', () => true);
  if (!Array.isArray(allMemories)) allMemories = [];
  const flatten = (item) => {
    if (item.key && item.value) return { id: item.key, ...item.value };
    if (item.id) return item;
    return { ...item };
  };
  allMemories = allMemories.map(flatten);

  let backfilled = 0;
  let skipped = 0;
  let errors = 0;

  for (const memory of allMemories) {
    try {
      if (!memory.id || !memory.content || typeof memory.content !== 'string') {
        skipped++;
        continue;
      }
      // Check if embedding already exists in in-memory map
      if (memoryGraph._semanticEmbeddings && memoryGraph._semanticEmbeddings.has(memory.id)) {
        skipped++;
        continue;
      }
      // If memory has embedding property, skip
      if (memory.embedding && Array.isArray(memory.embedding) && memory.embedding.length > 0) {
        skipped++;
        continue;
      }
      // Generate and store embedding
      const embedding = await memoryGraph.embeddings.generateSemanticEmbedding(memory.content);
      if (Array.isArray(embedding) && embedding.length > 0 && embedding.some(x => x !== 0)) {
        if (!memoryGraph._semanticEmbeddings) memoryGraph._semanticEmbeddings = new Map();
        memoryGraph._semanticEmbeddings.set(memory.id, embedding);
        backfilled++;
        console.log(`✅ Backfilled embedding for memory ${memory.id}`);
      } else {
        console.warn(`⚠️ Invalid embedding generated for memory ${memory.id}`);
        errors++;
      }
    } catch (err) {
      console.error(`❌ Failed to backfill ${memory.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n📊 Backfill Results:');
  console.log(`✅ Backfilled: ${backfilled}`);
  console.log(`⚠️ Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log('\n🎉 TSE embedding backfill complete!');
}

if (require.main === module) {
  backfillTSEEmbeddings();
}

module.exports = { backfillTSEEmbeddings };
