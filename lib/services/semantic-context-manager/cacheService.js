/**
 * CacheService - Handles query cache, invalidation, and stats for the semantic context manager.
 * All cache state is encapsulated and accessed via explicit API.
 *
 * Usage: const cacheService = new CacheService({ logger, eventBus, config })
 */

let _cacheService = null;

class CacheService {
  constructor({ logger, eventBus, config }) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.config = config || {};
    this.queryCache = new Map();
  }

  invalidateCache(options = {}) {
    const startTime = Date.now();
    const cacheSize = this.queryCache.size;
    this.queryCache.clear();
    if (this.logger) this.logger.info(`Cache invalidated, cleared ${cacheSize} entries`);
    if (this.eventBus) {
      this.eventBus.emit('context:cache:invalidated', {
        component: 'semantic-context-manager',
        timestamp: Date.now(),
        cacheSize,
        options
      });
    }
    return {
      success: true,
      metadata: {
        timestamp: Date.now(),
        entriesCleared: cacheSize,
        duration: Date.now() - startTime,
        options
      }
    };
  }

  getCacheStats() {
    return {
      size: this.queryCache.size,
      keys: Array.from(this.queryCache.keys()),
      valuesSample: Array.from(this.queryCache.values()).slice(0, 5)
    };
  }

  get(key) {
    return this.queryCache.get(key);
  }

  set(key, value) {
    this.queryCache.set(key, value);
  }

  has(key) {
    return this.queryCache.has(key);
  }

  delete(key) {
    return this.queryCache.delete(key);
  }
}

function setCacheService(service) {
  _cacheService = service;
}

function getCacheService() {
  return _cacheService;
}

module.exports = {
  CacheService,
  setCacheService,
  getCacheService,
};
