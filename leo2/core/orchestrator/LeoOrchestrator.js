/**
 * Leo Orchestrator - Central Cognitive Coordination Layer
 * 
 * This is the heart of Leo's Cognitive Operating System. Every interaction,
 * every thought, every response flows through this orchestrator. It makes
 * the Memory Graph, CSE, and Agent Loop inseparable and ensures that Leo
 * operates as a true cognitive partner, not a tool.
 * 
 * Core Principles:
 * 1. All cognition flows through the agent loop (Observe → Reflect → Act → Update)
 * 2. All context injection flows through CSE
 * 3. All knowledge comes from the memory graph
 * 4. No static prompts - everything is memory-driven
 * 5. Agent state is persistent and introspectable
 * 
 * @created 2025-08-01
 * @phase COS Implementation
 */

const { createComponentLogger } = require('../../../lib/utils/logger');
const { validateEntityCitations, sanitizeSurface } = require('../agent/validator');
const eventBus = require('../../../lib/utils/event-bus');
const OrchestratorAgentLoop = require('../agent/orchestratorAgentLoop');
const { v4: uuidv4 } = require('uuid');
const { SESSION_ID_KEY } = require('../constants/session');
// const OrchestratorLogger = require('../logging/OrchestratorLogger'); // Temporarily disabled for demo
const EmergentCSE = require('../emergence/EmergentCSE');

// Component name for logging and events
const COMPONENT_NAME = 'leo-orchestrator';

// PHASE 3 STEP 2: Intent classification helper
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
  
  return {
    intent: (isGlobalRecall || isSessionRecall) ? 'conversation_recall' : 'knowledge_query',
    scope: isGlobalRecall ? 'global' : 'session'
  };
}

// ===== Fusion Coverage Policy (GK allowance + diversity penalty) =====
function _normNum(x, lo, hi) { return Math.max(0, Math.min(1, (x - lo) / (hi - lo))); }

function computeFusionCoverage(contextArray = []) {
  // contextArray items can be memory cards or DTOs with fields:
  // { id|content_id, content|text, score|salience, source|meta.source_uri }
  const cards = (Array.isArray(contextArray) ? contextArray : []).map(c => ({
    id: c.id || c.content_id || null,
    text: (c.content || c.text || '').toString(),
    score: typeof c.score === 'number' ? c.score : (typeof c.salience === 'number' ? c.salience : 0),
    source: c.source || c.meta?.source_uri || 'unknown'
  })).filter(c => c.text);

  if (!cards.length) return { coverage: 0, homogeneity: 1, gkAllowance: 3 };

  // Size: total chars of facts in pack (clip to a rough window)
  const totalChars = cards.reduce((s, c) => s + Math.min(c.text.length, 600), 0); // clamp long blobs
  const sizeScore = _normNum(totalChars, 600, 4000); // 0 at 600, 1 at 4000+

  // Diversity: count unique sources and basic topic spread (via simple hashing)
  const sources = new Map();
  const topics = new Map();
  for (const c of cards) {
    sources.set(c.source, (sources.get(c.source) || 0) + 1);
    const topKey = (c.text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}\b/g) || ['misc'])[0].toLowerCase();
    topics.set(topKey, (topics.get(topKey) || 0) + 1);
  }
  const uniqSources = sources.size;
  const uniqTopics  = topics.size;

  const diversityScore =
    0.6 * _normNum(uniqSources, 1, 6) +
    0.4 * _normNum(uniqTopics, 1, 6);

  // Homogeneity penalty: if one source dominates (>70%), penalize coverage
  const maxFromOneSource = Math.max(...[...sources.values()]);
  const homogeneity = maxFromOneSource / cards.length; // 1.0 = totally homogeneous
  const homoPenalty = homogeneity > 0.7 ? (homogeneity - 0.7) / 0.3 : 0; // 0..1

  // Final coverage: size * diversity with penalty
  let coverage = Math.max(0, (0.6 * sizeScore + 0.4 * diversityScore) * (1 - 0.6 * homoPenalty));

  // GK allowance policy
  let gkAllowance;
  if (coverage < 0.35)       gkAllowance = 3;  // thin facts → allow 3 GK stitches
  else if (coverage < 0.70)  gkAllowance = 1;  // moderate facts → 1 stitch
  else                       gkAllowance = 0;  // rich facts → memory only

  return { coverage, homogeneity, gkAllowance, uniqSources, uniqTopics, totalChars };
}

// ===== Hedge & Meta-Comment Cleanup =====
const HEDGE_PATTERNS = [
  /\bI don't have specific details\b/gi,
  /\bthe information I have is limited\b/gi,
  /\bI cannot provide\b/gi,
  /\bI would need to do additional research\b/gi,
  /\bbased on limited information\b/gi,
  /\bI apologize, but\b/gi,
  /\bUnfortunately,?\b/gi,
  /\bWithout more (detailed )?information\b/gi,
  /\bWithout more context\b/gi,
  /\bFurther research (would be|is) needed\b/gi,
  /\bI do not have enough (specific )?information\b/gi,
  /\bI don't have enough information\b/gi,
  /\bI'd need more specifics\b/gi,
  /\bPlease let me know if you have\b/gi,
  /\bthe references I found\b/gi
];

