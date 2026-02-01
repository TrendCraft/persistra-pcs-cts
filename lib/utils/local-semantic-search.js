/**
 * Local Semantic Search
 * 
 * A local implementation of semantic search for Leo's memory graph.
 * This module provides true semantic search capabilities without
 * relying on external services, making Leo platform-independent.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const loggerModule = require('../utils/logger');
const configService = require('./config-service');
const eventBus = require('../utils/event-bus');

// Constants
const COMPONENT_NAME = 'local-semantic-search';
const logger = loggerModule.createComponentLogger(COMPONENT_NAME);

// Default configuration
const DEFAULT_CONFIG = {
  CHUNKS_PATH: path.join(process.cwd(), 'data', 'chunks.jsonl'),
  EMBEDDINGS_PATH: path.join(process.cwd(), 'data', 'embeddings.jsonl'),
  EMBEDDING_SCRIPT_PATH: path.join(process.cwd(), 'lib', 'embeddings', 'generate-embedding.js'),
  MAX_RESULTS: 5,
  SIMILARITY_THRESHOLD: 0.65,
  BATCH_SIZE: 1000,
  EMBEDDING_DIMENSIONS: 384,
  EMBEDDING_CACHE_SIZE: 1000
};

/**
 * Vector utility functions
 */
class VectorUtils {
  /**
   * Calculate cosine similarity between two vectors
   * @param {number[]} vecA - First vector
   * @param {number[]} vecB - Second vector
   * @returns {number} Cosine similarity (-1 to 1)
   */
  static cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  /**
   * Generate a hash-based embedding vector (fallback when embeddings are unavailable)
   * @param {string} text - Text to generate embedding for
   * @param {number} dimensions - Number of dimensions for the vector
   * @returns {number[]} Embedding vector
   */
  static generateHashEmbedding(text, dimensions = 384) {
    const vector = new Array(dimensions).fill(0);
    
    if (!text || typeof text !== 'string') {
      return vector;
    }
    
    // Use a consistent hash function for each dimension
    for (let i = 0; i < dimensions; i++) {
      // Create a different seed for each dimension
      const seedText = `${text}:${i}`;
      let hash = 0;
      
      // Simple hash function
      for (let j = 0; j < seedText.length; j++) {
        const char = seedText.charCodeAt(j);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      // Scale to a value between -1 and 1
      vector[i] = (hash % 1000) / 500 - 1;
    }
    
    return vector;
  }
}

/**
 * LocalSemanticSearch class for searching the memory graph
 */
class LocalSemanticSearch {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.chunks = [];
    this.embeddings = new Map();
    this.corpusStats = {
      totalDocuments: 0,
      vocabularySize: 0,
      termFrequencies: {},
      documentFrequencies: {},
      averageDocumentLength: 0
    };
    this.initialized = false;
    this.embeddingCache = new Map();
    this._diagnostics = {
      initializationTime: 0,
      searchCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      fallbackCount: 0,
      latestSearchTime: 0
    };
    
    this._bindMethods();
  }
  
  /**
   * Bind class methods to this instance
   * @private
   */
  _bindMethods() {
    this.initialize = this.initialize.bind(this);
    this.search = this.search.bind(this);
    this.searchMemoryGraph = this.searchMemoryGraph.bind(this);
    this.generateEmbedding = this.generateEmbedding.bind(this);
    this.getStats = this.getStats.bind(this);
  }
  
  /**
   * Initialize the local semantic search
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} Success status
   */
  async initialize(options = {}) {
    try {
      const startTime = Date.now();
      
      // Merge config with options
      this.config = { ...this.config, ...options };
      
      logger.info('Initializing local semantic search...');
      
      // Load chunks and embeddings
      await this._loadChunks();
      await this._loadEmbeddings();
      
      // Build corpus statistics for fallback search
      this._buildCorpusStats();
      
      this.initialized = true;
      this._diagnostics.initializationTime = Date.now() - startTime;
      
      logger.info(`Initialization complete in ${this._diagnostics.initializationTime}ms`);
      logger.info(`Loaded ${this.chunks.length} chunks and ${this.embeddings.size} embeddings`);
      
      // Emit initialization complete event
      eventBus.emit('local-semantic-search:initialized', {
        component: COMPONENT_NAME,
        status: 'success',
        chunksCount: this.chunks.length,
        embeddingsCount: this.embeddings.size
      });
      
      return true;
    } catch (error) {
      logger.error(`Initialization failed: ${error.message}`);
      logger.debug(error.stack);
      
      // Emit initialization failed event
      eventBus.emit('local-semantic-search:initialization-failed', {
        component: COMPONENT_NAME,
        status: 'failed',
        error: error.message
      });
      
      return false;
    }
  }

