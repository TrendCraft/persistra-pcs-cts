#!/usr/bin/env node

/**
 * Leo Codex - Embedding Comparison Test
 * 
 * This script compares the performance of different embedding approaches:
 * 1. Hash-based embeddings (current approach)
 * 2. True semantic embeddings (new approach)
 * 
 * It evaluates them on code-specific queries to measure relevance improvement.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const semanticEmbeddings = require('../services/semantic-embeddings');
const trueSemanticEmbeddings = require('../services/true-semantic-embeddings');
const semanticContextManager = require('../services/semantic-context-manager');
const selfTestConfig = require('./self-test-config');

// Create component logger
const logger = createComponentLogger('embedding-comparison');

// Test configuration
const TEST_CONFIG = {
  EMBEDDING_TYPES: ['hash', 'true-semantic'],
  TEST_QUERIES: [
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
    'What does the startLeo function do?',
    
    // Component-specific queries
    'Explain the semantic context manager',
    'How does the Live Updater work?',
    'What is the role of the semantic chunker?',
    'How does the interactive CLI work?',
    'What is the purpose of the self-test framework?'
  ],
  RELEVANCE_THRESHOLD: 0.6, // Minimum similarity score to consider a chunk relevant
  MAX_RESULTS: 5, // Number of top results to consider
  OUTPUT_DIR: path.join(process.cwd(), 'self-test-results', 'embedding-comparison')
};

// Ensure output directory exists
if (!fs.existsSync(TEST_CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(TEST_CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * Initialize the test environment
 */
async function initialize() {
  logger.info('Initializing embedding comparison test');
  
  // Initialize semantic embeddings (hash-based)
  semanticEmbeddings.initialize();
  
  // Initialize true semantic embeddings
  await trueSemanticEmbeddings.initialize({
    MODEL_TYPE: 'local', // Use local embeddings for testing
    FALLBACK_TO_HASH: false // Disable fallback to ensure we're testing the true embeddings
  });
  
  // Initialize semantic context manager
  await semanticContextManager.initialize();
  
  logger.info('Test environment initialized');
}

/**
 * Run the embedding comparison test
 */
