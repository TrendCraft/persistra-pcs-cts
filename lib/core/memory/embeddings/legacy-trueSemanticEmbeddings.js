// lib/core/memory/embeddings/trueSemanticEmbeddings.js

// Import the specific backend implementations
const localSemanticEmbeddings = require('../../../services/local-semantic-embeddings');
const transformerSemanticEmbeddings = require('../../../services/transformer-semantic-embeddings');
const logger = require('../../../utils/logger').createComponentLogger('true-semantic-embeddings-hybrid');

// Define the active backend, initially null
let activeBackend = null;

class TrueSemanticEmbeddings {
    constructor() {
        // Constructor can be empty or set default options, but initialization
        // will primarily happen via the async initialize method.
    }

    /**
     * Initializes the semantic embeddings backend.
     * Tries the transformer backend first if enabled via options or environment,
     * then falls back to the local backend.
     * @param {object} options - Configuration options for initialization.
     * @param {boolean} [options.useTransformer=true] - Whether to attempt using the transformer backend.
     * @param {string} [options.ollamaApiUrl] - Optional: URL for Ollama API.
     * @param {string} [options.ollamaModel] - Optional: Model name for Ollama.
     */
    async initialize(options = {}) {
        // Always try transformer backend first, with zero-config
        try {
            logger.info('Attempting to initialize transformer semantic embeddings backend (zero-config)...');
            await transformerSemanticEmbeddings.initialize(options);
            activeBackend = transformerSemanticEmbeddings;
            logger.info('Successfully initialized transformer semantic embeddings backend.');
            return;
        } catch (err) {
            logger.warn(`Transformer backend unavailable or failed to initialize: ${err.message}. Falling back to local.`);
        }
        // Fallback to local semantic embeddings
        try {
            await localSemanticEmbeddings.initialize(options);
            activeBackend = localSemanticEmbeddings;
            logger.info('Successfully initialized local semantic embeddings backend.');
        } catch (err) {
            logger.error('Failed to initialize local semantic embeddings backend:', err.message);
            throw new Error('No semantic embeddings backend could be initialized.');
        }
    }

    /**
     * Retrieves the currently active embeddings backend.
     * Throws an error if no backend has been successfully initialized.
     * @returns {object} The active embeddings backend.
     */
    _getBackend() {
        if (!activeBackend) {
            throw new Error('Semantic embeddings backend not initialized! Call initialize() first.');
        }
        return activeBackend;
    }

    /**
     * Generates an embedding vector for the given text.
     * Delegates the call to the active backend.
     * @param {string} text - The text to generate an embedding for.
     * @param {object} [options] - Additional options for generation.
     * @returns {Promise<number[]>} A promise that resolves to the embedding vector.
     */
    async generate(text, options) {
        return this._getBackend().generate(text, options);
    }

    /**
     * Calculates the cosine similarity between two embedding vectors.
     * Delegates the call to the active backend.
     * @param {number[]} vecA - The first vector.
     * @param {number[]} vecB - The second vector.
     * @returns {number} The cosine similarity.
     */
    similarity(vecA, vecB) {
        // Ensure the backend has a similarity method, or provide a default
        const backend = this._getBackend();
        if (typeof backend.cosineSimilarity === 'function') {
            return backend.cosineSimilarity(vecA, vecB);
        }
        // Fallback to a generic cosine similarity if backend doesn't provide one
        logger.warn('Active backend does not provide cosineSimilarity. Using generic implementation.');
        return this._genericCosineSimilarity(vecA, vecB);
    }

    /**
     * Normalizes an embedding vector.
     * Delegates the call to the active backend if it has a normalizeVector method,
     * otherwise returns the original vector.
     * @param {number[]} vector - The vector to normalize.
     * @returns {number[]} The normalized vector.
     */
    normalize(vector) {
        const backend = this._getBackend();
        if (typeof backend.normalizeVector === 'function') {
            return backend.normalizeVector(vector);
        }
        // If the backend doesn't provide normalization, assume it's already normalized or not needed
        logger.warn('Active backend does not provide normalizeVector. Returning original vector.');
        return vector;
    }

    /**
     * Generic cosine similarity calculation (fallback).
     * @param {number[]} a - First vector.
     * @param {number[]} b - Second vector.
     * @returns {number} Cosine similarity.
     */
    _genericCosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error("Vectors must be of the same length for cosine similarity.");
        }
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }
        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);
        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }
        return dotProduct / (magnitudeA * magnitudeB);
    }
}

// Export a single instance of the TrueSemanticEmbeddings class
module.exports = new TrueSemanticEmbeddings();
