/**
 * Memory Graph Writer Service
 * 
 * A standardized service for writing to the memory graph JSONL files.
 * This ensures consistent formatting and prevents corruption by using
 * atomic write operations and proper validation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { createComponentLogger } = require('../utils/logger');
const configService = require('./config-service');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'memory-graph-writer';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Default configuration
const DEFAULT_CONFIG = {
  EMBEDDINGS_FILE: path.join(process.cwd(), 'data', 'embeddings.jsonl'),
  CHUNKS_FILE: path.join(process.cwd(), 'data', 'chunks.jsonl'),
  BINARY_EMBEDDINGS_DIR: path.join(process.cwd(), 'data', 'binary-embeddings'),
  ENABLE_BINARY_STORAGE: false,
  MAX_BATCH_SIZE: 100,
  WRITE_BUFFER_INTERVAL: 5000, // 5 seconds
  WRITE_BUFFER_MAX_SIZE: 1000
};

// Configuration with environment variable overrides
const CONFIG = {
  EMBEDDINGS_FILE: process.env.LEO_EMBEDDINGS_FILE || DEFAULT_CONFIG.EMBEDDINGS_FILE,
  CHUNKS_FILE: process.env.LEO_CHUNKS_FILE || DEFAULT_CONFIG.CHUNKS_FILE,
  BINARY_EMBEDDINGS_DIR: process.env.LEO_BINARY_EMBEDDINGS_DIR || DEFAULT_CONFIG.BINARY_EMBEDDINGS_DIR,
  ENABLE_BINARY_STORAGE: process.env.LEO_ENABLE_BINARY_STORAGE === 'true' || DEFAULT_CONFIG.ENABLE_BINARY_STORAGE,
  MAX_BATCH_SIZE: parseInt(process.env.LEO_MAX_BATCH_SIZE || DEFAULT_CONFIG.MAX_BATCH_SIZE.toString()),
  WRITE_BUFFER_INTERVAL: parseInt(process.env.LEO_WRITE_BUFFER_INTERVAL || DEFAULT_CONFIG.WRITE_BUFFER_INTERVAL.toString()),
  WRITE_BUFFER_MAX_SIZE: parseInt(process.env.LEO_WRITE_BUFFER_MAX_SIZE || DEFAULT_CONFIG.WRITE_BUFFER_MAX_SIZE.toString())
};

// Write buffers for batching
let chunksBuffer = [];
let embeddingsBuffer = [];
let writeTimer = null;
let isWriting = false;

/**
 * Initialize the memory graph writer
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  try {
    logger.info('Initializing memory graph writer service');
    
    // Ensure directories exist
    ensureDirectoriesExist();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up write buffer timer
    startWriteBufferTimer();
    
    logger.info('Memory graph writer initialized successfully');
    
    // Emit initialized event
    eventBus.emit('component:initialized', {
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Error initializing memory graph writer: ${error.message}`);
    return false;
  }
}

/**
 * Ensure all required directories exist
 */
