/**
 * Leo Codex Self-Test Configuration
 * 
 * This module provides default configuration for Leo's self-testing functionality.
 */

const path = require('path');

// Get Leo root directory
const LEO_ROOT = path.resolve(__dirname, '../..');

module.exports = {
  // Directories to watch for the self-test
  watchDirs: [
    path.join(LEO_ROOT, 'src'),
    path.join(LEO_ROOT, 'lib'),
    path.join(LEO_ROOT, 'bin')
  ],
  
  // Directories to ignore
  ignoreDirs: [
    'node_modules',
    'dist',
    'build',
    '.git',
    'logs',
    'cache',
    'data',
    'self-test-results'
  ],
  
  // File extensions to watch
  fileExtensions: [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.md',
    '.json'
  ],
  
  // Output directories
  outputDirs: {
    results: path.join(LEO_ROOT, 'self-test-results'),
    context: path.join(LEO_ROOT, 'self-test-results', 'context-outputs'),
    baseline: path.join(LEO_ROOT, 'self-test-results', 'baseline'),
    metrics: path.join(LEO_ROOT, 'self-test-results', 'metrics.json'),
    report: path.join(LEO_ROOT, 'self-test-results', 'report.md')
  },
  
  // Test queries for evaluating Leo's self-understanding
  testQueries: [
    "How does the Live Updater handle file watching?",
    "Explain the context manager's caching mechanism",
    "How does Leo generate embeddings for files?",
    "What's the relationship between the CLI and the core Leo API?",
    "How does Leo handle configuration and environment variables?",
    "Explain Leo's logging system and how it's used across components",
    "How does the file processing pipeline work in Leo?",
    "What happens when a file is modified in a watched directory?",
    "How does Leo prioritize and batch file processing tasks?",
    "Explain how Leo's context retrieval works for a user query"
  ],
  
  // Evaluation metrics
  metrics: {
    // Relevance thresholds
    highRelevance: 0.8,
    mediumRelevance: 0.6,
    lowRelevance: 0.4,
    
    // Performance thresholds (in ms)
    fastProcessing: 500,
    mediumProcessing: 2000,
    slowProcessing: 5000
  }
};
