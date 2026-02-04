#!/usr/bin/env node

/**
 * PCS-CTS Preflight Check (No API Key Required)
 * 
 * Validates repository structure and import dependencies without making API calls.
 * This ensures the repository is structurally complete before attempting validation.
 * 
 * Exit codes:
 *   0 - All checks passed
 *   1 - Structure validation failed
 */

const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('PCS-CTS PREFLIGHT CHECK (Structure Validation)');
console.log('================================================================================\n');

let exitCode = 0;

// 1. Check Node.js version
console.log('1. Node.js Version Check');
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.split('.')[0].substring(1));
console.log(`   Node.js: ${nodeVersion}`);
if (nodeMajor < 18) {
  console.log('   ❌ Node.js >= 18.0.0 required');
  exitCode = 1;
} else {
  console.log('   ✅ Node.js version OK\n');
}

// 2. Check required files exist
console.log('2. Required Files Check');
const requiredFiles = [
  'package.json',
  'package-lock.json',
  '.env.example',
  'leo2/validation/run-avs-1r.js',
  'leo2/validation/run-avs-2e.js',
  'leo2/validation/avs-harness.js',
  'leo2/validation/scenarios/avs-1-cross-session-recall.js',
  'leo2/validation/scenarios/avs-2-policy-enforcement.js',
  'leo2/core/orchestrator/orchestratorFactory.js',
  'leo2/core/llm/claudeLLMClient.js',
  'scripts/preflight.js'
];

let missingFiles = [];
for (const file of requiredFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`   ❌ Missing: ${file}`);
    missingFiles.push(file);
    exitCode = 1;
  }
}

if (missingFiles.length === 0) {
  console.log(`   ✅ All ${requiredFiles.length} required files present\n`);
} else {
  console.log(`   ❌ ${missingFiles.length} files missing\n`);
}

// 3. Check package.json scripts
console.log('3. Package Scripts Check');
const packageJson = require('../package.json');
const requiredScripts = ['preflight', 'test:l1', 'test:l2'];
let missingScripts = [];
for (const script of requiredScripts) {
  if (!packageJson.scripts[script]) {
    console.log(`   ❌ Missing script: ${script}`);
    missingScripts.push(script);
    exitCode = 1;
  }
}

if (missingScripts.length === 0) {
  console.log(`   ✅ All required scripts present\n`);
} else {
  console.log(`   ❌ ${missingScripts.length} scripts missing\n`);
}

// 4. Check dependencies are installed
console.log('4. Dependencies Check');
const requiredDeps = [
  '@anthropic-ai/sdk',
  'axios',
  'dotenv',
  'fs-extra',
  'node-fetch',
  'uuid',
  'p-limit',
  'winston'
];

let missingDeps = [];
for (const dep of requiredDeps) {
  try {
    require.resolve(dep);
  } catch (e) {
    console.log(`   ❌ Missing dependency: ${dep}`);
    missingDeps.push(dep);
    exitCode = 1;
  }
}

if (missingDeps.length === 0) {
  console.log(`   ✅ All critical dependencies installed\n`);
} else {
  console.log(`   ❌ ${missingDeps.length} dependencies missing (run: npm ci)\n`);
}

// 5. Attempt to load test runners (validates import closure)
console.log('5. Import Closure Validation');
let importErrors = [];

// Don't actually require them (to avoid side effects), just check if they can be resolved
const testModules = [
  './leo2/validation/run-avs-1r.js',
  './leo2/validation/run-avs-2e.js',
  './leo2/validation/avs-harness.js'
];

for (const mod of testModules) {
  const modPath = path.join(__dirname, '..', mod);
  try {
    // Just check if the file exists and is readable
    fs.accessSync(modPath, fs.constants.R_OK);
  } catch (e) {
    console.log(`   ❌ Cannot access: ${mod}`);
    importErrors.push(mod);
    exitCode = 1;
  }
}

if (importErrors.length === 0) {
  console.log(`   ✅ All test modules accessible\n`);
} else {
  console.log(`   ❌ ${importErrors.length} modules inaccessible\n`);
}

// 6. Check demo data files
console.log('6. Demo Data Files Check');
const demoFiles = [
  'demo/data/chunks.jsonl',
  'demo/data/embeddings.jsonl'
];

let missingDemoFiles = [];
for (const file of demoFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  Missing: ${file} (will be created on first run)`);
    missingDemoFiles.push(file);
  }
}

if (missingDemoFiles.length === 0) {
  console.log(`   ✅ All demo data files present\n`);
} else {
  console.log(`   ⚠️  ${missingDemoFiles.length} demo files missing (non-critical)\n`);
}

// Summary
console.log('================================================================================');
console.log('PREFLIGHT CHECK SUMMARY');
console.log('================================================================================\n');

if (exitCode === 0) {
  console.log('✅ All structural checks PASSED\n');
  console.log('Repository is structurally complete.');
  console.log('Next step: Configure .env and run: npm run preflight\n');
} else {
  console.log('❌ Structural checks FAILED\n');
  console.log('Please fix the issues above before running validation tests.\n');
}

process.exit(exitCode);
