/**
 * Leo Codex - Test Improved Context Manager
 * 
 * This module tests the improved context manager against the original one,
 * comparing the quality of context retrieval and prompt generation.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const config = require('../config/config');
const originalContextManager = require('../../src/leo-codex/services/enhanced-context-manager');
const improvedContextManager = require('../services/improved-context-manager');
const { readJsonlFile, writeJsonlFile, ensureDirExists } = require('../utils/file-utils');
const selfTestConfig = require('./self-test-config');

// Create component logger
const logger = createComponentLogger('test-improved-context');

// Output directory for test results
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'context-comparison');

/**
 * Prepare the test environment
 */
async function prepareTestEnvironment() {
  // Ensure output directory exists
  ensureDirExists(TEST_OUTPUT_DIR);
  
  logger.info('Test environment prepared', { outputDir: TEST_OUTPUT_DIR });
}

/**
 * Run a single test query through both context managers
 * @param {string} query - Test query
 * @returns {Object} Test results
 */
async function runSingleTest(query) {
  logger.info(`Running test for query: ${query}`);
  
  try {
    // Get results from original context manager
    const originalStartTime = Date.now();
    const originalPrompt = await originalContextManager.injectContext(query);
    const originalEndTime = Date.now();
    const originalDuration = originalEndTime - originalStartTime;
    
    // Get results from improved context manager
    const improvedStartTime = Date.now();
    const improvedPrompt = await improvedContextManager.generateEnhancedPrompt(query);
    const improvedEndTime = Date.now();
    const improvedDuration = improvedEndTime - improvedStartTime;
    
    // Calculate basic metrics
    const originalLength = originalPrompt.length;
    const improvedLength = improvedPrompt.length;
    
    // Extract context from prompts
    const originalContext = extractContext(originalPrompt);
    const improvedContext = extractContext(improvedPrompt);
    
    // Calculate context metrics
    const contextComparison = compareContexts(originalContext, improvedContext);
    
    // Save prompts to files
    const testId = generateTestId(query);
    const originalPromptPath = path.join(TEST_OUTPUT_DIR, `${testId}-original.txt`);
    const improvedPromptPath = path.join(TEST_OUTPUT_DIR, `${testId}-improved.txt`);
    
    fs.writeFileSync(originalPromptPath, originalPrompt, 'utf8');
    fs.writeFileSync(improvedPromptPath, improvedPrompt, 'utf8');
    
    return {
      query,
      testId,
      original: {
        prompt: originalPrompt,
        promptLength: originalLength,
        duration: originalDuration,
        contextLength: originalContext.length,
        promptPath: originalPromptPath
      },
      improved: {
        prompt: improvedPrompt,
        promptLength: improvedLength,
        duration: improvedDuration,
        contextLength: improvedContext.length,
        promptPath: improvedPromptPath
      },
      comparison: contextComparison
    };
  } catch (error) {
    logger.error(`Test failed for query: ${query}`, { error: error.message });
    return {
      query,
      error: error.message,
      success: false
    };
  }
}

/**
 * Extract context from a prompt
 * @param {string} prompt - Enhanced prompt
 * @returns {string} Extracted context
 */
function extractContext(prompt) {
  // For original context manager
  if (prompt.includes('=== YOUR TASK ===')) {
    const parts = prompt.split('=== YOUR TASK ===');
    return parts[0].trim();
  }
  
  // For improved context manager
  if (prompt.includes('=== CONTEXT ===')) {
    const contextStart = prompt.indexOf('=== CONTEXT ===') + '=== CONTEXT ==='.length;
    const contextEnd = prompt.indexOf('=== YOUR TASK ===');
    
    if (contextEnd > contextStart) {
      return prompt.substring(contextStart, contextEnd).trim();
    }
  }
  
  return '';
}

/**
 * Compare two contexts
 * @param {string} originalContext - Original context
 * @param {string} improvedContext - Improved context
 * @returns {Object} Comparison metrics
 */
