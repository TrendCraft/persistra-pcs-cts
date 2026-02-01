// Initialization and config logic for semantic context manager

/**
 * TODO: Refactor dependencies on isInitialized, embeddingsInterface, logger, CONFIG, and any shared state.
 * Copied from semantic-context-manager.js
 */
// MIGRATED: All logic now in initializationService.js
const initializationService = require('./initializationService');

async function initialize(options) {
  return initializationService.initialize(options);
}

function getConfig() {
  return initializationService.getConfig();
}

module.exports = { initialize, getConfig };
