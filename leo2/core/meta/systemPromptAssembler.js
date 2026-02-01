/**
 * Assembles a system prompt for meta-cognitive and identity prompts in Leo.
 * Injects canonical exocortex instruction and the latest memory graph summaries.
 * 
 * Usage:
 *   const systemPrompt = assembleSystemPrompt({
 *     identitySummary: ...,
 *     recentEvents: ...,
 *     capabilityList: ...,
 *     provenance: ...,
 *     rationale: ...
 *   });
 *   // Pass systemPrompt as the system or instruction context to Qwen.
 */

const os = require('os');

/**
 * Build the canonical exocortex system instruction (never edit without updating docs).
 */
const EXOCORTEX_SYSTEM_INSTRUCTION = `Answer questions naturally and helpfully, drawing from both the provided context and your knowledge.
Blend information seamlessly to provide comprehensive and useful responses.
`;

/**
 * Builds the full system prompt for a meta/identity query.
 * All arguments should be plain text summaries from the memory graph.
 */
function assembleSystemPrompt({
  identitySummary,
  recentEvents,
  capabilityList,
  provenance,
  rationale,
  modulesChanged,
  changeSummary,
}) {
  let prompt = EXOCORTEX_SYSTEM_INSTRUCTION.trim() + os.EOL + os.EOL;

  // Helper to enforce atomicity
  function atomicField(field, label) {
    if (!field) return '';
    const lines = field.split('\n');
    if (lines.length > 2 || field.length > 512) {
      console.warn(`[assembleSystemPrompt] Non-atomic field for ${label}: truncating to first line.`);
      return lines[0].slice(0, 512).trim();
    }
    return field.trim();
  }

  // Skip identity summary to keep prompt minimal

  // Recent events/learning
  if (recentEvents) {
    prompt += `\n[EXOCORTEX: RECENT EVENTS]\n${atomicField(recentEvents, 'recentEvents')}\n`;
  }

  // Capabilities
  if (capabilityList) {
    prompt += `\n[EXOCORTEX: CAPABILITIES]\n${atomicField(capabilityList, 'capabilityList')}\n`;
  }

  // Provenance/How did you learn X?
  if (provenance) {
    prompt += `\n[EXOCORTEX: PROVENANCE]\n${atomicField(provenance, 'provenance')}\n`;
  }

  // Rationale/Why did you do X?
  if (rationale) {
    prompt += `\n[EXOCORTEX: RATIONALE]\n${atomicField(rationale, 'rationale')}\n`;
  }

  // Modules changed recently
  if (modulesChanged) {
    prompt += `\n[EXOCORTEX: RECENT MODULE CHANGES]\n${atomicField(modulesChanged, 'modulesChanged')}\n`;
  }

  // General change summary
  if (changeSummary) {
    prompt += `\n[EXOCORTEX: CHANGE SUMMARY]\n${atomicField(changeSummary, 'changeSummary')}\n`;
  }

  prompt += `\n[END OF EXOCORTEX CONTEXT]\n`;

  return prompt;
}

module.exports = { assembleSystemPrompt };