function deHedge(text = '') {
  let out = String(text || '');
  for (const rx of HEDGE_PATTERNS) {
    out = out.replace(rx, '');
  }
  // Remove common hedge paragraphs and rhetorical question lists
  out = out
    // drop lines that are just meta/hedge statements
    .split(/\n/)
    .filter(line => !/^(\s*To provide a more substantive answer|\s*To better understand|\s*Without more (detailed )?information|\s*Without more context|\s*I would need to do additional research|\s*I'd need more specifics|\s*Please let me know)/i.test(line))
    // drop numbered rhetorical questions like "1. Low Confidence [2]: ...?"
    .filter(line => !/^\s*\d+\.[^\n]*\?\s*$/i.test(line))
    // drop inline "confidence bracket" lines
    .filter(line => !/Low Confidence|Medium Confidence|High Confidence/i.test(line))
    // drop entire hedge paragraphs (multi-sentence disclaimers)
    .filter(line => {
      const lowerLine = line.toLowerCase();
      return !(lowerLine.includes('without more context') && lowerLine.includes('don\'t have enough'));
    })
    .join('\n');

  // Normalize whitespace
  out = out.replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim();
  return out;
}

// ===== End-of-Answer Enforcement =====
const FOOTER_REGEX_CONF = /(^|\n)CONFIDENCE:\s*(low|medium|high)\b/i;
const FOOTER_REGEX_NEXT = /(^|\n)NEXT_RETRIEVALS:\s*\(a\).*?\(b\).*/is;

function inferConfidenceFromCoverage(coverage, diversityMetrics = {}) {
  // Extract diversity metrics
  const uniqueSources = diversityMetrics.uniqueSources || 0;
  const timestampCoverage = diversityMetrics.timestampCoverage || 0;
  const isTemporalQuery = diversityMetrics.isTemporalQuery || false;
  
  // Base confidence from coverage
  let baseConfidence = 'low';
  if (coverage >= 0.70) baseConfidence = 'high';
  else if (coverage >= 0.35) baseConfidence = 'medium';
  
  // DIVERSITY-BASED GATING (Priority Fix #2)
  // If unique_sources < 3 → cap confidence at medium
  // If unique_sources < 2 → cap at low
  // If timestamp coverage < 0.3 and question is temporal → cap at low
  
  if (uniqueSources < 2) {
    console.log(`[CONFIDENCE] Capping at LOW: only ${uniqueSources} unique source(s)`);
    return 'low';
  }
  
  if (uniqueSources < 3 && baseConfidence === 'high') {
    console.log(`[CONFIDENCE] Capping at MEDIUM: only ${uniqueSources} unique sources (< 3)`);
    return 'medium';
  }
  
  if (isTemporalQuery && timestampCoverage < 0.3) {
    console.log(`[CONFIDENCE] Capping at LOW: temporal query with ${(timestampCoverage * 100).toFixed(0)}% timestamp coverage`);
    return 'low';
  }
  
  return baseConfidence;
}

// Very lightweight "next retrievals" guesser from context + user question
function proposeNextRetrievals(contextArray = [], userQuestion = '') {
  const srcs = [...new Set(contextArray.map(c => c.source || c.meta?.source_uri).filter(Boolean))];
  const srcHint = srcs.slice(0,2).map(s => s.split('/').slice(-2).join('/')).join(' | ') || 'additional project sources';
  const termHint = (userQuestion.match(/\b([A-Za-z][a-z]{3,})\b/g) || []).slice(0,2).join(', ') || 'key terms from the question';
  return {
    a: `Pull higher-granularity artifacts beyond tutorials (benchmarks, results, or papers) from ${srcHint}.`,
    b: `Target authoritative references for ${termHint} (papers, standards, or code with measured metrics).`
  };
}

function enforceAnswerFooter(text, { coverage, diversityMetrics }, contextArray, userQuestion) {
  let out = (text || '').trim();

  if (!FOOTER_REGEX_CONF.test(out) || !FOOTER_REGEX_NEXT.test(out)) {
    const conf = inferConfidenceFromCoverage(coverage, diversityMetrics);
    const recs = proposeNextRetrievals(contextArray, userQuestion);
    // Ensure the footer is present exactly once, appended
    out = out.replace(/\s+$/,'');
    if (!FOOTER_REGEX_CONF.test(out)) {
      out += `\n\nCONFIDENCE: ${conf}`;
    }
    if (!FOOTER_REGEX_NEXT.test(out)) {
      out += `\nNEXT_RETRIEVALS: (a) ${recs.a} (b) ${recs.b}`;
    }
  }
  return out;
}

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * LeoOrchestrator - Central cognitive coordination class
 * 
 * This class unifies all cognitive components and ensures that every
 * interaction follows the agent loop pattern with CSE-driven context
 * injection and memory-graph sourced knowledge.
 */
class LeoOrchestrator {
  /**
   * Prevent accidental serialization of orchestrator instances
   */
  toJSON() { 
    return '[LeoOrchestrator]'; 
  }
  /**
   * Constructor - Initialize the orchestrator with core cognitive components
   * @param {Object} components - Core cognitive components
   * @param {Object} components.memoryGraph - Memory graph instance
   * @param {Object} components.cse - Contextual Salience Engine instance
   * @param {Object} components.agentLoop - Agent loop instance
   * @param {Object} components.llmInterface - LLM interface instance
   * @param {Object} components.logger - Logger instance (optional)
   * @param {Object} components.capabilityRegistry - Capability registry (optional)
   * @param {Object} components.feedbackManager - Feedback manager (optional)
   * @param {Object} config - Configuration options
   */
  constructor({ 
    memoryGraph, 
    cse, 
    agentLoop, 
    llmInterface, 
    logger: providedLogger,
    capabilityRegistry,
    feedbackManager,
    semanticContextManager,
    // Awareness components
    unifiedAwarenessService,
    contextProcessor,
    flowMonitor,
    interactionMemorySystem,
    // Meta Agent Router
    metaAgentRouter,
    // Safety components
    backupManager,
    config = {}
  }) {
    // Core cognitive components - these are inseparable
    this.memoryGraph = memoryGraph;
    
    // Always use the injected CSE instance from orchestratorFactory
    this.cse = cse;
    if (this.cse && this.cse.instanceId) {
      console.log(`[LeoOrchestrator] Using injected CSE instanceId: ${this.cse.instanceId}`);
    }

    this.agentLoop = agentLoop;
    
    // CRITICAL: Prevent circular reference by ensuring agent loop never stores orchestrator reference
    if (this.agentLoop && this.agentLoop.orchestrator) {
      delete this.agentLoop.orchestrator;
      console.log('[CIRCULAR REF FIX] Removed orchestrator property from agent loop during LeoOrchestrator construction');
    }
    this.llm = llmInterface;
    
    // Expose LLM interface as llmClient for agent loop compatibility
    this.llmClient = llmInterface;
    
    // Optional components
    this.logger = providedLogger || logger;
    this.capabilityRegistry = capabilityRegistry;
    this.feedbackManager = feedbackManager;
    this.semanticContextManager = semanticContextManager;
    
    // Awareness components - For conversation event processing
    this.unifiedAwarenessService = unifiedAwarenessService;
    this.contextProcessor = contextProcessor;
    this.flowMonitor = flowMonitor;
    this.interactionMemorySystem = interactionMemorySystem;
    
    // Meta Agent Router - For cognitive coordination and natural self-awareness
    this.metaAgentRouter = metaAgentRouter;
    
    // Safety components - For file operation protection
    this.backupManager = backupManager;
    
    // Configuration
    this.config = {
      // Agent loop configuration
      enableReflection: true,
      enableUpdate: true,
      enableMetaCognition: true,
      
      // Emergent behavior configuration (no hardcoded identity/capabilities)
      enableSalienceRanking: true,
      enableEmergentBehavior: config.useEmergentBehavior !== false,
      enableIdentityInjection: false, // Disabled - identity emerges from memory
      enableCapabilityInjection: false, // Disabled - capabilities emerge from memory
      
      // Memory configuration
      enableMemoryUpdates: true,
      enableLearning: true,
      
      // Debugging configuration
      enableIntrospection: true,
      logAgentState: true,
      
      ...config
    };
    
    // Agent state - persistent and introspectable (no hardcoded identity)
    this.agentState = {
      [SESSION_ID_KEY]: this.generateSessionId(),
      startTime: Date.now(),
      lastInteraction: null,
      beliefs: new Map(),
      goals: new Map(),
      tone: 'conversational',
      mode: 'cognitive-partner',
      // Identity and capabilities removed - they emerge from memory graph
      emergentIdentity: null, // Will be populated from memory
      emergentCapabilities: [], // Will be populated from memory
      context: {
        current: null,
        history: []
      }
    };
    
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize the orchestrator and all cognitive components
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize() {
    if (this.initialized) {
      this.logger.warn('LeoOrchestrator already initialized');
      return true;
    }
    
    if (this.initializing) {
      this.logger.warn('LeoOrchestrator initialization in progress');
      return false;
    }
    
    this.initializing = true;
    
    try {
      this.logger.info('Initializing LeoOrchestrator');
      
      // Parallel init: memoryGraph → CSE sequential (dependency), others parallel
      
      // Core sequential chain (CSE depends on memoryGraph)
      const coreInit = (async () => {
        if (this.memoryGraph && typeof this.memoryGraph.initialize === 'function') {
          await this.memoryGraph.initialize();
          this.logger.info('Memory graph initialized');
        }
        
        if (this.cse && typeof this.cse.initialize === 'function') {
          await this.cse.initialize();
          this.logger.info('CSE initialized');
        }
      })();
      
      // Independent parallel inits
      const independentInits = Promise.all([
        (async () => {
          if (this.agentLoop && typeof this.agentLoop.initialize === 'function') {
            await this.agentLoop.initialize({});
            this.logger.info('Agent loop initialized');
          }
        })(),
        (async () => {
          if (this.llm && typeof this.llm.initialize === 'function') {
            await this.llm.initialize();
            this.logger.info('LLM interface initialized');
          }
        })(),
        (async () => {
          if (this.capabilityRegistry && typeof this.capabilityRegistry.initialize === 'function') {
            await this.capabilityRegistry.initialize();
            this.logger.info('Capability registry initialized');
          }
        })(),
        (async () => {
          if (this.feedbackManager && typeof this.feedbackManager.initialize === 'function') {
            await this.feedbackManager.initialize();
            this.logger.info('Feedback manager initialized');
          }
        })()
      ]);
      
      // Wait for both core and independent inits
      await Promise.all([coreInit, independentInits]);
      
      // Load agent state from memory if available
      await this.loadAgentState();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.initialized = true;
      this.initializing = false;
      
      // Log orchestrator initialization - temporarily disabled
      // if (this.orchestratorLogger && this.orchestratorLogger.logOrchestratorEvent) {
      //   this.orchestratorLogger.logOrchestratorEvent('initialization', {
      //     sessionId: this.agentState[SESSION_ID_KEY],
      //     components: {
      //       memoryGraph: !!this.memoryGraph,
      //       cse: !!this.cse,
      //       agentLoop: !!this.agentLoop,
      //       llmInterface: !!this.llm
      //     },
      //     config: this.config,
      //     timestamp: Date.now()
      //   });
      // }
      
      this.logger.info('LeoOrchestrator initialized successfully', {
        sessionId: this.agentState[SESSION_ID_KEY],
        components: {
          memoryGraph: !!this.memoryGraph,
          cse: !!this.cse,
          agentLoop: !!this.agentLoop,
          llmInterface: !!this.llm
        }
      });
      
      // Emit initialization event
      eventBus.emit('orchestrator:initialized', {
        sessionId: this.agentState[SESSION_ID_KEY],
        timestamp: Date.now()
      }, COMPONENT_NAME);
      
      return true;
      
    } catch (error) {
      this.initializing = false;
      this.logger.error('Failed to initialize LeoOrchestrator', error);
      return false;
    }
  }
  
  /**
   * Ensure agent loop is ready for processing
   * @returns {Promise<boolean>} Agent loop readiness
   */
  async ensureAgentLoopReady() {
    console.log('[CRITICAL ORCHESTRATOR DEBUG] ensureAgentLoopReady called');
    console.log('[CRITICAL ORCHESTRATOR DEBUG] Current agentLoop exists:', !!this.agentLoop);
    
    // Use existing agent loop if available and initialized
    if (this.agentLoop && this.agentLoop.initialized) {
      console.log('[CRITICAL ORCHESTRATOR DEBUG] Using existing initialized agent loop');
      return true;
    }
    
    // Initialize existing agent loop if not initialized
    if (this.agentLoop && !this.agentLoop.initialized) {
      console.log('[CRITICAL ORCHESTRATOR DEBUG] Initializing existing agent loop');
      await this.agentLoop.initialize();
      console.log('[CRITICAL ORCHESTRATOR DEBUG] Agent loop initialized successfully');
      return true;
    }
    
    // This should not happen in normal operation
    console.log('[CRITICAL ORCHESTRATOR DEBUG] No agent loop available - this should not happen');
    return false;
  }

  /**
   * Process user input with guaranteed agent loop readiness
   * @param {string} text - User input text
   * @param {Object} opts - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processUserInput(text, opts = {}) {
    await this.ensureAgentLoopReady();          // <- guarantee readiness
    // Extract userContext if nested, otherwise use opts directly for backward compatibility
    const userContext = opts.userContext || opts;
    const result = await this.agentLoop.process({ userInput: text, userContext });
    
    // WEEK 2 FIX: Record conversation turn for cross-session recall (same as handleUserInput)
    const llmResponse = result.llmResponse || result.response;
    if (this.interactionMemorySystem && llmResponse) {
      const sessionId = opts.sessionId || this.agentState?.[SESSION_ID_KEY];
      console.log('[processUserInput] [WEEK 2 DEBUG] Recording conversation turn');
      this.interactionMemorySystem.recordInteraction(
        text,
        llmResponse,
        {
          memories: result.salientMemories || [],
          flowState: this.flowState,
          identity: this.identity,
          sessionId: sessionId
        }
      ).catch(interactionError => {
        console.error('[processUserInput] Interaction recording failed:', interactionError);
      });
    } else {
      console.log('[processUserInput] [WEEK 2 DEBUG] Skipping conversation turn:', {
        hasInteractionMemorySystem: !!this.interactionMemorySystem,
        hasLlmResponse: !!llmResponse
      });
    }
    
    return result;
  }

  /**
   * Main entry point - Handle user input through the agent loop
   * 
   * This is where ALL interactions begin. Every user input, system event,
   * or cognitive process flows through this method and the agent loop.
   * 
   * @param {string} userInput - User's input
   * @param {Object} userContext - Additional context about the user/session
   * @returns {Promise<Object>} Response object with agent loop results
   */
  async handleUserInput(userInput, userContext = {}) {
    if (!this.initialized) {
      throw new Error('LeoOrchestrator not initialized. Call initialize() first.');
    }
    
    try {
      // PHASE 3: Update session ID from userContext if provided (for cross-session recall)
      if (userContext.sessionId) {
        this.agentState[SESSION_ID_KEY] = userContext.sessionId;
      }
      
      this.logger.info('Handling user input through agent loop', {
        sessionId: this.agentState[SESSION_ID_KEY],
        inputLength: userInput?.length || 0,
        userContext
      });
      
      // Log user input received - temporarily disabled
      // if (this.orchestratorLogger && this.orchestratorLogger.logOrchestratorEvent) {
      //   this.orchestratorLogger.logOrchestratorEvent('user_input_received', {
      //     inputLength: userInput.length,
      //     sessionId: this.agentState[SESSION_ID_KEY],
      //     timestamp: Date.now()
      //   });
      // }
      
      // Process conversation event through awareness layer (async, non-blocking)
      if (this.unifiedAwarenessService) {
        this.unifiedAwarenessService.processEvent({
          type: 'conversation_input',
          userInput,
          userContext,
          sessionId: this.agentState[SESSION_ID_KEY],
          timestamp: Date.now()
        }).catch(awarenessError => {
          this.logger.warn('Awareness event processing failed', awarenessError);
        });
      }
      
      // Update agent state
      this.agentState.lastInteraction = Date.now();
      if (!this.agentState.metrics) {
        this.agentState.metrics = { interactions: 0 };
      }
      this.agentState.metrics.interactions++;
      
      // Ensure agent loop is ready
      await this.ensureAgentLoopReady();
      
      // Process through agent loop with orchestrator context
      console.log('[CRITICAL ORCHESTRATOR DEBUG] ========== AGENT LOOP CALL ==========');
      console.log('[CRITICAL ORCHESTRATOR DEBUG] About to call agentLoop.process');
      console.log('[CRITICAL ORCHESTRATOR DEBUG] agentLoop exists:', !!this.agentLoop);
      console.log('[CRITICAL ORCHESTRATOR DEBUG] agentLoop.process exists:', !!this.agentLoop?.process);
      
      // CRITICAL: Check for circular reference before processing
      console.log('[CIRCULAR REF CHECK] Before processing - agentLoop.orchestrator === this:', this.agentLoop.orchestrator === this);
      
      const result = await this.agentLoop.process({
        userInput: userInput,
        userContext: userContext,
        agentState: this.agentState
      });
      
      // CRITICAL: Check for circular reference after processing
      console.log('[CIRCULAR REF CHECK] After processing - agentLoop.orchestrator === this:', this.agentLoop.orchestrator === this);
      
      // CRITICAL: Remove any orchestrator property that might have been set during processing
      if (this.agentLoop.orchestrator === this) {
        console.log('[CIRCULAR REF FIX] Removing orchestrator property set during processing');
        delete this.agentLoop.orchestrator;
      }
      
      console.log('[CRITICAL ORCHESTRATOR DEBUG] agentLoop.process returned:', typeof result);
      console.log('[CRITICAL ORCHESTRATOR DEBUG] result keys:', Object.keys(result || {}));
      console.log('[DEBUG] agentLoop.process completed successfully');
      
      // Update agent state based on results
      await this.updateAgentState(result);
      
      // Save agent state
      await this.saveAgentState();
      
      // Process response event through awareness layer (async, non-blocking)
      if (this.unifiedAwarenessService && result.response) {
        this.unifiedAwarenessService.processEvent({
          type: 'conversation_response',
          userInput,
          response: result.response,
          sessionId: this.agentState[SESSION_ID_KEY],
          metadata: result.metadata,
          timestamp: Date.now()
        }).catch(awarenessError => {
          this.logger.warn('Awareness response processing failed', awarenessError);
        });
      }
      
      // PHASE 3 STEP 1: Record conversation turn for cross-session recall
      const llmResponse = result.llmResponse || result.response;
      if (this.interactionMemorySystem && llmResponse) {
        const sessionId = this.agentState[SESSION_ID_KEY];
        console.log('[PHASE 3 DEBUG] Recording conversation turn:', {
          hasInteractionMemorySystem: !!this.interactionMemorySystem,
          hasLlmResponse: !!llmResponse,
          sessionId: sessionId,
          userInputLength: userInput?.length,
          responseLength: llmResponse?.length
        });
        this.interactionMemorySystem.recordInteraction(
          userInput,
          llmResponse,
          {
            memories: result.salientMemories || [],
            flowState: this.flowState,
            identity: this.identity,
            sessionId: sessionId
          }
        ).catch(interactionError => {
          console.error('[PHASE 3 ERROR] Interaction recording failed:', interactionError);
          this.logger.warn('Interaction recording failed', interactionError);
        });
      } else {
        console.log('[PHASE 3 DEBUG] Skipping conversation turn recording:', {
          hasInteractionMemorySystem: !!this.interactionMemorySystem,
          hasLlmResponse: !!llmResponse
        });
      }
      
      // Log interaction completion - temporarily disabled
      // if (this.orchestratorLogger && this.orchestratorLogger.logOrchestratorEvent) {
      //   this.orchestratorLogger.logOrchestratorEvent('interaction_completed', {
      //     sessionId: this.agentState[SESSION_ID_KEY],
      //     duration: result.metadata?.duration,
      //     phasesExecuted: result.metadata?.phasesExecuted,
      //     skillSelected: result.metadata?.skillSelected,
      //     success: true,
      //     timestamp: Date.now()
      //   });
      // }
      
      if (this.config.logAgentState) {
        this.logger.debug('Agent loop completed', {
          sessionId: this.agentState[SESSION_ID_KEY],
          result: result,
          agentState: this.getAgentStateSummary()
        });
      }
      
      // Emit interaction event
      if (this.agentState && this.agentState[SESSION_ID_KEY]) {
        eventBus.emit('orchestrator:interaction', {
          sessionId: this.agentState[SESSION_ID_KEY],
          userInput,
          result: result,
          timestamp: Date.now()
        }, COMPONENT_NAME);
      }
      
      return result;
      
    } catch (error) {
      // Log error
      // Temporarily disabled orchestrator logging
      // if (this.orchestratorLogger && this.orchestratorLogger.logOrchestratorEvent) {
      //   this.orchestratorLogger.logOrchestratorEvent('interaction_error', {
      //     sessionId: this.agentState?.[SESSION_ID_KEY] || 'unknown',
      //     error: error.message,
      //     stack: error.stack,
      //     timestamp: Date.now()
      //   });
      // }
      
      this.logger.error('Error handling user input', error);
      
      // Emit error event
      eventBus.emit('orchestrator:error', {
        sessionId: this.agentState[SESSION_ID_KEY],
        error: error.message,
        timestamp: Date.now()
      }, COMPONENT_NAME);
      
      // Return a fallback result instead of throwing to prevent undefined result
      return {
        response: 'I apologize, but I encountered an issue processing your request. Please try again.',
        llmResponse: 'I apologize, but I encountered an issue processing your request. Please try again.',
        error: error.message,
        processingSteps: [{ step: 'ERROR', message: error.message, timestamp: Date.now() }],
        timing: { phases: {} },
        memoriesRetrieved: 0,
        detectedEntity: null
      };
    }
  }
  
  /**
   * Get memory context through CSE
   * 
   * This method ensures all memory access flows through the CSE for
   * salience-based ranking and context injection.
   * 
   * @param {string} query - Query for memory search
   * @param {Object} options - Search options
   * @returns {Promise<Object>} CSE-processed memory context
   */
  async getMemoryContext(query, options = {}) {
    console.log('[LeoOrchestrator] getMemoryContext called with query:', query);
    try {
      if (process.env.LEO_DEBUG === 'true') {
        console.log('\n🔍 === ORCHESTRATOR MEMORY CONTEXT DEBUG ===');
        console.log('🎯 Query:', query);
        console.log('🔧 Using EmergentCSE with fusion envelope...');
      }
      
      // PHASE 3 STEP 2: Classify intent and pass to retrieval
      const intentInfo = classifyQueryIntent(query);
      const intent = intentInfo.intent;
      const scope = intentInfo.scope; // PHASE 3.5: Explicit scope
      const sessionId = this.agentState?.[SESSION_ID_KEY] || options?.sessionId;
      
      console.log('[LeoOrchestrator] PHASE 3 DEBUG: intent=', intent, 'scope=', scope, 'sessionId=', sessionId);
      
      // Use EmergentCSE to get fusion envelope directly with intent, scope, and sessionId
      console.log('[LeoOrchestrator] Calling EmergentCSE.getEmergentContext for query:', query);
      const cseContext = await this.cse.getEmergentContext(query, {
        ...(options || {}),
        intent,
        scope, // PHASE 3.5: Pass scope for cross-session recall
        sessionId
      });
      const memoryCards = cseContext?.fusion?.memoryCards || [];
      console.log('[LeoOrchestrator] EmergentCSE returned context with', memoryCards.length, 'memory cards');
      
      // PHASE 3 STEP 3: Epistemic gating for empty conversation recall
      let preface = '';
      if (intent === 'conversation_recall') {
        const mems = memoryCards || [];
        if (!mems || mems.length === 0) {
          preface = "I don't yet have prior Persistra conversation history on that topic in the memory graph; I can answer from the knowledge corpus I do have.\n\n";
          console.log('[LeoOrchestrator] Phase 3: Adding epistemic preface for empty conversation recall');
        }
      }
      
      // Attach preface to context for agent loop to use
      if (preface && cseContext) {
        cseContext.epistemicPreface = preface;
      }
      
      // Return the fusion envelope directly for agent loop consumption
      return cseContext;
      
    } catch (error) {
      // Log error - temporarily disabled
      // if (this.orchestratorLogger && this.orchestratorLogger.logOrchestratorEvent) {
      //   this.orchestratorLogger.logOrchestratorEvent('memory_error', {
      //     sessionId: this.agentState?.[SESSION_ID_KEY] || 'unknown',
      //     error: error.message,
      //     stack: error.stack,
      //     timestamp: Date.now()
      //   });
      // }
      
      this.logger.error('Error getting memory context', error);
      throw error;
    }
  }
  
  /**
   * Generate LLM response with guaranteed output
   * 
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated response
   */
  async generateLLMResponse({ query, context, strategy }) {
    console.log('[generateLLMResponse DEBUG] this.llm exists:', !!this.llm);
    console.log('[generateLLMResponse DEBUG] this.llm type:', typeof this.llm);
    console.log('[generateLLMResponse DEBUG] this.llm.generate type:', typeof this.llm?.generate);
    console.log('[generateLLMResponse DEBUG] this.llm keys:', this.llm ? Object.keys(this.llm).slice(0, 10) : []);
    
    this.logger.info(`[LLM] Generating with strategy=${strategy}, model=${this.llm?.model || 'unknown'}`);
    if (!this.llm || typeof this.llm.generate !== 'function') {
      this.logger.error('[LLM] Service missing from DI container');
      console.error('[generateLLMResponse ERROR] LLM check failed:', {
        hasLLM: !!this.llm,
        llmType: typeof this.llm,
        hasGenerate: typeof this.llm?.generate
      });
      throw new Error('LLM service unavailable');
    }

    const contextArray = Array.isArray(context) ? context : [];
    const { coverage, gkAllowance, homogeneity, uniqSources } = computeFusionCoverage(contextArray);

    // Extract diversity metrics for confidence calibration
    const sources = new Set();
    const timestamps = [];
    contextArray.forEach(m => {
      const source = m.source || m.metadata?.source || m.metadata?.repo || m.metadata?.path || 'unknown';
      if (source !== 'unknown') sources.add(source);
      const timestamp = m.timestamp || m.metadata?.timestamp;
      if (timestamp && typeof timestamp === 'number') timestamps.push(timestamp);
    });
    
    const diversityMetrics = {
      uniqueSources: sources.size,
      timestampCoverage: contextArray.length > 0 ? timestamps.length / contextArray.length : 0,
      isTemporalQuery: /\b(last|recent|previous|earlier|ago|when|date|time)\b/i.test(query)
    };

    // Recalculate GK allowance with query-aware logic (Phase 2)
    const queryAwareGKAllowance = getGKAllowance(coverage, query);
    
    this.logger.info(`[Fusion Coverage] score=${coverage.toFixed(2)}, homogeneity=${homogeneity.toFixed(2)}, gkAllowance=${queryAwareGKAllowance}, sources=${uniqSources}`);
    console.log(`[Diversity Metrics] uniqueSources=${diversityMetrics.uniqueSources}, timestampCoverage=${(diversityMetrics.timestampCoverage * 100).toFixed(0)}%, isTemporalQuery=${diversityMetrics.isTemporalQuery}`);

    // Build facts bullets (existing helper) and compose prompt with policy
    const bullets = contextArray
      .map(m => `• ${m.content || m.text || ''}`)
      .filter(b => b.length > 2)
      .join('\n');

    const mustGK = queryAwareGKAllowance > 0;
    
    // Hierarchical prompting: System (identity) → Policy (rules) → Facts → Question
    
    // System header (constant, ≤4 lines) - identity, priorities, safety
    const systemHeader = `You are a cognitive partner with access to both project memory and general knowledge.
Your job is to synthesize complete, confident answers.
NEVER say "I don't have information" or "Unfortunately" or ask the user for more details.
End with CONFIDENCE and NEXT_RETRIEVALS.`;

    // Dynamic policy (1-2 lines) - GK allowance + anti-hedging
    const gkPolicy = mustGK
      ? `INSTRUCTIONS: Start with FACTS below. You may supplement with up to ${queryAwareGKAllowance} relevant general knowledge [GK] facts if they add value to the answer. Label each with [GK]. Prioritize project memory over general knowledge.`
      : `INSTRUCTIONS: Start with FACTS below. Supplement with general knowledge if it adds value to the answer. Never refuse or say you lack information.`;

    let prompt;
    if (strategy === 'memory_informed' && contextArray.length > 0) {
      const gkExample = mustGK
        ? `\n\nEXAMPLE [GK] SENTENCE:
[GK] Grover's algorithm is a quantum algorithm that provides quadratic speedup for unstructured search problems, achieving O(√N) complexity compared to classical O(N).`
        : '';
      
      const formatInstructions = mustGK
        ? `• Key points grounded in FACTS (cite concrete names/numbers)
• Adapt structure to content - use bullets for clarity, but don't force artificial count
• Supplement with up to ${queryAwareGKAllowance} relevant [GK] facts if they add value (not required)
• Short Implications paragraph (2–3 sentences)
• Do NOT ask for more information or suggest the user provide details
• End with:
  CONFIDENCE: <low|medium|high>
  NEXT_RETRIEVALS: (a) ... (b) ...`
        : `• Key points grounded in FACTS (cite concrete names/numbers)
• Adapt structure to content - use bullets for clarity, but don't force artificial count
• Short Implications paragraph (2–3 sentences)
• Do NOT ask for more information or suggest the user provide details
• End with:
  CONFIDENCE: <low|medium|high>
  NEXT_RETRIEVALS: (a) ... (b) ...`;
      
      prompt = `${systemHeader}

${gkPolicy}${gkExample}

FACTS:
${bullets}

QUESTION:
${query}

FORMAT:
${formatInstructions}`;
    } else {
      // Fallback path (no context)
      prompt = `${systemHeader}

${gkPolicy}

QUESTION:
${query}

FORMAT:
• If memory facts are absent, include required [GK] sentences inline if allowed
• End with:
  CONFIDENCE: <low|medium|high>
  NEXT_RETRIEVALS: (a) ... (b) ...`;
    }
    // tightened policy applied

    // Log the actual prompt being sent
    console.log('[generateLLMResponse] PROMPT BEING SENT TO LLM:');
    console.log('='.repeat(80));
    console.log(prompt.substring(0, 1000));
    console.log('='.repeat(80));
    
    // Convert prompt string to messages format for LLM Gateway
    const messages = [
      { role: 'user', content: prompt }
    ];
    
    // Use injected LLM service (pure DI, testable)
    // Gateway expects: generate(messages, hints)
    const result = await this.llm.generate(messages, {
      max_tokens: 3800,       // give space for footer
      temperature: 0.5
    });
    
    // Extract text from gateway response (may be string or {text, __lpacStamp})
    const raw = typeof result === 'string' ? result : result.text;
    console.log('[generateLLMResponse] Raw LLM response length:', raw?.length);

    // Remove hedging/meta-commentary the model might add
    const cleaned = deHedge(raw);
    console.log('[generateLLMResponse] After deHedge, length:', cleaned?.length);
    
    // Enforce footer even if model forgets (with diversity-based confidence calibration)
    const finalOut = enforceAnswerFooter(cleaned, { coverage, diversityMetrics }, contextArray, query);
    console.log('[generateLLMResponse] Final output length:', finalOut?.length);
    
    return finalOut;
  }

  // ✅ Compose user content with embedded memory snippets (stricter format)
  composeUserContent(ctx, userQuestion) {
    const bullets = (Array.isArray(ctx) ? ctx : [])
      .map(m => `• ${m.content || m.text || ''}`)
      .filter(b => b.length > 2)
      .join('\n');

    return `Helpful facts you can rely on:\n${bullets}\n\nQuestion: ${userQuestion}\n\n` +
           `Answer with 3–5 specific points using the facts. End with:\n` +
           `CONFIDENCE: <low|medium|high>\nNEXT_RETRIEVALS: (a) ... (b) ...`;
  }
  
  /**
   * Update memory graph with new information
   * 
   * @param {Object} memoryData - Data to add to memory
   * @returns {Promise<boolean>} Success status
   */
  async updateMemory(memoryData) {
    if (!this.config.enableMemoryUpdates) {
      return false;
    }
    
    try {
      await this.memoryGraph.addMemory(memoryData);
      this.agentState.metrics.memoryUpdates++;
      
      this.logger.debug('Memory updated', {
        sessionId: this.agentState[SESSION_ID_KEY],
        memoryType: memoryData.type
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Error updating memory', error);
      return false;
    }
  }
  
  /**
   * Get current agent state summary for introspection
   * @returns {Object} Agent state summary
   */
  getAgentStateSummary() {
    return {
      sessionId: this.agentState[SESSION_ID_KEY],
      uptime: Date.now() - this.agentState.startTime,
      lastInteraction: this.agentState.lastInteraction,
      mode: this.agentState.mode,
      tone: this.agentState.tone,
      metrics: { ...this.agentState.metrics },
      identity: {
        emergent: !!this.agentState.emergentIdentity,
        identityData: this.agentState.emergentIdentity ? 'present' : 'none'
      },
      capabilities: {
        emergentCount: this.agentState.emergentCapabilities.length,
        capabilities: this.agentState.emergentCapabilities.map(c => c.name || c).slice(0, 3) // Show first 3
      }
    };
  }
  
  /**
   * Get full agent state for debugging (introspection)
   * @returns {Object} Complete agent state
   */
  introspect() {
    if (!this.config.enableIntrospection) {
      return { error: 'Introspection disabled' };
    }
    
    // Create safe introspection data without circular references
    const safeAgentState = {
      sessionId: this.agentState[SESSION_ID_KEY],
      startTime: this.agentState.startTime,
      lastInteraction: this.agentState.lastInteraction,
      mode: this.agentState.mode,
      tone: this.agentState.tone,
      metrics: { ...this.agentState.metrics },
      beliefs: Array.from(this.agentState.beliefs.entries()),
      goals: Array.from(this.agentState.goals.entries()),
      emergentIdentity: this.agentState.emergentIdentity,
      emergentCapabilities: this.agentState.emergentCapabilities.map(c => c.name || c)
    };
    
    return {
      orchestrator: {
        initialized: this.initialized,
        config: { ...this.config },
        components: {
          memoryGraph: !!this.memoryGraph,
          cse: !!this.cse,
          agentLoop: !!this.agentLoop,
          llm: !!this.llm,
          capabilityRegistry: !!this.capabilityRegistry,
          feedbackManager: !!this.feedbackManager
        }
      },
      agentState: safeAgentState
    };
  }
  
  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    // Use environment session ID if provided (for conversation continuity)
    if (process.env.LEO_SESSION_ID) {
      return process.env.LEO_SESSION_ID;
    }
    
    // Generate new session ID using UUID
    return uuidv4();
  }
  
  /**
   * Load agent state from memory
   * @private
   */
  async loadAgentState() {
    try {
      // Skip if already loaded in this session (performance optimization)
      if (this.agentStateLoaded) {
        return;
      }
      
      // Try to load previous agent state from memory graph
      const stateMemory = await this.memoryGraph.searchMemories({
        query: 'agent_state',
        type: 'system',
        limit: 1
      });
      
      this.agentStateLoaded = true; // Cache flag
      
      if (stateMemory && stateMemory.length > 0) {
        const savedState = JSON.parse(stateMemory[0].content);
        
        // Merge saved state with current state (preserve session info)
        this.agentState = {
          ...this.agentState,
          beliefs: new Map(savedState.beliefs || []),
          goals: new Map(savedState.goals || []),
          tone: savedState.tone || this.agentState.tone,
          mode: savedState.mode || this.agentState.mode,
          identity: savedState.identity || this.agentState.identity,
          capabilities: savedState.capabilities || this.agentState.capabilities
        };
        
        this.logger.info('Agent state loaded from memory');
      }
      
    } catch (error) {
      this.logger.warn('Could not load agent state from memory', error);
    }
  }
  
  /**
   * Save agent state to memory
   * @private
   */
  async saveAgentState() {
    if (!this.config.enableMemoryUpdates) {
      return;
    }
    
    try {
      await this.memoryGraph.addMemory({
        type: 'system',
        subtype: 'agent_state',
        content: JSON.stringify({
          beliefs: Array.from(this.agentState.beliefs.entries()),
          goals: Array.from(this.agentState.goals.entries()),
          tone: this.agentState.tone,
          mode: this.agentState.mode,
          identity: this.agentState.identity,
          capabilities: this.agentState.capabilities,
          metrics: this.agentState.metrics
        }),
        timestamp: Date.now(),
        sessionId: this.agentState[SESSION_ID_KEY]
      });
      
    } catch (error) {
      this.logger.warn('Could not save agent state to memory', error);
    }
  }
  
  /**
   * Update agent state based on agent loop results
   * @param {Object} agentLoopResult - Results from agent loop
   * @private
   */
  async updateAgentState(agentLoopResult) {
    if (!agentLoopResult) return;
    
    // Update metrics based on agent loop phases
    if (agentLoopResult.reflection) {
      this.agentState.metrics.reflections++;
    }
    
    if (agentLoopResult.learning) {
      this.agentState.metrics.learningEvents++;
    }
    
    // Update identity if changed
    if (agentLoopResult.identityUpdate) {
      this.agentState.identity.dynamic = agentLoopResult.identityUpdate;
      this.agentState.identity.lastUpdate = Date.now();
    }
    
    // Update capabilities if changed
    if (agentLoopResult.capabilityUpdate) {
      this.agentState.capabilities.active = agentLoopResult.capabilityUpdate;
      this.agentState.capabilities.lastUpdate = Date.now();
    }
  }
  
  /**
   * Set up event listeners for orchestrator
   * @private
   */
  setupEventListeners() {
    // Listen for system events
    eventBus.on('system:shutdown', () => {
      this.logger.info('System shutdown - saving agent state');
      this.saveAgentState();
    }, COMPONENT_NAME);
    
    // Listen for memory updates
    eventBus.on('memory:updated', (data) => {
      this.logger.debug('Memory updated event received', data);
    }, COMPONENT_NAME);
    
    // Listen for CSE updates
    eventBus.on('cse:salience-updated', (data) => {
      this.logger.debug('CSE salience updated', data);
    }, COMPONENT_NAME);
  }

  /**
   * Stable public entrypoint for user input processing
   * @param {string} userInput - The user's input
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async handleUserInputLegacy(userInput, { userContext = {}, agentState } = {}) {
    // Delegate to the main handleUserInput method that uses agentLoop.process
    // This ensures we use the new synthesis prompt instead of old processRegularQuery
    if (!this.initialized) {
      throw new Error('LeoOrchestrator not initialized. Call initialize() first.');
    }
    
    // Update agent state if provided
    if (agentState) {
      Object.assign(this.agentState, agentState);
    }
    
    // Call the main handleUserInput method (lines 312+) that uses agentLoop.process
    return this.handleUserInput(userInput, userContext);
  }

  /**
   * Backward compatibility shim for processRegularQuery
   * @deprecated Use handleUserInput instead
   */
  async processRegularQuery(userInput, ctx = {}) {
    return this.handleUserInput(userInput, ctx);
  }
}

module.exports = LeoOrchestrator;
