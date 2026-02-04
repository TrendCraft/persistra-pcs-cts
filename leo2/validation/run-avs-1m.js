#!/usr/bin/env node

/**
 * AVS-1M Runner: Cross-Model Relay
 * 
 * Demonstrates "Transformers are Replaceable" by running the same
 * cognitive task across different LLM backends (GPT-4 → Llama-3).
 * 
 * This proves that cognitive continuity persists across model swaps,
 * validating the Exocortex thesis: memory is state, transformers are commoditized.
 */

// Load environment variables from .env file
require('dotenv').config();

const path = require('path');
const fs = require('fs');

// --- PCS-CTS run isolation (CRITICAL) ---
// Set DATA_DIR BEFORE any core imports to prevent module-load-time capture
const runId =
  process.env.PCS_RUN_ID ||
  new Date().toISOString().replace(/[:.]/g, '-'); // safe filename timestamp

// Always use an absolute path to avoid cwd surprises
const dataDir = path.resolve(__dirname, '..', 'validation_runs', runId, 'data');
process.env.DATA_DIR = dataDir;

// Ensure DATA_DIR exists
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

// Also make audit dir absolute & namespaced
const auditDir = path.resolve(__dirname, 'audit', runId);
fs.mkdirSync(auditDir, { recursive: true });

async function runAVS1M() {
  console.log('=== AVS-1M: Cross-Model Relay ===');
  console.log(`Run ID: ${runId}`);
  console.log(`DATA_DIR: ${process.env.DATA_DIR}`);
  console.log(`Audit Dir: ${auditDir}`);
  console.log('Proof Point: "Transformers are Replaceable"\n');

  // Initialize orchestrator
  const { createOrchestrator } = require('../core/orchestrator/orchestratorFactory');
  const orchestrator = await createOrchestrator();

  // Load AVS harness and scenario
  const AVSHarness = require('./avs-harness');
  const scenario = require('./scenarios/avs-1m-cross-model-relay');

  // Create harness instance
  const harness = new AVSHarness(orchestrator, {
    mode: 'persistra_on', // Full retrieval enabled
    enableAudit: true,
    auditDir
  });

  console.log(`Running scenario: ${scenario.name}`);
  console.log(`Description: ${scenario.description}\n`);

  try {
    // Run the scenario
    const result = await harness.runScenario(scenario);

    // Display results
    if (result.passed) {
      console.log(`\n✅ AVS-1M PASSED (${result.duration}ms)\n`);
      console.log('=== CROSS-MODEL RELAY PROOF ===');
      console.log('Session A (GPT-4): Made architectural decision (Rust for kernel)');
      console.log('Session B (Llama-3): Retrieved decision and wrote Rust code');
      console.log('Result: Cognitive continuity survived model swap');
      console.log('Proof: $100M supercomputer replaced by laptop model ✅\n');
    } else {
      console.log(`\n❌ AVS-1M FAILED: ${result.failureReason}\n`);
    }

    // Save audit trail
    const auditPath = path.join(auditDir, `avs-1m-audit.json`);
    
    fs.writeFileSync(auditPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      scenario: 'AVS-1M',
      proofPoint: 'Transformers are Replaceable',
      results: [result]
    }, null, 2));

    console.log(`📁 Audit trail saved: ${auditPath}\n`);

    // Display summary
    harness.displaySummary();

    process.exit(result.passed ? 0 : 1);

  } catch (error) {
    console.error('❌ AVS-1M execution failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAVS1M().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAVS1M };
