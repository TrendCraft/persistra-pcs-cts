// leo2/core/llm/llm-gateway.js
const path = require('path');

// Resolve the actual Claude client module exactly once
const TARGET = path.resolve(__dirname, './claudeLLMClient.js');
const ClientClass = require(TARGET);
const client = new ClientClass();

// Register with tripwire system
global.__LPAC_LLM_GATEWAY_ACTIVE__ = true;
global.__LPAC_LLM_CALLS__ = 0;

// Guard: print exactly which file is being used
console.log('[LLM-GATEWAY] Loaded and registered with tripwire.');
console.log('[LLM-GATEWAY] Active client path:', TARGET);

const STRIP = (s='') => s
  .replace(/^\*\*?\[?MEMORY_SNIPPET[^\n]*\n?/gmi, '')
  .replace(/^\s*Salience:\s*[0-9.]+\s*$/gmi, '')
  .replace(/^\s*Summary:.*$/gmi, '');

function scrubMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map(m => {
    if (Array.isArray(m.content)) {
      return { ...m, content: m.content.map(c => ({ ...c, text: STRIP(c.text) })) };
    }
    return { ...m, content: typeof m.content === 'string' ? STRIP(m.content) : m.content };
  });
}

function shortStack() {
  return (new Error().stack || '').split('\n').slice(2, 10).join('\n');
}

async function generate(messages, hints={}) {
  console.log('[LLM-GATEWAY] Intercepted generate call');
  
  // Track gateway usage globally
  global.__LPAC_LLM_CALLS__ = (global.__LPAC_LLM_CALLS__ || 0) + 1;
  console.log('[LLM-GATEWAY] Gateway call count:', global.__LPAC_LLM_CALLS__);

  // Pre-flight sanitization: strip any MEMORY_SNIPPET blocks from messages
  const scrubbed = scrubMessages(messages);
  
  // Guard: ensure no raw memory snippets leak to LLM
  if (JSON.stringify(scrubbed).match(/MEMORY_SNIPPET|project-memory/i)) {
    throw new Error('Guard: MEMORY_SNIPPET leaked to gateway');
  }

  // Add system nudge to discourage echoing raw memory
  const systemNudge = {
    role: 'system',
    content:
      'You have access to project memory but must NOT paste raw memory blocks or labels like "MEMORY_SNIPPET". ' +
      'Cite evidence as [#1], [#2] only. Synthesize in your own words.'
  };

  const merged = [systemNudge, ...scrubbed];
  console.log('[LLM-GATEWAY] Sending to Claude with', merged.length, 'messages');
  let rawOut;
  try {
    rawOut = await client.generate(merged, hints);
    console.log('[LLM-GATEWAY] Claude response length:', rawOut?.length || 0);
  } catch (error) {
    console.log('[LLM-GATEWAY] Claude API error, but preserving gateway stamp');
    // Return error with gateway stamp
    return {
      text: `[ClaudeLLMClient] Claude API error: ${error.message}`,
      __lpacStamp: {
        gateway: 'v1',
        model: hints?.model || 'claude-3-haiku',
        t: Date.now(),
        callCount: global.__LPAC_LLM_CALLS__,
        error: true
      }
    };
  }
  
  // CRITICAL: Comprehensive post-processing sanitization
  let cleanOut = typeof rawOut === 'string' ? STRIP(rawOut) : rawOut;
  
  if (typeof cleanOut === 'string') {
    // Aggressive sanitization to remove ALL raw MEMORY_SNIPPET formatting
    const originalLength = cleanOut.length;
    cleanOut = cleanOut
      // Remove MEMORY_SNIPPET blocks entirely
      .replace(/MEMORY_SNIPPET\s*\[project-memory\]/gi, '')
      // Remove salience lines
      .replace(/^\s*Salience:\s*[0-9.]+\s*$/gmi, '')
      // Remove summary prefixes  
      .replace(/^\s*Summary:\s*/gmi, '')
      // Clean memory card blocks with raw formatting
      .replace(/(\*\*\[MEM \d+\][^*]*\*\*\s*\([^)]*\))\s*MEMORY_SNIPPET[^\n]*/gi, '$1')
      // Remove standalone MEMORY_SNIPPET lines
      .replace(/\n\s*MEMORY_SNIPPET[^\n]*\n?/gi, '\n')
      // Normalize whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
    
    const wasModified = cleanOut.length !== originalLength;
    if (wasModified) {
      console.log('[LLM-GATEWAY] Sanitized response - removed raw MEMORY_SNIPPET formatting');
    }
    
    // Final check for any remaining raw formatting
    if (cleanOut.includes('MEMORY_SNIPPET')) {
      console.error('[LLM-GATEWAY] WARNING: Raw MEMORY_SNIPPET still present after aggressive sanitization');
    }
  }
  
  // STAMP: Add gateway stamp to prove this response went through the gateway
  return {
    text: cleanOut,
    __lpacStamp: {
      gateway: 'v1',
      model: hints?.model || 'claude-3-haiku',
      t: Date.now(),
      callCount: global.__LPAC_LLM_CALLS__
    }
  };
}

module.exports = { generate };
