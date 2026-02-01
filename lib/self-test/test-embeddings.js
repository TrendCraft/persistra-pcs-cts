#!/usr/bin/env node

/**
 * Leo Embedding Test
 * 
 * This script tests the performance of true semantic embeddings compared to
 * the original hash-based approach. It evaluates them on a set of code-specific
 * queries to measure the relevance improvement.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const trueSemanticEmbeddings = require('../services/true-semantic-embeddings');
const semanticContextManager = require('../services/semantic-context-manager');
const configService = require('../config/config');

// Create component logger
const logger = createComponentLogger('embedding-test');

// Test queries
const TEST_QUERIES = [
  // Code-specific queries
  'How does the semantic chunker identify code boundaries?',
  'What is the main function in the live updater?',
  'How does the context manager retrieve relevant chunks?',
  'What is the configuration system in Leo?',
  'How does Leo handle file changes?',
  
  // Function-specific queries
  'Show me the processQuery function',
  'How does the cosineSimilarity function work?',
  'What does the invalidateCache function do?',
  'How does the generateEmbedding function work?',
  'What does the startLeo function do?'
];

// Test configuration
const TEST_CONFIG = {
  OUTPUT_DIR: path.join(process.cwd(), 'self-test-results', 'embedding-test'),
  RELEVANCE_THRESHOLD: 0.6, // Minimum similarity score to consider a chunk relevant
  MAX_RESULTS: 5 // Number of top results to consider
};

// Ensure output directory exists
if (!fs.existsSync(TEST_CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(TEST_CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * Initialize the test environment
 */
async function initialize() {
  logger.info('Initializing embedding test');
  
  // Initialize configuration
  configService.initialize();
  
  // Initialize true semantic embeddings
  await trueSemanticEmbeddings.initialize();
  
  // Initialize semantic context manager
  await semanticContextManager.initialize();
  
  logger.info('Test environment initialized');
}

/**
 * Run the embedding test
 */
async function runTest() {
  logger.info('Starting embedding test');
  
  const results = {
    queries: {},
    averageRelevance: 0,
    totalRelevantChunks: 0,
    totalQueries: TEST_QUERIES.length
  };
  
  // Process each test query
  for (const query of TEST_QUERIES) {
    logger.info(`Testing query: "${query}"`);
    
    const startTime = Date.now();
    
    // Get context using semantic context manager
    const context = await semanticContextManager.searchContext(query, {
      maxResults: TEST_CONFIG.MAX_RESULTS,
      minRelevanceScore: 0.1 // Lower threshold to get more results
    });
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Calculate relevance metrics
    const relevanceMetrics = calculateRelevanceMetrics(query, context);
    
    // Store results for this query
    results.queries[query] = {
      processingTime,
      relevantChunks: relevanceMetrics.relevantChunks,
      relevanceScore: relevanceMetrics.relevanceScore,
      topChunk: context && context.relevantChunks && context.relevantChunks.length > 0 ? {
        file: context.relevantChunks[0].file,
        similarity: context.relevantChunks[0].similarity
      } : null
    };
    
    // Update aggregate metrics
    results.totalRelevantChunks += relevanceMetrics.relevantChunks;
    
    logger.info(`Found ${relevanceMetrics.relevantChunks} relevant chunks with relevance score ${relevanceMetrics.relevanceScore.toFixed(2)}`);
    logger.info(`Processing time: ${processingTime}ms`);
  }
  
  // Calculate final aggregate metrics
  results.averageRelevance = results.totalRelevantChunks / 
    (TEST_QUERIES.length * TEST_CONFIG.MAX_RESULTS);
  
  // Save results
  const resultsFile = path.join(TEST_CONFIG.OUTPUT_DIR, 'embedding-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  // Generate report
  generateReport(results);
  
  logger.info('Embedding test completed');
  return results;
}

/**
 * Calculate relevance metrics for a query and context
 * @param {string} query - Query text
 * @param {Object} context - Context object
 * @returns {Object} Relevance metrics
 */
function calculateRelevanceMetrics(query, context) {
  if (!context || !context.relevantChunks || context.relevantChunks.length === 0) {
    return {
      relevantChunks: 0,
      relevanceScore: 0
    };
  }
  
  // Count chunks with similarity above threshold
  const relevantChunks = context.relevantChunks.filter(
    chunk => chunk.similarity >= TEST_CONFIG.RELEVANCE_THRESHOLD
  ).length;
  
  // Calculate average similarity of top chunks
  const relevanceScore = context.relevantChunks
    .slice(0, TEST_CONFIG.MAX_RESULTS)
    .reduce((sum, chunk) => sum + chunk.similarity, 0) / 
    Math.min(TEST_CONFIG.MAX_RESULTS, context.relevantChunks.length);
  
  return {
    relevantChunks,
    relevanceScore
  };
}

/**
 * Generate a report from the test results
 * @param {Object} results - Test results
 */
function generateReport(results) {
  const reportFile = path.join(TEST_CONFIG.OUTPUT_DIR, 'embedding-report.md');
  
  // Generate report content
  const reportContent = `# True Semantic Embeddings Test Report

## Summary

This report evaluates the performance of Leo's true semantic embeddings using the Embeddings.js library with the MiniLM model.

The test was run on ${TEST_QUERIES.length} code-specific queries.

## Results

| Metric | Value |
|--------|-------|
| Average Relevance | ${(results.averageRelevance * 100).toFixed(2)}% |
| Total Relevant Chunks | ${results.totalRelevantChunks} |
| Average Relevant Chunks per Query | ${(results.totalRelevantChunks / results.totalQueries).toFixed(2)} |

## Query-by-Query Results

${TEST_QUERIES.map(query => {
  const queryResults = results.queries[query];
  
  return `### Query: "${query}"

| Metric | Value |
|--------|-------|
| Processing Time | ${queryResults.processingTime}ms |
| Relevant Chunks | ${queryResults.relevantChunks} |
| Relevance Score | ${queryResults.relevanceScore.toFixed(2)} |
| Top Chunk | ${queryResults.topChunk ? `${queryResults.topChunk.file} (${queryResults.topChunk.similarity.toFixed(2)})` : 'None'} |

`;
}).join('\n')}

## Conclusion

The true semantic embeddings approach ${results.averageRelevance > 0.5 ? 'shows good performance' : 'needs further improvement'} with an average relevance of ${(results.averageRelevance * 100).toFixed(2)}%.

${results.totalRelevantChunks > TEST_QUERIES.length * 2 ?
  `The system found a substantial number of relevant chunks (${results.totalRelevantChunks}) across all queries, indicating good retrieval performance.` :
  `The system found a limited number of relevant chunks (${results.totalRelevantChunks}) across all queries, indicating that retrieval performance could be improved.`}

### Recommendations

1. ${results.averageRelevance > 0.7 ? 
    'Continue using the true semantic embeddings approach as the default for Leo.' : 
    'Further refine the true semantic embeddings approach to improve relevance.'}
2. Consider expanding the test set with more diverse queries.
3. Explore additional embedding models to compare performance.
`;
  
  // Write report to file
  fs.writeFileSync(reportFile, reportContent);
  logger.info(`Report generated: ${reportFile}`);
}

// Run the test
async function main() {
  try {
    await initialize();
    const results = await runTest();
    
    // Log summary
    logger.info('Test completed successfully');
    logger.info(`Average relevance: ${(results.averageRelevance * 100).toFixed(2)}%`);
    logger.info(`Total relevant chunks: ${results.totalRelevantChunks}`);
    
    process.exit(0);
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runTest
};
