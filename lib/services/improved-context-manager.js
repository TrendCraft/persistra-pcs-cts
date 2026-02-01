/**
 * Leo Codex - Improved Context Manager
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This module provides significantly enhanced context management with:
 * 1. Sophisticated query analysis for better context retrieval
 * 2. Dynamic context selection based on query complexity and type
 * 3. Intelligent context formatting optimized for LLM consumption
 * 4. Context refinement with summarization and redundancy removal
 * 5. Advanced caching with expiration and size limits
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const configService = require('./config-service');
const { readJsonlFile, writeJsonlFile } = require('../utils/file-utils');
// Logger and embeddingsInterface will be set via DI
let logger = null;
let embeddingsInterface = null;

/**
 * Initialize the Improved Context Manager with DI
 * @param {Object} options
 * @param {Object} options.embeddingsInterface - Required embeddings interface
 * @param {Object} [options.logger] - Optional logger instance
 */
async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[improved-context-manager] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[improved-context-manager] DI MIGRATION: logger not provided! Falling back to console.');
  }
  // Optionally, add any other initialization logic here
  return true;
}

// Default configuration
const DEFAULT_CONFIG = {
  // Cache settings
  cacheExpiration: 24 * 60 * 60 * 1000, // 24 hours
  maxCacheSize: 100,
  
  // Context settings
  defaultTopK: 10,
  minSimilarityThreshold: 0.2,
  similarityThreshold: 0.2,
  maxResults: 10,
  
  // Context refinement
  enableSummarization: true,
  enableRedundancyRemoval: true,
  maxContextLength: 10000,
  minContextLength: 1000,
  
  // Query analysis
  complexityThresholds: {
    veryHigh: 0.8,
    high: 0.6,
    medium: 0.4,
    low: 0.2
  },
  
  // Keyword search
  keywordBoost: 1.5,
  minKeywordLength: 3,
  
  // File paths
  embeddingsFile: process.env.LEO_EMBEDDINGS_FILE || path.join(process.cwd(), 'data', 'embeddings.jsonl'),
  chunksFile: process.env.LEO_CHUNKS_FILE || path.join(process.cwd(), 'data', 'chunks.jsonl'),
  embeddingDimensions: 384,
  
  // Embedding generation
  embeddingDimensions: 384,
  
  // Chunk processing
  maxChunkSize: 1000,
  minChunkSize: 100,
  chunkOverlap: 20
};

// Initialize CONFIG with values from central config or defaults if not available
let CONFIG = {
  ...DEFAULT_CONFIG,
  
  // File paths from central config or defaults
  embeddingsFile: configService.getConfig()?.paths?.embeddings || path.join(process.cwd(), 'data', 'embeddings.jsonl'),
  chunksFile: configService.getConfig()?.paths?.chunks || path.join(process.cwd(), 'data', 'chunks.jsonl'),
  cacheDir: configService.getConfig()?.paths?.cache || path.join(process.cwd(), 'data', 'cache'),
  
  // Chunking settings from central config or defaults
  maxChunkSize: configService.getConfig()?.chunking?.maxChunkSize || DEFAULT_CONFIG.maxChunkSize,
  minChunkSize: configService.getConfig()?.chunking?.minChunkSize || DEFAULT_CONFIG.minChunkSize,
  chunkOverlap: configService.getConfig()?.chunking?.chunkOverlap || DEFAULT_CONFIG.chunkOverlap,
  
  // Context manager settings from central config or defaults
  defaultTopK: configService.getConfig()?.contextManager?.defaultTopK || DEFAULT_CONFIG.defaultTopK,
  minSimilarityThreshold: configService.getConfig()?.contextManager?.minSimilarityThreshold || DEFAULT_CONFIG.minSimilarityThreshold,
  similarityThreshold: configService.getConfig()?.contextManager?.similarityThreshold || DEFAULT_CONFIG.similarityThreshold,
  maxResults: configService.getConfig()?.contextManager?.maxResults || DEFAULT_CONFIG.maxResults,
  maxCacheSize: configService.getConfig()?.contextManager?.maxCacheItems || DEFAULT_CONFIG.maxCacheSize,
  cacheExpiration: (configService.getConfig()?.contextManager?.cacheExpiration || DEFAULT_CONFIG.cacheExpiration) * 1000 // Convert to milliseconds
};

