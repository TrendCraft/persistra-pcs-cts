#!/usr/bin/env node

/**
 * Leo Codex Self-Test Runner
 * 
 * This script runs self-tests on Leo's codebase to measure contextualization quality.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const selfTestConfig = require('./self-test-config');
const { SelfTestRunner } = require('./self-test');
const ContextManagerAdapter = require('./context-manager-adapter');

// Create component logger
const logger = createComponentLogger('self-test-runner');

/**
 * Run self-tests on Leo's codebase
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test results
 */
async function runSelfTest(options = {}) {
  logger.info('Starting self-test');
  
  // Create context manager adapter
  const contextManager = new ContextManagerAdapter({
    embeddingsFile: path.join(selfTestConfig.outputDirs.results, 'data', 'embeddings.jsonl'),
    chunksFile: path.join(selfTestConfig.outputDirs.results, 'data', 'chunks.jsonl')
  });
  
  // Create self-test configuration
  const testConfig = {
    testQueries: selfTestConfig.testQueries,
    contextOutputDir: selfTestConfig.outputDirs.context,
    metricsFile: selfTestConfig.outputDirs.metrics,
    reportFile: selfTestConfig.outputDirs.report,
    compareWithBaseline: options.compareWithBaseline || false,
    baselineMetricsFile: options.baselineMetricsFile || selfTestConfig.outputDirs.baseline,
    resultsDir: selfTestConfig.outputDirs.results
  };
  
  // Create and run self-test
  const selfTest = new SelfTestRunner(testConfig, contextManager);
  const results = await selfTest.runAllTests();
  
  // Generate and save report
  const reportPath = testConfig.reportFile;
  selfTest.saveReport(reportPath);
  
  // Display results
  console.log('\n===== Leo Self-Test Results =====');
  console.log(`Total Queries: ${results.metrics.summary.totalQueries}`);
  console.log(`Successful Queries: ${results.metrics.summary.successfulQueries}`);
  console.log(`Success Rate: ${(results.metrics.summary.successfulQueries / results.metrics.summary.totalQueries * 100).toFixed(2)}%`);
  console.log(`Average Context Size: ${results.metrics.summary.averageContextSize.toFixed(2)} characters`);
  console.log(`Average Processing Time: ${results.metrics.summary.averageProcessingTime.toFixed(2)}ms`);
  
  logger.info('Self-test completed successfully');
  logger.info(`Report saved to: ${reportPath}`);
  
  return results;
}

// Export function
module.exports = runSelfTest;

// Run self-test if this script is executed directly
if (require.main === module) {
  runSelfTest()
    .then(results => {
      console.log('\nSelf-test completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error(`Error running self-test: ${error.message}`);
      process.exit(1);
    });
}
