/**
 * Optimized Memory Retrieval Pipeline
 * 
 * Implements the efficient memory retrieval strategy:
 * 1. Retrieve top N (25-50) memories by similarity & salience
 * 2. Semantic expansion to find related memories (not graph traversal yet)
 * 3. Trim to "critical core" (5-7 for LLM, but Orchestrator sees more)
 * 4. Single LLM call with optimized context
 * 
 * This prevents multiple LLM calls and hallucination issues.
 */

const crypto = require('crypto');
const { createComponentLogger } = require('../../../lib/utils/logger');
const logger = createComponentLogger('optimized-memory-retrieval');
const { CURRENT_PROVENANCE_VERSION, SOURCE_KINDS } = require('./provenance');

// Dashboard logging flag (set LEO_RETRIEVAL_DASHBOARD=true to enable detailed console output)
const DASHBOARD_ENABLED = process.env.LEO_RETRIEVAL_DASHBOARD === 'true';

// --- Phase 3: Query intent classification (pilot-safe, deterministic) ---
function classifyQueryIntent(query = '') {
  const q = String(query || '').trim().toLowerCase();

  // Session-scoped recall patterns (default)
  const sessionRecallPatterns = [
    /\bwhat did we (discuss|talk about|cover)\b/i,
    /\b(last time|previously|earlier)\b.*\b(we|you)\b.*\b(said|discussed|talked)\b/i,
    /\bremind me\b.*\b(what|how)\b.*\b(you|we)\b.*\b(said|decided|agreed)\b/i,
    /\bwhat did (we|you) decide\b/i,
    /\bwhat were (our|the) (decisions|constraints|agreements)\b/i,
    /\bwhere did we leave off\b/i,
    /\bin our (last|previous) conversation\b/i,
    /\byou told me\b/i
  ];

  // PHASE 3.5: Cross-session (global) recall patterns - explicit only
  const globalRecallPatterns = [
    /\bacross all (past |previous )?(sessions|conversations)\b/i,
    /\bin (all|any) (of )?(our |my )?(past |previous )?(sessions|conversations)\b/i,
    /\bthroughout our (entire )?(conversation history|history)\b/i,
    /\bover all (our )?(sessions|conversations)\b/i,
    /\bhave we ever (discussed|talked about|covered)\b/i,
    /\bin any of our (past |previous )?(discussions|conversations)\b/i
  ];

  const isGlobalRecall = globalRecallPatterns.some(p => p.test(q));
  const isSessionRecall = sessionRecallPatterns.some(p => p.test(q));
  const isConversationRecall = isGlobalRecall || isSessionRecall;

  return {
    intent: isConversationRecall ? 'conversation_recall' : 'knowledge_query',
    scope: isGlobalRecall ? 'global' : 'session', // PHASE 3.5: Explicit scope
    confidence: isConversationRecall ? 0.85 : 0.6
  };
}

function isConversationMemory(m) {
  const md = m?.metadata || {};
  const sourceKind = md.source_kind || m?.source_kind;
  const chunkType = md.chunk_type || m?.chunk_type || m?.type;
  return sourceKind === 'conversation' || chunkType === 'conversation_turn' || chunkType === 'conversation_event';
}

function getConversationTs(m) {
  return m?.metadata?.conversation_timestamp ?? m?.metadata?.timestamp ?? m?.timestamp ?? 0;
}

class OptimizedMemoryRetrieval {
  constructor({ memoryGraph, emergentCSE, tseInstance }) {
    this.memoryGraph = memoryGraph;
    this.emergentCSE = emergentCSE;
    this.tseInstance = tseInstance;
    
    // Configuration for the retrieval pipeline
    this.config = {
      // Stage 1: Initial retrieval - WIDENED NET
      initialRetrievalCount: 500,  // Retrieve 500 candidates (was 40)
      similarityThreshold: 0.01,   // Very low threshold to cast wide net (was 0.15)
      
      // Stage 2: Semantic expansion
      expansionDepth: 2,           // Follow edges 2 levels deep
      maxExpansionNodes: 50,       // Increased expansion nodes (was 20)
      
      // Stage 3: Final ranking
      finalCoreCount: 12,          // Increased core for LLM (was 6)
      orchestratorViewCount: 50,   // Orchestrator can see more (was 25)
      
      // Context limits - STRICT CAPS
      maxContextLength: 6000,      // Strict total context limit (was 8000)
      maxMemoryLength: 800         // Strict individual memory limit (was 1200)
    };
  }

