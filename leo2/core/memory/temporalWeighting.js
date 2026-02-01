/**
 * Temporal Weighting for Memory Retrieval
 * 
 * Phase 2: Localized temporal scoring to prefer recently-relevant memories
 * while still allowing canonical older items.
 * 
 * Non-goals:
 * - No query decomposition
 * - No complex inference
 * - No architectural rewrites
 */

/**
 * Calculate temporal weight for a memory based on its age
 * 
 * @param {number} eventTs - Event timestamp (when memory was created)
 * @param {number} nowTs - Current timestamp (Date.now())
 * @param {Object} options - Query hints
 * @param {boolean} options.isTemporalQuery - Query explicitly asks about time (last/yesterday/recent)
 * @param {boolean} options.wantsRecent - Query wants latest/current/newest items
 * @returns {number} Temporal weight multiplier in range [0.65, 1.15]
 */
function temporalWeight(eventTs, nowTs, { isTemporalQuery = false, wantsRecent = false } = {}) {
  // Guard: invalid timestamp returns neutral weight
  if (!eventTs || !Number.isFinite(eventTs)) return 1.0;

  // Calculate age in days
  const ageDays = Math.max(0, (nowTs - eventTs) / (1000 * 60 * 60 * 24));

  // Half-life defaults: how many days until weight drops to 0.5
  const halfLifeDays =
    isTemporalQuery ? 14 :                // Temporal queries favor recency (2 weeks)
    wantsRecent ? 30 :                    // "current" / "latest" style queries (1 month)
    90;                                   // General queries: mild recency bias (3 months)

  // Exponential decay: 1.0 at day 0, 0.5 at halfLife, approaches 0 for very old
  const decay = Math.exp(-Math.log(2) * (ageDays / halfLifeDays));
  
  // Floor: don't kill canonical old memories completely
  const floor = isTemporalQuery ? 0.65 : 0.80;
  
  // Map decay into [floor, 1.0] range
  const weight = floor + (1 - floor) * decay;

  // Optional slight boost for very fresh items (≤2 days) when query is temporal/recent
  const freshBoost = (isTemporalQuery || wantsRecent) && ageDays <= 2 ? 1.10 : 1.0;

  // Bound final multiplier to [0.65, 1.15]
  return Math.min(1.15, Math.max(0.65, weight * freshBoost));
}

/**
 * Detect if query is temporal (asks about time/recency)
 * 
 * Lightweight heuristic - no complex NLP needed.
 * Coverage: Common temporal patterns, but will miss some phrasing like
 * "in September", "last Friday", "earlier this month". Sufficient for Phase 2.
 * 
 * @param {string} query - User query text
 * @returns {boolean} True if query explicitly asks about time
 */
function isTemporalQuery(query) {
  if (!query || typeof query !== 'string') return false;
  
  // Patterns: last, yesterday, today, this week, last week, recent, recently, on [date]
  // Plus: "X days/weeks/months/years ago" (most common missing pattern)
  return /\b(last|yesterday|today|this week|last week|recent|recently|on \w+ \d+|\d+\s+(day|week|month|year)s?\s+ago)\b/i.test(query);
}

/**
 * Detect if query wants recent/latest items
 * 
 * @param {string} query - User query text
 * @returns {boolean} True if query wants latest/current/newest
 */
function wantsRecent(query) {
  if (!query || typeof query !== 'string') return false;
  
  // Patterns: latest, current, now, recent, newest
  return /\b(latest|current|now|recent|newest)\b/i.test(query);
}

/**
 * Get query hints for temporal weighting
 * 
 * @param {string} query - User query text
 * @returns {Object} Query hints { isTemporalQuery, wantsRecent }
 */
function getQueryHints(query) {
  return {
    isTemporalQuery: isTemporalQuery(query),
    wantsRecent: wantsRecent(query)
  };
}

/**
 * Calculate average temporal weight for a set of memories (for logging/diagnostics)
 * 
 * @param {Array} memories - Array of memory objects with metadata.timestamp
 * @param {number} nowTs - Current timestamp
 * @param {Object} queryHints - Query hints from getQueryHints()
 * @returns {number} Average temporal weight
 */
function averageTemporalWeight(memories, nowTs, queryHints = {}) {
  if (!memories || memories.length === 0) return 1.0;
  
  const weights = memories.map(m => {
    const eventTs = m.metadata?.timestamp || m.metadata?.ingested_at || m.timestamp;
    return temporalWeight(eventTs, nowTs, queryHints);
  });
  
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return sum / weights.length;
}

module.exports = {
  temporalWeight,
  isTemporalQuery,
  wantsRecent,
  getQueryHints,
  averageTemporalWeight
};
