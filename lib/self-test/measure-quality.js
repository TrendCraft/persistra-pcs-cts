#!/usr/bin/env node

/**
 * Leo Codex Quality Measurement
 * 
 * This script measures the quality of Leo's contextualization by comparing
 * the context retrieved for test queries against known good context.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const selfTestConfig = require('./self-test-config');
const { readJsonFile, writeJsonFile } = require('../utils/file-utils');

// Create component logger
const logger = createComponentLogger('quality-measure');

/**
 * Measure contextualization quality
 * @param {Object} options - Options for quality measurement
 * @returns {Object} Quality metrics
 */
async function measureQuality(options = {}) {
  logger.info('Measuring Leo contextualization quality');
  
  const resultsDir = options.resultsDir || selfTestConfig.outputDirs.context;
  const metricsFile = options.metricsFile || selfTestConfig.outputDirs.metrics;
  
  // Load all context outputs
  const contextFiles = fs.readdirSync(resultsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(resultsDir, file));
  
  logger.info(`Found ${contextFiles.length} context output files`);
  
  // Process each context file
  const results = [];
  
  for (const file of contextFiles) {
    try {
      const data = readJsonFile(file);
      
      if (!data || !data.query || !data.context) {
        logger.warn(`Invalid context file: ${file}`);
        continue;
      }
      
      // Calculate basic metrics
      const metrics = calculateMetrics(data);
      results.push({
        query: data.query,
        file,
        metrics
      });
      
      logger.info(`Processed ${file}: relevance=${metrics.relevanceScore.toFixed(2)}, coverage=${metrics.coverageScore.toFixed(2)}`);
    } catch (error) {
      logger.error(`Failed to process ${file}: ${error.message}`);
    }
  }
  
  // Calculate aggregate metrics
  const aggregateMetrics = calculateAggregateMetrics(results);
  
  // Save metrics
  const fullMetrics = {
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version,
    aggregate: aggregateMetrics,
    results
  };
  
  writeJsonFile(metricsFile, fullMetrics);
  logger.info(`Saved metrics to ${metricsFile}`);
  
  return fullMetrics;
}

/**
 * Calculate metrics for a context output
 * @param {Object} data - Context output data
 * @returns {Object} Metrics
 */
function calculateMetrics(data) {
  // Basic metrics
  const contextLength = data.context ? data.context.length : 0;
  const processingTime = data.processingTime || 0;
  
  // Calculate relevance score (this is a placeholder - in a real implementation,
  // we would compare the context against known good context or use more
  // sophisticated methods)
  const relevanceScore = calculateRelevanceScore(data.query, data.context);
  
  // Calculate coverage score
  const coverageScore = calculateCoverageScore(data.query, data.context);
  
  // Calculate quality score (combination of relevance and coverage)
  const qualityScore = (relevanceScore + coverageScore) / 2;
  
  return {
    contextLength,
    processingTime,
    relevanceScore,
    coverageScore,
    qualityScore,
    
    // Thresholds based on configuration
    isRelevant: relevanceScore >= selfTestConfig.metrics.mediumRelevance,
    isComprehensive: coverageScore >= selfTestConfig.metrics.mediumRelevance,
    isEfficient: processingTime <= selfTestConfig.metrics.mediumProcessing
  };
}

/**
 * Calculate relevance score for context
 * @param {string} query - Query
 * @param {string} context - Retrieved context
 * @returns {number} Relevance score (0-1)
 */
function calculateRelevanceScore(query, context) {
  if (!context) return 0;
  
  // This is a simple implementation - in a real system, we would use
  // more sophisticated methods like semantic similarity
  
  // Convert to lowercase for comparison
  const queryLower = query.toLowerCase();
  const contextLower = context.toLowerCase();
  
  // Extract key terms from query (simple approach)
  const queryTerms = queryLower
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(term => term.length > 3)
    .filter(term => !['what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how', 'does', 'do', 'did', 'is', 'are', 'was', 'were', 'has', 'have', 'had'].includes(term));
  
  // Count how many query terms appear in the context
  let matchCount = 0;
  for (const term of queryTerms) {
    if (contextLower.includes(term)) {
      matchCount++;
    }
  }
  
  // Calculate relevance score
  return queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
}

/**
 * Calculate coverage score for context
 * @param {string} query - Query
 * @param {string} context - Retrieved context
 * @returns {number} Coverage score (0-1)
 */
function calculateCoverageScore(query, context) {
  if (!context) return 0;
  
  // This is a simple implementation - in a real system, we would use
  // more sophisticated methods
  
  // Simple heuristic based on context length
  // Assume that longer context (up to a point) provides better coverage
  const idealLength = 2000; // characters
  const maxLength = 5000; // characters
  
  if (context.length <= idealLength) {
    return context.length / idealLength;
  } else if (context.length <= maxLength) {
    return 1 - ((context.length - idealLength) / (maxLength - idealLength) * 0.3);
  } else {
    return 0.7 - ((context.length - maxLength) / 10000 * 0.7);
  }
}

