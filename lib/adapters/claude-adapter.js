/**
 * Claude Adapter for Leo
 * 
 * This adapter provides Claude with direct access to Leo's file system,
 * memory graph, and code execution capabilities. It acts as a bridge 
 * between Claude and Leo's core functionality, enabling Claude to:
 * 
 * 1. Read/write Leo's data files
 * 2. Search Leo's memory graph directly
 * 3. Execute Leo components and tests
 * 
 * @module claude-adapter
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { localSemanticSearch } = require('../services/local-semantic-search');
const { calculateCosineSimilarity } = require('../utils/vector-utils');
const { createComponentLogger } = require('../utils/logger');
const logger = createComponentLogger('claude-adapter');

class ClaudeAdapter {
  constructor() {
    this.initialized = false;
    this.projectRoot = this._findProjectRoot();
    this.dataPath = path.join(this.projectRoot, 'data');
    this.chunksPath = path.join(this.dataPath, 'chunks.jsonl');
    this.embeddingsPath = path.join(this.dataPath, 'embeddings.jsonl');
  }

  /**
   * Find the Leo project root directory
   * @returns {string} The absolute path to the project root
   * @private
   */
  _findProjectRoot() {
    // The adapter is in /lib/adapters, so we go up two levels
    return path.resolve(__dirname, '../../');
  }

  /**
   * Initialize the adapter
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Claude adapter already initialized');
      return true;
    }

    try {
      logger.info('Initializing Claude adapter');
      
      // Ensure semantic search is initialized
      await localSemanticSearch.initialize();
      
      // Override the similarity threshold for better recall
      localSemanticSearch.config.SIMILARITY_THRESHOLD = 0.15;
      
      this.initialized = true;
      logger.info('Claude adapter initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Claude adapter: ${error.message}`);
      logger.debug(error.stack);
      return false;
    }
  }

  /**
   * Read the contents of a file in the Leo project
   * @param {string} relativePath - Path relative to project root
   * @returns {Promise<string>} File contents
   */
  async readFile(relativePath) {
    try {
      const filePath = path.join(this.projectRoot, relativePath);
      return fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      logger.error(`Error reading file ${relativePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write content to a file in the Leo project
   * @param {string} relativePath - Path relative to project root
   * @param {string} content - Content to write
   * @returns {Promise<void>}
   */
  async writeFile(relativePath, content) {
    try {
      const filePath = path.join(this.projectRoot, relativePath);
      const dirPath = path.dirname(filePath);
      
      // Ensure directory exists
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }
      
      await fs.promises.writeFile(filePath, content, 'utf8');
      logger.info(`Successfully wrote to file: ${relativePath}`);
    } catch (error) {
      logger.error(`Error writing to file ${relativePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * List files in a directory
   * @param {string} relativePath - Directory path relative to project root
   * @returns {Promise<string[]>} Array of file names
   */
  async listFiles(relativePath) {
    try {
      const dirPath = path.join(this.projectRoot, relativePath);
      return fs.promises.readdir(dirPath);
    } catch (error) {
      logger.error(`Error listing files in ${relativePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Read all chunks from the chunks.jsonl file
   * @returns {Promise<Array>} Array of chunks
   */
  async readAllChunks() {
    try {
      const chunksData = await fs.promises.readFile(this.chunksPath, 'utf8');
      const lines = chunksData.trim().split('\n');
      
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      logger.error(`Error reading chunks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Read all embeddings from the embeddings.jsonl file
   * @returns {Promise<Array>} Array of embeddings
   */
  async readAllEmbeddings() {
    try {
      const embeddingsData = await fs.promises.readFile(this.embeddingsPath, 'utf8');
      const lines = embeddingsData.trim().split('\n');
      
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      logger.error(`Error reading embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search Leo's memory graph using semantic search
   * @param {string} query - The search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Maximum number of results to return
   * @param {number} options.threshold - Similarity threshold (0-1)
   * @returns {Promise<Object>} Search results
   */
  async searchMemoryGraph(query, options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      logger.info(`Claude searching memory graph for: "${query}"`);
      
      // Apply custom threshold if provided
      if (options.threshold) {
        const originalThreshold = localSemanticSearch.config.SIMILARITY_THRESHOLD;
        localSemanticSearch.config.SIMILARITY_THRESHOLD = options.threshold;
        
        // Restore original threshold after search
        setTimeout(() => {
          localSemanticSearch.config.SIMILARITY_THRESHOLD = originalThreshold;
        }, 1000);
      }
      
      const results = await localSemanticSearch.searchMemoryGraph(query, options);
      
      logger.info(`Memory graph search completed with ${results.results ? results.results.length : 0} results`);
      
      return results;
    } catch (error) {
      logger.error(`Error searching memory graph: ${error.message}`);
      
      // Fallback to direct text search if semantic search fails
      logger.info('Falling back to direct text search');
      return this.directTextSearch(query, options);
    }
  }

  /**
   * Perform a direct text search on chunks as fallback
   * @param {string} query - The search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   * @private
   */
  async directTextSearch(query, options = {}) {
    try {
      const chunks = await this.readAllChunks();
      const queryTerms = query.toLowerCase().split(' ');
      const results = [];
      
      for (const chunk of chunks) {
        const content = (chunk.content || chunk.text || '').toLowerCase();
        
        // Check how many query terms match in the content
        let matchCount = 0;
        for (const term of queryTerms) {
          if (content.includes(term)) {
            matchCount++;
          }
        }
        
        // Calculate simple relevance score based on term matches
        const relevance = matchCount / queryTerms.length;
        
        if (relevance > 0.3) { // At least 30% of terms match
          results.push({
            id: chunk.id,
            content: chunk.content || chunk.text,
            score: relevance,
            metadata: chunk.metadata
          });
        }
      }
      
      // Sort by relevance
      results.sort((a, b) => b.score - a.score);
      
      // Take top results
      const limit = options.limit || 10;
      const topResults = results.slice(0, limit);
      
      return { results: topResults };
    } catch (error) {
      logger.error(`Error in direct text search: ${error.message}`);
      return { results: [] };
    }
  }

  /**
   * Generate an embedding for text using local semantic search
   * @param {string} text - Text to generate embedding for
   * @returns {Promise<Array<number>>} The embedding vector
   */
  async generateEmbedding(text) {
    if (!this.initialized) await this.initialize();
    
    try {
      return await localSemanticSearch.generateEmbedding(text);
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a Node.js script in the Leo project
   * @param {string} scriptPath - Path to script relative to project root
   * @param {Array<string>} args - Command line arguments
   * @returns {string} Command output
   */
  executeScript(scriptPath, args = []) {
    try {
      const fullPath = path.join(this.projectRoot, scriptPath);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Script not found: ${scriptPath}`);
      }
      
      const command = `node "${fullPath}" ${args.join(' ')}`;
      logger.info(`Executing: ${command}`);
      
      const output = execSync(command, { 
        cwd: this.projectRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      return output;
    } catch (error) {
      logger.error(`Error executing script ${scriptPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run a test script
   * @param {string} testPath - Path to test script relative to /tests directory
   * @returns {string} Test output
   */
  runTest(testPath) {
    return this.executeScript(`tests/${testPath}`);
  }

  /**
   * Execute a semantic search test
   * @param {string} query - Query to test
   * @returns {string} Test output
   */
  testSemanticSearch(query) {
    // Create temporary test script
    const tempScript = `temp-semantic-test-${Date.now()}.js`;
    const scriptContent = `
const { localSemanticSearch } = require('./lib/services/local-semantic-search');

async function testSearch() {
  try {
    await localSemanticSearch.initialize();
    localSemanticSearch.config.SIMILARITY_THRESHOLD = 0.15;
    
    console.log('Searching for: "${query}");
    const results = await localSemanticSearch.searchMemoryGraph("${query}", { limit: 5 });
    
    console.log(\`Found \${results.results.length} results\`);
    
    results.results.forEach((item, i) => {
      console.log(\`\\nResult \${i+1} [Relevance: \${item.score ? item.score.toFixed(4) : 'N/A'}]\`);
      console.log(\`Content: \${item.content ? item.content.substring(0, 300) + '...' : 'No content'}\`);
      if (item.metadata) {
        console.log(\`Source: \${item.metadata.source || 'Unknown'}\`);
        console.log(\`Type: \${item.metadata.type || 'Unknown'}\`);
      }
    });
  } catch (error) {
    console.error(\`Error: \${error.message}\`);
    console.error(error.stack);
  }
}

testSearch();
`;

    try {
      // Write temporary script
      fs.writeFileSync(path.join(this.projectRoot, tempScript), scriptContent);
      
      // Execute script
      const result = this.executeScript(tempScript);
      
      // Clean up
      fs.unlinkSync(path.join(this.projectRoot, tempScript));
      
      return result;
    } catch (error) {
      // Ensure cleanup even if there's an error
      try {
        fs.unlinkSync(path.join(this.projectRoot, tempScript));
      } catch (e) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }
}

// Singleton instance
let claudeAdapterInstance = null;

/**
 * Get the Claude Adapter instance
 * @returns {Promise<ClaudeAdapter>} Adapter instance
 */
async function getClaudeAdapter() {
  if (!claudeAdapterInstance) {
    claudeAdapterInstance = new ClaudeAdapter();
    await claudeAdapterInstance.initialize();
  }
  
  return claudeAdapterInstance;
}

module.exports = {
  getClaudeAdapter
};
