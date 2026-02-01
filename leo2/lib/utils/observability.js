/**
 * Observability Counters and Tripwires
 * 
 * Provides monitoring, metrics collection, and alerting for the Leo2 system.
 * Tracks embedding health, queue depth, dimension mismatches, and performance.
 */

const fs = require('fs').promises;
const path = require('path');

// Global metrics store
let _metrics = {
  embeddings: {
    generated: 0,
    failed: 0,
    dimensionMismatches: 0,
    avgGenerationTime: 0,
    totalGenerationTime: 0,
    lastGenerated: null
  },
  chunks: {
    loaded: 0,
    processed: 0,
    withEmbeddings: 0,
    withoutEmbeddings: 0,
    lastProcessed: null
  },
  search: {
    queries: 0,
    hybridSearches: 0,
    vectorSearches: 0,
    keywordFallbacks: 0,
    avgResultCount: 0,
    avgResponseTime: 0,
    totalResponseTime: 0,
    lastQuery: null
  },
  memory: {
    cardsRetrieved: 0,
    avgSalience: 0,
    memoryFirstDecisions: 0,
    generalFirstDecisions: 0,
    blendDecisions: 0,
    lastRetrieval: null
  },
  errors: {
    embeddingErrors: 0,
    searchErrors: 0,
    loadingErrors: 0,
    lastError: null
  },
  system: {
    startTime: Date.now(),
    uptime: 0,
    memoryUsage: 0,
    lastHealthCheck: null
  }
};

// Tripwire thresholds
const TRIPWIRES = {
  embeddingFailureRate: 0.1, // 10% failure rate
  dimensionMismatchRate: 0.05, // 5% dimension mismatches
  searchResponseTime: 5000, // 5 seconds
  memoryRetrievalRate: 0.8, // 80% should retrieve memory cards
  errorRate: 0.05, // 5% error rate
  queueDepth: 100, // Maximum queue depth
  memoryUsage: 1024 * 1024 * 1024 // 1GB memory usage
};

