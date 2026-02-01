#!/usr/bin/env node

/**
 * Cold Start Test - Validates WWT AVS Repository
 * 
 * This script verifies that the repository can run successfully
 * on a fresh clone without any external dependencies beyond npm install.
 * 
 * Checks:
 * - All required files present
 * - All dependencies installed
 * - Core modules can be loaded
 * - Environment configuration valid
 */

const fs = require('fs');
const path = require('path');

console.log('=== Persistra AVS - Cold Start Validation ===\n');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function pass(message) {
  console.log(`✅ ${message}`);
  checks.passed++;
}

function fail(message) {
  console.log(`❌ ${message}`);
  checks.failed++;
}

function warn(message) {
  console.log(`⚠️  ${message}`);
  checks.warnings++;
}

// Check 1: Required files exist
console.log('1. Checking required files...');
const requiredFiles = [
  'package.json',
  '.env.example',
  '.gitignore',
  'README.md',
  'AVS_EXECUTION_GUIDE.md',
  'WWT_PILOT_BRIEF.md',
  'leo2/validation/run-avs-1r.js',
  'leo2/validation/run-avs-2e.js',
  'leo2/validation/avs-harness.js',
  'leo2/validation/request-runner.js',
  'leo2/core/orchestrator/orchestratorFactory.js',
  'leo2/core/orchestrator/LeoOrchestrator.js'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    pass(`Found: ${file}`);
  } else {
    fail(`Missing: ${file}`);
  }
});

// Check 2: Dependencies installed
console.log('\n2. Checking dependencies...');
const requiredDeps = [
  '@anthropic-ai/sdk',
  'dotenv',
  'fs-extra',
  'uuid'
];

requiredDeps.forEach(dep => {
  try {
    require.resolve(dep);
    pass(`Installed: ${dep}`);
  } catch (e) {
    fail(`Missing: ${dep}`);
  }
});

// Check 3: Core modules can be loaded (basic validation only)
console.log('\n3. Checking core modules...');
const coreModules = [
  'leo2/validation/avs-harness.js',
  'leo2/validation/request-runner.js'
];

coreModules.forEach(module => {
  try {
    require(path.resolve(module));
    pass(`Loaded: ${module}`);
  } catch (e) {
    fail(`Failed to load: ${module} - ${e.message}`);
  }
});

// Note: orchestratorFactory uses ESM with top-level await, 
// so we just verify it exists rather than trying to load it
if (fs.existsSync('leo2/core/orchestrator/orchestratorFactory.js')) {
  pass('Core orchestrator files present');
} else {
  fail('Core orchestrator files missing');
}

// Check 4: Environment configuration
console.log('\n4. Checking environment configuration...');
if (fs.existsSync('.env')) {
  pass('Found .env file');
  require('dotenv').config();
  
  if (process.env.ANTHROPIC_API_KEY) {
    pass('ANTHROPIC_API_KEY configured');
  } else {
    warn('ANTHROPIC_API_KEY not set (required for AVS execution)');
  }
  
  if (process.env.LEO_LLM_PROVIDER) {
    pass(`LEO_LLM_PROVIDER: ${process.env.LEO_LLM_PROVIDER}`);
  } else {
    warn('LEO_LLM_PROVIDER not set (will default to claude)');
  }
} else {
  warn('.env file not found - copy .env.example to .env and configure');
}

// Check 5: Audit directory
console.log('\n5. Checking audit directory...');
if (fs.existsSync('leo2/validation/audit')) {
  pass('Audit directory exists');
} else {
  fail('Audit directory missing');
}

// Summary
console.log('\n=== Cold Start Validation Summary ===');
console.log(`✅ Passed: ${checks.passed}`);
console.log(`❌ Failed: ${checks.failed}`);
console.log(`⚠️  Warnings: ${checks.warnings}`);

if (checks.failed === 0) {
  console.log('\n🎉 Cold start validation PASSED!');
  console.log('Repository is ready for AVS execution.');
  console.log('\nNext steps:');
  console.log('1. Configure .env with your Claude API key');
  console.log('2. Run: npm run avs-1r');
  console.log('3. Run: npm run avs-2e');
  process.exit(0);
} else {
  console.log('\n❌ Cold start validation FAILED!');
  console.log('Please resolve the issues above before running AVS.');
  process.exit(1);
}
