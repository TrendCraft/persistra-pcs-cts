// leo2/core/retriever/categoryRetriever.js
// Category-aware, two-stage retrieval with provenance and document type ranking

const path = require('path'); // for path operations
const nodePath = require('path'); // for extname/basename if needed

// Cosine similarity function for semantic embeddings
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const DOC_WEIGHTS = {
  readme: 0.6,
  overview: 0.6,
  api: 0.4,
  examples: 0.4,
  metadata: 0.3,
  paper: 0.3,
  code: 0.1           // Changed from -0.4 to +0.1 to stop penalizing code
};

const CATEGORY_QUOTAS = {
  readme_overview: 2,
  api_examples: 4,     // Increased from 2 to 4 for better examples
  metadata: 1,         // license/pyproject
  paper: 1,
  code: 20            // Increased from 4 to 20 for technical queries
};

function scoreDocTypes(filePath, content) {
  const p = (filePath || '').toLowerCase(), c = (content || '').toLowerCase();
  return {
    readme_overview: +( /readme|\/docs?\//.test(p) ) + +( /^#\s*readme|overview|quickstart/.test(c) ),
    api_examples:    +( /\/api\//.test(p) )           + +( /\bendpoint\b|curl|request|response/.test(c) ),
    code:            +( /\/src\/|\.([jt]sx?|py|go|rs|java|cpp|c|cs|rb|php|kt)$/.test(p) ) +
                      +( /class\s+\w+|function\s+\w+|\bdef\s+\w+|\bimport\b/.test(c) ),
    paper:           +( /paper|arxiv|doi/.test(p) )   + +( /\babstract\b|\bmethods\b|\bresults\b|\breferences\b/.test(c) ),
    metadata:        +( /metadata|manifest|package\.json|pyproject\.toml|pom\.xml|setup\.cfg/.test(p) ) +
                      +( /\bversion\b:|\blicense\b|dependencies|checksum/.test(c) )
  };
}

function inferDocTypeSoft(filePath, content) {
  const s = scoreDocTypes(filePath, content);
  const [best, score] = Object.entries(s).reduce((m, kv) => (kv[1] > m[1] ? kv : m), ['documentation', 0]);
  return score > 0 ? best : 'documentation';
}

function typeBucket(t) {
  if (t === 'readme' || t === 'overview') return 'readme_overview';
  if (t === 'api' || t === 'examples') return 'api_examples';
  if (t === 'metadata') return 'metadata';
  if (t === 'paper') return 'paper';
  return t; // 'code' or 'other'
}

function scoreDocType(t) {
  return DOC_WEIGHTS[t] ?? 0;
}

/**
 * Category-aware retrieval with provenance and document type ranking
 * @param {Object} memoryGraph - Memory graph instance
 * @param {Object} options - Retrieval options
 * @param {string} options.query - Search query
 * @param {string} options.entity - Target entity (e.g., 'htlogicalgates')
 * @param {number} options.k - Number of results to return
 * @param {Array<string>} options.repoAliases - Repository name aliases
 * @returns {Promise<Array>} Ranked and categorized results with provenance
 */
async function categoryAwareRetrieve(memoryGraph, {
  entity,
  query,
  k = 50,
  repoAliases = [] // Remove hardcoded htlogicalgates aliases
}) {
  console.log(`[CategoryRetriever] Starting category-aware retrieval for entity: ${entity}, query: ${query}`);
  
  // Generate dynamic aliases for the entity
  const entityLower = entity.toLowerCase();
  const dynamicAliases = [
    entityLower,
    entityLower.replace(/[-_]/g, ''), // Remove hyphens/underscores
    entityLower.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(), // Add hyphens to camelCase
    ...repoAliases // Allow custom aliases to be passed in
  ];
  
  console.log(`[CategoryRetriever] Using aliases: ${dynamicAliases.join(', ')}`);
  
  try {
    // Stage 1: Get all chunks and filter by entity/repo
    const allChunks = await memoryGraph.getAllChunks();
    console.log(`[CategoryRetriever] Retrieved ${allChunks?.length || 0} total chunks`);
    
    if (!allChunks || allChunks.length === 0) {
      console.warn('[CategoryRetriever] No chunks available');
      return [];
    }
  
  // Filter by repo/entity (case-insensitive) - fix field access
  const repoFiltered = allChunks.filter(chunk => {
    const content = String(chunk.content || '').toLowerCase();
    const path = String(chunk.path || '').toLowerCase();
    const repo = String(chunk.metadata?.repository || chunk.repo || '').toLowerCase(); // Fix: check metadata.repository
    const title = String(chunk.title || '').toLowerCase();
    
    // Check if chunk is related to target entity using dynamic aliases
    return dynamicAliases.some(alias => 
      content.includes(alias) ||
      path.includes(alias) ||
      repo.includes(alias) ||
      title.includes(alias)
    );
  });
  
  console.log(`[CategoryRetriever] Filtered to ${repoFiltered.length} entity-related chunks`);
  
  // Stage 2: Perform semantic search within filtered set
  let semanticResults = [];
  try {
    // Validate query before semantic search
    const q = (query && String(query).trim()) || (entity && String(entity).trim());
    if (!q) {
      console.warn('[CategoryRetriever] Empty query; skipping category-aware search');
      return [];
    }
    
    // Use proper semantic search on the filtered chunks
    console.log(`[CategoryRetriever] Performing semantic ranking on ${repoFiltered.length} filtered chunks`);
    
    // Create a temporary memory graph with just our filtered chunks for semantic search
    const tempChunks = repoFiltered.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      metadata: chunk.metadata,
      timestamp: chunk.timestamp,
      embedding: chunk.embedding // Preserve embeddings if available
    }));
    
    // Use true semantic embeddings on our filtered subset
    try {
      // Ensure we have a valid query string
      const searchQuery = query || entity || 'tensoract';
      console.log(`[CategoryRetriever] Using search query: "${searchQuery}"`);
      
      // Get the embeddings service from memoryGraph
      const embeddings = memoryGraph.embeddings;
      if (!embeddings || typeof embeddings.generate !== 'function') {
        throw new Error('Embeddings service not available');
      }
      
      // Generate query embedding
      console.log(`[CategoryRetriever] Generating query embedding for: "${searchQuery}"`);
      const queryEmbedding = await embeddings.generate(searchQuery);
      
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        throw new Error('Failed to generate query embedding');
      }
      
      // Calculate semantic similarity for each filtered chunk
      semanticResults = repoFiltered.map(chunk => {
        let similarity = 0.1; // Default low similarity
        
        try {
          // Use chunk embedding if available
          if (chunk.embedding && Array.isArray(chunk.embedding)) {
            similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
          } else {
            // Fallback: basic content matching for chunks without embeddings
            const content = (chunk.content || '').toLowerCase();
            const queryLower = searchQuery.toLowerCase();
            if (content.includes(queryLower)) {
              similarity = 0.7;
            } else if (content.includes(entity || '')) {
              similarity = 0.6;
            }
          }
        } catch (err) {
          console.warn(`[CategoryRetriever] Similarity calculation failed for chunk ${chunk.id}:`, err.message);
        }
        
        return {
          ...chunk,
          similarity: similarity,
          salience: similarity
        };
      }).sort((a, b) => b.similarity - a.similarity);
      
      console.log(`[CategoryRetriever] Semantic ranking completed, top similarity: ${semanticResults[0]?.similarity || 0}`);
    } catch (searchError) {
      console.warn('[CategoryRetriever] Semantic search failed, falling back to content matching:', searchError.message);
      
      // Fallback to improved content-based similarity
      semanticResults = repoFiltered.map(chunk => {
        const content = (chunk.content || '').toLowerCase();
        const queryLower = q.toLowerCase();
        
        // Improved similarity: exact matches + partial matches + title matches
        let similarity = 0;
        const queryTerms = queryLower.split(/\s+/);
        const title = (chunk.title || '').toLowerCase();
        
        queryTerms.forEach(term => {
          // Exact content match
          if (content.includes(term)) {
            similarity += 0.3;
          }
          // Title match (higher weight)
          if (title.includes(term)) {
            similarity += 0.5;
          }
          // Metadata match
          if (chunk.metadata && JSON.stringify(chunk.metadata).toLowerCase().includes(term)) {
            similarity += 0.2;
          }
        });
        
        // Normalize by query length
        similarity = Math.min(similarity / queryTerms.length, 1.0);
        
        return {
          ...chunk,
          similarity: similarity,
          salience: similarity
        };
      }).sort((a, b) => b.similarity - a.similarity);
      
      console.log(`[CategoryRetriever] Fallback ranking completed, top similarity: ${semanticResults[0]?.similarity || 0}`);
    }
  } catch (error) {
    console.warn('[CategoryRetriever] Semantic search failed, using filtered chunks:', error.message);
    // Fallback: use filtered chunks with basic scoring
    semanticResults = repoFiltered.map(chunk => ({
      ...chunk,
      similarity: 0.5 // Default similarity
    }));
  }
  
  // Annotate doc type + score boost with safe defaults
  const annotated = semanticResults.map(m => {
    try {
      const safePath = m.path || m.filePath || m.sourcePath || m?.metadata?.path || '';
      const safeContent = (m.content || m.summary || '').slice(0, 2000);
      
      // Normalize upstream fields before classification
      const inferred = inferDocTypeSoft?.(safePath, safeContent) || 'documentation';
      const docType = m.docType ||
                     m.type ||
                     m.chunk_type ||
                     inferred;
      
      const boost = scoreDocType(docType);
      const baseScore = m.similarity || m.salience || 0;
      
      return {
        ...m,
        docType: docType,
        rerankScore: baseScore + boost,
        path: safePath,
        repo: m.repo || entity, // Default to entity if no repo specified
        chunkId: m.id || m.chunkId || `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
    } catch (error) {
      console.warn('[CategoryRetriever] soft-fail:', error.message);
      return {
        ...m,
        docType: 'documentation',
        rerankScore: m.similarity || m.salience || 0,
        path: m.path || '',
        repo: m.repo || entity,
        chunkId: m.id || m.chunkId || `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
    }
  });
  
  console.log(`[CategoryRetriever] Annotated ${annotated.length} chunks with doc types`);
  
  // Sort by rerank score
  annotated.sort((a, b) => (b.rerankScore - a.rerankScore));
  
  // Safe counter logic - initialize all buckets to 0, never compute with undefined
  const picked = [];
  const buckets = { readme_overview:0, api_examples:0, metadata:0, paper:0, code:0, documentation:0 };
  
  // Ensure all annotated items have docType assigned
  annotated.forEach(x => { 
    if (!x.docType) {
      const safePath = x.path || x.filePath || x.file || '';
      const safeContent = (x.content || '').slice(0, 2000); // avoid huge blobs
      x.docType = inferDocTypeSoft?.(safePath, safeContent) || 'documentation';
    }
  });
  
  for (const m of annotated) {
    // Apply your exact surgical patch for bucket tallying
    const safePath = m.path || m.filePath || m.file || '';
    const safeContent = (m.content || '').slice(0, 2000); // avoid huge blobs
    const type = inferDocTypeSoft?.(safePath, safeContent) || 'documentation';
    buckets[type] = (buckets[type] || 0) + 1;
    
    const bucket = typeBucket(type) || 'documentation';
    const quota = CATEGORY_QUOTAS[bucket] ?? Infinity;
    
    // Initialize bucket if missing (defensive)
    buckets[bucket] = buckets[bucket] || 0;
    
    if (buckets[bucket] >= quota) {
      const skipPath = m.path || m.filePath || m.sourcePath || m?.metadata?.path || '∅';
      console.log(`[CategoryRetriever] Skipping ${type} chunk: path=${skipPath} - quota exceeded (${buckets[bucket]}/${quota})`);
      continue;
    }
    
    picked.push(m);
    buckets[bucket]++;
    const logPath = m.path || m.filePath || m.sourcePath || m?.metadata?.path || '∅';
    console.log(`[CategoryRetriever] Picked ${type} chunk: path=${logPath} (bucket=${bucket}, count=${buckets[bucket]})`);
    
    if (picked.length >= k) break;
  }
  
  // If we still have room, fill from highest remaining
  if (picked.length < k) {
    for (const m of annotated) {
      if (picked.find(x => x.id === m.id)) continue;
      picked.push(m);
      if (picked.length >= k) break;
    }
  }
  
  console.log(`[CategoryRetriever] Final selection: ${picked.length} chunks`);
  console.log(`[CategoryRetriever] Category distribution:`, buckets);
  
  // Normalize once for meta-agent compatibility - your exact pattern:
  return picked.map(m => ({
    id: m.id,                          // stable
    path: m.path,                      // repo path
    content: m.content,                // snippet
    score: m.similarity || m.salience || 0,  // similarity
    ref: m.meta?.M || m.id,           // e.g., "M123" if you have it
    
    // Additional fields for compatibility
    repo: m.repo,
    chunkId: m.chunkId,
    docType: m.docType,
    rerankScore: m.rerankScore,
    source: `${m.repo}/${m.path}`,
    type: m.docType,
    timestamp: m.timestamp || Date.now()
  }));
  
  } catch (err) {
    console.warn(`[CategoryRetriever] soft-fail: ${err.message}`);
    // Continue with fallback search; do NOT return early
    return await memoryGraph.searchMemories(query, { limit: k });
  }
}

