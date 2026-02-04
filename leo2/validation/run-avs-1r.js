#!/usr/bin/env node

/**
 * AVS-1R Test Runner
 * 
 * Runs the AVS-1R (Cross-Session Recall) scenario to validate
 * semantic conversation ingestion and retrieval.
 * 
 * Usage:
 *   node validation/run-avs-1r.js
 */

// Load environment variables from .env file
require('dotenv').config();

const path = require('path');
const fs = require('fs');

// --- PCS-CTS run isolation (CRITICAL) ---
// Set DATA_DIR BEFORE any core imports to prevent module-load-time capture
// Require PCS_RUN_ID for deterministic, reproducible runs
if (!process.env.PCS_RUN_ID) {
  console.error('❌ ERROR: PCS_RUN_ID is required for deterministic runs.');
  console.error('   Example: PCS_RUN_ID=smoke-1 npm run test:l1');
  console.error('   Or use: npm run preflight (auto-generates run ID)');
  process.exit(1);
}
const runId = process.env.PCS_RUN_ID;

// Always use an absolute path to avoid cwd surprises
const dataDir = path.resolve(__dirname, '..', 'validation_runs', runId, 'data');
process.env.DATA_DIR = dataDir;

// Ensure DATA_DIR exists
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

// Also make audit dir absolute & namespaced
const auditDir = path.resolve(__dirname, 'audit', runId);
fs.mkdirSync(auditDir, { recursive: true });

async function runAVS1R() {
  console.log('=== AVS-1R: Cross-Session Recall Test ===\n');
  console.log(`Run ID: ${runId}`);
  console.log(`DATA_DIR: ${process.env.DATA_DIR}`);
  console.log(`Audit Dir: ${auditDir}\n`);
  
  try {
    // Initialize orchestrator (same way the server does)
    console.log('1. Initializing orchestrator...');
    const { createDefaultLeoOrchestrator } = require('../core/orchestrator/orchestratorFactory');
    
    // Use absolute paths for demo files to avoid cwd issues
    const defaultChunks = path.resolve(__dirname, '..', 'demo', 'data', 'chunks.jsonl');
    const defaultEmbeddings = path.resolve(__dirname, '..', 'demo', 'data', 'embeddings.jsonl');
    
    const orchestrator = await createDefaultLeoOrchestrator({
      memoryGraphConfig: {
        chunksFile: process.env.LEO_CHUNKS_FILE || defaultChunks,
        embeddingsFile: process.env.LEO_EMBEDDINGS_FILE || defaultEmbeddings
      }
    });
    
    console.log('✅ Orchestrator initialized\n');
    
    // Load AVS harness and scenario
    console.log('2. Loading AVS harness...');
    const { AVSHarness } = require('./avs-harness');
    const avs1rScenario = require('./scenarios/avs-1-cross-session-recall');
    
    const harness = new AVSHarness(orchestrator, {
      auditDir
    });
    
    console.log('✅ Harness loaded\n');
    
    // Run scenario
    console.log('3. Running AVS-1R scenario...\n');
    const result = await harness.runScenario(avs1rScenario);
    
    // Save audit trail
    await harness.saveAuditTrail();
    
    // Print summary
    harness.printSummary();
    
    // Exit with appropriate code
    process.exit(result.passed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAVS1R();
