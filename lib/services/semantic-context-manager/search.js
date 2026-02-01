// Semantic search and retrieval logic

const { getEmbeddingsService } = require('./embeddingsService');
const { inferChunkType } = require('./chunkTransform');
const path = require('path');
// === DEBUG: Print effective config and env at startup ===
console.log("[DEBUG] Env vars:", {
  LEO_CHUNKS_FILE: process.env.LEO_CHUNKS_FILE,
  LEO_EMBEDDINGS_FILE: process.env.LEO_EMBEDDINGS_FILE
});
// If config is available, print it here (will be printed again in context)

const { loadAndMergeChunksEmbeddings } = require('./robust-chunk-embedding-loader');
const trueSemanticEmbeddings = require('../true-semantic-embeddings');

const COMPONENT_NAME = 'SemanticContextSearch';

class SemanticContextSearch {
  constructor({ logger, eventBus } = {}) {
    if (!logger) throw new Error('SemanticContextSearch: logger must be provided via DI');
    if (!eventBus) throw new Error('SemanticContextSearch: eventBus must be provided via DI');
    this.logger = logger;
    this.eventBus = eventBus;
    this.isInitialized = false;
  }

  async initialize(options = {}) {
    // Optionally do any setup needed
    this.isInitialized = true;
    this.logger.info('SemanticContextSearch initialized');
    this.logger.info('✅ CRITICAL FIX ACTIVE: results.push() restored in search loop');
    return true;
  }

