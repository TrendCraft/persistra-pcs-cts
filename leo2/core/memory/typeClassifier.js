/**
 * Type Classifier for Memory Chunks
 * 
 * Deterministic rules-based classifier to assign semantic types
 * based on source_kind, file path, and content cues.
 * 
 * Goal: Move from "all quantum_research" to 6-10 meaningful types
 * for better retrieval diversity and synthesis.
 */

/**
 * Semantic types for memory chunks
 */
const CHUNK_TYPES = {
  // Code-related
  CODE_IMPLEMENTATION: 'code_implementation',
  CODE_EXAMPLE: 'code_example',
  API_REFERENCE: 'api_reference',
  
  // Documentation
  DOCUMENTATION: 'documentation',
  TUTORIAL: 'tutorial',
  README: 'readme',
  
  // Decision & reasoning
  DECISION_RATIONALE: 'decision_rationale',
  CONSTRAINT_INVARIANT: 'constraint_invariant',
  ARCHITECTURE_DECISION: 'architecture_decision',
  
  // Conversation
  CONVERSATION_EVENT: 'conversation_event',
  DISCUSSION_THREAD: 'discussion_thread',
  
  // Research & notes
  RESEARCH_NOTE: 'research_note',
  PAPER_EXCERPT: 'paper_excerpt',
  WEB_ARTICLE: 'web_article',
  
  // Fallback
  GENERAL_NOTE: 'general_note',
  UNKNOWN: 'unknown'
};

/**
 * Classify chunk type based on source_kind, path, and content
 * @param {Object} chunk - Memory chunk with metadata
 * @returns {string} Classified type
 */
