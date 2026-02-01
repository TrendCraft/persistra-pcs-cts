// Cache, index, and store management logic

/**
 * TODO: Refactor dependencies on logger, eventBus, COMPONENT_NAME, queryCache, isInitialized, initialize
 * Copied from semantic-context-manager.js
 */
// MIGRATED: All cache logic now in CacheService (see cacheService.js)
const CacheService = require('./cacheService');

function createCacheService(deps) {
  return new CacheService(deps);
}

module.exports = { createCacheService };
