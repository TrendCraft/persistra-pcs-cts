/**
 * Pure context metrics: coverage, relevance, recency, diversity
 * Stateless: no mutation of external/shared state.
 * @module contextMetrics
 */

/**
 * Compute coverage score for a context object.
 * @param {Object} context
 * @param {Object} [weights]
 * @returns {number} coverage [0, 1]
 */
function computeCoverageScore(context, weights = {}) {
  const defaultWeights = {
    semanticMemory: 0.3,
    developmentHistory: 0.2,
    recentQueries: 0.2,
    activeEmbeddings: 0.15,
    activityFocus: 0.15
  };
  const w = { ...defaultWeights, ...weights };
  let score = 0;
  // Semantic memory (weighted by quality and priority)
  if (context.semanticMemory && Array.isArray(context.semanticMemory)) {
    const highPriorityRatio = context.semanticMemory.filter(item => item.priority === 'high').length / (context.semanticMemory.length || 1);
    const qualityFactor = context.semanticMemory.reduce((sum, item) => sum + (item.quality || 0.5), 0) / (context.semanticMemory.length || 1);
    score += w.semanticMemory * qualityFactor * (0.5 + 0.5 * highPriorityRatio);
  }
  // Development history (recency)
  if (context.developmentHistory && Array.isArray(context.developmentHistory)) {
    const recencyFactor = context.developmentHistory.length > 0 ? 1 : 0;
    score += w.developmentHistory * recencyFactor;
  }
  // Recent queries
  if (context.recentQueries && Array.isArray(context.recentQueries)) {
    score += w.recentQueries * Math.min(1, context.recentQueries.length / 3);
  }
  // Active embeddings
  if (typeof context.activeEmbeddings === 'number') {
    score += w.activeEmbeddings;
  }
  // Activity focus
  if (typeof context.activityFocus === 'number') {
    score += w.activityFocus;
  }
  return Math.min(score, 1.0);
}

/**
 * Compute relevance score for a context object.
 * @param {Object} context
 * @param {Object} [priorityWeights]
 * @returns {number} relevance [0, 1]
 */
function computeRelevanceScore(context, priorityWeights = {}) {
  const defaultWeights = {
    high: 1.0,
    medium: 0.75,
    low: 0.5
  };
  const weights = { ...defaultWeights, ...priorityWeights };
  let relevanceScore = 0;
  let itemCount = 0;
  if (context.semanticMemory && Array.isArray(context.semanticMemory)) {
    relevanceScore += context.semanticMemory.reduce((sum, item) => {
      const priorityWeight = weights[item.priority] || 0.5;
      return sum + (item.relevanceScore || 0.5) * priorityWeight;
    }, 0);
    itemCount += context.semanticMemory.length;
  }
  if (context.history && Array.isArray(context.history)) {
    relevanceScore += context.history.reduce((sum, item) => {
      const priorityWeight = weights[item.priority] || 0.5;
      return sum + (item.relevanceScore || 0.5) * priorityWeight;
    }, 0);
    itemCount += context.history.length;
  }
  if (context.activity && Array.isArray(context.activity)) {
    relevanceScore += context.activity.reduce((sum, item) => {
      const priorityWeight = weights[item.priority] || 0.5;
      return sum + (item.relevanceScore || 0.5) * priorityWeight;
    }, 0);
    itemCount += context.activity.length;
  }
  return itemCount > 0 ? relevanceScore / itemCount : 0;
}

/**
 * Compute recency score for a context object.
 * @param {Object} context
 * @returns {number} recency [0, 1]
 */
function computeRecencyScore(context) {
  // Assume context.history has timestamps in ms
  if (!context.history || !Array.isArray(context.history) || context.history.length === 0) return 0;
  const now = Date.now();
  const ages = context.history.map(item => (now - (item.timestamp || now)) / (1000 * 60 * 60)); // hours
  const avgAgeHours = ages.reduce((sum, age) => sum + age, 0) / ages.length;
  // Newer = higher score, 24h+ = 0
  return Math.max(0, 1 - (avgAgeHours / 24));
}

/**
 * Compute diversity score for a context object.
 * @param {Object} context
 * @returns {number} diversity [0, 1]
 */
function computeDiversityScore(context) {
  // Example: diversity of file types or sources
  if (!context.semanticMemory || !Array.isArray(context.semanticMemory)) return 0;
  const types = new Set(context.semanticMemory.map(item => item.type));
  return Math.min(1, types.size / 5); // Assume 5+ types is max diversity
}

module.exports = {
  computeCoverageScore,
  computeRelevanceScore,
  computeRecencyScore,
  computeDiversityScore
};
