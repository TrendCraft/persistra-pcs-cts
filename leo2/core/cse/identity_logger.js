/**
 * CSE Identity Logger
 * 
 * Tracks how Leo's self-concept evolves across time and events.
 * 
 * @created June 11, 2025
 * @phase CSE Phase 2
 */

const fs = require('fs').promises;
const path = require('path');
const Logger = require('../../services/logger');

const logger = new Logger();
const LOG_FILE_PATH = path.join(__dirname, '../../../data/logs/identity_log.jsonl');

/**
 * Initialize the identity logger
 */
async function initialize() {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
    logger.info('Identity logger initialized');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize identity logger: ${error.message}`);
    return false;
  }
}

/**
 * Log an identity event
 * @param {string} eventType - Type of event
 * @param {Object} data - Event data
 * @returns {Promise<boolean>} - Success status
 */
async function logIdentityEvent(eventType, data = {}) {
  try {
    // Create log entry
    const entry = {
      timestamp: Date.now(),
      eventType,
      data
    };
    // Append to log file
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(LOG_FILE_PATH, line);
    logger.debug(`Identity event logged: ${eventType}`);
    return true;
  } catch (error) {
    logger.error(`Failed to log identity event: ${error.message}`);
    return false;
  }
}

/**
 * Compare two identity states and log differences
 * @param {string} previousState - Previous identity state
 * @param {string} currentState - Current identity state
 * @returns {Promise<Object>} - Diff result
 */
async function diffIdentityState(previousState, currentState) {
  try {
    // Simple diff: count added/removed lines
    const prevLines = previousState.split('\n');
    const currLines = currentState.split('\n');
    const addedLines = currLines.filter(line => !prevLines.includes(line));
    const removedLines = prevLines.filter(line => !currLines.includes(line));
    const result = {
      addedCount: addedLines.length,
      removedCount: removedLines.length,
      added: addedLines,
      removed: removedLines,
      changed: addedLines.length > 0 || removedLines.length > 0
    };
    // Log diff event
    await logIdentityEvent('identity_diff', result);
    return result;
  } catch (error) {
    logger.error(`Failed to diff identity state: ${error.message}`);
    return null;
  }
}

module.exports = {
  initialize,
  logIdentityEvent,
  diffIdentityState
};