  /**
   * Execute the optimized memory retrieval pipeline
   * @param {string} query - User query
   * @param {Object} options - Override config options
   * @returns {Object} - { coreMemories, orchestratorMemories, metadata }
   */
  async retrieveOptimized(query, options = {}) {
    const config = { ...this.config, ...options };
    const startTime = Date.now();
    
    // PHASE 3 STEP 2: Classify query intent
    const intentInfo = classifyQueryIntent(query);
    const retrievalIntent = options?.intent || options?.retrievalIntent || intentInfo.intent;
    const recallScope = options?.scope || intentInfo.scope || 'session'; // PHASE 3.5: Explicit scope
    
    logger.info(`[OptimizedRetrieval] Starting pipeline for query: "${query.substring(0, 60)}..."`);
    if (DASHBOARD_ENABLED) {
      console.log(`[OptimizedRetrieval] Intent=${retrievalIntent} confidence=${intentInfo.confidence}`);
      console.log(`[OptimizedRetrieval] Scope=${recallScope}`);
      console.log(`[OptimizedRetrieval] SessionId=${options?.sessionId}`);
    }
    
    try {
      // === PHASE 3: CONVERSATION RECALL DIRECT RETRIEVAL ===
      if (retrievalIntent === 'conversation_recall') {
        console.log(`[OptimizedRetrieval] ✅ Using direct conversation recall path (scope=${recallScope})`);
        logger.info(`[OptimizedRetrieval] Using direct conversation recall path (scope=${recallScope})`);
        const stage1Start = Date.now();
        
        // Get all chunks (includes conversation turns in cache)
        const allChunks = await this.memoryGraph.getAllChunks();
        
        // PHASE 3.5: Filter by scope (session vs global)
        let conversationTurns = allChunks.filter(isConversationMemory);
        
        if (recallScope === 'session' && options?.sessionId) {
          // Session-scoped: only current session
          const sid = String(options.sessionId);
          conversationTurns = conversationTurns.filter(m => (m?.metadata?.session_id || m?.sessionId) === sid);
        }
        // Global scope: all sessions (no additional filtering)
        
        conversationTurns = conversationTurns.map(m => ({ ...m, salience: 0.9 })); // High salience for conversation recall
        
        // PHASE 3.5: Diagnostic surface
        const uniqueSessions = new Set(conversationTurns.map(m => m?.metadata?.session_id || m?.sessionId)).size;
        const timestamps = conversationTurns.map(getConversationTs).filter(t => t > 0);
        const timelineSpan = timestamps.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
        const timelineSpanMinutes = Math.round(timelineSpan / 60000);
        
        if (DASHBOARD_ENABLED) {
          console.log(`[OptimizedRetrieval] 📊 RECALL DIAGNOSTIC:`);
          console.log(`  Recall Mode: conversation_recall`);
          console.log(`  Scope: ${recallScope}`);
          console.log(`  Candidate Turns: ${conversationTurns.length}`);
          console.log(`  Sessions Represented: ${uniqueSessions}`);
          console.log(`  Timeline Span: ${timelineSpanMinutes} minutes`);
        }
        
        const stage1Duration = Date.now() - stage1Start;
        
        if (conversationTurns.length > 0) {
          // Return conversation turns directly
          return {
            coreMemories: conversationTurns.slice(0, config.finalCoreCount),
            orchestratorMemories: conversationTurns,
            metadata: {
              stage1Count: conversationTurns.length,
              stage2Count: conversationTurns.length,
              stage3Count: conversationTurns.length,
              totalDuration: stage1Duration,
              pipeline: 'conversation_recall_direct',
              intent: retrievalIntent,
              // PHASE 3.5: Diagnostic surface
              scope: recallScope,
              sessionsRepresented: uniqueSessions,
              timelineSpanMinutes: timelineSpanMinutes
            }
          };
        }
        // Fall through to normal retrieval if no conversation turns found
      }
      
      // === STAGE 1: INITIAL SIMILARITY & SALIENCE RETRIEVAL ===
      logger.info('[OptimizedRetrieval] Stage 1: Initial retrieval');
      const stage1Start = Date.now();
      
      let initialMemories = await this.emergentCSE.getSalientMemoriesRanked(
        query, 
        config.initialRetrievalCount,
        {
          similarityThreshold: config.similarityThreshold,
          maxDepth: 3,
          topK: config.initialRetrievalCount * 2
        }
      );
      
      // PHASE 3 STEP 3: Route candidate set for conversation recall (fallback)
      const beforeCount = initialMemories.length;
      
      if (retrievalIntent === 'conversation_recall') {
        initialMemories = initialMemories.filter(isConversationMemory);
        
        if (options?.sessionId) {
          const sid = String(options.sessionId);
          initialMemories = initialMemories.filter(m => (m?.metadata?.session_id || m?.sessionId) === sid);
        }
      }
      
      if (DASHBOARD_ENABLED) {
        console.log(`[OptimizedRetrieval] Intent=${retrievalIntent} candidates=${beforeCount} -> ${initialMemories.length}`);
      }
      
      const stage1Duration = Date.now() - stage1Start;
      
      // 📊 LOG STAGE 1 METRICS
      const stage1Metrics = this.calculateRetrievalMetrics(initialMemories, 'Stage 1');
      logger.info(`[OptimizedRetrieval] Stage 1 complete: ${initialMemories.length} memories in ${stage1Duration}ms`);
      this.logRetrievalMetrics('STAGE 1', stage1Metrics, initialMemories.length);
      
      if (initialMemories.length === 0) {
        logger.warn('[OptimizedRetrieval] No memories retrieved in Stage 1');
        return {
          coreMemories: [],
          orchestratorMemories: [],
          metadata: {
            stage1Count: 0,
            stage2Count: 0,
            stage3Count: 0,
            totalDuration: Date.now() - startTime,
            pipeline: 'optimized'
          }
        };
      }
      
      // === STAGE 2: SEMANTIC EXPANSION (not graph traversal) ===
      logger.info('[OptimizedRetrieval] Stage 2: Semantic expansion');
      const stage2Start = Date.now();
      
      const expandedMemories = await this.expandMemoryGraph(
        initialMemories, 
        query,
        config
      );
      
      const stage2Duration = Date.now() - stage2Start;
      
      // 📊 LOG STAGE 2 METRICS
      const stage2Metrics = this.calculateRetrievalMetrics(expandedMemories, 'Stage 2');
      logger.info(`[OptimizedRetrieval] Stage 2 complete: ${expandedMemories.length} memories in ${stage2Duration}ms`);
      this.logRetrievalMetrics('STAGE 2 (After Semantic Expansion)', stage2Metrics, expandedMemories.length);
      
      // === STAGE 3: FINAL RANKING & CORE SELECTION ===
      logger.info('[OptimizedRetrieval] Stage 3: Final ranking');
      const stage3Start = Date.now();
      
      const { coreMemories, orchestratorMemories } = await this.selectCoreMemories(
        expandedMemories,
        query,
        config
      );
      
      const stage3Duration = Date.now() - stage3Start;
      
      // 📊 LOG STAGE 3 METRICS (FINAL CORE)
      const stage3Metrics = this.calculateRetrievalMetrics(coreMemories, 'Stage 3 Core');
      logger.info(`[OptimizedRetrieval] Stage 3 complete: ${coreMemories.length} core, ${orchestratorMemories.length} orchestrator in ${stage3Duration}ms`);
      this.logRetrievalMetrics('STAGE 3 (Final Core)', stage3Metrics, coreMemories.length);
      
      const totalDuration = Date.now() - startTime;
      
      // 📊 FINAL SUMMARY METRICS
      const finalMetrics = this.calculateRetrievalMetrics(coreMemories, 'Final');
      const coreAvgSalience = coreMemories.length > 0 
        ? (coreMemories.reduce((sum, m) => sum + (m.salience || 0), 0) / coreMemories.length).toFixed(3)
        : 0;
      
      logger.info(`[OptimizedRetrieval] Pipeline complete in ${totalDuration}ms`);
      logger.info(`[OptimizedRetrieval] Core memories: ${coreMemories.length}, avg salience: ${coreAvgSalience}`);
      
      // 📊 COMPREHENSIVE FINAL REPORT
      this.logFinalRetrievalReport({
        query: query.substring(0, 100),
        stage1Count: initialMemories.length,
        stage2Count: expandedMemories.length,
        stage3Count: coreMemories.length,
        totalDuration,
        stage1Duration,
        stage2Duration,
        stage3Duration,
        finalMetrics
      });
      
      return {
        coreMemories,
        orchestratorMemories,
        metadata: {
          stage1Count: initialMemories.length,
          stage2Count: expandedMemories.length,
          stage3Count: coreMemories.length,
          totalDuration,
          stage1Duration,
          stage2Duration,
          stage3Duration,
          avgCoreSalience: parseFloat(coreAvgSalience),
          pipeline: 'optimized'
        }
      };
      
    } catch (error) {
      logger.error('[OptimizedRetrieval] Pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Stage 2: Semantic expansion by finding related memories
   * 
   * NOTE: This is currently "semantic scrape expansion" (query key terms),
   * NOT graph traversal. Future enhancement: follow Neo4j edges for true graph traversal.
   */
  async expandMemoryGraph(initialMemories, query, config) {
    // Currently implements semantic expansion by querying key terms from content
    // Future enhancement: use actual graph edges instead of semantic queries
    
    const expandedSet = new Map();
    
    // Add all initial memories
    initialMemories.forEach(memory => {
      expandedSet.set(memory.id || memory.content, memory);
    });
    
    // Find related memories through semantic similarity
    for (const memory of initialMemories.slice(0, 10)) { // Only expand top 10 to avoid explosion
      try {
        // Find memories similar to this memory's content
        const relatedQuery = this.extractKeyTerms(memory.content || memory.userInput || memory.fact || '');
        if (relatedQuery.length > 10) {
          const related = await this.emergentCSE.getSalientMemoriesRanked(
            relatedQuery,
            5, // Small number for expansion
            {
              similarityThreshold: 0.3, // Higher threshold for related memories
              maxDepth: 1
            }
          );
          
          // Add related memories if not already present
          related.forEach(relatedMemory => {
            const key = relatedMemory.id || relatedMemory.content;
            if (!expandedSet.has(key) && expandedSet.size < config.initialRetrievalCount + config.maxExpansionNodes) {
              expandedSet.set(key, relatedMemory);
            }
          });
        }
      } catch (error) {
        logger.warn(`[OptimizedRetrieval] Failed to expand memory: ${error.message}`);
      }
    }
    
    return Array.from(expandedSet.values());
  }

  /**
   * Stage 3: Select core memories for LLM and orchestrator view
   * WITH DIVERSITY QUOTAS to prevent source/type monopoly
   */
  async selectCoreMemories(expandedMemories, query, config) {
    if (DASHBOARD_ENABLED) {
      logger.info(`[OptimizedRetrieval] Stage 3: Selecting from ${expandedMemories.length} expanded memories`);
    }
    
    // PHASE 2: Get query hints for temporal weighting
    const { getQueryHints, temporalWeight } = require('./temporalWeighting');
    const queryHints = getQueryHints(query);
    const nowTs = Date.now();
    
    // Track timestamp fallback usage for sanity check
    let timestampFallbackCount = 0;
    
    // Compute salience for memories that don't have it
    // AND apply provenance versioning penalty
    // AND apply temporal weighting (Phase 2)
    const memoriesWithSalience = expandedMemories.map(memory => {
      let baseSalience;
      
      if (memory.salience && memory.salience > 0) {
        baseSalience = memory.salience;
      } else {
        // Compute salience from similarity/cosine score
        const similarity = memory.similarity || memory.cosine || 0;
        baseSalience = (similarity + 1) / 2; // Normalize to 0-1
      }
      
      // PROVENANCE VERSIONING ENFORCEMENT
      // Down-rank memories with missing or old provenance
      const provenanceVersion = memory.metadata?.provenance_version;
      const hasProvenance = !!provenanceVersion;
      
      let provenancePenalty = 1.0; // No penalty by default
      
      if (!hasProvenance) {
        // Missing provenance: 20% penalty
        provenancePenalty = 0.8;
        if (DASHBOARD_ENABLED) {
          logger.info(`[ProvenanceEnforcement] Memory ${memory.id} missing provenance → 20% penalty`);
        }
      } else if (provenanceVersion !== CURRENT_PROVENANCE_VERSION) {
        // Old provenance version: 10% penalty
        provenancePenalty = 0.9;
        if (DASHBOARD_ENABLED) {
          logger.info(`[ProvenanceEnforcement] Memory ${memory.id} has old provenance ${provenanceVersion} (current: ${CURRENT_PROVENANCE_VERSION}) → 10% penalty`);
        }
      }
      
      // PHASE 2: TEMPORAL WEIGHTING
      // Apply bounded exponential decay based on memory age
      const eventTs = memory.metadata?.timestamp || memory.metadata?.ingested_at || memory.timestamp;
      
      // SANITY CHECK: Track if we're using fallback timestamp
      if (!memory.metadata?.timestamp) {
        timestampFallbackCount++;
      }
      
      const temporalMultiplier = temporalWeight(eventTs, nowTs, queryHints);
      
      // SANITY CHECK: Verify bounds are enforced [0.65, 1.15]
      if (temporalMultiplier < 0.65 || temporalMultiplier > 1.15) {
        // Always log bounds violations (critical error)
        console.error(`[TemporalWeighting] BOUNDS VIOLATION: temporalMultiplier=${temporalMultiplier} for memory ${memory.id}`);
      }
      
      // Final score = baseSalience * provenancePenalty * temporalMultiplier
      const adjustedSalience = baseSalience * provenancePenalty * temporalMultiplier;
      
      return { 
        ...memory, 
        salience: adjustedSalience,
        _baselineSalience: baseSalience,
        _provenancePenalty: provenancePenalty,
        _temporalMultiplier: temporalMultiplier
      };
    });
    
    // Sort by salience (highest first), with timeline tie-break for conversation recall
    const sortedMemories = memoriesWithSalience
      .filter(memory => memory.salience && memory.salience > 0)
      .sort((a, b) => {
        const scoreA = a.salience || 0;
        const scoreB = b.salience || 0;
        const ds = scoreB - scoreA;
        if (ds !== 0) return ds;
        
        // PHASE 3 STEP 3: Timeline tie-break for conversation recall
        if (config.retrievalIntent === 'conversation_recall' || config.intent === 'conversation_recall') {
          return getConversationTs(b) - getConversationTs(a);
        }
        return 0;
      });
    
    if (DASHBOARD_ENABLED) {
      logger.info(`[OptimizedRetrieval] Stage 3: ${sortedMemories.length} memories with salience > 0`);
    }
    
    // DIVERSITY QUOTAS: Apply max-per-source and min-type-diversity constraints
    const diversityConfig = {
      maxPerSource: 2,        // Max 2 memories from same source_id
      minUniqueTypes: 3,      // Require at least 3 distinct type categories
      minUniqueSources: 5     // Require at least 5 distinct sources
    };
    
    const diversifiedMemories = this.applyDiversityQuotas(sortedMemories, config.finalCoreCount, diversityConfig);
    if (DASHBOARD_ENABLED) {
      logger.info(`[OptimizedRetrieval] Stage 3: Applied diversity quotas → ${diversifiedMemories.length} diverse memories`);
    }
    
    // PHASE 2: Log average temporal weight for diagnostics
    const { averageTemporalWeight } = require('./temporalWeighting');
    const avgTemporal = averageTemporalWeight(diversifiedMemories, nowTs, queryHints);
    const fallbackPercent = ((timestampFallbackCount / expandedMemories.length) * 100).toFixed(1);
    if (DASHBOARD_ENABLED) {
      logger.info(`[OptimizedRetrieval] Stage 3: Average temporal weight = ${avgTemporal.toFixed(3)} (query hints: temporal=${queryHints.isTemporalQuery}, recent=${queryHints.wantsRecent})`);
      logger.info(`[OptimizedRetrieval] Stage 3: Timestamp fallback usage = ${fallbackPercent}% (${timestampFallbackCount}/${expandedMemories.length} memories missing metadata.timestamp)`);
    }
    
    // Select core memories for LLM (highest quality, limited count)
    const coreMemories = diversifiedMemories
      .slice(0, config.finalCoreCount)
      .map(memory => this.formatMemoryForLLM(memory, config.maxMemoryLength));
    
    // Select orchestrator memories (more for planning, but still limited)
    const orchestratorMemories = diversifiedMemories
      .slice(0, config.orchestratorViewCount)
      .map(memory => this.formatMemoryForOrchestrator(memory));
    
    // Validate total context length
    const totalContextLength = coreMemories.reduce((sum, m) => sum + (m.formattedContent?.length || 0), 0);
    
    if (totalContextLength > config.maxContextLength) {
      logger.warn(`[OptimizedRetrieval] Context too long (${totalContextLength}), truncating...`);
      
      // Progressively remove memories until under limit
      while (coreMemories.length > 1 && this.calculateContextLength(coreMemories) > config.maxContextLength) {
        coreMemories.pop();
      }
    }
    
    return { coreMemories, orchestratorMemories };
  }

  /**
   * Format memory for LLM consumption (concise, focused)
   */
  formatMemoryForLLM(memory, maxLength = 1200) {
    let content = '';
    
    if (memory.fact) {
      content = `[FACT] ${memory.fact}`;
    } else if (memory.userInput && memory.llmResponse) {
      content = `[DIALOG] User: "${memory.userInput}" Leo: "${memory.llmResponse}"`;
    } else if (memory.summary) {
      content = `[SUMMARY] ${memory.summary}`;
    } else if (memory.content) {
      content = `[MEMORY] ${memory.content}`;
    } else {
      content = '[UNKNOWN]';
    }
    
    // Truncate if too long
    if (content.length > maxLength) {
      content = content.substring(0, maxLength - 3) + '...';
    }
    
    return {
      ...memory,
      formattedContent: content,
      source: 'optimized_retrieval'
    };
  }

  /**
   * Format memory for orchestrator view (more detail for planning)
   */
  formatMemoryForOrchestrator(memory) {
    return {
      ...memory,
      source: 'optimized_retrieval',
      retrievalMetadata: {
        salience: memory.salience,
        timestamp: memory.timestamp,
        type: memory.type
      }
    };
  }

  /**
   * Get stable memory key for deduplication
   * Prefers source_id, falls back to id, then content hash if both missing
   */
  getStableMemoryKey(memory) {
    // Best: use provenance source_id (canonical stable identifier)
    if (memory.metadata?.source_id) {
      return memory.metadata.source_id;
    }
    
    // Fallback: use memory.id if present
    if (memory.id) {
      return memory.id;
    }
    
    // Last resort: derive stable key from content + type + timestamp
    // This prevents multiple memories from collapsing to 'unknown'
    const contentSample = (memory.content || memory.formattedContent || '').substring(0, 100);
    const type = memory.type || memory.metadata?.chunk_type || 'unknown';
    const timestamp = memory.metadata?.timestamp || memory.timestamp || Date.now();
    const hashInput = `${contentSample}|${type}|${timestamp}`;
    
    return crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 16);
  }

  /**
   * Extract key terms from memory content for expansion queries
   */
  extractKeyTerms(content) {
    if (!content || typeof content !== 'string') return '';
    
    // Simple key term extraction (could be enhanced with NLP)
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['that', 'this', 'with', 'from', 'they', 'have', 'were', 'been', 'said'].includes(word));
    
    return words.slice(0, 5).join(' '); // Top 5 key terms
  }

  /**
   * Calculate total context length for validation
   */
  calculateContextLength(memories) {
    return memories.reduce((sum, memory) => {
      return sum + (memory.formattedContent?.length || 0);
    }, 0);
  }

  /**
   * Apply diversity quotas to prevent source/type monopoly
   * @param {Array} sortedMemories - Memories sorted by salience
   * @param {number} targetCount - Target number of memories to select
   * @param {Object} quotaConfig - Diversity quota configuration
   * @returns {Array} Diversified memory selection
   */
  applyDiversityQuotas(sortedMemories, targetCount, quotaConfig) {
    const { maxPerSource, minUniqueTypes, minUniqueSources } = quotaConfig;
    
    const selected = [];
    const sourceCount = new Map(); // source_id -> count
    const typeSet = new Set(); // unique types
    const sourceSet = new Set(); // unique sources
    
    // First pass: Greedy selection with quotas
    for (const memory of sortedMemories) {
      if (selected.length >= targetCount) break;
      
      const sourceId = memory.metadata?.source_id || 'unknown';
      const sourceKind = memory.metadata?.source_kind || 'unknown';
      const chunkType = memory.metadata?.chunk_type || memory.chunk_type || memory.type || 'unknown';
      const typeKey = `${sourceKind}:${chunkType}`;
      
      // Check source quota
      const currentSourceCount = sourceCount.get(sourceId) || 0;
      if (currentSourceCount >= maxPerSource) {
        continue; // Skip - this source is at quota
      }
      
      // Add to selection
      selected.push(memory);
      sourceCount.set(sourceId, currentSourceCount + 1);
      typeSet.add(typeKey);
      sourceSet.add(sourceId);
    }
    
    // Second pass: Fill remaining slots if we didn't hit target
    // (This happens when quotas are too strict)
    if (selected.length < targetCount) {
      const remaining = targetCount - selected.length;
      // Use stable source_id for deduplication (memory.id can be undefined)
      const selectedKeys = new Set(selected.map(m => this.getStableMemoryKey(m)));
      
      for (const memory of sortedMemories) {
        if (selected.length >= targetCount) break;
        
        const memoryKey = this.getStableMemoryKey(memory);
        if (selectedKeys.has(memoryKey)) continue; // Already selected
        
        selected.push(memory);
        selectedKeys.add(memoryKey);
      }
    }
    
    // Log diversity metrics
    if (DASHBOARD_ENABLED) {
      logger.info(`[DiversityQuotas] Selected ${selected.length} memories:`);
      logger.info(`   Unique Sources: ${sourceSet.size} (min: ${minUniqueSources})`);
      logger.info(`   Unique Types: ${typeSet.size} (min: ${minUniqueTypes})`);
      logger.info(`   Max per Source: ${Math.max(...Array.from(sourceCount.values()))} (limit: ${maxPerSource})`);
    }
    
    // Warn if diversity targets not met
    if (sourceSet.size < minUniqueSources) {
      console.warn(`[DiversityQuotas] ⚠️  Only ${sourceSet.size} unique sources (target: ${minUniqueSources})`);
    }
    if (typeSet.size < minUniqueTypes) {
      console.warn(`[DiversityQuotas] ⚠️  Only ${typeSet.size} unique types (target: ${minUniqueTypes})`);
    }
    
    // ENFORCEMENT PASS: If we're below minUniqueSources, swap to add new sources
    // IMPORTANT: Swap (don't append) to respect targetCount and maxPerSource limits
    if (sourceSet.size < minUniqueSources && selected.length > 0) {
      if (DASHBOARD_ENABLED) {
        logger.info(`[DiversityQuotas] Enforcement pass: swapping to add new sources (respecting limits)...`);
      }
      
      const selectedKeys = new Set(selected.map(m => this.getStableMemoryKey(m)));
      
      // Find candidates from new sources
      const newSourceCandidates = [];
      for (const memory of sortedMemories) {
        if (sourceSet.size >= minUniqueSources) break;
        
        const memoryKey = this.getStableMemoryKey(memory);
        if (selectedKeys.has(memoryKey)) continue; // Already selected
        
        const sourceId = memory.metadata?.source_id || 'unknown';
        if (sourceSet.has(sourceId)) continue; // Source already represented
        
        newSourceCandidates.push(memory);
      }
      
      // Swap strategy: Replace lowest-salience memories from overrepresented sources
      for (const candidate of newSourceCandidates) {
        if (sourceSet.size >= minUniqueSources) break;
        
        const candidateSourceId = candidate.metadata?.source_id || 'unknown';
        
        // Find overrepresented sources (those with > 1 memory if we have room to diversify)
        const overrepresentedSources = Array.from(sourceCount.entries())
          .filter(([source, count]) => count > 1)
          .sort((a, b) => b[1] - a[1]); // Sort by count descending
        
        if (overrepresentedSources.length === 0) {
          // No overrepresented sources to swap from
          // Only append if we have headroom under targetCount
          if (selected.length < targetCount) {
            selected.push(candidate);
            selectedKeys.add(this.getStableMemoryKey(candidate));
            sourceSet.add(candidateSourceId);
            sourceCount.set(candidateSourceId, 1);
            
            const sourceKind = candidate.metadata?.source_kind || 'unknown';
            const chunkType = candidate.metadata?.chunk_type || candidate.chunk_type || candidate.type || 'unknown';
            const typeKey = `${sourceKind}:${chunkType}`;
            typeSet.add(typeKey);
          }
          continue;
        }
        
        // Find lowest-salience memory from most overrepresented source
        const [overrepSource, overrepCount] = overrepresentedSources[0];
        const victimIndex = selected.findIndex(m => 
          (m.metadata?.source_id || 'unknown') === overrepSource
        );
        
        if (victimIndex === -1) continue; // Safety check
        
        // Find the lowest-salience memory from this overrepresented source
        let lowestSalienceIndex = -1;
        let lowestSalience = Infinity;
        for (let i = 0; i < selected.length; i++) {
          const mem = selected[i];
          if ((mem.metadata?.source_id || 'unknown') === overrepSource) {
            if ((mem.salience || 0) < lowestSalience) {
              lowestSalience = mem.salience || 0;
              lowestSalienceIndex = i;
            }
          }
        }
        
        if (lowestSalienceIndex === -1) continue; // Safety check
        
        // SWAP: Replace lowest-salience from overrepresented source with new-source candidate
        const victim = selected[lowestSalienceIndex];
        selected[lowestSalienceIndex] = candidate;
        
        // Update tracking
        selectedKeys.delete(this.getStableMemoryKey(victim));
        selectedKeys.add(this.getStableMemoryKey(candidate));
        
        sourceCount.set(overrepSource, overrepCount - 1);
        sourceCount.set(candidateSourceId, 1);
        sourceSet.add(candidateSourceId);
        
        const sourceKind = candidate.metadata?.source_kind || 'unknown';
        const chunkType = candidate.metadata?.chunk_type || candidate.chunk_type || candidate.type || 'unknown';
        const typeKey = `${sourceKind}:${chunkType}`;
        typeSet.add(typeKey);
        
        if (DASHBOARD_ENABLED) {
          logger.info(`[DiversityQuotas] Swapped: removed ${victim.id} (source: ${overrepSource}, salience: ${lowestSalience.toFixed(3)}) for ${candidate.id} (source: ${candidateSourceId}, salience: ${(candidate.salience || 0).toFixed(3)})`);
        }
      }
      
      if (DASHBOARD_ENABLED) {
        logger.info(`[DiversityQuotas] After enforcement: ${sourceSet.size} unique sources, ${selected.length} total memories`);
      }
    }
    
    return selected;
  }

  /**
   * Calculate comprehensive retrieval metrics
   * @param {Array} memories - Memories to analyze
   * @param {string} stage - Stage name for logging
   * @returns {Object} Metrics object
   */
  calculateRetrievalMetrics(memories, stage) {
    if (!memories || memories.length === 0) {
      return {
        count: 0,
        sourceDiversity: 0,
        temporalSpread: 0,
        avgSalience: 0,
        uniqueSources: 0,
        uniqueTypes: 0,
        uniqueSourceTypePairs: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
        timeSpanDays: 0,
        missingTimestampPct: 100,
        missingSourcePct: 100,
        top5Sources: [],
        top5Types: [],
        top5SourceTypePairs: []
      };
    }

    // ENHANCED SOURCE DIVERSITY: Track source, type, and source+type pairs
    const sources = new Map(); // source -> count
    const types = new Map(); // type -> count
    const sourceTypePairs = new Map(); // "source|type" -> count
    
    let missingTimestampCount = 0;
    let missingSourceCount = 0;
    
    memories.forEach(m => {
      // Extract source using PROVENANCE SCHEMA (source_id is canonical)
      const source = m.metadata?.source_id || m.metadata?.repository || m.metadata?.repo || m.metadata?.path || m.source || 'unknown';
      sources.set(source, (sources.get(source) || 0) + 1);
      if (!m.metadata?.source_id) missingSourceCount++;
      
      // Extract type using PROVENANCE SCHEMA (source_kind + chunk_type)
      const sourceKind = m.metadata?.source_kind || 'unknown';
      const chunkType = m.metadata?.chunk_type || m.chunk_type || m.type || 'unknown';
      const type = `${sourceKind}:${chunkType}`;
      types.set(type, (types.get(type) || 0) + 1);
      
      // Track source+type pair
      const pairKey = `${source}|${type}`;
      sourceTypePairs.set(pairKey, (sourceTypePairs.get(pairKey) || 0) + 1);
      
      // Check for timestamp using PROVENANCE SCHEMA (event timestamp, not ingested_at)
      const timestamp = m.metadata?.timestamp;
      if (!timestamp || typeof timestamp !== 'number') {
        missingTimestampCount++;
      }
    });
    
    const uniqueSources = sources.size;
    const uniqueTypes = types.size;
    const uniqueSourceTypePairs = sourceTypePairs.size;
    const sourceDiversity = uniqueSources / Math.max(memories.length, 1);
    
    // Calculate missing metadata percentages
    const missingTimestampPct = (missingTimestampCount / memories.length) * 100;
    const missingSourcePct = (missingSourceCount / memories.length) * 100;
    
    // Get top 5 sources by count
    const top5Sources = Array.from(sources.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count, pct: ((count / memories.length) * 100).toFixed(1) }));
    