function compareContexts(originalContext, improvedContext) {
  // Basic metrics
  const originalLength = originalContext.length;
  const improvedLength = improvedContext.length;
  const lengthDiff = improvedLength - originalLength;
  const lengthRatio = improvedLength / (originalLength || 1);
  
  // Count code blocks
  const originalCodeBlocks = (originalContext.match(/```/g) || []).length / 2;
  const improvedCodeBlocks = (improvedContext.match(/```/g) || []).length / 2;
  
  // Count sections
  const originalSections = (originalContext.match(/===/g) || []).length;
  const improvedSections = (improvedContext.match(/===/g) || []).length;
  
  // Check for redundancy (approximate)
  const originalLines = originalContext.split('\n');
  const improvedLines = improvedContext.split('\n');
  
  const originalUniqueLines = new Set(originalLines).size;
  const improvedUniqueLines = new Set(improvedLines).size;
  
  const originalRedundancyRatio = originalUniqueLines / (originalLines.length || 1);
  const improvedRedundancyRatio = improvedUniqueLines / (improvedLines.length || 1);
  
  return {
    lengthDiff,
    lengthRatio,
    originalCodeBlocks,
    improvedCodeBlocks,
    originalSections,
    improvedSections,
    originalRedundancyRatio,
    improvedRedundancyRatio
  };
}

/**
 * Generate a test ID from a query
 * @param {string} query - Test query
 * @returns {string} Test ID
 */
function generateTestId(query) {
  // Create a slug from the query
  const slug = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
  
  // Add timestamp
  return `${Date.now()}-${slug}`;
}

/**
 * Run all test queries
 * @returns {Promise<Object>} Test results
 */
async function runAllTests() {
  logger.info('Starting context manager comparison tests');
  
  // Prepare test environment
  await prepareTestEnvironment();
  
  // Get test queries
  const testQueries = selfTestConfig.testQueries;
  
  // Run tests
  const results = [];
  
  for (const query of testQueries) {
    const result = await runSingleTest(query);
    results.push(result);
  }
  
  // Generate summary
  const summary = generateSummary(results);
  
  // Save results
  const resultsPath = path.join(TEST_OUTPUT_DIR, 'results.json');
  const summaryPath = path.join(TEST_OUTPUT_DIR, 'summary.md');
  
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(summaryPath, summary, 'utf8');
  
  logger.info('Context manager comparison tests completed', {
    resultsPath,
    summaryPath
  });
  
  return {
    results,
    summary,
    resultsPath,
    summaryPath
  };
}

/**
 * Generate a summary report
 * @param {Array} results - Test results
 * @returns {string} Summary report in markdown
 */
