/**
 * Centralized data directory management
 * Single source of truth for all data paths
 */

const path = require('path');

// Base data directory
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');

// Standard paths
const PATHS = {
  chunks: path.join(DATA_DIR, 'quantum_research', 'quantum_research_curated.jsonl'),
  embeddings: path.join(DATA_DIR, 'embeddings.jsonl'),
  memoryGraph: path.join(DATA_DIR, 'leo_memory_graph.jsonl'),
  interactions: path.join(DATA_DIR, 'interactions.json'),
  sessions: path.join(DATA_DIR, 'sessions'),
  cache: path.join(DATA_DIR, 'cache'),
  backups: path.join(DATA_DIR, 'backups'),
  
  // Legacy compatibility
  leo2Data: path.resolve(__dirname, '../../leo2/data'),
  quantumResearch: path.join(DATA_DIR, 'quantum_research')
};

// Utility functions
function getDataPath(key) {
  return PATHS[key] || path.join(DATA_DIR, key);
}

function ensureDir(dirPath) {
  const fs = require('fs');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// Get all data paths for orchestrator initialization
function getDataPaths() {
  return {
    dataDir: DATA_DIR,
    chunksFile: process.env.LEO_CHUNKS_FILE || PATHS.chunks,
    embeddingsFile: process.env.LEO_EMBEDDINGS_PATH || PATHS.embeddings,
    memoryGraphFile: PATHS.memoryGraph,
    interactionsFile: PATHS.interactions,
    sessionsDir: PATHS.sessions,
    cacheDir: PATHS.cache
  };
}

module.exports = {
  DATA_DIR,
  PATHS,
  getDataPath,
  getDataPaths,
  ensureDir
};