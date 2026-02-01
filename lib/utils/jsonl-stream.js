/**
 * JSONL Stream Utilities
 * 
 * Utilities for streaming JSONL files to handle large datasets efficiently.
 * This module provides streaming implementations for reading and processing
 * large JSONL files without loading the entire file into memory.
 */

const fs = require('fs');
const readline = require('readline');
const { EventEmitter } = require('events');

/**
 * Stream JSONL file and process each line
 * @param {string} filePath - Path to JSONL file
 * @returns {AsyncGenerator} Async generator that yields parsed JSON objects
 */
async function* streamJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    if (line.trim()) {
      try {
        yield JSON.parse(line);
      } catch (err) {
        console.error(`Error parsing JSON line: ${err.message}`);
      }
    }
  }
}

/**
 * Create an indexed map from a JSONL file with specified key
 * @param {string} filePath - Path to JSONL file
 * @param {string} indexKey - Key to use as index
 * @param {Function} [processItem] - Optional function to process each item
 * @returns {Promise<Map>} Map of indexed items
 */
async function createIndexedMapFromJsonl(filePath, indexKey, processItem = null) {
  const indexedMap = new Map();
  
  for await (const item of streamJsonlFile(filePath)) {
    if (item && item[indexKey] !== undefined) {
      const processedItem = processItem ? processItem(item) : item;
      indexedMap.set(item[indexKey], processedItem);
    }
  }
  
  return indexedMap;
}

/**
 * Process JSONL file in batches to avoid memory issues
 * @param {string} filePath - Path to JSONL file
 * @param {Function} processBatch - Function to process each batch
 * @param {number} batchSize - Size of each batch
 * @returns {Promise<void>}
 */
async function processBatchedJsonl(filePath, processBatch, batchSize = 1000) {
  let batch = [];
  let count = 0;
  
  for await (const item of streamJsonlFile(filePath)) {
    batch.push(item);
    count++;
    
    if (batch.length >= batchSize) {
      await processBatch(batch);
      batch = [];
    }
  }
  
  // Process remaining items
  if (batch.length > 0) {
    await processBatch(batch);
  }
  
  return count;
}

/**
 * Stream JSONL file and emit events for each item
 * @param {string} filePath - Path to JSONL file
 * @returns {EventEmitter} Event emitter that emits 'item', 'error', and 'end' events
 */
function createJsonlEventStream(filePath) {
  const emitter = new EventEmitter();
  
  (async () => {
    try {
      for await (const item of streamJsonlFile(filePath)) {
        emitter.emit('item', item);
      }
      emitter.emit('end');
    } catch (err) {
      emitter.emit('error', err);
    }
  })();
  
  return emitter;
}

module.exports = {
  streamJsonlFile,
  createIndexedMapFromJsonl,
  processBatchedJsonl,
  createJsonlEventStream
};