// In-memory cache for query results
const queryCache = new Map();

// In-memory storage for embeddings and chunks
let embeddings = [];
let chunks = [];

// Cache management utilities
const cacheManager = {
  /**
   * Initialize the cache system
   * @param {Object} options - Cache options
   */
  initialize(options = {}) {
    const cacheDir = options.cacheDir || CONFIG.cacheDir;
    
    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        logger.info(`Created cache directory: ${cacheDir}`);
      } catch (error) {
        logger.error(`Failed to create cache directory: ${error.message}`);
      }
    }
    
    // Set up cache stats
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      lastCleanup: Date.now()
    };
    
    // Load existing stats if available
    const statsPath = path.join(cacheDir, 'cache-stats.json');
    if (fs.existsSync(statsPath)) {
      try {
        const statsData = fs.readFileSync(statsPath, 'utf8');
        this.stats = { ...this.stats, ...JSON.parse(statsData) };
        logger.info('Loaded cache stats', this.stats);
      } catch (error) {
        logger.warn(`Failed to load cache stats: ${error.message}`);
      }
    }
    
    // Schedule periodic cache cleanup
    this.scheduleCleanup();
    
    logger.info('Cache manager initialized');
  },
  
  /**
   * Get an item from the cache
   * @param {string} key - Cache key
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {any} Cached value or undefined
   */
  get(key, maxAge = 24 * 60 * 60 * 1000) {
    const cacheFile = this.getCacheFilePath(key);
    
    if (fs.existsSync(cacheFile)) {
      try {
        const data = fs.readFileSync(cacheFile, 'utf8');
        const cached = JSON.parse(data);
        
        // Check if cache is still valid
        const now = Date.now();
        if (cached.timestamp && (now - cached.timestamp) < maxAge) {
          this.stats.hits++;
          this.saveStats();
          return cached.value;
        }
      } catch (error) {
        logger.warn(`Cache read error for key ${key}: ${error.message}`);
      }
    }
    
    this.stats.misses++;
    this.saveStats();
    return undefined;
  },
  
  /**
   * Store an item in the cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @returns {boolean} Success
   */
  set(key, value) {
    const cacheFile = this.getCacheFilePath(key);
    
    try {
      const cacheData = {
        timestamp: Date.now(),
        value
      };
      
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData));
      this.stats.size++;
      this.saveStats();
      return true;
    } catch (error) {
      logger.error(`Cache write error for key ${key}: ${error.message}`);
      return false;
    }
  },
  
  /**
   * Delete an item from the cache
   * @param {string} key - Cache key
   * @returns {boolean} Success
   */
  delete(key) {
    const cacheFile = this.getCacheFilePath(key);
    
    if (fs.existsSync(cacheFile)) {
      try {
        fs.unlinkSync(cacheFile);
        this.stats.size = Math.max(0, this.stats.size - 1);
        this.saveStats();
        return true;
      } catch (error) {
        logger.error(`Cache delete error for key ${key}: ${error.message}`);
      }
    }
    
    return false;
  },
  
  /**
   * Clear the entire cache
   * @returns {boolean} Success
   */
  clear() {
    const cacheDir = CONFIG.cacheDir;
    
    try {
      const files = fs.readdirSync(cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.cache')) {
          fs.unlinkSync(path.join(cacheDir, file));
        }
      }
      
      this.stats.size = 0;
      this.stats.lastCleanup = Date.now();
      this.saveStats();
      
      logger.info('Cache cleared successfully');
      return true;
    } catch (error) {
      logger.error(`Cache clear error: ${error.message}`);
      return false;
    }
  },
  
  /**
   * Clean up old cache entries
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of entries removed
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const cacheDir = CONFIG.cacheDir;
    let removed = 0;
    
    try {
      const files = fs.readdirSync(cacheDir);
      const now = Date.now();
      
      for (const file of files) {
        if (!file.endsWith('.cache')) continue;
        
        const cacheFile = path.join(cacheDir, file);
        const stats = fs.statSync(cacheFile);
        
        // Remove if older than maxAge
        if ((now - stats.mtime.getTime()) > maxAge) {
          fs.unlinkSync(cacheFile);
          removed++;
        }
      }
      
      this.stats.size = Math.max(0, this.stats.size - removed);
      this.stats.lastCleanup = now;
      this.saveStats();
      
      logger.info(`Cache cleanup removed ${removed} old entries`);
    } catch (error) {
      logger.error(`Cache cleanup error: ${error.message}`);
    }
    
    return removed;
  },
  
  /**
   * Schedule periodic cache cleanup
   */
  scheduleCleanup() {
    // Clean up once per day
    const cleanupInterval = 24 * 60 * 60 * 1000;
    
    // Check if it's been at least a day since last cleanup
    const now = Date.now();
    if ((now - this.stats.lastCleanup) > cleanupInterval) {
      // Run cleanup on next tick to avoid blocking initialization
      process.nextTick(() => {
        this.cleanup();
      });
    }
  },
  
  /**
   * Get cache file path for a key
   * @param {string} key - Cache key
   * @returns {string} Cache file path
   */
  getCacheFilePath(key) {
    // Create a safe filename from the key
    const safeKey = key.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(CONFIG.cacheDir, `${safeKey}-${hash}.cache`);
  },
  
  /**
   * Save cache stats to disk
   */
  saveStats() {
    const statsPath = path.join(CONFIG.cacheDir, 'cache-stats.json');
    
    try {
      fs.writeFileSync(statsPath, JSON.stringify(this.stats));
    } catch (error) {
      logger.warn(`Failed to save cache stats: ${error.message}`);
    }
  },
  
  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
        : 0
    };
  }
};

