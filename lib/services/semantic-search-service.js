/**
 * Semantic Search Service
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * Provides semantic search capabilities for Leo's awareness layers.
 * This service enables the Vision Anchor and Meta-Cognitive Layer
 * to perform semantic similarity searches and create embeddings.
 *
 * @module lib/services/semantic-search-service
 * @author Leo Development Team
 * @created May 13, 2025
 */

const path = require('path');
const fs = require('fs').promises;
const eventBus = require('../utils/event-bus');

/**
 * Semantic Search Service
 * 
 * Provides semantic search capabilities
 */
class SemanticSearchService {
  constructor({ embeddingsInterface, logger } = {}) {
    if (!embeddingsInterface) {
      (logger || console).warn && (logger || console).warn('[semantic-search-service] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
    }
    if (!logger) {
      console.warn('[semantic-search-service] DI MIGRATION: logger not provided! Falling back to console.');
    }
    this.embeddings = embeddingsInterface;
    this.logger = logger || console;
    this.initialized = false;
    this.embeddingsCache = new Map();
    this.modelDimension = 384; // Default embedding dimension
    this.embeddingsDir = path.join(process.cwd(), 'data', 'embeddings');
  }

  /**
   * Initialize the semantic search service
   */
  async initialize(options = {}) {
    if (this.initialized) {
      this.logger.warn('Semantic search service already initialized');
      return;
    }

    this.logger.info('Initializing semantic search service');

    try {
      // Create embeddings directory if it doesn't exist
      await fs.mkdir(this.embeddingsDir, { recursive: true });
      
      // Set options
      this.modelDimension = options.modelDimension || this.modelDimension;
      this.embeddingsDir = options.embeddingsDir || this.embeddingsDir;
      
      // Load any existing embeddings
      await this.loadEmbeddings();
      
      this.initialized = true;
      this.logger.info('Semantic search service initialized successfully');
      eventBus.emit('service:initialized', { service: 'semantic-search-service', timestamp: Date.now() });
    } catch (error) {
      this.logger.error(`Failed to initialize semantic search service: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Load embeddings from storage
   */
  async loadEmbeddings() {
    try {
      const embeddingsFile = path.join(this.embeddingsDir, 'vision-embeddings.json');
      
      try {
        const data = await fs.readFile(embeddingsFile, 'utf8');
        const embeddings = JSON.parse(data);
        
        for (const [key, value] of Object.entries(embeddings)) {
          this.embeddingsCache.set(key, value);
        }
        
        this.logger.info(`Loaded ${this.embeddingsCache.size} embeddings from storage`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          this.logger.warn(`Error loading embeddings: ${error.message}`);
        } else {
          this.logger.info('No existing embeddings found, starting with empty cache');
        }
      }
    } catch (error) {
      this.logger.error(`Error loading embeddings: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Save embeddings to storage
   */
  async saveEmbeddings() {
    try {
      const embeddingsFile = path.join(this.embeddingsDir, 'vision-embeddings.json');
      const data = JSON.stringify(Object.fromEntries(this.embeddingsCache), null, 2);
      
      await fs.writeFile(embeddingsFile, data);
      this.logger.info(`Saved ${this.embeddingsCache.size} embeddings to storage`);
    } catch (error) {
      this.logger.error(`Error saving embeddings: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Create an embedding for a text
   * @param {string} text - Text to create embedding for
   * @returns {Promise<Array<number>>} The embedding vector
   */
  async createEmbedding(text) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if we already have this embedding
    const cacheKey = this._getCacheKey(text);
    if (this.embeddingsCache.has(cacheKey)) {
      return this.embeddingsCache.get(cacheKey);
    }

    try {
      // Use the injected embeddings interface to generate embeddings
      const embedding = await this.embeddings.generate(text);
      this.embeddingsCache.set(cacheKey, embedding);
      await this.saveEmbeddings();
      return embedding;
    } catch (error) {
      this.logger.error(`Error creating embedding: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Calculate similarity between two embeddings
   * @param {Array<number>} embedding1 - First embedding
   * @param {Array<number>} embedding2 - Second embedding
   * @returns {Promise<number>} Similarity score between 0 and 1
   */
  async calculateSimilarity(embedding1, embedding2) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Use the injected embeddings interface for cosine similarity
      return this.embeddings.cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      this.logger.error(`Error calculating similarity: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Search for similar texts
   * @param {string} query - Query text
   * @param {Array<string>} corpus - Corpus of texts to search
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} Search results with similarity scores
   */
  async search(query, corpus, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Create query embedding
      const queryEmbedding = await this.createEmbedding(query);
      
      // Create embeddings for corpus if needed
      const corpusEmbeddings = [];
      for (const text of corpus) {
        const embedding = await this.createEmbedding(text);
        corpusEmbeddings.push({ text, embedding });
      }
      
      // Calculate similarities
      const results = [];
      for (const { text, embedding } of corpusEmbeddings) {
        const similarity = await this.calculateSimilarity(queryEmbedding, embedding);
        results.push({ text, similarity });
      }
      
      // Sort by similarity (descending)
      results.sort((a, b) => b.similarity - a.similarity);
      
      // Apply limit if specified
      const limit = options.limit || results.length;
      return results.slice(0, limit);
    } catch (error) {
      this.logger.error(`Error searching: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get a cache key for a text
   * @param {string} text - Text to get cache key for
   * @returns {string} Cache key
   * @private
   */
  _getCacheKey(text) {
    // Simple hash function for testing
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `text_${hash}`;
  }

  /**
   * Create a mock embedding for testing
   * @param {string} text - Text to create embedding for
   * @returns {Array<number>} Mock embedding
   * @private
   */
  _createMockEmbedding(text) {
    // Create a deterministic mock embedding based on the text
    const embedding = new Array(this.modelDimension).fill(0);
    
    // Fill with values derived from the text
    for (let i = 0; i < text.length && i < this.modelDimension; i++) {
      const charCode = text.charCodeAt(i);
      embedding[i % this.modelDimension] += charCode / 255;
    }
    
    // Normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {Array<number>} a - First embedding
   * @param {Array<number>} b - Second embedding
   * @returns {number} Cosine similarity
   * @private
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
}

module.exports = SemanticSearchService;
