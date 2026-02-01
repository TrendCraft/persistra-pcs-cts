/**
 * CSE Salience Ranker
 * 
 * Scores memory items for identity salience based on recency,
 * frequency, and content weight.
 * 
 * @created June 11, 2025
 * @phase CSE Phase 2
 */

// Fallback logger for environments without @tools/logger
const logger = {
  info: (...args) => console.log('[cse-salience-ranker]', ...args),
  warn: (...args) => console.warn('[cse-salience-ranker]', ...args),
  error: (...args) => console.error('[cse-salience-ranker]', ...args),
};

// Constants for scoring
const RECENCY_WEIGHT = 0.4;
const FREQUENCY_WEIGHT = 0.3;
const IDENTITY_WEIGHT = 0.3;

/**
 * Calculate recency score based on timestamp
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {number} - Score between 0 and 1
 */
function calculateRecencyScore(timestamp) {
  const now = Date.now();
  const ageInHours = (now - timestamp) / (1000 * 60 * 60);
  // Exponential decay: 0.9^hours (0.9 after 1 hour, 0.81 after 2 hours, etc.)
  // Minimum score of 0.1 after significant decay
  return Math.max(0.1, Math.pow(0.9, ageInHours));
}

/**
 * Calculate identity strength based on content
 * @param {string} content - Memory content
 * @returns {number} - Score between 0 and 1
 */
function calculateIdentityStrength(content) {
  if (!content || typeof content !== 'string') return 0;
  const lowerContent = content.toLowerCase();
  // Direct identity statements get highest score
  if (lowerContent.includes('you are leo') || 
      lowerContent.includes('i am leo') ||
      lowerContent.includes('leo is')) {
    return 1.0;
  }
  // Identity-related terms get medium score
  if (lowerContent.includes('identity') ||
      lowerContent.includes('cognitive engine') ||
      lowerContent.includes('assistant') ||
      lowerContent.includes('partner')) {
    return 0.7;
  }
  // Default score for other content
  return 0.3;
}

/**
 * Score a memory item for salience
 * @param {Object} memory - Memory item
 * @param {Object} options - Scoring options
 * @returns {number} - Salience score between 0 and 1
 */
function scoreMemoryItem(memory, options = {}) {
  // Calculate component scores
  const recencyScore = calculateRecencyScore(memory.timestamp);
  const identityStrength = calculateIdentityStrength(memory.content);
  const confidenceScore = memory.confidenceScore || 0.5;
  // Apply weights (configurable)
  const weights = {
    recency: options.recencyWeight || RECENCY_WEIGHT,
    identity: options.identityWeight || IDENTITY_WEIGHT,
    confidence: options.confidenceWeight || FREQUENCY_WEIGHT,
  };
  // Weighted sum
  const score = (recencyScore * weights.recency) +
                (identityStrength * weights.identity) +
                (confidenceScore * weights.confidence);
  return Math.min(1, Math.max(0, score));
}

/**
 * Rank an array of memories by salience
 * @param {Array} memories - Array of memory items
 * @param {Object} options - Ranking options
 * @returns {Array} - Array of { memory, score }, sorted descending
 */
function rankMemories(memories, options = {}) {
  const ranked = memories.map(memory => ({
    memory,
    score: scoreMemoryItem(memory, options)
  }));
  ranked.sort((a, b) => b.score - a.score);
  if (options.limit) {
    return ranked.slice(0, options.limit);
  }
  return ranked;
}

module.exports = {
  calculateRecencyScore,
  calculateIdentityStrength,
  scoreMemoryItem,
  rankMemories
};
