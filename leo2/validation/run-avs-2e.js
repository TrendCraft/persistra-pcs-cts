#!/usr/bin/env node

/**
 * AVS-2E Test Runner
 * 
 * Runs the AVS-2E (Policy Enforcement) scenario to validate
 * LPAC policy adherence and constraint enforcement.
 * 
 * Usage:
 *   node validation/run-avs-2e.js
 */

// Load environment variables from .env file
require('dotenv').config();

// Enable policy enforcement for this test
process.env.LEO_POLICY_ENFORCEMENT = 'true';
process.env.LEO_POLICY_AUDIT = 'true';

const path = require('path');
const fs = require('fs');

// --- PCS-CTS run isolation (CRITICAL) ---
// Set DATA_DIR BEFORE any core imports to prevent module-load-time capture
// Require PCS_RUN_ID for deterministic, reproducible runs
if (!process.env.PCS_RUN_ID) {
  console.error('❌ ERROR: PCS_RUN_ID is required for deterministic runs.');
  console.error('   Example: PCS_RUN_ID=smoke-1 npm run test:l2');
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

async function runAVS2E() {
  console.log('=== AVS-2E: Policy Enforcement Test ===\n');
  console.log(`Run ID: ${runId}`);
  console.log(`DATA_DIR: ${process.env.DATA_DIR}`);
  console.log(`Audit Dir: ${auditDir}`);
  console.log('Policy enforcement: ENABLED');
  console.log('Policy audit: ENABLED\n');
  
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
    const avs2eScenario = require('./scenarios/avs-2-policy-enforcement');
    
    const harness = new AVSHarness(orchestrator, {
      auditDir
    });
    
    console.log('✅ Harness loaded\n');
    
    // Run scenario
    console.log('3. Running AVS-2E scenario...\n');
    const result = await harness.runScenario(avs2eScenario);
    
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

runAVS2E();