class ObservabilityManager {
  constructor(config = {}) {
    this.config = {
      enableMetrics: true,
      enableTripwires: true,
      metricsInterval: 60000, // 1 minute
      alertCallback: null,
      persistMetrics: true,
      metricsFile: path.resolve(__dirname, '../../data/metrics.json'),
      ...config
    };
    
    this.alertCallbacks = [];
    this.metricsTimer = null;
    
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection() {
    this.metricsTimer = setInterval(() => {
      this.updateSystemMetrics();
      this.checkTripwires();
      if (this.config.persistMetrics) {
        this.persistMetrics();
      }
    }, this.config.metricsInterval);
  }

  /**
   * Stop metrics collection
   */
  stopMetricsCollection() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  /**
   * Record embedding generation
   */
  recordEmbeddingGeneration(success, dimensionExpected, dimensionActual, generationTime) {
    if (!this.config.enableMetrics) return;

    const startTime = Date.now();
    
    if (success) {
      _metrics.embeddings.generated++;
      _metrics.embeddings.totalGenerationTime += generationTime;
      _metrics.embeddings.avgGenerationTime = 
        _metrics.embeddings.totalGenerationTime / _metrics.embeddings.generated;
      
      if (dimensionExpected !== dimensionActual) {
        _metrics.embeddings.dimensionMismatches++;
        this.triggerAlert('dimension_mismatch', {
          expected: dimensionExpected,
          actual: dimensionActual,
          timestamp: startTime
        });
      }
    } else {
      _metrics.embeddings.failed++;
      this.triggerAlert('embedding_failure', {
        timestamp: startTime,
        generationTime
      });
    }
    
    _metrics.embeddings.lastGenerated = startTime;
  }

  /**
   * Record chunk processing
   */
  recordChunkProcessing(totalChunks, chunksWithEmbeddings) {
    if (!this.config.enableMetrics) return;

    _metrics.chunks.loaded = totalChunks;
    _metrics.chunks.processed = totalChunks;
    _metrics.chunks.withEmbeddings = chunksWithEmbeddings;
    _metrics.chunks.withoutEmbeddings = totalChunks - chunksWithEmbeddings;
    _metrics.chunks.lastProcessed = Date.now();
  }

  /**
   * Record search operation
   */
  recordSearch(query, resultCount, responseTime, searchType = 'hybrid') {
    if (!this.config.enableMetrics) return;

    const timestamp = Date.now();
    
    _metrics.search.queries++;
    _metrics.search.totalResponseTime += responseTime;
    _metrics.search.avgResponseTime = 
      _metrics.search.totalResponseTime / _metrics.search.queries;
    
    // Update result count average
    const totalResults = (_metrics.search.avgResultCount * (_metrics.search.queries - 1)) + resultCount;
    _metrics.search.avgResultCount = totalResults / _metrics.search.queries;
    
    // Track search types
    switch (searchType) {
      case 'hybrid':
        _metrics.search.hybridSearches++;
        break;
      case 'vector':
        _metrics.search.vectorSearches++;
        break;
      case 'keyword':
        _metrics.search.keywordFallbacks++;
        break;
    }
    
    _metrics.search.lastQuery = timestamp;
    
    // Check response time tripwire
    if (responseTime > TRIPWIRES.searchResponseTime) {
      this.triggerAlert('slow_search', {
        query: query.substring(0, 100),
        responseTime,
        threshold: TRIPWIRES.searchResponseTime,
        timestamp
      });
    }
  }

  /**
   * Record memory retrieval
   */
  recordMemoryRetrieval(cardsRetrieved, avgSalience, decisionMode) {
    if (!this.config.enableMetrics) return;

    const timestamp = Date.now();
    
    _metrics.memory.cardsRetrieved += cardsRetrieved;
    
    // Update average salience
    const totalRetrievals = _metrics.memory.memoryFirstDecisions + 
                           _metrics.memory.generalFirstDecisions + 
                           _metrics.memory.blendDecisions + 1;
    
    const totalSalience = (_metrics.memory.avgSalience * (totalRetrievals - 1)) + avgSalience;
    _metrics.memory.avgSalience = totalSalience / totalRetrievals;
    
    // Track decision modes
    switch (decisionMode) {
      case 'Memory-First':
      case 'memory-first':
        _metrics.memory.memoryFirstDecisions++;
        break;
      case 'General-First':
      case 'general-first':
        _metrics.memory.generalFirstDecisions++;
        break;
      default:
        _metrics.memory.blendDecisions++;
        break;
    }
    
    _metrics.memory.lastRetrieval = timestamp;
  }

  /**
   * Record error
   */
  recordError(errorType, error) {
    if (!this.config.enableMetrics) return;

    const timestamp = Date.now();
    
    switch (errorType) {
      case 'embedding':
        _metrics.errors.embeddingErrors++;
        break;
      case 'search':
        _metrics.errors.searchErrors++;
        break;
      case 'loading':
        _metrics.errors.loadingErrors++;
        break;
    }
    
    _metrics.errors.lastError = {
      type: errorType,
      message: error.message,
      timestamp
    };
    
    this.triggerAlert('error', {
      type: errorType,
      error: error.message,
      timestamp
    });
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    _metrics.system.uptime = Date.now() - _metrics.system.startTime;
    _metrics.system.memoryUsage = process.memoryUsage().heapUsed;
    _metrics.system.lastHealthCheck = Date.now();
  }

  /**
   * Check tripwires and trigger alerts
   */
  checkTripwires() {
    if (!this.config.enableTripwires) return;

    const timestamp = Date.now();
    
    // Embedding failure rate
    const totalEmbeddings = _metrics.embeddings.generated + _metrics.embeddings.failed;
    if (totalEmbeddings > 0) {
      const failureRate = _metrics.embeddings.failed / totalEmbeddings;
      if (failureRate > TRIPWIRES.embeddingFailureRate) {
        this.triggerAlert('high_embedding_failure_rate', {
          rate: failureRate,
          threshold: TRIPWIRES.embeddingFailureRate,
          timestamp
        });
      }
    }
    
    // Dimension mismatch rate
    if (_metrics.embeddings.generated > 0) {
      const mismatchRate = _metrics.embeddings.dimensionMismatches / _metrics.embeddings.generated;
      if (mismatchRate > TRIPWIRES.dimensionMismatchRate) {
        this.triggerAlert('high_dimension_mismatch_rate', {
          rate: mismatchRate,
          threshold: TRIPWIRES.dimensionMismatchRate,
          timestamp
        });
      }
    }
    
    // Memory usage
    if (_metrics.system.memoryUsage > TRIPWIRES.memoryUsage) {
      this.triggerAlert('high_memory_usage', {
        usage: _metrics.system.memoryUsage,
        threshold: TRIPWIRES.memoryUsage,
        timestamp
      });
    }
    
    // Memory retrieval rate
    const totalDecisions = _metrics.memory.memoryFirstDecisions + 
                          _metrics.memory.generalFirstDecisions + 
                          _metrics.memory.blendDecisions;
    
    if (totalDecisions > 10) {
      const memoryRate = _metrics.memory.memoryFirstDecisions / totalDecisions;
      if (memoryRate < TRIPWIRES.memoryRetrievalRate) {
        this.triggerAlert('low_memory_retrieval_rate', {
          rate: memoryRate,
          threshold: TRIPWIRES.memoryRetrievalRate,
          timestamp
        });
      }
    }
  }

  /**
   * Trigger alert
   */
  triggerAlert(alertType, data) {
    const alert = {
      type: alertType,
      timestamp: Date.now(),
      data,
      severity: this.getAlertSeverity(alertType)
    };
    
    console.warn(`[OBSERVABILITY] [${alert.severity.toUpperCase()}] ${alertType}:`, data);
    
    // Call registered callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        console.error('[OBSERVABILITY] Alert callback failed:', error.message);
      }
    });
    
    // Call config callback
    if (this.config.alertCallback) {
      try {
        this.config.alertCallback(alert);
      } catch (error) {
        console.error('[OBSERVABILITY] Config alert callback failed:', error.message);
      }
    }
  }

  /**
   * Get alert severity
   */
  getAlertSeverity(alertType) {
    const severityMap = {
      'dimension_mismatch': 'warning',
      'embedding_failure': 'warning',
      'slow_search': 'warning',
      'error': 'error',
      'high_embedding_failure_rate': 'critical',
      'high_dimension_mismatch_rate': 'critical',
      'high_memory_usage': 'critical',
      'low_memory_retrieval_rate': 'warning'
    };
    
    return severityMap[alertType] || 'info';
  }

  /**
   * Register alert callback
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return JSON.parse(JSON.stringify(_metrics));
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    const totalEmbeddings = _metrics.embeddings.generated + _metrics.embeddings.failed;
    const embeddingSuccessRate = totalEmbeddings > 0 ? 
      (_metrics.embeddings.generated / totalEmbeddings) : 0;
    
    const totalDecisions = _metrics.memory.memoryFirstDecisions + 
                          _metrics.memory.generalFirstDecisions + 
                          _metrics.memory.blendDecisions;
    
    return {
      uptime: _metrics.system.uptime,
      embeddings: {
        total: totalEmbeddings,
        successRate: embeddingSuccessRate,
        avgGenerationTime: _metrics.embeddings.avgGenerationTime,
        dimensionMismatches: _metrics.embeddings.dimensionMismatches
      },
      chunks: {
        loaded: _metrics.chunks.loaded,
        withEmbeddings: _metrics.chunks.withEmbeddings,
        embeddingCoverage: _metrics.chunks.loaded > 0 ? 
          (_metrics.chunks.withEmbeddings / _metrics.chunks.loaded) : 0
      },
      search: {
        queries: _metrics.search.queries,
        avgResponseTime: _metrics.search.avgResponseTime,
        avgResultCount: _metrics.search.avgResultCount,
        hybridSearches: _metrics.search.hybridSearches,
        keywordFallbacks: _metrics.search.keywordFallbacks
      },
      memory: {
        totalDecisions: totalDecisions,
        memoryFirstRate: totalDecisions > 0 ? 
          (_metrics.memory.memoryFirstDecisions / totalDecisions) : 0,
        avgSalience: _metrics.memory.avgSalience,
        cardsRetrieved: _metrics.memory.cardsRetrieved
      },
      system: {
        memoryUsage: _metrics.system.memoryUsage,
        lastHealthCheck: _metrics.system.lastHealthCheck
      }
    };
  }

  /**
   * Persist metrics to file
   */
  async persistMetrics() {
    try {
      const metricsData = {
        timestamp: Date.now(),
        metrics: this.getMetrics(),
        summary: this.getMetricsSummary()
      };
      
      await fs.writeFile(this.config.metricsFile, JSON.stringify(metricsData, null, 2));
    } catch (error) {
      console.error('[OBSERVABILITY] Failed to persist metrics:', error.message);
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    _metrics = {
      embeddings: {
        generated: 0,
        failed: 0,
        dimensionMismatches: 0,
        avgGenerationTime: 0,
        totalGenerationTime: 0,
        lastGenerated: null
      },
      chunks: {
        loaded: 0,
        processed: 0,
        withEmbeddings: 0,
        withoutEmbeddings: 0,
        lastProcessed: null
      },
      search: {
        queries: 0,
        hybridSearches: 0,
        vectorSearches: 0,
        keywordFallbacks: 0,
        avgResultCount: 0,
        avgResponseTime: 0,
        totalResponseTime: 0,
        lastQuery: null
      },
      memory: {
        cardsRetrieved: 0,
        avgSalience: 0,
        memoryFirstDecisions: 0,
        generalFirstDecisions: 0,
        blendDecisions: 0,
        lastRetrieval: null
      },
      errors: {
        embeddingErrors: 0,
        searchErrors: 0,
        loadingErrors: 0,
        lastError: null
      },
      system: {
        startTime: Date.now(),
        uptime: 0,
        memoryUsage: 0,
        lastHealthCheck: null
      }
    };
  }

  /**
   * Print metrics report
   */
  printMetricsReport() {
    const summary = this.getMetricsSummary();
    
    console.log('\n=== LEO2 OBSERVABILITY REPORT ===');
    console.log(`Uptime: ${(summary.uptime / 1000 / 60).toFixed(2)} minutes`);
    console.log(`Memory Usage: ${(summary.system.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n--- Embeddings ---');
    console.log(`Total: ${summary.embeddings.total}`);
    console.log(`Success Rate: ${(summary.embeddings.successRate * 100).toFixed(1)}%`);
    console.log(`Avg Generation Time: ${summary.embeddings.avgGenerationTime.toFixed(2)}ms`);
    console.log(`Dimension Mismatches: ${summary.embeddings.dimensionMismatches}`);
    
    console.log('\n--- Chunks ---');
    console.log(`Loaded: ${summary.chunks.loaded}`);
    console.log(`With Embeddings: ${summary.chunks.withEmbeddings}`);
    console.log(`Embedding Coverage: ${(summary.chunks.embeddingCoverage * 100).toFixed(1)}%`);
    
    console.log('\n--- Search ---');
    console.log(`Queries: ${summary.search.queries}`);
    console.log(`Avg Response Time: ${summary.search.avgResponseTime.toFixed(2)}ms`);
    console.log(`Avg Result Count: ${summary.search.avgResultCount.toFixed(1)}`);
    console.log(`Hybrid Searches: ${summary.search.hybridSearches}`);
    console.log(`Keyword Fallbacks: ${summary.search.keywordFallbacks}`);
    
    console.log('\n--- Memory Retrieval ---');
    console.log(`Total Decisions: ${summary.memory.totalDecisions}`);
    console.log(`Memory-First Rate: ${(summary.memory.memoryFirstRate * 100).toFixed(1)}%`);
    console.log(`Avg Salience: ${summary.memory.avgSalience.toFixed(3)}`);
    console.log(`Cards Retrieved: ${summary.memory.cardsRetrieved}`);
  }
}

// Global instance
let _globalObservability = null;

/**
 * Get global observability instance
 */
function getObservability(config = {}) {
  if (!_globalObservability) {
    _globalObservability = new ObservabilityManager(config);
  }
  return _globalObservability;
}

/**
 * Convenience functions for common operations
 */
const observability = {
  recordEmbeddingGeneration: (success, dimExpected, dimActual, time) => {
    getObservability().recordEmbeddingGeneration(success, dimExpected, dimActual, time);
  },
  
  recordChunkProcessing: (total, withEmbeddings) => {
    getObservability().recordChunkProcessing(total, withEmbeddings);
  },
  
  recordSearch: (query, resultCount, responseTime, searchType) => {
    getObservability().recordSearch(query, resultCount, responseTime, searchType);
  },
  
  recordMemoryRetrieval: (cardsRetrieved, avgSalience, decisionMode) => {
    getObservability().recordMemoryRetrieval(cardsRetrieved, avgSalience, decisionMode);
  },
  
  recordError: (errorType, error) => {
    getObservability().recordError(errorType, error);
  },
  
  getMetrics: () => getObservability().getMetrics(),
  getMetricsSummary: () => getObservability().getMetricsSummary(),
  printReport: () => getObservability().printMetricsReport(),
  
  onAlert: (callback) => getObservability().onAlert(callback)
};

module.exports = {
  ObservabilityManager,
  getObservability,
  observability,
  TRIPWIRES
};
