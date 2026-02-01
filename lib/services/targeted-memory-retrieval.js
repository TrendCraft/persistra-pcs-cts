// targeted-memory-retrieval.js
// Implements proper semantic graph traversal instead of bulk loading

const logger = require('../utils/logger');
const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
// Use working TSE service instead of problematic legacy TSEInstance
const tse = require('./true-semantic-embeddings');

/**
 * Targeted Memory Retrieval Service
 * Implements best-practice RAG patterns with semantic graph traversal
 */
class TargetedMemoryRetrieval {
  constructor({ memoryGraph, embeddingsService }) {
    this.memoryGraph = memoryGraph;
    this.embeddingsService = embeddingsService;
    this.logger = logger;
  }

  /**
   * Step 1: Semantic Query Analysis
   * Generate embedding for the user query
   */
  async analyzeQuery(query) {
    try {
      const queryEmbedding = await this.embeddingsService.generate(query);
      
      this.logger.debug('Query analyzed', {
        query: query.substring(0, 50),
        embeddingDimensions: queryEmbedding.length
      });
      
      return {
        query,
        embedding: queryEmbedding,
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Query analysis failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Step 2: Top-K Semantic Search with TSE Backend Validation
   * Find 5-20 most relevant memory nodes using LCOS memory graph
   */
  async semanticSearch(queryAnalysis, options = {}) {
    const {
      topK = 100, // Increased to search more chunks
      similarityThreshold = 0.3, // Lower threshold for better recall
      includeMetadata = true
    } = options;

    try {
      // 🔥 FORCE TSE backend initialization before any similarity calculations
      // Ensure TSE singleton is initialized
      await tse.initialize();
      const tseStatus = {
        backendType: tse.backendType,
        dimensions: tse.dimensions,
        initialized: tse.initialized
      };
      this.logger.info('TSE Backend Status:', tseStatus);
      
      // 🎯 Use LCOS memory graph's getAllChunks with targeted filtering
      const allChunks = await this.memoryGraph.getAllChunks();
      
      if (!allChunks || allChunks.length === 0) {
        this.logger.warn('No chunks found in memory graph');
        return [];
      }
      
      this.logger.debug('Loaded chunks for semantic search', {
        totalChunks: allChunks.length,
        backendType: tseStatus.type,
        backendDimensions: tseStatus.dimensions,
        sampleIds: allChunks.slice(0, 3).map(c => c.id)
      });
      
      // Calculate similarities with embedding validation
      const scoredChunks = [];
      let compatibilityErrors = 0;
      
      for (const chunk of allChunks) {
        if (!chunk.embedding || !Array.isArray(chunk.embedding)) {
          continue;
        }
        
        try {
          // Validate embedding compatibility before similarity calculation
          // Direct compatibility check
          const compatibility = {
            compatible: queryAnalysis.embedding.length === chunk.embedding.length,
            queryDim: queryAnalysis.embedding.length,
            storedDim: chunk.embedding.length
          };
          
          if (!compatibility.compatible) {
            compatibilityErrors++;
            if (compatibilityErrors <= 3) { // Log first few errors
              this.logger.debug('Embedding compatibility error:', {
                chunkId: chunk.id,
                issues: compatibility.issues
              });
            }
            continue;
          }
          
          // Use TSE singleton similarity calculation
          const similarity = tse.similarity(
            queryAnalysis.embedding,
            chunk.embedding
          );
          
          if (similarity >= similarityThreshold) {
            scoredChunks.push({
              id: chunk.id,
              content: chunk.content,
              similarity: similarity,
              metadata: includeMetadata ? chunk.metadata : undefined,
              source: 'lcos_memory_graph',
              embedding: chunk.embedding
            });
          }
        } catch (simError) {
          // Skip chunks with embedding issues
          continue;
        }
      }
      
      // Sort by similarity (highest first) and take top K
      scoredChunks.sort((a, b) => b.similarity - a.similarity);
      const topResults = scoredChunks.slice(0, topK);
      
      this.logger.info('LCOS semantic search completed', {
        query: queryAnalysis.query.substring(0, 50),
        totalChunks: allChunks.length,
        scoredChunks: scoredChunks.length,
        resultsFound: topResults.length,
        threshold: similarityThreshold,
        compatibilityErrors: compatibilityErrors,
        avgSimilarity: topResults.length > 0 ? topResults.reduce((sum, r) => sum + r.similarity, 0) / topResults.length : 0,
        topSimilarity: topResults[0]?.similarity || 0
      });
      
      // Warn if many compatibility errors
      if (compatibilityErrors > allChunks.length * 0.1) {
        this.logger.warn('High embedding compatibility error rate', {
          compatibilityErrors,
          totalChunks: allChunks.length,
          errorRate: `${Math.round(compatibilityErrors / allChunks.length * 100)}%`
        });
      }

      return topResults;

    } catch (error) {
      this.logger.error('LCOS semantic search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Step 3: Edge Traversal (Local Expansion)
   * Follow 1-2 hops of relevant edges to gather contextually related memories
   */
  async expandContext(semanticResults, options = {}) {
    const {
      maxDepth = 2,
      maxExpansion = 5,
      direction = 'both'
    } = options;

    try {
      const expandedNodes = new Set();
      const contextualMemories = [];

      // Add original semantic results
      semanticResults.forEach(result => {
        expandedNodes.add(result.id);
        contextualMemories.push(result);
      });

      // 🚀 LCOS Graph Traversal: Find related memories by content similarity
      const topResults = semanticResults.slice(0, 3); // Limit expansion scope
      
      if (topResults.length > 0) {
        try {
          // Get all chunks for contextual expansion
          const allChunks = await this.memoryGraph.getAllChunks();
          
          // Find contextually related chunks based on content similarity
          for (const result of topResults) {
            const relatedChunks = this.findRelatedChunks(result, allChunks, {
              maxRelated: maxExpansion,
              similarityThreshold: 0.5 // Lower threshold for related content
            });
            
            // Add related chunks that aren't already included
            for (const relatedChunk of relatedChunks) {
              if (!expandedNodes.has(relatedChunk.id)) {
                expandedNodes.add(relatedChunk.id);
                contextualMemories.push({
                  id: relatedChunk.id,
                  content: relatedChunk.content,
                  similarity: result.similarity * 0.8, // Slightly lower for related nodes
                  metadata: relatedChunk.metadata,
                  source: 'contextual_expansion',
                  connectedTo: result.id,
                  embedding: relatedChunk.embedding
                });
              }
            }
          }
        } catch (expansionError) {
          this.logger.warn('Contextual expansion failed', {
            error: expansionError.message
          });
        }
      }

      this.logger.info('Context expansion completed', {
        originalNodes: semanticResults.length,
        expandedNodes: contextualMemories.length,
        expansionRatio: contextualMemories.length / semanticResults.length
      });

      return contextualMemories;

    } catch (error) {
      this.logger.error('Context expansion failed', { error: error.message });
      return semanticResults; // Return original results on failure
    }
  }

  /**
   * Step 4: Salience Ranking
   * Score/rank nodes using contextual relevance, recency, project priorities
   */
  async rankBySalience(expandedMemories, queryAnalysis, options = {}) {
    const {
      recencyWeight = 0.3,
      similarityWeight = 0.5,
      projectRelevanceWeight = 0.2
    } = options;

    try {
      const rankedMemories = expandedMemories.map(memory => {
        // Calculate composite salience score
        const recencyScore = this.calculateRecencyScore(memory);
        const similarityScore = memory.similarity || 0;
        const projectRelevanceScore = this.calculateProjectRelevance(memory, queryAnalysis);

        const salienceScore = (
          recencyScore * recencyWeight +
          similarityScore * similarityWeight +
          projectRelevanceScore * projectRelevanceWeight
        );

        return {
          ...memory,
          salience: salienceScore,
          salienceBreakdown: {
            recency: recencyScore,
            similarity: similarityScore,
            projectRelevance: projectRelevanceScore
          }
        };
      });

      // Sort by salience (highest first)
      rankedMemories.sort((a, b) => b.salience - a.salience);

      this.logger.info('Salience ranking completed', {
        totalMemories: rankedMemories.length,
        avgSalience: rankedMemories.reduce((sum, m) => sum + m.salience, 0) / rankedMemories.length,
        topSalience: rankedMemories[0]?.salience || 0
      });

      return rankedMemories;

    } catch (error) {
      this.logger.error('Salience ranking failed', { error: error.message });
      return expandedMemories;
    }
  }

  /**
   * Step 5: Final Context Selection
   * Choose top 5-7 memories for LLM prompt injection
   */
  async selectFinalContext(rankedMemories, options = {}) {
    const {
      maxMemories = 50, // Increased for massive data access
      diversityThreshold = 0.8,
      minSalience = 0.1
    } = options;

    try {
      const selectedMemories = [];
      const usedContent = new Set();

      for (const memory of rankedMemories) {
        // Skip if below minimum salience
        if (memory.salience < minSalience) continue;

        // Skip if too similar to already selected content (diversity filter)
        const contentSimilarity = this.calculateContentSimilarity(memory.content, usedContent);
        if (contentSimilarity > diversityThreshold) continue;

        // Add to final selection
        selectedMemories.push({
          id: memory.id,
          content: memory.content,
          salience: memory.salience,
          similarity: memory.similarity,
          source: memory.source,
          metadata: memory.metadata
        });

        usedContent.add(memory.content);

        // Stop when we have enough memories
        if (selectedMemories.length >= maxMemories) break;
      }

      this.logger.info('Final context selection completed', {
        candidateMemories: rankedMemories.length,
        selectedMemories: selectedMemories.length,
        avgSalience: selectedMemories.reduce((sum, m) => sum + m.salience, 0) / selectedMemories.length
      });

      return selectedMemories;

    } catch (error) {
      this.logger.error('Final context selection failed', { error: error.message });
      return rankedMemories.slice(0, options.maxMemories || 7);
    }
  }

  /**
   * Complete targeted retrieval pipeline
   * Implements all 5 steps of best-practice RAG
   */
  async retrieveTargetedContext(query, options = {}) {
    try {
      const startTime = Date.now();

      // Step 1: Semantic Query Analysis
      const queryAnalysis = await this.analyzeQuery(query);

      // Step 2: Top-K Semantic Search
      const semanticResults = await this.semanticSearch(queryAnalysis, options);

      // Step 3: Edge Traversal (Local Expansion)
      const expandedMemories = await this.expandContext(semanticResults, options);

      // Step 4: Salience Ranking
      const rankedMemories = await this.rankBySalience(expandedMemories, queryAnalysis, options);

      // Step 5: Final Context Selection
      const finalContext = await this.selectFinalContext(rankedMemories, options);

      const duration = Date.now() - startTime;

      this.logger.info('Targeted retrieval completed', {
        query: query.substring(0, 50),
        finalContextSize: finalContext.length,
        totalDuration: duration,
        avgSalience: finalContext.reduce((sum, m) => sum + m.salience, 0) / finalContext.length
      });

      return {
        memories: finalContext,
        metadata: {
          query,
          totalDuration: duration,
          pipeline: 'targeted_semantic_retrieval',
          steps: {
            semanticSearch: semanticResults.length,
            contextExpansion: expandedMemories.length,
            salienceRanking: rankedMemories.length,
            finalSelection: finalContext.length
          }
        }
      };

    } catch (error) {
      this.logger.error('Targeted retrieval failed', { error: error.message });
      throw error;
    }
  }

  // Helper methods
  findRelatedChunks(targetChunk, allChunks, options = {}) {
    const {
      maxRelated = 5,
      similarityThreshold = 0.5
    } = options;
    
    if (!targetChunk.embedding || !Array.isArray(targetChunk.embedding)) {
      return [];
    }
    
    const relatedChunks = [];
    
    for (const chunk of allChunks) {
      // Skip self and chunks without embeddings
      if (chunk.id === targetChunk.id || !chunk.embedding || !Array.isArray(chunk.embedding)) {
        continue;
      }
      
      try {
        const similarity = this.embeddingsService.similarity(
          targetChunk.embedding,
          chunk.embedding
        );
        
        if (similarity >= similarityThreshold) {
          relatedChunks.push({
            ...chunk,
            similarity: similarity
          });
        }
      } catch (error) {
        // Skip chunks with similarity calculation issues
        continue;
      }
    }
    
    // Sort by similarity and return top results
    relatedChunks.sort((a, b) => b.similarity - a.similarity);
    return relatedChunks.slice(0, maxRelated);
  }

  calculateRecencyScore(memory) {
    const now = Date.now();
    const timestamp = memory.metadata?.timestamp || memory.timestamp || now;
    const ageMs = now - timestamp;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    // Exponential decay: newer = higher score
    return Math.exp(-ageDays / 30); // 30-day half-life
  }

  calculateProjectRelevance(memory, queryAnalysis) {
    // Simple heuristic: check for project-specific keywords
    const projectKeywords = ['leo', 'lcos', 'cognitive', 'emergent', 'semantic', 'memory'];
    const content = (memory.content || '').toLowerCase();
    
    const matches = projectKeywords.filter(keyword => content.includes(keyword)).length;
    return Math.min(1.0, matches / projectKeywords.length);
  }

  calculateContentSimilarity(content, usedContentSet) {
    // Simple similarity check to avoid duplicate content
    const words = content.toLowerCase().split(/\s+/).slice(0, 10);
    
    for (const usedContent of usedContentSet) {
      const usedWords = usedContent.toLowerCase().split(/\s+/).slice(0, 10);
      const intersection = words.filter(word => usedWords.includes(word));
      const similarity = intersection.length / Math.max(words.length, usedWords.length);
      
      if (similarity > 0.7) return similarity;
    }
    
    return 0;
  }
}

module.exports = TargetedMemoryRetrieval;
