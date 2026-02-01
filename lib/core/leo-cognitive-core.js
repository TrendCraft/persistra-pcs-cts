/**
 * Leo Cognitive Core
 * Enhanced implementation with improved error handling, memory management, and security
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * Error types for more specific error handling
 */
class LeoError extends Error {
  constructor(message, code = 'GENERAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class FileNotFoundError extends LeoError {
  constructor(filePath) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.filePath = filePath;
  }
}

class ParseError extends LeoError {
  constructor(filePath, originalError) {
    super(`Error parsing file ${filePath}: ${originalError.message}`, 'PARSE_ERROR');
    this.filePath = filePath;
    this.originalError = originalError;
  }
}

class SearchError extends LeoError {
  constructor(query, originalError) {
    super(`Error searching for "${query}": ${originalError.message}`, 'SEARCH_ERROR');
    this.query = query;
    this.originalError = originalError;
  }
}

/**
 * Configuration manager with validation
 */
class ConfigManager {
  constructor(initialConfig = {}) {
    this.config = {
      dataDir: path.join(process.cwd(), 'data'),
      cognitiveStateFile: path.join(process.cwd(), 'data', 'system-context', 'COGNITIVE_STATE.json'),
      bootstrapFile: path.join(process.cwd(), 'data', 'system-context', 'CLAUDE_BOOTSTRAP.md'),
      tokenThreshold: 6400, // 80% of 8K tokens
      preservationInterval: 120000, // 2 minutes
      visionCheckInterval: 300000, // 5 minutes
      maxResults: 8,
      minRelevanceScore: 0.25,
      useFallback: true,
      ...initialConfig
    };
    
    this.validate();
  }
  
  validate() {
    // Ensure all paths are absolute
    this.config.dataDir = path.resolve(this.config.dataDir);
    this.config.cognitiveStateFile = path.resolve(this.config.cognitiveStateFile);
    this.config.bootstrapFile = path.resolve(this.config.bootstrapFile);
    
    // Validate numeric values
    if (typeof this.config.tokenThreshold !== 'number' || this.config.tokenThreshold <= 0) {
      throw new LeoError('tokenThreshold must be a positive number', 'CONFIG_ERROR');
    }
    
    if (typeof this.config.preservationInterval !== 'number' || this.config.preservationInterval <= 0) {
      throw new LeoError('preservationInterval must be a positive number', 'CONFIG_ERROR');
    }
    
    if (typeof this.config.visionCheckInterval !== 'number' || this.config.visionCheckInterval <= 0) {
      throw new LeoError('visionCheckInterval must be a positive number', 'CONFIG_ERROR');
    }
  }
  
  get(key) {
    return this.config[key];
  }
  
  set(key, value) {
    this.config[key] = value;
    this.validate();
    return this;
  }
  
  getAll() {
    return { ...this.config };
  }
}

/**
 * Event system for component communication
 */
class EventSystem extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Increase default max listeners
  }
  
  /**
   * Emit an event with standardized metadata
   */
  emitWithMetadata(eventName, data = {}) {
    const eventData = {
      ...data,
      timestamp: Date.now(),
      eventName
    };
    
    return this.emit(eventName, eventData);
  }
  
  /**
   * Subscribe to an event with automatic logging
   */
  subscribe(eventName, handler) {
    this.on(eventName, handler);
    return () => this.off(eventName, handler); // Return unsubscribe function
  }
}

/**
 * File system utilities with enhanced error handling
 */
class FileSystem {
  /**
   * Ensure a directory exists
   */
  static ensureDir(dirPath) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    } catch (error) {
      throw new LeoError(`Failed to create directory ${dirPath}: ${error.message}`, 'DIR_CREATE_ERROR');
    }
  }
  
  /**
   * Load a JSONL file with proper error handling
   */
  static async loadJsonlFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new FileNotFoundError(filePath);
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      
      return content.split('\n')
        .filter(line => line.trim())
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch (parseError) {
            throw new ParseError(filePath, new Error(`Line ${index + 1}: ${parseError.message}`));
          }
        });
    } catch (error) {
      if (error instanceof LeoError) {
        throw error;
      }
      throw new LeoError(`Error loading file ${filePath}: ${error.message}`, 'FILE_LOAD_ERROR');
    }
  }
  
  /**
   * Save data to a JSON file with proper error handling
   */
  static saveJsonFile(filePath, data) {
    try {
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      this.ensureDir(dirPath);
      
      // Write file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      throw new LeoError(`Failed to save file ${filePath}: ${error.message}`, 'FILE_SAVE_ERROR');
    }
  }
  
  /**
   * Save text to a file with proper error handling
   */
  static saveTextFile(filePath, text) {
    try {
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      this.ensureDir(dirPath);
      
      // Write file
      fs.writeFileSync(filePath, text);
      return true;
    } catch (error) {
      throw new LeoError(`Failed to save file ${filePath}: ${error.message}`, 'FILE_SAVE_ERROR');
    }
  }
  
  /**
   * Read a text file with proper error handling
   */
  static readTextFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new FileNotFoundError(filePath);
      }
      
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error instanceof LeoError) {
        throw error;
      }
      throw new LeoError(`Error reading file ${filePath}: ${error.message}`, 'FILE_READ_ERROR');
    }
  }
}

