const axios = require('axios');

const OLLAMA_API_BASE = 'http://localhost:11434';

async function initializeOllamaShell() {
  try {
    const response = await axios.get(`${OLLAMA_API_BASE}/api/tags`);
    const modelExists = response.data.models.some(
      (model) => model.name === 'qwen2.5-coder:32b'
    );
    if (modelExists) {
      logger.info('✅ Ollama shell initialized (Qwen2.5-Coder 32B)');
    } else {
      logger.warn('⚠️ Qwen2.5-Coder 32B not found in local Ollama model list.');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize Ollama shell:', error.message);
    throw error;
  }
}

// Store conversation history at the module level
let conversationHistory = [];

/**
 * Format messages for Qwen chat API
 * @param {string} prompt - The user's prompt
 * @param {Array} history - Conversation history
 * @returns {Array} Formatted messages array
 */
function formatMessages(prompt, history = []) {
  // Start with system message if needed
  const messages = [
    {
      role: 'system',
      content: 'You are Leo, an advanced AI assistant designed to help with coding and technical tasks. Be concise, accurate, and helpful.'
    }
  ];

  // Add conversation history
  history.forEach(({ role, content }) => {
    messages.push({ role, content });
  });

  // Add current user message
  messages.push({
    role: 'user',
    content: prompt
  });

  return messages;
}

const { getChatModel } = require('../utils/model-routing');

async function sendPromptToOllama(promptText, history = []) {
  try {
    logger.info('Sending prompt to Ollama...');

    // Enforce model routing
    const model = await getChatModel();
    // Format messages for chat API
    const messages = formatMessages(promptText, history);
    
    // Ensure model is always a string
    const modelString = typeof model === 'string' ? model : (model && model.name ? model.name : 'qwen2.5-coder:32b');
    logger.debug(`[Ollama Adapter] Using model string for chat completion: ${modelString}`);
    logger.debug('[Ollama Adapter] Messages:', JSON.stringify(messages, null, 2));

    const response = await axios.post(`${OLLAMA_API_BASE}/api/chat`, {
      model: modelString,
      messages: messages,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 2000
      }
    });
    
    logger.debug('Response received from Ollama');
    logger.debug('[Ollama Adapter] Raw Ollama response:', JSON.stringify(response.data, null, 2));
    
    // Update conversation history
    conversationHistory.push(
      { role: 'user', content: promptText },
      { role: 'assistant', content: response.data.message.content }
    );
    
    // Keep only the last 10 exchanges to manage context length
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    
    return response.data.message.content;
  } catch (error) {
    logger.error('❌ Failed to send prompt to Ollama:', error.message);
    if (error.response) {
      logger.error(`Status: ${error.response.status}`);
      logger.error('Data:', JSON.stringify(error.response.data));
    } else if (error.request) {
      logger.error('No response received from Ollama server');
    }
    throw error;
  }
}

async function engageWithLeo(prompt) {
  try {
    logger.info('Engaging with Leo...');
    const responseText = await sendPromptToOllama(prompt, conversationHistory);
    logger.debug('Response received, returning to caller');
    return responseText;
  } catch (error) {
    logger.error('Error in engageWithLeo:', error.message);
    throw error;
  }
}

function resetConversation() {
  conversationHistory = [];
  logger.info('Conversation history reset');
}

module.exports = {
  initializeOllamaShell,
  sendPromptToOllama,
  engageWithLeo,
  resetConversation
};