/**
 * Calculate aggregate metrics
 * @param {Array} results - Individual result metrics
 * @returns {Object} Aggregate metrics
 */
function calculateAggregateMetrics(results) {
  if (results.length === 0) {
    return {
      averageRelevance: 0,
      averageCoverage: 0,
      averageQuality: 0,
      averageProcessingTime: 0,
      relevantPercentage: 0,
      comprehensivePercentage: 0,
      efficientPercentage: 0
    };
  }
  
  // Calculate averages
  const averageRelevance = results.reduce((sum, r) => sum + r.metrics.relevanceScore, 0) / results.length;
  const averageCoverage = results.reduce((sum, r) => sum + r.metrics.coverageScore, 0) / results.length;
  const averageQuality = results.reduce((sum, r) => sum + r.metrics.qualityScore, 0) / results.length;
  const averageProcessingTime = results.reduce((sum, r) => sum + r.metrics.processingTime, 0) / results.length;
  
  // Calculate percentages
  const relevantCount = results.filter(r => r.metrics.isRelevant).length;
  const comprehensiveCount = results.filter(r => r.metrics.isComprehensive).length;
  const efficientCount = results.filter(r => r.metrics.isEfficient).length;
  
  return {
    averageRelevance,
    averageCoverage,
    averageQuality,
    averageProcessingTime,
    relevantPercentage: (relevantCount / results.length) * 100,
    comprehensivePercentage: (comprehensiveCount / results.length) * 100,
    efficientPercentage: (efficientCount / results.length) * 100
  };
}

/**
 * Generate quality report
 * @param {Object} metrics - Quality metrics
 * @returns {string} Markdown report
 */
function generateQualityReport(metrics) {
  const report = [];
  
  report.push('# Leo Contextualization Quality Report');
  report.push(`\nGenerated: ${metrics.timestamp}`);
  report.push(`Version: ${metrics.version}`);
  
  report.push('\n## Summary Metrics');
  report.push(`- Average Relevance: ${metrics.aggregate.averageRelevance.toFixed(2)}`);
  report.push(`- Average Coverage: ${metrics.aggregate.averageCoverage.toFixed(2)}`);
  report.push(`- Average Quality: ${metrics.aggregate.averageQuality.toFixed(2)}`);
  report.push(`- Average Processing Time: ${metrics.aggregate.averageProcessingTime.toFixed(2)}ms`);
  report.push(`- Relevant Contexts: ${metrics.aggregate.relevantPercentage.toFixed(2)}%`);
  report.push(`- Comprehensive Contexts: ${metrics.aggregate.comprehensivePercentage.toFixed(2)}%`);
  report.push(`- Efficient Processing: ${metrics.aggregate.efficientPercentage.toFixed(2)}%`);
  
  report.push('\n## Individual Query Results');
  
  metrics.results.forEach((result, index) => {
    report.push(`\n### Query ${index + 1}: ${result.query}`);
    report.push(`- Relevance Score: ${result.metrics.relevanceScore.toFixed(2)}`);
    report.push(`- Coverage Score: ${result.metrics.coverageScore.toFixed(2)}`);
    report.push(`- Quality Score: ${result.metrics.qualityScore.toFixed(2)}`);
    report.push(`- Processing Time: ${result.metrics.processingTime}ms`);
    report.push(`- Is Relevant: ${result.metrics.isRelevant ? '✅' : '❌'}`);
    report.push(`- Is Comprehensive: ${result.metrics.isComprehensive ? '✅' : '❌'}`);
    report.push(`- Is Efficient: ${result.metrics.isEfficient ? '✅' : '❌'}`);
  });
  
  return report.join('\n');
}

// Run measurement if this script is executed directly
if (require.main === module) {
  measureQuality()
    .then(metrics => {
      // Generate and save report
      const report = generateQualityReport(metrics);
      const reportPath = path.join(selfTestConfig.outputDirs.results, 'quality-report.md');
      fs.writeFileSync(reportPath, report, 'utf8');
      
      console.log('Quality measurement complete');
      console.log(`Report saved to: ${reportPath}`);
      
      // Display summary
      console.log('\n===== Leo Quality Metrics =====');
      console.log(`Average Relevance: ${metrics.aggregate.averageRelevance.toFixed(2)}`);
      console.log(`Average Coverage: ${metrics.aggregate.averageCoverage.toFixed(2)}`);
      console.log(`Average Quality: ${metrics.aggregate.averageQuality.toFixed(2)}`);
      console.log(`Average Processing Time: ${metrics.aggregate.averageProcessingTime.toFixed(2)}ms`);
      console.log(`Relevant Contexts: ${metrics.aggregate.relevantPercentage.toFixed(2)}%`);
      console.log(`Comprehensive Contexts: ${metrics.aggregate.comprehensivePercentage.toFixed(2)}%`);
      console.log(`Efficient Processing: ${metrics.aggregate.efficientPercentage.toFixed(2)}%`);
      
      process.exit(0);
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
} else {
  // Export for programmatic use
  module.exports = {
    measureQuality,
    generateQualityReport
  };
}