/**
 * Initialize the improved context manager
 * @param {Object} options - Configuration options
 * @returns {Object} Configuration
 */
function initialize(options = {}) {
  if (!options.embeddingsInterface) {
    throw new Error('improved-context-manager requires embeddingsInterface');
  }
  embeddings = options.embeddingsInterface;
  // Update central configuration first
  if (Object.keys(options).length > 0) {
    configService.updateConfig(options);
  }
  
  // Re-initialize from central config
  CONFIG = {
    ...DEFAULT_CONFIG,
    
    // File paths from central config
    embeddingsFile: options.embeddingsFile || configService.getConfig().paths.embeddings,
    chunksFile: options.chunksFile || configService.getConfig().paths.chunks,
    cacheDir: options.cacheDir || configService.getConfig().paths.cache,
    
    // Chunking settings from central config
    maxChunkSize: configService.getConfig().chunking.maxChunkSize,
    minChunkSize: configService.getConfig().chunking.minChunkSize,
    chunkOverlap: configService.getConfig().chunking.chunkOverlap,
    
    // Embedding settings from central config
    embeddingModel: configService.getConfig().embedding?.model,
    embeddingDimensions: configService.getConfig().embedding?.dimensions,
    
    // Retrieval settings from central config
    maxResults: configService.getConfig().retrieval?.maxResults || DEFAULT_CONFIG.maxResults,
    similarityThreshold: configService.getConfig().retrieval?.similarityThreshold || DEFAULT_CONFIG.similarityThreshold
  };
  
  // Apply any additional options specific to this component
  Object.assign(CONFIG, options);
  
  // Ensure directories exist
  ensureDirectoriesExist();
  
  // Initialize cache manager
  cacheManager.initialize({ cacheDir: CONFIG.cacheDir });
  
  logger.info('Improved context manager initialized with:', {
    embeddingsFile: CONFIG.embeddingsFile,
    chunksFile: CONFIG.chunksFile,
    cacheDir: CONFIG.cacheDir
  });
  
  return CONFIG;
}

/**
 * Ensure required directories exist
 */
