#!/usr/bin/env node

/**
 * AVS-1R Comparison Test Runner
 * 
 * Runs AVS-1R in three modes to prove Persistra's value:
 * - Persistra ON: Full memory retrieval (should PASS)
 * - Persistra OFF: No retrieval (should FAIL on DR-014/Q7F3)
 * - Paste-context: Manual state transport (should PASS but not durable)
 * 
 * Usage:
 *   node validation/avs-1r-comparison.js
 *   
 * Environment:
 *   LEO_VISION_HISTORY_MAX=0  # Disable Vision history to prove no FIFO cheating
 */

// Load environment variables from .env file
require('dotenv').config();

const path = require('path');
const fs = require('fs-extra');

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

// Disable Vision history to prove no in-process cheating
process.env.LEO_VISION_HISTORY_MAX = '0';

async function runComparison() {
  console.log('=== AVS-1R: 3-Mode Comparison Test ===\n');
  console.log(`Run ID: ${runId}`);
  console.log(`DATA_DIR: ${process.env.DATA_DIR}`);
  console.log(`Audit Dir: ${auditDir}\n`);
  console.log('Testing modes:');
  console.log('  1. Persistra ON (full memory retrieval)');
  console.log('  2. Persistra OFF (no retrieval - baseline)');
  console.log('  3. Paste-context (manual state transport - baseline)\n');
  console.log('Environment: LEO_VISION_HISTORY_MAX=0 (no FIFO cheating)\n');
  
  const results = [];
  
  try {
    // Initialize orchestrator (same way the server does)
    console.log('Initializing orchestrator...');
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
    const { AVSHarness } = require('./avs-harness');
    const avs1rScenario = require('./scenarios/avs-1-cross-session-recall');
    
    // Extract seed content for paste-context mode
    const seedStep = avs1rScenario.steps.find(s => s.description.includes('Tuesday'));
    const pasteContext = seedStep ? seedStep.input : '';
    
    // Mode 1: Persistra ON
    console.log('\n' + '='.repeat(80));
    console.log('MODE 1: PERSISTRA ON (Full Memory Retrieval)');
    console.log('='.repeat(80) + '\n');
    
    const harness1 = new AVSHarness(orchestrator, {
      auditDir,
      mode: 'persistra_on'
    });
    
    const result1 = await harness1.runScenario(avs1rScenario);
    await harness1.saveAuditTrail();
    results.push({ mode: 'Persistra ON', result: result1 });
    
    // Mode 2: Persistra OFF
    console.log('\n' + '='.repeat(80));
    console.log('MODE 2: PERSISTRA OFF (No Retrieval - Baseline A)');
    console.log('='.repeat(80) + '\n');
    
    const harness2 = new AVSHarness(orchestrator, {
      auditDir,
      mode: 'persistra_off'
    });
    
    const result2 = await harness2.runScenario(avs1rScenario);
    await harness2.saveAuditTrail();
    results.push({ mode: 'Persistra OFF', result: result2 });
    
    // Mode 3: Paste-context
    console.log('\n' + '='.repeat(80));
    console.log('MODE 3: PASTE-CONTEXT (Manual State Transport - Baseline B)');
    console.log('='.repeat(80) + '\n');
    
    const harness3 = new AVSHarness(orchestrator, {
      auditDir,
      mode: 'paste_context',
      pasteContext
    });
    
    const result3 = await harness3.runScenario(avs1rScenario);
    await harness3.saveAuditTrail();
    results.push({ mode: 'Paste-context', result: result3 });
    
    // Generate comparison table
    console.log('\n' + '='.repeat(80));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(80) + '\n');
    
    printComparisonTable(results);
    
    // Save comparison report
    const reportPath = path.join(auditDir, 'avs-1r-comparison.json');
    await fs.writeJson(reportPath, {
      timestamp: new Date().toISOString(),
      environment: {
        visionHistoryMax: process.env.LEO_VISION_HISTORY_MAX,
        nodeVersion: process.version
      },
      results: results.map(r => ({
        mode: r.mode,
        passed: r.result.passed,
        duration: r.result.duration,
        failureReason: r.result.failureReason,
        steps: r.result.steps.map(s => ({
          stepNumber: s.stepNumber,
          description: s.description,
          passed: s.passed,
          failureReason: s.failureReason
        }))
      }))
    }, { spaces: 2 });
    
    console.log(`\n✅ Comparison report saved to: ${reportPath}\n`);
    
    // Exit with success if at least Persistra ON passed
    const persistraOnPassed = results[0].result.passed;
    process.exit(persistraOnPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Comparison test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function printComparisonTable(results) {
  console.log('┌─────────────────────┬────────┬──────────────────────────────────────────────┐');
  console.log('│ Mode                │ Result │ Why                                          │');
  console.log('├─────────────────────┼────────┼──────────────────────────────────────────────┤');
  
  results.forEach(({ mode, result }) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    let why = '';
    
    if (mode === 'Persistra ON') {
      why = result.passed 
        ? 'Retrieved DR-014/Q7F3 from persistent memory'
        : 'Failed to retrieve from memory (unexpected)';
    } else if (mode === 'Persistra OFF') {
      why = result.passed
        ? 'Passed without retrieval (unexpected)'
        : 'No state; cannot cite nonce/ID';
    } else if (mode === 'Paste-context') {
      why = result.passed
        ? 'User manually transported state (not durable)'
        : 'Failed even with pasted context';
    }
    
    const modePadded = mode.padEnd(19);
    const statusPadded = status.padEnd(6);
    const whyPadded = why.padEnd(44);
    
    console.log(`│ ${modePadded} │ ${statusPadded} │ ${whyPadded} │`);
  });
  
  console.log('└─────────────────────┴────────┴──────────────────────────────────────────────┘');
  
  // Summary
  console.log('\nKEY INSIGHTS:');
  console.log('• Persistra ON should PASS (proves cross-session recall works)');
  console.log('• Persistra OFF should FAIL (proves model cannot conjure DR-014/Q7F3)');
  console.log('• Paste-context may PASS (but proves manual state transport needed)');
  console.log('\nThis demonstrates Persistra provides durable cognitive infrastructure.');
}

runComparison();
