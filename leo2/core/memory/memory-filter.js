// leo2/core/memory/memory-filter.js

/**
 * Is this a real, valid memory for prompting?
 */
function isValidMemory(memory) {
  if (!memory || typeof memory !== 'object') return false;
  if (memory.test || memory.dummy || memory.stub) return false;

  const id = memory.id || memory.chunk_id || '';
  if (
    /^interaction-\d+$/.test(id) ||
    /^dummy-/.test(id) ||
    /^test-?/.test(id) ||
    /^stub-/.test(id) ||
    /^placeholder-/.test(id)
  ) return false;

  const content = (memory.content || memory.text || '').trim();
  if (
    !content ||
    /^(dummy|test|placeholder|stub|example)$/i.test(content) ||
    /^recent memory #\d+$/i.test(content)
  ) return false;

  return true;
}

/**
 * Get only real memories for prompt context.
 */
async function getValidMemories(memoryGraph, query, options = {}) {
  const all = await memoryGraph.searchMemories(query, options);
  return Array.isArray(all) ? all.filter(isValidMemory) : [];
}

/**
 * Get recent, real interactions for prompt context.
 */
async function getValidInteractions(memoryGraph, limit = 2) {
  const all = await memoryGraph.getRecentMemories({ type: 'interaction', limit });
  return Array.isArray(all) ? all.filter(isValidMemory) : [];
}

/**
 * Build a system prompt with identity and context.
 */
function buildSystemPrompt(identityContext, memories, interactions) {
  let prompt = identityContext ? identityContext.trim() : '';

  if (memories.length) {
    prompt += '\n\nRelevant context:\n';
    memories.forEach((m, i) => {
      prompt += `${i + 1}. ${m.content || m.text}\n`;
    });
  }

  if (interactions.length) {
    prompt += '\n\nRecent conversation:\n';
    interactions.forEach(i => {
      prompt += `${i.content || i.text}\n`;
    });
  }

  return prompt.trim();
}

/**
 * Process user input minimally: filter, assemble, call LLM.
 */
async function processLeoPrompt({
  userInput,
  memoryGraph,
  llm,
  identityContext = '',
  memoryLimit = 3,
  interactionLimit = 2,
  temperature = 0.7,
  max_tokens = 1000
}) {
  // Filtered context fetch
  const [memories, interactions] = await Promise.all([
    getValidMemories(memoryGraph, userInput, { limit: memoryLimit }),
    getValidInteractions(memoryGraph, interactionLimit)
  ]);

  // Single system prompt
  const systemPrompt = buildSystemPrompt(identityContext, memories, interactions);

  // LLM call (assuming ChatML style prompt array)
  const promptArray = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput }
  ];

  const response = await llm.generate(promptArray, { temperature, max_tokens });

  // Store result (let memoryGraph handle validity internally)
  await memoryGraph.storeMemory({
    type: 'interaction',
    content: `User: ${userInput}\nLeo: ${response}`,
    timestamp: Date.now()
  });

  return response.trim();
}

module.exports = {
  isValidMemory,
  processLeoPrompt
};
