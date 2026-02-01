// leo-unified-runtime-v3.js
// Local-only unified runtime using Qwen2.5-Coder 32B via Ollama
// Complete initialization: LLM, memory graph, semantic search, config, logging, routing (stub)

const path = require('path');
const fs = require('fs');

// For the logger, we need to create a component logger function
const loggerModule = require('../utils/logger');
const createComponentLogger = (component) => {
  return {
    info: (message, ...args) => loggerModule.info(`[${component}] ${message}`, ...args),
    warn: (message, ...args) => loggerModule.warn(`[${component}] ${message}`, ...args),
    error: (message, ...args) => loggerModule.error(`[${component}] ${message}`, ...args),
    debug: (message, ...args) => console.debug(`[DEBUG][${component}] ${message}`, ...args)
  };
};

// Create logger for this module
const logger = createComponentLogger('leo-runtime-v3');

// Global state
let memoryGraph = null;
let config = null;
let initialized = false;
let leoRuntime = null;

// Temporary stub for future modular router logic
const route = async (output, context) => output;

/**
 * Main runtime class to ensure proper initialization sequence
 */
class LeoRuntime {
  constructor() {
    this.configService = null;
    this.localLLMInterface = null;
    this.memoryLoader = null;
    this.searchEngine = null;
  }
  
  /**
   * Load all required dependencies
   */
  async loadDependencies() {
    try {
      // Load config service first
      logger.info('⚙️ Loading config service...');
      this.configService = require('../services/config-service');
      await this.configService.initialize();
      logger.info('✅ Config service loaded and initialized');
      
      // Now load other dependencies
      logger.info('🔌 Loading other dependencies...');
      this.localLLMInterface = require('../interfaces/local-llm-interface');
      this.memoryLoader = require('../memory/memory-loader');
      this.searchEngine = require('../memory/search-engine');
      logger.info('✅ All dependencies loaded');
      return true;
    } catch (err) {
      logger.error('❌ Failed to load dependencies:', err.message);
      throw err;
    }
  }
  
  /**
   * Initialize the LLM interface
   */
  async initializeLLM() {
    try {
      logger.info('🧠 Initializing local LLM interface (Qwen2.5-Coder 32B via Ollama)...');
      await this.localLLMInterface.initialize();
      logger.info('✅ LLM interface initialized');
      return true;
    } catch (err) {
      logger.error('❌ Failed to initialize LLM interface:', err.message);
      throw err;
    }
  }
  
  /**
   * Load the memory graph
   */
  async loadMemoryGraph() {
    try {
      logger.info('🗂️ Loading memory graph...');
      memoryGraph = await this.memoryLoader.loadMemoryGraph();
      
      // Check if memoryGraph is an array (from memory-loader.js implementation)
      if (Array.isArray(memoryGraph)) {
        logger.info(`✅ Memory graph loaded with ${memoryGraph.length} nodes`);
      } else {
        // If it's an object with nodes property
        logger.info(`✅ Memory graph loaded with ${memoryGraph?.nodes?.length || 0} nodes`);
      }
      return memoryGraph;
    } catch (err) {
      logger.error('❌ Failed to load memory graph:', err.message);
      throw err;
    }
  }
  
  /**
   * Load configuration
   */
  async loadConfiguration() {
    try {
      logger.info('⚙️ Loading configuration...');
      if (this.configService?.getConfig) {
        config = await this.configService.getConfig();
      } else {
        config = {
          version: '3.0.0',
          model: 'qwen2.5-coder:32b',
          dataDir: path.join(process.cwd(), 'data')
        };
      }
      logger.info('✅ Configuration loaded');
      return config;
    } catch (err) {
      logger.error('❌ Failed to load configuration:', err.message);
      throw err;
    }
  }
  
  /**
   * Search the memory graph
   */
  async searchMemory(query) {
    try {
      return await this.searchEngine.searchLeoMemoryGraph(query, memoryGraph);
    } catch (err) {
      logger.error('❌ Error during memory search:', err.message);
      return '';
    }
  }
  
  /**
   * Send prompt to LLM
   */
  async promptLLM(prompt) {
    try {
      logger.info('Sending prompt to LLM...');
      // The local LLM interface now returns a string directly
      const response = await this.localLLMInterface.promptLLM(prompt);
      logger.info('Response received from LLM');
      return response;
    } catch (err) {
      logger.error('❌ Error during LLM prompt:', err.message);
      throw err;
    }
  }
}

/**
 * Initialize Leo runtime: LLM, memory, config, logging
 */
async function initializeLeo() {
  if (initialized) {
    logger.info('Leo runtime already initialized');
    return;
  }
  
  logger.info('[LEO_RUNTIME_DEBUG] Entered initializeLeo()');
  
  try {
    // Create runtime instance
    leoRuntime = new LeoRuntime();
    
    // Load dependencies first
    await leoRuntime.loadDependencies();
    
    // Then initialize in the correct order
    await leoRuntime.loadConfiguration();
    await leoRuntime.initializeLLM();
    await leoRuntime.loadMemoryGraph();
    
    initialized = true;
    logger.info('✅ Leo runtime initialization complete.');
  } catch (err) {
    logger.error('❌ Leo runtime initialization failed:', err.message);
    throw err;
  }
}

/**
 * Process a prompt using Leo: performs memory search, adds context, sends to LLM
 * @param {string} input - user query
 * @returns {Promise<string>} - full response
 */
async function runLeoPrompt(input) {
  logger.info('[LEO_RUNTIME_DEBUG] Entered runLeoPrompt()');

  if (!input || typeof input !== 'string') {
    logger.error('Invalid input provided to runLeoPrompt');
    return 'Error: Invalid input provided';
  }

  try {
    // Make sure runtime is initialized
    if (!initialized || !leoRuntime) {
      logger.warn('⚠️ Leo runtime not initialized. Initializing now...');
      await initializeLeo();
    }

    // Search the memory graph
    let context;
    try {
      context = await leoRuntime.searchMemory(input);
      if (context && typeof context === 'string') {
        logger.info(`Retrieved ${context.length} bytes of context`);
      } else {
        logger.warn('No usable context retrieved from memory search');
        context = '';
      }
    } catch (err) {
      logger.error('Error during memory search:', err.message);
      context = '';
    }

    // Compose the prompt with context if available
    const composedPrompt = `${context ? context + '\n\n' : ''}${input}`;
    logger.debug('📝 Composed Prompt:\n' + composedPrompt);

    // Send to LLM
    const rawOutput = await leoRuntime.promptLLM(composedPrompt);
    
    // Apply routing logic
    const finalOutput = await route(rawOutput, {
      input,
      context,
      prompt: composedPrompt,
      model: config?.model || 'qwen2.5-coder:32b',
      config,
      memoryGraph,
    });

    return finalOutput;
  } catch (err) {
    logger.error('Unexpected error in runLeoPrompt:', err);
    return `An unexpected error occurred: ${err.message}`;
  }
}

// Add readline for interactive prompt
const readline = require('readline');

/**
 * Start an interactive prompt session with Leo
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

// Initialize on module load and start interactive prompt if this file is run directly
if (require.main === module) {
  initializeLeo()
    .then(() => {
      startInteractivePrompt();
    })
    .catch(err => {
      logger.error('Failed to initialize Leo runtime on module load:', err.message);
    });
} else {
  // Just initialize if imported as a module
  initializeLeo().catch(err => {
    logger.error('Failed to initialize Leo runtime on module load:', err.message);
  });
}

module.exports = {
  initializeLeo,
  runLeoPrompt,
  startInteractivePrompt
};
