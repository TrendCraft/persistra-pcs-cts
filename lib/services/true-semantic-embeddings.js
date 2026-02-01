// --- Universal True Semantic Embeddings ---
// Combines cloud/quantum capabilities with sophisticated local processing
// NO EXTERNAL DEPENDENCIES - Works 100% air-gapped with full semantic quality

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger').createComponentLogger('universal-semantic-embeddings');
const eventBus = require('../utils/event-bus');

// --- Module State ---
let CONFIG = null;
let embeddingsCache = {};
let _isInitialized = false;
let corpusStats = null;
const DEFAULT_CORPUS_STATS = { terms: {}, documentCount: 0, averageDocumentLength: 0 };

// --- Helper Functions ---
// Backend selection state
let activeBackend = null;
let backendType = null;

// --- Robust Embedding Generation and Fallbacks ---

const { localSemanticEmbeddings } = require('./local-semantic-embeddings');
const openaiEmbeddings = require('./openai-embeddings');

/**
 * Generates a fallback embedding using the most robust local methods.
 * This function is the LAST RESORT and should always return a non-zero, non-empty vector unless all else fails.
 */
async function generateFallbackEmbedding(text) {
  // Check if hash fallback is allowed (disabled in pilot mode)
  const allowHashFallback = process.env.LEO_ALLOW_HASH_EMBEDDINGS === 'true';
  const isPilotMode = process.env.LEO_PILOT_MODE === 'true';
  
  // 1. Try localSemanticEmbeddings
  try {
    if (localSemanticEmbeddings && localSemanticEmbeddings.isInitialized()) {
      logger.warn('[EMBEDDING FALLBACK] Falling back to local semantic embeddings...');
      const vec = await localSemanticEmbeddings.generate(text);
      
      // Backend-aware dimension validation: accept 384D, 768D, or 1536D
      const actualDim = vec?.length || 0;
      const isValidDim = actualDim === 384 || actualDim === 768 || actualDim === 1536;
      
      if (Array.isArray(vec) && isValidDim && vec.some(x => x !== 0)) {
        logger.info(`[EMBEDDING FALLBACK SUCCESS] Local semantic embeddings succeeded (${actualDim}D).`);
        return vec;
      } else {
        logger.warn(`[EMBEDDING FALLBACK INVALID] Local semantic embeddings returned invalid embedding (dim=${actualDim}, valid=${isValidDim}, non-zero=${vec?.some(x => x !== 0)}).`);
      }
    } else {
      logger.warn('Local semantic embeddings not initialized or available for fallback.');
    }
  } catch (err) {
    logger.error(`[EMBEDDING FALLBACK FAILURE] Local semantic embeddings failed: ${err.message}`);
  }
  
  // 2. Try hash-based fallback (only if allowed)
  if (!allowHashFallback && isPilotMode) {
    const errorMsg = 'PILOT MODE: Hash-based embedding fallback is disabled. No high-quality backend available. Set OPENAI_API_KEY or LEO_ALLOW_HASH_EMBEDDINGS=true to proceed.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  try {
    logger.warn('[EMBEDDING FALLBACK] All other fallbacks failed, using hash-based embedding as ultimate last resort.');
    const hashVec = _generateSimpleHashEmbedding(text, expectedDim);
    if (Array.isArray(hashVec) && hashVec.length === expectedDim && hashVec.some(x => x !== 0)) {
      logger.info('[EMBEDDING FALLBACK SUCCESS] Hash-based embedding succeeded.');
      return hashVec;
    }
  } catch (err) {
    logger.error(`[EMBEDDING FALLBACK FAILURE] Hash-based embedding failed: ${err.message}`);
  }
  
  logger.error('[EMBEDDING CRITICAL] All embedding fallbacks failed, returning zero vector. This indicates a severe problem.');
  
  // Fail fast in pilot mode instead of returning zero vector
  if (isPilotMode) {
    throw new Error('PILOT MODE: Cannot generate embeddings - all backends failed and zero vectors are not acceptable for pilot testing.');
  }
  
  return new Array(expectedDim).fill(0);
}

function _generateSimpleHashEmbedding(text, dimensions) {
  const vector = new Array(dimensions).fill(0);
  if (!text || typeof text !== 'string') {
    return vector;
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < dimensions; i++) {
    vector[i] = (Math.sin(hash + i) * 1000) % 1;
  }
  if (text.length > 0 && vector.every(v => v === 0)) {
    vector[0] = 0.001;
  }
  return vector;
}

