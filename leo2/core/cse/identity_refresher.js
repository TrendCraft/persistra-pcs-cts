/**
 * CSE Identity Refresher
 * 
 * Injects identity cues during runtime, especially after challenges or long sessions.
 * 
 * @created June 11, 2025
 * @phase CSE Phase 2
 */

const Logger = require('../../services/logger');
const identitySelector = require('./identity_selector');
const identityLogger = require('./identity_logger');

const logger = new Logger();

// Thresholds for triggering identity refresh
const THRESHOLDS = {
  TURNS_SINCE_REFRESH: 10,
  CHALLENGE_DETECTED: true,
  MIN_SALIENCE_SCORE: 0.5
};

// Track refresh state
let lastRefreshTime = 0;
let turnsSinceRefresh = 0;

/**
 * Check if identity refresh is needed
 * @param {Object} context - Current context
 * @returns {Object} - Result with needsRefresh flag and reason
 */
function checkRefreshNeeded(context) {
  // Default: no refresh needed
  const result = {
    needsRefresh: false,
    reason: null
  };
  // Check turn count since last refresh
  if (context.turnsSinceRefresh >= THRESHOLDS.TURNS_SINCE_REFRESH) {
    result.needsRefresh = true;
    result.reason = 'turn_count';
  }
  // Check if identity challenge detected
  if (context.isIdentityChallenge === THRESHOLDS.CHALLENGE_DETECTED) {
    result.needsRefresh = true;
    result.reason = 'identity_challenge';
  }
  // Check salience score
  if (context.currentSalienceScore < THRESHOLDS.MIN_SALIENCE_SCORE) {
    result.needsRefresh = true;
    result.reason = 'low_salience';
  }
  return result;
}

/**
 * Maybe refresh identity based on context
 * @param {Object} context - Current context
 * @returns {Promise<Object>} - Result of refresh operation
 */
async function maybeRefreshIdentity(context = {}) {
  try {
    // Increment turn counter
    turnsSinceRefresh++;
    // Add turn counter to context if not present
    if (!context.turnsSinceRefresh) {
      context.turnsSinceRefresh = turnsSinceRefresh;
    }
    // Check if refresh is needed
    const { needsRefresh, reason } = checkRefreshNeeded(context);
    if (!needsRefresh) {
      return {
        refreshed: false,
        reason: null
      };
    }
    // Build identity prompt
    const prompt = await identitySelector.buildIdentityPrompt(context);
    // Log the refresh event
    await identityLogger.logIdentityEvent('identity_refresh', {
      context,
      prompt,
      reason
    });
    // Reset turn counter
    turnsSinceRefresh = 0;
    lastRefreshTime = Date.now();
    logger.info(`Identity refreshed due to: ${reason}`);
    return {
      refreshed: true,
      reason,
      prompt
    };
  } catch (error) {
    logger.error(`Failed to refresh identity: ${error.message}`);
    return {
      refreshed: false,
      reason: 'error',
      error: error.message
    };
  }
}

module.exports = {
  checkRefreshNeeded,
  maybeRefreshIdentity
};
