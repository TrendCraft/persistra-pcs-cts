#!/usr/bin/env node

/**
 * Validate Import Closure
 * 
 * Attempts to require all test modules to find missing dependencies.
 * This validates the full dependency closure without running tests.
 */

const path = require('path');

console.log('Validating import closure...\n');

const modulesToCheck = [
  'leo2/validation/run-avs-1r.js',
  'leo2/validation/run-avs-2e.js'
];

let errors = [];

for (const mod of modulesToCheck) {
  console.log(`Checking: ${mod}`);
  try {
    // Set DATA_DIR to avoid side effects
    process.env.DATA_DIR = '/tmp/test-data-dir';
    const modPath = path.join(__dirname, '..', mod);
    
    // Try to load the module
    require(modPath);
    console.log(`  ✅ OK\n`);
  } catch (err) {
    console.log(`  ❌ ERROR: ${err.message}\n`);
    errors.push({ module: mod, error: err.message, stack: err.stack });
  }
}

if (errors.length > 0) {
  console.log('\n================================================================================');
  console.log('IMPORT VALIDATION FAILED');
  console.log('================================================================================\n');
  
  for (const err of errors) {
    console.log(`Module: ${err.module}`);
    console.log(`Error: ${err.error}`);
    console.log('---');
  }
  
  process.exit(1);
} else {
  console.log('================================================================================');
  console.log('✅ All imports validated successfully');
  console.log('================================================================================\n');
  process.exit(0);
}