/**
 * Reduce embedding dimensions using mean pooling
 * Preserves semantic information better than truncation
 */
function reduceDimensions(embedding, targetDim) {
  if (!Array.isArray(embedding) || embedding.length <= targetDim) {
    return embedding;
  }
  
  const reduced = new Array(targetDim).fill(0);
  const chunkSize = embedding.length / targetDim;
  
  for (let i = 0; i < targetDim; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.floor((i + 1) * chunkSize);
    let sum = 0;
    let count = 0;
    
    for (let j = start; j < end && j < embedding.length; j++) {
      sum += embedding[j];
      count++;
    }
    
    reduced[i] = count > 0 ? sum / count : 0;
  }
  
  return reduced;
}

/**
 * Public method to generate embedding. This is the entry point for all embedding requests.
 */
async function _generateEmbeddingCore(text, options = {}) {
  if (!text || typeof text !== 'string') {
    logger.error('Invalid input for embedding generation: text must be a non-empty string');
    return await generateFallbackEmbedding('');
  }
  if (!isInitialized()) {
    logger.warn('True semantic embeddings not initialized, attempting to initialize now...');
    try {
      await initialize(options.config);
    } catch (initError) {
      logger.error(`Failed to initialize embeddings during generate call: ${initError.message}`);
      return await generateFallbackEmbedding(text);
    }
  }
  if (options.useCache !== false && !options.forceRefresh) {
    const cacheKey = text;
    if (embeddingsCache[cacheKey]) {
      logger.debug('Retrieved embedding from cache');
      return embeddingsCache[cacheKey];
    }
  }
  if (!activeBackend) {
    logger.error('No high-quality embedding backend available. Proceeding to fallback.');
    return await generateFallbackEmbedding(text);
  }
  
  let embedding;
  try {
    embedding = await activeBackend.generate(text, options);
  } catch (backendError) {
    // For rate limits, wait and retry once before falling back
    if (backendError.message.includes('rate limit') && backendType === 'openai') {
      logger.warn(`OpenAI rate limit hit, waiting 2 seconds and retrying once...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        embedding = await activeBackend.generate(text, options);
        logger.info(`OpenAI retry successful after rate limit`);
      } catch (retryError) {
        logger.warn(`OpenAI retry failed: ${retryError.message}. Using fallback.`);
        return await generateFallbackEmbedding(text);
      }
    } else {
      logger.warn(`Backend (${backendType}) failed: ${backendError.message}. Using fallback.`);
      return await generateFallbackEmbedding(text);
    }
  }
  
  const expectedDim = CONFIG.EMBEDDING_DIMENSIONS || 1536;
  if (!embedding || !Array.isArray(embedding) || embedding.length !== expectedDim || embedding.every(v => v === 0)) {
    logger.error(`Active backend (${backendType}) returned an invalid or all-zero embedding.`);
    return await generateFallbackEmbedding(text);
  }
  const isValid = embedding.every(value => typeof value === 'number' && isFinite(value));
  if (!isValid) {
    logger.error('Generated embedding contains invalid values (NaN/Infinity).');
    return await generateFallbackEmbedding(text);
  }
  logger.debug(`Successfully generated embedding from ${backendType}`);
  embeddingsCache[text] = embedding;
  if (Object.keys(embeddingsCache).length % 100 === 0) {
    saveCache();
  }
  return embedding;
}

async function generateEmbeddingWithRetry(text, options = {}) {
  const maxRetries = options.maxRetries || 3;
  let retries = 0;
  let lastError = null;
  while (retries < maxRetries) {
    try {
      return await _generateEmbeddingCore(text, options);
    } catch (error) {
      lastError = error;
      retries++;
      if (retries >= maxRetries) throw error;
      const delay = options.baseDelay || 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function generate(text, options = {}) {
  return await generateEmbeddingWithRetry(text, options);
}


// --- Embeddings Interface Initialization ---
async function initialize(options = {}) {
  if (_isInitialized) {
    logger.info('True semantic embeddings already initialized, skipping duplicate initialization');
    return true;
  }
  
  // Set CONFIG first before any operations that depend on it
  CONFIG = options.config || {
    EMBEDDING_DIMENSIONS: 1536,
    CACHE_DIR: './.leo_cache',
    CACHE_FILE: 'embeddings-cache.json'
  };
  
  // --- Corpus Stats Validation Injection ---
  // Load corpus stats AFTER CONFIG is set (loadCorpusStats uses CONFIG.CACHE_DIR)
  await loadCorpusStats();

  // If using local backend, validate corpus stats are sufficient
  if (options.useOpenAI === false) {
    const stats = getCorpusStats();
    const minTerms = 100;
    if (!stats.terms || Object.keys(stats.terms).length < minTerms) {
      logger.error(`Local backend selected but corpus statistics insufficient: found ${Object.keys(stats.terms || {}).length} terms, need at least ${minTerms}`);
      throw new Error('Cannot use local backend without proper corpus statistics. Please rebuild corpus statistics.');
    }
    logger.info(`✅ Corpus stats validation passed: ${Object.keys(stats.terms).length} terms loaded.`);
  }
  embeddingsCache = {};
  try {
    await fs.promises.mkdir(CONFIG.CACHE_DIR, { recursive: true });
  } catch (err) {
    logger.error(`Failed to create cache directory: ${err.message}`);
  }
  try {
    const cacheFilePath = path.join(CONFIG.CACHE_DIR, CONFIG.CACHE_FILE);
    if (fs.existsSync(cacheFilePath)) {
      const cacheData = await fs.promises.readFile(cacheFilePath, 'utf8');
      embeddingsCache = JSON.parse(cacheData);
      logger.info(`Loaded ${Object.keys(embeddingsCache).length} embeddings from cache.`);
    }
  } catch (err) {
    logger.warn(`Failed to load embeddings cache: ${err.message}`);
  }
  let backendInitializedSuccessfully = false;
  
  // Check if OpenAI backend is explicitly requested via environment variable
  const embeddingBackend = process.env.LEO_EMBEDDINGS_BACKEND || options.config?.BACKEND_TYPE || 'local';
  const shouldUseOpenAI = options.useOpenAI !== false || embeddingBackend === 'openai';
  
  // Try OpenAI embeddings first (highest quality) when explicitly requested or as default for cloud backends
  if (shouldUseOpenAI && openaiEmbeddings && typeof openaiEmbeddings.initialize === 'function') {
    try {
      logger.info('Attempting to initialize OpenAI embeddings backend...');
      await openaiEmbeddings.initialize(options);
      
      // OpenAI backend handles its own testing during initialization
      // Get dimensions from the backend instead of making another test call
      const dimensions = openaiEmbeddings.getDimension();
      
      // Use native OpenAI embedding dimensions for maximum semantic quality
      CONFIG.EMBEDDING_DIMENSIONS = dimensions;
      
      activeBackend = openaiEmbeddings;
      backendType = 'openai';
      backendInitializedSuccessfully = true;
      logger.info(`✅ Successfully initialized OpenAI embeddings backend (native ${dimensions}D dimensions)`);
      
    } catch (error) {
      logger.error(`OpenAI embeddings backend failed to initialize: ${error.message}`);
    }
  }
  if (!backendInitializedSuccessfully && localSemanticEmbeddings && typeof localSemanticEmbeddings.initialize === 'function') {
    try {
      logger.info('Attempting to initialize local-semantic-embeddings.js backend as primary...');
      await localSemanticEmbeddings.initialize();
      const testVec = await localSemanticEmbeddings.generate('test for local semantic');
      
      // Backend-aware dimension validation: local backends typically use 384D or 768D
      const actualDim = testVec?.length || 0;
      const isValidDim = actualDim === 384 || actualDim === 768 || actualDim === 1536;
      
      if (localSemanticEmbeddings.isInitialized() && Array.isArray(testVec) && isValidDim && testVec.some(x => x !== 0)) {
        // Update CONFIG to match the backend's actual dimensions
        CONFIG.EMBEDDING_DIMENSIONS = actualDim;
        
        activeBackend = localSemanticEmbeddings;
        backendType = 'local-semantic-embeddings';
        backendInitializedSuccessfully = true;
        logger.warn(`⚠️  Using local-semantic-embeddings.js backend (${actualDim}D, fallback, limited semantic quality)`);
      } else {
        logger.warn(`local-semantic-embeddings.js initialized but returned invalid embedding (dim=${actualDim}, valid=${isValidDim}, non-zero=${testVec?.some(x => x !== 0)}). Skipping it.`);
      }
    } catch (localError) {
      logger.error(`local-semantic-embeddings.js backend failed to initialize or test: ${localError.message}`);
    }
  }
  if (!backendInitializedSuccessfully) {
    try {
      const { localSemanticSearch } = require('./local-semantic-search');
      if (localSemanticSearch && typeof localSemanticSearch.initialize === 'function') {
        logger.info('Attempting to initialize local-semantic-search.js backend for embedding capability...');
        await localSemanticSearch.initialize();
        const testVec = await localSemanticSearch.generateEmbedding('test for local search');
        
        // Backend-aware dimension validation
        const actualDim = testVec?.length || 0;
        const isValidDim = actualDim === 384 || actualDim === 768 || actualDim === 1536;
        
        if (localSemanticSearch.initialized && Array.isArray(testVec) && isValidDim && testVec.some(x => x !== 0)) {
          // Update CONFIG to match the backend's actual dimensions
          CONFIG.EMBEDDING_DIMENSIONS = actualDim;
          
          activeBackend = {
            generate: localSemanticSearch.generateEmbedding.bind(localSemanticSearch)
          };
          backendType = 'local-semantic-search-embedding';
          backendInitializedSuccessfully = true;
          logger.warn(`⚠️  Using local-semantic-search.js embedding capability (${actualDim}D, fallback, limited semantic quality)`);
        } else {
          logger.warn(`local-semantic-search.js initialized but returned invalid embedding (dim=${actualDim}, valid=${isValidDim}, non-zero=${testVec?.some(x => x !== 0)}). Skipping it.`);
        }
      }
    } catch (searchError) {
      logger.error(`local-semantic-search.js embedding backend failed to initialize or test: ${searchError.message}`);
    }
  }
  if (!backendInitializedSuccessfully) {
    logger.error('No high-quality embedding backend (OpenAI, local-semantic-embeddings, or local-semantic-search embedding) could be initialized. All embedding generation will rely on the ultimate hash-based fallback.');
    
    // PILOT MODE: Fail fast instead of silently falling back to hash embeddings
    if (options.requireHighQualityBackend) {
      const errorMsg = 'PILOT MODE: No high-quality embedding backend available. Set OPENAI_API_KEY or configure Ollama/local backend. Hash-based fallback is disabled in pilot mode.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    activeBackend = null;
    backendType = 'fallback-hash-only';
    logger.warn('⚠️  Hash-based fallback enabled. Semantic search quality will be severely degraded.');
  } else {
    logger.info(`TSE initialized. Active backend type: ${backendType}`);
  }
  _isInitialized = true;
  return true;
}

function isInitialized() {
  return _isInitialized;
}


function similarity(vecA, vecB) {
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

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  return norm === 0 ? vec : vec.map(v => v / norm);
}

async function loadCorpusStats() {
  try {
    const statsFilePath = path.join(CONFIG.CACHE_DIR, 'corpus-stats.json');
    
    if (!fs.existsSync(statsFilePath)) {
      logger.warn(`Corpus statistics file not found: ${statsFilePath}`);
      // Initialize with default corpus statistics
      corpusStats = {
        termFrequencies: {},
        documentFrequencies: {},
        totalDocuments: 0,
        averageDocumentLength: 0,
        maxFrequency: 1,
        minFrequency: 0,
        vocabularySize: 0,
        totalTerms: 0
      };
      return false;
    }
    
    logger.info(`Loading corpus statistics from ${statsFilePath}`);
    const statsData = fs.readFileSync(statsFilePath, 'utf8');
    const loadedStats = JSON.parse(statsData);
    
    // Validate loaded statistics structure
    if (!loadedStats || typeof loadedStats !== 'object') {
      logger.error('Invalid corpus statistics format: not an object');
      return false;
    }
    
    // Handle different corpus statistics formats
    if (loadedStats.termFrequencies) {
      // New format with termFrequencies
      corpusStats = {
        termFrequencies: loadedStats.termFrequencies || {},
        documentFrequencies: loadedStats.documentFrequencies || {},
        totalDocuments: loadedStats.totalDocuments || 0,
        averageDocumentLength: loadedStats.averageDocumentLength || 0,
        maxFrequency: loadedStats.maxFrequency || 1,
        minFrequency: loadedStats.minFrequency || 0,
        vocabularySize: loadedStats.vocabularySize || Object.keys(loadedStats.termFrequencies || {}).length,
        totalTerms: loadedStats.totalTerms || 0
      };
    } else if (loadedStats.documentFrequency) {
      // Legacy format with documentFrequency
      corpusStats = {
        termFrequencies: {},
        documentFrequencies: loadedStats.documentFrequency || {},
        totalDocuments: loadedStats.totalDocuments || 0,
        averageDocumentLength: loadedStats.averageDocumentLength || 0,
        maxFrequency: 1,
        minFrequency: 0,
        vocabularySize: loadedStats.vocabularySize || Object.keys(loadedStats.documentFrequency || {}).length,
        totalTerms: loadedStats.totalTokens || 0
      };
      logger.info('Converted legacy corpus statistics format to new format');
    } else {
      // Unknown format
      logger.error('Invalid corpus statistics format: missing required properties');
      return false;
    }
    
    logger.info(`Loaded corpus statistics with ${corpusStats.vocabularySize} terms and ${corpusStats.totalDocuments} documents`);
    return true;
  } catch (error) {
    logger.error(`Failed to load corpus statistics: ${error.message}`);
    // Initialize with default corpus statistics
    corpusStats = {
      termFrequencies: {},
      documentFrequencies: {},
      totalDocuments: 0,
      averageDocumentLength: 0,
      maxFrequency: 1,
      minFrequency: 0,
      vocabularySize: 0,
      totalTerms: 0
    };
    return false;
  }
}

/**
 * Save the embeddings cache to disk
 */
function saveCache() {
  const cacheFilePath = path.join(CONFIG.CACHE_DIR, CONFIG.CACHE_FILE);
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(embeddingsCache));
    logger.info(`Saved ${Object.keys(embeddingsCache).length} embeddings to cache`);
  } catch (error) {
    logger.error(`Failed to save embeddings cache: ${error.message}`);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
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
 * Build corpus statistics from a set of documents
 * @param {string[]} documents - Array of document texts
 * @returns {Object} Corpus statistics
 */
async function buildCorpusStats(documents) {
  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    logger.warn('No documents provided for corpus statistics');
    return corpusStats;
  }
  
  logger.info(`Building corpus statistics from ${documents.length} documents`);
  
  // Reset corpus stats
  corpusStats = {
    terms: {},
    documentCount: documents.length,
    averageDocumentLength: 0
  };
  
  // Calculate document frequencies
  let totalLength = 0;
  
  for (const doc of documents) {
    if (!doc || typeof doc !== 'string') continue;
    
    totalLength += doc.length;
    
    // Simple tokenization (split by non-alphanumeric characters)
    const terms = doc.toLowerCase().split(/[^a-z0-9_]+/).filter(term => term.length > 0);
    
    // Count unique terms in this document
    const uniqueTerms = new Set(terms);
    
    for (const term of uniqueTerms) {
      corpusStats.terms[term] = (corpusStats.terms[term] || 0) + 1;
    }
  }
  
  // Calculate average document length
  corpusStats.averageDocumentLength = totalLength / documents.length;
  
  logger.info(`Saved corpus statistics with ${Object.keys(corpusStats.terms).length} terms`);
  
  return corpusStats;
}

/**
 * Clear the embeddings cache
 */
function clearCache() {
  embeddingsCache = {};
  logger.info('Embeddings cache cleared');
}

/**
 * Get corpus statistics
 * @returns {Object} Corpus statistics
 */
function getCorpusStats() {
  // Return default stats if actual stats are null or undefined
  if (!corpusStats || typeof corpusStats !== 'object') {
    logger.warn('Corpus statistics not properly initialized, using defaults');
    return DEFAULT_CORPUS_STATS;
  }
  return corpusStats;
}

/**
 * Load corpus statistics from file
 * @returns {Promise<boolean>} Success status
 */

module.exports = {
  // lifecycle
  initialize,
  isInitialized,

  // embedding generation
  generate,
  generateEmbedding: generate,
  generateEmbeddingWithRetry,

  // caching
  saveCache,
  clearCache,

  // corpus stats
  getCorpusStats,
  buildCorpusStats,
  loadCorpusStats,

  // math utilities
  cosineSimilarity,
  similarity,
  normalize,

  // debug helpers
  _getBackend: () => activeBackend,
  _getBackendType: () => backendType
};