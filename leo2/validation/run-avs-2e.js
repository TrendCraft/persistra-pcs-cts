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

async function runAVS2E() {
  console.log('=== AVS-2E: Policy Enforcement Test ===\n');
  console.log('Policy enforcement: ENABLED');
  console.log('Policy audit: ENABLED\n');
  
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
    const avs2eScenario = require('./scenarios/avs-2-policy-enforcement');
    
    const harness = new AVSHarness(orchestrator, {
      auditDir: './validation/audit'
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
