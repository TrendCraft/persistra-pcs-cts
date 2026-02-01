/**
 * Leo Codex - Fix Self-Test Paths
 * 
 * This script ensures that all the required directories and files for self-testing
 * are properly set up.
 */

const path = require('path');
const fs = require('fs');
const selfTestConfig = require('./self-test-config');

// Ensure a directory exists
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// Ensure a file's parent directory exists
function ensureFileDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  ensureDirectoryExists(dir);
}

// Create an empty file if it doesn't exist
function touchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    ensureFileDirectoryExists(filePath);
    fs.writeFileSync(filePath, '', 'utf8');
    console.log(`Created empty file: ${filePath}`);
  }
}

// Fix all paths
function fixPaths() {
  console.log('Fixing self-test paths...');
  
  // Ensure output directories exist
  ensureDirectoryExists(selfTestConfig.outputDirs.results);
  ensureDirectoryExists(selfTestConfig.outputDirs.context);
  ensureDirectoryExists(selfTestConfig.outputDirs.baseline);
  ensureDirectoryExists(path.join(selfTestConfig.outputDirs.results, 'data'));
  ensureDirectoryExists(path.join(selfTestConfig.outputDirs.results, 'cache'));
  ensureDirectoryExists(path.join(selfTestConfig.outputDirs.results, 'logs'));
  
  // Ensure files exist
  touchFile(selfTestConfig.outputDirs.metrics);
  touchFile(selfTestConfig.outputDirs.report);
  
  console.log('Self-test paths fixed successfully');
}

// Run the fix
fixPaths();

// Export for programmatic use
module.exports = fixPaths;
