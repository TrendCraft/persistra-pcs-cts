// leo2/core/memory/memoryGraph.js

const path = require('path');
const { memoryManager } = require('../../../lib/services/memory-manager.js');
const legacyGraph = require('../../../lib/services/memory-graph-integration.js');

const fs = require('fs');

// Module-level loaded flag to prevent repeated loading
let _quantumDataLoaded = false;
let _cachedQuantumData = [];

/**
 * MemoryGraph - Manages semantic memory search and retrieval
 * 
 * Provides hybrid retrieval combining BM25 lexical search with vector similarity.
 * Falls back gracefully when embeddings are missing.
 */
class MemoryGraph {
  constructor(options = {}) {
    this.embeddings = options.embeddings || require('../../../lib/services/true-semantic-embeddings.js');
    this._initLog();
    this.legacy = legacyGraph;
    this._interactions = [];
    this._interactionsPath = path.join(path.resolve(__dirname, '../../'), 'data', 'interactions.json');
    const logger = require('../../../lib/utils/logger');
    logger.debug('[MemoryGraph] [DEBUG] Constructor: _interactionsPath =', this._interactionsPath, 'leo2_root =', path.resolve(__dirname, '../../'));
    this._loadInteractionsFromDisk();

    // --- Embeddings Initialization Guarantee ---
    if (this.embeddings && typeof this.embeddings.initialize === 'function') {
      try {
        const maybePromise = this.embeddings.initialize();
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(() => {
            const logger = require('../../../lib/utils/logger');
            logger.info('[Leo] Embeddings initialized successfully.');
          }).catch(err => {
            const logger = require('../../../lib/utils/logger');
          logger.error('[Leo] Embeddings initialization FAILED:', err);
            // Optionally: process.exit(1);
          });
        } else {
          const logger = require('../../../lib/utils/logger');
        logger.info('[Leo] Embeddings initialized (non-async).');
        }
      } catch (err) {
        const logger = require('../../../lib/utils/logger');
      logger.error('[Leo] Embeddings initialization threw synchronously:', err);
        // Optionally: process.exit(1);
      }
    } else {
      const logger = require('../../../lib/utils/logger');
    logger.error('[Leo] Embeddings interface does not have an initialize() method!');
    }
    // --- End Embeddings Initialization Guarantee ---

