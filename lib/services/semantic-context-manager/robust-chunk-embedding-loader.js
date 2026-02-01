// robust-chunk-embedding-loader.js
// Loads and merges chunks.jsonl and embeddings.jsonl by id, returning [{...chunk, embedding}]
const fs = require('fs');
const readline = require('readline');

/**
 * Loads JSONL file line-by-line into an array.
 */
async function loadJSONL(filepath) {
  const arr = [];
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      // Normalize IDs: ensure both .id and .chunk_id are set
      if (obj.chunk_id && !obj.id) obj.id = obj.chunk_id;
      if (obj.id && !obj.chunk_id) obj.chunk_id = obj.id;
      arr.push(obj);
    } catch (err) {
      console.error(`Malformed JSON at ${filepath}, skipping line:`, line);
    }
  }
  return arr;
}

/**
 * Merges chunks and embeddings by 'id'.
 * Returns array of { ...chunk, embedding }
 */
async function loadAndMergeChunksEmbeddings(chunksPath, embeddingsPath) {
  const chunks = await loadJSONL(chunksPath);
  const embeddings = await loadJSONL(embeddingsPath);

  // Handle two formats:
  // 1. Object format: {id: "...", embedding: [...]}
  // 2. Raw array format: [...] (embeddings are in same order as chunks)
  
  let embeddingMap = {};
  
  // Check if first embedding is an object or raw array
  if (embeddings.length > 0) {
    const firstEmb = embeddings[0];
    
    if (Array.isArray(firstEmb)) {
      // Raw array format - embeddings are in same order as chunks
      console.log(`📊 Using raw array format: ${embeddings.length} embeddings`);
      
      for (let i = 0; i < Math.min(chunks.length, embeddings.length); i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const cid = chunk.id || chunk.chunk_id;
        
        if (cid && Array.isArray(embedding)) {
          embeddingMap[cid] = embedding;
        }
      }
    } else {
      // Object format - map by id
      console.log(`📊 Using object format: ${embeddings.length} embeddings`);
      
      for (const emb of embeddings) {
        const eid = emb.id || emb.chunk_id;
        if (eid && Array.isArray(emb.embedding)) {
          embeddingMap[eid] = emb.embedding;
        } else if (!eid) {
          console.warn('Embedding record missing id/chunk_id:', emb);
        }
      }
    }
  }

  // Merge into one array, skip if no embedding found
  const merged = [];
  for (const chunk of chunks) {
    const cid = chunk.id || chunk.chunk_id;
    if (!cid) {
      console.warn('Chunk record missing id/chunk_id:', chunk);
      continue;
    }
    const embedding = embeddingMap[cid];
    if (!embedding) {
      console.warn(`No embedding for chunk id ${cid}, skipping.`);
      continue;
    }
    merged.push({ ...chunk, embedding });
  }
  
  console.log(`✅ Successfully merged ${merged.length} chunks with embeddings`);
  return merged;
}

module.exports = { loadAndMergeChunksEmbeddings };
