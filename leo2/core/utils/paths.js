const path = require('path');
const fs = require('fs');

/**
 * Centralized path configuration for Leo
 * 
 * CRITICAL: All modules MUST use this to avoid path mismatches
 * that cause dedupe failures and inconsistent behavior.
 */

// Single source of truth for data directory
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../demo/data');

// PILOT GUARDRAIL: Detect known-bad patterns
const repoRoot = path.resolve(__dirname, '../..');
const oldDataPath = path.join(repoRoot, 'data');
const demoDataPath = path.join(repoRoot, 'demo/data');
const normalizedDataDir = path.normalize(DATA_DIR);

// Hard error: DATA_DIR resolves to <repoRoot>/leo2/data (known-bad old location)
if (normalizedDataDir === path.normalize(oldDataPath)) {
  console.error('\n' + '='.repeat(80));
  console.error('❌ PILOT GUARDRAIL: DATA_DIR resolves to OLD location!');
  console.error(`   Current: ${DATA_DIR}`);
  console.error(`   Resolves to: ${normalizedDataDir}`);
  console.error(`   This is the OLD path that causes dedupe failures.`);
  console.error(`   Set DATA_DIR to a different location (e.g., demo/data or /var/lib/leo/data)`);
  console.error('='.repeat(80) + '\n');
  throw new Error(`DATA_DIR cannot be ${oldDataPath} (old location)`);
}

// Warning: Both old and new directories exist (confusion risk)
if (fs.existsSync(oldDataPath) && fs.existsSync(demoDataPath)) {
  console.warn('\n' + '='.repeat(80));
  console.warn('⚠️  PILOT GUARDRAIL: Both leo2/data and leo2/demo/data exist!');
  console.warn(`   Old location: ${oldDataPath}`);
  console.warn(`   New location: ${demoDataPath}`);
  console.warn(`   Current DATA_DIR: ${DATA_DIR}`);
  console.warn(`   This can cause "dedupe not working" confusion.`);
  console.warn(`   Rename old: mv leo2/data leo2/data.backup-old-location`);
  console.warn('='.repeat(80) + '\n');
}

// Validate DATA_DIR exists or can be created
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (process.env.LEO_LOG_PATHS) {
      console.log(`[Paths] Created DATA_DIR: ${DATA_DIR}`);
    }
  } catch (error) {
    console.error(`[Paths] FATAL: Cannot create DATA_DIR: ${DATA_DIR}`, error);
    throw new Error(`DATA_DIR ${DATA_DIR} does not exist and cannot be created`);
  }
}

// All file paths derived from single DATA_DIR
const PATHS = {
  dataDir: DATA_DIR,
  interactionsFile: path.join(DATA_DIR, 'interactions.json'),
  chunksFile: process.env.LEO_CHUNKS_FILE || path.join(DATA_DIR, 'leo_memory_graph.jsonl'),
  embeddingsFile: process.env.LEO_EMBEDDINGS_FILE || path.join(DATA_DIR, 'embeddings_production.jsonl'),
  sessionsDir: path.join(DATA_DIR, 'sessions'),
  cacheDir: path.join(DATA_DIR, 'cache')
};

// Log configuration on first load (gated behind env var for multi-worker deployments)
if (process.env.LEO_LOG_PATHS) {
  console.log('[Paths] Centralized path configuration loaded');
  console.log(`[Paths] DATA_DIR: ${DATA_DIR}`);
  console.log(`[Paths] interactions.json: ${PATHS.interactionsFile}`);
}

module.exports = {
  DATA_DIR,
  PATHS,
  
  // Helper to get interactions path (most common use case)
  getInteractionsPath: () => PATHS.interactionsFile,
  
  // Helper to validate DATA_DIR is set correctly
  validateDataDir: () => {
    if (!fs.existsSync(DATA_DIR)) {
      throw new Error(`DATA_DIR ${DATA_DIR} does not exist`);
    }
    return true;
  },
  
  // PILOT GUARDRAIL: Check for old data/ directory that could cause confusion
  checkForOldDataDirectory: () => {
    if (fs.existsSync(oldDataPath)) {
      console.error('\n' + '='.repeat(80));
      console.error('⚠️  PILOT GUARDRAIL: Old data/ directory still exists!');
      console.error(`   Old location: ${oldDataPath}`);
      console.error(`   Current location: ${DATA_DIR}`);
      console.error('   This can cause "dedupe not working" confusion.');
      console.error('   Rename it: mv leo2/data leo2/data.backup-old-location');
      console.error('='.repeat(80) + '\n');
    }
  }
};