function generateSummary(results) {
  // Calculate aggregate metrics
  const successfulTests = results.filter(r => !r.error);
  const totalTests = results.length;
  
  if (successfulTests.length === 0) {
    return '# Context Manager Comparison Test Results\n\nNo successful tests were run.';
  }
  
  // Calculate averages
  const avgOriginalLength = average(successfulTests.map(r => r.original.promptLength));
  const avgImprovedLength = average(successfulTests.map(r => r.improved.promptLength));
  
  const avgOriginalDuration = average(successfulTests.map(r => r.original.duration));
  const avgImprovedDuration = average(successfulTests.map(r => r.improved.duration));
  
  const avgOriginalContextLength = average(successfulTests.map(r => r.original.contextLength));
  const avgImprovedContextLength = average(successfulTests.map(r => r.improved.contextLength));
  
  const avgLengthRatio = average(successfulTests.map(r => r.comparison.lengthRatio));
  
  const avgOriginalCodeBlocks = average(successfulTests.map(r => r.comparison.originalCodeBlocks));
  const avgImprovedCodeBlocks = average(successfulTests.map(r => r.comparison.improvedCodeBlocks));
  
  const avgOriginalSections = average(successfulTests.map(r => r.comparison.originalSections));
  const avgImprovedSections = average(successfulTests.map(r => r.comparison.improvedSections));
  
  const avgOriginalRedundancy = average(successfulTests.map(r => r.comparison.originalRedundancyRatio));
  const avgImprovedRedundancy = average(successfulTests.map(r => r.comparison.improvedRedundancyRatio));
  
  // Generate markdown report
  let markdown = `# Context Manager Comparison Test Results\n\n`;
  markdown += `Test Date: ${new Date().toISOString()}\n\n`;
  
  markdown += `## Summary\n\n`;
  markdown += `- Total tests: ${totalTests}\n`;
  markdown += `- Successful tests: ${successfulTests.length}\n\n`;
  
  markdown += `## Performance Metrics\n\n`;
  markdown += `| Metric | Original | Improved | Difference | Ratio |\n`;
  markdown += `|--------|----------|----------|------------|-------|\n`;
  markdown += `| Avg Prompt Length | ${avgOriginalLength.toFixed(0)} | ${avgImprovedLength.toFixed(0)} | ${(avgImprovedLength - avgOriginalLength).toFixed(0)} | ${(avgImprovedLength / avgOriginalLength).toFixed(2)}x |\n`;
  markdown += `| Avg Context Length | ${avgOriginalContextLength.toFixed(0)} | ${avgImprovedContextLength.toFixed(0)} | ${(avgImprovedContextLength - avgOriginalContextLength).toFixed(0)} | ${(avgImprovedContextLength / avgOriginalContextLength).toFixed(2)}x |\n`;
  markdown += `| Avg Duration (ms) | ${avgOriginalDuration.toFixed(0)} | ${avgImprovedDuration.toFixed(0)} | ${(avgImprovedDuration - avgOriginalDuration).toFixed(0)} | ${(avgImprovedDuration / avgOriginalDuration).toFixed(2)}x |\n`;
  markdown += `| Avg Code Blocks | ${avgOriginalCodeBlocks.toFixed(2)} | ${avgImprovedCodeBlocks.toFixed(2)} | ${(avgImprovedCodeBlocks - avgOriginalCodeBlocks).toFixed(2)} | ${(avgImprovedCodeBlocks / (avgOriginalCodeBlocks || 1)).toFixed(2)}x |\n`;
  markdown += `| Avg Sections | ${avgOriginalSections.toFixed(2)} | ${avgImprovedSections.toFixed(2)} | ${(avgImprovedSections - avgOriginalSections).toFixed(2)} | ${(avgImprovedSections / (avgOriginalSections || 1)).toFixed(2)}x |\n`;
  markdown += `| Redundancy Ratio | ${avgOriginalRedundancy.toFixed(2)} | ${avgImprovedRedundancy.toFixed(2)} | ${(avgImprovedRedundancy - avgOriginalRedundancy).toFixed(2)} | ${(avgImprovedRedundancy / avgOriginalRedundancy).toFixed(2)}x |\n\n`;
  
  markdown += `## Individual Test Results\n\n`;
  
  for (const result of successfulTests) {
    markdown += `### Query: "${result.query}"\n\n`;
    markdown += `- Original prompt length: ${result.original.promptLength} chars\n`;
    markdown += `- Improved prompt length: ${result.improved.promptLength} chars\n`;
    markdown += `- Length difference: ${result.comparison.lengthDiff} chars (${result.comparison.lengthRatio.toFixed(2)}x)\n`;
    markdown += `- Original sections: ${result.comparison.originalSections}\n`;
    markdown += `- Improved sections: ${result.comparison.improvedSections}\n`;
    markdown += `- Original code blocks: ${result.comparison.originalCodeBlocks}\n`;
    markdown += `- Improved code blocks: ${result.comparison.improvedCodeBlocks}\n\n`;
  }
  
  return markdown;
}

/**
 * Calculate average of an array of numbers
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} Average
 */
function average(arr) {
  if (!arr || arr.length === 0) {
    return 0;
  }
  
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// Export functions
module.exports = {
  runAllTests,
  runSingleTest,
  prepareTestEnvironment
};

// Run tests if called directly
if (require.main === module) {
  runAllTests()
    .then(({ summaryPath }) => {
      console.log(`Tests completed. Summary saved to ${summaryPath}`);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
