// config-service.js
// Final version with corrected root path to match actual project structure

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createComponentLogger } = require('./logger');

const logger = createComponentLogger('config');

dotenv.config();

// Corrected: project root is two levels up from /utils/
const rootDir = path.resolve(__dirname, '..', '..');
const dataDir = path.join(rootDir, 'data');
const cacheDir = path.join(dataDir, 'cache');

const config = {
  maxResults: parseInt(process.env.MAX_RESULTS || '10'),
  useSemanticChunker: process.env.USE_SEMANTIC_CHUNKER !== 'false',
  embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384'),
  embeddingsFile: path.join(dataDir, 'embeddings', 'embeddings.jsonl'),
  chunksFile: path.join(dataDir, 'chunks', 'chunks.jsonl'),
  cacheDir,
  configSources: {
    defaults: true,
    leorc: false,
    environment: !!process.env.EMBEDDING_DIMENSIONS
  }
};

// Ensure required directories exist
function ensureDirectories() {
  [dataDir, cacheDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      logger.info(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Debug output
function report() {
  logger.info('Loading configuration');
  logger.info('No configuration file found, using defaults and environment variables');
  logger.info('Configuration loaded successfully');
  logger.info('Configuration sources:', config.configSources);
  logger.info('File verification:', {
    embeddingsFile: config.embeddingsFile,
    embeddingsExists: fs.existsSync(config.embeddingsFile),
    chunksFile: config.chunksFile,
    chunksExists: fs.existsSync(config.chunksFile)
  });
}

ensureDirectories();
// report(); // Commented out to prevent misleading logs when using deterministic config loader

module.exports = config;
