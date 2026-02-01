/**
 * Binary Embeddings Adapter
 * 
 * This adapter provides a seamless interface between the true semantic embeddings system
 * and binary vector storage, preserving all semantic understanding capabilities while
 * improving storage efficiency and performance.
 */

const fs = require('fs');
const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const configService = require('./config-service');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'binary-embeddings-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Default configuration
const DEFAULT_CONFIG = {
  BINARY_EMBEDDINGS_DIR: path.join(process.cwd(), 'data', 'binary-embeddings'),
  EMBEDDINGS_FILE: path.join(process.cwd(), 'data', 'embeddings.jsonl'),
  VECTOR_CACHE_SIZE: 1000, // Number of vectors to keep in memory
  ENABLE_MMAP: true // Use memory-mapped files for better performance
};

// Configuration with environment variable overrides
const CONFIG = {
  BINARY_EMBEDDINGS_DIR: process.env.LEO_BINARY_EMBEDDINGS_DIR || DEFAULT_CONFIG.BINARY_EMBEDDINGS_DIR,
  EMBEDDINGS_FILE: process.env.LEO_EMBEDDINGS_FILE || DEFAULT_CONFIG.EMBEDDINGS_FILE,
  VECTOR_CACHE_SIZE: parseInt(process.env.LEO_VECTOR_CACHE_SIZE || DEFAULT_CONFIG.VECTOR_CACHE_SIZE.toString()),
  ENABLE_MMAP: process.env.LEO_ENABLE_MMAP !== 'false'
};

// Vector cache for frequently accessed vectors
const vectorCache = new Map();
let metadataIndex = new Map();
let isInitialized = false;

/**
 * Initialize the binary embeddings adapter
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  try {
    logger.info('Initializing binary embeddings adapter');
    
    // Ensure directories exist
    ensureDirectoriesExist();
    
    // Load metadata index
    await loadMetadataIndex();
    
    // Set up event listeners
    setupEventListeners();
    
    isInitialized = true;
    logger.info('Binary embeddings adapter initialized successfully');
    
    // Emit initialized event
    eventBus.emit('component:initialized', {
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Error initializing binary embeddings adapter: ${error.message}`);
    return false;
  }
}

/**
 * Ensure all required directories exist
 */
function ensureDirectoriesExist() {
  const directories = [
    CONFIG.BINARY_EMBEDDINGS_DIR,
    path.dirname(CONFIG.EMBEDDINGS_FILE)
  ];
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      logger.info(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Listen for shutdown events
  eventBus.on('system:shutdown', async () => {
    await shutdown();
  });
  
  // Listen for configuration updates
  eventBus.on('config:updated', (data) => {
    if (data && data.component === COMPONENT_NAME) {
      updateConfiguration(data.config);
    }
  });
  
  // Listen for cache invalidation events
  eventBus.on('cache:invalidated', (data) => {
    if (data && data.component === COMPONENT_NAME) {
      clearCache();
    }
  });
}

/**
 * Update configuration
 * @param {Object} newConfig - New configuration
 */
function updateConfiguration(newConfig) {
  if (!newConfig) return;
  
  Object.keys(newConfig).forEach(key => {
    if (CONFIG.hasOwnProperty(key)) {
      CONFIG[key] = newConfig[key];
      logger.info(`Updated configuration: ${key} = ${newConfig[key]}`);
    }
  });
  
  // Re-ensure directories exist with new configuration
  ensureDirectoriesExist();
}

/**
 * Load metadata index from embeddings file
 * @returns {Promise<boolean>} Success status
 */
async function loadMetadataIndex() {
  try {
    logger.info(`Loading metadata index from ${CONFIG.EMBEDDINGS_FILE}`);
    
    if (!fs.existsSync(CONFIG.EMBEDDINGS_FILE)) {
      logger.warn(`Embeddings file does not exist: ${CONFIG.EMBEDDINGS_FILE}`);
      return false;
    }
    
    // Clear existing index
    metadataIndex = new Map();
    
    // Read the file line by line
    const fileStream = fs.createReadStream(CONFIG.EMBEDDINGS_FILE, { encoding: 'utf8' });
    const readline = require('readline');
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    
    for await (const line of rl) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      try {
        const metadata = JSON.parse(line);
        
        // Check if this is a binary reference entry
        if (metadata.id && metadata.vector_ref) {
          metadataIndex.set(metadata.id, {
            vector_ref: metadata.vector_ref,
            ...metadata
          });
        }
        
        lineCount++;
      } catch (error) {
        logger.warn(`Invalid JSON in embeddings file at line ${lineCount + 1}: ${error.message}`);
      }
    }
    
    logger.info(`Loaded ${metadataIndex.size} metadata entries from ${CONFIG.EMBEDDINGS_FILE}`);
    return true;
  } catch (error) {
    logger.error(`Error loading metadata index: ${error.message}`);
    return false;
  }
}

