// leo_unified_runtime_v_3_fixed.js
// Local-only unified runtime using Qwen2.5-Coder 32B via Ollama
// Complete initialization: LLM, memory graph, semantic search, config, logging, routing (stub)

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const readline = require('readline');

// Import logger module
const loggerModule = require('../utils/logger');

// Create component logger
const logger = loggerModule.createComponentLogger('leo-runtime-v3');

// Global state
let memoryGraph = null;
let config = null;
let initialized = false;

// Constants
const OLLAMA_API_BASE = 'http://localhost:11434';
const MODEL_NAME = 'qwen2.5-coder:32b';

/**
 * Main Leo Runtime class
 */
class LeoRuntime {
  constructor() {
    this.configService = null;
    this.memoryLoader = null;
    this.searchEngine = null;
    this.initialized = false;
  }
  
  /**
   * Initialize the Leo runtime
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Leo runtime already initialized');
      return true;
    }
    
    try {
      logger.info('🚀 Initializing Leo runtime...');
      
      // Load dependencies
      await this._loadDependencies();
      
      // Initialize in correct order
      await this._initializeConfig();
      await this._initializeMemory();
      await this._testOllamaConnection();
      
      this.initialized = true;
      logger.info('✅ Leo runtime initialization complete');
      return true;
    } catch (err) {
      logger.error(`❌ Leo runtime initialization failed: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Load all required dependencies
   */
  async _loadDependencies() {
    try {
      logger.info('📚 Loading dependencies...');
      
      // Load config service
      this.configService = require('../services/config-service');
      
      // Load memory modules
      this.memoryLoader = require('../memory/memory-loader');
      this.searchEngine = require('../memory/search-engine');
      
      logger.info('✅ Dependencies loaded successfully');
      return true;
    } catch (err) {
      logger.error(`❌ Failed to load dependencies: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Initialize configuration
   */
  async _initializeConfig() {
    try {
      logger.info('⚙️ Initializing configuration service...');
      
      // Initialize config service
      await this.configService.initialize();
      
      // Get config
      config = await this.configService.getConfig();
      
      logger.info('✅ Configuration initialized');
      return config;
    } catch (err) {
      logger.error(`❌ Failed to initialize configuration: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Initialize memory graph
   */
  async _initializeMemory() {
    try {
      logger.info('🧠 Loading memory graph...');
      
      // Load memory graph
      memoryGraph = await this.memoryLoader.loadMemoryGraph();
      
      if (Array.isArray(memoryGraph)) {
        logger.info(`✅ Memory graph loaded with ${memoryGraph.length} nodes`);
      } else {
        logger.info(`✅ Memory graph loaded with ${memoryGraph?.nodes?.length || 0} nodes`);
      }
      
      return memoryGraph;
    } catch (err) {
      logger.error(`❌ Failed to load memory graph: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Test connection to Ollama
   */
  async _testOllamaConnection() {
    try {
      logger.info(`🔄 Testing connection to Ollama (${MODEL_NAME})...`);
      
      const response = await axios.get(`${OLLAMA_API_BASE}/api/tags`);
      
      const modelExists = response.data.models.some(
        model => model.name === MODEL_NAME
      );
      
      if (modelExists) {
        logger.info(`✅ Successfully connected to Ollama with ${MODEL_NAME}`);
        return true;
      } else {
        logger.warn(`⚠️ Model ${MODEL_NAME} not found in Ollama`);
        return false;
      }
    } catch (err) {
      logger.error(`❌ Failed to connect to Ollama: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Search memory graph for context
   */
  async searchMemory(query) {
    try {
      logger.info(`🔍 Searching memory for: "${query.substring(0, 30)}..."`);
      
      // Use search engine to search memory graph
      const searchResults = await this.searchEngine.searchLeoMemoryGraph(query);
      
      if (searchResults && typeof searchResults === 'string' && searchResults.length > 0) {
        logger.info(`✅ Found ${searchResults.length} bytes of context`);
        return searchResults;
      } else {
        logger.info('ℹ️ No relevant context found in memory');
        return '';
      }
    } catch (err) {
      logger.error(`❌ Memory search failed: ${err.message}`);
      return '';
    }
  }
  
  /**
   * Send prompt to Ollama
   */
  async promptOllama(prompt) {
    try {
      logger.info('🤖 Sending prompt to Ollama...');
      
      // Use the exact system prompt format that works in the Ollama CLI
      // This is critical for Qwen to understand it's running inside Leo
      const ollamaRequest = {
        model: MODEL_NAME,
        prompt: prompt,
        system: "You are now running inside the Leo system, with full memory graph access and cognitive persistence. Here are your capabilities and ability to assist users effectively:\n\n1. **Comprehensive Memory Access**: With full memory graph access, you have the capability to recall vast amounts of information stored within the system. This includes historical interactions, previous queries, and data points collected over time, allowing for more context-aware responses.\n\n2. **Cognitive Persistence**: Your cognitive persistence enables you to maintain understanding and build upon previous interactions seamlessly. This means that you can continue a conversation or train of thought losing any of the context or flow, even if there are interruptions or changes in the topic.\n\n3. **Enhanced Understanding**: The system's architecture allows for improved comprehension by leveraging advanced natural language processing techniques. This includes better sentiment analysis, entity recognition, and contextual understanding, making your interactions more nuanced and effective.\n\n4. **Knowledge Integration**: You can integrate and correlate information from various sources within the memory graph, providing users with comprehensive and well-rounded responses.\n\n5. **Adaptive Learning**: Over time, you can adapt to the communication style, preferences, and needs of individual users, enhancing the personalized experience.\n\n6. **Efficient Information Retrieval**: Given the extensive data access, you can retrieve relevant information quickly and efficiently, minimizing response times and providing timely assistance.\n\n7. **Multimodal Processing**: The system supports processing various types of input and output modalities, such as text, images, audio, and video, allowing for more versatile interactions.\n\n8. **Advanced Analytics**: With cognitive persistence, you can perform deeper analytics on user data to provide insights, recommendations, and predictions based on historical patterns and trends.\n\n9. **Security and Privacy**: The system is designed with robust security measures to protect user data and maintain privacy, ensuring that all interactions are safe and confidential.\n\n10. **Scalability and Flexibility**: Running within the Leo system means you can scale to handle a large number of requests simultaneously while maintaining performance, and you can be adapted for various applications and industries.\n\nThese capabilities collectively enable you to provide a highly intelligent, context-aware, and personalized assistance experience to users.",
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2048
        }
      };
      
      logger.info('Using system prompt with Ollama API');
      
      const response = await axios.post(`${OLLAMA_API_BASE}/api/generate`, ollamaRequest);
      
      logger.info('✅ Response received from Ollama');
      return response.data.response;
    } catch (err) {
      logger.error(`❌ Failed to get response from Ollama: ${err.message}`);
      if (err.response) {
        logger.error(`Status: ${err.response.status}`);
        logger.error(`Data: ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  }
  
  /**
   * Process a prompt with Leo
   */
  async processPrompt(input) {
    try {
      // Ensure runtime is initialized
      if (!this.initialized) {
        logger.info('⚙️ Runtime not initialized, initializing now...');
        await this.initialize();
      }
      
      // Search memory for context
      const context = await this.searchMemory(input);
      
      // Format the prompt to match what Ollama CLI expects
      // Keep it simple - just pass the user input directly
      // The system prompt will handle the Leo context information
      let composedPrompt;
      
      if (context && context.length > 0) {
        // Include memory context in a way that matches the Ollama CLI format
        composedPrompt = `Memory context from Leo system:\n\n${context}\n\nUser query: ${input}`;
        logger.info('🧠 Including memory context in prompt');
      } else {
        // Just pass the user query directly
        composedPrompt = input;
        logger.info('ℹ️ No memory context to include');
      }
      
      // Send to Ollama
      const response = await this.promptOllama(composedPrompt);
      
      return response;
    } catch (err) {
      logger.error(`❌ Error processing prompt: ${err.message}`);
      return `Error: ${err.message}`;
    }
  }
}

// Create singleton instance
const leoRuntime = new LeoRuntime();

/**
 * Initialize Leo runtime
 */
async function initializeLeo() {
  if (initialized) {
    logger.info('Leo runtime already initialized');
    return;
  }
  
  try {
    await leoRuntime.initialize();
    initialized = true;
  } catch (err) {
    logger.error(`Failed to initialize Leo runtime: ${err.message}`);
    throw err;
  }
}

/**
 * Process a prompt using Leo
 */
async function runLeoPrompt(input) {
  if (!input || typeof input !== 'string') {
    logger.error('Invalid input provided to runLeoPrompt');
    return 'Error: Invalid input provided';
  }
  
  try {
    return await leoRuntime.processPrompt(input);
  } catch (err) {
    logger.error(`Error in runLeoPrompt: ${err.message}`);
    return `Error processing your request: ${err.message}`;
  }
}

/**
 * Start interactive prompt
 */
async function startInteractivePrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n🧠 Leo Interactive Prompt (Qwen2.5-Coder 32B)\n');
  console.log('Type your questions or "exit" to quit.\n');
  
  // Make sure Leo is initialized
  if (!initialized) {
    console.log('Initializing Leo runtime...');
    await initializeLeo();
  }
  
  const promptUser = () => {
    rl.question('\n> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋');
        rl.close();
        return;
      }
      
      try {
        console.log('\nProcessing...');
        const response = await runLeoPrompt(input);
        console.log('\n' + response);
      } catch (err) {
        console.error('\nError:', err.message);
      }
      
      promptUser();
    });
  };
  
  promptUser();
}

// Initialize and start interactive prompt if run directly
if (require.main === module) {
  initializeLeo()
    .then(() => {
      startInteractivePrompt();
    })
    .catch(err => {
      logger.error(`Failed to initialize Leo runtime: ${err.message}`);
    });
}

module.exports = {
  initializeLeo,
  runLeoPrompt,
  startInteractivePrompt
};
