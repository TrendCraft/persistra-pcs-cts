/**
 * Semantic Chunker Adapter
 * 
 * This adapter provides a consistent interface for the Semantic Chunker component.
 * It addresses interface mismatches between the expected MVL interface and the
 * actual implementation in the semantic-chunker.js module.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const semanticChunker = require('../services/semantic-chunker');
const pathUtilsAdapter = require('./path-utils-adapter');
const eventBus = require('../utils/event-bus');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Patch the semantic chunker to use our path utilities adapter
semanticChunker.pathUtils = pathUtilsAdapter;

// Component name for logging and events
const COMPONENT_NAME = 'semantic-chunker-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Initialize the semantic chunker
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing semantic chunker adapter');
    
    // Pass initialization to the underlying implementation
    const success = await semanticChunker.initialize(options);
    
    if (success) {
      logger.info('Semantic chunker adapter initialized successfully');
      // Emit initialization event
      eventBus.emit('component:initialized', { 
        component: COMPONENT_NAME,
        timestamp: Date.now()
      });
    } else {
      logger.error('Failed to initialize semantic chunker');
    }
    
    return success;
  } catch (error) {
    logger.error(`Error initializing semantic chunker adapter: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Initialization failed', 
      error: error.message 
    });
    return false;
  }
}

/**
 * Chunk text into semantic units
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @returns {Promise<Array>} Array of chunks
 */
async function chunkText(text, options = {}) {
  try {
    // Input validation
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text: text must be a non-empty string');
    }
    
    // Extract options with defaults
    const { 
      filePath = 'unknown.js',
      maxChunkSize = 1000,
      minChunkSize = 100,
      overlapSize = 20
    } = options;
    
    logger.debug(`Chunking text with options: ${JSON.stringify({ filePath, maxChunkSize, minChunkSize, overlapSize })}`);
    
    // Map chunkText to the underlying implementation's createSemanticChunks method
    // This is exactly what adapters are for - to standardize interfaces
    const chunks = await semanticChunker.createSemanticChunks(text, filePath, {
      maxChunkSize,
      minChunkSize,
      overlapSize
    });
    
    logger.info(`Generated ${chunks.length} chunks for text`);
    
    // Emit event for monitoring
    eventBus.emit('chunks:created', { 
      component: COMPONENT_NAME,
      count: chunks.length,
      filePath
    });
    
    return chunks;
  } catch (error) {
    logger.error(`Error chunking text: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to chunk text', 
      error: error.message 
    });
    return [];
  }
}

/**
 * Process a file to generate chunks
 * @param {string} filePath - Path to the file
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of chunks
 */
async function processFile(filePath, options = {}) {
  try {
    // Input validation
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: path must be a non-empty string');
    }
    
    // Normalize and resolve path using path utilities adapter
    const normalizedPath = pathUtilsAdapter.absolute(filePath);
    
    // Check if file exists using path utilities adapter
    if (!pathUtilsAdapter.exists(normalizedPath)) {
      throw new Error(`File not found: ${normalizedPath}`);
    }
    
    logger.info(`Processing file: ${normalizedPath}`);
    
    // Read file content using path utilities adapter
    const content = await pathUtilsAdapter.readFile(normalizedPath, 'utf8');
    
    // Use the chunkText method to generate chunks
    const chunks = await chunkText(content, {
      ...options,
      filePath: normalizedPath
    });
    
    logger.info(`Generated ${chunks.length} chunks for ${normalizedPath}`);
    
    // Emit event for monitoring
    eventBus.emit('file:processed', { 
      component: COMPONENT_NAME,
      path: normalizedPath,
      chunkCount: chunks.length
    });
    
    return chunks;
  } catch (error) {
    logger.error(`Error processing file ${filePath}: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to process file: ${filePath}`, 
      error: error.message 
    });
    return [];
  }
}

/**
 * Process multiple files to generate chunks
 * @param {Array<string>} filePaths - Array of file paths
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of chunks
 */
async function processFiles(filePaths, options = {}) {
  try {
    // Input validation
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error('Invalid file paths: must be a non-empty array of strings');
    }
    
    logger.info(`Processing ${filePaths.length} files`);
    
    // Process each file and collect chunks
    const allChunks = [];
    
    for (const filePath of filePaths) {
      const chunks = await processFile(filePath, options);
      allChunks.push(...chunks);
    }
    
    logger.info(`Generated ${allChunks.length} chunks from ${filePaths.length} files`);
    
    // Emit event for monitoring
    eventBus.emit('files:processed', { 
      component: COMPONENT_NAME,
      fileCount: filePaths.length,
      chunkCount: allChunks.length
    });
    
    return allChunks;
  } catch (error) {
    logger.error(`Error processing files: ${error.message}`, { error: error.stack });
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: 'Failed to process files', 
      error: error.message 
    });
    return [];
  }
}

/**
 * Get metrics about the chunker service
 * @returns {Object} Metrics object
 */
function getMetrics() {
  try {
    // Use the underlying implementation
    const metrics = semanticChunker.getMetrics();
    
    // Add adapter-specific metrics
    metrics.adapter = {
      name: COMPONENT_NAME,
      timestamp: Date.now()
    };
    
    return metrics;
  } catch (error) {
    logger.error(`Error getting metrics: ${error.message}`);
    return {
      error: error.message,
      adapter: {
        name: COMPONENT_NAME,
        timestamp: Date.now()
      }
    };
  }
}

// Export the adapter API
module.exports = {
  initialize,
  chunkText,
  processFile,
  processFiles,
  getMetrics
};