  /**
   * Load chunks from JSONL file using streaming to handle large files
   * @returns {Promise<void>}
   * @private
   */
  async _loadChunks() {
    logger.info(`Loading chunks from ${this.config.CHUNKS_PATH}...`);
    
    if (!fs.existsSync(this.config.CHUNKS_PATH)) {
      logger.error(`Chunks file not found: ${this.config.CHUNKS_PATH}`);
      throw new Error(`Chunks file not found: ${this.config.CHUNKS_PATH}`);
    }
    
    try {
      this.chunks = [];
      let count = 0;
      
      const fileStream = fs.createReadStream(this.config.CHUNKS_PATH);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const chunk = JSON.parse(line);
            this.chunks.push(chunk);
            count++;
            
            // Log progress for large files
            if (count % 5000 === 0) {
              logger.debug(`Loaded ${count} chunks so far...`);
            }
          } catch (err) {
            logger.warn(`Error parsing chunk JSON: ${err.message}`);
          }
        }
      }
      
      logger.info(`Successfully loaded ${count} chunks`);
    } catch (error) {
      logger.error(`Error loading chunks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load embeddings from JSONL file using streaming to handle large files
   * @returns {Promise<void>}
   * @private
   */
  async _loadEmbeddings() {
    logger.info(`Loading embeddings from ${this.config.EMBEDDINGS_PATH}...`);
    
    if (!fs.existsSync(this.config.EMBEDDINGS_PATH)) {
      logger.error(`Embeddings file not found: ${this.config.EMBEDDINGS_PATH}`);
      throw new Error(`Embeddings file not found: ${this.config.EMBEDDINGS_PATH}`);
    }
    
    try {
      this.embeddings = new Map();
      let count = 0;
      
      const fileStream = fs.createReadStream(this.config.EMBEDDINGS_PATH);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const embedding = JSON.parse(line);
            if (embedding.id && embedding.vector) {
              this.embeddings.set(embedding.id, embedding.vector);
              count++;
              
              // Log progress for large files
              if (count % 5000 === 0) {
                logger.debug(`Loaded ${count} embeddings so far...`);
              }
            }
          } catch (err) {
            logger.warn(`Error parsing embedding JSON: ${err.message}`);
          }
        }
      }
      
      logger.info(`Successfully loaded ${count} embeddings`);
      
      // Validate that embeddings match chunks
      const missingCount = this.chunks.filter(chunk => !this.embeddings.has(chunk.id)).length;
      if (missingCount > 0) {
        logger.warn(`${missingCount} chunks are missing corresponding embeddings`);
      }
    } catch (error) {
      logger.error(`Error loading embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build corpus statistics for improved fallback search capabilities
   * @private
   */
  _buildCorpusStats() {
    logger.info('Building corpus statistics for fallback search...');
    
    const termFrequencies = {};
    const documentFrequencies = {};
    let totalTerms = 0;
    
    // Calculate term frequencies and document frequencies
    for (const chunk of this.chunks) {
      if (!chunk.content || typeof chunk.content !== 'string') {
        continue;
      }
      
      // Tokenize the document
      const tokens = this._tokenize(chunk.content);
      const uniqueTerms = new Set(tokens);
      
      // Update document frequencies
      for (const term of uniqueTerms) {
        documentFrequencies[term] = (documentFrequencies[term] || 0) + 1;
      }
      
      // Update term frequencies
      for (const token of tokens) {
        termFrequencies[token] = (termFrequencies[token] || 0) + 1;
        totalTerms++;
      }
    }
    
    // Calculate statistics
    this.corpusStats = {
      totalDocuments: this.chunks.length,
      vocabularySize: Object.keys(termFrequencies).length,
      termFrequencies,
      documentFrequencies,
      averageDocumentLength: totalTerms / Math.max(1, this.chunks.length),
      totalTerms
    };
    
    logger.info(`Corpus statistics built: ${this.corpusStats.vocabularySize} terms in ${this.corpusStats.totalDocuments} documents`);
  }
  
  /**
   * Tokenize text into terms for text search
   * @param {string} text - Text to tokenize
   * @returns {string[]} Array of tokens
   * @private
   */
  _tokenize(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    // Convert to lowercase and split on non-alphanumeric characters
    return text.toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter(term => term && term.length > 1) // Filter out empty strings and single characters
      .filter(term => !this._isStopWord(term)); // Filter out stop words
  }
  
  /**
   * Check if a term is a stop word
   * @param {string} term - Term to check
   * @returns {boolean} True if term is a stop word
   * @private
   */
  _isStopWord(term) {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'of',
      'this', 'that', 'these', 'those', 'it', 'its', 'from', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'can', 'could', 'may', 'might', 'must', 'shall', 'should'
    ]);
    
    return stopWords.has(term);
  }
  
  /**
   * Generate embedding for a query
   * @param {string} text - Text to generate embedding for
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      logger.warn('Invalid text provided for embedding generation');
      return VectorUtils.generateHashEmbedding('', this.config.EMBEDDING_DIMENSIONS);
    }
    
    // Check cache first
    const cacheKey = text.trim().slice(0, 100); // Use first 100 chars as key
    if (this.embeddingCache.has(cacheKey)) {
      this._diagnostics.cacheHits++;
      return this.embeddingCache.get(cacheKey);
    }
    
    this._diagnostics.cacheMisses++;
    
    try {
      // Try to use the embedding script if it exists
      if (fs.existsSync(this.config.EMBEDDING_SCRIPT_PATH)) {
        const textBase64 = Buffer.from(text).toString('base64');
        const result = execSync(
          `node ${this.config.EMBEDDING_SCRIPT_PATH} "${textBase64}"`,
          { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
        );
        
        const embedding = JSON.parse(result.trim());
        
        // Cache the result
        this.embeddingCache.set(cacheKey, embedding);
        
        // Manage cache size
        if (this.embeddingCache.size > this.config.EMBEDDING_CACHE_SIZE) {
          const oldestKey = this.embeddingCache.keys().next().value;
          this.embeddingCache.delete(oldestKey);
        }
        
        return embedding;
      } else {
        logger.warn(`Embedding script not found: ${this.config.EMBEDDING_SCRIPT_PATH}`);
        this._diagnostics.fallbackCount++;
        
        // Use fallback hash-based embedding
        const hashEmbedding = VectorUtils.generateHashEmbedding(text, this.config.EMBEDDING_DIMENSIONS);
        this.embeddingCache.set(cacheKey, hashEmbedding);
        return hashEmbedding;
      }
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      this._diagnostics.fallbackCount++;
      
      // Use fallback hash-based embedding
      const hashEmbedding = VectorUtils.generateHashEmbedding(text, this.config.EMBEDDING_DIMENSIONS);
      this.embeddingCache.set(cacheKey, hashEmbedding);
      return hashEmbedding;
    }
  }
  
  /**
   * Perform semantic search on the memory graph
   * @param {string} query - The query to search for
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results with metadata
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    this._diagnostics.searchCount++;
    
    const {
      maxResults = this.config.MAX_RESULTS,
      similarityThreshold = this.config.SIMILARITY_THRESHOLD,
      includeContent = true,
      includeMetadata = true
    } = options;
    
    logger.info(`Performing semantic search for: "${query}"`);
    
    if (!query || typeof query !== 'string' || query.trim() === '') {
      logger.warn('Invalid query provided for search');
      return { results: [], metadata: { searchTime: 0, method: 'none' } };
    }
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // If embedding generation failed or returned invalid vector
      const validEmbedding = queryEmbedding && 
                           Array.isArray(queryEmbedding) && 
                           queryEmbedding.length > 0;
      
      // Choose search method based on embedding availability
      if (validEmbedding && this.embeddings.size > 0) {
        // Use semantic search with embeddings
        const results = await this._semanticSearch(query, queryEmbedding, options);
        
        const searchTime = Date.now() - startTime;
        this._diagnostics.latestSearchTime = searchTime;
        
        logger.info(`Semantic search completed in ${searchTime}ms with ${results.length} results`);
        
        return {
          results,
          metadata: {
            searchTime,
            method: 'semantic',
            resultsCount: results.length,
            totalChunks: this.chunks.length
          }
        };
      } else {
        // Fall back to keyword search
        logger.warn('Falling back to keyword search due to missing embeddings');
        const results = this._fallbackSearch(query, options);
        
        const searchTime = Date.now() - startTime;
        this._diagnostics.latestSearchTime = searchTime;
        this._diagnostics.fallbackCount++;
        
        logger.info(`Fallback search completed in ${searchTime}ms with ${results.length} results`);
        
        return {
          results,
          metadata: {
            searchTime,
            method: 'keyword',
            resultsCount: results.length,
            totalChunks: this.chunks.length
          }
        };
      }
    } catch (error) {
      logger.error(`Search error: ${error.message}`);
      logger.debug(error.stack);
      
      // Attempt fallback search in case of errors
      try {
        const results = this._fallbackSearch(query, options);
        const searchTime = Date.now() - startTime;
        
        return {
          results,
          metadata: {
            searchTime,
            method: 'keyword-fallback',
            error: error.message,
            resultsCount: results.length
          }
        };
      } catch (fallbackError) {
        logger.error(`Fallback search also failed: ${fallbackError.message}`);
        return {
          results: [],
          metadata: {
            error: error.message,
            fallbackError: fallbackError.message,
            method: 'failed'
          }
        };
      }
    }
  }
  
  /**
   * Perform semantic search using embeddings
   * @param {string} query - Original query text
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   * @private
   */
  async _semanticSearch(query, queryEmbedding, options = {}) {
    const {
      maxResults = this.config.MAX_RESULTS,
      similarityThreshold = this.config.SIMILARITY_THRESHOLD,
      includeContent = true,
      includeMetadata = true
    } = options;
    
    // Array to store similarity scores
    const similarities = [];
    
    // Calculate similarity for each chunk
    for (const chunk of this.chunks) {
      const chunkEmbedding = this.embeddings.get(chunk.id);
      
      if (chunkEmbedding) {
        const similarity = VectorUtils.cosineSimilarity(queryEmbedding, chunkEmbedding);
        
        if (similarity >= similarityThreshold) {
          similarities.push({
            chunk,
            similarity
          });
        }
      }
    }
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Take top results
    const topResults = similarities.slice(0, maxResults);
    
    // Format results
    return topResults.map(item => {
      const result = {
        id: item.chunk.id,
        similarity: item.similarity
      };
      
      if (includeContent) {
        result.content = item.chunk.content;
      }
      
      if (includeMetadata && item.chunk.metadata) {
        result.metadata = item.chunk.metadata;
      }
      
      return result;
    });
  }
  
  /**
   * Perform fallback keyword search when embeddings are unavailable
   * @param {string} query - Query text
   * @param {Object} options - Search options
   * @returns {Array} Search results
   * @private
   */
  _fallbackSearch(query, options = {}) {
    const {
      maxResults = this.config.MAX_RESULTS,
      includeContent = true,
      includeMetadata = true
    } = options;
    
    // Tokenize the query
    const queryTokens = this._tokenize(query);
    
    if (queryTokens.length === 0) {
      return [];
    }
    
    // Calculate TF-IDF scores for each chunk
    const scores = [];
    
    for (const chunk of this.chunks) {
      if (!chunk.content || typeof chunk.content !== 'string') {
        continue;
      }
      
      const chunkTokens = this._tokenize(chunk.content);
      let score = 0;
      
      // Calculate BM25-inspired score
      for (const token of queryTokens) {
        // Term frequency in this chunk
        const tf = chunkTokens.filter(t => t === token).length;
        
        if (tf > 0) {
          // Document frequency
          const df = this.corpusStats.documentFrequencies[token] || 0;
          
          // IDF calculation with smoothing to avoid division by zero
          const idf = Math.log(1 + (this.corpusStats.totalDocuments / (1 + df)));
          
          // BM25-inspired score component
          const k1 = 1.2;
          const b = 0.75;
          const docLength = chunkTokens.length;
          const avgDocLength = this.corpusStats.averageDocumentLength;
          
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
          
          score += (numerator / denominator) * idf;
        }
      }
      
      // Boost score for exact phrase matches
      if (chunk.content.toLowerCase().includes(query.toLowerCase())) {
        score *= 1.5; // 50% boost for exact matches
      }
      
      if (score > 0) {
        scores.push({
          chunk,
          score
        });
      }
    }
    
    // Sort by score (descending)
    scores.sort((a, b) => b.score - a.score);
    
    // Take top results
    const topResults = scores.slice(0, maxResults);
    
    // Format results
    return topResults.map(item => {
      const result = {
        id: item.chunk.id,
        similarity: item.score // Use score as similarity for consistent interface
      };
      
      if (includeContent) {
        result.content = item.chunk.content;
      }
      
      if (includeMetadata && item.chunk.metadata) {
        result.metadata = item.chunk.metadata;
      }
      
      return result;
    });
  }
  
  /**
   * Get statistics about the local semantic search service
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      chunksCount: this.chunks.length,
      embeddingsCount: this.embeddings.size,
      corpusStats: {
        totalDocuments: this.corpusStats.totalDocuments,
        vocabularySize: this.corpusStats.vocabularySize,
        averageDocumentLength: this.corpusStats.averageDocumentLength
      },
      diagnostics: this._diagnostics,
      missingEmbeddingsCount: this.chunks.filter(chunk => !this.embeddings.has(chunk.id)).length
    };
  }

  /**
   * Standardized interface for searchMemoryGraph that matches Leo's API
   * @param {string} query - The query to search for
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Standardized search results
   */
  async searchMemoryGraph(query, options = {}) {
    const result = await this.search(query, options);
    
    // Convert to standardized format
    return {
      success: result.results.length > 0,
      results: result.results,
      metadata: {
        ...result.metadata,
        query,
        timestamp: Date.now()
      }
    };
  }
}

// Create singleton instance
const localSemanticSearch = new LocalSemanticSearch();

// Export class and singleton instance
module.exports = {
  LocalSemanticSearch,
  localSemanticSearch,
  
  // Standardized interface to match existing code
  searchMemoryGraph: async (query, options = {}) => {
    return localSemanticSearch.searchMemoryGraph(query, options);
  }
};
