// leo2/core/agent/auditLogger.js
// Meta-cognitive audit logger for state-changing management commands

const fs = require('fs');
const path = require('path');

const AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'meta_audit_log.jsonl');

/**
 * Write an audit log entry for a state-changing command.
 * @param {Object} params - { command, agentState, result, user, timestamp }
 */
function logAuditEntry({ command, agentState, result, user = 'unknown', timestamp = null }) {
  const entry = {
    timestamp: timestamp || new Date().toISOString(),
    user,
    command,
    result,
    agentStateSnapshot: agentState,
  };
  const line = JSON.stringify(entry);
  const dir = path.dirname(AUDIT_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(AUDIT_LOG_PATH, line + '\n', 'utf8');
}

module.exports = { logAuditEntry, AUDIT_LOG_PATH };
