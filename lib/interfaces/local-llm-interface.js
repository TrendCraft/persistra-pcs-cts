// local-llm-interface.js
// Wrapper for local LLM via Ollama (Qwen2.5-Coder 32B)

const { 
  initializeOllamaShell, 
  engageWithLeo, 
  resetConversation 
} = require('../adapters/ollama-adapter');
const { createComponentLogger } = require('../utils/logger');

const logger = createComponentLogger('local-llm-interface');

let initialized = false;

/**
 * Initialize the Ollama shell
 */
async function initialize() {
  if (!initialized) {
    await initializeOllamaShell();
    initialized = true;
    logger.info('✅ Ollama shell initialized (Qwen2.5-Coder 32B)');
  }
}

/**
 * Send prompt to local LLM and return response
 * @param {string} input - Full composed prompt
 * @param {Object} options - Optional parameters
 * @param {number} [options.temperature=0.7] - Temperature for sampling
 * @param {number} [options.maxTokens=2000] - Maximum tokens to generate
 * @returns {Promise<string>}
 */
async function promptLLM(input, options = {}) {
  await initialize();
  
  try {
    logger.debug('Sending prompt to LLM', { inputLength: input.length });
    const responseText = await engageWithLeo(input);
    logger.debug('Received response from LLM', { responseLength: responseText?.length || 0 });
    return responseText;
  } catch (err) {
    logger.error('Error in promptLLM:', { 
      error: err.message, 
      stack: err.stack 
    });
    throw err;
  }
}

/**
 * Reset the conversation history
 */
function resetHistory() {
  resetConversation();
  logger.info('LLM conversation history reset');
}

/**
 * Get the current model information
 * @returns {Object} Model information
 */
function getModelInfo() {
  return {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen2.5-Coder 32B',
    provider: 'Ollama',
    type: 'local',
    contextWindow: 32768
  };
}

module.exports = {
  promptLLM,
  resetHistory,
  getModelInfo,
  initialize,
  id: 'LocalLLMInterface',
  type: 'local',
  supportsStreaming: false
};
