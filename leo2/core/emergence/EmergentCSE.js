/**
 * Emergent Context and Salience Engine
 * 
 * Replaces hardcoded CSE with fully emergent behavior. All context, capabilities,
 * and identity emerge from memory graph contents via salience weighting.
 * No hardcoded identity or capabilities.
 * 
 * @created 2025-08-01
 * @phase COS Implementation - Emergent Behavior
 */

const { EmergentBehaviorCoordinator } = require('./EmergentBehaviorCoordinator');
const { rankMemories } = require('../cse/salience_ranker');
const { createComponentLogger } = require('../../../lib/utils/logger');
const SemanticContextManager = require('../../../lib/services/semantic-context-manager');
const { getEmbeddingsInterface } = require('../../boot/embeddings-factory');

// --- Analytical Intent Detection (User's Lightweight Approach) ---
const ANALYTICAL_MARKERS = [
  'compare', 'contrast', 'vs', 'versus', 'tradeoff', 'benchmark',
  'analyz', 'analyz', 'analysis', 'evaluate', 'evaluation',
  'how does * differ', 'relative to', 'pros and cons'
];

function detectAnalyticalIntent(q) {
  const s = (q || '').toLowerCase();
  if (ANALYTICAL_MARKERS.some(m => s.includes(m))) return { analytical: true, reason: 'rule_match' };
  // soft fallback: short length & multiple entities → analytical-ish
  const tokens = s.split(/\s+/).filter(Boolean).length;
  if (tokens >= 6 && extractEntities.call(this, s).length >= 2) return { analytical: true, reason: 'multi_entity' };
  return { analytical: false, reason: 'none' };
}

// naive but robust entity extraction: code symbols, StudlyCase, snake_case, known repos, glossary
function extractEntities(q) {
  const found = new Set();
  const add = v => { if (v && v.length >= 2 && v.length <= 64) found.add(v); };

  // code-ish tokens
  (q.match(/[A-Za-z_][A-Za-z0-9_]+/g) || []).forEach(add);

  // known entities from memory graph index (if available)
  if (this?.memoryGraph?.listKnownEntities) {
    try {
      const known = this.memoryGraph.listKnownEntities();
      for (const e of known) {
        if (q.toLowerCase().includes(String(e).toLowerCase())) add(e);
      }
    } catch {}
  }
  
  // de-dup; return array
  return Array.from(found);
}

// adaptive similarity gate with entity awareness
function adaptiveGate({ base, isAnalytical, entityRank, cfg }) {
  const min = cfg?.minSimilarity || 0.62;
  const analyticalSlack = isAnalytical ? (cfg?.analyticalSlack || 0.06) : 0.0;
  const entityBoost = (entityRank <= 2) ? (cfg?.topEntitySlack || 0.05) : 0.0;
  return base >= (min - analyticalSlack - entityBoost);
}

// Component name for logging
const COMPONENT_NAME = 'emergent-cse';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Salience thresholds for fusion weights - adjusted for normalized cosine similarity [0,1]
const salienceStrong = 0.65;  // Strong matches after normalization
const salienceBlendHi = 0.65;
const salienceBlendLo = 0.45;  // Blend threshold for normalized scores

/**
 * Emergent Context and Salience Engine Class
 * 
 * Provides context and salience ranking with fully emergent behavior
 */
class EmergentCSE {
  /**
   * Constructor
   * @param {Object} dependencies - Dependencies
   */
  constructor(memoryGraph, config = {}) {
    console.log('[CSE] Using EmergentCSE from', __filename);
    this.memoryGraph = memoryGraph;
    this.config = config;
    this.flowMonitor = config.flowMonitor;
    this.interactionMemory = config.interactionMemory;
    
    // Initialize emergent behavior coordinator
    this.emergentCoordinator = new EmergentBehaviorCoordinator({
      salienceThreshold: 0.01,  // Lowered from 0.1 to cast wider net
      maxContextItems: 50,      // Increased from 15 for more context
      maxCapabilities: 20,
      emergentIdentityEnabled: true,
      behaviorLearningEnabled: true,
      contextEvolutionEnabled: true
    });
    
    // Remove any hardcoded identity or capabilities
    this.hardcodedIdentity = null;
    this.hardcodedCapabilities = null;
    
    // Track initialization state
    this.isSemanticSearchInitialized = false;
    this.semanticInitPromise = null;
    
    logger.info('EmergentCSE initialized', {
      emergentOnly: true,
      hardcodedRemoved: true,
      memoryGraphConnected: !!this.memoryGraph,
      semanticSearchEnabled: false // Will be true after async init
    });
  }
  
  /**
   * Initialize EmergentCSE - called by orchestrator
   */
  async initialize() {
    console.log('🚀 [EmergentCSE] Initialize method called by orchestrator');
    
    try {
      // Initialize semantic search capabilities
      await this.initializeSemanticSearch();
      console.log('✅ [EmergentCSE] Fully initialized');
      return true;
    } catch (error) {
      console.error('❌ [EmergentCSE] Initialization failed:', error);
      return false;
    }
  }
  
  /**
   * Initialize semantic search capabilities
   */
  async initializeSemanticSearch() {
    // Return existing promise if already initializing
    if (this.semanticInitPromise) {
      return this.semanticInitPromise;
    }
    
    // Create and store the initialization promise
    this.semanticInitPromise = this._performSemanticInit();
    return this.semanticInitPromise;
  }
  
  async _performSemanticInit() {
    try {
      console.log('[EmergentCSE] Initializing semantic search...');
      
      // Initialize embeddings using bulletproof factory
      const embeddings = getEmbeddingsInterface();
      this.embeddings = embeddings;
      console.log('[EmergentCSE] True semantic embeddings initialized');
      
      // Set up embeddings service for semantic context manager
      const { EmbeddingsService, setEmbeddingsService } = SemanticContextManager;
      
      // Debug the embeddings interface
      console.log('[EmergentCSE] Embeddings interface methods:', Object.keys(embeddings));
      console.log('[EmergentCSE] Has generate:', typeof embeddings.generate);
      console.log('[EmergentCSE] Has similarity:', typeof embeddings.similarity);
      console.log('[EmergentCSE] Has normalize:', typeof embeddings.normalize);
      
      const embeddingsService = new EmbeddingsService({
        trueSemanticEmbeddingsInterface: embeddings,
        logger: logger
      });
      setEmbeddingsService(embeddingsService);
      console.log('[EmergentCSE] Embeddings service initialized and registered');
      
      // Mark as initialized
      this.isSemanticSearchInitialized = true;
      console.log('✅ [EmergentCSE] Semantic search fully initialized');
      
    } catch (error) {
      console.error('❌ [EmergentCSE] Failed to initialize semantic search:', error);
      this.isSemanticSearchInitialized = false;
      throw error; // Re-throw so callers know initialization failed
    }
  }
  
