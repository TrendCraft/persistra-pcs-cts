/**
 * Safely truncate a string to prevent "Invalid string length" errors
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length (default 2000)
 * @returns {string} Truncated string
 */
function safeTruncate(str, maxLength = 2000) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Format a single memory object with a source annotation.
 * @param {Object} memory - The memory object (from memory graph or interactions.json)
 * @param {string} memory.type - 'dialog', 'fact', 'management', etc.
 * @param {string} memory.userInput
 * @param {string} memory.llmResponse
 * @param {string} [memory.fact] - For fact memories
 * @param {number} memory.timestamp
 * @returns {string} Annotated memory string for prompt
 */
function formatMemoryWithSource(memory) {
  if (!memory || typeof memory !== 'object') {
    console.warn('[formatMemoryWithSource] Skipping invalid memory object:', memory);
    return null;
  }
  // Must have at least one of these fields to be meaningful
  const hasContent = memory.userInput || memory.llmResponse || memory.fact || memory.file || memory.summary || memory.content;
  if (!hasContent) {
    console.warn('[formatMemoryWithSource] Skipping memory with no userInput, llmResponse, fact, file, summary, or content:', memory);
    return null;
  }
  const date = memory.timestamp
    ? new Date(memory.timestamp).toISOString().split('T')[0]
    : "unknown date";
  const type = (memory.type || "unknown").toUpperCase();

  if (type === "FACT") {
    // Extract just the fact content, clean of command syntax
    const factContent = memory.fact || memory.userInput || '';
    const cleanFact = factContent.replace(/^\[FACT\]\s*/i, '').replace(/^remember\s+\[FACT\]\s*/i, '').trim();
    return `[MEMORY: fact] ${safeTruncate(cleanFact, 3000)}`;
  } else if (type === "DIALOG") {
    const userInput = safeTruncate(memory.userInput || '', 1600);
    const llmResponse = safeTruncate(memory.llmResponse || '', 1600);
    return `[MEMORY: dialog] User: "${userInput}" Leo: "${llmResponse}"`;
  } else if (type === "MANAGEMENT") {
    const userInput = safeTruncate(memory.userInput || '', 1600);
    const llmResponse = safeTruncate(memory.llmResponse || '', 1600);
    return `[MEMORY: management] User: "${userInput}" Leo: "${llmResponse}"`;
  } else if (type === "FILE" && memory.file && memory.summary) {
    const file = safeTruncate(memory.file || '', 200);
    const summary = safeTruncate(memory.summary || '', 2400);
    return `[MEMORY: file] File: "${file}" Summary: "${summary}"`;
  } else if (type === "SUMMARY" && memory.summary) {
    return `[MEMORY: summary] ${safeTruncate(memory.summary, 3000)}`;
  } else {
    // Handle knowledge content with clean formatting
    if (memory.content) {
      const content = safeTruncate(memory.content, 2400);  // Increased limit for better context
      // Clean format without legacy [MEMORY: type] wrapper
      return content;
    } else {
      // Legacy dialog format
      const userInput = safeTruncate(memory.userInput || '', 1600);
      const llmResponse = safeTruncate(memory.llmResponse || '', 1600);
      return `[MEMORY: ${type.toLowerCase()}] User: "${userInput}" Leo: "${llmResponse}"`;
    }
  }
}


/**
 * Assemble a Chain-of-Thought reasoning trace from retrieved memories.
 * @param {Array} memories - Array of memory objects
 * @param {Object} [opts] - Optional: { maxCount, maxTotalLength }
 * @returns {string} - Structured reasoning trace for LLM prompt
 */
