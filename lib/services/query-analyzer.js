/**
 * QueryAnalyzer Class
 * 
 * This class analyzes queries to determine their complexity, type, and context needs.
 * It's a core component of the adaptive context selection system for Leo.
 * 
 * Implemented as a singleton to prevent duplicate initialization across the system.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');

// Component name for logging and events
const COMPONENT_NAME = 'query-analyzer';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Singleton instance
let instance = null;

/**
 * QueryAnalyzer class for analyzing query characteristics
 */
class QueryAnalyzer {
  /**
   * Create a new QueryAnalyzer instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Default configuration
    this.config = {
      // Default weights for different context types
      CODE_WEIGHT: 0.6,
      CONVERSATION_WEIGHT: 0.3,
      NARRATIVE_WEIGHT: 0.1,
      
      // Complexity thresholds
      COMPLEXITY_THRESHOLD_HIGH: 0.7,
      COMPLEXITY_THRESHOLD_LOW: 0.3,
      
      // Keywords for different context types
      codeKeywords: [
        'code', 'function', 'class', 'method', 'variable', 'import', 
        'export', 'module', 'library', 'package', 'dependency', 'bug', 
        'error', 'fix', 'implement', 'refactor', 'optimize', 'algorithm',
        'syntax', 'compile', 'runtime', 'debug', 'exception', 'interface'
      ],
      
      conversationKeywords: [
        'conversation', 'discussion', 'talk', 'chat', 'said', 'mentioned',
        'discussed', 'agreed', 'decided', 'conclusion', 'summary', 'meeting',
        'conversation history', 'previous discussion', 'we talked about',
        'you mentioned', 'earlier conversation', 'previously discussed'
      ],
      
      narrativeKeywords: [
        'history', 'timeline', 'evolution', 'progress', 'development',
        'journey', 'story', 'narrative', 'decision', 'rationale', 'why',
        'background', 'context', 'motivation', 'reasoning', 'explanation',
        'justification', 'purpose', 'vision', 'goal', 'roadmap'
      ],
      
      // Complexity indicators
      complexityIndicators: {
        high: ['complex', 'complicated', 'advanced', 'sophisticated', 'comprehensive', 
               'detailed', 'thorough', 'in-depth', 'elaborate', 'extensive'],
        low: ['simple', 'basic', 'quick', 'brief', 'short', 'easy', 'straightforward',
              'just', 'only', 'simple', 'help me understand']
      },
      
      // Query type indicators
      queryTypeIndicators: {
        factual: ['what is', 'how does', 'explain', 'describe', 'define', 'tell me about',
                  'what are', 'details about', 'information on', 'facts about'],
        procedural: ['how to', 'steps to', 'process for', 'guide for', 'instructions for',
                     'implement', 'create', 'build', 'develop', 'set up', 'configure'],
        conceptual: ['why is', 'why does', 'concept behind', 'principle of', 'theory of',
                    'reasoning behind', 'rationale for', 'purpose of', 'meaning of'],
        comparative: ['difference between', 'compare', 'versus', 'vs', 'better than',
                     'advantages of', 'disadvantages of', 'pros and cons']
      }
    };
    
    // Override defaults with provided options
    Object.assign(this.config, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.queryAnalyzer) {
        Object.assign(this.config, config.queryAnalyzer);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    logger.info('QueryAnalyzer initialized with configuration', this.config);
  }
  
  /**
   * Update the analyzer configuration
   * @param {Object} options - New configuration options
   * @returns {boolean} Success status
   */
  updateConfig(options = {}) {
    try {
      // Merge options with current config
      Object.assign(this.config, options);
      
      logger.info('QueryAnalyzer configuration updated', this.config);
      return true;
    } catch (error) {
      logger.error(`Error updating QueryAnalyzer configuration: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Analyze a query to determine its characteristics
   * @param {string} query - The query text to analyze
   * @returns {Object} Analysis results including relevance scores, complexity, and query type
   */
  analyzeQuery(query) {
    try {
      if (!query || typeof query !== 'string') {
        logger.warn('Invalid query provided for analysis');
        return this._getDefaultAnalysis();
      }
      
      // Default weights
      let codeRelevance = this.config.CODE_WEIGHT;
      let conversationRelevance = this.config.CONVERSATION_WEIGHT;
      let narrativeRelevance = this.config.NARRATIVE_WEIGHT;
      
      // Prepare query for analysis
      const lowerQuery = query.toLowerCase();
      
      // Calculate linguistic metrics
      const queryLength = query.length;
      const wordCount = query.split(/\s+/).filter(Boolean).length;
      const avgWordLength = queryLength / (wordCount || 1);
      const sentenceCount = query.split(/[.!?]+/).filter(Boolean).length;
      const avgSentenceLength = wordCount / (sentenceCount || 1);
      
      // Count keyword occurrences for context type relevance
      const codeCount = this._countKeywordOccurrences(lowerQuery, this.config.codeKeywords);
      const conversationCount = this._countKeywordOccurrences(lowerQuery, this.config.conversationKeywords);
      const narrativeCount = this._countKeywordOccurrences(lowerQuery, this.config.narrativeKeywords);
      
      // Determine query complexity
      let complexity = this._determineComplexity(lowerQuery, wordCount, avgSentenceLength);
      
      // Determine query type
      let queryType = this._determineQueryType(lowerQuery);
      
      // Calculate complexity score (0-1)
      let complexityScore = this._calculateComplexityScore(wordCount, avgSentenceLength, avgWordLength);
      
      // Adjust weights based on keyword counts
      const totalCount = codeCount + conversationCount + narrativeCount;
      if (totalCount > 0) {
        codeRelevance = 0.3 + (codeCount / totalCount) * 0.7;
        conversationRelevance = 0.3 + (conversationCount / totalCount) * 0.7;
        narrativeRelevance = 0.3 + (narrativeCount / totalCount) * 0.7;
      }
      
      // Adjust based on query complexity and type
      if (complexity === 'high') {
        // For high complexity, we want more comprehensive context
        codeRelevance *= 1.2;
        conversationRelevance *= 1.2;
        narrativeRelevance *= 1.2;
      } else if (complexity === 'low') {
        // For low complexity, we want more focused context
        codeRelevance *= 0.8;
        conversationRelevance *= 0.8;
        narrativeRelevance *= 0.8;
      }
      
      // Adjust based on query type
      if (queryType === 'factual') {
        codeRelevance *= 1.3; // More code context for factual queries
      } else if (queryType === 'conceptual') {
        narrativeRelevance *= 1.3; // More narrative context for conceptual queries
      } else if (queryType === 'procedural') {
        codeRelevance *= 1.2; // More code context for procedural queries
        conversationRelevance *= 0.9;
      } else if (queryType === 'comparative') {
        narrativeRelevance *= 1.2; // More narrative context for comparative queries
        conversationRelevance *= 1.1;
      }
      
      // Normalize weights
      const sum = codeRelevance + conversationRelevance + narrativeRelevance;
      codeRelevance /= sum;
      conversationRelevance /= sum;
      narrativeRelevance /= sum;
      
      // Calculate the recommended context size based on complexity
      const recommendedContextSize = this._calculateRecommendedContextSize(complexityScore);
      
      // Calculate the recommended context diversity based on complexity and type
      const recommendedContextDiversity = this._calculateRecommendedContextDiversity(complexityScore, queryType);
      
      const analysis = {
        codeRelevance,
        conversationRelevance,
        narrativeRelevance,
        complexity,
        complexityScore,
        queryType,
        metrics: {
          queryLength,
          wordCount,
          avgWordLength,
          sentenceCount,
          avgSentenceLength
        },
        recommendations: {
          contextSize: recommendedContextSize,
          contextDiversity: recommendedContextDiversity
        }
      };
      
      logger.info(`Query analysis completed: code=${codeRelevance.toFixed(2)}, conversation=${conversationRelevance.toFixed(2)}, narrative=${narrativeRelevance.toFixed(2)}, complexity=${complexity}, type=${queryType}`);
      
      return analysis;
    } catch (error) {
      logger.error(`Error analyzing query: ${error.message}`);
      return this._getDefaultAnalysis();
    }
  }
  
  /**
   * Count occurrences of keywords in a text
   * @param {string} text - The text to search in
   * @param {Array<string>} keywords - The keywords to count
   * @returns {number} The number of keyword occurrences
   * @private
   */
  _countKeywordOccurrences(text, keywords) {
    return keywords.filter(word => text.includes(word)).length;
  }
  
  /**
   * Determine query complexity based on linguistic features
   * @param {string} query - The query text
   * @param {number} wordCount - Number of words in the query
   * @param {number} avgSentenceLength - Average sentence length
   * @returns {string} Complexity level: 'low', 'medium', or 'high'
   * @private
   */
  _determineComplexity(query, wordCount, avgSentenceLength) {
    // Check for explicit complexity indicators
    const highComplexityScore = this._countKeywordOccurrences(query, this.config.complexityIndicators.high);
    const lowComplexityScore = this._countKeywordOccurrences(query, this.config.complexityIndicators.low);
    
    // Use linguistic metrics as additional factors
    let complexityScore = 0;
    
    // Word count factor (more words = higher complexity)
    if (wordCount > 30) complexityScore += 2;
    else if (wordCount > 15) complexityScore += 1;
    
    // Sentence length factor (longer sentences = higher complexity)
    if (avgSentenceLength > 20) complexityScore += 2;
    else if (avgSentenceLength > 10) complexityScore += 1;
    
    // Combine explicit indicators with linguistic metrics
    if (highComplexityScore > lowComplexityScore || complexityScore >= 3) {
      return 'high';
    } else if (lowComplexityScore > highComplexityScore || complexityScore === 0) {
      return 'low';
    } else {
      return 'medium';
    }
  }
  
  /**
   * Calculate a numerical complexity score (0-1)
   * @param {number} wordCount - Number of words in the query
   * @param {number} avgSentenceLength - Average sentence length
   * @param {number} avgWordLength - Average word length
   * @returns {number} Complexity score between 0 and 1
   * @private
   */
  _calculateComplexityScore(wordCount, avgSentenceLength, avgWordLength) {
    // Normalize each factor to a 0-1 scale
    const wordCountFactor = Math.min(wordCount / 50, 1); // Max at 50 words
    const sentenceLengthFactor = Math.min(avgSentenceLength / 25, 1); // Max at 25 words per sentence
    const wordLengthFactor = Math.min((avgWordLength - 3) / 5, 1); // Normalize with 3 as baseline, max at 8
    
    // Combine factors with weights
    return (wordCountFactor * 0.5) + (sentenceLengthFactor * 0.3) + (wordLengthFactor * 0.2);
  }
  
  /**
   * Determine query type based on linguistic patterns
   * @param {string} query - The query text
   * @returns {string} Query type: 'factual', 'procedural', 'conceptual', 'comparative', or 'general'
   * @private
   */
  _determineQueryType(query) {
    let maxTypeScore = 0;
    let determinedType = 'general'; // Default
    
    for (const [type, indicators] of Object.entries(this.config.queryTypeIndicators)) {
      const score = this._countKeywordOccurrences(query, indicators);
      if (score > maxTypeScore) {
        maxTypeScore = score;
        determinedType = type;
      }
    }
    
    return determinedType;
  }
  
  /**
   * Calculate recommended context size based on complexity
   * @param {number} complexityScore - Complexity score (0-1)
   * @returns {Object} Recommended context sizes for different context types
   * @private
   */
  _calculateRecommendedContextSize(complexityScore) {
    // Base sizes
    const baseCodeItems = 5;
    const baseConversationItems = 3;
    const baseNarrativeItems = 2;
    
    // Scale based on complexity
    const scaleFactor = 1 + complexityScore;
    
    return {
      codeItems: Math.round(baseCodeItems * scaleFactor),
      conversationItems: Math.round(baseConversationItems * scaleFactor),
      narrativeItems: Math.round(baseNarrativeItems * scaleFactor),
      totalTokens: Math.round(2000 * scaleFactor) // Base token count scaled by complexity
    };
  }
  
  /**
   * Calculate recommended context diversity based on complexity and query type
   * @param {number} complexityScore - Complexity score (0-1)
   * @param {string} queryType - Query type
   * @returns {Object} Recommended diversity settings
   * @private
   */
  _calculateRecommendedContextDiversity(complexityScore, queryType) {
    // Base diversity (0-1, higher means more diverse sources)
    let baseDiversity = 0.5;
    
    // Adjust based on complexity
    baseDiversity += complexityScore * 0.3;
    
    // Adjust based on query type
    if (queryType === 'comparative') {
      baseDiversity += 0.2; // Comparative queries benefit from diverse perspectives
    } else if (queryType === 'factual') {
      baseDiversity -= 0.1; // Factual queries benefit from focused, authoritative sources
    }
    
    // Ensure within bounds
    baseDiversity = Math.max(0.2, Math.min(0.9, baseDiversity));
    
    return {
      diversityScore: baseDiversity,
      recommendedSourceCount: Math.round(3 + (baseDiversity * 5)), // 3-8 different sources
      shouldIncludeOpposing: baseDiversity > 0.7 // Include opposing viewpoints for high diversity
    };
  }
  
  /**
   * Get default analysis for when analysis fails
   * @returns {Object} Default analysis values
   * @private
   */
  _getDefaultAnalysis() {
    return {
      codeRelevance: this.config.CODE_WEIGHT,
      conversationRelevance: this.config.CONVERSATION_WEIGHT,
      narrativeRelevance: this.config.NARRATIVE_WEIGHT,
      complexity: 'medium',
      complexityScore: 0.5,
      queryType: 'general',
      metrics: {
        queryLength: 0,
        wordCount: 0,
        avgWordLength: 0,
        sentenceCount: 0,
        avgSentenceLength: 0
      },
      recommendations: {
        contextSize: {
          codeItems: 5,
          conversationItems: 3,
          narrativeItems: 2,
          totalTokens: 2000
        },
        contextDiversity: {
          diversityScore: 0.5,
          recommendedSourceCount: 5,
          shouldIncludeOpposing: false
        }
      }
    };
  }
}

/**
 * Get the QueryAnalyzer instance (singleton pattern)
 * @param {Object} options - Configuration options
 * @returns {QueryAnalyzer} The singleton instance
 */
function getQueryAnalyzer(options = {}) {
  if (!instance) {
    logger.info('Creating QueryAnalyzer singleton instance');
    instance = new QueryAnalyzer(options);
  } else if (Object.keys(options).length > 0) {
    // If options are provided and instance exists, update configuration
    logger.info('Updating existing QueryAnalyzer instance configuration');
    instance.updateConfig(options);
  } else {
    logger.info('Using existing QueryAnalyzer singleton instance');
  }
  
  return instance;
}

// Export the factory function instead of the class directly
module.exports = getQueryAnalyzer;
