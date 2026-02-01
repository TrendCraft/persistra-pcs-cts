// Status, health, and isInitialized logic

/**
 * TODO: Refactor dependencies on isInitialized variable, logger, and any status-related shared state.
 * Copied from semantic-context-manager.js
 */
// MIGRATED: All logic now in initializationService.js
const initializationService = require('./initializationService');

function isInitialized() {
  return initializationService.isInitialized();
}

function getStatus() {
  return initializationService.getStatus();
}

module.exports = { isInitialized, getStatus };
