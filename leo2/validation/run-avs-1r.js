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

async function runAVS1R() {
  console.log('=== AVS-1R: Cross-Session Recall Test ===\n');
  
  try {
    // Initialize orchestrator (same way the server does)
    console.log('1. Initializing orchestrator...');
    const { createDefaultLeoOrchestrator } = require('../core/orchestrator/orchestratorFactory');
    
    const orchestrator = await createDefaultLeoOrchestrator({
      memoryGraphConfig: {
        chunksFile: process.env.LEO_CHUNKS_FILE || './demo/data/chunks.jsonl',
        embeddingsFile: process.env.LEO_EMBEDDINGS_FILE || './demo/data/embeddings.jsonl'
      }
    });
    
    console.log('✅ Orchestrator initialized\n');
    
    // Load AVS harness and scenario
    console.log('2. Loading AVS harness...');
    const { AVSHarness } = require('./avs-harness');
    const avs1rScenario = require('./scenarios/avs-1-cross-session-recall');
    
    const harness = new AVSHarness(orchestrator, {
      auditDir: './validation/audit'
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
