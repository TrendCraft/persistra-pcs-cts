/**
 * Leo Codex Self-Test Module
 * 
 * This module implements the self-testing approach for Leo, allowing it to
 * process its own codebase and measure the quality of contextualization.
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const config = require('../config/config');
const { readJsonFile, writeJsonFile } = require('../utils/file-utils');

// Create component logger
const logger = createComponentLogger('self-test');

// Default test queries for evaluating Leo's self-understanding
const DEFAULT_TEST_QUERIES = [
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
];

/**
 * Self-Test Configuration
 */
class SelfTestConfig {
  constructor() {
    this.leoRootDir = path.resolve(__dirname, '../..');
    this.resultsDir = path.join(this.leoRootDir, 'self-test-results');
    this.testQueries = DEFAULT_TEST_QUERIES;
    this.metricsFile = path.join(this.resultsDir, 'metrics.json');
    this.contextOutputDir = path.join(this.resultsDir, 'context-outputs');
    this.baselineDir = path.join(this.resultsDir, 'baseline');
    this.compareWithBaseline = false;
    this.version = require('../../package.json').version;
  }

  /**
   * Load configuration from file
   * @param {string} configPath - Path to configuration file
   * @returns {SelfTestConfig} Updated configuration
   */
  loadFromFile(configPath) {
    try {
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        Object.assign(this, fileConfig);
        logger.info(`Loaded self-test configuration from ${configPath}`);
      }
    } catch (error) {
      logger.error(`Failed to load self-test configuration: ${error.message}`);
    }
    return this;
  }

  /**
   * Save configuration to file
   * @param {string} configPath - Path to configuration file
   * @returns {boolean} Success status
   */
  saveToFile(configPath) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(this, null, 2), 'utf8');
      logger.info(`Saved self-test configuration to ${configPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save self-test configuration: ${error.message}`);
      return false;
    }
  }

  /**
   * Ensure all required directories exist
   */
  ensureDirectories() {
    [this.resultsDir, this.contextOutputDir, this.baselineDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
  }
}

/**
 * Self-Test Metrics
 */
class SelfTestMetrics {
  constructor() {
    this.version = require('../../package.json').version;
    this.timestamp = new Date().toISOString();
    this.queries = [];
    this.summary = {
      averageContextSize: 0,
      averageRelevanceScore: 0,
      averageProcessingTime: 0,
      totalQueries: 0,
      successfulQueries: 0
    };
  }

  /**
   * Add query result to metrics
   * @param {Object} queryResult - Query result data
   */
  addQueryResult(queryResult) {
    this.queries.push(queryResult);
    this.updateSummary();
  }

  /**
   * Update summary metrics
   */
  updateSummary() {
    const successful = this.queries.filter(q => q.success);
    this.summary.totalQueries = this.queries.length;
    this.summary.successfulQueries = successful.length;
    
    if (successful.length > 0) {
      this.summary.averageContextSize = successful.reduce((sum, q) => sum + q.contextSize, 0) / successful.length;
      this.summary.averageRelevanceScore = successful.reduce((sum, q) => sum + q.relevanceScore, 0) / successful.length;
      this.summary.averageProcessingTime = successful.reduce((sum, q) => sum + q.processingTime, 0) / successful.length;
    }
  }

  /**
   * Save metrics to file
   * @param {string} filePath - Path to save metrics
   * @returns {boolean} Success status
   */
  saveToFile(filePath) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this, null, 2), 'utf8');
      logger.info(`Saved metrics to ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save metrics: ${error.message}`);
      return false;
    }
  }

  /**
   * Load metrics from file
   * @param {string} filePath - Path to load metrics from
   * @returns {SelfTestMetrics|null} Loaded metrics or null if failed
   */
  static loadFromFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const metrics = new SelfTestMetrics();
        Object.assign(metrics, data);
        logger.info(`Loaded metrics from ${filePath}`);
        return metrics;
      }
    } catch (error) {
      logger.error(`Failed to load metrics: ${error.message}`);
    }
    return null;
  }
}

/**
 * Self-Test Runner
 */
class SelfTestRunner {
  /**
   * Create a new self-test runner
   * @param {Object} options - Configuration options
   * @param {Object} contextManager - Context manager instance
   */
  constructor(options = {}, contextManager = null) {
    this.config = new SelfTestConfig();
    Object.assign(this.config, options);
    this.config.ensureDirectories();
    
    this.metrics = new SelfTestMetrics();
    this.contextManager = contextManager;
    
    // Load previous metrics if available
    const previousMetrics = SelfTestMetrics.loadFromFile(this.config.metricsFile);
    if (previousMetrics) {
      this.previousMetrics = previousMetrics;
    }
    
    logger.info('Self-test runner initialized', { version: this.config.version });
  }

  /**
   * Set context manager
   * @param {Object} contextManager - Context manager instance
   */
  setContextManager(contextManager) {
    this.contextManager = contextManager;
  }