  /**
   * Get emergent context with salience-first fusion system
   * @param {string|Object} queryOrOptions - Query string or options object
   * @param {Object} opts - Options (when first param is string)
   * @returns {Promise<Object>} Context with fusion weights and memory cards
   */
  async getEmergentContext(queryOrOptions, opts = {}) {
    try {
      // Handle both old and new calling conventions
      let query, limit, tokenBudget, maxCards;
      if (typeof queryOrOptions === 'string') {
        query = queryOrOptions;
        limit = opts.limit || 50;
        tokenBudget = opts.tokenBudget || 2200;
        maxCards = opts.maxCards || 12;
        console.log('[EmergentCSE] PHASE 3 DEBUG: Received opts:', { intent: opts?.intent, sessionId: opts?.sessionId });
      } else {
        query = queryOrOptions.query;
        limit = queryOrOptions.limit || 50;
        tokenBudget = queryOrOptions.tokenBudget || 2200;
        maxCards = queryOrOptions.maxCards || 12;
        console.log('[EmergentCSE] PHASE 3 DEBUG: Received queryOrOptions:', { intent: queryOrOptions?.intent, sessionId: queryOrOptions?.sessionId });
      }

      // Preprocess comparative queries for better entity retrieval
      const processedQuery = this.preprocessComparativeQuery(query);
      
      // USE OPTIMIZED RETRIEVAL PIPELINE IF AVAILABLE
      let candidates;
      let useOptimizedPipeline = false;
      
      if (this.optimizedRetrieval && typeof this.optimizedRetrieval.retrieveOptimized === 'function') {
        console.log('[EmergentCSE] 🚀 Using OptimizedMemoryRetrieval pipeline');
        const optimizedResult = await this.optimizedRetrieval.retrieveOptimized(processedQuery, {
          initialRetrievalCount: Math.max(limit, 100),
          finalCoreCount: maxCards,
          // PHASE 3: Pass intent and sessionId for conversation recall
          intent: opts?.intent,
          sessionId: opts?.sessionId,
          // PHASE 3.5: Pass scope for cross-session recall
          scope: opts?.scope
        });
        
        // Use orchestrator view (wider context) for CSE processing
        candidates = optimizedResult.orchestratorMemories || optimizedResult.coreMemories || [];
        useOptimizedPipeline = true;
        console.log(`[EmergentCSE] OptimizedRetrieval returned ${candidates.length} candidates (stage1: ${optimizedResult.metadata?.stage1Count}, stage2: ${optimizedResult.metadata?.stage2Count})`);
        console.log(`[EmergentCSE] ⚠️  SKIPPING dynamic gating - OptimizedRetrieval already ranked and selected`);
      } else {
        // FALLBACK: Direct memory graph search
        console.log('[EmergentCSE] Using fallback memory graph search');
        candidates = await this.memoryGraph.searchMemories({ 
          query: processedQuery,
          limit: Math.max(limit, 100)
        });
        console.log(`[EmergentCSE] Memory search returned ${candidates.length} candidates for query: "${processedQuery}"`);
      }

      // 2) Normalize cosine and compute dynamic threshold (percentile-based)
      const to01 = (cosRaw) => {
        if (Number.isFinite(cosRaw)) return (cosRaw + 1) / 2;
        return 0.0;
      };

      let finalScored;
      let dynamicGate = 0; // Default for metadata
      
      if (useOptimizedPipeline) {
        // SKIP GATING: OptimizedRetrieval already did ranking and selection
        // Just ensure salience is computed for fusion weights
        const enriched = candidates.map((chunk) => {
          const cos01 = to01(chunk.similarity ?? chunk.cosine ?? 0);
          const ageDays = chunk.metadata?.timestamp ? (Date.now() - chunk.metadata.timestamp) / (1000 * 60 * 60 * 24) : 365;
          const recencyBoost = ageDays < 7 ? 0.08 : ageDays < 30 ? 0.04 : 0;
          const authorityBoost = (chunk.metadata?.importance ?? 0.5) > 0.8 ? 0.06 : 0;

          // Use existing salience if available, otherwise compute
          const salience = chunk.salience || Math.max(0, Math.min(1, (cos01 * 0.8) + recencyBoost + authorityBoost));
          return { ...chunk, cos01, salience };
        });
        
        finalScored = enriched.slice(0, maxCards);
        dynamicGate = 0; // No gating applied when using OptimizedRetrieval
        console.log(`[EmergentCSE] Using ${finalScored.length} pre-ranked memories from OptimizedRetrieval`);
        
      } else {
        // LEGACY PATH: Apply dynamic gating for fallback retrieval
        const percentile = (arr, p) => {
          if (!arr.length) return 0;
          const sorted = [...arr].sort((a,b)=>a-b);
          const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p/100) * (sorted.length-1))));
          return sorted[idx];
        };

        const sims01 = candidates.map(c => to01(c.similarity || c.cosine || 0));
        const p60 = percentile(sims01, 60);
        const p80 = percentile(sims01, 80);

        // Floor and ceiling so we never over/under gate - demo-safe defaults
        const MIN_GATE = 0.08;   // lowered for demo dataset
        const MAX_GATE = 0.22;   // avoid starving the pipeline
        const dynamicGate = Math.max(MIN_GATE, Math.min(MAX_GATE, p60 || 0.1));

        console.log(`[EmergentCSE] Dynamic gate: ${dynamicGate.toFixed(3)} (p60: ${p60?.toFixed(3)}, p80: ${p80?.toFixed(3)})`);

        // 3) Compute salience with boosts, then apply adaptive gate + Top-K safety
        const enriched = candidates.map((chunk) => {
          const cos01 = to01(chunk.similarity ?? chunk.cosine ?? 0);
          const ageDays = chunk.metadata?.timestamp ? (Date.now() - chunk.metadata.timestamp) / (1000 * 60 * 60 * 24) : 365;
          const recencyBoost = ageDays < 7 ? 0.08 : ageDays < 30 ? 0.04 : 0;
          const authorityBoost = (chunk.metadata?.importance ?? 0.5) > 0.8 ? 0.06 : 0;

          // weight similarity high; boosts small but meaningful
          const salience = Math.max(0, Math.min(1, (cos01 * 0.8) + recencyBoost + authorityBoost));
          return { ...chunk, cos01, salience };
        });

        const sorted = enriched.sort((a,b) => b.salience - a.salience);

        // Primary filter using dynamic gate
        let primary = sorted.filter(m => m.salience >= dynamicGate);

        // Top-K safety net: if we starved, pass the top few anyway (flag lowConfidence)
        const K_MIN = 6;
        if (primary.length < K_MIN) {
          const fallback = sorted.slice(0, K_MIN).map(m => ({ ...m, lowConfidence: true }));
          // merge unique by id or content hash
          const seen = new Set(primary.map(x => x.id || x.key || x.content));
          for (const f of fallback) {
            if (!seen.has(f.id || f.key || f.content)) {
              primary.push(f);
            }
          }
          console.log(`[EmergentCSE] Safety net: Added ${fallback.length} low-confidence memories`);
        }

        // Cap total cards to something sane
        const MAX_CARDS = 12;
        finalScored = primary.slice(0, MAX_CARDS);
      }

      // 4) Derive fusion weights from top-N mean salience, not fixed rules
      const topN = finalScored.slice(0, 8);
      const avgSalience = topN.length ? topN.reduce((s,m)=>s+m.salience,0)/topN.length : 0;

      // Map avgSalience → memoryWeight in [0.15..0.85] linearly
      const lerp = (a,b,t) => a + (b - a) * t;
      const memoryWeight = lerp(0.15, 0.85, Math.max(0, Math.min(1, (avgSalience - 0.06) / (0.22 - 0.06))));
      let generalWeight = 1 - memoryWeight;

      // If most cards are lowConfidence, soften the memory weight
      const lowConfShare = finalScored.length
        ? finalScored.filter(m=>m.lowConfidence).length / finalScored.length
        : 1;
      const adjustedMemoryWeight = lowConfShare > 0.5 ? Math.min(memoryWeight, 0.35) : memoryWeight;
      generalWeight = 1 - adjustedMemoryWeight;

      console.log(`[EmergentCSE] Fusion weights: memory=${adjustedMemoryWeight.toFixed(2)}, general=${generalWeight.toFixed(2)}, lowConf=${(lowConfShare*100).toFixed(0)}%`);

      // 5) Build memory cards from filtered results
      const ranked = finalScored.sort((a,b)=> b.salience - a.salience);

      // 4) Build memory cards with token budget fitting
      const cards = [];
      let usedTokens = 0;
      for (const m of ranked) {
        if (cards.length >= maxCards) break;
        const cardObj = this.buildMemoryCard(m);
        const tks = this.estimateTokens(cardObj.content || '');
        if (usedTokens + tks > tokenBudget) break;
        usedTokens += tks;
        cards.push({ 
          type: 'memory', 
          ...cardObj,
          id: m.id,
          lowConfidence: m.lowConfidence || false
        });
      }
      
      // Record memory retrieval metrics
      const { observability } = require('../../lib/utils/observability');
      const cardAvgSalience = cards.length > 0 ? 
        cards.reduce((sum, card) => sum + (card.salience || 0), 0) / cards.length : 0;

      // 7) Generate contextual rationale
      const rationale = adjustedMemoryWeight < 0.3
        ? 'Low-confidence project matches; favoring general knowledge with light memory seasoning.'
        : 'Strong project matches; prioritizing memory-backed reasoning.';
      
      const routingHint = adjustedMemoryWeight > 0.6 ? 'memory-first' : 
                         adjustedMemoryWeight < 0.3 ? 'general-first' : 'blend';

      // Record memory retrieval for observability
      observability.recordMemoryRetrieval(cards.length, cardAvgSalience, routingHint);

      // 8) Return standardized fusion envelope
      const fusion = {
        memoryCards: cards.map(card => ({
          label: card.id || `M${cards.indexOf(card) + 1}`,
          content: card.content,
          tokens: this.estimateTokens(card.content),
          salience: card.salience,
          sourceId: card.id,
          lowConfidence: card.lowConfidence || false
        })),
        avgSalience,
        memoryWeight: adjustedMemoryWeight,
        generalWeight,
        rationale,
        routingHint,
        hadCandidates: candidates.length > 0,
        dynamicGate,
        lowConfidenceCount: cards.filter(c => c.lowConfidence).length
      };

      const context = { fusion };

      // 9) Diagnostics for observability
      logger.info('[CSE] Fusion', {
        avgSalience: Number(avgSalience.toFixed(3)),
        memoryWeight: Number(memoryWeight.toFixed(2)),
        generalWeight: Number(generalWeight.toFixed(2)),
        cards: cards.length,
        tokenBudget,
        usedTokens
      });

      return context;

    } catch (error) {
      console.error('[EmergentCSE] [CRITICAL ERROR] getEmergentContext failed:', error.message);
      console.error('[EmergentCSE] [CRITICAL ERROR] Stack:', error.stack);
      logger.error('[EmergentCSE] Error in getEmergentContext:', error);
      return {
        fusion: {
          memoryCards: [],
          avgSalience: 0,
          memoryWeight: 0.2,
          generalWeight: 0.8,
          rationale: 'Error occurred during context retrieval',
          routingHint: 'general-first'
        }
      };
    }
  }

  /**
   * Preprocess comparative queries to extract key entities
   * @param {string} query - Original query
   * @returns {string} Processed query optimized for entity retrieval
   */
  preprocessComparativeQuery(query) {
    // Detect comparative patterns
    const comparativePatterns = [
      /compare\s+(.+?)\s+(?:with|to|against)\s+(.+?)(?:\s|$)/i,
      /(?:difference|differences)\s+between\s+(.+?)\s+and\s+(.+?)(?:\s|$)/i,
      /how\s+(?:does|do)\s+(.+?)\s+(?:differ|compare)\s+(?:from|to|with)\s+(.+?)(?:\s|$)/i
    ];

    for (const pattern of comparativePatterns) {
      const match = query.match(pattern);
      if (match) {
        const entity1 = match[1].trim();
        const entity2 = match[2].trim();
        
        // Focus on project-specific entities, filter out generic terms
        const projectTerms = [entity1, entity2].filter(term => 
          !['textbook', 'standard', 'traditional', 'typical', 'general'].includes(term.toLowerCase())
        );
        
        if (projectTerms.length > 0) {
          console.log(`[EmergentCSE] Comparative query detected: focusing on ${projectTerms.join(', ')}`);
          return projectTerms.join(' ') + ' implementation details';
        }
      }
    }
    
    return query; // Return original if no comparative pattern found
  }

  /**
   * Build a concise memory card from a chunk with provenance validation
   * NOTE: This method is deprecated - use compact evidence headers in orchestrator agent loop instead
   */
  buildMemoryCard(m) {
    // Return minimal card structure for synthesis prompt
    let src = 'project-memory';
    if (m.metadata?.source) {
      src = m.metadata.source;
    } else if (m.metadata?.repo && m.metadata?.path) {
      src = `${m.metadata.repo}/${m.metadata.path}`;
    } else if (m.metadata?.repo) {
      src = m.metadata.repo;
    }
    
    // Clean content - remove any pre-formatted MEMORY_SNIPPET wrapper
    let cleanContent = m.content || '';
    if (cleanContent.includes('MEMORY_SNIPPET')) {
      console.log('[MEMORY CLEANING] Found MEMORY_SNIPPET in content, cleaning...');
      // Strip all MEMORY_SNIPPET formatting
      cleanContent = cleanContent
        .replace(/^\*\*?\[?MEMORY_SNIPPET[^\n]*\n?/gmi, '')
        .replace(/^\s*Salience:\s*[0-9.]+\s*$/gmi, '')
        .replace(/^\s*Summary:\s*/gmi, '')
        .trim();
      console.log('[MEMORY CLEANING] Cleaned content:', cleanContent.substring(0, 100) + '...');
    }
    
    return {
      label: src,
      source: src,
      salience: m.salience || 0,
      content: cleanContent,
      metadata: m.metadata
    };
  }

  /**
   * Compute salience score for a memory chunk
   * @param {Object} chunk - Memory chunk with similarity and metadata
   * @param {string} query - Original query for context
   * @returns {number} Salience score (0-1)
   */
  computeSalience(chunk, query) {
    // Base salience from similarity score
    let salience = chunk.similarity || 0;
    
    // Recency boost (if timestamp available)
    if (chunk.metadata?.timestamp) {
      const age = Date.now() - chunk.metadata.timestamp;
      const daysSinceCreated = age / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.max(0, 0.1 * Math.exp(-daysSinceCreated / 30)); // Decay over 30 days
      salience += recencyBoost;
    }
    
    // Authority boost (if source indicates high authority)
    if (chunk.metadata?.source) {
      const authorityBoost = chunk.metadata.source.includes('tensoract') ? 0.05 : 0;
      salience += authorityBoost;
    }
    
    // Content length penalty for very short chunks
    if (chunk.content && chunk.content.length < 50) {
      salience *= 0.8;
    }
    
    return Math.min(1.0, Math.max(0.0, salience));
  }

  /**
   * Estimate tokens for content (rough approximation)
   */
  estimateTokens(content) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Summarize content to one or two sentences
   */
  summarizeToOneOrTwoSentences(content) {
    if (!content) return 'No content available';
    
    // Simple sentence splitting and truncation
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 2) return content;
    
    // Take first two sentences and add ellipsis if truncated
    const summary = sentences.slice(0, 2).join('. ').trim();
    return summary + (sentences.length > 2 ? '...' : '');
  }

  /**
   * Legacy getEmergentContext method for backward compatibility
   * @param {Object} params - Parameters with query and flowState
   * @returns {Promise<Object>} Emergent context
   */
  async getEmergentContextLegacy({ query, flowState }) {
    try {
      const startTime = Date.now();
      
      logger.debug('Generating emergent context (legacy)', {
        query: query?.substring(0, 50),
        hasFlowState: !!flowState
      });
      
      // Generate fully emergent context from memory
      const emergentContext = await this.emergentCoordinator.generateEmergentContext(
        this.memoryGraph,
        query,
        { flowState }
      );
      
      // Get recent memories for recency context
      const recentMemories = await this.getRecentMemoriesWithSalience(query, 7);
      
      // Get salient memories ranked by relevance (increased for richer context)
      console.log(' [EmergentCSE] Calling getSalientMemoriesRanked...');
      const salientMemoriesResult = await this.getSalientMemoriesRanked(query, 8);
      const salientMemories = salientMemoriesResult.memories || [];
      console.log(' [EmergentCSE] getSalientMemoriesRanked returned:', salientMemories.length, 'memories');
      
      // Build emergent context response
      const context = {
        // Recent conversation context
        memories: recentMemories,
        
        // Salient memory objects (emergent) - return full memory objects, not just summaries
        salientMemories: salientMemories.map(m => ({
          content: m.memory?.content || m.summary || m.content || 'No content available',
          salience: m.salience || 0,
          source: m.memory?.source || 'unknown',
          type: m.memory?.type || 'memory',
          userInput: m.memory?.userInput,
          llmResponse: m.memory?.llmResponse,
          fact: m.memory?.fact,
          summary: m.summary,
          timestamp: m.memory?.timestamp || Date.now()
        })),
        
        // Emergent memory context
        memoryContext: emergentContext.memoryContext,
        
        // Emergent capabilities (no hardcoded list)
        capabilities: emergentContext.capabilities,
        
        // Emergent identity (no hardcoded "Leo")
        identity: emergentContext.identity,
        
        // Flow state
        flowState: this.flowMonitor?.currentFlow || flowState,
        
        // Metadata
        metadata: {
          totalMemoryItems: emergentContext.memoryContext.length,
          totalCapabilities: emergentContext.capabilities.length,
          hasEmergentIdentity: !!emergentContext.identity,
          emergentOnly: true,
          hardcodedRemoved: true,
          generationDuration: Date.now() - startTime,
          generatedAt: Date.now()
        }
      };
      
      // Validate no hardcoded content
      this.validateEmergentContext(context);
      
      logger.info('Emergent context generated', {
        memoryItems: context.memoryContext.length,
        capabilities: context.capabilities.length,
        hasIdentity: !!context.identity,
        recentMemories: context.memories.length,
        salientMemories: context.salientMemories.length,
        duration: context.metadata.generationDuration
      });
      
      return context;
      
    } catch (error) {
      logger.error('Failed to generate emergent context', { error: error.message });
      
      // Return minimal emergent context on error
      return {
        memories: [],
        salientMemories: [],
        memoryContext: [],
        capabilities: [],
        identity: null, // No hardcoded identity
        flowState: flowState,
        metadata: {
          error: error.message,
          emergentOnly: true,
          hardcodedRemoved: true,
          generatedAt: Date.now()
        }
      };
    }
  }
  
  /**
   * Get recent memories with salience scoring
   * @param {string} query - Query for context
   * @param {number} limit - Memory limit
   * @returns {Promise<Array>} Recent memories
   */
  async getRecentMemoriesWithSalience(query, limit = 7) {
    try {
      const recentMemories = await this.memoryGraph.getRecentMemories({ limit: limit * 2 });
      
      // Rank recent memories by salience to query
      const rankedRecent = rankMemories(recentMemories, { query });
      
      // Return top N most salient recent memories
      return rankedRecent.slice(0, limit).map(ranked => ranked.memory);
      
    } catch (error) {
      logger.error('Failed to get recent memories', { error: error.message });
      return [];
    }
  }
  
  /**
   * Get salient memories ranked by relevance using TARGETED RETRIEVAL
   * @param {string} query - Query for ranking
   * @param {number} limit - Memory limit
   * @returns {Promise<Array>} Salient memories
   */
  async getSalientMemoriesRanked(query, limit = 150) { // Increased to surface 100+ memories
    // Debug logging to check query value
    console.log('🔍 [EmergentCSE] getSalientMemoriesRanked called with:', { query: typeof query, value: query });
    
    // Validate query
    if (!query || typeof query !== 'string') {
      console.error('❌ [EmergentCSE] Invalid query passed to getSalientMemoriesRanked:', query);
      return [];
    }
    
    // 🎯 RETRIEVAL SOURCE LOGGING
    console.log('📍 [RETRIEVAL_BACKEND] Entering getSalientMemoriesRanked');
    
    // 🚨 CRITICAL: Use memoryGraph.searchMemories as source of truth
    // File-based retrieval is ONLY for dev/debugging when explicitly enabled
    const useFileRetrieval = process.env.LEO_DEV_FILE_RETRIEVAL === 'true';
    
    if (!useFileRetrieval) {
      // PRODUCTION PATH: Delegate to memory graph
      console.log('📍 [RETRIEVAL_BACKEND] retrieval_backend=memoryGraph.searchMemories (PRODUCTION)');
      
      try {
        const results = await this.memoryGraph.searchMemories({
          query,
          limit: Math.max(limit, 100)
        });
        
        console.log(`✅ [RETRIEVAL_BACKEND] Retrieved ${results.length} memories from memoryGraph`);
        return results;
        
      } catch (error) {
        console.error('❌ [RETRIEVAL_BACKEND] memoryGraph.searchMemories failed:', error.message);
        console.error('📍 [RETRIEVAL_BACKEND] Falling back to empty results (NO FILE FALLBACK)');
        return [];
      }
    }
    
    // 🔧 DEV-ONLY PATH: Direct file retrieval (QUARANTINED)
    console.warn('⚠️  [RETRIEVAL_BACKEND] retrieval_backend=file_jsonl_fallback (DEV MODE ONLY)');
    console.warn('⚠️  [RETRIEVAL_BACKEND] LEO_DEV_FILE_RETRIEVAL=true - This should NOT be used in production!');
    
    try {
      // Reduced logging to prevent massive output
      if (process.env.LEO_DEBUG) {
        console.log('🎯 [EmergentCSE] TARGETED RETRIEVAL for query:', query.substring(0, 50));
      }
      
      // Ensure semantic search is initialized
      if (!this.isSemanticSearchInitialized) {
        console.log('[EmergentCSE] Initializing semantic search for targeted retrieval...');
        await this.initializeSemanticSearch();
      }
      
      console.log('🔍 [EmergentCSE] Using direct chunk search (DEV MODE)...');
      
      // Direct memory graph search from leo_memory_graph.jsonl file
      const fs = require('fs');
      const chunksContent = fs.readFileSync('data/leo_memory_graph.jsonl', 'utf8');
        const allChunks = chunksContent.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.warn('[EmergentCSE] Skipping malformed chunk:', line.substring(0, 100));
              return null;
            }
          })
          .filter(chunk => chunk !== null);
        
        console.log(`📊 [EmergentCSE] Loaded ${allChunks.length} chunks from file`);
        
        // Load embeddings and match to chunks
        const embeddingsContent = fs.readFileSync('data/embeddings.jsonl', 'utf8');
        const embeddingsMap = new Map();
        embeddingsContent.split('\n')
          .filter(line => line.trim())
          .forEach(line => {
            try {
              const embedding = JSON.parse(line);
              embeddingsMap.set(embedding.id, embedding.vector);
            } catch (e) {
              console.warn('[EmergentCSE] Skipping malformed embedding:', line.substring(0, 50));
            }
          });
        
        console.log(`📊 [EmergentCSE] Loaded ${embeddingsMap.size} embeddings`);
        
        // Attach embeddings to chunks
        allChunks.forEach(chunk => {
          if (embeddingsMap.has(chunk.id)) {
            chunk.embedding = embeddingsMap.get(chunk.id);
          }
        });
        
        const chunksWithEmbeddings = allChunks.filter(chunk => chunk.embedding);
        console.log(`📊 [EmergentCSE] ${chunksWithEmbeddings.length} chunks have embeddings`);
        
        // Extract key terms from query (remove question words)
        let keyTerms = query.toLowerCase()
          .replace(/what\s+is\s+/gi, '')
          .replace(/who\s+is\s+/gi, '')
          .replace(/how\s+does\s+/gi, '')
          .replace(/\?/g, '')
          .trim();
        
        // Expand common acronyms to full terms
        if (keyTerms === 'cse') {
          keyTerms = 'contextual salience engine';
        }
        
        console.log(`🔎 [EmergentCSE] Original query: "${query}"`);
        console.log(`🔎 [EmergentCSE] Extracted terms: "${keyTerms}"`);
        
        // SEMANTIC-FIRST RETRIEVAL: Type-based and semantic filtering, not keyword filtering
        
        // 1. EXCLUDE: Only clearly non-valuable types
        const EXCLUDED_TYPES = [
          'dev_log',
          'chat_meta', 
          'debug_session',
          'troubleshooting'
        ];
        
        // 2. INCLUDE: Core system types for CSE-related queries (always include regardless of content)
        const CSE_CORE_TYPES = ['cse_goal', 'cse_value', 'cse_identity', 'identity_anchor'];
        const SYSTEM_CORE_TYPES = ['system_spec', 'architecture', 'api_doc', 'documentation'];
        const KNOWLEDGE_TYPES = ['project_fact', 'component_description', 'decision_rationale'];
        
        // 3. Query-specific type mapping
        const lowerKeyTerms = keyTerms.toLowerCase();
        let relevantTypes = [];
        if (lowerKeyTerms.includes('cse') || lowerKeyTerms.includes('emergent') || lowerKeyTerms.includes('salience')) {
          relevantTypes = [...CSE_CORE_TYPES, ...SYSTEM_CORE_TYPES, ...KNOWLEDGE_TYPES];
        } else {
          relevantTypes = [...SYSTEM_CORE_TYPES, ...KNOWLEDGE_TYPES];
        }
        
        const allMemories = allChunks.filter(chunk => {
          const content = (chunk.content || '').toLowerCase();
          const chunkType = chunk.type || chunk.chunk_type || '';
          
          // EXCLUDE: Explicitly blocked types
          if (EXCLUDED_TYPES.includes(chunkType)) {
            console.log(`🚫 [EmergentCSE] Excluded by type: ${chunk.id} (${chunkType})`);
            return false;
          }
          
          // EXCLUDE: Debugging content patterns
          const hasDebuggingPatterns = [
            'looking at the logs',
            'let me create a comprehensive fix', 
            'cli debug',
            'error occurred',
            'failed to execute',
            'step id:',
            'tool call failed',
            'debugging session',
            'troubleshooting step'
          ].some(pattern => content.includes(pattern));
          
          if (hasDebuggingPatterns) {
            console.log(`🚫 [EmergentCSE] Excluded debugging patterns: ${chunk.id}`);
            return false;
          }
          
          // INCLUDE: Type-based inclusion (semantic category matching)
          const isRelevantType = relevantTypes.includes(chunkType);
          
          // INCLUDE: Content-based inclusion (as secondary signal)
          const lowerContent = content.toLowerCase();
          const lowerMetadata = JSON.stringify(chunk.metadata || {}).toLowerCase();
          
          const contentMatch = lowerContent.includes(lowerKeyTerms) || 
                              lowerMetadata.includes(lowerKeyTerms);
          
          // INCLUDE: Semantic variations (as tertiary signal)
          let semanticMatch = false;
          if (lowerKeyTerms.includes('cse') || lowerKeyTerms.includes('emergent')) {
            const termWords = lowerKeyTerms.split(/[\s-_]+/).filter(w => w.length > 2);
            semanticMatch = termWords.some(word => lowerContent.includes(word)) ||
                           lowerContent.includes('emergent') || 
                           lowerContent.includes('salience') || 
                           lowerContent.includes('contextual') ||
                           lowerContent.includes('engine');
          }
          
          const shouldInclude = isRelevantType || contentMatch || semanticMatch;
          
          console.log(`🔍 [EmergentCSE] Chunk ${chunk.id}: type=${chunkType}, typeMatch=${isRelevantType}, contentMatch=${contentMatch}, semanticMatch=${semanticMatch}, shouldInclude=${shouldInclude}`);
          
          return shouldInclude;
        });
        
        console.log(`🎯 [EmergentCSE] Found ${allMemories.length} matching chunks`);
        const limitedMemories = allMemories.slice(0, limit * 2);
        
        console.log(`🔍 [EmergentCSE] Raw memories found: ${limitedMemories.length}`);
        if (limitedMemories.length > 0) {
          console.log('Sample memory structure:', Object.keys(limitedMemories[0]));
        }
        
        // Check if this is a non-project query that should fall back to LLM training
        const isNonProjectQuery = limitedMemories.length === 0 && this.isGeneralKnowledgeQuery(keyTerms);
        if (isNonProjectQuery) {
          console.log(`🎂 [EmergentCSE] Non-project query detected: "${keyTerms}" - enabling LLM fallback`);
        }
        
        // Calculate semantic similarity for proper salience ranking
        const memoriesWithSalience = await Promise.all(limitedMemories.map(async (chunk) => {
          const content = chunk.content || chunk.userInput || chunk.fact || '';
          const id = chunk.id || 'unknown';
          
          // Calculate semantic similarity if embeddings are available
          let salience = 0.5; // Default salience
          try {
            if (this.embeddingsInterface && chunk.embedding) {
              // Generate query embedding
              const queryEmbedding = await this.embeddingsInterface.generate(keyTerms);
              // Calculate cosine similarity
              salience = this.calculateCosineSimilarity(queryEmbedding, chunk.embedding);
            } else {
              // Fallback: text-based relevance scoring
              salience = this.calculateTextRelevance(keyTerms, content);
            }
          } catch (error) {
            console.warn(`[EmergentCSE] Failed to calculate salience for chunk ${id}:`, error.message);
          }
          
          // ENHANCED HYBRID SCORING: Type + Recency + Authority boosting
          const chunkType = chunk.type || chunk.chunk_type || '';
          let typeBoost = 0;
          let recencyBoost = 0;
          let authorityBoost = 0;
          
          // Enhanced type-based scoring with granular weights
          if (chunkType === 'documentation') {
            typeBoost = 0.25; // Highest priority for docs
          } else if (['architecture', 'system_spec', 'api_doc'].includes(chunkType)) {
            typeBoost = 0.22; // High priority for technical specs
          } else if (['project_fact', 'component_description'].includes(chunkType)) {
            typeBoost = 0.18; // High priority for facts
          } else if (['decision_rationale', 'project_goal'].includes(chunkType)) {
            typeBoost = 0.15; // Medium-high priority for context
          } else if (chunkType === 'file_doc') {
            typeBoost = 0.12; // Medium priority for code docs
          } else if (['conversation', 'llm_conversation'].includes(chunkType)) {
            typeBoost = 0.08; // Lower but positive for conversations
          } else if (['prompt_engineering', 'bug_report'].includes(chunkType)) {
            typeBoost = -0.05; // Small penalty for meta content
          }
          
          // Recency boost (more recent = higher score)
          const chunkTimestamp = chunk.timestamp || chunk.metadata?.timestamp || 0;
          if (chunkTimestamp > 0) {
            const ageInDays = (Date.now() - chunkTimestamp) / (1000 * 60 * 60 * 24);
            if (ageInDays < 7) {
              recencyBoost = 0.1; // Recent content boost
            } else if (ageInDays < 30) {
              recencyBoost = 0.05; // Moderate recency boost
            }
          }
          
          // Authority boost (marked as important/high-priority)
          const importance = chunk.metadata?.importance || '';
          if (importance === 'high' || importance === 'critical') {
            authorityBoost = 0.15;
          } else if (importance === 'medium') {
            authorityBoost = 0.08;
          }
          
          const finalSalience = salience + typeBoost + recencyBoost + authorityBoost;
          
          return {
            content,
            salience: Math.max(0.1, Math.min(1.0, finalSalience)), // Clamp between 0.1-1.0
            source: chunk.type || chunk.chunk_type || 'chunk',
            type: 'targeted_semantic',
            id,
            metadata: {
              originalSalience: salience,
              typeBoost,
              recencyBoost,
              authorityBoost,
              type: chunkType,
              importance: chunk.metadata?.importance,
              timestamp: chunkTimestamp
            }
          };
        }));
        
        // Sort by salience (highest first)
        const allSortedMemories = memoriesWithSalience.sort((a, b) => b.salience - a.salience);
        
        // TYPE DIVERSIFICATION: Ensure good mix of different content types
        const diversifiedMemories = this.diversifyMemoryTypes(allSortedMemories, limit);
        
        console.log(`🎯 [EmergentCSE] Diversified selection:`, {
          total: diversifiedMemories.length,
          types: diversifiedMemories.map(m => m.metadata?.type).join(', ')
        });
        
        const sortedMemories = diversifiedMemories;
        
        console.log(`🎯 [EmergentCSE] Top salience scores: ${sortedMemories.slice(0, 3).map(m => m.salience.toFixed(3)).join(', ')}`);
        
        // Create retrieval result in expected format
        const retrievalResult = {
          memories: sortedMemories,
          metadata: {
            query,
            totalDuration: 50, // Mock duration
            method: 'enhanced_hybrid_search'
          }
        };
        console.log('🔍 [EmergentCSE] retrieveTargetedContext completed successfully');
        
        console.log(`🎯 [EmergentCSE] Targeted retrieval completed:`, {
          memoriesFound: retrievalResult.memories.length,
          avgSalience: retrievalResult.memories.reduce((sum, m) => sum + m.salience, 0) / retrievalResult.memories.length,
          duration: retrievalResult.metadata.totalDuration
        });
        
        // DEBUG: Show top-25 ranked chunks with scores
        if (process.env.LEO_DEBUG === 'true') {
          console.log('\n📊 [EmergentCSE] Top-25 Ranked Chunks:');
          retrievalResult.memories.slice(0, 25).forEach((memory, i) => {
            const preview = (memory.content || '').substring(0, 80).replace(/\n/g, ' ');
            const type = memory.metadata?.type || memory.type || 'unknown';
            console.log(`  ${i + 1}. Score: ${memory.salience.toFixed(3)} | Type: ${type} | ${preview}...`);
          });
        }
        
        return retrievalResult.memories || [];
      } catch (error) {
        console.error('❌ [EmergentCSE] Error in file-based retrieval (DEV MODE):', error);
        console.error('📍 [RETRIEVAL_BACKEND] File fallback failed, returning empty results');
        return [];
      }
  }

  /**
   * Diversify memory selection to ensure good mix of content types
   * @param {Array} sortedMemories - Memories sorted by salience
   * @param {number} limit - Maximum number of memories to return
   * @returns {Array} Diversified selection of memories
   */
  diversifyMemoryTypes(sortedMemories, limit) {
    const typeCategories = {
      documentation: ['documentation', 'architecture', 'system_spec', 'api_doc'],
      facts: ['project_fact', 'component_description', 'decision_rationale', 'cse_goal', 'cse_value'],
      code: ['file_doc', 'code_chunk', 'function_doc'],
      conversations: ['conversation', 'llm_conversation'],
      identity: ['identity_anchor', 'cse_identity', 'personality_trait'],
      events: ['plasticity_event', 'learning_event', 'memory_formation'],
      other: []
    };
    
    const categorized = {
      documentation: [],
      facts: [],
      code: [],
      conversations: [],
      identity: [],
      events: [],
      other: []
    };
    
    // Categorize memories
    sortedMemories.forEach(memory => {
      const type = memory.type || memory.metadata?.type || '';
      let category = 'other';
      
      for (const [cat, types] of Object.entries(typeCategories)) {
        if (types.includes(type)) {
          category = cat;
          break;
        }
      }
      
      categorized[category].push(memory);
    });
    
    // Diversified selection strategy
    const selected = [];
    const targetDistribution = {
      facts: Math.ceil(limit * 0.3),         // 30% facts/goals/values
      identity: Math.ceil(limit * 0.25),     // 25% identity/anchors
      conversations: Math.ceil(limit * 0.2), // 20% conversations
      documentation: Math.ceil(limit * 0.15), // 15% docs/specs
      events: Math.ceil(limit * 0.1),        // 10% learning events
      code: Math.ceil(limit * 0.05),         // 5% code docs
      other: 0
    };
    
    // Fill from each category up to target distribution
    for (const [category, target] of Object.entries(targetDistribution)) {
      const available = categorized[category];
      const toTake = Math.min(target, available.length, limit - selected.length);
      selected.push(...available.slice(0, toTake));
      
      if (selected.length >= limit) break;
    }
    
    // Fill remaining slots with highest-scoring memories
    if (selected.length < limit) {
      const remaining = sortedMemories.filter(m => !selected.includes(m));
      const needed = limit - selected.length;
      selected.push(...remaining.slice(0, needed));
    }
    
    // Re-sort by salience to maintain quality order
    return selected.sort((a, b) => b.salience - a.salience).slice(0, limit);
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   * @param {Array} embedding1 - First embedding vector
   * @param {Array} embedding2 - Second embedding vector
   * @returns {number} Similarity score (0-1)
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0.5; // Default similarity
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0.5 : dotProduct / magnitude;
  }

  /**
   * Calculate text-based relevance score as fallback
   * @param {string} queryTerms - Extracted query terms
   * @param {string} content - Memory content
   * @returns {number} Relevance score (0-1)
   */
  calculateTextRelevance(queryTerms, content) {
    if (!queryTerms || !content) return 0.1;
    
    const query = queryTerms.toLowerCase();
    const text = content.toLowerCase();
    
    // Simple relevance: count term matches and position
    let score = 0;
    const terms = query.split(/\s+/);
    
    for (const term of terms) {
      if (text.includes(term)) {
        // Higher score for exact matches
        score += 0.3;
        
        // Bonus for early occurrence
        const position = text.indexOf(term);
        const positionBonus = Math.max(0, 0.2 - (position / text.length) * 0.2);
        score += positionBonus;
      }
    }
    
    return Math.min(1.0, score);
  }

  /**
   * Check if a query represents general knowledge (non-project specific)
   * @param {string} query - User query
   * @returns {Promise<boolean>} True if general knowledge query
   */
  async isGeneralKnowledgeQuery(query) {
    try {
      return await this.emergentCoordinator.discoverEmergentCapabilities(
        this.memoryGraph,
        query
      );
    } catch (error) {
      logger.error('Failed to check general knowledge query', { error: error.message });
      return false;
    }
  }

  /**
   * Discover emergent capabilities from memory
   * @param {string} query - Query context
   * @returns {Promise<Array>} Emergent capabilities
   */
  async discoverEmergentCapabilities(query) {
    try {
      return await this.emergentCoordinator.discoverEmergentCapabilities(
        this.memoryGraph,
        query
      );
    } catch (error) {
      logger.error('Failed to discover emergent capabilities', { error: error.message });
      return [];
    }
  }
  
  /**
   * Select emergent skill based on memory content
   * @param {string} query - Query context
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Selected emergent skill
   */
  async selectEmergentSkill(query, context = {}) {
    try {
      return await this.emergentCoordinator.selectEmergentSkill(
        this.memoryGraph,
        query,
        context
      );
    } catch (error) {
      logger.error('Failed to select emergent skill', { error: error.message });
      return null;
    }
  }
  
  /**
   * Register new capability in memory graph
   * @param {Object} capability - Capability to register
   * @returns {Promise<boolean>} Registration success
   */
  async registerCapability(capability) {
    try {
      return await this.emergentCoordinator.registerCapabilityInMemory(
        this.memoryGraph,
        capability
      );
    } catch (error) {
      logger.error('Failed to register capability', { error: error.message });
      return false;
    }
  }
  
  /**
   * Validate emergent context has no hardcoded content
   * @param {Object} context - Context to validate
   * @throws {Error} If hardcoded content found
   */
  validateEmergentContext(context) {
    // Check for hardcoded identity
    if (typeof context.identity === 'string' && 
        (context.identity === 'Leo' || context.identity === 'I am Leo')) {
      throw new Error('Hardcoded identity detected in emergent context');
    }
    
    // Check for hardcoded capabilities
    const hardcodedCapabilityNames = [
      'llm_conversation',
      'memory_search', 
      'identity_reinforcement',
      'introspection',
      'code_generation'
    ];
    
    const hasHardcodedCapabilities = context.capabilities?.some(cap => 
      hardcodedCapabilityNames.includes(cap.name) && !cap.emergent
    );
    
    if (hasHardcodedCapabilities) {
      throw new Error('Hardcoded capabilities detected in emergent context');
    }
    
    // Validate emergent-only flags
    if (context.metadata) {
      if (!context.metadata.emergentOnly) {
        logger.warn('Context missing emergentOnly flag');
      }
      
      if (!context.metadata.hardcodedRemoved) {
        logger.warn('Context missing hardcodedRemoved flag');
      }
    }
  }
  
  /**
   * Get hybrid context (legacy compatibility method)
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Hybrid context
   */
  async getHybridContext(params) {
    logger.debug('Legacy getHybridContext called, redirecting to emergent context');
    return await this.getEmergentContext(params);
  }
  
  /**
   * Search memory with emergent ranking
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchMemoryEmergent(query, options = {}) {
    try {
      const {
        maxResults = 10,
        salienceThreshold = 0.1,
        includeMetadata = true,
        emergentOnly = true
      } = options;
      
      // Search memory graph
      const results = await this.memoryGraph.search(query, {
        maxResults: maxResults * 2, // Get more for ranking
        salienceThreshold,
        includeMetadata
      });
      
      // Rank by salience
      const ranked = rankMemories(results, { query });
      
      // Filter and enhance with emergent data
      const emergentResults = ranked.slice(0, maxResults).map(result => ({
        ...result.memory,
        salience: result.salience,
        emergent: true,
        source: 'memory_graph',
        rankedAt: Date.now()
      }));
      
      logger.debug('Emergent memory search completed', {
        query: query.substring(0, 50),
        totalFound: results.length,
        ranked: ranked.length,
        returned: emergentResults.length
      });
      
      return emergentResults;
      
    } catch (error) {
      logger.error('Emergent memory search failed', { error: error.message });
      return [];
    }
  }
  
  /**
   * Get emergent statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      emergentCoordinator: this.emergentCoordinator.getStatistics(),
      memoryGraphConnected: !!this.memoryGraph,
      flowMonitorConnected: !!this.flowMonitor,
      interactionMemoryConnected: !!this.interactionMemory,
      hardcodedIdentity: this.hardcodedIdentity,
      hardcodedCapabilities: this.hardcodedCapabilities,
      emergentOnly: true,
      validationPassed: this.validateConfiguration()
    };
  }
  
  /**
   * Validate configuration for emergent behavior
   * @returns {boolean} Configuration valid
   */
  validateConfiguration() {
    try {
      // Ensure no hardcoded identity
      if (this.hardcodedIdentity !== null) {
        logger.error('Hardcoded identity detected in EmergentCSE');
        return false;
      }
      
      // Ensure no hardcoded capabilities
      if (this.hardcodedCapabilities !== null) {
        logger.error('Hardcoded capabilities detected in EmergentCSE');
        return false;
      }
      
      // Validate emergent coordinator
      const coordinatorValidation = this.emergentCoordinator.validateConfiguration();
      if (!coordinatorValidation.valid) {
        logger.error('Emergent coordinator validation failed', {
          issues: coordinatorValidation.issues
        });
        return false;
      }
      
      return true;
      
    } catch (error) {
      logger.error('Configuration validation failed', { error: error.message });
      return false;
    }
  }
  
  /**
   * Clear all caches and reset emergent state
   */
  clearCaches() {
    this.emergentCoordinator.clearCaches();
    logger.info('EmergentCSE caches cleared');
  }

  /**
   * Legacy compatibility method for searchMemories
   * Maps to getEmergentContext for backward compatibility
   */
  async searchMemories(params) {
    return await this.getEmergentContext(params);
  }
}

module.exports = { EmergentCSE };