function ensureDirectoriesExist() {
  const directories = [
    path.dirname(CONFIG.EMBEDDINGS_FILE),
    path.dirname(CONFIG.CHUNKS_FILE)
  ];
  
  if (CONFIG.ENABLE_BINARY_STORAGE) {
    directories.push(CONFIG.BINARY_EMBEDDINGS_DIR);
  }
  
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
 * Start the write buffer timer
 */
function startWriteBufferTimer() {
  if (writeTimer) {
    clearInterval(writeTimer);
  }
  
  writeTimer = setInterval(async () => {
    if (chunksBuffer.length > 0 || embeddingsBuffer.length > 0) {
      await flushBuffers();
    }
  }, CONFIG.WRITE_BUFFER_INTERVAL);
}

/**
 * Flush the write buffers to disk
 * @returns {Promise<boolean>} Success status
 */
async function flushBuffers() {
  if (isWriting) return false;
  
  isWriting = true;
  
  try {
    const chunksToWrite = [...chunksBuffer];
    const embeddingsToWrite = [...embeddingsBuffer];
    
    // Clear the buffers
    chunksBuffer = [];
    embeddingsBuffer = [];
    
    // Write chunks
    if (chunksToWrite.length > 0) {
      await appendToJsonlFile(CONFIG.CHUNKS_FILE, chunksToWrite);
      logger.info(`Wrote ${chunksToWrite.length} chunks to ${CONFIG.CHUNKS_FILE}`);
    }
    
    // Write embeddings
    if (embeddingsToWrite.length > 0) {
      if (CONFIG.ENABLE_BINARY_STORAGE) {
        await appendToBinaryEmbeddings(embeddingsToWrite);
      } else {
        await appendToJsonlFile(CONFIG.EMBEDDINGS_FILE, embeddingsToWrite);
      }
      logger.info(`Wrote ${embeddingsToWrite.length} embeddings to ${CONFIG.ENABLE_BINARY_STORAGE ? 'binary storage' : CONFIG.EMBEDDINGS_FILE}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error flushing buffers: ${error.message}`);
    return false;
  } finally {
    isWriting = false;
  }
}

/**
 * Append objects to a JSONL file atomically
 * @param {string} filePath - Path to the JSONL file
 * @param {Array<Object>} objects - Objects to append
 * @returns {Promise<boolean>} Success status
 */
async function appendToJsonlFile(filePath, objects) {
  if (!objects || objects.length === 0) return true;
  
  try {
    // Make sure each object is valid JSON
    const validObjects = objects.filter(obj => {
      try {
        JSON.stringify(obj);
        return true;
      } catch (error) {
        logger.warn(`Invalid object skipped: ${error.message}`);
        return false;
      }
    });
    
    if (validObjects.length === 0) return true;
    
    // Convert objects to JSONL format
    const jsonlContent = validObjects.map(obj => JSON.stringify(obj)).join('\n') + '\n';
    
    // Create unique temporary files for atomic operation
    const tempDir = path.join(os.tmpdir(), 'leo-memory-graph');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `${path.basename(filePath)}.${crypto.randomBytes(8).toString('hex')}`);
    const backupFile = `${filePath}.${Date.now()}.bak`;
    
    // Check if the file exists and ensure it's writable
    let originalMode = 0o644; // Default mode if file doesn't exist
    let originalContent = '';
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      originalMode = stats.mode;
      
      // Always ensure the file is writable before attempting to modify
      try {
        fs.chmodSync(filePath, 0o644);
        logger.debug(`Ensured file is writable: ${filePath}`);
      } catch (permError) {
        logger.warn(`Could not modify file permissions: ${permError.message}`);
        // Continue anyway, the operation might still succeed
      }
    }
    
    // Create a backup of the original file
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupFile);
    }
    
    // Read original content
    if (fs.existsSync(filePath)) {
      originalContent = fs.readFileSync(filePath, 'utf8');
    }
    
    // For append operation: write original content + new content to temp file
    fs.writeFileSync(tempFile, originalContent + jsonlContent);
    
    // Verify the temp file was written correctly
    const tempFileStats = fs.statSync(tempFile);
    if (tempFileStats.size === 0 || tempFileStats.size < jsonlContent.length) {
      throw new Error('Temporary file write verification failed');
    }
    
    // Atomic replace operation
    fs.renameSync(tempFile, filePath);
    
    // Restore original file permissions
    try {
      fs.chmodSync(filePath, originalMode);
      logger.debug(`Restored original file permissions for: ${filePath}`);
    } catch (permError) {
      logger.warn(`Could not restore original file permissions: ${permError.message}`);
    }
    
    // Clean up backup if everything succeeded
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    
    logger.debug(`Successfully appended ${validObjects.length} objects to ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Error appending to JSONL file ${filePath}: ${error.message}`);
    
    // Attempt recovery from backup if available
    const possibleBackups = fs.readdirSync(path.dirname(filePath))
      .filter(file => file.startsWith(path.basename(filePath) + '.') && file.endsWith('.bak'))
      .sort()
      .reverse();
    
    if (possibleBackups.length > 0) {
      const latestBackup = path.join(path.dirname(filePath), possibleBackups[0]);
      logger.info(`Attempting recovery from backup: ${latestBackup}`);
      try {
        fs.copyFileSync(latestBackup, filePath);
        logger.info(`Recovery successful from ${latestBackup}`);
      } catch (recoveryError) {
        logger.error(`Recovery failed: ${recoveryError.message}`);
      }
    }
    
    return false;
  }
}

/**
 * Append embeddings to binary storage
 * @param {Array<Object>} embeddings - Embeddings to append
 * @returns {Promise<boolean>} Success status
 */
