/**
 * Semantic Fallback Context Assembler
 * 
 * Implements semantic fallback logic to prevent low-relevance project context
 * from being used in responses to out-of-domain queries. Ensures safe and 
 * accurate fallback behavior by enforcing similarity thresholds.
 */

const logger = require('../../lib/utils/logger');

class SemanticFallbackAssembler {
  constructor(options = {}) {
    this.semanticContextManager = options.semanticContextManager;
    this.fallbackThreshold = options.fallbackThreshold || 0.12; // Calibrated for transformer embeddings
    this.logger = options.logger || logger;
  }

  /**
   * Assemble context with semantic fallback checking
   * @param {string} query - User query
   * @param {object} options - Search options
   * @returns {object} Context object with fallback analysis
   */
  async assembleContextWithFallback(query, options = {}) {
    try {
      // Perform semantic search with fallback analysis
      const searchResult = await this.semanticContextManager.searchContext(query, {
        ...options,
        similarityThreshold: options.similarityThreshold !== undefined ? options.similarityThreshold : 0.2, // Use provided threshold or default to 0.2
        maxResults: options.maxResults || 10,
        chunks: options.chunks // Pass through chunks parameter if provided
      });

      if (!searchResult.success) {
        this.logger.error(`[SEMANTIC-FALLBACK] Search failed: ${searchResult.error}`);
        return this._createFallbackResponse(query, 'Search failed');
      }

      const { results, metadata } = searchResult;
      const fallbackAnalysis = metadata.fallbackAnalysis;

      // Log fallback analysis
      this.logger.info(`[SEMANTIC-FALLBACK] Query: "${query.substring(0, 50)}..."`);
      this.logger.info(`[SEMANTIC-FALLBACK] Analysis: ${JSON.stringify(fallbackAnalysis)}`);

      // Check if fallback should be triggered
      if (this._shouldTriggerFallback(fallbackAnalysis, query)) {
        this.logger.info(`[SEMANTIC-FALLBACK] Triggering fallback for query: "${query}"`);
        return this._createFallbackResponse(query, 'Low project relevance', fallbackAnalysis);
      }

      // Filter results to only include high-relevance ones
      const projectRelevantResults = results.filter(r => r.similarity >= this.fallbackThreshold);
      
      this.logger.info(`[SEMANTIC-FALLBACK] Using ${projectRelevantResults.length} project-relevant results`);

      return {
        success: true,
        context: {
          results: projectRelevantResults,
          query,
          fallbackTriggered: false,
          fallbackAnalysis,
          projectRelevant: true
        },
        metadata: {
          ...metadata,
          contextType: 'project_relevant',
          fallbackAnalysis
        }
      };

    } catch (error) {
      this.logger.error(`[SEMANTIC-FALLBACK] Error assembling context: ${error.message}`);
      return this._createFallbackResponse(query, 'Assembly error', null, error);
    }
  }

  /**
   * Determine if fallback should be triggered based on analysis
   * @param {object} fallbackAnalysis - Analysis from search results
   * @param {string} query - Original query
   * @returns {boolean} Whether to trigger fallback
   */
  _shouldTriggerFallback(fallbackAnalysis, query) {
    if (!fallbackAnalysis) return false;

    // If we have good project-relevant results AND it's not a clear general knowledge query, don't fallback
    if (fallbackAnalysis.projectRelevantResults > 0 && fallbackAnalysis.maxSimilarity >= this.fallbackThreshold && !this._isDefinitelyGeneralKnowledge(query)) {
      return false;
    }

    // Trigger fallback if no project-relevant results found
    if (fallbackAnalysis.projectRelevantResults === 0 && fallbackAnalysis.totalResults > 0) {
      return true;
    }

    // Trigger fallback if max similarity is below threshold
    if (fallbackAnalysis.maxSimilarity < this.fallbackThreshold) {
      return true;
    }

    // Check for general knowledge query patterns (only if no good project results)
    if (this._isGeneralKnowledgeQuery(query)) {
      return true;
    }

    return false;
  }

  /**
   * Check if query appears to be general knowledge rather than project-specific
   * @param {string} query - User query
   * @returns {boolean} Whether query appears to be general knowledge
   */
  _isGeneralKnowledgeQuery(query) {
    const generalKnowledgePatterns = [
      /quantum\s+(entanglement|computing|mechanics)/i,
      /blockchain\s+(consensus|algorithm)/i,
      /machine\s+learning\s+(algorithm|model)/i,
      /artificial\s+intelligence/i,
      /neural\s+network/i,
      /deep\s+learning/i,
      /what\s+is\s+(python|javascript|react|node)/i,
      /how\s+does\s+(http|tcp|internet)/i,
      /explain\s+(recursion|algorithms|data\s+structures)/i,
      /define\s+(programming|software|computer)/i
    ];

    return generalKnowledgePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Check if query is definitely general knowledge (more aggressive detection)
   * @param {string} query - User query
   * @returns {boolean} Whether query is definitely general knowledge
   */
  _isDefinitelyGeneralKnowledge(query) {
    const definitivePatterns = [
      /quantum\s+(entanglement|computing|mechanics|physics)/i,
      /what\s+is\s+(quantum|relativity|evolution|photosynthesis)/i,
      /explain\s+(quantum|physics|chemistry|biology)/i,
      /define\s+(quantum|physics|mathematics)/i,
      /how\s+does\s+(quantum|gravity|magnetism|electricity)/i
    ];

    return definitivePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Create fallback response when project context is not relevant
   * @param {string} query - Original query
   * @param {string} reason - Reason for fallback
   * @param {object} fallbackAnalysis - Optional analysis data
   * @param {Error} error - Optional error
   * @returns {object} Fallback response object
   */
  _createFallbackResponse(query, reason, fallbackAnalysis = null, error = null) {
    const fallbackMessage = this._generateFallbackMessage(query, reason);

    return {
      success: true,
      context: {
        results: [],
        query,
        fallbackTriggered: true,
        fallbackReason: reason,
        fallbackMessage,
        fallbackAnalysis,
        projectRelevant: false
      },
      metadata: {
        contextType: 'fallback',
        fallbackReason: reason,
        fallbackAnalysis,
        error: error?.message
      }
    };
  }

  /**
   * Generate appropriate fallback message
   * @param {string} query - Original query
   * @param {string} reason - Reason for fallback
   * @returns {string} Fallback message
   */
  _generateFallbackMessage(query, reason) {
    // Extract key terms from query for fallback message
    const queryTerms = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .slice(0, 3)
      .join(', ');

    const fallbackMessages = {
      'Low project relevance': `I have not learned about ${queryTerms} in this project yet. This appears to be outside the scope of our project context.`,
      'Search failed': `I encountered an issue searching for information about ${queryTerms} in this project.`,
      'Assembly error': `I had trouble retrieving context for ${queryTerms} from this project.`
    };

    return fallbackMessages[reason] || `I don't have relevant project context for ${queryTerms}.`;
  }

  /**
   * Get fallback threshold
   * @returns {number} Current fallback threshold
   */
  getFallbackThreshold() {
    return this.fallbackThreshold;
  }

  /**
   * Set fallback threshold
   * @param {number} threshold - New threshold (0.0 to 1.0)
   */
  setFallbackThreshold(threshold) {
    if (threshold >= 0 && threshold <= 1) {
      this.fallbackThreshold = threshold;
      this.logger.info(`[SEMANTIC-FALLBACK] Updated fallback threshold to ${threshold}`);
    } else {
      throw new Error('Fallback threshold must be between 0.0 and 1.0');
    }
  }
}

module.exports = SemanticFallbackAssembler;
