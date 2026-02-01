/**
 * Leo Codex Main API
 * 
 * This module exports the main Leo Codex API for programmatic use.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('./utils/logger');
const config = require('./config/config');
const { SelfTestRunner } = require('./self-test/self-test');

// Create component logger
const logger = createComponentLogger('leo-api');

/**
 * Initialize Leo in a project
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
async function init(options = {}) {
  const dir = options.dir || process.cwd();
  
  logger.info(`Initializing Leo in ${dir}`);
  
  // Create Leo configuration file
  if (options.createConfig) {
    const configPath = path.join(dir, '.leorc');
    const configContent = JSON.stringify({
      watchDirs: [dir],
      ignore: ['node_modules', 'dist', 'build', '.git'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.md', '.json']
    }, null, 2);
    
    fs.writeFileSync(configPath, configContent, 'utf8');
    logger.info(`Created Leo configuration file: ${configPath}`);
  }
  
  // Update .gitignore
  if (options.setupGitIgnore) {
    const gitignorePath = path.join(dir, '.gitignore');
    let gitignoreContent = '';
    
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }
    
    // Add Leo entries if not already present
    const leoEntries = [
      '# Leo Codex',
      '.leo/',
      'leo-cache/',
      'leo-logs/',
      '.leorc'
    ];
    
    let updated = false;
    for (const entry of leoEntries) {
      if (!gitignoreContent.includes(entry)) {
        gitignoreContent += `\n${entry}`;
        updated = true;
      }
    }
    
    if (updated) {
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
      logger.info(`Updated .gitignore with Leo entries: ${gitignorePath}`);
    }
  }
  
  // Create required directories
  const directories = [
    path.join(dir, '.leo'),
    path.join(dir, '.leo', 'cache'),
    path.join(dir, '.leo', 'logs')
  ];
  
  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      logger.info(`Created directory: ${directory}`);
    }
  }
  
  return {
    success: true,
    dir
  };
}

/**
 * Start Leo services
 * @param {Object} options - Start options
 * @returns {Promise<Object>} Start result
 */
async function start(options = {}) {
  const watchDir = options.watchDir || process.cwd();
  const port = options.port || 3000;
  
  logger.info(`Starting Leo services for ${watchDir}`);
  
  // TODO: Implement actual service startup
  
  return {
    success: true,
    watchDir,
    port
  };
}

/**
 * Stop Leo services
 * @returns {Promise<Object>} Stop result
 */
async function stop() {
  logger.info('Stopping Leo services');
  
  // TODO: Implement actual service shutdown
  
  return {
    success: true
  };
}

/**
 * Get context for a query
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Query result
 */
async function query(options = {}) {
  const question = options.question;
  const dir = options.dir || process.cwd();
  
  logger.info(`Processing query: ${question}`);
  
  // TODO: Implement actual context retrieval
  
  // Mock implementation for now
  const enhancedPrompt = `
=== CONTEXT ===
This is a mock context for the query: ${question}

=== YOUR TASK ===
${question}

When answering, consider the context above.
`;
  
  return {
    success: true,
    question,
    enhancedPrompt
  };
}

/**
 * Get Leo services status
 * @returns {Promise<Object>} Status information
 */
async function status() {
  logger.info('Checking Leo services status');
  
  // TODO: Implement actual status check
  
  // Mock implementation for now
  return {
    liveUpdater: false,
    apiServer: false,
    liveUpdaterPid: null,
    apiPort: 3000,
    liveUpdaterUptime: null,
    apiServerUptime: null,
    filesProcessed: 0,
    lastUpdate: null
  };
}

/**
 * Run self-tests on Leo's own codebase
 * @param {Object} options - Self-test options
 * @returns {Promise<Object>} Self-test results
 */
async function runSelfTest(options = {}) {
  logger.info('Running Leo self-tests', options);
  
  try {
    // Import the self-test modules
    const { SelfTestRunner } = require('./self-test/self-test');
    const ContextManagerAdapter = require('./self-test/context-manager-adapter');
    
    // Create a self-test runner
    const runner = new SelfTestRunner(options);
    
    // Create context manager adapter
    const contextManager = new ContextManagerAdapter({
      embeddingsFile: options.embeddingsFile,
      chunksFile: options.chunksFile,
      cacheDir: options.cacheDir,
      logDir: options.logDir
    });
    
    // Set the context manager
    runner.setContextManager(contextManager);
    
    // Run all tests
    const results = await runner.runAllTests();
    
    // Generate and save report
    const report = runner.generateReport();
    
    return {
      success: true,
      metrics: results.metrics,
      comparison: results.comparison,
      report
    };
  } catch (error) {
    logger.error(`Self-test failed: ${error.message}`);
    throw error;
  }
}

// Export Leo API
module.exports = {
  init,
  start,
  stop,
  query,
  status,
  runSelfTest,
  config
};