async function appendToBinaryEmbeddings(embeddings) {
  if (!embeddings || embeddings.length === 0) return true;
  
  try {
    // Process each embedding
    for (const embedding of embeddings) {
      if (!embedding.vector || !Array.isArray(embedding.vector)) {
        logger.warn(`Skipping embedding without vector: ${JSON.stringify(embedding)}`);
        continue;
      }
      
      // Generate a unique ID for the binary file if not present
      if (!embedding.id) {
        embedding.id = crypto.randomBytes(16).toString('hex');
      }
      
      // Create binary file path
      const binaryPath = path.join(CONFIG.BINARY_EMBEDDINGS_DIR, `${embedding.id}.bin`);
      
      // Convert vector to Float32Array and save to binary file
      const vectorArray = new Float32Array(embedding.vector);
      const buffer = Buffer.from(vectorArray.buffer);
      fs.writeFileSync(binaryPath, buffer);
      
      // Replace vector with reference in the embedding object
      const embeddingMeta = { ...embedding };
      embeddingMeta.vector_ref = binaryPath;
      delete embeddingMeta.vector;
      
      // Append metadata to JSONL file
      await appendToJsonlFile(CONFIG.EMBEDDINGS_FILE, [embeddingMeta]);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error appending to binary embeddings: ${error.message}`);
    return false;
  }
}

/**
 * Add a chunk to the memory graph
 * @param {Object} chunk - Chunk object
 * @returns {Promise<boolean>} Success status
 */
async function addChunk(chunk) {
  if (!chunk) return false;
  
  try {
    // Validate chunk
    if (!chunk.chunk_id) {
      chunk.chunk_id = crypto.randomBytes(16).toString('hex');
    }
    
    if (!chunk.timestamp) {
      chunk.timestamp = Date.now();
    }
    
    // Add to buffer
    chunksBuffer.push(chunk);
    
    // Flush if buffer is full
    if (chunksBuffer.length >= CONFIG.WRITE_BUFFER_MAX_SIZE) {
      await flushBuffers();
    }
    
    return true;
  } catch (error) {
    logger.error(`Error adding chunk: ${error.message}`);
    return false;
  }
}

/**
 * Add an embedding to the memory graph
 * @param {Object} embedding - Embedding object
 * @returns {Promise<boolean>} Success status
 */
async function addEmbedding(embedding) {
  if (!embedding) return false;
  
  try {
    // Validate embedding
    if (!embedding.id) {
      embedding.id = crypto.randomBytes(16).toString('hex');
    }
    
    if (!embedding.timestamp) {
      embedding.timestamp = Date.now();
    }
    
    if (!embedding.vector || !Array.isArray(embedding.vector)) {
      logger.warn('Embedding must have a vector array');
      return false;
    }
    
    // Add to buffer
    embeddingsBuffer.push(embedding);
    
    // Flush if buffer is full
    if (embeddingsBuffer.length >= CONFIG.WRITE_BUFFER_MAX_SIZE) {
      await flushBuffers();
    }
    
    return true;
  } catch (error) {
    logger.error(`Error adding embedding: ${error.message}`);
    return false;
  }
}

/**
 * Add multiple chunks and embeddings in a batch
 * @param {Object} batch - Batch object with chunks and embeddings arrays
 * @returns {Promise<boolean>} Success status
 */
async function addBatch(batch) {
  if (!batch) return false;
  
  try {
    const { chunks = [], embeddings = [] } = batch;
    
    // Add chunks to buffer
    if (chunks && Array.isArray(chunks)) {
      chunks.forEach(chunk => {
        if (!chunk.chunk_id) {
          chunk.chunk_id = crypto.randomBytes(16).toString('hex');
        }
        
        if (!chunk.timestamp) {
          chunk.timestamp = Date.now();
        }
        
        chunksBuffer.push(chunk);
      });
    }
    
    // Add embeddings to buffer
    if (embeddings && Array.isArray(embeddings)) {
      embeddings.forEach(embedding => {
        if (!embedding.id) {
          embedding.id = crypto.randomBytes(16).toString('hex');
        }
        
        if (!embedding.timestamp) {
          embedding.timestamp = Date.now();
        }
        
        if (embedding.vector && Array.isArray(embedding.vector)) {
          embeddingsBuffer.push(embedding);
        } else {
          logger.warn('Skipping embedding without vector array');
        }
      });
    }
    
    // Flush if buffer is full
    if (chunksBuffer.length >= CONFIG.WRITE_BUFFER_MAX_SIZE || 
        embeddingsBuffer.length >= CONFIG.WRITE_BUFFER_MAX_SIZE) {
      await flushBuffers();
    }
    
    return true;
  } catch (error) {
    logger.error(`Error adding batch: ${error.message}`);
    return false;
  }
}

/**
 * Shutdown the memory graph writer
 * @returns {Promise<boolean>} Success status
 */
async function shutdown() {
  try {
    logger.info('Shutting down memory graph writer');
    
    // Clear the write buffer timer
    if (writeTimer) {
      clearInterval(writeTimer);
      writeTimer = null;
    }
    
    // Flush any remaining items in the buffers
    await flushBuffers();
    
    logger.info('Memory graph writer shutdown complete');
    return true;
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
    return false;
  }
}

// Export the public API
module.exports = {
  initialize,
  shutdown,
  addChunk,
  addEmbedding,
  addBatch,
  flushBuffers,
  CONFIG
};