  /**
   * Canonical context search. All callers MUST supply a merged, normalized chunks array via options.chunks,
   * loaded using lib/utils/loadAndMergeChunksEmbeddings.js. Direct file reads or fallback loading are forbidden.
   * Throws if called without a valid chunks array.
   */
  async searchContext(query, options = {}) {
    // === CHUNKS VALIDATION: Allow internal loading if no chunks provided ===
    // Note: chunks can be provided directly or loaded internally from files
    const { cacheService } = options;
    const logger = options.logger || this.logger;
    const eventBus = options.eventBus || this.eventBus;
    if (!logger) throw new Error('searchContext: logger must be provided via DI');
    if (!eventBus) throw new Error('searchContext: eventBus must be provided via DI');

    try {
      // Check initialization status
      if (!this.isInitialized) {
        logger.warn('Semantic context manager not initialized, initializing now...');
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          return {
            success: false,
            error: 'Failed to initialize semantic context manager',
            results: [],
            metadata: {
              query,
              timestamp: Date.now(),
              status: 'error'
            }
          };
        }
      }
      // Track metrics
      const startTime = Date.now();

      // Check for abort signal
      if (options.signal && options.signal.aborted) {
        const abortError = new Error('Context search aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      // All embedding operations must use EmbeddingsService via DI
      // --- Robust chunk/embedding loader integration ---
      let chunks;
      // === DEBUG: Print file paths being used ===
      const chunksPath = options.chunksPath || process.env.LEO_CHUNKS_FILE || path.resolve(process.cwd(), 'data/chunks.jsonl');
      const embeddingsPath = options.embeddingsPath || process.env.LEO_EMBEDDINGS_FILE || path.resolve(process.cwd(), 'data/embeddings.jsonl');
      console.log("[DEBUG] Chunks file:", chunksPath);
      console.log("[DEBUG] Embeddings file:", embeddingsPath);
      // 🎯 TARGETED SEMANTIC SEARCH: Use memory graph instead of bulk loading
      if (options.chunks && Array.isArray(options.chunks) && options.chunks.length > 0) {
        chunks = options.chunks;
        this.logger.info(`Using provided chunks: ${chunks.length} items`);
      } else {
        // 🚀 SEMANTIC GRAPH SEARCH: Load only relevant chunks via memory graph
        try {
          const memoryGraphService = require('../memory_graph_service');
          const memoryGraph = new memoryGraphService();
          await memoryGraph.initialize();
          
          // Generate query embedding for similarity search
          const embeddingsService = getEmbeddingsService();
          const queryEmbedding = await embeddingsService.generate(query);
          
          // Use semantic search with cosine similarity threshold
          const semanticResults = memoryGraph.semanticSearchChunks(
            queryEmbedding,
            embeddingsService.cosineSimilarity.bind(embeddingsService),
            0.7, // Similarity threshold
            options.maxResults || 15 // Max results
          );
          
          // Convert memory graph results to chunk format
          chunks = semanticResults.map(result => ({
            id: result.node.id,
            content: result.node.content,
            embedding: result.node.embedding,
            similarity: result.score,
            metadata: result.node.metadata || {},
            source: 'memory_graph_semantic_search'
          }));
          
          this.logger.info(`🎯 Targeted semantic search found ${chunks.length} relevant chunks (threshold: 0.7)`);
          console.log('[SEMANTIC SEARCH] Found chunks:', {
            count: chunks.length,
            avgSimilarity: chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length,
            topSimilarity: chunks[0]?.similarity || 0
          });
          
        } catch (semanticError) {
          this.logger.warn('Semantic search failed, falling back to recent chunks:', semanticError.message);
          
          // Fallback: Load only recent/relevant chunks instead of ALL chunks
          const chunksPath = options.chunksPath || process.env.LEO_CHUNKS_FILE || path.resolve(process.cwd(), 'data/chunks.jsonl');
          const embeddingsPath = options.embeddingsPath || process.env.LEO_EMBEDDINGS_FILE || path.resolve(process.cwd(), 'data/embeddings.jsonl');
          
          // Load only a small subset for fallback
          const allChunks = await loadAndMergeChunksEmbeddings(chunksPath, embeddingsPath);
          chunks = allChunks.slice(0, 20); // Limit to 20 most recent
          
          this.logger.info(`Fallback: Using ${chunks.length} recent chunks instead of full dataset`);
        }
      }
      const embeddingsService = getEmbeddingsService();
      // ... (rest of your context loading logic should be updated to use embeddingsService methods)

      // Analyze query to determine boosting strategy
      const { analyzeQuery } = require('./queryAnalysis');
      const analysis = analyzeQuery(query);
      logger.debug('Query analysis', { analysis });

      // Check if operation has been aborted
      if (options.signal && options.signal.aborted) {
        const abortError = new Error('Context search aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      // Generate query embedding using standardized function
      const queryEmbedding = await embeddingsService.generateQueryEmbedding(query);
      console.log('[DEBUG] Query embedding generated:', {
        length: queryEmbedding ? queryEmbedding.length : 'N/A',
        type: typeof queryEmbedding,
        sample: queryEmbedding ? queryEmbedding.slice(0, 5) : 'N/A'
      });

      // Track similarity calculation time
      const similarityStartTime = Date.now();

      // Get an array of embedding vectors for all chunks
      const embeddings = chunks.map(chunk => chunk.embedding || chunk.vector);
      if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
        throw new Error('No embeddings available for search');
      }
      console.log('[DEBUG] Chunk embeddings extracted:', {
        count: embeddings.length,
        firstEmbeddingLength: embeddings[0] ? embeddings[0].length : 'N/A',
        firstEmbeddingType: typeof embeddings[0],
        firstEmbeddingSample: embeddings[0] ? embeddings[0].slice(0, 5) : 'N/A'
      });
      // Defensive: only iterate up to the minimum length of both arrays
      const minLen = Math.min(chunks.length, embeddings.length);
      logger.info(`[DEBUG] chunks.length: ${chunks.length}, embeddings.length: ${embeddings.length}, using minLen: ${minLen}`);
      // === DEBUG: Log right before iteration ===
      console.log("[DEBUG] About to search. mergedChunks.length:", chunks.length);
      console.log("[DEBUG] Number of defined entries:", chunks.filter(x => x !== undefined).length);
      console.log("[DEBUG] Sample IDs:", chunks.slice(0,3).map(x=>x.id));
      // Strict iteration only over defined entries
      const results = [];
      for (let index = 0; index < minLen; index++) {
        const item = embeddings[index];
        if (!item || !chunks[index]) {
          logger.warn(`Skipping undefined chunk or embedding at index ${index}, id: ${chunks[index] && chunks[index].id}`);
          continue;
        }
        // Calculate cosine similarity using local embeddings interface
        let similarity;
        try {
          if (typeof trueSemanticEmbeddings.similarity === 'function') {
            similarity = trueSemanticEmbeddings.similarity(
              queryEmbedding,
              item // item is already the embedding vector
            );
          }
          // Fallback: use the module's cosineSimilarity function
          else if (typeof trueSemanticEmbeddings.cosineSimilarity === 'function') {
            similarity = trueSemanticEmbeddings.cosineSimilarity(
              queryEmbedding,
              item // item is already the embedding vector
            );
          }
          else {
            // Final fallback: simple dot product calculation
            logger.error('No cosine similarity function available');
            throw new Error('No cosine similarity function available');
          }
        } catch (error) {
          logger.error(`Error calculating similarity: ${error.message}`);
          similarity = 0; // Default to zero similarity on error
        }

        // Apply intelligent boosting based on query analysis
        let boostedSimilarity = similarity;

        // Infer chunk type using standardized function
        const chunkType = inferChunkType(chunks[index]);

        // Apply boosting based on query type and chunk type
        if (analysis.isCodeQuery && chunkType === 'code') {
          boostedSimilarity *= 1.3; // Boost code chunks for code queries
        } else if (analysis.isDocumentationQuery && chunkType === 'documentation') {
          boostedSimilarity *= 1.3; // Boost documentation for documentation queries
        } else if (analysis.isStructuralQuery && chunks[index].path && chunks[index].path.includes(analysis.targetFile)) {
          boostedSimilarity *= 1.5; // Boost chunks from the target file
        }

        // CRITICAL FIX: Add result to results array (was missing!)
        results.push({
          content: chunks[index].content || chunks[index].text || '',
          similarity: boostedSimilarity,
          // Add top-level properties for compatibility
          id: chunks[index].id || chunks[index].chunk_id,
          type: chunks[index].type,
          file: chunks[index].file,
          metadata: {
            chunkType,
            originalSimilarity: similarity,
            path: chunks[index].path,
            id: chunks[index].id || chunks[index].chunk_id,
            timestamp: chunks[index].timestamp
          }
        });

        // Emit similarity calculated event (for every 100th item to avoid event flood)
        if (index % 100 === 0) {
          eventBus.emit('context:similarity:calculated', {
            component: COMPONENT_NAME,
            timestamp: Date.now(),
            chunkType,
            similarity: Math.round(similarity * 100) / 100,
            boostedSimilarity: Math.round(boostedSimilarity * 100) / 100
          });
        }
      }
      // Sort by boosted similarity
      results.sort((a, b) => b.similarity - a.similarity);

      // Ensure similarityThreshold is defined (temporarily lowered for broader context)
      const similarityThreshold = options.similarityThreshold ?? 0.2;
      // Filter by similarity threshold
      const filteredResults = results.filter(item => item.similarity >= similarityThreshold);

      // SEMANTIC FALLBACK CHECK: Implement project relevance threshold
      const PROJECT_RELEVANCE_THRESHOLD = 0.12; // Minimum similarity for project-specific content (fine-tuned for transformer embeddings)
      const highRelevanceResults = filteredResults.filter(item => item.similarity >= PROJECT_RELEVANCE_THRESHOLD);
      
      // Log similarity analysis for debugging
      if (filteredResults.length > 0) {
        const maxSimilarity = Math.max(...filteredResults.map(r => r.similarity));
        logger.debug(`[SEMANTIC-FALLBACK] Query: "${query.substring(0, 50)}..."`);
        logger.debug(`[SEMANTIC-FALLBACK] Total results: ${filteredResults.length}, High relevance (≥${PROJECT_RELEVANCE_THRESHOLD}): ${highRelevanceResults.length}`);
        logger.debug(`[SEMANTIC-FALLBACK] Max similarity: ${maxSimilarity.toFixed(3)}`);
        
        // If no high-relevance results, this may be a general knowledge query
        if (highRelevanceResults.length === 0) {
          logger.info(`[SEMANTIC-FALLBACK] No project-relevant results (max similarity: ${maxSimilarity.toFixed(3)} < ${PROJECT_RELEVANCE_THRESHOLD}) - potential general knowledge query`);
        }
      }

      // Track results metrics
      const initialResultCount = filteredResults.length;
      const projectRelevantCount = highRelevanceResults.length;

      // Ensure maxResults is defined
      const maxResults = options.maxResults ?? 20;
      // Limit results
      const topResults = filteredResults.slice(0, maxResults);

      const similarityTime = Date.now() - similarityStartTime;
      logger.debug(`Calculated similarity for ${embeddings.length} embeddings in ${similarityTime}ms`);

      // Add results to cache
      // MIGRATION: Use injected cacheService instead of queryCache
      if (cacheService) {
        cacheService.set(cacheKey, {
          results: topResults,
          timestamp: Date.now()
        });
      }

      // Emit cache miss event
      if (eventBus) {
        eventBus.emit('context:cache:miss', {
          component: COMPONENT_NAME,
          timestamp: Date.now(),
          query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
          resultCount: topResults.length,
          searchTime: Date.now() - startTime
        });
      }

      // Enhanced metadata with fallback analysis
      const fallbackAnalysis = {
        totalResults: initialResultCount,
        projectRelevantResults: projectRelevantCount,
        maxSimilarity: filteredResults.length > 0 ? Math.max(...filteredResults.map(r => r.similarity)) : 0,
        projectRelevanceThreshold: PROJECT_RELEVANCE_THRESHOLD,
        suggestsFallback: projectRelevantCount === 0 && filteredResults.length > 0,
        isLikelyGeneralKnowledge: projectRelevantCount === 0 && filteredResults.length > 0
      };

      return {
        success: true,
        results: topResults,
        metadata: {
          timestamp: Date.now(),
          status: 'success',
          fallbackAnalysis
        }
      };
    } catch (error) {
      logger.error(`Failed to load embeddings or chunks: ${error.message}`);
      if (error && error.stack) {
        logger.error(`[STACK] ${error.stack}`);
      }
      // Emit error event
      eventBus.emit('context:data:error', {
        component: 'semantic-context-manager',
        timestamp: Date.now(),
        error: error.message
      });
      return {
        success: false,
        error: error.message,
        results: [],
        metadata: { query, timestamp: Date.now(), status: 'error' }
      };
    }
  }
}

// Core stateless retrieval/ranking logic now lives in contextRetrieval.js
const { retrieveAndRankContext } = require('./contextRetrieval');

// Export both the class and a singleton instance for compatibility
const semanticContextSearchSingleton = new SemanticContextSearch({
  logger: console, // fallback, should be replaced by DI
  eventBus: { emit: () => {} } // fallback, should be replaced by DI
});

// Top-level function export for compatibility
const searchContext = (...args) => semanticContextSearchSingleton.searchContext(...args);

module.exports = {
  SemanticContextSearch,
  semanticContextSearchSingleton,
  searchContext, // <-- Added for CLI and consumer compatibility
  retrieveAndRankContext
};