function ensureDirectoriesExist() {
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(CONFIG.cacheDir)) {
    try {
      fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
      logger.info(`Created cache directory: ${CONFIG.cacheDir}`);
    } catch (error) {
      logger.error(`Failed to create cache directory: ${error.message}`);
    }
  }
  
  // Create parent directories for embeddings and chunks files if they don't exist
  const embeddingsDir = path.dirname(CONFIG.embeddingsFile);
  if (!fs.existsSync(embeddingsDir)) {
    try {
      fs.mkdirSync(embeddingsDir, { recursive: true });
      logger.info(`Created embeddings directory: ${embeddingsDir}`);
    } catch (error) {
      logger.error(`Failed to create embeddings directory: ${error.message}`);
    }
  }
  
  const chunksDir = path.dirname(CONFIG.chunksFile);
  if (!fs.existsSync(chunksDir)) {
    try {
      fs.mkdirSync(chunksDir, { recursive: true });
      logger.info(`Created chunks directory: ${chunksDir}`);
    } catch (error) {
      logger.error(`Failed to create chunks directory: ${error.message}`);
    }
  }
}

/**
 * Generate embedding for a query string
 * @param {string} query - Query text
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateQueryEmbedding(query) {
  if (!query || typeof query !== 'string') {
    logger.warn(`Invalid query for embedding generation: ${typeof query}`);
    return new Array(CONFIG.embeddingDimensions || 384).fill(0);
  }
  if (!embeddings) {
    throw new Error('improved-context-manager requires embeddingsInterface');
  }
  try {
    const embedding = await embeddings.generate(query);
    if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      return embedding;
    } else {
      logger.warn('Semantic embedding generation returned invalid result, falling back to hash embedding');
      return generateHashEmbedding(query);
    }
  } catch (error) {
    logger.error(`Error generating query embedding: ${error.message}`);
    return generateHashEmbedding(query);
  }
}

/**
 * Generate a simple hash-based embedding for fallback
 * @param {string} text - Input text
 * @returns {number[]} Embedding vector
 */
function generateHashEmbedding(text) {
  const dimensions = CONFIG.embeddingDimensions || 384;
  const embedding = new Array(dimensions).fill(0);
  
  if (!text || typeof text !== 'string') {
    return embedding;
  }
  
  // Create a hash of the text
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  
  // Use the hash to generate a pseudo-random embedding
  for (let i = 0; i < dimensions; i++) {
    const hashPart = hash.substring(i % 32, (i % 32) + 8);
    embedding[i] = parseInt(hashPart, 16) / 0xffffffff * 2 - 1; // Range: [-1, 1]
  }
  
  return embedding;
}

/**
 * Search for context using similarity search
 * @param {string} query - Query text
 * @param {Object} options - Search options
 * @param {AbortSignal} [options.signal] - AbortController signal for timeout control
 * @returns {Promise<Array>} Search results
 */
