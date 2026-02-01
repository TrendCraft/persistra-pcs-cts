const axios = require('axios');
const logger = require('../utils/logger').createComponentLogger('transformer-semantic-embeddings');

// Configurable defaults
// ZERO-CONFIG PATCH: Always use sensible defaults, auto-detect best embedding model, never require env vars for normal users
const OLLAMA_BASE_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const API_URL = `${OLLAMA_BASE_URL}/api/embeddings`;
const PREFERRED_MODELS = ['nomic-embed-text', 'all-minilm', 'text-embedding-ada-002']; // Ordered by quality/preference
let SELECTED_MODEL = null;

let _initialized = false;

async function initialize(options = {}) {
    try {
        const tagsResp = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
        const models = tagsResp.data.models.map(m => m.name);
        
        // Power user override (hidden config or env)
        let requestedModel = (options.ollamaModel || process.env.OLLAMA_EMBEDDINGS_MODEL || '').trim();
        if (requestedModel && models.includes(requestedModel)) {
            // Test the requested model
            if (await testModelEmbedding(requestedModel)) {
                SELECTED_MODEL = requestedModel;
                logger.info(`Using user-requested embedding model: ${SELECTED_MODEL}`);
            } else {
                logger.warn(`User-requested model ${requestedModel} failed embedding test, trying alternatives...`);
                requestedModel = null; // Fall through to auto-selection
            }
        }
        
        if (!requestedModel) {
            // Test each preferred model until we find one that works
            for (const modelName of PREFERRED_MODELS) {
                if (models.includes(modelName)) {
                    logger.info(`Testing embedding model: ${modelName}`);
                    if (await testModelEmbedding(modelName)) {
                        SELECTED_MODEL = modelName;
                        logger.info(`Auto-selected working embedding model: ${SELECTED_MODEL}`);
                        break;
                    } else {
                        logger.warn(`Model ${modelName} failed embedding test, trying next...`);
                    }
                }
            }
            
            // If no preferred models work, test all available models
            if (!SELECTED_MODEL) {
                for (const modelName of models) {
                    if (!PREFERRED_MODELS.includes(modelName)) {
                        logger.info(`Testing fallback embedding model: ${modelName}`);
                        if (await testModelEmbedding(modelName)) {
                            SELECTED_MODEL = modelName;
                            logger.warn(`Using fallback embedding model: ${SELECTED_MODEL}`);
                            break;
                        }
                    }
                }
            }
        }
        
        if (!SELECTED_MODEL) {
            throw new Error('No working embedding models found on Ollama server.');
        }
        
        _initialized = true;
        logger.info(`Ollama transformer backend initialized at ${OLLAMA_BASE_URL} (model: ${SELECTED_MODEL})`);
    } catch (err) {
        _initialized = false;
        logger.error(`Ollama transformer backend not available: ${err.message}`);
        throw new Error('Ollama transformer backend not available: ' + err.message);
    }
}

// Test if a model can generate valid embeddings
async function testModelEmbedding(modelName) {
    try {
        const resp = await axios.post(API_URL, {
            model: modelName,
            input: 'test'
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        if (resp.data && Array.isArray(resp.data.embedding)) {
            const embedding = resp.data.embedding;
            // Check if embedding has valid dimensions and non-zero values
            if (embedding.length > 0 && embedding.some(x => x !== 0)) {
                logger.info(`Model ${modelName} test passed: ${embedding.length}D, ${embedding.filter(x => x !== 0).length} non-zero values`);
                return true;
            } else {
                logger.warn(`Model ${modelName} returned empty or zero embedding`);
                return false;
            }
        } else {
            logger.warn(`Model ${modelName} returned invalid response format`);
            return false;
        }
    } catch (error) {
        logger.warn(`Model ${modelName} test failed: ${error.message}`);
        return false;
    }
}

async function generate(text, options = {}) {
    if (!_initialized || !SELECTED_MODEL) throw new Error('Transformer backend not initialized');
    try {
        const resp = await axios.post(API_URL, {
            model: SELECTED_MODEL,
            input: text
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (resp.data && Array.isArray(resp.data.embedding)) {
            const embedding = resp.data.embedding;
            logger.info(`Received embedding from Ollama model '${SELECTED_MODEL}' at ${API_URL} (length: ${embedding.length})`);
            if (embedding.length !== 768) {
                throw new Error('Embedding is not 768 dimensions!');
            }
            // Check for all-zero or obviously invalid embeddings
            if (embedding.every(x => x === 0)) {
                throw new Error('Ollama returned all-zero embedding!');
            }
            // Reduce dimensions from 768D to 384D for compatibility with TSE system
            const reducedEmbedding = reduceDimensions(embedding, 384);
            // Validate reduced embedding
            if (!Array.isArray(reducedEmbedding) || reducedEmbedding.length !== 384 || reducedEmbedding.every(x => x === 0)) {
                throw new Error('Reduced embedding is invalid or all-zero!');
            }
            return reducedEmbedding;
        }
        throw new Error('No embedding array returned from Ollama');
    } catch (err) {
        logger.error(`Failed to generate transformer embedding: ${err.message}`);
        if (err.response) {
            logger.error('Ollama response data:', err.response.data);
            logger.error('Ollama response status:', err.response.status);
        }
        // Do not throw—let hybrid selector fallback to local
        throw new Error('Failed to generate embedding from transformer backend: ' + err.message);
    }
}

// Standard cosine similarity implementation
function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Optional: vector normalization (L2)
function normalizeVector(vec) {
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vec.map(val => val / norm) : vec;
}

// Reduce embedding dimensions from 768D to target dimensions
// Uses a simple averaging approach to maintain semantic information
function reduceDimensions(embedding, targetDim) {
    if (embedding.length === targetDim) {
        return embedding;
    }
    
    const sourceLen = embedding.length;
    const reduced = new Array(targetDim).fill(0);
    const ratio = sourceLen / targetDim;
    
    // Average groups of dimensions to reduce from 768D to 384D
    for (let i = 0; i < targetDim; i++) {
        const startIdx = Math.floor(i * ratio);
        const endIdx = Math.floor((i + 1) * ratio);
        let sum = 0;
        let count = 0;
        
        for (let j = startIdx; j < endIdx && j < sourceLen; j++) {
            sum += embedding[j];
            count++;
        }
        
        reduced[i] = count > 0 ? sum / count : 0;
    }
    
    // Normalize the reduced embedding to maintain unit length
    return normalizeVector(reduced);
}

module.exports = {
    initialize,
    generate,
    cosineSimilarity,
    normalizeVector
};
