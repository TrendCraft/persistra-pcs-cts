/**
 * OpenAI Embeddings Backend for TSE
 * 
 * High-quality transformer embeddings using OpenAI's embeddings API
 * Replaces the Ollama-based transformer backend for production use
 */

const axios = require('axios');
const logger = require('../utils/logger').createComponentLogger('openai-embeddings');

// Configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const PREFERRED_MODELS = [
  'text-embedding-3-small',    // Latest, high quality, lower cost
  'text-embedding-3-large',    // Highest quality
  'text-embedding-ada-002'     // Legacy but reliable
];

let _initialized = false;
let selectedModel = null;
let apiKey = null;
let embeddingDimension = null;

/**
 * Initialize OpenAI embeddings backend
 */
async function initialize(options = {}) {
  if (_initialized) {
    return true;
  }
  
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    
    apiKey = process.env.OPENAI_API_KEY;
    
    // Select model (prefer latest/best)
    selectedModel = options.model || PREFERRED_MODELS[0];
    
    // Skip test if explicitly requested (for rate limit handling)
    if (options.skipTest) {
      // Use default dimension for the model
      embeddingDimension = selectedModel === 'text-embedding-3-large' ? 3072 : 1536;
      _initialized = true;
      logger.info(`OpenAI embeddings initialized (test skipped) with model: ${selectedModel} (${embeddingDimension}D)`);
      return true;
    }
    
    // Test the API connection and model with retry for rate limits
    logger.info(`Testing OpenAI embeddings with model: ${selectedModel}`);
    try {
      const testEmbedding = await generateEmbeddingWithRetry('test connection', 2);
      
      if (!testEmbedding || testEmbedding.length === 0) {
        throw new Error('OpenAI API test failed: received empty embedding');
      }
      
      // Store the embedding dimension for this model
      embeddingDimension = testEmbedding.length;
      
    } catch (testError) {
      if (testError.message.includes('rate limit')) {
        logger.warn('Rate limit during initialization test, proceeding with default dimensions');
        // Use default dimension for the model
        embeddingDimension = selectedModel === 'text-embedding-3-large' ? 3072 : 1536;
      } else {
        throw testError;
      }
    }
    
    _initialized = true;
    logger.info(`OpenAI embeddings initialized successfully with model: ${selectedModel} (${embeddingDimension}D)`);
    return true;
    
  } catch (error) {
    logger.error(`Failed to initialize OpenAI embeddings: ${error.message}`);
    throw error;
  }
}

/**
 * Generate embedding using OpenAI API
 */
async function generate(text, options = {}) {
  if (!_initialized) {
    throw new Error('OpenAI embeddings not initialized');
  }
  
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Invalid input: text must be a non-empty string');
  }
  
  return await generateEmbeddingWithRetry(text, 3, options);
}

/**
 * Generate embedding with retry for rate limits
 */
async function generateEmbeddingWithRetry(text, maxRetries = 3, options = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateEmbedding(text, options);
    } catch (error) {
      if (error.message.includes('rate limit') && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Core embedding generation function
 */
async function generateEmbedding(text, options = {}) {
  try {
    const model = options.model || selectedModel;
    
    const response = await axios.post(OPENAI_API_URL, {
      input: text,
      model: model,
      encoding_format: 'float'
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    if (!response.data || !response.data.data || !response.data.data[0]) {
      throw new Error('Invalid response format from OpenAI API');
    }
    
    const embedding = response.data.data[0].embedding;
    
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('OpenAI API returned invalid embedding format');
    }
    
    // Validate embedding quality
    const nonZeroCount = embedding.filter(x => x !== 0).length;
    if (nonZeroCount === 0) {
      throw new Error('OpenAI API returned all-zero embedding');
    }
    
    logger.debug(`Generated OpenAI embedding: ${embedding.length}D, ${nonZeroCount} non-zero values`);
    
    return embedding;
    
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.response.statusText;
      
      if (status === 401) {
        throw new Error('OpenAI API authentication failed. Check your API key.');
      } else if (status === 429) {
        throw new Error('OpenAI API rate limit exceeded. Please try again later.');
      } else if (status === 400) {
        throw new Error(`OpenAI API request error: ${message}`);
      } else {
        throw new Error(`OpenAI API error (${status}): ${message}`);
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('Cannot connect to OpenAI API. Check your internet connection.');
    } else {
      throw new Error(`OpenAI embeddings error: ${error.message}`);
    }
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    throw new Error('Invalid vectors for similarity calculation');
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
 * Normalize a vector to unit length
 */
function normalizeVector(vec) {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return norm === 0 ? vec : vec.map(val => val / norm);
}

/**
 * Get backend information
 */
function getBackendInfo() {
  return {
    name: 'openai-embeddings',
    model: selectedModel,
    initialized: _initialized,
    apiUrl: OPENAI_API_URL
  };
}

/**
 * Get embedding dimension for current model
 */
function getDimension() {
  if (!_initialized) {
    throw new Error('OpenAI embeddings not initialized');
  }
  return embeddingDimension;
}

module.exports = {
  initialize,
  generate,
  cosineSimilarity,
  normalizeVector,
  getBackendInfo,
  getDimension,
  isInitialized: () => _initialized
};
