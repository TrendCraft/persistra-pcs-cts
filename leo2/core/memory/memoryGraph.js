// leo2/core/memory/memoryGraph.js

const path = require('path');
const { memoryManager } = require('../../../lib/services/memory-manager.js');
const legacyGraph = require('../../../lib/services/memory-graph-integration.js');

const fs = require('fs');
const { getInteractionsPath } = require('../utils/paths');

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
    this._interactionsPath = getInteractionsPath();
    const logger = require('../../../lib/utils/logger');
    logger.debug('[MemoryGraph] [DEBUG] Constructor: _interactionsPath =', this._interactionsPath);
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

  async _saveInteractionsToDisk() {
    try {
      const interactionsFile = this._interactionsPath || getInteractionsPath();
      const dir = path.dirname(interactionsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      await fs.promises.writeFile(
        interactionsFile,
        JSON.stringify(this._interactions, null, 2),
        'utf8'
      );

      console.log(`[MemoryGraph] [INFO] Saved ${this._interactions.length} interactions to disk`);
      console.log(`[MemoryGraph] [DEBUG] Writing interactions to ${interactionsFile}`);
    } catch (error) {
      console.error('[MemoryGraph] [ERROR] Failed to save interactions:', error.message);
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
      // Use centralized data directory configuration
      const path = require('path');
      const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
      const paths = {
        dataDir: DATA_DIR,
        projectRoot: path.resolve(__dirname, '../..'),
        chunksFile: process.env.LEO_CHUNKS_FILE || path.join(DATA_DIR, '../data/leo_memory_graph.jsonl'),
        embeddingsFile: process.env.LEO_EMBEDDINGS_FILE || path.join(DATA_DIR, '../data/embeddings_production.jsonl'),
        legacyPaths: {
          leoMemoryGraph: path.join(DATA_DIR, '../data/leo_memory_graph.jsonl'),
          quantumResearchMemory: path.join(DATA_DIR, '../data/quantum_research/quantum_research_curated.jsonl'),
          chunksBackup: path.join(DATA_DIR, '../data/chunks.jsonl')
        }
      };
      
      console.log(`[MemoryGraph] [DEBUG] Project root: ${paths.projectRoot}`);
      console.log(`[MemoryGraph] [DEBUG] Data directory: ${paths.dataDir}`);
      console.log(`[MemoryGraph] [DEBUG] Chunks file: ${paths.chunksFile}`);
      console.log(`[MemoryGraph] [DEBUG] Embeddings file: ${paths.embeddingsFile}`);
      
      // Use centralized path configuration
      const embeddingsPath = paths.embeddingsFile;
      
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
      let chunksFiles = [];
      const logger = require('../../../lib/utils/logger');
      const { observability } = require('../../lib/utils/observability');
      
      try {
        
        // Use centralized path configuration for legacy files
        const leoMemoryGraphPath = paths.legacyPaths.leoMemoryGraph;
        const quantumResearchMemoryPath = paths.legacyPaths.quantumResearchMemory;
        const quantumCuratedPath = path.join(paths.dataDir, 'quantum_research', 'quantum_research_curated.jsonl');
        const chunksBackupPath = paths.legacyPaths.chunksBackup;
        
        // CRITICAL: Check for environment variable override for chunks file - use ONLY this if specified
        if (process.env.LEO_CHUNKS_FILE && fs.existsSync(paths.chunksFile)) {
          console.log(`[MemoryGraph] [DEBUG] Using ONLY environment override chunks file: ${paths.chunksFile}`);
          chunksFiles.push(paths.chunksFile);
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
                
                // PROVENANCE ENFORCEMENT: Apply minimal schema to all chunks
                const { enforceProvenance } = require('./provenance');
                
                try {
                  // Enforce provenance before any other processing
                  obj = enforceProvenance(obj);
                  
                  // Handle quantum research data format OR environment override file
                  if (chunksFile === quantumCuratedPath || chunksFile === leoMemoryGraphPath || chunksFile === paths.chunksFile) {
                    // Quantum research files and environment override files have their own format
                    // DON'T override type if already set by provenance
                    if (!obj.type && obj.metadata && obj.metadata.quantum_domain) {
                      obj.type = 'quantum_research';
                    }
                    if (!obj.chunk_type) {
                      obj.chunk_type = obj.metadata.chunk_type || obj.type || 'quantum_research';
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
                } catch (provenanceErr) {
                  logger.warn(`[MemoryGraph] [WARN] Failed to enforce provenance for chunk ${obj.id}: ${provenanceErr.message}`);
                  // Still add chunk but log the issue
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
        observability.recordError('loading', chunkErr);
      }
        
      console.log(`[MemoryGraph] [INFO] Loaded ${chunks.length} chunks from ${chunksFiles ? chunksFiles.length : 0} files`);
      logger.info(`[MemoryGraph] [INFO] Loaded ${chunks.length} chunks from ${chunksFiles ? chunksFiles.length : 0} files`);
      
      // WEEK 1 FIX: Load conversation turns from interactions.json into chunks cache
      // This ensures semantic search can find conversation history
      if (this._interactions && this._interactions.length > 0) {
        const conversationTurns = this._interactions.filter(i => 
          i.type === 'conversation_turn' && i.embedding && i.embedding.length > 0
        );
        
        if (conversationTurns.length > 0) {
          chunks.push(...conversationTurns);
          console.log(`[MemoryGraph] [WEEK 1] Added ${conversationTurns.length} conversation turns to chunks cache`);
          logger.info(`[MemoryGraph] [WEEK 1] Added ${conversationTurns.length} conversation turns to chunks cache`);
        }
      }
      
      // Record chunk processing metrics
      const chunksWithEmbeddings = chunks.filter(chunk => 
        chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
      ).length;
      observability.recordChunkProcessing(chunks.length, chunksWithEmbeddings);
      
      this._chunksCache = chunks;
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
    
    const startTime = Date.now();
    const logger = require('../../../lib/utils/logger');
    const { observability } = require('../../lib/utils/observability');
    
    logger.info(`[MemoryGraph] [SEARCH] Starting search for query: "${query}", limit: ${limit}`);
    
    try {
      // Ensure chunks are loaded
      const chunks = await this.getAllChunks();
      logger.info(`[MemoryGraph] [SEARCH] Loaded ${chunks.length} total memories`);
      
      if (chunks.length === 0) {
        return [];
      }
      
      // Use hybrid retrieval by default
      const { HybridRetrieval } = require('../../lib/utils/hybridRetrieval');
      const hybridSearch = new HybridRetrieval();
      
      console.log(`[MemoryGraph] [DEBUG] About to call hybrid search with ${chunks.length} chunks`);
      
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
        console.log(`[MemoryGraph] [DEBUG] Calling hybridSearch.search with query: "${query}"`);
        const results = await hybridSearch.search({
          query,
          documents: chunks,
          vectorSearch,
          limit,
          bm25Weight: 0.4,
          vectorWeight: 0.6
        });
        
        console.log(`[MemoryGraph] [DEBUG] Hybrid search returned ${results.length} results`);
        
        const chunksWithEmbeddings = chunks.filter(chunk => 
          chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
        );
        
        console.log(`[MemoryGraph] Hybrid search: ${chunksWithEmbeddings.length} chunks with embeddings, ${chunks.length - chunksWithEmbeddings.length} without`);
        
        if (chunksWithEmbeddings.length === 0) {
          console.log('[MemoryGraph] Run preprocessing to generate missing embeddings: node scripts/preprocess-embeddings.js');
        }
        
        console.log(`[MemoryGraph] [DEBUG] Returning ${results.length} results from searchMemories`);
        
        // Record search metrics
        const responseTime = Date.now() - startTime;
        observability.recordSearch(query, results.length, responseTime, 'hybrid');
        
        return results;
        
      } catch (error) {
        console.error('[MemoryGraph] [ERROR] Hybrid search failed:', error.message);
        console.error('[MemoryGraph] [ERROR] Stack:', error.stack);
        logger.error('[MemoryGraph] Hybrid search failed:', error);
        observability.recordError('search', error);
        
        const fallbackResults = this._keywordSearch(query, chunks, limit);
        const responseTime = Date.now() - startTime;
        observability.recordSearch(query, fallbackResults.length, responseTime, 'keyword');
        
        return fallbackResults;
      }
    } catch (error) {
      console.error('[MemoryGraph] [CRITICAL ERROR] Search failed:', error.message);
      console.error('[MemoryGraph] [CRITICAL ERROR] Stack:', error.stack);
      logger.error('[MemoryGraph] Search failed:', error);
      observability.recordError('search', error);
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
    // Support three calling conventions:
    // 1. addMemory(stringKey, {metadata, ...}) - conversation summaries with provenance
    // 2. addMemory({type, content, ...}) - agent state (legacy single-arg format)
    // 3. addMemory(stringKey, stringValue) - simple key/value (legacy)
    let interaction;
    
    // Check if this is single-argument format (agent state)
    if (typeof key === 'object' && key.type && !value) {
      // Legacy single-argument format for agent state
      const timestamp = key.timestamp || Date.now();
      interaction = {
        id: key,
        content: key.content || JSON.stringify(key),
        type: key.type || 'memory',
        timestamp: timestamp,
        sessionId: key.sessionId || `session_${timestamp}`,
        metadata: {
          timestamp: timestamp,
          ingested_at: timestamp
        }
      };
    } else if (typeof key === 'string' && typeof value === 'object' && value.metadata) {
      // New format with rich provenance metadata (conversation summaries)
      interaction = {
        id: key,
        content: typeof value === 'string' ? value : (value.content || key),
        type: value.type || 'memory',
        timestamp: value.metadata.timestamp || Date.now(),
        sessionId: value.metadata.session_id || `session_${Date.now()}`,
        metadata: value.metadata,
        embedding: value.embedding
      };
    } else {
      // Legacy format - simple key/value
      const timestamp = Date.now();
      interaction = {
        id: key,
        content: typeof value === 'string' ? value : JSON.stringify(value),
        type: 'memory',
        timestamp: timestamp,
        sessionId: `session_${timestamp}`,
        metadata: {
          timestamp: timestamp,
          ingested_at: timestamp
        }
      };
    }
    
    this._interactions.push(interaction);
    await this._saveInteractionsToDisk();
    
    const keyStr = typeof key === 'string' ? key : (key.type || 'object');
    console.log(`[MemoryGraph] [WRITE] addMemory: key=${keyStr}, type=${interaction.type}, source=${interaction.metadata?.source_id || 'unknown'} @ ${new Date(interaction.timestamp).toISOString()}`);
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

  /**
   * Add conversation interaction (Phase 3: Cross-session recall)
   * Stores conversation turns with proper metadata for timeline search
   * @param {Object} interaction - Interaction object
   * @param {number} interaction.timestamp - Interaction timestamp
   * @param {string} interaction.userInput - User input text
   * @param {string} interaction.llmResponse - LLM response text
   * @param {Array} interaction.contextSummary - Context summary
   * @param {Object} interaction.flowState - Flow state
   * @param {Object} interaction.identity - Identity info
   */
  async addInteraction(interaction) {
    const timestamp = interaction.timestamp || Date.now();
    const sessionId = interaction.sessionId || `session_${timestamp}`;
    const messageId = `msg_${timestamp}`;
    
    // WEEK 2 DEBUG: Log what userInput we receive
    console.log('[MemoryGraph] [WEEK 2 DEBUG] addInteraction called with userInput:', interaction.userInput?.substring(0, 150));
    console.log('[MemoryGraph] [WEEK 2 DEBUG] Has DR-014:', interaction.userInput?.includes('DR-014'));
    console.log('[MemoryGraph] [WEEK 2 DEBUG] Has Q7F3:', interaction.userInput?.includes('Q7F3'));
    
    // Include flow context for better semantic retrieval
    const flow = interaction?.flowState?.currentFlow || 'general';
    const content = `[Flow:${flow}] User: ${interaction.userInput}\nAssistant: ${interaction.llmResponse}`;
    
    console.log('[MemoryGraph] [WEEK 2 DEBUG] Content to be stored:', content.substring(0, 150));
    console.log('[MemoryGraph] [WEEK 2 DEBUG] Content has DR-014:', content.includes('DR-014'));
    console.log('[MemoryGraph] [WEEK 2 DEBUG] Content has Q7F3:', content.includes('Q7F3'));
    
    // WEEK 1: Embedding generation with env gate
    const embedInteractions = String(process.env.LEO_EMBED_INTERACTIONS || 'true').toLowerCase() === 'true';
    
    let embedding = null;
    if (embedInteractions && this.embeddings && typeof this.embeddings.generateEmbedding === 'function') {
      try {
        if (process.env.LEO_ALE_DEBUG === 'true') {
          console.log('[MemoryGraph] Embedding conversation turn...');
        }
        embedding = await this.embeddings.generateEmbedding(content);
      } catch (err) {
        // Do not block storage
        console.warn('[MemoryGraph] Failed to embed conversation turn:', err?.message || err);
      }
    } else if (embedInteractions) {
      // Helpful pilot warning: you're expecting this to work, so know when it won't
      console.warn('[MemoryGraph] No embedding service registered on memoryGraph (this.embeddings missing)');
    }
    
    // Store as conversation turn with proper provenance
    const turnObject = {
      id: messageId,
      content: content,
      type: 'conversation_turn',
      embedding: embedding,
      timestamp: timestamp,
      sessionId: sessionId,
      metadata: {
        // Provenance fields for Phase 3 retrieval
        source_kind: 'conversation',
        source_id: `conv:${sessionId}/msg:${messageId}`,
        chunk_type: 'conversation_turn',
        timestamp: timestamp,
        ingested_at: Date.now(),
        timestamp_source: 'conversation_event_time',
        conversation_timestamp: timestamp,
        message_timestamp: timestamp,
        session_id: sessionId,
        message_id: messageId,
        
        // Conversation content
        user_input: interaction.userInput,
        llm_response: interaction.llmResponse,
        
        // Context metadata
        context_summary: interaction.contextSummary || [],
        flow_state: interaction.flowState,
        identity: interaction.identity,
        
        // Speaker attribution for Phase 3
        speaker: 'system', // This is the full turn (user + assistant)
        turn_type: 'full_exchange'
      }
    };
    
    this._interactions.push(turnObject);
    await this._saveInteractionsToDisk();
    
    // PHASE 3: Add to chunks cache for searchability
    // Ensure chunks cache is loaded first
    if (!this._chunksCache) {
      await this.getAllChunks();
    }
    if (this._chunksCache) {
      this._chunksCache.push(turnObject);
      console.log(`[MemoryGraph] [PHASE 3] Added conversation turn to chunks cache (total: ${this._chunksCache.length})`);
      console.log(`[MemoryGraph] [PHASE 3 DEBUG] Turn structure: type=${turnObject.type}, metadata.source_kind=${turnObject.metadata?.source_kind}, metadata.chunk_type=${turnObject.metadata?.chunk_type}`);
    }
    
    console.log(`[MemoryGraph] [CONVERSATION TURN] session=${sessionId}, msg=${messageId}, timestamp=${new Date(timestamp).toISOString()}`);
  }
}

module.exports = { MemoryGraph };