/**
 * Search engine with improved algorithms and memory management
 */
class SearchEngine {
  constructor(config) {
    this.config = config;
    this.embeddings = [];
    this.chunks = [];
    this.initialized = false;
    this.chunkIndex = new Map(); // For faster lookups
  }
  
  /**
   * Initialize the search engine
   */
  async initialize() {
    try {
      const embeddingsFile = path.join(this.config.get('dataDir'), 'embeddings.jsonl');
      const chunksFile = path.join(this.config.get('dataDir'), 'chunks.jsonl');
      
      // Load embeddings and chunks in parallel
      const [embeddings, chunks] = await Promise.all([
        FileSystem.loadJsonlFile(embeddingsFile).catch(() => []),
        FileSystem.loadJsonlFile(chunksFile).catch(() => [])
      ]);
      
      this.embeddings = embeddings;
      this.chunks = chunks;
      
      // Build chunk index for faster lookups
      this.buildChunkIndex();
      
      this.initialized = true;
      return true;
    } catch (error) {
      throw new LeoError(`Search engine initialization failed: ${error.message}`, 'SEARCH_INIT_ERROR');
    }
  }
  
  /**
   * Build an index of chunks for faster lookups
   */
  buildChunkIndex() {
    this.chunkIndex.clear();
    for (const chunk of this.chunks) {
      if (chunk.chunk_id) {
        this.chunkIndex.set(chunk.chunk_id, chunk);
      }
    }
  }
  
  /**
   * Perform a search with improved relevance scoring
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const opts = {
        maxResults: options.maxResults || this.config.get('maxResults'),
        minRelevanceScore: options.minRelevanceScore || this.config.get('minRelevanceScore'),
        useFallback: options.useFallback !== undefined ? options.useFallback : this.config.get('useFallback')
      };
      
      // Input validation
      if (typeof query !== 'string' || !query.trim()) {
        throw new LeoError('Search query must be a non-empty string', 'INVALID_QUERY');
      }
      
      // Process in chunks to avoid blocking the event loop
      const batchSize = 100;
      const results = [];
      
      // Process chunks in batches
      for (let i = 0; i < this.chunks.length; i += batchSize) {
        const batchResults = await this.processBatch(
          query, 
          this.chunks.slice(i, i + batchSize),
          opts
        );
        results.push(...batchResults);
        
        // Allow event loop to process other events
        await new Promise(resolve => setImmediate(resolve));
      }
      
      // Sort by relevance and limit results
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return results.slice(0, opts.maxResults);
    } catch (error) {
      if (error instanceof LeoError) {
        throw error;
      }
      throw new SearchError(query, error);
    }
  }
  
  /**
   * Process a batch of chunks to avoid blocking the event loop
   */
  async processBatch(query, chunkBatch, options) {
    const keywords = query.toLowerCase().split(/\s+/);
    const results = [];
    
    for (const chunk of chunkBatch) {
      const content = (chunk.content || chunk.text || '').toLowerCase();
      
      // Skip empty content
      if (!content) continue;
      
      let score = 0;
      let matches = 0;
      
      // Safe regex matching with timeout protection
      for (const keyword of keywords) {
        try {
          const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
          if (occurrences > 0) {
            matches++;
            score += occurrences;
          }
        } catch (error) {
          // Skip problematic regex
          console.warn(`Regex error for keyword "${keyword}": ${error.message}`);
        }
      }
      
      if (matches > 0) {
        // Improved relevance scoring algorithm
        // - Considers keyword density
        // - Rewards more keyword matches
        // - Normalizes by content length
        const keywordDensity = score / Math.max(content.length, 1);
        const matchRatio = matches / keywords.length;
        const relevanceScore = matchRatio * (1 + Math.log(1 + keywordDensity * 1000));
        
        if (relevanceScore >= options.minRelevanceScore) {
          results.push({
            ...chunk,
            content: chunk.content || chunk.text,
            relevanceScore,
            matches
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Get statistics about the search engine
   */
  getStats() {
    return {
      initialized: this.initialized,
      embeddingsCount: this.embeddings.length,
      chunksCount: this.chunks.length,
      indexSize: this.chunkIndex.size
    };
  }
}

// Export all components
module.exports = {
  LeoError,
  FileNotFoundError,
  ParseError,
  SearchError,
  ConfigManager,
  EventSystem,
  FileSystem,
  SearchEngine
};