function classifyChunkType(chunk) {
  const metadata = chunk.metadata || {};
  const content = chunk.content || '';
  const sourceKind = metadata.source_kind || 'unknown';
  const filePath = metadata.file_path || metadata.path || '';
  const fileName = filePath.split('/').pop() || '';

  // RULE 1: README files
  if (fileName.toLowerCase() === 'readme.md' || fileName.toLowerCase() === 'readme') {
    return CHUNK_TYPES.README;
  }

  // RULE 2: Documentation directories
  if (filePath.match(/\/(docs?|documentation|guide|manual)\//i)) {
    return CHUNK_TYPES.DOCUMENTATION;
  }

  // RULE 3: Tutorial indicators
  if (filePath.match(/\/(tutorial|example|demo|getting-started)\//i) ||
      content.match(/## (Tutorial|Getting Started|Quick Start|Example)/i)) {
    return CHUNK_TYPES.TUTORIAL;
  }

  // RULE 4: Decision rationales (explicit markers)
  if (content.match(/\b(DECISION|RATIONALE|WHY WE|WE DECIDED|REASONING):/i) ||
      content.match(/\b(decided to|chose to|opted for|selected)\b.*\bbecause\b/i)) {
    return CHUNK_TYPES.DECISION_RATIONALE;
  }

  // RULE 5: Constraints and invariants
  if (content.match(/\b(CONSTRAINT|INVARIANT|MUST|NEVER|ALWAYS|REQUIRED):/i) ||
      content.match(/\b(must not|shall not|is required to|is forbidden)\b/i)) {
    return CHUNK_TYPES.CONSTRAINT_INVARIANT;
  }

  // RULE 6: Architecture decisions (ADR-like)
  if (content.match(/\b(ARCHITECTURE|ADR|DESIGN DECISION|TECHNICAL DECISION):/i) ||
      filePath.match(/\/(adr|architecture|design)\//i)) {
    return CHUNK_TYPES.ARCHITECTURE_DECISION;
  }

  // RULE 7: Conversation events
  if (sourceKind === 'conversation' || metadata.conversation_id || metadata.session_id) {
    return CHUNK_TYPES.CONVERSATION_EVENT;
  }

  // RULE 8: Discussion threads
  if (content.match(/^(User:|Assistant:|Leo:|Human:)/m) ||
      content.match(/\[Thread\]|\[Discussion\]/i)) {
    return CHUNK_TYPES.DISCUSSION_THREAD;
  }

  // RULE 9: Code chunks (based on content)
  const hasCodeFence = content.includes('```');
  const hasCodePatterns = content.match(/\b(function|class|def|import|const|let|var)\b/);
  const codeFileExtensions = /\.(js|ts|py|java|cpp|c|go|rs|rb|php|swift)$/i;
  
  if (sourceKind === 'repo_file' && filePath.match(codeFileExtensions)) {
    // Check if it's an example or implementation
    if (filePath.match(/\/(example|sample|demo|test)\//i)) {
      return CHUNK_TYPES.CODE_EXAMPLE;
    }
    return CHUNK_TYPES.CODE_IMPLEMENTATION;
  }

  if (hasCodeFence && hasCodePatterns) {
    return CHUNK_TYPES.CODE_EXAMPLE;
  }

  // RULE 10: API reference
  if (filePath.match(/\/(api|reference)\//i) ||
      content.match(/## (API|Methods|Functions|Classes|Endpoints)/i)) {
    return CHUNK_TYPES.API_REFERENCE;
  }

  // RULE 11: Research papers
  if (sourceKind === 'pdf' || 
      content.match(/\b(Abstract|Introduction|Methodology|Results|Conclusion):/i) ||
      content.match(/\b(arXiv|DOI|Published in)\b/i)) {
    return CHUNK_TYPES.PAPER_EXCERPT;
  }

  // RULE 12: Web articles
  if (sourceKind === 'web' || metadata.url) {
    return CHUNK_TYPES.WEB_ARTICLE;
  }

  // RULE 13: Research notes (quantum research, etc.)
  if (metadata.quantum_domain || 
      content.match(/\b(quantum|algorithm|simulation|tensor)\b/i)) {
    return CHUNK_TYPES.RESEARCH_NOTE;
  }

  // RULE 14: General notes
  if (sourceKind === 'note' || sourceKind === 'manual') {
    return CHUNK_TYPES.GENERAL_NOTE;
  }

  // FALLBACK: Unknown
  return CHUNK_TYPES.UNKNOWN;
}

/**
 * Get human-readable description of chunk type
 */
function getTypeDescription(type) {
  const descriptions = {
    [CHUNK_TYPES.CODE_IMPLEMENTATION]: 'Code implementation',
    [CHUNK_TYPES.CODE_EXAMPLE]: 'Code example',
    [CHUNK_TYPES.API_REFERENCE]: 'API reference',
    [CHUNK_TYPES.DOCUMENTATION]: 'Documentation',
    [CHUNK_TYPES.TUTORIAL]: 'Tutorial',
    [CHUNK_TYPES.README]: 'README file',
    [CHUNK_TYPES.DECISION_RATIONALE]: 'Decision rationale',
    [CHUNK_TYPES.CONSTRAINT_INVARIANT]: 'Constraint/invariant',
    [CHUNK_TYPES.ARCHITECTURE_DECISION]: 'Architecture decision',
    [CHUNK_TYPES.CONVERSATION_EVENT]: 'Conversation',
    [CHUNK_TYPES.DISCUSSION_THREAD]: 'Discussion thread',
    [CHUNK_TYPES.RESEARCH_NOTE]: 'Research note',
    [CHUNK_TYPES.PAPER_EXCERPT]: 'Paper excerpt',
    [CHUNK_TYPES.WEB_ARTICLE]: 'Web article',
    [CHUNK_TYPES.GENERAL_NOTE]: 'General note',
    [CHUNK_TYPES.UNKNOWN]: 'Unknown type'
  };

  return descriptions[type] || type;
}

/**
 * Get type statistics for a collection of chunks
 */
function getTypeStatistics(chunks) {
  const typeCounts = new Map();
  
  chunks.forEach(chunk => {
    const type = chunk.metadata?.chunk_type || CHUNK_TYPES.UNKNOWN;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  const stats = Array.from(typeCounts.entries())
    .map(([type, count]) => ({
      type,
      description: getTypeDescription(type),
      count,
      percentage: ((count / chunks.length) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalChunks: chunks.length,
    uniqueTypes: typeCounts.size,
    distribution: stats
  };
}

module.exports = {
  CHUNK_TYPES,
  classifyChunkType,
  getTypeDescription,
  getTypeStatistics
};