async function searchContext(query, options = {}) {
  // Check for abort signal before starting
  if (options.signal && options.signal.aborted) {
    const abortError = new Error('Context search aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }
  
  // Ensure embeddings and chunks are loaded before searching
  if (!embeddings || !chunks) {
    logger.info('Embeddings or chunks not loaded, loading now...');
    await Promise.all([
      loadEmbeddings(),
      loadChunks()
    ]);
    
    if (!embeddings || !chunks) {
      logger.error('Failed to load embeddings or chunks');
      return [];
    }
  }
  
  const searchOptions = {
    similarityThreshold: options.similarityThreshold || CONFIG.similarityThreshold,
    maxResults: options.maxResults || CONFIG.maxResults,
    useCache: options.useCache !== false,
    maxCacheAge: options.maxCacheAge || 24 * 60 * 60 * 1000, // 24 hours by default
    signal: options.signal // Pass the abort signal
  };
  
  // Generate cache key
  const cacheKey = `search:${query}:${JSON.stringify(searchOptions)}`;
  
  // Check cache first if enabled
  if (searchOptions.useCache) {
    const cachedResults = cacheManager.get(cacheKey, searchOptions.maxCacheAge);
    if (cachedResults) {
      logger.info(`Using cached search results for query: "${query}"`);
      return cachedResults;
    }
  }
  
  try {
    // Make sure embeddings and chunks are loaded
    if (!embeddings || embeddings.length === 0) {
      try {
        logger.info('Loading embeddings for search...');
        embeddings = await module.exports.loadEmbeddings();
      } catch (error) {
        logger.error(`Failed to load embeddings: ${error.message}`);
        embeddings = [];
      }
    }
    
    if (!chunks || chunks.length === 0) {
      try {
        logger.info('Loading chunks for search...');
        chunks = await module.exports.loadChunks();
      } catch (error) {
        logger.error(`Failed to load chunks: ${error.message}`);
        chunks = [];
      }
    }
    
    // Check for abort signal before generating embedding
    if (options.signal && options.signal.aborted) {
      const abortError = new Error('Context search aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    
    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // Check for abort signal before calculating similarities
    if (options.signal && options.signal.aborted) {
      const abortError = new Error('Context search aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    
    // Calculate similarities
    const similarities = [];
    
    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i];
      
      // Skip invalid embeddings
      if (!embedding || !embedding.vector || embedding.vector.length === 0) {
        continue;
      }
      
      // Calculate similarity using cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, embedding.vector);
      
      // Add to results if above threshold
      if (similarity >= searchOptions.similarityThreshold) {
        similarities.push({
          id: embedding.id,
          similarity
        });
      }
    }
    
    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Limit results
    const topResults = similarities.slice(0, searchOptions.maxResults);
    
    // Map to chunks
    const results = [];
    
    for (const result of topResults) {
      // Find matching chunk
      const chunk = chunks.find(c => c.id === result.id);
      
      if (chunk) {
        results.push({
          id: chunk.id,
          content: chunk.content,
          path: chunk.path,
          line: chunk.line,
          similarity: result.similarity,
          type: chunk.type || 'unknown'
        });
      }
    }
    
    // If no results with vector similarity, try with lower threshold
    if (results.length === 0) {
      logger.info('No results found, trying with lower threshold: 0.10');
      
      // Try with lower threshold
      const lowerThreshold = 0.10;
      const lowerResults = [];
      
      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i];
        
        if (!embedding || !embedding.vector || embedding.vector.length === 0) {
          continue;
        }
        
        const similarity = cosineSimilarity(queryEmbedding, embedding.vector);
        
        if (similarity >= lowerThreshold) {
          lowerResults.push({
            id: embedding.id,
            similarity
          });
        }
      }
      
      // Sort and limit
      lowerResults.sort((a, b) => b.similarity - a.similarity);
      const topLowerResults = lowerResults.slice(0, searchOptions.maxResults);
      
      logger.info(`Found ${topLowerResults.length} results with lower threshold ${lowerThreshold.toFixed(2)}`);
      
      // Map to chunks
      for (const result of topLowerResults) {
        const chunk = chunks.find(c => c.id === result.id);
        
        if (chunk) {
          results.push({
            id: chunk.id,
            content: chunk.content,
            path: chunk.path,
            line: chunk.line,
            similarity: result.similarity,
            type: chunk.type || 'unknown'
          });
        }
      }
    }
    
    // If still no results, try keyword matching
    if (results.length === 0) {
      logger.info('No results found with vector similarity, trying keyword matching');
      
      const keywordResults = performKeywordSearch(query, chunks, searchOptions.maxResults);
      results.push(...keywordResults);
      
      logger.info(`Found ${keywordResults.length} results with keyword matching`);
    }
    
    // Cache results if enabled
    if (searchOptions.useCache) {
      cacheManager.set(cacheKey, results);
    }
    
    return results;
  } catch (error) {
    logger.error(`Error searching context: ${error.message}`);
    return [];
  }
}

/**
 * Perform keyword-based search as fallback
 * @param {string} query - Query text
 * @param {Array} chunks - Array of chunks
 * @param {number} maxResults - Maximum number of results
 * @returns {Array} Search results
 */
function performKeywordSearch(query, chunks, maxResults) {
  const keywords = query.toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 2)
    .filter(word => !['the', 'and', 'for', 'with'].includes(word));
  
  if (keywords.length === 0) return [];
  
  const results = [];
  
  for (const chunk of chunks) {
    const content = (chunk.content || '').toLowerCase();
    let matchScore = 0;
    
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        // Count occurrences
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = content.match(regex);
        matchScore += matches ? matches.length : 0;
      }
    }
    
    if (matchScore > 0) {
      results.push({
        id: chunk.id,
        content: chunk.content,
        path: chunk.path,
        line: chunk.line,
        similarity: matchScore / keywords.length,
        type: chunk.type || 'unknown'
      });
    }
  }
  
  // Sort by match score (highest first)
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Limit results
  return results.slice(0, maxResults);
}

