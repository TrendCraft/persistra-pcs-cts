/**
 * Pure prioritization and ranking utilities for context elements.
 * Stateless: no mutation of external/shared state.
 * @module prioritization
 */

/**
 * Prioritize context elements based on priority, relevance, and recency.
 * @param {Object[]} elements - Array of context elements with priority, relevanceScore, timestamp, etc.
 * @param {Object} [options]
 * @param {Object} [options.priorityWeights] - e.g., {critical: 1.0, high: 0.8, medium: 0.5, low: 0.2}
 * @returns {Object[]} Sorted array (highest priority/relevance/recency first)
 */
function prioritizeContextElements(elements, options = {}) {
  const defaultPriorityWeights = { critical: 1.0, high: 0.8, medium: 0.5, low: 0.2 };
  const priorityWeights = { ...defaultPriorityWeights, ...(options.priorityWeights || {}) };
  return [...elements].sort((a, b) => {
    // Higher priority first
    const aPriority = priorityWeights[a.priority] || 0.5;
    const bPriority = priorityWeights[b.priority] || 0.5;
    if (aPriority !== bPriority) return bPriority - aPriority;
    // Higher relevance first
    const aRelevance = a.relevanceScore || 0;
    const bRelevance = b.relevanceScore || 0;
    if (aRelevance !== bRelevance) return bRelevance - aRelevance;
    // More recent first
    const aTime = a.timestamp || 0;
    const bTime = b.timestamp || 0;
    return bTime - aTime;
  });
}

module.exports = { prioritizeContextElements };
