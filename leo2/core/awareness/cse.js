// leo2/core/awareness/cse.js
// leo2/core/awareness/cse.js
const path = require('path');
const { rankMemories } = require('../../../leo/core/identity/contextual-salience/salience_ranker');
const { FlowMonitor } = require('./flowMonitor');

// Import semantic search capabilities
let SemanticContextManager;
try {
  SemanticContextManager = require('../../../lib/services/semantic-context-manager');
} catch (error) {
  console.warn('[CSE] Semantic context manager not available:', error.message);
  SemanticContextManager = null;
}

class ContextualSalienceEngine {
  constructor({ memoryGraph, flowMonitor, interactionMemory }) {
    // Advanced diagnostics: track all instances
    if (!global.CSE_INSTANCES) global.CSE_INSTANCES = [];
    global.CSE_INSTANCES.push(this);
    console.log('[DIAGNOSTIC] CSE constructor called:', {
      instanceNumber: global.CSE_INSTANCES.length,
      hasMemoryGraph: !!memoryGraph,
      hasEmbeddingsInterface: !!this.embeddingsInterface,
      constructorName: this.constructor.name
    });
    this.memoryGraph = memoryGraph;
    this.flowMonitor = flowMonitor;
    this.interactionMemory = interactionMemory;
  }

  /**
   * Selects the most salient context for a prompt using recency, frequency, and identity weighting.
   * @param {Object} params - { query: string, flowState: any }
   * @returns {Promise<{memories: Array, flowState: any, identity: string}>}
   */
  /**
   * Returns a hybrid context object with both salient facts and recency memories
   * @param {Object} params - { query: string, flowState: any }
   * @returns {Promise<{memories: Array, salientMemories: Array<string>, flowState: any, identity: string}>}
   */
  async getHybridContext({ query, flowState }) {
    console.log('🔥🔥🔥 [CSE] getHybridContext CALLED! Query:', query);
    console.log('[CSE] getHybridContext called with query:', query);
    
    // === DEBUG: COMPREHENSIVE CSE TRACING ===
    if (process.env.LEO_DEBUG === 'true') {
      console.log('\n🔥 === CSE getHybridContext DEBUG ===');
      console.log('📝 Query received:', query);
      console.log('🌊 FlowState:', flowState);
      console.log('🧠 MemoryGraph exists:', !!this.memoryGraph);
      console.log('🔍 About to perform semantic search...');
      console.log('🔥 === END CSE getHybridContext DEBUG ===\n');
    }
    
    // SEMANTIC SEARCH: Use category-aware retrieval with provenance
    let semanticResults = [];
    console.log('[CSE] DEBUG: Starting category-aware semantic search');
    console.log('[CSE] DEBUG: Query provided:', !!query);
    
    try {
      // Import category-aware retriever
      const { categoryAwareRetrieve } = require('../retriever/categoryRetriever');
      
      // Detect entity from query dynamically
      const entity = this.detectEntityFromQuery(query);
      
      console.log(`[CSE] Using category-aware retrieval for entity: ${entity}`);
      
      // Perform category-aware retrieval
      const categoryResults = await categoryAwareRetrieve(this.memoryGraph, {
        query: query,
        entity: entity,
        k: 10
      });
      
      console.log(`[CSE] Category-aware search found ${categoryResults.length} relevant chunks`);
      
      // Convert to expected format
      semanticResults = categoryResults.map(result => ({
        content: result.content,
        salience: result.similarity,
        source: result.source,
        type: result.docType,
        timestamp: result.timestamp,
        chunkId: result.chunkId,
        repo: result.repo,
        path: result.path,
        docType: result.docType,
        rerankScore: result.rerankScore
      }));
      
      console.log('[CSE] Converted results to CSE format with provenance');
      
    } catch (error) {
      console.warn('[CSE] Category-aware search failed, falling back to basic search:', error.message);
      
      // Fallback to original search method
      if (SemanticContextManager && query) {
        try {
          console.log('[CSE] Performing fallback semantic search for query:', query);
          const chunks = await this.memoryGraph.getAllChunks();
          console.log('[CSE] DEBUG: Retrieved chunks count:', chunks ? chunks.length : 'null');
          
          const searchResult = await SemanticContextManager.searchContext(query, {
            chunks: chunks,
            similarityThreshold: 0.65,
            maxResults: 10
          });
          
          if (searchResult.success && searchResult.results) {
            semanticResults = searchResult.results;
            console.log(`[CSE] Fallback search found ${semanticResults.length} relevant chunks`);
          }
        } catch (fallbackError) {
          console.warn('[CSE] Fallback search also failed:', fallbackError.message);
        }
      }
    }
    
    // Recent memories: last N interactions
    const N = 7;
    const allRecentMemories = await this.memoryGraph.getRecentMemories({ limit: N });
    const recentMemories = allRecentMemories.filter(m => {
      // Allow fact memories through, filter out pure Q&A
      if (m.type === 'fact' && m.fact) {
        console.log('[CSE] Allowing fact memory:', m.id, m.fact);
        return true;
      }
      if (m.type === 'simplified_interaction' || (m.userInput && m.llmResponse && !m.fact)) {
        console.log('[CSE] Filtering out Q&A from recent memories:', m.id);
        return false;
      }
      return true;
    });
    
    // Salience: rank and summarize top K salient facts/code/files (NO Q&A)
    const K = 3;
    const allForSalience = await this.memoryGraph.getRecentMemories({ limit: 30 });
    const filteredForSalience = allForSalience.filter(m => {
      // Allow fact memories through, filter out pure Q&A
      if (m.type === 'fact' && m.fact) {
        console.log('[CSE] Allowing fact memory for salience:', m.id, m.fact);
        return true;
      }
      if (m.type === 'simplified_interaction' || (m.userInput && m.llmResponse && !m.fact)) {
        console.log('[CSE] Filtering out Q&A from salience ranking:', m.id);
        return false;
      }
      return true;
    });
    const ranked = rankMemories(filteredForSalience, { query });
    let salientNodes = ranked.slice(0, K).map(r => r.memory);

    // --- File/code node injection logic ---
    const fileLikePattern = /([\w\-/]+\.(js|ts|py|json|jsx|tsx|md|txt|yaml|yml|sh|c|cpp|h|java|rb|go|rs|cs|php|html|css|scss|less|vue|svelte|lock|config|test|spec|log|ini|cfg|env|Dockerfile|Makefile|README))/i;
    if (query && fileLikePattern.test(query)) {
      // Try to find file/code nodes in memory graph
      const fileMatches = (await this.memoryGraph.searchMemories({ query, limit: 5 }))
        .filter(m => m && (
          ['file', 'file_diff', 'code', 'code_semantic_summary'].includes(m.type) || m.file || m.summary
        ));
      if (fileMatches.length > 0) {
        console.log('[CSE] Forcing file/code nodes into salient context for query:', query, fileMatches.map(f => f.file || f.id || f.type));
        salientNodes = fileMatches.concat(salientNodes).slice(0, K);
      } else {
        console.log('[CSE] No file/code nodes found for file-like query:', query);
      }
    }
    // --- Multi-hop graph traversal for reasoning chain ---
    const traversed = new Map(); // id -> node
    const memoryChain = [];
    for (const node of salientNodes) {
      if (!node || !node.id) continue;
      const related = await this.memoryGraph.walkGraph(node.id, { maxDepth: 2 });
      for (const rel of related) {
        if (!rel || !rel.id) continue;
        if (!traversed.has(rel.id)) {
          // Tag relationship if available (parent/child/next/prev/derived)
          let relationship = rel.relationship || rel.linkType || null;
          // Fallback: infer relationship by traversal order or metadata
          memoryChain.push({ ...rel, relationship });
          traversed.set(rel.id, true);
        }
      }
      // Always include the starting node itself at the front
      if (!traversed.has(node.id)) {
        memoryChain.unshift({ ...node, relationship: 'root' });
        traversed.set(node.id, true);
      }
    }
    // PURE EMERGENT: Only include facts/events/skills, NO Q&A dialog pairs
    const salientMemories = salientNodes
      .map(m => {
        if (!m || typeof m !== 'object') {
          console.warn('[CSE] Skipping malformed salient node (not object):', m);
          return null;
        }
        
        // ONLY accept structured knowledge: facts, events, skills, files - NO dialog
        if (m.type === 'fact' && m.fact) {
          console.log('[CSE] Allowing fact in salient memories:', m.id, m.fact);
          // Continue to structured knowledge section
        } else if (m.type === 'simplified_interaction' || (m.userInput && m.llmResponse && !m.fact)) {
          console.log('[CSE] Filtering out Q&A dialog pair:', m.id);
          return null; // Skip all Q&A pairs
        }
        
        // Accept only structured knowledge
        if (
          m.fact ||
          ['fact', 'event', 'skill', 'file', 'file_diff', 'code', 'code_semantic_summary'].includes(m.type) ||
          m.file || m.summary
        ) {
          return {
            type: m.type || (m.fact ? 'fact' : (m.file ? 'file' : 'knowledge')),
            fact: m.fact || null,
            file: m.file || null,
            summary: m.summary || null,
            content: m.content || null,
            timestamp: m.timestamp || null,
            id: m.id || null
          };
        }
        
        console.warn('[CSE] Skipping node - not structured knowledge:', m.type, m.id);
        return null;
      })
      .filter(Boolean);
    
    // SEMANTIC INTEGRATION: Add semantic search results to salient memories
    const semanticMemories = semanticResults.map(result => {
      // Convert semantic chunks to memory format
      return `[SEMANTIC] ${result.content || result.text || JSON.stringify(result)}`;
    });
    
    // Combine traditional salient memories with semantic results
    const combinedSalientMemories = [...salientMemories, ...semanticMemories];
    
    console.log(`[CSE] Combined salient memories: ${salientMemories.length} traditional + ${semanticMemories.length} semantic = ${combinedSalientMemories.length} total`);
    
    const flow = this.flowMonitor.currentFlow;
    return {
      memories: recentMemories,
      salientMemories: combinedSalientMemories,
      memoryChain,
      flowState: flow,
      identity: 'Leo'
    };
  }

  /**
   * Detect entity from query dynamically by extracting key terms
   * @param {string} query - The search query
   * @returns {string} Detected entity or generic fallback
   */
  detectEntityFromQuery(query) {
    const queryLower = query.toLowerCase();
    
    // Extract potential entities from the query
    const words = queryLower.split(/\s+/);
    
    // Look for technical terms that might be project names
    const potentialEntities = words.filter(word => {
      // Filter for words that look like project/package names
      return word.length > 3 && (
        word.includes('gate') ||
        word.includes('tensor') ||
        word.includes('quantum') ||
        word.match(/^[a-z]+[a-z0-9]*$/i) // Simple alphanumeric pattern
      );
    });
    
    // Return the first potential entity or a generic term
    if (potentialEntities.length > 0) {
      return potentialEntities[0];
    }
    
    // Fallback: extract the main subject from common question patterns
    const subjectPatterns = [
      /(?:about|tell me about|what is|describe)\s+([a-z][a-z0-9]*)/i,
      /([a-z][a-z0-9]*)\s+(?:library|package|tool|framework)/i
    ];
    
    for (const pattern of subjectPatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }
    
    return 'project'; // Generic fallback
  }
}

module.exports = ContextualSalienceEngine;