function assembleAnnotatedContextBlock(memories, opts = {}) {
  // --- DIAGNOSTIC: Log all input memory IDs/types ---
  console.log('[assembleAnnotatedContextBlock][DIAGNOSTIC] Input memories:', memories.map(m => ({ id: m.id, type: m.type, file: m.file, summary: m.summary, content: (m.content||'').slice(0,80) })));
  if (memories.length === 0) {
    console.warn('[assembleAnnotatedContextBlock][DIAGNOSTIC] WARNING: No memories provided to context assembler!');
  }

  // PATCH: Force-inject technical/code/doc chunks if any exist
  const { maxCount = 8, maxTotalLength = 10000, query = '' } = opts;
  if (!memories || memories.length === 0) return '';

  // 1. Categorize memories by content and detect technical entities
  const categorized = {
    technical: [],
    conceptual: [],
    implementation: [],
    other: [],
    technicalEntities: []
  };
  // Regex to detect file, class, function, or module references
  const entityRegex = /([\w\-/]+\.(js|ts|py|json|md|yaml|yml|sh|go|cpp|h|java|rb|cs))|class\s+\w+|function\s+\w+|def\s+\w+|module\.exports|require\(|import\s+|export\s+|from\s+['"]/i;
  for (const mem of memories) {
    const content = (mem.content || '').toLowerCase();
    const metadata = JSON.stringify(mem.metadata || '').toLowerCase();
    // Boost if memory mentions concrete technical entities
    if (entityRegex.test(content) || entityRegex.test(metadata)) {
      categorized.technicalEntities.push(mem);
    }
    if (mem.type === 'code' || mem.type === 'doc' || mem.type === 'architecture' || /technical|snippet|function|component|engine|cse|tse|module/i.test(content)) {
      categorized.technical.push(mem);
    } else if (mem.type === 'conceptual' || /concept|principle|idea/i.test(content)) {
      categorized.conceptual.push(mem);
    } else if (mem.type === 'implementation' || /implemented|method|procedure|how to|algorithm|process|class/i.test(content)) {
      categorized.implementation.push(mem);
    } else {
      categorized.other.push(mem);
    }
  }

  // 2. Boost for technical queries
  let queryTypeBoost = { technical: 0, conceptual: 0, implementation: 0 };
  if (/architecture|engine|cse|tse|code|component|module|function|class|algorithm|implementation/i.test(query)) {
    queryTypeBoost = { technical: 1, conceptual: 1, implementation: 1 };
  }

  // 3. Always include top 1–2 from each main category, and boost technical entities
  let context = [];
  // Prefer technicalEntities first (if any)
  if (categorized.technicalEntities.length > 0) {
    context.push(...categorized.technicalEntities.slice(0, 2));
  }
  // Then ensure technical/conceptual/implementation coverage
  context.push(
    ...categorized.technical.slice(0, 1 + queryTypeBoost.technical),
    ...categorized.conceptual.slice(0, 1 + queryTypeBoost.conceptual),
    ...categorized.implementation.slice(0, 1 + queryTypeBoost.implementation)
  );
  // 4. Fill the rest with top 'other' (if space remains), then remaining high-salience technical/conceptual/implementation
  const alreadyIncluded = new Set(context.map(m => m.id));
  for (const mem of [...categorized.other, ...categorized.technical, ...categorized.conceptual, ...categorized.implementation]) {
    if (context.length >= maxCount) break;
    if (!alreadyIncluded.has(mem.id)) {
      context.push(mem);
      alreadyIncluded.add(mem.id);
    }
  }

  // --- PATCH: Force-inject at least one technical chunk if any exist ---
  const technicalChunks = memories.filter(m => m.type === 'code' || m.type === 'doc');
  if (technicalChunks.length > 0 && !context.some(m => m.type === 'code' || m.type === 'doc')) {
    context.unshift(technicalChunks[0]); // Always inject top technical chunk
    if (context.length > maxCount) context = context.slice(0, maxCount);
  }

  // --- DIAGNOSTIC: Warn if technical/code/doc chunks exist in memories but not in context block ---
  const hadTechnicalInInput = technicalChunks.length > 0;
  const hasTechnicalInContext = context.some(m => m.type === 'code' || m.type === 'doc');
  if (hadTechnicalInInput && !hasTechnicalInContext) {
    console.warn('[assembleAnnotatedContextBlock][DIAGNOSTIC] WARNING: Technical/code/doc chunks exist in input but none present in context block!');
    console.warn('[assembleAnnotatedContextBlock][DIAGNOSTIC] Input technical chunk IDs:', technicalChunks.map(m => m.id));
    console.warn('[assembleAnnotatedContextBlock][DIAGNOSTIC] Context IDs:', context.map(m => m.id));
  }

  // 5. Build seamless cognitive context block
  // --- Artifact Extraction and Annotation ---
  const artifactSections = {
    files: [],
    classes: [],
    functions: [],
    integration: []
  };
  const fileRegex = /([\w\-/]+\.(js|ts|py|json|md|yaml|yml|sh|go|cpp|h|java|rb|cs))/ig;
  const classRegex = /class\s+([A-Za-z0-9_]+)/ig;
  const functionRegex = /(function|def)\s+([A-Za-z0-9_]+)/ig;
  const integrationRegex = /(called from|used by|integrated with|exports|imported by|requires|depends on)\s+([\w\-/\.]+)/ig;

  // Scan context memories for artifacts
  for (const mem of context) {
    const content = (mem.content || '').toString();
    const metadata = JSON.stringify(mem.metadata || '');
    let match;
    // Files
    while ((match = fileRegex.exec(content + metadata)) !== null) {
      if (!artifactSections.files.includes(match[1])) artifactSections.files.push(match[1]);
    }
    // Classes
    while ((match = classRegex.exec(content)) !== null) {
      if (!artifactSections.classes.includes(match[1])) artifactSections.classes.push(match[1]);
    }
    // Functions
    while ((match = functionRegex.exec(content)) !== null) {
      if (!artifactSections.functions.includes(match[2])) artifactSections.functions.push(match[2]);
    }
    // Integration points
    while ((match = integrationRegex.exec(content)) !== null) {
      if (!artifactSections.integration.includes(match[2])) artifactSections.integration.push(match[2]);
    }
  }

  // Build artifact summary section
  let artifactSummary = '';
  if (
    artifactSections.files.length ||
    artifactSections.classes.length ||
    artifactSections.functions.length ||
    artifactSections.integration.length
  ) {
    artifactSummary += 'Artifact summary:\n';
    if (artifactSections.files.length) artifactSummary += '  Files: ' + artifactSections.files.join(', ') + '\n';
    if (artifactSections.classes.length) artifactSummary += '  Classes: ' + artifactSections.classes.join(', ') + '\n';
    if (artifactSections.functions.length) artifactSummary += '  Functions: ' + artifactSections.functions.join(', ') + '\n';
    if (artifactSections.integration.length) artifactSummary += '  Integration: ' + artifactSections.integration.join(', ') + '\n';
    artifactSummary += '==== PROJECT CODE ARTIFACTS ====' + '\n';
    if (artifactSections.files.length) {
      artifactSummary += '[FILES]\n' + artifactSections.files.map(f => '- ' + f).join('\n') + '\n';
    }
    if (artifactSections.classes.length) {
      artifactSummary += '[CLASSES]\n' + artifactSections.classes.map(c => '- ' + c).join('\n') + '\n';
    }
    if (artifactSections.functions.length) {
      artifactSummary += '[FUNCTIONS]\n' + artifactSections.functions.map(fn => '- ' + fn).join('\n') + '\n';
    }
    if (artifactSections.integration.length) {
      artifactSummary += '[INTEGRATION POINTS]\n' + artifactSections.integration.map(i => '- ' + i).join('\n') + '\n';
    }
    artifactSummary += '\n';
  } else {
    artifactSummary = 'Artifact summary: (no code/doc artifacts found)\n';
  }

  // Build context block as usual
  let contextBlock = "";
  for (const mem of context) {
    const content = extractMemoryContent(mem, { query });
    if (content) {
      contextBlock += safeTruncate(content, 800) + "\n";
    }
  }

  // Always prepend artifact summary, even if empty, for diagnostic clarity
  contextBlock = artifactSummary + contextBlock;

  // Debug: Log which memories and artifacts are included
  console.log('[assembleAnnotatedContextBlock] Included memories:', context.map(m => ({ id: m.id, type: m.type, summary: m.summary, file: m.file, content: (m.content||'').slice(0,100) })));
  console.log('[assembleAnnotatedContextBlock] Artifact summary:', artifactSummary);

  // Append strict SYSTEM INSTRUCTIONS block as specified
  contextBlock = contextBlock.trim() + "\n\nSYSTEM INSTRUCTIONS:\n- You must answer ONLY using the project memories and artifact summaries above.\n- Do NOT speculate, hedge, or use meta-language.\n- Always cite the specific files, classes, or functions from the artifact summary in your answer.\n- If no relevant context is present, state so directly and do not attempt to answer.\n";

  // Check length and truncate if needed
  if (contextBlock.length > maxTotalLength) {
    contextBlock = contextBlock.substring(0, maxTotalLength - 100) + "\n[TRACE TRUNCATED]\n[END MEMORY TRACE]\n";
    console.warn(`[assembleAnnotatedContextBlock] Reasoning trace truncated to ${maxTotalLength} chars`);
  }

  console.log(`[assembleAnnotatedContextBlock] Chain-of-Thought reasoning trace: ${memories.length} memories, ${contextBlock.length} chars`);
  return contextBlock;
}
function extractMemoryContent(memory, opts = {}) {
  // Query context passed in opts for code/file detection
  const query = (opts.query || '').toLowerCase();
  const isCodeQuery = /file|code|analyze|js|ts|py|source|config|implementation/.test(query);
  // Helper to check if memory type is code/config/file
  const isCodeType = (type) => {
    if (!type) return false;
    return [
      'file', 'config', 'code', 'source', 'node_file', 'tuning_file', 'data_file', 'package', 'build', 'env', 'settings'
    ].some(t => type.toLowerCase().includes(t));
  };
  // Helper to check for large or irrelevant blobs
  const isLarge = (str) => str && str.length > 1200;
  const isLikelyIrrelevantBlob = (str) => {
    if (!str) return false;
    return (
      str.startsWith('module.exports') ||
      str.startsWith('{') ||
      str.includes('eslint') ||
      str.includes('node_modules') ||
      str.includes('webpack') ||
      str.includes('require(') ||
      str.includes('import ') ||
      str.includes('def ') ||
      str.includes('function ') ||
      str.includes('class ')
    );
  };

  const m = memory.memory || memory;
  // Prefer knowledge fields for knowledge types
  if (['fact','concept','summary','knowledge','description','identity','cse_value','cse_goal'].includes((m.type||'').toLowerCase())) {
    return m.fact || m.summary || m.content || m.userInput || m.llmResponse || '';
  }
  // For code/config/file types, only include if query is code-related
  if (isCodeType(m.type)) {
    if (isCodeQuery && m.content) {
      // Truncate large blobs
      return isLarge(m.content) ? m.content.slice(0, 800) + '\n...[truncated]' : m.content;
    }
    // Otherwise skip
    return '';
  }
  // Fallback: filter out large/irrelevant blobs unless code query
  if (m.content && isLikelyIrrelevantBlob(m.content) && !isCodeQuery) {
    return '';
  }
  // Default: prefer fact/summary/content
  return m.fact || m.summary || m.content || m.userInput || m.llmResponse || '';
}


module.exports = {
  formatMemoryWithSource,
  assembleAnnotatedContextBlock,
  safeTruncate
};
