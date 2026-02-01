/**
 * Hybrid Retrieval Engine
 * 
 * Combines BM25 lexical search with vector similarity search using RRF blending.
 * Provides fallback to keyword search when embeddings are missing.
 */

const { normalizeText } = require('./contentId');

/**
 * BM25 scoring implementation
 */
class BM25 {
  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.documents = [];
    this.docFreqs = new Map();
    this.idf = new Map();
    this.avgDocLength = 0;
  }

  /**
   * Index documents for BM25 search
   * @param {Array} docs - Array of document objects with text field
   */
  index(docs) {
    this.documents = docs;
    const docLengths = [];
    
    // Build term frequency maps
    docs.forEach((doc, docId) => {
      const text = normalizeText(doc.text || doc.content || '');
      const terms = text.split(/\s+/).filter(Boolean);
      docLengths.push(terms.length);
      
      const termFreqs = new Map();
      terms.forEach(term => {
        termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
      });
      
      doc._termFreqs = termFreqs;
      doc._docLength = terms.length;
      
      // Update document frequencies
      for (const term of termFreqs.keys()) {
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);
      }
    });
    
    this.avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;
    
    // Calculate IDF scores
    const N = docs.length;
    for (const [term, df] of this.docFreqs.entries()) {
      this.idf.set(term, Math.log((N - df + 0.5) / (df + 0.5)));
    }
  }

  /**
   * Search documents using BM25 scoring
   * @param {string} query - Search query
   * @param {number} k - Number of results to return
   * @returns {Array} Scored results
   */
  search(query, k = 100) {
    const queryTerms = normalizeText(query).split(/\s+/).filter(Boolean);
    const scores = [];
    
    this.documents.forEach((doc, docId) => {
      let score = 0;
      
      queryTerms.forEach(term => {
        const tf = doc._termFreqs?.get(term) || 0;
        const idf = this.idf.get(term) || 0;
        const docLength = doc._docLength || 1;
        
        if (tf > 0) {
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
          score += idf * (numerator / denominator);
        }
      });
      
      if (score > 0) {
        scores.push({
          ...doc,
          score: score,
          similarity: Math.min(1.0, score / 10), // Normalize to 0-1 range
          searchType: 'bm25'
        });
      }
    });
    
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/**
 * Reciprocal Rank Fusion for combining search results
 * @param {Array} bm25Results - BM25 search results
 * @param {Array} vectorResults - Vector search results
 * @param {number} bm25Weight - Weight for BM25 scores (0-1)
 * @param {number} vectorWeight - Weight for vector scores (0-1)
 * @param {number} k - RRF parameter (default 60)
 * @returns {Array} Fused and ranked results
 */
function reciprocalRankFusion(bm25Results, vectorResults, bm25Weight = 0.4, vectorWeight = 0.6, k = 60) {
  const scoreMap = new Map();
  
  // Add BM25 scores
  bm25Results.forEach((result, rank) => {
    const id = result.content_id || result.id;
    const rrfScore = bm25Weight / (k + rank + 1);
    scoreMap.set(id, {
      ...result,
      fusedScore: rrfScore,
      bm25Rank: rank + 1,
      vectorRank: null
    });
  });
  
  // Add vector scores
  vectorResults.forEach((result, rank) => {
    const id = result.content_id || result.id;
    const rrfScore = vectorWeight / (k + rank + 1);
    
    if (scoreMap.has(id)) {
      const existing = scoreMap.get(id);
      existing.fusedScore += rrfScore;
      existing.vectorRank = rank + 1;
      existing.searchType = 'hybrid';
    } else {
      scoreMap.set(id, {
        ...result,
        fusedScore: rrfScore,
        bm25Rank: null,
        vectorRank: rank + 1,
        searchType: 'vector'
      });
    }
  });
  
  return Array.from(scoreMap.values())
    .sort((a, b) => b.fusedScore - a.fusedScore);
}

/**
 * Hybrid retrieval engine combining BM25 and vector search
 */
class HybridRetrieval {
  constructor() {
    this.bm25 = new BM25();
    this.indexed = false;
  }

  /**
   * Index documents for hybrid search
   * @param {Array} documents - Array of document objects
   */
  index(documents) {
    this.bm25.index(documents);
    this.documents = documents;
    this.indexed = true;
  }

  /**
   * Perform hybrid search with fallback
   * @param {Object} params - Search parameters
   * @param {string} params.query - Search query
   * @param {Array} params.documents - Documents to search (if not pre-indexed)
   * @param {Function} params.vectorSearch - Vector search function (optional)
   * @param {number} params.limit - Number of results to return
   * @param {number} params.bm25Weight - Weight for BM25 scores
   * @param {number} params.vectorWeight - Weight for vector scores
   * @returns {Array} Hybrid search results
   */
  async search({ 
    query, 
    documents = null, 
    vectorSearch = null, 
    limit = 100, 
    bm25Weight = 0.4, 
    vectorWeight = 0.6 
  }) {
    // Index documents if not already done
    if (documents && !this.indexed) {
      this.index(documents);
    }
    
    // Always perform BM25 search (lexical fallback)
    const bm25Results = this.bm25.search(query, Math.max(limit, 200));
    
    // Attempt vector search if available
    let vectorResults = [];
    if (vectorSearch && typeof vectorSearch === 'function') {
      try {
        vectorResults = await vectorSearch(query, Math.max(limit, 200));
      } catch (error) {
        console.warn('[HybridRetrieval] Vector search failed, falling back to BM25 only:', error.message);
      }
    }
    
    // If no vector results, return BM25 only
    if (vectorResults.length === 0) {
      return bm25Results
        .slice(0, limit)
        .map(result => ({
          ...result,
          searchType: 'bm25_fallback'
        }));
    }
    
    // Fuse results using RRF
    const fusedResults = reciprocalRankFusion(
      bm25Results, 
      vectorResults, 
      bm25Weight, 
      vectorWeight
    );
    
    return fusedResults.slice(0, limit);
  }

  /**
   * Get search statistics
   * @returns {Object} Search statistics
   */
  getStats() {
    return {
      indexed: this.indexed,
      documentCount: this.documents?.length || 0,
      avgDocLength: this.bm25.avgDocLength,
      vocabularySize: this.bm25.idf.size
    };
  }
}

module.exports = {
  HybridRetrieval,
  BM25,
  reciprocalRankFusion
};
