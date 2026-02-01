// leo2/core/agent/nlCommandRouter.js
// NL Command Router: Detects management/introspection/time travel requests and routes appropriately

const memoryGraph = require('../memory/memoryGraph');
const { createComponentLogger } = require('../../../lib/utils/logger');
const logger = createComponentLogger('nlCommandRouter');
const { logAuditEntry } = require('./auditLogger');

/**
 * Detects if the input is a management/introspection/time travel request
 * Returns { type, params } or null if not detected
 */
function detectManagementCommand(input) {
  const text = input.trim().toLowerCase();

  // --- Agentic, memory-centric patterns (preferred) ---
  if (/\b(what do you remember about|recall|remind me of|summarize your memories about|when did we last talk about|how has your understanding of)\b/.test(text)) {
    return { type: 'list_memories', params: { limit: 10 } };
  }
  if (/\b(go back to when|return to the state before|restore your mind to|revisit our last conversation about|undo the last change in your memory)\b/.test(text)) {
    return { type: 'time_travel', params: { target: 'last', raw: text } };
  }
  if (/\b(erase your memory of|forget what you learned about|remove your recollection of|let go of your knowledge about)\b/.test(text)) {
    return { type: 'delete_memory', params: { target: 'last', raw: text } };
  }

  // --- Fallback: functional/generic patterns (for CLI/backend) ---
  // Flexible state/logs/undo/time travel
  if (/\b(show|list|print|remind|describe|summarize)\b.*\b(memories|memory|interactions|events|history|changes|drift|updates)\b/.test(text)) {
    if (/last (\d+) (memories|changes|events)/.test(text)) {
      const n = parseInt(text.match(/last (\d+)/)?.[1] || '5', 10);
      return { type: 'list_memories', params: { limit: n } };
    }
    return { type: 'list_memories', params: { limit: 10 } };
  }
  if (/\b(show|print|who|summarize|describe)\b.*\b(identity|persona|self)\b/.test(text)) {
    return { type: 'show_identity' };
  }
  if (/\b(show|print|list|summarize|describe)\b.*\b(capabilities|skills|abilities|tools)\b/.test(text)) {
    return { type: 'show_capabilities' };
  }
  if (/\b(introspect|self[- ]?inspect|system status|show state|describe state|summarize state|current state)\b/.test(text)) {
    return { type: 'show_state' };
  }
  if (/\b(time travel|go to|rewind to|rollback|undo|restore|return to)\b.*(step|turn|session|event|drift|update|yesterday|last)/.test(text)) {
    // Flexible: "rollback two sessions", "undo last drift", "rewind to step 42"
    const match = text.match(/(rollback|undo|rewind to|go to|restore|return to)\s*(last|step|turn|session|event|drift|update|yesterday)?\s*(\d+)?/);
    return { type: 'time_travel', params: { target: match ? (match[3] || match[2] || 'last') : 'last', raw: text } };
  }
  if (/\b(delete|remove|forget)\b.*\b(memory|event|interaction)\b.*(\d+|last)/.test(text)) {
    // "delete memory 5", "forget last event"
    const match = text.match(/(memory|event|interaction)\s*(\d+|last)/);
    return { type: 'delete_memory', params: { target: match ? match[2] : 'last', raw: text } };
  }
  return null;
}

/**
 * Handle management/introspection/time travel requests natively
 * Returns a { handled: true, response } if handled, else { handled: false }
 */
