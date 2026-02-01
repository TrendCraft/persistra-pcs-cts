// lib/utils/identity-evolution-log.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Path to evolution log file
const LOG_PATH = path.join(__dirname, '..', 'core', 'data', 'identity', 'identity-evolution-log.jsonl');

/**
 * Hashes the identity content for quick diff tracking
 * @param {string} content
 * @returns {string}
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Logs an evolved identity node into the .jsonl log with timestamp
 * @param {Object} updatedNode - Updated identity node object
 * @param {string} source - Origin of the update (e.g. 'claude-reflection', 'user-override')
 * @param {string} [reason] - Optional reason/explanation
 */
function logIdentityEvolution(updatedNode, source = 'system', reason = 'unspecified') {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    source,
    reason,
    id: updatedNode.id || '(missing-id)',
    title: updatedNode.title || '(untitled)',
    version: updatedNode.version || 1,
    hash: hashContent(JSON.stringify(updatedNode)),
    node: updatedNode
  };

  const line = JSON.stringify(entry) + '\n';

  fs.appendFile(LOG_PATH, line, err => {
    if (err) {
      console.error('[❌] Failed to write identity evolution log:', err.message);
    } else {
      console.log(`[🧠] Identity node evolution logged: ${updatedNode.id}`);
    }
  });
}

module.exports = {
  logIdentityEvolution
};