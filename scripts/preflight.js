#!/usr/bin/env node

/**
 * PCS-CTS Preflight Validation Script
 * 
 * Minimal environment validation and test execution for CMU SEI validation.
 * 
 * Checks:
 * - Node.js version
 * - Operating system
 * - ANTHROPIC_API_KEY presence
 * 
 * Runs:
 * - npm run test:l1 (PCS-L1: Cross-Session Recall)
 * - npm run test:l2 (PCS-L2: Policy Enforcement)
 * 
 * Exit codes:
 * - 0: All tests passed
 * - 1: Environment validation failed
 * - 2: Tests failed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Generate stable run ID for this preflight execution
// Use existing PCS_RUN_ID if set, otherwise create preflight-<timestamp>
const runId = process.env.PCS_RUN_ID || `preflight-${new Date().toISOString().replace(/[:.]/g, '-')}`;
process.env.PCS_RUN_ID = runId;

console.log('='.repeat(80));
console.log('PCS-CTS PREFLIGHT VALIDATION');
console.log('='.repeat(80));
console.log();
console.log(`Run ID: ${runId}`);
console.log();

// 1. Print Node version + OS
console.log('1. Environment Information');
console.log(`   Node.js: ${process.version}`);
console.log(`   Platform: ${process.platform}`);
console.log(`   Architecture: ${process.arch}`);
console.log(`   OS: ${require('os').type()} ${require('os').release()}`);
console.log();

// 2. Confirm ANTHROPIC_API_KEY present
console.log('2. Checking Environment Variables');

// Load .env if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('   ✅ .env file loaded');
} else {
  console.log('   ⚠️  No .env file found (using system environment)');
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('   ❌ ANTHROPIC_API_KEY not set');
  console.error();
  console.error('Please set ANTHROPIC_API_KEY in .env file or environment.');
  console.error('Example: cp .env.example .env && edit .env');
  process.exit(1);
}

console.log(`   ✅ ANTHROPIC_API_KEY present (${apiKey.slice(0, 10)}...)`);
console.log();

// 3. Run tests
console.log('3. Running PCS-CTS Validation Tests');
console.log();

const tests = [
  { name: 'PCS-L1 (Cross-Session Recall)', command: 'npm run test:l1' },
  { name: 'PCS-L2 (Policy Enforcement)', command: 'npm run test:l2' }
];

let allPassed = true;

for (const test of tests) {
  console.log('-'.repeat(80));
  console.log(`Running: ${test.name}`);
  console.log('-'.repeat(80));
  console.log();
  
  try {
    execSync(test.command, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env
    });
    console.log();
    console.log(`✅ ${test.name} PASSED`);
    console.log();
  } catch (error) {
    console.log();
    console.error(`❌ ${test.name} FAILED`);
    console.log();
    allPassed = false;
    // Continue to run remaining tests
  }
}

// 4. Summary
console.log('='.repeat(80));
console.log('PREFLIGHT VALIDATION SUMMARY');
console.log('='.repeat(80));
console.log();

if (allPassed) {
  console.log('✅ All tests PASSED');
  console.log();
  console.log('PCS-CTS is ready for validation.');
  process.exit(0);
} else {
  console.log('❌ Some tests FAILED');
  console.log();
  console.log('Please review the test output above and fix any issues.');
  process.exit(2);
}