/**
 * Get a vector by ID
 * @param {string} id - Vector ID
 * @returns {Promise<Float32Array|null>} Vector as Float32Array or null if not found
 */
async function getVector(id) {
  if (!isInitialized) {
    await initialize();
  }
  
  try {
    // Check cache first
    if (vectorCache.has(id)) {
      return vectorCache.get(id);
    }
    
    // Get metadata
    const metadata = metadataIndex.get(id);
    if (!metadata || !metadata.vector_ref) {
      logger.warn(`Vector metadata not found for ID: ${id}`);
      return null;
    }
    
    // Read binary file
    const binaryPath = metadata.vector_ref;
    if (!fs.existsSync(binaryPath)) {
      logger.warn(`Binary vector file not found: ${binaryPath}`);
      return null;
    }
    
    // Read the binary file
    const buffer = fs.readFileSync(binaryPath);
    const vector = new Float32Array(new Uint8Array(buffer).buffer);
    
    // Add to cache
    if (vectorCache.size >= CONFIG.VECTOR_CACHE_SIZE) {
      // Remove oldest entry if cache is full
      const oldestKey = vectorCache.keys().next().value;
      vectorCache.delete(oldestKey);
    }
    
    vectorCache.set(id, vector);
    
    return vector;
  } catch (error) {
    logger.error(`Error getting vector for ID ${id}: ${error.message}`);
    return null;
  }
}

/**
 * Get multiple vectors by IDs
 * @param {Array<string>} ids - Array of vector IDs
 * @returns {Promise<Object>} Map of ID to vector
 */
async function getVectors(ids) {
  if (!isInitialized) {
    await initialize();
  }
  
  const result = {};
  
  for (const id of ids) {
    result[id] = await getVector(id);
  }
  
  return result;
}

/**
 * Store a vector in binary format
 * @param {string} id - Vector ID
 * @param {Array<number>|Float32Array} vector - Vector data
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<boolean>} Success status
 */
async function storeVector(id, vector, metadata = {}) {
  if (!isInitialized) {
    await initialize();
  }
  
  try {
    if (!id || !vector) {
      logger.warn('Missing required parameters: id and vector');
      return false;
    }
    
    // Convert to Float32Array if it's a regular array
    const vectorArray = Array.isArray(vector) ? new Float32Array(vector) : vector;
    
    // Create binary file path
    const binaryPath = path.join(CONFIG.BINARY_EMBEDDINGS_DIR, `${id}.bin`);
    
    // Convert to buffer and write to file
    const buffer = Buffer.from(vectorArray.buffer);
    fs.writeFileSync(binaryPath, buffer);
    
    // Update cache
    vectorCache.set(id, vectorArray);
    
    // Update metadata index
    const metadataEntry = {
      id,
      vector_ref: binaryPath,
      ...metadata,
      timestamp: metadata.timestamp || Date.now()
    };
    
    metadataIndex.set(id, metadataEntry);
    
    // Append to metadata file
    const memoryGraphWriter = require('./memory-graph-writer');
    await memoryGraphWriter.appendToJsonlFile(CONFIG.EMBEDDINGS_FILE, [metadataEntry]);
    
    return true;
  } catch (error) {
    logger.error(`Error storing vector for ID ${id}: ${error.message}`);
    return false;
  }
}