async function runComparisonTest() {
  logger.info('Starting embedding comparison test');
  
  const results = {
    hash: {
      queries: {},
      averageRelevance: 0,
      averageProcessingTime: 0,
      totalRelevantChunks: 0
    },
    'true-semantic': {
      queries: {},
      averageRelevance: 0,
      averageProcessingTime: 0,
      totalRelevantChunks: 0
    }
  };
  
  // Process each test query
  for (const query of TEST_CONFIG.TEST_QUERIES) {
    logger.info(`Testing query: "${query}"`);
    
    for (const embeddingType of TEST_CONFIG.EMBEDDING_TYPES) {
      logger.info(`Using embedding type: ${embeddingType}`);
      
      const startTime = Date.now();
      
      // Generate query embedding
      let queryEmbedding;
      if (embeddingType === 'hash') {
        queryEmbedding = semanticEmbeddings.generateHashEmbedding(query);
      } else {
        queryEmbedding = await trueSemanticEmbeddings.generateEmbedding(query);
      }
      
      // Get context using the appropriate embedding type
      const context = await getContextWithEmbeddingType(query, embeddingType);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Calculate relevance metrics
      const relevanceMetrics = calculateRelevanceMetrics(query, context);
      
      // Store results for this query and embedding type
      results[embeddingType].queries[query] = {
        processingTime,
        relevantChunks: relevanceMetrics.relevantChunks,
        relevanceScore: relevanceMetrics.relevanceScore,
        topChunk: context.relevantChunks.length > 0 ? {
          file: context.relevantChunks[0].file,
          similarity: context.relevantChunks[0].similarity
        } : null
      };
      
      // Update aggregate metrics
      results[embeddingType].averageProcessingTime += processingTime;
      results[embeddingType].totalRelevantChunks += relevanceMetrics.relevantChunks;
      
      logger.info(`Found ${relevanceMetrics.relevantChunks} relevant chunks with relevance score ${relevanceMetrics.relevanceScore.toFixed(2)}`);
      logger.info(`Processing time: ${processingTime}ms`);
    }
  }
  
  // Calculate final aggregate metrics
  for (const embeddingType of TEST_CONFIG.EMBEDDING_TYPES) {
    results[embeddingType].averageProcessingTime /= TEST_CONFIG.TEST_QUERIES.length;
    results[embeddingType].averageRelevance = 
      results[embeddingType].totalRelevantChunks / 
      (TEST_CONFIG.TEST_QUERIES.length * TEST_CONFIG.MAX_RESULTS);
  }
  
  // Save results
  const resultsFile = path.join(TEST_CONFIG.OUTPUT_DIR, 'comparison-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  // Generate report
  generateReport(results);
  
  logger.info('Embedding comparison test completed');
  return results;
}

/**
 * Get context using a specific embedding type
 * @param {string} query - Query text
 * @param {string} embeddingType - Embedding type ('hash' or 'true-semantic')
 * @returns {Promise<Object>} Context object
 */
async function getContextWithEmbeddingType(query, embeddingType) {
  // For hash-based embeddings, use the semantic context manager directly
  if (embeddingType === 'hash') {
    return await semanticContextManager.searchContext(query, {
      maxResults: TEST_CONFIG.MAX_RESULTS,
      minRelevanceScore: 0.1 // Lower threshold to get more results
    });
  }
  
  // For true semantic embeddings, we need to modify the process
  // This is a simplified version that mimics what the context manager would do
  // In a real implementation, we would integrate this into the context manager
  
  // Get all chunks
  const chunksData = fs.readFileSync(path.join(process.cwd(), 'data', 'chunks.jsonl'), 'utf8');
  const chunks = chunksData.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
  
  // Generate query embedding
  const queryEmbedding = await trueSemanticEmbeddings.generateEmbedding(query);
  
  // Calculate similarity for each chunk
  const results = [];
  for (const chunk of chunks) {
    // Generate chunk embedding
    const chunkEmbedding = await trueSemanticEmbeddings.generateEmbedding(chunk.content);
    
    // Calculate similarity
    const similarity = trueSemanticEmbeddings.cosineSimilarity(queryEmbedding, chunkEmbedding);
    
    results.push({
      chunk_id: chunk.chunk_id,
      file: chunk.file,
      content: chunk.content,
      similarity
    });
  }
  
  // Sort by similarity
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Return top results
  return {
    relevantChunks: results.slice(0, TEST_CONFIG.MAX_RESULTS)
  };
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
  const reportFile = path.join(TEST_CONFIG.OUTPUT_DIR, 'comparison-report.md');
  
  // Calculate improvement percentages
  const relevanceImprovement = 
    ((results['true-semantic'].averageRelevance - results.hash.averageRelevance) / 
    results.hash.averageRelevance) * 100;
  
  const processingTimeChange = 
    ((results['true-semantic'].averageProcessingTime - results.hash.averageProcessingTime) / 
    results.hash.averageProcessingTime) * 100;
  
  // Generate report content
  const reportContent = `# Embedding Comparison Report

## Summary

This report compares the performance of two embedding approaches:
1. **Hash-based embeddings** (current approach)
2. **True semantic embeddings** (new approach)

The test was run on ${TEST_CONFIG.TEST_QUERIES.length} code-specific queries.

## Results

| Metric | Hash-based | True Semantic | Improvement |
|--------|------------|---------------|-------------|
| Average Relevance | ${(results.hash.averageRelevance * 100).toFixed(2)}% | ${(results['true-semantic'].averageRelevance * 100).toFixed(2)}% | ${relevanceImprovement.toFixed(2)}% |
| Average Processing Time | ${results.hash.averageProcessingTime.toFixed(2)}ms | ${results['true-semantic'].averageProcessingTime.toFixed(2)}ms | ${processingTimeChange > 0 ? '+' : ''}${processingTimeChange.toFixed(2)}% |
| Total Relevant Chunks | ${results.hash.totalRelevantChunks} | ${results['true-semantic'].totalRelevantChunks} | ${results['true-semantic'].totalRelevantChunks - results.hash.totalRelevantChunks} |

## Query-by-Query Comparison

${TEST_CONFIG.TEST_QUERIES.map(query => {
  const hashResults = results.hash.queries[query];
  const trueResults = results['true-semantic'].queries[query];
  
  return `### Query: "${query}"

| Embedding Type | Processing Time | Relevant Chunks | Relevance Score | Top Chunk |
|----------------|-----------------|-----------------|-----------------|-----------|
| Hash-based | ${hashResults.processingTime}ms | ${hashResults.relevantChunks} | ${hashResults.relevanceScore.toFixed(2)} | ${hashResults.topChunk ? `${hashResults.topChunk.file} (${hashResults.topChunk.similarity.toFixed(2)})` : 'None'} |
| True Semantic | ${trueResults.processingTime}ms | ${trueResults.relevantChunks} | ${trueResults.relevanceScore.toFixed(2)} | ${trueResults.topChunk ? `${trueResults.topChunk.file} (${trueResults.topChunk.similarity.toFixed(2)})` : 'None'} |

`;
}).join('\n')}

## Conclusion

${relevanceImprovement > 0 ? 
  `The true semantic embeddings approach shows a significant improvement in relevance (${relevanceImprovement.toFixed(2)}%) compared to the hash-based approach.` : 
  `The true semantic embeddings approach does not show an improvement in relevance compared to the hash-based approach.`}

${processingTimeChange > 0 ?
  `However, it comes with a processing time increase of ${processingTimeChange.toFixed(2)}%.` :
  `It also provides a processing time improvement of ${Math.abs(processingTimeChange).toFixed(2)}%.`}

${results['true-semantic'].totalRelevantChunks > results.hash.totalRelevantChunks ?
  `Overall, the true semantic embeddings approach found ${results['true-semantic'].totalRelevantChunks - results.hash.totalRelevantChunks} more relevant chunks across all queries.` :
  `Overall, the true semantic embeddings approach found ${results.hash.totalRelevantChunks - results['true-semantic'].totalRelevantChunks} fewer relevant chunks across all queries.`}

### Recommendation

${relevanceImprovement > 10 ?
  `Based on these results, we recommend adopting the true semantic embeddings approach for Leo's context retrieval system. The significant improvement in relevance outweighs the processing time increase.` :
  relevanceImprovement > 0 ?
    `Based on these results, we recommend further testing of the true semantic embeddings approach. While there is some improvement in relevance, it may not be significant enough to justify the processing time increase.` :
    `Based on these results, we do not recommend adopting the true semantic embeddings approach at this time. Further refinement is needed to improve relevance.`}
`;
  
  // Write report to file
  fs.writeFileSync(reportFile, reportContent);
  logger.info(`Report generated: ${reportFile}`);
}

// Run the test
async function main() {
  try {
    await initialize();
    const results = await runComparisonTest();
    
    // Log summary
    logger.info('Test completed successfully');
    logger.info(`Hash-based average relevance: ${(results.hash.averageRelevance * 100).toFixed(2)}%`);
    logger.info(`True semantic average relevance: ${(results['true-semantic'].averageRelevance * 100).toFixed(2)}%`);
    
    const improvement = ((results['true-semantic'].averageRelevance - results.hash.averageRelevance) / 
      results.hash.averageRelevance) * 100;
    
    logger.info(`Relevance improvement: ${improvement.toFixed(2)}%`);
    
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
  runComparisonTest
};