    // Get top 5 types by count
    const top5Types = Array.from(types.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count, pct: ((count / memories.length) * 100).toFixed(1) }));
    
    // Get top 5 source+type pairs by count
    const top5SourceTypePairs = Array.from(sourceTypePairs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pair, count]) => {
        const [source, type] = pair.split('|');
        return { source, type, count, pct: ((count / memories.length) * 100).toFixed(1) };
      });

    // Temporal spread: analyze timestamps
    // PROVENANCE-FIRST: prefer metadata.timestamp (event time) over m.timestamp (ambiguous)
    const timestamps = memories
      .map(m => m.metadata?.timestamp ?? m.timestamp)
      .filter(t => t && typeof t === 'number');
    
    let oldestTimestamp = null;
    let newestTimestamp = null;
    let timeSpanDays = 0;
    const timestampCoverage = timestamps.length / memories.length;
    
    if (timestamps.length > 0) {
      oldestTimestamp = Math.min(...timestamps);
      newestTimestamp = Math.max(...timestamps);
      timeSpanDays = (newestTimestamp - oldestTimestamp) / (1000 * 60 * 60 * 24);
    }

    // Average salience
    const avgSalience = memories.length > 0
      ? memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length
      : 0;

    return {
      count: memories.length,
      sourceDiversity: sourceDiversity.toFixed(3),
      temporalSpread: timeSpanDays.toFixed(1),
      avgSalience: avgSalience.toFixed(3),
      uniqueSources,
      uniqueTypes,
      uniqueSourceTypePairs,
      oldestTimestamp,
      newestTimestamp,
      timeSpanDays: timeSpanDays.toFixed(1),
      timestampCoverage: timestampCoverage.toFixed(3),
      missingTimestampPct: missingTimestampPct.toFixed(1),
      missingSourcePct: missingSourcePct.toFixed(1),
      top5Sources,
      top5Types,
      top5SourceTypePairs
    };
  }

  /**
   * Log retrieval metrics in a readable format - RETRIEVAL HEALTH DASHBOARD
   */
  logRetrievalMetrics(stageName, metrics, count) {
    console.log('\n' + '='.repeat(80));
    console.log(`📊 ${stageName} RETRIEVAL HEALTH DASHBOARD`);
    console.log('='.repeat(80));
    console.log(`📦 Candidates Retrieved: ${count}`);
    console.log(`💎 Average Salience: ${metrics.avgSalience}`);
    console.log('─'.repeat(80));
    
    // SOURCE DIVERSITY
    console.log('🎯 SOURCE DIVERSITY:');
    console.log(`   Unique Sources: ${metrics.uniqueSources} (${(metrics.sourceDiversity * 100).toFixed(1)}%)`);
    console.log(`   Unique Types: ${metrics.uniqueTypes}`);
    console.log(`   Unique Source+Type Pairs: ${metrics.uniqueSourceTypePairs}`);
    
    // TOP 5 SOURCES
    if (metrics.top5Sources.length > 0) {
      console.log('   Top 5 Sources:');
      metrics.top5Sources.forEach((s, i) => {
        const sourceDisplay = s.source.length > 50 ? s.source.substring(0, 47) + '...' : s.source;
        console.log(`      ${i + 1}. ${sourceDisplay} (${s.count} memories, ${s.pct}%)`);
      });
    }
    
    // TOP 5 TYPES
    if (metrics.top5Types.length > 0) {
      console.log('   Top 5 Types:');
      metrics.top5Types.forEach((t, i) => {
        console.log(`      ${i + 1}. ${t.type} (${t.count} memories, ${t.pct}%)`);
      });
    }
    
    console.log('─'.repeat(80));
    
    // TEMPORAL COVERAGE
    console.log('⏰ TEMPORAL COVERAGE:');
    console.log(`   Temporal Spread: ${metrics.timeSpanDays} days`);
    console.log(`   Timestamp Coverage: ${(metrics.timestampCoverage * 100).toFixed(1)}%`);
    console.log(`   Missing Timestamps: ${metrics.missingTimestampPct}%`);
    if (metrics.oldestTimestamp && metrics.newestTimestamp) {
      console.log(`   └─ Oldest: ${new Date(metrics.oldestTimestamp).toISOString().split('T')[0]}`);
      console.log(`   └─ Newest: ${new Date(metrics.newestTimestamp).toISOString().split('T')[0]}`);
    }
    
    console.log('─'.repeat(80));
    
    // METADATA QUALITY
    console.log('📋 METADATA QUALITY:');
    console.log(`   Missing Source/Path: ${metrics.missingSourcePct}%`);
    console.log(`   Missing Timestamps: ${metrics.missingTimestampPct}%`);
    
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Log comprehensive final retrieval report
   */
  logFinalRetrievalReport(report) {
    console.log('\n' + '█'.repeat(80));
    console.log('🎯 OPTIMIZED RETRIEVAL PIPELINE - FINAL REPORT');
    console.log('█'.repeat(80));
    console.log(`📝 Query: "${report.query}"`);
    console.log('─'.repeat(80));
    console.log('⏱️  PIPELINE TIMING:');
    console.log(`   Stage 1 (Initial Retrieval): ${report.stage1Duration}ms → ${report.stage1Count} candidates`);
    console.log(`   Stage 2 (Semantic Expansion): ${report.stage2Duration}ms → ${report.stage2Count} candidates`);
    console.log(`   Stage 3 (Final Ranking):     ${report.stage3Duration}ms → ${report.stage3Count} core`);
    console.log(`   Total Pipeline Duration:     ${report.totalDuration}ms`);
    console.log('─'.repeat(80));
    console.log('📊 FINAL CORE METRICS:');
    console.log(`   Memories Selected: ${report.finalMetrics.count}`);
    console.log(`   Source Diversity:  ${(report.finalMetrics.sourceDiversity * 100).toFixed(1)}% (${report.finalMetrics.uniqueSources} unique sources)`);
    console.log(`   Temporal Spread:   ${report.finalMetrics.timeSpanDays} days`);
    console.log(`   Average Salience:  ${report.finalMetrics.avgSalience}`);
    console.log('─'.repeat(80));
    console.log('🔍 RETRIEVAL FUNNEL:');
    console.log(`   Stage 1 → Stage 2: ${report.stage1Count} → ${report.stage2Count} (${((report.stage2Count/report.stage1Count)*100).toFixed(1)}% expansion)`);
    console.log(`   Stage 2 → Stage 3: ${report.stage2Count} → ${report.stage3Count} (${((report.stage3Count/report.stage2Count)*100).toFixed(1)}% selection)`);
    console.log(`   Overall Funnel:    ${report.stage1Count} → ${report.stage3Count} (${((report.stage3Count/report.stage1Count)*100).toFixed(1)}% final)`);
    console.log('█'.repeat(80) + '\n');
  }
}

module.exports = OptimizedMemoryRetrieval;
