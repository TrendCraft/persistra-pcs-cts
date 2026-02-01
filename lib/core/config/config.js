// config.js - Leo Local-Only Configuration

require('dotenv').config();

module.exports = {
  verbose: process.env.VERBOSE_LOGGING === 'true',

  // LLM settings
  llm: {
    engine: 'ollama',
    model: process.env.OLLAMA_MODEL_NAME || 'qwen2.5-coder:32b',
  }
};
