// core/fusion/fusionCoverage.js

/**
 * Compute fusion coverage score to determine when general knowledge is needed.
 * Returns 0..1 where:
 *   0.0 = very thin memory (allow more GK)
 *   1.0 = rich memory (memory-only mode)
 */
function fusionCoverage(fusionPack) {
  if (!fusionPack?.length) return 0;
  
  // Total character count across all facts
  const chars = fusionPack.reduce((s, f) => s + (f.fact?.length || 0), 0);
  
  // Number of unique sources (diversity indicator)
  const uniqSources = new Set(fusionPack.map(f => f.source || 'na')).size;
  
  // Weight by diversity and size (0..1 clamp)
  // chars/1800 = size component (0.6 weight)
  // uniqSources/6 = diversity component (0.4 weight)
  const score = Math.min(1, (chars / 1800) * 0.6 + (uniqSources / 6) * 0.4);
  
  return score;
}

/**
 * Detect query type for adaptive GK guidance.
 */
function detectQueryType(query) {
  const lowerQuery = query.toLowerCase();
  
  // Comparison queries need GK for context
  if (/\b(compare|versus|vs|difference|better|worse|alternative)\b/.test(lowerQuery)) {
    return 'comparison';
  }
  
  // Definition queries need GK for completeness
  if (/\b(what is|define|explain|describe|how does|why)\b/.test(lowerQuery)) {
    return 'definition';
  }
  
  // Analysis queries benefit from GK context
  if (/\b(analyze|evaluate|assess|impact|implications)\b/.test(lowerQuery)) {
    return 'analysis';
  }
  
  // Factual queries should rely on memory
  if (/\b(when|where|who|which|our|project)\b/.test(lowerQuery)) {
    return 'factual';
  }
  
  return 'general';
}

/**
 * Determine GK allowance based on coverage score AND query type.
 * Returns number of supplemental GK facts allowed.
 */
function getGKAllowance(coverage, query = '') {
  const queryType = detectQueryType(query);
  
  // Query-specific overrides (semantic need trumps coverage)
  if (queryType === 'comparison' || queryType === 'definition') {
    return 3; // Always allow GK for these query types
  }
  
  if (queryType === 'analysis') {
    return coverage < 0.7 ? 2 : 1; // Analysis needs context
  }
  
  if (queryType === 'factual') {
    return coverage < 0.35 ? 1 : 0; // Factual queries rely on memory
  }
  
  // General queries use coverage-based logic
  if (coverage < 0.35) return 3;      // thin memory → allow 3 GK anchors
  if (coverage < 0.7) return 1;       // moderate memory → 1 stitch
  return 0;                            // rich memory → none
}

/**
 * Determine decision mode based on coverage.
 */
function getDecisionMode(coverage) {
  if (coverage < 0.35) return 'BLEND';
  if (coverage < 0.7) return 'MEMORY-FIRST';
  return 'MEMORY-ONLY';
}

module.exports = {
  fusionCoverage,
  getGKAllowance,
  getDecisionMode,
  detectQueryType
};
