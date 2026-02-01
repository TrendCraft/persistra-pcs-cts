/**
 * Ensures an array of memories are always returned as objects, not strings.
 * Any JSON string will be parsed; malformed or unparseable entries are skipped with a warning.
 */
function ensureMemoryObjects(memories) {
  if (!Array.isArray(memories)) return [];
  return memories
    .map(mem => {
      if (typeof mem === 'string') {
        // Handle clean fact strings
        if (mem.startsWith('[FACT]')) {
          return {
            type: 'fact',
            fact: mem.replace(/^\[FACT\]\s*/i, '').trim(),
            content: mem
          };
        }
        // Try to parse as JSON
        try {
          return JSON.parse(mem);
        } catch (e) {
          console.warn('[Leo Memory] Failed to parse memory JSON:', mem);
          return null;
        }
      }
      if (typeof mem === 'object' && mem !== null) return mem;
      return null;
    })
    .filter(Boolean); // Remove nulls
}

module.exports = ensureMemoryObjects;
