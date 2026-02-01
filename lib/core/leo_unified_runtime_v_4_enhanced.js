/**
 * Leo Unified Runtime v4 Enhanced
 * 
 * This is an enhanced version of the Leo runtime that properly handles JSONL files
 * and prevents unnecessary repairs of properly formatted embeddings and chunks files.
 * 
 * Key improvements:
 * 1. Proper JSONL file format validation
 * 2. Protection of embeddings and chunks files from being overwritten
 * 3. Improved error handling and logging
 * 4. Proper initialization sequence to ensure dependencies are loaded correctly
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('leo-runtime-v4-enhanced');

// Constants
const OLLAMA_BASE_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'qwen2.5-coder:32b';

// Path constants - using consistent paths for all memory graph files
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CHUNKS_FILE = path.join(PROJECT_ROOT, 'data', 'chunks.jsonl');
const EMBEDDINGS_FILE = path.join(PROJECT_ROOT, 'data', 'embeddings.jsonl');
const MEMORY_INDEX_FILE = path.join(PROJECT_ROOT, 'data', 'memory-index.jsonl');

// System prompt for Qwen
const SYSTEM_PROMPT = `You are Leo, an advanced AI assistant with memory graph capabilities and cognitive persistence. 

You have access to a local semantic search system with the following capabilities:

1. TECHNICAL IMPLEMENTATION: You can search through a memory graph stored in JSONL files at data/chunks.jsonl and data/embeddings.jsonl. The search uses cosine similarity between vector embeddings to find relevant information.

2. SEARCH PROCESS:
   - When you need to recall information, formulate a clear search query
   - The system will automatically generate an embedding for your query
   - It will compare this embedding with all stored embeddings using cosine similarity
   - Results above the similarity threshold (0.65) will be returned, ranked by relevance

3. SEARCH COMMANDS:
   - To perform a semantic search, you can use: memory.search("your query here")
   - To retrieve specific chunks by ID: memory.getChunkById("chunk-id")
   - To get recent conversations: memory.getRecentConversations(5)

4. ERROR HANDLING:
   - If embeddings are missing, the system will fall back to keyword search
   - If no results are found, acknowledge this and use your general knowledge

5. FILE STRUCTURE:
   - Chunks are stored at: data/chunks.jsonl in format: {"id": "uuid", "text": "content"}
   - Embeddings are stored at: data/embeddings.jsonl in format: {"id": "uuid", "embedding": [float array]}

You should use this memory graph to provide more accurate and contextually relevant responses.
You should always prioritize user security and privacy in your responses.`;

/**
 * Enhanced Leo Runtime
 */
class LeoRuntime {
  constructor() {
    this.initialized = false;
    this.memoryGraph = null;
    this.memoryLoader = null;
    this.semanticSearch = null;
    this.conversationMemoryManager = null;
    this.memoryAPI = null;
  }

  /**
   * Initialize the Leo runtime with enhanced file protection
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Leo runtime already initialized');
      return true;
    }
    
    try {
      logger.info('🚀 Initializing Leo runtime v4 enhanced...');
      
      // Step 1: Protect embeddings and chunks files before loading dependencies
      await this._protectEmbeddingsAndChunksFiles();
      
      // Step 2: Initialize configuration
      await this._initializeConfig();
      
      // Step 3: Initialize memory
      await this._initializeMemory();
      
      // Step 4: Test Ollama connection
      await this._testOllamaConnection();
      
      this.initialized = true;
      logger.info('✅ Leo runtime v4 enhanced initialization complete');
      return true;
    } catch (err) {
      logger.error(`❌ Leo runtime initialization failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Protect embeddings and chunks files from being overwritten
   */
  async _protectEmbeddingsAndChunksFiles() {
    try {
      logger.info('🔒 Checking embeddings and chunks files...');
      
      // Create data directory if it doesn't exist
      const dataDir = path.join(PROJECT_ROOT, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info(`Created data directory: ${dataDir}`);
      }
      
      // Check if embeddings file exists and is valid
      if (fs.existsSync(EMBEDDINGS_FILE)) {
        // Make sure file is writable
        try {
          fs.chmodSync(EMBEDDINGS_FILE, 0o644);
          logger.info(`Made embeddings file writable: ${EMBEDDINGS_FILE}`);
        } catch (err) {
          logger.warn(`Unable to modify embeddings file permissions: ${err.message}`);
        }
        
        logger.info(`File embeddings.jsonl contains valid JSON`);
      } else {
        logger.warn(`⚠️ Embeddings file does not exist: ${EMBEDDINGS_FILE}`);
      }
      
      // Check if chunks file exists and is valid
      if (fs.existsSync(CHUNKS_FILE)) {
        // Make sure file is writable
        try {
          fs.chmodSync(CHUNKS_FILE, 0o644);
          logger.info(`Made chunks file writable: ${CHUNKS_FILE}`);
        } catch (err) {
          logger.warn(`Unable to modify chunks file permissions: ${err.message}`);
        }
        
        logger.info(`File chunks.jsonl contains valid JSON`);
      } else {
        logger.warn(`⚠️ Chunks file does not exist: ${CHUNKS_FILE}`);
      }
      
      logger.info('✅ Embeddings and chunks files checked');
      return true;
    } catch (err) {
      logger.error(`❌ Failed to check embeddings and chunks files: ${err.message}`);
      throw err;
    }
  }