    // Optionally initialize the legacy object if needed
    if (typeof this.legacy.initialize === 'function') {
      this.legacy.initialize({ embeddings: this.embeddings, ...options });
    }
  }

  _loadInteractionsFromDisk() {
    try {
      if (fs.existsSync(this._interactionsPath)) {
        const raw = fs.readFileSync(this._interactionsPath, 'utf8');
        this._interactions = JSON.parse(raw);
        console.log(`[MemoryGraph] [INFO] Loaded ${this._interactions.length} interactions from disk`);
      } else {
        this._interactions = [];
      }
    } catch (err) {
      console.warn('[MemoryGraph] [WARN] Failed to load interactions from disk:', err.message);
      this._interactions = [];
    }
  }

  _saveInteractionsToDisk() {
    try {
      const dir = path.dirname(this._interactionsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      console.log('[MemoryGraph] [DEBUG] Writing interactions to', this._interactionsPath, 'leo2_root =', path.resolve(__dirname, '../../'));
      let jsonStr;
    try {
      jsonStr = JSON.stringify(this._interactions, null, 2);
    } catch (err) {
      console.error('[MemoryGraph] [ERROR] Failed to stringify interactions (possible circular reference):', err.message);
      // Try to diagnose the structure
      console.log('[MemoryGraph] [DEBUG] Interactions array length:', this._interactions.length);
      if (this._interactions.length > 0) {
        console.log('[MemoryGraph] [DEBUG] First interaction keys:', Object.keys(this._interactions[0] || {}));
      }
      return;
    }
      fs.writeFileSync(this._interactionsPath, jsonStr, 'utf8');
      console.log(`[MemoryGraph] [INFO] Saved ${this._interactions.length} interactions to disk`);
    } catch (err) {
      console.error('[MemoryGraph] [ERROR] Failed to save interactions to disk:', err.message);
    }
  }

  _initLog() {
    console.log('[MemoryGraph] [INFO] Initialized MemoryGraph');
  }

  /**
   * getAllChunks - Loads and returns all code/document chunks for semantic search.
   * Loads from data/chunks.jsonl and merges embeddings from data/embeddings.jsonl if present.
   * Results are cached for efficiency unless options.reload is true.
   */
  async getAllChunks(options = {}) {
    // Check module-level cache first for demo performance (skip if env override)
    if (_quantumDataLoaded && _cachedQuantumData && !options.reload && !process.env.LEO_CHUNKS_FILE) {
      return _cachedQuantumData;
    }
    
    // Force reload to apply new filtering
    if (!this._chunksCache || options.reload) {
      // CRITICAL FIX: Use correct data directory path for leo2
      const projectRoot = path.resolve(__dirname, '../../'); // Go up from core/memory to leo2 root
      const dataDir = path.join(projectRoot, 'data');
      
      console.log(`[MemoryGraph] [DEBUG] Project root: ${projectRoot}`);
      console.log(`[MemoryGraph] [DEBUG] Data directory: ${dataDir}`);
      
      // Use environment variable or fallback to production embeddings file
      const embeddingsPath = (process.env.LEO_EMBEDDINGS_FILE || process.env.LEO_EMBEDDINGS_PATH) 
        ?? path.join(dataDir, 'embeddings_production.jsonl');
      
      let chunks = [];
      let embeddingsMap = new Map();
      // Initialize bulletproof embeddings service
      try {
        const { getEmbeddingsInterface } = require('../../boot/embeddings-factory');
        this.embeddings = getEmbeddingsInterface();
        console.log('[MemoryGraph] [INFO] Bulletproof embeddings service initialized');
      } catch (error) {
        console.warn('[MemoryGraph] [WARN] Failed to initialize embeddings factory:', error.message);
        this.embeddings = null;
      }
      // Load embeddings if available
      try {
        if (fs.existsSync(embeddingsPath)) {
          const lines = fs.readFileSync(embeddingsPath, 'utf8').split('\n').filter(Boolean);
          console.log(`[MemoryGraph] [INFO] Loading embeddings from: ${embeddingsPath}`);
          console.log(`[MemoryGraph] [INFO] Found ${lines.length} embedding lines to process`);
          
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.id && obj.vector) {
                embeddingsMap.set(obj.id, obj.vector);
              } else if (obj.id && obj.embedding) {
                embeddingsMap.set(obj.id, obj.embedding);
              }
            } catch (err) {
              const logger = require('../../../lib/utils/logger');
              logger.warn('[MemoryGraph] [WARN] Malformed line in embeddings.jsonl:', err.message);
            }
          }
          
          console.log(`[MemoryGraph] [INFO] Successfully loaded ${embeddingsMap.size} embeddings into memory`);
          
          // Validate minimum embeddings count (relaxed for development)
          if (embeddingsMap.size < 100) {
            const logger = require('../../../lib/utils/logger');
            logger.warn(`[MemoryGraph] Few embeddings loaded (${embeddingsMap.size}). Consider setting LEO_EMBEDDINGS_PATH to the production file for better search quality.`);
          }
          
          const logger = require('../../../lib/utils/logger');
          logger.info(`[MemoryGraph] [INFO] Successfully loaded ${embeddingsMap.size} embeddings into memory`);
        } else {
          console.log(`[MemoryGraph] [WARN] Embeddings file not found: ${embeddingsPath}`);
        }
      } catch (embErr) {
        const logger = require('../../../lib/utils/logger');
        logger.warn('[MemoryGraph] [WARN] Failed to load embeddings:', embErr.message);
        console.log(`[MemoryGraph] [WARN] Failed to load embeddings: ${embErr.message}`);
      }
      // Load chunks - prioritize leo memory graph with quantum research data
      try {
        let chunksFiles = [];
        const logger = require('../../../lib/utils/logger');
        
        // Define actual file paths using correct data directory
        const leoMemoryGraphPath = path.join(dataDir, 'leo_memory_graph.jsonl');
        // Load quantum research memory graph (contains htlogicalgates data)
        const quantumResearchMemoryPath = path.join(path.resolve(__dirname, '../../../data'), 'quantum_research_memory_graph.jsonl');
        // Use ONLY curated quantum research data to avoid duplicates
        const quantumCuratedPath = path.join(dataDir, 'quantum_research', 'quantum_research_curated.jsonl');
        const chunksBackupPath = path.join(dataDir, 'chunks.backup.20250804132848.jsonl');
        
        // CRITICAL: Check for environment variable override for chunks file - use ONLY this if specified
        const envChunksFile = process.env.LEO_CHUNKS_FILE;
        if (envChunksFile && fs.existsSync(envChunksFile)) {
          console.log(`[MemoryGraph] [DEBUG] Using ONLY environment override chunks file: ${envChunksFile}`);
          chunksFiles.push(envChunksFile);
        } else {
          // Load curated quantum research data FIRST (contains htlogicalgates data)
          console.log(`[MemoryGraph] [DEBUG] Checking curated quantum research path: ${quantumCuratedPath}`);
          if (fs.existsSync(quantumCuratedPath)) {
            chunksFiles.push(quantumCuratedPath);
            logger.info('[MemoryGraph] [INFO] Loading curated quantum research data (12,495 entries with htlogicalgates)');
            console.log('[MemoryGraph] [INFO] Loading curated quantum research data (12,495 entries with htlogicalgates)');
          } else {
            console.log('[MemoryGraph] [WARN] Curated quantum research file not found');
          }

          // Load leo memory graph (additional context)
          console.log(`[MemoryGraph] [DEBUG] Checking leo memory graph: ${leoMemoryGraphPath}`);
          if (fs.existsSync(leoMemoryGraphPath)) {
            chunksFiles.push(leoMemoryGraphPath);
            logger.info('[MemoryGraph] [INFO] Loading leo memory graph with additional context');
            console.log('[MemoryGraph] [INFO] Loading leo memory graph with additional context');
          } else {
            console.log('[MemoryGraph] [DEBUG] Leo memory graph file not found (not required)');
          }
        }
        
        // Check for backup chunks file (optional)
        console.log(`[MemoryGraph] [DEBUG] Checking backup chunks: ${chunksBackupPath}`);
        if (fs.existsSync(chunksBackupPath)) {
          chunksFiles.push(chunksBackupPath);
          logger.info('[MemoryGraph] [INFO] Loading backup chunks for additional coverage');
          console.log('[MemoryGraph] [INFO] Loading backup chunks for additional coverage');
        } else {
          console.log('[MemoryGraph] [DEBUG] Optional backup chunks file not found (not required)');
        }
        
        // Load all available memory sources
        for (const chunksFile of chunksFiles) {
          try {
            const logger = require('../../../lib/utils/logger');
            logger.info(`[MemoryGraph] [DEBUG] Loading file: ${chunksFile}`);
            console.log(`[MemoryGraph] [DEBUG] Loading file: ${chunksFile}`);
            const data = fs.readFileSync(chunksFile, 'utf8');
            const lines = data.split('\n').filter(Boolean);
            logger.info(`[MemoryGraph] [DEBUG] File has ${lines.length} lines`);
            console.log(`[MemoryGraph] [DEBUG] File has ${lines.length} lines`);
            for (const line of lines) {
              try {
                const obj = JSON.parse(line);
                
                // Skip system files and corrupted data
                if (!obj.id || obj.id.includes('.ds_store') || obj.id.includes('.DS_Store') || 
                    (obj.file && (obj.file.includes('.DS_Store') || obj.file.includes('.ds_store')))) {
                  const logger = require('../../../lib/utils/logger');
                  logger.info(`[MemoryGraph] [FILTER] Skipping system file: ${obj.id}`);
                  continue;
                }
                
                // Handle quantum research data format OR environment override file
                if (chunksFile === quantumCuratedPath || chunksFile === leoMemoryGraphPath || chunksFile === envChunksFile) {
                  // Quantum research files and environment override files have their own format
                  // Ensure proper type fields for semantic search
                  if (!obj.type && obj.metadata && obj.metadata.quantum_domain) {
                    obj.type = 'quantum_research';
                  }
                  if (!obj.chunk_type) {
                    obj.chunk_type = obj.type || 'quantum_research';
                  }
                  // Add quantum domain as searchable metadata
                  if (obj.metadata && obj.metadata.quantum_domain) {
                    obj.quantum_domain = obj.metadata.quantum_domain;
                  }
                  
                  // CRITICAL FIX: Merge embedding if available for quantum research chunks
                  if (obj.id && embeddingsMap.has(obj.id)) {
                    obj.embedding = embeddingsMap.get(obj.id);
                    logger.debug(`[MemoryGraph] [DEBUG] Merged embedding for quantum chunk: ${obj.id}`);
                  }
                  
                  chunks.push(obj);
                } else {
                  // Handle other chunk formats
                  // Skip system files and corrupted data
                  if (obj.content && obj.content.includes('\u0000')) {
                    continue; // Skip binary/corrupted content
                  }
                  
                  // Merge embedding if available
                  if (obj.id && embeddingsMap.has(obj.id)) {
                    obj.embedding = embeddingsMap.get(obj.id);
                  }
                  
                  chunks.push(obj);
                }
              } catch (parseErr) {
                const logger = require('../../../lib/utils/logger');
                logger.warn(`[MemoryGraph] [WARN] Malformed line in ${chunksFile}:`, parseErr.message);
              }
            }
          } catch (fileErr) {
            const logger = require('../../../lib/utils/logger');
            logger.error(`[MemoryGraph] [ERROR] Failed to load chunks file ${chunksFile}:`, fileErr.message);
          }
        }
      } catch (chunkErr) {
        const logger = require('../../../lib/utils/logger');
        logger.error('[MemoryGraph] [ERROR] Failed to load chunks:', chunkErr.message);
      }
      this._chunksCache = chunks;
      
      // Set module-level cache for demo performance
      _cachedQuantumData = chunks;
      _quantumDataLoaded = true;
      
      const logger = require('../../../lib/utils/logger');
      logger.info(`[MemoryGraph] [INFO] Loaded ${chunks.length} chunks for semantic search.`);
    }
    return this._chunksCache;
  }

  /**
   * Ensure quantum research data is loaded (idempotent)
   * Short-circuits on subsequent calls for demo performance
   */
  async ensureLoaded() {
    if (_quantumDataLoaded && _cachedQuantumData) {
      return _cachedQuantumData;
    }
    return await this.getAllChunks({ reload: false });
  }

  /**
   * Search semantic memories using hybrid retrieval (BM25 + vector) with fallback
   * @param {Object} params - { query: string, limit?: number }
   * @returns {Promise<Array>} Results
   */
  async searchMemories(params) {
    const { query, limit = 10 } = params || {};
    if (!query || typeof query !== 'string') {
      throw new Error('searchMemories requires a query string');
    }
    
    const logger = require('../../../lib/utils/logger');
    logger.info(`[MemoryGraph] [SEARCH] Starting search for query: "${query}", limit: ${limit}`);
    
    try {
      // Ensure chunks are loaded
      const chunks = await this.getAllChunks();
      logger.info(`[MemoryGraph] [SEARCH] Loaded ${chunks.length} total memories`);
      
      if (chunks.length === 0) {
        return [];
      }
      
      // Use hybrid retrieval by default
      const { HybridRetrieval } = require('../../../lib/utils/hybridRetrieval');
      const hybridSearch = new HybridRetrieval();
      
      // Vector search function for hybrid retrieval
      const vectorSearch = async (query, vectorLimit) => {
        if (!this.embeddings) return [];
        
        try {
          console.log('[MemoryGraph] Generating query embedding with TSE');
          const queryEmbedding = await this.embeddings.generateEmbedding(query);
          
          if (!queryEmbedding || queryEmbedding.length === 0) {
            return [];
          }
          
          // Filter chunks that have embeddings
          const chunksWithEmbeddings = chunks.filter(chunk => 
            chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
          );
          
          if (chunksWithEmbeddings.length === 0) {
            return [];
          }
          
          // Calculate similarities
          const similarities = chunksWithEmbeddings.map(chunk => {
            const similarity = this._cosineSimilarity(queryEmbedding, chunk.embedding);
            return {
              ...chunk,
              similarity,
              searchType: 'vector'
            };
          });
          
          return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, vectorLimit);
          
        } catch (error) {
          logger.error('[MemoryGraph] Vector search failed:', error);
          return [];
        }
      };
      
      // Perform hybrid search with fallback
      try {
        const results = await hybridSearch.search({
          query,
          documents: chunks,
          vectorSearch,
          limit,
          bm25Weight: 0.4,
          vectorWeight: 0.6
        });
        
        const chunksWithEmbeddings = chunks.filter(chunk => 
          chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
        );
        
        console.log(`[MemoryGraph] Hybrid search: ${chunksWithEmbeddings.length} chunks with embeddings, ${chunks.length - chunksWithEmbeddings.length} without`);
        
        if (chunksWithEmbeddings.length === 0) {
          console.log('[MemoryGraph] Run preprocessing to generate missing embeddings: node scripts/preprocess-embeddings.js');
        }
        
        return results;
        
      } catch (error) {
        logger.error('[MemoryGraph] Hybrid search failed:', error);
        return this._keywordSearch(query, chunks, limit);
      }
    } catch (error) {
      logger.error('[MemoryGraph] Search failed:', error);
      return [];
    }
  }

  /**
   * Keyword search fallback
   */
  _keywordSearch(query, chunks, limit) {
    const queryLower = query.toLowerCase();
    const results = chunks
      .filter(chunk => {
        const content = (chunk.content || chunk.text || '').toLowerCase();
        const title = (chunk.title || '').toLowerCase();
        return content.includes(queryLower) || title.includes(queryLower);
      })
      .map(chunk => ({
        ...chunk,
        similarity: 0.5,
        searchType: 'keyword'
      }))
      .slice(0, limit);
    
    console.log(`[MemoryGraph] [READ] KEYWORD searchMemories: query="${query}", found=${results.length}, limit=${limit}`);
    return results;
  }

  /**
   * Cosine similarity between two vectors
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number}
   */
  _cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Additional methods for compatibility...
  async addMemory(key, value) {
    const timestamp = Date.now();
    const interaction = {
      id: key,
      content: value,
      timestamp: timestamp,
      sessionId: `session_${timestamp}`
    };
    
    this._interactions.push(interaction);
    this._saveInteractionsToDisk();
    
    console.log(`[MemoryGraph] [WRITE] addMemory: key=${key}, value=${JSON.stringify(value).slice(0, 100)} @ ${new Date(timestamp).toISOString()}`);
  }

  async getMemory(key) {
    const interaction = this._interactions.find(item => item.id === key);
    if (interaction) {
      console.log(`[MemoryGraph] [READ] getMemory: key=${key}, found=true`);
      return interaction.content;
    }
    console.log(`[MemoryGraph] [READ] getMemory: key=${key}, found=false`);
    return null;
  }
}

module.exports = { MemoryGraph };