/**
 * Parse grounding gaps from LLM response
 * @param {string} text - LLM response text
 * @returns {Array<string>} List of needed document categories
 */
function parseGroundingGaps(text) {
  const needs = new Set();
  if (/readme/i.test(text)) needs.add('readme_overview');
  if (/license/i.test(text)) needs.add('metadata');
  if (/pyproject|package\.json/i.test(text)) needs.add('metadata');
  if (/paper|arxiv|reference/i.test(text)) needs.add('paper');
  if (/api|documentation/i.test(text)) needs.add('api_examples');
  return [...needs];
}

/**
 * Handle grounding gaps with targeted retrieval
 * @param {string} reply - LLM reply indicating missing information
 * @param {Object} memoryGraph - Memory graph instance
 * @param {string} entity - Target entity
 * @param {string} userQuery - Original user query
 * @returns {Promise<Array|null>} Additional targeted results or null
 */
async function handleGroundingGaps(reply, memoryGraph, entity, userQuery) {
  const needs = parseGroundingGaps(reply);
  if (needs.length === 0) return null;
  
  console.log(`[CategoryRetriever] Detected grounding gaps: ${needs.join(', ')}`);
  
  const targeted = await categoryAwareRetrieve(memoryGraph, {
    query: `${userQuery} ${needs.join(' ')}`,
    entity,
    k: 8
  });
  
  console.log(`[CategoryRetriever] Gap-filling retrieval returned ${targeted.length} additional chunks`);
  return targeted;
}

module.exports = { 
  categoryAwareRetrieve, 
  parseGroundingGaps, 
  handleGroundingGaps,
  inferDocTypeSoft,
  scoreDocTypes,
  typeBucket,
  scoreDocType
};