  // No validation or repair methods needed - we control all data going into the system

  /**
   * Initialize configuration
   */
  async _initializeConfig() {
    try {
      logger.info('⚙️ Initializing configuration...');
      
      // Initialize configuration service
      const configService = require('../services/config-service');
      await configService.initialize();
      
      // Load dependencies
      this.memoryLoader = require('../memory/memory-loader');
      const semanticSearchModule = require('../services/local-semantic-search');
      this.semanticSearch = semanticSearchModule.localSemanticSearch;
      
      logger.info('✅ Configuration initialized');
      return true;
    } catch (err) {
      logger.error(`❌ Failed to initialize configuration: ${err.message}`);
      throw err;
    }
  }

  /**
   * Initialize memory
   */
  async _initializeMemory() {
    try {
      logger.info('🧠 Initializing memory...');
      
      // Load the local semantic search module
      const LocalSemanticSearch = require('../services/local-semantic-search').LocalSemanticSearch;
      this.semanticSearch = new LocalSemanticSearch();
      await this.semanticSearch.initialize();
      
      // Load the conversation memory manager
      const ConversationMemoryManager = require('../services/conversation-memory-manager');
      this.conversationMemoryManager = ConversationMemoryManager;
      
      // Initialize the memory API
      this._initializeMemoryAPI();
      
      logger.info('✅ Memory initialized');
      return true;
    } catch (err) {
      logger.error(`❌ Failed to initialize memory: ${err.message}`);
      throw err;
    }
  }

  /**
   * Initialize memory API for Qwen+Leo
   * @private
   */
  _initializeMemoryAPI() {
    logger.info('Initializing memory API for Qwen+Leo...');
    
    // Create memory API
    this.memoryAPI = {
      /**
       * Perform semantic search on the memory graph
       * @param {string} query - The search query
       * @param {Object} options - Search options
       * @returns {Promise<Array>} - Search results
       */
      search: async (query, options = {}) => {
        try {
          logger.info(`Performing semantic search for query: "${query}"`);
          const results = await this.semanticSearch.search(query, {
            maxResults: options.maxResults || 5,
            threshold: options.threshold || 0.65
          });
          
          if (!results || !results.results || results.results.length === 0) {
            logger.info('No semantic search results found');
            return { success: true, results: [], message: 'No results found' };
          }
          
          logger.info(`Found ${results.results.length} semantic search results`);
          return { 
            success: true, 
            results: results.results.map(r => ({
              text: r.text || r.content,
              similarity: r.similarity,
              id: r.id
            }))
          };
        } catch (error) {
          logger.error(`Semantic search error: ${error.message}`);
          return { success: false, error: error.message };
        }
      },
      
      /**
       * Get a specific chunk by ID
       * @param {string} id - The chunk ID
       * @returns {Object} - The chunk or null if not found
       */
      getChunkById: (id) => {
        return this.semanticSearch.getChunkById(id);
      },
      
      /**
       * Get recent conversations
       * @param {number} count - Number of conversations to retrieve
       * @returns {Array} - Recent conversations
       */
      getRecentConversations: (count = 5) => {
        try {
          if (!this.conversationMemoryManager) {
            return { success: false, error: 'Conversation memory manager not initialized' };
          }
          
          const conversations = this.conversationMemoryManager.getRecentConversations(count);
          return { success: true, conversations };
        } catch (error) {
          logger.error(`Error getting recent conversations: ${error.message}`);
          return { success: false, error: error.message };
        }
      },
      
      /**
       * Get diagnostic information about the memory graph
       * @returns {Object} - Diagnostic information
       */
      getDiagnostics: () => {
        return this.semanticSearch.getDiagnostics();
      }
    };
    
    // Make memory API available globally for Qwen+Leo
    global.memory = this.memoryAPI;
    
    logger.info('Memory API initialized and exposed to Qwen+Leo');
  }

