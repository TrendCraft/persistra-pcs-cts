// === MODEL ROUTING VERSION: MVP-DEMO-HARDCODED ===
// model-routing.js
// For MVP/demo: Hardcode chat and embedding model. No dynamic routing.

const { info, warn, error } = require('./logger');
// List of valid chat/completion models for Ollama/Leo
const CHAT_MODELS = [
  'leo-llama3-8b-merged-q4k:latest',
  'llama3',
  'llama3:8b',
  'llama3-8b-instruct',
  'qwen2.5-coder:32b',
  'mistral',
  'phi3',
  // ...add any others your runtime may use
];
// --- HARDCODED MODELS FOR DEMO ---
const CHAT_MODEL = 'leo-llama3-8b-merged-q4k'; // Set to your known working Llama model/tag
const CLOUD_AVAILABLE = true; // Set this flag at startup as needed
const EMBEDDING_MODEL = CLOUD_AVAILABLE
  ? 'cloud-transformer-embedding'
  : 'local-custom-semantic-embedding';

// --- EXPORTED GETTERS (FOR COMPATIBILITY) ---
function getChatModel() {
  return CHAT_MODEL;
}
function getEmbeddingModel() {
  return EMBEDDING_MODEL;
}

// --- DYNAMIC ROUTING (DISABLED FOR DEMO) ---
// All dynamic model routing/probing logic is commented out below.
// Restore if/when needed for production or multi-environment deployments.
//
// const axios = require('axios');
// const { info, warn, error } = require('./logger');
// const OLLAMA_API_BASE = process.env.OLLAMA_API_BASE || 'http://localhost:11434';
// ...
// function probeForChatModel() { ... }
// function probeForEmbeddingModel() { ... }
// function discoverAndValidateModels() { ... }
//
// End dynamic routing section.

module.exports = {
  getChatModel,
  getEmbeddingModel,
  CHAT_MODEL,
  EMBEDDING_MODEL,
  CLOUD_AVAILABLE,
  // probeForChatModel,
  // probeForEmbeddingModel,
  // discoverAndValidateModels,
};

/**
 * FIXED: Enhanced model matching logic
 */
function findBestChatModel(availableModels) {
  info(`[Model Routing] Available models: ${availableModels.join(', ')}`);
  // Priority 1: Exact match for Leo models
  for (const leoModel of CHAT_MODELS.filter(m => m.startsWith('leo-'))) {
    if (availableModels.includes(leoModel)) {
      info(`[Model Routing] Found exact Leo model: ${leoModel}`);
      return leoModel;
    }
  }
  // Priority 2: Partial match for Leo models
  for (const availableModel of availableModels) {
    if (availableModel.toLowerCase().includes('leo') && availableModel.toLowerCase().includes('llama')) {
      info(`[Model Routing] Found Leo-like model: ${availableModel}`);
      return availableModel;
    }
  }
  // Priority 3: Standard models (exact match)
  for (const standardModel of CHAT_MODELS.filter(m => !m.startsWith('leo-'))) {
    if (availableModels.includes(standardModel)) {
      info(`[Model Routing] Found standard model: ${standardModel}`);
      return standardModel;
    }
  }
  // Priority 4: Partial match for standard models
  for (const availableModel of availableModels) {
    for (const standardModel of CHAT_MODELS.filter(m => !m.startsWith('leo-'))) {
      if (availableModel.includes(standardModel)) {
        info(`[Model Routing] Found partial match: ${availableModel} (matches ${standardModel})`);
        return availableModel;
      }
    }
  }
  return null;
}

/**
 * FIXED: Probe function that doesn't exit on failure
 */
async function probeForChatModel() {
  try {
    info('[Model Routing] Probing for available chat models...');
    const resp = await axios.get(`${OLLAMA_API_BASE}/api/tags`, { timeout: 5000 });
    if (!resp.data || !Array.isArray(resp.data.models)) {
      warn('[Model Routing] Invalid response from Ollama API');
      return null;
    }
    const availableModels = resp.data.models.map(m => m.name || m.model || '').filter(Boolean);
    info(`[Model Routing] Found ${availableModels.length} models in Ollama`);
    if (availableModels.length === 0) {
      info('[Model Routing] No models found in Ollama');
      return null;
    }
    const selectedModel = findBestChatModel(availableModels);
    if (selectedModel) {
      info(`[Model Routing] Selected chat model: ${selectedModel}`);
      return selectedModel;
    } else {
      info('[Model Routing] No suitable chat model found');
      info(`[Model Routing] Available: ${availableModels.join(', ')}`);
      info(`[Model Routing] Looking for: ${CHAT_MODELS.join(', ')}`);
      return null;
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      error('[Model Routing] Cannot connect to Ollama - is it running?');
    } else if (err.code === 'ETIMEDOUT') {
      error('[Model Routing] Ollama connection timeout');
    } else {
      error('[Model Routing] Error probing for chat models:', err.message);
    }
    return null;
  }
}

/**
 * FIXED: Enhanced embedding model probe
 */