  /**
   * Run a single test query
   * @param {string} query - Query to test
   * @returns {Object} Query result
   */
  async runTestQuery(query) {
    if (!this.contextManager) {
      logger.error('Context manager not set');
      return {
        query,
        success: false,
        error: 'Context manager not set'
      };
    }

    const startTime = Date.now();
    let result;

    try {
      // Get context for query
      result = await this.contextManager.getContextForQuery(query);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Calculate basic metrics
      const contextSize = result.context ? result.context.length : 0;
      const relevanceScore = result.relevanceScore || 0;
      
      // Save context output
      const outputFile = path.join(
        this.config.contextOutputDir,
        `query_${Date.now()}.json`
      );
      
      fs.writeFileSync(outputFile, JSON.stringify({
        query,
        context: result.context,
        processingTime,
        timestamp: new Date().toISOString()
      }, null, 2), 'utf8');
      
      // Return query result
      return {
        query,
        success: true,
        contextSize,
        relevanceScore,
        processingTime,
        outputFile
      };
    } catch (error) {
      logger.error(`Query failed: ${error.message}`, { query });
      return {
        query,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Run all test queries
   * @returns {Object} Test results
   */
  async runAllTests() {
    logger.info('Starting self-test run', { 
      queries: this.config.testQueries.length,
      version: this.config.version
    });

    for (const query of this.config.testQueries) {
      logger.info(`Running test query: ${query}`);
      const result = await this.runTestQuery(query);
      this.metrics.addQueryResult(result);
      
      if (result.success) {
        logger.info(`Query completed successfully`, {
          processingTime: `${result.processingTime}ms`,
          contextSize: result.contextSize
        });
      } else {
        logger.error(`Query failed: ${result.error}`);
      }
    }

    // Save metrics
    try {
      const metricsPath = path.join(this.config.resultsDir, 'metrics.json');
      ensureDirectoryExists(path.dirname(metricsPath));
      fs.writeFileSync(metricsPath, JSON.stringify(this.metrics, null, 2), 'utf8');
      logger.info(`Metrics saved to: ${metricsPath}`);
    } catch (error) {
      logger.error(`Failed to save metrics: ${error.message}`);
    }
    
    // Compare with baseline if enabled
    if (this.config.compareWithBaseline && this.previousMetrics) {
      this.compareWithPrevious();
    }

    return {
      metrics: this.metrics,
      comparison: this.comparison
    };
  }

  /**
   * Compare current metrics with previous run
   */
  compareWithPrevious() {
    if (!this.previousMetrics) {
      logger.warn('No previous metrics available for comparison');
      return;
    }

    this.comparison = {
      previousVersion: this.previousMetrics.version,
      currentVersion: this.metrics.version,
      contextSizeDiff: this.metrics.summary.averageContextSize - this.previousMetrics.summary.averageContextSize,
      relevanceScoreDiff: this.metrics.summary.averageRelevanceScore - this.previousMetrics.summary.averageRelevanceScore,
      processingTimeDiff: this.metrics.summary.averageProcessingTime - this.previousMetrics.summary.averageProcessingTime,
      successRateDiff: 
        (this.metrics.summary.successfulQueries / this.metrics.summary.totalQueries) - 
        (this.previousMetrics.summary.successfulQueries / this.previousMetrics.summary.totalQueries)
    };

    logger.info('Comparison with previous metrics', this.comparison);
  }

  /**
   * Generate a report of the self-test results
   * @returns {string} Markdown report
   */
  generateReport() {
    const report = [];
    
    report.push(`# Leo Self-Test Report`);
    report.push(`\nGenerated: ${new Date().toISOString()}`);
    report.push(`Version: ${this.metrics.version}`);
    
    report.push(`\n## Summary`);
    report.push(`- Total Queries: ${this.metrics.summary.totalQueries}`);
    report.push(`- Successful Queries: ${this.metrics.summary.successfulQueries}`);
    report.push(`- Success Rate: ${(this.metrics.summary.successfulQueries / this.metrics.summary.totalQueries * 100).toFixed(2)}%`);
    report.push(`- Average Context Size: ${this.metrics.summary.averageContextSize.toFixed(2)} characters`);
    report.push(`- Average Relevance Score: ${this.metrics.summary.averageRelevanceScore.toFixed(2)}`);
    report.push(`- Average Processing Time: ${this.metrics.summary.averageProcessingTime.toFixed(2)}ms`);
    
    if (this.comparison) {
      report.push(`\n## Comparison with Previous Version (${this.comparison.previousVersion})`);
      report.push(`- Context Size: ${this.comparison.contextSizeDiff > 0 ? '+' : ''}${this.comparison.contextSizeDiff.toFixed(2)} characters`);
      report.push(`- Relevance Score: ${this.comparison.relevanceScoreDiff > 0 ? '+' : ''}${this.comparison.relevanceScoreDiff.toFixed(2)}`);
      report.push(`- Processing Time: ${this.comparison.processingTimeDiff > 0 ? '+' : ''}${this.comparison.processingTimeDiff.toFixed(2)}ms`);
      report.push(`- Success Rate: ${this.comparison.successRateDiff > 0 ? '+' : ''}${(this.comparison.successRateDiff * 100).toFixed(2)}%`);
    }
    
    report.push(`\n## Query Results`);
    this.metrics.queries.forEach((query, index) => {
      report.push(`\n### Query ${index + 1}: ${query.query}`);
      if (query.success) {
        report.push(`- Status: ✅ Success`);
        report.push(`- Context Size: ${query.contextSize} characters`);
        report.push(`- Relevance Score: ${query.relevanceScore.toFixed(2)}`);
        report.push(`- Processing Time: ${query.processingTime}ms`);
      } else {
        report.push(`- Status: ❌ Failed`);
        report.push(`- Error: ${query.error}`);
      }
    });
    
    return report.join('\n');
  }

  /**
   * Save report to file
   * @param {string} filePath - Path to save report
   * @returns {boolean} Success status
   */
  saveReport(filePath) {
    try {
      const report = this.generateReport();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, report, 'utf8');
      logger.info(`Saved report to ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save report: ${error.message}`);
      return false;
    }
  }
}

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  SelfTestConfig,
  SelfTestMetrics,
  SelfTestRunner,
  DEFAULT_TEST_QUERIES
};