/**
 * Calculate similarity between two vectors
 * @param {string|Array<number>|Float32Array} vecA - First vector or vector ID
 * @param {string|Array<number>|Float32Array} vecB - Second vector or vector ID
 * @returns {Promise<number>} Similarity score between -1 and 1
 */
async function calculateSimilarity(vecA, vecB) {
  try {
    // Resolve vectors if they are IDs
    let vectorA = typeof vecA === 'string' ? await getVector(vecA) : vecA;
    let vectorB = typeof vecB === 'string' ? await getVector(vecB) : vecB;
    
    if (!vectorA || !vectorB) {
      logger.warn('One or both vectors not found');
      return 0;
    }
    
    // Convert to Float32Array if they are regular arrays
    vectorA = Array.isArray(vectorA) ? new Float32Array(vectorA) : vectorA;
    vectorB = Array.isArray(vectorB) ? new Float32Array(vectorB) : vectorB;
    
    // Check dimensions
    if (vectorA.length !== vectorB.length) {
      logger.warn(`Vector dimensions don't match: ${vectorA.length} vs ${vectorB.length}`);
      return 0;
    }
    
    // Calculate cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  } catch (error) {
    logger.error(`Error calculating similarity: ${error.message}`);
    return 0;
  }
}

/**
 * Find similar vectors to a query vector
 * @param {string|Array<number>|Float32Array} queryVec - Query vector or vector ID
 * @param {Object} options - Search options
 * @param {number} options.limit - Maximum number of results
 * @param {number} options.threshold - Similarity threshold
 * @returns {Promise<Array<Object>>} Array of similar vectors with metadata
 */
async function findSimilar(queryVec, options = {}) {
  if (!isInitialized) {
    await initialize();
  }
  
  const limit = options.limit || 10;
  const threshold = options.threshold || 0.7;
  
  try {
    // Resolve query vector if it's an ID
    const queryVector = typeof queryVec === 'string' ? await getVector(queryVec) : queryVec;
    
    if (!queryVector) {
      logger.warn('Query vector not found');
      return [];
    }
    
    // Calculate similarities for all vectors
    const similarities = [];
    
    for (const [id, metadata] of metadataIndex.entries()) {
      const vector = await getVector(id);
      if (vector) {
        const similarity = await calculateSimilarity(queryVector, vector);
        if (similarity >= threshold) {
          similarities.push({
            id,
            similarity,
            metadata: { ...metadata }
          });
        }
      }
    }
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Return top results
    return similarities.slice(0, limit);
  } catch (error) {
    logger.error(`Error finding similar vectors: ${error.message}`);
    return [];
  }
}

/**
 * Clear the vector cache
 */
function clearCache() {
  vectorCache.clear();
  logger.info('Vector cache cleared');
}

/**
 * Shutdown the binary embeddings adapter
 * @returns {Promise<boolean>} Success status
 */
async function shutdown() {
  try {
    logger.info('Shutting down binary embeddings adapter');
    
    // Clear cache
    clearCache();
    
    isInitialized = false;
    logger.info('Binary embeddings adapter shutdown complete');
    return true;
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
    return false;
  }
}

/**
 * Check if the adapter is initialized
 * @returns {boolean} True if initialized
 */
function isInitialized() {
  return isInitialized;
}

/**
 * Get metadata for a vector
 * @param {string} id - Vector ID
 * @returns {Object|null} Metadata or null if not found
 */
function getMetadata(id) {
  return metadataIndex.get(id) || null;
}

// Export the public API
module.exports = {
  initialize,
  shutdown,
  getVector,
  getVectors,
  storeVector,
  calculateSimilarity,
  findSimilar,
  clearCache,
  isInitialized,
  getMetadata,
  CONFIG
};
