#!/usr/bin/env node

/**
 * Leo Embedding Updater
 *
 * # DI MIGRATION: This script requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This script updates the existing embeddings in the chunks file with true semantic
 * embeddings generated using the Embeddings.js library with the MiniLM model.
 */

const path = require('path');
const fs = require('fs');
const configService = require('../config/config');

// Logger and embeddingsInterface will be set via DI
let logger = null;
let embeddingsInterface = null;

/**
 * Initialize the embedding updater with DI
 * @param {Object} options
 * @param {Object} options.embeddingsInterface - Required embeddings interface
 * @param {Object} [options.logger] - Optional logger instance
 */
async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[update-embeddings] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[update-embeddings] DI MIGRATION: logger not provided! Falling back to console.');
  }
  logger.info && logger.info('Initializing embedding updater');
  // Initialize configuration
  configService.initialize && configService.initialize();
  logger.info && logger.info('Embedding updater initialized');
}

/**
 * Initialize the updater
 */
async function initialize() {
  logger.info('Initializing embedding updater');
  
  // Initialize configuration
  configService.initialize();
  
  // Initialize true semantic embeddings
  await trueSemanticEmbeddings.initialize();
  
  logger.info('Embedding updater initialized');
}

/**
 * Update embeddings in the chunks file
 */
async function updateEmbeddings() {
  logger.info('Starting embedding update');
  
  // Get file paths from configuration
  const config = configService.getConfig();
  const chunksFile = config.paths.chunks;
  const embeddingsFile = config.paths.embeddings;
  
  logger.info(`Using chunks file: ${chunksFile}`);
  logger.info(`Using embeddings file: ${embeddingsFile}`);
  
  // Check if files exist
  if (!fs.existsSync(chunksFile)) {
    logger.error(`Chunks file not found: ${chunksFile}`);
    return false;
  }
  
  // Load chunks
  let chunks = [];
  try {
    const chunksData = fs.readFileSync(chunksFile, 'utf8');
    chunks = chunksData.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    
    logger.info(`Loaded ${chunks.length} chunks`);
  } catch (error) {
    logger.error(`Failed to load chunks: ${error.message}`);
    return false;
  }
  
  // Load existing embeddings if available
  let embeddings = [];
  if (fs.existsSync(embeddingsFile)) {
    try {
      const embeddingsData = fs.readFileSync(embeddingsFile, 'utf8');
      embeddings = embeddingsData.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      logger.info(`Loaded ${embeddings.length} existing embeddings`);
    } catch (error) {
      logger.warn(`Failed to load existing embeddings: ${error.message}`);
    }
  }
  
  // Create backup of existing files
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(embeddingsFile)) {
    const backupFile = `${embeddingsFile}.${timestamp}.backup`;
    fs.copyFileSync(embeddingsFile, backupFile);
    logger.info(`Created backup of embeddings file: ${backupFile}`);
  }
  
  // Update embeddings
  logger.info('Generating true semantic embeddings for chunks...');
  const updatedEmbeddings = [];
  let processedCount = 0;
  
  for (const chunk of chunks) {
    const content = chunk.content || chunk.text || '';
    if (!content) {
      logger.warn(`Chunk ${chunk.chunk_id} has no content, skipping`);
      continue;
    }
    
    try {
      // Generate embedding
      const embedding = await trueSemanticEmbeddings.generateEmbedding(content);
      
      // Create embedding object
      const embeddingObj = {
        chunk_id: chunk.chunk_id,
        file: chunk.file,
        embedding
      };
      
      updatedEmbeddings.push(embeddingObj);
      
      // Log progress
      processedCount++;
      if (processedCount % 10 === 0) {
        logger.info(`Processed ${processedCount}/${chunks.length} chunks`);
      }
    } catch (error) {
      logger.error(`Failed to generate embedding for chunk ${chunk.chunk_id}: ${error.message}`);
    }
  }
  
  // Save updated embeddings
  try {
    const embeddingsData = updatedEmbeddings.map(item => JSON.stringify(item)).join('\n');
    fs.writeFileSync(embeddingsFile, embeddingsData);
    logger.info(`Saved ${updatedEmbeddings.length} updated embeddings to ${embeddingsFile}`);
  } catch (error) {
    logger.error(`Failed to save updated embeddings: ${error.message}`);
    return false;
  }
  
  logger.info('Embedding update completed successfully');
  return true;
}

// Run the updater
async function main() {
  try {
    await initialize();
    const success = await updateEmbeddings();
    
    if (success) {
      logger.info('Embedding update completed successfully');
      process.exit(0);
    } else {
      logger.error('Embedding update failed');
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Embedding update failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  updateEmbeddings
};
