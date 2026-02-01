// loadAndMergeChunksEmbeddings.js
// Canonical loader for merging and normalizing chunks + embeddings
// Usage: const loadAndMergeChunksEmbeddings = require('./loadAndMergeChunksEmbeddings');

const fs = require('fs');
const path = require('path');

/**
 * Loads a JSONL file and returns an array of parsed objects.
 */
function loadJSONL(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  return lines.filter(Boolean).map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Loads a JSON or JSONL file and returns an array of objects.
 */
function loadArrayFromFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  if (filePath.endsWith('.jsonl')) {
    return loadJSONL(filePath);
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(data);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Normalize chunk/embedding IDs (string, trimmed, lowercase)
 */
function normalizeId(id) {
  return (typeof id === 'string') ? id.trim().toLowerCase() : String(id);
}

/**
 * Main loader: returns merged, deduped, embedding-attached chunks array
 * @param {string} chunksPath
 * @param {string} embeddingsPath
 * @returns {Array<{...chunk, embedding: Array<number>|undefined}>}
 */
function loadAndMergeChunksEmbeddings(chunksPath, embeddingsPath) {
  const chunks = loadArrayFromFile(chunksPath).map(chunk => {
    // Normalize both id and chunk_id
    let id = chunk.id || chunk.chunk_id;
    let chunk_id = chunk.chunk_id || chunk.id;
    id = normalizeId(id);
    chunk_id = normalizeId(chunk_id);
    return {
      ...chunk,
      id,
      chunk_id
    };
  });
  
  const rawEmbeddings = loadArrayFromFile(embeddingsPath);
  
  // Handle two formats:
  // 1. Object format: {id: "...", embedding: [...]}
  // 2. Raw array format: [...] (embeddings are in same order as chunks)
  
  let embeddingMap = new Map();
  
  if (rawEmbeddings.length > 0) {
    const firstEmb = rawEmbeddings[0];
    
    if (Array.isArray(firstEmb)) {
      // Raw array format - embeddings are in same order as chunks
      console.log(`[loadAndMergeChunksEmbeddings] Using raw array format: ${rawEmbeddings.length} embeddings`);
      
      for (let i = 0; i < Math.min(chunks.length, rawEmbeddings.length); i++) {
        const chunk = chunks[i];
        const embedding = rawEmbeddings[i];
        
        if (chunk.id && Array.isArray(embedding)) {
          embeddingMap.set(chunk.id, embedding);
        }
      }
    } else {
      // Object format - map by id
      console.log(`[loadAndMergeChunksEmbeddings] Using object format: ${rawEmbeddings.length} embeddings`);
      
      const embeddings = rawEmbeddings.map(e => {
        // Normalize both id and chunk_id
        let id = e.id || e.chunk_id;
        let chunk_id = e.chunk_id || e.id;
        id = normalizeId(id);
        chunk_id = normalizeId(chunk_id);
        return {
          ...e,
          id,
          chunk_id
        };
      });
      
      for (const e of embeddings) {
        embeddingMap.set(e.id, e.embedding || e.vector || e.values);
      }
    }
  }
  
  // Dedup chunks by id, attach embedding
  const seen = new Set();
  const merged = [];
  let skippedCount = 0;
  
  for (const chunk of chunks) {
    if (!chunk.id || seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    
    const embedding = embeddingMap.get(chunk.id);
    if (!embedding) {
      console.log(`[loadAndMergeChunksEmbeddings] Skipping chunk without embedding: ${chunk.id}`);
      skippedCount++;
      continue;
    }
    
    merged.push({
      ...chunk,
      embedding
    });
  }
  
  console.log(`[loadAndMergeChunksEmbeddings] Successfully merged ${merged.length} chunks (skipped ${skippedCount})`);
  return merged;
}

module.exports = loadAndMergeChunksEmbeddings;