// ... rest of the code remains the same ...

// Export public API
module.exports = {
  initialize,
  searchContext,
  performKeywordSearch,
  loadEmbeddings: async function() {
    try {
      if (!fs.existsSync(CONFIG.embeddingsFile)) {
        logger.error(`Embeddings file does not exist: ${CONFIG.embeddingsFile}`);
        return [];
      }
      
      logger.info(`Loading embeddings from ${CONFIG.embeddingsFile}`);
      const loadedEmbeddings = readJsonlFile(CONFIG.embeddingsFile);
      
      if (!loadedEmbeddings || loadedEmbeddings.length === 0) {
        logger.error('No embeddings found in file');
        return [];
      }
      
      embeddings = loadedEmbeddings;
      logger.info(`Successfully loaded ${embeddings.length} embeddings`);
      return embeddings;
    } catch (error) {
      logger.error(`Failed to load embeddings: ${error.message}`);
      return [];
    }
  },
  loadChunks: async function() {
    try {
      if (!fs.existsSync(CONFIG.chunksFile)) {
        logger.error(`Chunks file does not exist: ${CONFIG.chunksFile}`);
        return [];
      }
      
      logger.info(`Loading chunks from ${CONFIG.chunksFile}`);
      const loadedChunks = readJsonlFile(CONFIG.chunksFile);
      
      if (!loadedChunks || loadedChunks.length === 0) {
        logger.error('No chunks found in file');
        return [];
      }
      
      chunks = loadedChunks;
      logger.info(`Successfully loaded ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      logger.error(`Failed to load chunks: ${error.message}`);
      return [];
    }
  },
  /**
   * Format enhanced prompt with context results
   * @param {string} query - User query
   * @param {Array} contextResults - Context search results
   * @returns {string} Formatted enhanced prompt
   */
  formatEnhancedPrompt: function(query, contextResults) {
    try {
      // Generate prompt based on context
      let promptTemplate = '';
      
      // Add header for code context section
      promptTemplate += '## Code Context\n\nThe following code snippets are relevant to your query:\n\n';
      
      // Add context
      if (contextResults && contextResults.length > 0) {
        // Group results by file type and component
        const codeSnippets = contextResults.filter(item => item.type === 'code');
        const docSnippets = contextResults.filter(item => item.type === 'documentation');
        const adapterSnippets = contextResults.filter(item => item.path && item.path.includes('/adapters/'));
        const serviceSnippets = contextResults.filter(item => item.path && item.path.includes('/services/') && !codeSnippets.includes(item));
        const otherSnippets = contextResults.filter(item => 
          !item.type || 
          (item.type !== 'code' && item.type !== 'documentation' && 
           !adapterSnippets.includes(item) && !serviceSnippets.includes(item)));
        
        // Add adapter snippets first (they're often most relevant for component questions)
        if (adapterSnippets.length > 0) {
          promptTemplate += '\n### Adapter Components\n';
          for (const item of adapterSnippets) {
            const fileName = item.path ? item.path.split('/').pop() : 'Unknown';
            const componentName = fileName.replace('.js', '');
            promptTemplate += `\n#### ${componentName}\n`;
            promptTemplate += `File: ${item.path}\n\n\`\`\`javascript\n`;
            promptTemplate += item.content || '';
            if (!item.content?.endsWith('\n')) promptTemplate += '\n';
            promptTemplate += '\`\`\`\n';
          }
        }
        
        // Add service snippets next
        if (serviceSnippets.length > 0) {
          promptTemplate += '\n### Service Components\n';
          for (const item of serviceSnippets) {
            const fileName = item.path ? item.path.split('/').pop() : 'Unknown';
            const componentName = fileName.replace('.js', '');
            promptTemplate += `\n#### ${componentName}\n`;
            promptTemplate += `File: ${item.path}\n\n\`\`\`javascript\n`;
            promptTemplate += item.content || '';
            if (!item.content?.endsWith('\n')) promptTemplate += '\n';
            promptTemplate += '\`\`\`\n';
          }
        }
        
        // Add remaining code snippets
        if (codeSnippets.length > 0 && codeSnippets.some(item => !adapterSnippets.includes(item) && !serviceSnippets.includes(item))) {
          promptTemplate += '\n### Other Code\n';
          for (const item of codeSnippets) {
            if (adapterSnippets.includes(item) || serviceSnippets.includes(item)) continue;
            
            const fileName = item.path ? item.path.split('/').pop() : 'Unknown';
            promptTemplate += `\n#### From ${fileName}\n\`\`\`javascript\n`;
            promptTemplate += item.content || '';
            if (!item.content?.endsWith('\n')) promptTemplate += '\n';
            promptTemplate += '\`\`\`\n';
          }
        }
        
        // Add documentation snippets
        if (docSnippets.length > 0) {
          promptTemplate += '\n### Documentation\n';
          for (const item of docSnippets) {
            const fileName = item.path ? item.path.split('/').pop() : 'Unknown';
            promptTemplate += `\n#### ${fileName}\n`;
            promptTemplate += item.content || '';
            promptTemplate += '\n';
          }
        }
        
        // Add other snippets
        if (otherSnippets.length > 0) {
          promptTemplate += '\n### Other Relevant Content\n';
          for (const item of otherSnippets) {
            const fileName = item.path ? item.path.split('/').pop() : 'Unknown';
            promptTemplate += `\n#### ${fileName}\n`;
            promptTemplate += item.content || '';
            promptTemplate += '\n';
          }
        }
        
        // Add component relationships if the query is about relationships
        if (query.toLowerCase().includes('relationship') || 
            query.toLowerCase().includes('connection') || 
            query.toLowerCase().includes('between')) {
          promptTemplate += '\n### Component Relationships\n';
          promptTemplate += 'The Leo architecture follows a standardized pattern where:\n\n';
          promptTemplate += '- Services provide core functionality (e.g., enhanced-context-retrieval.js)\n';
          promptTemplate += '- Adapters provide standardized interfaces to services (e.g., conversation-chunker-adapter.js)\n';
          promptTemplate += '- Components communicate through the event bus and standardized interfaces\n';
          promptTemplate += '- The adaptive context selector integrates with the enhanced context retrieval service\n';
          promptTemplate += '  to provide optimized context selection based on query analysis\n';
        }
      } else {
        promptTemplate += 'No relevant code context found.';
      }
      
      return promptTemplate;
    } catch (error) {
      logger.error(`Failed to format enhanced prompt: ${error.message}`);
      return 'Error formatting context.';
    }
  },
  
  /**
   * Generate enhanced prompt with context for a query
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @param {AbortSignal} [options.signal] - AbortController signal for timeout control
   * @returns {Promise<string>} Enhanced prompt
   */
  generateEnhancedPrompt: async function(query, options = {}) {
    try {
      // Check for abort signal before starting
      if (options.signal && options.signal.aborted) {
        const abortError = new Error('Enhanced prompt generation aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }
      
      // Set better defaults for context retrieval
      const searchOptions = {
        maxResults: options.maxResults || 8,
        similarityThreshold: options.similarityThreshold || 0.15,
        signal: options.signal // Pass the abort signal to searchContext
      };
      
      // Get context for query
      const context = await this.searchContext(query, searchOptions);
      
      // Check for abort signal after search but before formatting
      if (options.signal && options.signal.aborted) {
        const abortError = new Error('Enhanced prompt generation aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }
      
      // Format the context using the improved formatter
      const formattedContext = this.formatEnhancedPrompt(query, context);
      
      // Log the results
      logger.info(`Generated enhanced prompt with ${context.length} context items`);
      
      return formattedContext;
    } catch (error) {
      // If this is an abort error, propagate it
      if (error.name === 'AbortError') {
        throw error;
      }
      
      logger.error(`Failed to generate enhanced prompt: ${error.message}`);
      
      // Return a basic prompt if context retrieval fails
      return `## Code Context\nError retrieving context: ${error.message}`;
    }
  },
  cacheManager
};