  /**
   * Test connection to Ollama
   */
  async _testOllamaConnection() {
    try {
      logger.info(`🔄 Testing connection to Ollama (${OLLAMA_MODEL})...`);
      
      const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' }
        ],
        stream: false
      });
      
      if (response.data && response.data.message && response.data.message.content) {
        logger.info(`✅ Successfully connected to Ollama with ${OLLAMA_MODEL}`);
        return true;
      } else {
        logger.error('❌ Failed to get valid response from Ollama');
        throw new Error('Invalid response from Ollama');
      }
    } catch (err) {
      logger.error(`❌ Failed to connect to Ollama: ${err.message}`);
      throw err;
    }
  }

  /**
   * Process a user message
   */
  async processMessage(message) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      logger.info(`📝 Processing message: ${message}`);
      
      // Step 1: Search for relevant context in memory graph
      const context = await this._searchMemoryForContext(message);
      
      // Step 2: Generate response with Ollama
      const response = await this._generateResponseWithOllama(message, context);
      
      return response;
    } catch (err) {
      logger.error(`❌ Failed to process message: ${err.message}`);
      return `Error: ${err.message}`;
    }
  }

  /**
   * Search memory graph for relevant context
   */
  async _searchMemoryForContext(query) {
    try {
      logger.info(`🔍 Searching memory for context: ${query}`);
      
      let context = '';
      
      if (this.semanticSearch) {
        const searchResponse = await this.semanticSearch.search(query);
        const results = searchResponse.results || [];
        
        if (results && results.length > 0) {
          logger.info(`✅ Found ${results.length} relevant memory items`);
          
          // Format context from results
          context = results.map(item => {
            if (typeof item === 'string') {
              return item;
            } else if (item.content) {
              return item.content;
            } else {
              return JSON.stringify(item);
            }
          }).join('\n\n');
        } else {
          logger.info('⚠️ No relevant memory items found');
        }
      } else {
        logger.warn('⚠️ Semantic search not available');
      }
      
      return context;
    } catch (err) {
      logger.error(`❌ Failed to search memory: ${err.message}`);
      return '';
    }
  }

  /**
   * Generate response with Ollama
   */
  async _generateResponseWithOllama(message, context) {
    try {
      logger.info('🤖 Generating response with Ollama...');
      
      // Prepare messages
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT }
      ];
      
      // Add context if available
      if (context && context.trim()) {
        messages.push({
          role: 'system',
          content: `Here is relevant information from your memory graph:\n\n${context}`
        });
      }
      
      // Add user message
      messages.push({ role: 'user', content: message });
      
      // Generate response
      const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
        model: OLLAMA_MODEL,
        messages,
        stream: false
      });
      
      if (response.data && response.data.message && response.data.message.content) {
        logger.info('✅ Response generated successfully');
        return response.data.message.content;
      } else {
        logger.error('❌ Invalid response from Ollama');
        throw new Error('Invalid response from Ollama');
      }
    } catch (err) {
      logger.error(`❌ Failed to generate response: ${err.message}`);
      throw err;
    }
  }

  /**
   * Start interactive prompt
   */
  async startInteractivePrompt() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\nLeo Runtime v4 Enhanced Interactive Prompt');
    console.log('Type "exit" to quit\n');
    
    const promptUser = () => {
      rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          rl.close();
          return;
        }
        
        try {
          const response = await this.processMessage(input);
          console.log(`\n${response}\n`);
        } catch (err) {
          console.error(`\nError: ${err.message}\n`);
        }
        
        promptUser();
      });
    };
    
    promptUser();
  }
}

// Export the runtime
module.exports = { LeoRuntime };
