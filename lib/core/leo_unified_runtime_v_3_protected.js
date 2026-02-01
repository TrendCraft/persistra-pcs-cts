// leo_unified_runtime_v_3_protected.js
// Local-only unified runtime using Qwen2.5-Coder 32B via Ollama
// Complete initialization: LLM, memory graph, semantic search, config, logging, routing (stub)
// With protection for embeddings and chunks files

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const readline = require('readline');

// Import logger module
const loggerModule = require('../utils/logger');

// Create component logger
const logger = loggerModule.createComponentLogger('leo-runtime-v3-protected');

// Global state
let memoryGraph = null;
let config = null;
let initialized = false;

// Constants
const OLLAMA_API_BASE = 'http://localhost:11434';
const MODEL_NAME = 'qwen2.5-coder:32b';
const DATA_DIR = path.join(process.cwd(), 'data');
const CHUNKS_PATH = path.join(DATA_DIR, 'chunks.jsonl');
const EMBEDDINGS_PATH = path.join(DATA_DIR, 'embeddings.jsonl');

/**
 * Protect memory files from being overwritten
 */
function protectMemoryFiles() {
  try {
    logger.info('🔒 Setting up memory file protection...');
    
    // Check if files exist and have content
    if (fs.existsSync(CHUNKS_PATH)) {
      const chunksContent = fs.readFileSync(CHUNKS_PATH, 'utf8');
      if (chunksContent.trim() && chunksContent.trim() !== '[]') {
        logger.info('✅ Valid chunks file found, protecting from overwrite');
        try {
          fs.chmodSync(CHUNKS_PATH, 0o444); // Set to read-only
        } catch (err) {
          logger.warn(`Could not set chunks file to read-only: ${err.message}`);
        }
      } else {
        logger.warn('⚠️ Chunks file is empty or invalid, will not protect');
      }
    }
    
    if (fs.existsSync(EMBEDDINGS_PATH)) {
      const embeddingsContent = fs.readFileSync(EMBEDDINGS_PATH, 'utf8');
      if (embeddingsContent.trim() && embeddingsContent.trim() !== '[]') {
        logger.info('✅ Valid embeddings file found, protecting from overwrite');
        try {
          fs.chmodSync(EMBEDDINGS_PATH, 0o444); // Set to read-only
        } catch (err) {
          logger.warn(`Could not set embeddings file to read-only: ${err.message}`);
        }
      } else {
        logger.warn('⚠️ Embeddings file is empty or invalid, will not protect');
      }
    }
    
    logger.info('✅ Memory file protection setup complete');
  } catch (err) {
    logger.error(`❌ Failed to set up memory file protection: ${err.message}`);
  }
}

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
      
      // Protect memory files before loading dependencies
      protectMemoryFiles();
      
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
      logger.info(`🔍 Searching memory for: "${query.substring(0, 20)}..."`);
      
      // Use search engine to find relevant context
      const results = await this.searchEngine.search(query);
      
      if (results && results.length > 0) {
        logger.info(`🔍 Found ${results.length} relevant memory items`);
        return results;
      } else {
        logger.info(`🔍 No relevant memory context found.`);
        return [];
      }
    } catch (err) {
      logger.error(`❌ Memory search failed: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Send prompt to Ollama
   */
  async promptOllama(prompt, memoryContext = null) {
    try {
      // Prepare system prompt
      const systemPrompt = `You are Leo, an advanced AI assistant with a memory graph and cognitive persistence.
You are running inside the Leo system, which provides you with relevant memory context when available.
You have access to a memory graph that stores information about conversations, facts, and knowledge.
When responding, incorporate the memory context provided to you in a natural way.
You are powered by Qwen2.5-Coder 32B and have strong capabilities in coding, reasoning, and creative tasks.
You are helpful, harmless, and honest. You prioritize user security and privacy.`;
      
      logger.info('🤖 Sending prompt to Ollama...');
      
      // Prepare prompt with memory context if available
      let fullPrompt = prompt;
      
      if (memoryContext && memoryContext.length > 0) {
        const contextStr = memoryContext.map(item => 
          `[Memory ${item.id || 'unknown'}]: ${item.content || item.text || JSON.stringify(item)}`
        ).join('\n\n');
        
        fullPrompt = `Here is relevant context from my memory:\n\n${contextStr}\n\n---\n\nUser query: ${prompt}`;
        logger.info('ℹ️ Including memory context in prompt');
      } else {
        logger.info('ℹ️ No memory context to include');
      }
      
      // Log that we're using system prompt with Ollama API
      logger.info('Using system prompt with Ollama API');
      
      // Make API call to Ollama
      const response = await axios.post(`${OLLAMA_API_BASE}/api/generate`, {
        model: MODEL_NAME,
        prompt: fullPrompt,
        system: systemPrompt,  // Use dedicated system parameter
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
          num_predict: 2048
        }
      });
      
      const answer = response.data.response;
      return answer;
    } catch (err) {
      logger.error(`❌ Ollama prompt failed: ${err.message}`);
      return `I'm sorry, I encountered an error while processing your request: ${err.message}`;
    }
  }
  
  /**
   * Process a prompt with Leo
   */
  async processPrompt(input) {
    try {
      // Search memory for relevant context
      const memoryContext = await this.searchMemory(input);
      
      // Send prompt to Ollama with memory context
      const response = await this.promptOllama(input, memoryContext);
      
      return response;
    } catch (err) {
      logger.error(`❌ Prompt processing failed: ${err.message}`);
      return `I'm sorry, I encountered an error while processing your request: ${err.message}`;
    }
  }
}

// Create singleton instance
const leoRuntime = new LeoRuntime();

/**
 * Initialize Leo runtime
 */
async function initializeLeo() {
  try {
    if (!initialized) {
      await leoRuntime.initialize();
      initialized = true;
    }
    return leoRuntime;
  } catch (err) {
    logger.error(`❌ Failed to initialize Leo: ${err.message}`);
    throw err;
  }
}

/**
 * Process a prompt using Leo
 */
async function runLeoPrompt(input) {
  try {
    if (!initialized) {
      await initializeLeo();
    }
    
    const response = await leoRuntime.processPrompt(input);
    return response;
  } catch (err) {
    logger.error(`❌ Failed to run Leo prompt: ${err.message}`);
    throw err;
  }
}

/**
 * Start interactive prompt
 */
function startInteractivePrompt() {
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });
  
  // Initialize Leo
  initializeLeo()
    .then(() => {
      // Display prompt
      rl.prompt();
      
      // Handle input
      rl.on('line', async (line) => {
        // Exit on 'exit' command
        if (line.toLowerCase() === 'exit') {
          console.log('Goodbye!');
          rl.close();
          process.exit(0);
        }
        
        // Process input
        console.log('\nProcessing...');
        try {
          const response = await runLeoPrompt(line);
          console.log(`\n${response}\n`);
        } catch (err) {
          console.error(`Error: ${err.message}`);
        }
        
        // Display prompt again
        rl.prompt();
      });
    })
    .catch((err) => {
      console.error(`Failed to initialize Leo: ${err.message}`);
      rl.close();
      process.exit(1);
    });
}

// Initialize and start interactive prompt if run directly
if (require.main === module) {
  initializeLeo()
    .then(() => {
      console.log('Leo initialized successfully. Starting interactive prompt...');
      startInteractivePrompt();
    })
    .catch((err) => {
      console.error(`Failed to initialize Leo: ${err.message}`);
      process.exit(1);
    });
}

// Export functions
module.exports = {
  initializeLeo,
  runLeoPrompt,
  startInteractivePrompt
};