async function probeForEmbeddingModel() {
  try {
    info('[Model Routing] Probing for embedding models...');
    const resp = await axios.get(`${OLLAMA_API_BASE}/api/tags`, { timeout: 5000 });
    if (!resp.data || !Array.isArray(resp.data.models)) {
      warn('[Model Routing] Invalid response from Ollama API for embeddings');
      return null;
    }
    const availableModels = resp.data.models.map(m => m.name || m.model || '').filter(Boolean);
    for (const embeddingModel of EMBEDDING_MODELS) {
      const found = availableModels.find(model => model.includes(embeddingModel));
      if (found) {
        info(`[Model Routing] Selected embedding model: ${found}`);
        return found;
      }
    }
    info('[Model Routing] No transformer embedding models found (will use local embeddings)');
    return null;
  } catch (err) {
    warn('[Model Routing] Error probing for embedding models:', err.message);
    return null; // Non-fatal - can fallback to local embeddings
  }
}

/**
 * FIXED: Safer model getters that don't immediately exit
 */
async function getChatModel() {
  const model = process.env.OLLAMA_MODEL;
  if (!model) {
    error('[Model Routing] OLLAMA_MODEL environment variable not set');
    return null;
  }
  const isValid = await validateModelType(model, 'chat');
  if (!isValid) {
    error(`[Model Routing] Model '${model}' is not recognized as a chat model`);
    return null;
  }
  return model;
}

async function getEmbeddingModel() {
  const model = process.env.OLLAMA_EMBEDDINGS_MODEL;
  if (!model) {
    info('[Model Routing] OLLAMA_EMBEDDINGS_MODEL not set (will use local embeddings)');
    return null;
  }
  const isValid = await validateModelType(model, 'embedding');
  if (!isValid) {
    warn(`[Model Routing] Model '${model}' is not recognized as an embedding model`);
    return null;
  }
  return model;
}

/**
 * FIXED: Validation function that returns boolean instead of exiting
 */
async function validateModelType(model, type) {
  if (type === 'chat') {
    if (CHAT_MODELS.includes(model)) {
      return true;
    }
    const partialMatch = CHAT_MODELS.some(m => model.includes(m) || m.includes(model));
    if (partialMatch) {
      return true;
    }
    if (model.toLowerCase().includes('leo') && model.toLowerCase().includes('llama')) {
      warn(`[Model Routing] Leo model '${model}' not in allowlist but accepting due to Leo pattern`);
      return true;
    }
    return false;
  } else if (type === 'embedding') {
    return EMBEDDING_MODELS.some(m => model.includes(m));
  } else {
    error(`[Model Routing] Unknown model type for validation: ${type}`);
    return false;
  }
}

/**
 * NEW: Health check function to verify model is actually responsive
 */
async function testModelHealth(modelName, timeout = 10000) {
  try {
    info(`[Model Routing] Testing health of model: ${modelName}`);
    const response = await axios.post(
      `${OLLAMA_API_BASE}/api/generate`,
      {
        model: modelName,
        prompt: 'test',
        stream: false,
        options: { num_predict: 1 }
      },
      { timeout }
    );
    if (response.status === 200 && response.data.response) {
      info(`[Model Routing] Model ${modelName} is healthy`);
      return true;
    }
    warn(`[Model Routing] Model ${modelName} responded but with unexpected data`);
    return false;
  } catch (err) {
    error(`[Model Routing] Model ${modelName} health check failed:`, err.message);
    return false;
  }
}

/**
 * NEW: Comprehensive model discovery and validation
 */
async function discoverAndValidateModels() {
  const results = {
    chatModel: null,
    embeddingModel: null,
    errors: []
  };
  try {
    info('[Model Routing] Starting model discovery...');
    const chatModel = await probeForChatModel();
    if (!chatModel) {
      results.errors.push('No suitable chat model found');
      return results;
    }
    const isChatHealthy = await testModelHealth(chatModel, 15000);
    if (!isChatHealthy) {
      results.errors.push(`Chat model ${chatModel} failed health check`);
      return results;
    }
    results.chatModel = chatModel;
    const embeddingModel = await probeForEmbeddingModel();
    if (embeddingModel) {
      results.embeddingModel = embeddingModel;
    } else {
      info('[Model Routing] No embedding models found - will use local embeddings');
    }
    process.env.OLLAMA_MODEL = results.chatModel;
    if (results.embeddingModel) {
      process.env.OLLAMA_EMBEDDINGS_MODEL = results.embeddingModel;
    }
    info('[Model Routing] Model discovery complete');
    info(`[Model Routing] Chat: ${results.chatModel}`);
    info(`[Model Routing] Embeddings: ${results.embeddingModel || 'local'}`);
    return results;
  } catch (err) {
    error('[Model Routing] Fatal error during model discovery:', err);
    results.errors.push(err.message);
    return results;
  }
}

module.exports = {
  // Hardcoded demo API only
  getChatModel,
  getEmbeddingModel,
  CHAT_MODEL,
  EMBEDDING_MODEL,
  CLOUD_AVAILABLE,
  // Uncomment below for dynamic routing in the future
  // discoverAndValidateModels,
  // probeForChatModel,
  // probeForEmbeddingModel,
  // validateModelType,
  // testModelHealth,
  // findBestChatModel,
};