async function handleManagementCommand(cmd, agentState = {}, confirmation = null) {
  switch (cmd.type) {
    case 'list_memories': {
      const limit = cmd.params?.limit || 10;
      const memories = await memoryGraph.searchMemories('');
      const summary = memories.slice(0, limit).map((m, i) => `#${i+1}: ${m.content || m.summary || JSON.stringify(m)}`).join('\n');
      return { handled: true, response: `Known memories (top ${limit}):\n${summary}` };
    }
    case 'show_identity': {
      const identity = agentState.identity || agentState.identitySummary || 'Identity not loaded.';
      return { handled: true, response: `Current identity: ${typeof identity === 'string' ? identity : JSON.stringify(identity)}` };
    }
    case 'show_capabilities': {
      const capabilities = agentState.capabilities || [];
      return { handled: true, response: `Current capabilities: ${capabilities.length ? capabilities.join(', ') : 'None loaded.'}` };
    }
    case 'show_state':
    case 'introspect': {
      // Human-readable summary of all agent state
      const lastDrift = agentState.lastDrift || 'N/A';
      const lastUpdate = agentState.lastMajorUpdate || 'N/A';
      const identity = agentState.identity || agentState.identitySummary || 'N/A';
      const capabilities = agentState.capabilities || [];
      const memories = (agentState.memories || agentState.interactions || []).slice(-3).reverse();
      let memSummary = memories.length ? memories.map((m, i) => `#${i+1}: ${m.content || m.summary || JSON.stringify(m)}`).join('\n') : 'None.';
      return {
        handled: true,
        response: [
          'Agent State Summary:',
          `- Identity: ${typeof identity === 'string' ? identity : JSON.stringify(identity)}`,
          `- Capabilities: ${capabilities.length ? capabilities.join(', ') : 'None'}`,
          `- Last drift: ${lastDrift}`,
          `- Last major update: ${lastUpdate}`,
          `- Recent events:\n${memSummary}`
        ].join('\n')
      };
    }
    case 'time_travel': {
      // Real snapshot/rollback logic
      const target = cmd.params?.target || 'last';
      logger.info(`[NLRouter] Time travel requested to: ${target}`);
      if (!confirmation) {
        return {
          handled: true,
          response: `Would you like me to return to my understanding before our last conversation or memory update (${target})? This will overwrite my current mind. (Y/N)`,
          requiresConfirmation: true
        };
      } else if (confirmation.toLowerCase() === 'y') {
        // Actually perform rollback using memoryGraph.restoreSnapshot
        try {
          const restoreResult = await memoryGraph.restoreSnapshot(target);
          logger.info(`[NLRouter] Time travel/rollback performed to: ${target}`);
          logAuditEntry({
            command: { ...cmd, confirmation },
            agentState,
            result: { success: true, detail: restoreResult },
            user: agentState.user || 'unknown',
            timestamp: new Date().toISOString()
          });
          return { handled: true, response: `My mind has been restored to before '${target}'.\nRecall result: ${JSON.stringify(restoreResult)}` };
        } catch (e) {
          logger.error(`[NLRouter] Time travel/rollback failed: ${e.message}`);
          logAuditEntry({
            command: { ...cmd, confirmation },
            agentState,
            result: { success: false, error: e.message },
            user: agentState.user || 'unknown',
            timestamp: new Date().toISOString()
          });
          return { handled: true, response: `I was unable to restore my mind to before '${target}': ${e.message}` };
        }
      } else {
        return { handled: true, response: 'Cancelled memory recall/rollback.' };
      }
    }
    case 'delete_memory': {
      // Always require confirmation
      const target = cmd.params?.target || 'last';
      if (!confirmation) {
        return {
          handled: true,
          response: `Are you sure you want me to forget what I learned about '${target}'? This will erase that memory from my mind. (Y/N)`,
          requiresConfirmation: true
        };
      } else if (confirmation.toLowerCase() === 'y') {
        // Stub: delete memory
        logger.info(`[NLRouter] Deleted memory: ${target}`);
        logAuditEntry({
          command: { ...cmd, confirmation },
          agentState,
          result: { success: true, detail: `Forgot memory about ${target} (stub)` },
          user: agentState.user || 'unknown',
          timestamp: new Date().toISOString()
        });
        return { handled: true, response: `I've forgotten what I learned about '${target}'. (Stub: actual deletion not yet implemented)` };
      } else {
        logAuditEntry({
          command: { ...cmd, confirmation },
          agentState,
          result: { success: false, detail: 'Cancelled memory deletion.' },
          user: agentState.user || 'unknown',
          timestamp: new Date().toISOString()
        });
        return { handled: true, response: 'Memory retention preserved. I have not forgotten.' };
      }
    }
    default:
      return { handled: false };
  }
}

module.exports = { detectManagementCommand, handleManagementCommand };
