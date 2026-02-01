/**
 * Orchestrator-Aware Agent Loop
 * 
 * This is the cognitive process engine for Leo's Cognitive Operating System.
 * It implements the core agent loop pattern: Observe → Reflect → Act → Update
 * 
 * Key principles:
 * 1. All cognition flows through this loop
 * 2. All context comes from CSE via orchestrator
 * 3. All memory access goes through orchestrator
 * 4. Agent state is persistent and managed by orchestrator
 * 5. No direct LLM calls - everything orchestrated
 * 
 * @created 2025-08-01
 * @phase COS Implementation
 */

const { createComponentLogger } = require('../../../lib/utils/logger');
const { validateEntityCitations, sanitizeSurface } = require('./validator');
const { generateGroundedFactBullets, buildMetaAgentPrompt } = require('./metaAgentTemplate');
const { VisionAnchor } = require('./VisionAnchor');
const ResearchOrchestrator = require('../research/ResearchOrchestrator');
const eventBus = require('../../../lib/utils/event-bus');
// const OrchestratorLogger = require('../logging/OrchestratorLogger'); // Temporarily disabled for demo
const { v4: uuidv4 } = require('uuid');
const { SESSION_ID_KEY } = require('../constants/session');
const trueSemanticEmbeddings = require('../../../lib/services/true-semantic-embeddings');
// Agent Loop Evolution v1 (Phase 4)
const { classifyIntentAndScope } = require('./agentLoopEvolutionV1');
const PermissionController = require('../security/permissionController');

// Component name for logging
const COMPONENT_NAME = 'orchestrator-agent-loop';

// Helper function to convert routing hint to decision mode
function routingHintToDecisionMode(hint) {
  if (hint === 'memory-first') return 'Memory-First';
  if (hint === 'general') return 'General';
  return 'Blend';
}

// Create component logger

const componentLogger = createComponentLogger(COMPONENT_NAME);

// --- ALE debug gating (reduce demo console spam) ---
const _ALE_DEBUG_ON = (() => {
  const v = String(
    process.env.ALE_DEBUG ||
    process.env.LEO_ALE_DEBUG ||
    process.env.LEO_ALE_DIAGNOSTICS ||
    ''
  ).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
})();

function dlog(...args) {
  if (_ALE_DEBUG_ON) console.log(...args);
}

function dwarn(...args) {
  if (_ALE_DEBUG_ON) console.warn(...args);
}

function derror(...args) {
  if (_ALE_DEBUG_ON) console.error(...args);
}
// --- end ALE debug gating ---

/**
 * Apply pilot UX polish: grounding marker + controlled expansion
 * @param {Object} opts - Options
 * @param {string} opts.text - LLM response text
 * @param {string} opts.userInput - Original user input
 * @param {string} opts.intent - Detected intent
 * @param {number} opts.memoryUsedCount - Number of memory snippets used
 * @param {number} opts.avgSalience - Average salience of retrieved memory
 * @returns {string} Polished text
 */
function _applyPilotUXPolish({
  text,
  userInput,
  intent,
  memoryUsedCount,
  avgSalience
}) {
  let out = String(text || '').trim();

  const groundingOn = String(process.env.LEO_ALE_GROUNDING || 'true').toLowerCase() !== 'false';
  const expansionOn = String(process.env.LEO_ALE_EXPAND || 'true').toLowerCase() !== 'false';

  // Require both memory retrieval AND meaningful salience (>0.4) to show grounding
  const hasMemory = Number(memoryUsedCount || 0) > 0 && Number(avgSalience || 0) >= 0.4;

  // Educational intent heuristic (deterministic; no extra calls)
  const inputText = String(userInput || '').trim();
  const i = String(intent || '').toLowerCase();
  const educationalAsk = /\b(explain|teach|help\s+me\s+understand|walk\s+me\s+through|elaborate|more\s+detail|deeper\s+dive)\b/i.test(inputText);
  const educationalByForm = /^(knowledge_query|entity)$/i.test(i) && /\b(explain|how\s+does|what\s+is|describe|teach)\b/i.test(inputText);
  const isEducational = educationalAsk || educationalByForm;

  // 1) Grounding marker (one line) when memory actually used
  if (groundingOn && hasMemory) {
    const n = Number(memoryUsedCount || 0);
    const marker = `Grounded in project memory (${n} snippet${n === 1 ? '' : 's'}).`;
    if (!/^\s*Grounded in project memory\b/im.test(out)) {
      out = `${marker}\n\n${out}`.trim();
    }
  }

  // 2) Controlled expansion: strip "Expanded explanation" section unless educational
  if (expansionOn) {
    const hasExpanded = /\n\s*Expanded explanation\s*[:\-]/i.test(out);
    if (!isEducational && hasExpanded) {
      out = out.replace(/\n\s*Expanded explanation\s*[:\-][\s\S]*$/i, '').trim();
    }
  }

  return out;
}
// --- end Pilot UX polish ---

// Decision Gate Thresholds for Memory Relevance
const TIER_MEMORY_FIRST = 0.70;  // strong overlap
const TIER_HYBRID_MIN   = 0.40;  // partial overlap

/**
 * Choose answer mode based on memory similarity
 */
function chooseAnswerMode(memories) {
  if (!memories || !memories.length) return 'GK_ONLY';
  
  const maxSim = Math.max(...memories.map(m => m.salience || m.similarity || 0));
  
  if (maxSim >= TIER_MEMORY_FIRST) return 'MEMORY_FIRST';
  if (maxSim >= TIER_HYBRID_MIN) return 'HYBRID';
  return 'GK_ONLY';
}

/**
 * Ultra-lightweight decision gate with regex classification
 */
function classifyQuery(userInput) {
  const q = userInput.toLowerCase();
  if (/\b(compare|versus|vs\.?|trade[-\s]?offs?)\b/.test(q)) return 'compare';
  if (/\b(analy[sz]e|evaluate|assess|diagnos(e|is))\b/.test(q)) return 'analysis';
  if (/\b(what is|who is|define|explain|describe)\b/.test(q)) return 'entity';
  return 'generic';
}

/**
 * Build minimalist prompt with decision gate mode
 */
function buildMinimalistPrompt(userInput, memories, mode) {
  const basePrompt = "You can use project memory when relevant. If memory is clearly relevant, ground the answer in it; if partly relevant, blend with general knowledge; if not relevant, ignore it. Label sources as [Memory] or [General Knowledge]. Keep it concise and explicit.";
  
  const modeLines = {
    'MEMORY_FIRST': "Prioritize project memory; cite which items you used.",
    'HYBRID': "Blend memory (cite items) with general knowledge; flag any conflicts.",
    'GK_ONLY': "No relevant project memory was provided; answer from general knowledge only."
  };
  
  const memoryCards = (mode === 'GK_ONLY') ? [] : memories;
  const memoryBlock = memoryCards.length > 0 
    ? memoryCards.map((m, i) => `${i + 1}. ${m.content || 'No content'}`).join('\n\n')
    : '';
  
  const messages = [
    {
      role: 'system',
      content: `${basePrompt}\n\n${modeLines[mode]}`
    }
  ];
  
  if (memoryBlock) {
    messages.push({
      role: 'system', 
      content: `Project Memory:\n\n${memoryBlock}`
    });
  }
  
  messages.push({
    role: 'user',
    content: userInput
  });
  
  return messages;
}

/**
 * Build fusion prompt with neutral permissioning
 */
function buildFusionPrompt({ userInput, cseContext, agentState, budgets }) {
  const {
    systemBudget = 600,
    contextBudget = 2200,
    userBudget = 800
  } = budgets || {};

  // Extract fusion envelope or provide backward compatibility
  let fusion = cseContext?.fusion;
  if (!fusion) {
    // Legacy format compatibility shim
    fusion = {
      memoryCards: cseContext?.memoryCards || [],
      avgSalience: cseContext?.avgSalience || 0,
      memoryWeight: cseContext?.memoryWeight || 0.5,
      generalWeight: cseContext?.generalWeight || 0.5,
      rationale: cseContext?.rationale || '',
      routingHint: 'general-first'
    };
  }

  const {
    memoryCards = [],
    avgSalience = 0,
    memoryWeight = 0.5,
    generalWeight = 0.5,
    rationale = '',
    routingHint = 'general-first'
  } = fusion;

  // 1) System message with dynamic routing information
  const systemLines = [
    `You have access to LPAC (Leo Persistent AI Cognition), a system that provides project memory and context.`,
    `Routing: ${routingHint}. Avg salience: ${avgSalience.toFixed(2)}.`,
    `${memoryCards.length ? 
      `Included ${memoryCards.length} memory snippets (${Math.round(100*memoryWeight)}% weight).` : 
      `No high-confidence snippets; answering with general knowledge.`}`,
    `Policy: Use project memory when highly relevant; blend with your general knowledge when helpful; rely on general knowledge if project memory is weak.`,
    `Be thorough and structured. Provide multi-section answers with examples where appropriate.`,
    `If comparing/analyzing, cite specific memory snippets by brief label (e.g., [MEMORY_SNIPPET repoX]).`,
  ];
  let systemMsg = systemLines.join('\n');

  // 2) Insert fusion rationale as a brief hidden hint (kept terse)
  systemMsg += `\n\n[Routing Hint] ${rationale}`;

  // 3) Memory context - use fusion.memoryCards directly
  const messages = [{ role: 'system', content: systemMsg }];

  // Compact, budgeted attachment of cards as system snippets
  const cardBlocks = memoryCards.slice(0, 10).map((card, i) => {
    const title = card.title || card.id || 'snippet';
    const salience = (card.salience ?? 0).toFixed(2);
    const snippet = (card.content || card.snippet || '').slice(0, 600);
    return `[MEMORY ${i+1} | sal:${salience} | ${title}]\n${snippet}`;
  }).join('\n\n');

  if (cardBlocks) {
    messages.push({ role: 'system', content: cardBlocks });
  }

  // Guard against "no memories" claims when cards exist
  if (memoryCards.length > 0) {
    messages[0].content += `\n\n[Guard] You DO have project memory cards; do NOT state that none were found.`;
  }

  // 4) User message + explicit length/coverage nudge
  const userLines = [
    userInput?.trim() || '',
    '',
    // Length bias: only a hint, not a straightjacket
    'Please provide a comprehensive response (aim for 500–900 words when appropriate), include concrete examples or code snippets if useful, and clearly separate:',
    '1) Direct project-specific evidence (from memory, label snippets),',
    '2) General background knowledge, and',
    '3) Your synthesis/recommendation.'
  ].join('\n');

  messages.push({ role: 'user', content: userLines });

  // 5) Adaptive token allocation based on salience and fusion mode
  let adaptiveTokens = 2000; // baseline
  if (avgSalience > 0.6) {
    adaptiveTokens = 4000; // high salience = comprehensive response
  } else if (memoryWeight > 0.4) {
    adaptiveTokens = 3000; // moderate fusion = detailed response
  }
  
  return {
    messages,
    genHints: {
      // model params – tune to taste
      max_tokens: adaptiveTokens,      // adaptive based on salience
      temperature: 0.4,                // keep reasoning crisp
      top_p: 0.9,
      // optional: stop sequences, etc.
    },
    routing: { avgSalience, memoryWeight, generalWeight, memoryCards: memoryCards.length, adaptiveTokens }
  };
}

// Top-level initialization promise for idempotent init
let _initPromise = null;

async function _doInit(self) {
  if (self.initialized) return true;
  
  try {
    // Skip orchestrator dependency check since it's passed as parameter to process method
    // if (!self.orchestrator) {
    //   throw new Error('Orchestrator reference required for initialization');
    // }
    
    // Initialize orchestration layer if enabled
    if (self.config.enableOrchestration) {
      self.orchestrationLayer = new OrchestrationLayer({
        strategy: self.config.orchestrationStrategy,
        enableFallback: true,
        fallbackSkill: 'llm_conversation',
        enableCaching: true,
        enableLogging: true,
        enableMetrics: true,
        enableAdaptation: true
      });
      
      // Skip dependency initialization - will be handled when orchestrator is passed to process method
      // await self.orchestrationLayer.initialize({
      //   memoryGraph: self.orchestrator.memoryGraph,
      //   cse: self.orchestrator.cse,
      //   llmInterface: self.orchestrator.llmInterface,
      //   capabilityRegistry: self.orchestrator.capabilityRegistry
      // });
      
      // Skip orchestration layer dependencies - will be set when needed
      // if (self.orchestrationLayer) {
      //   self.orchestrationLayer.setDependencies({
      //     memoryGraph: self.orchestrator.memoryGraph,
      //     agentState: self.agentState
      //   });
      // }
      
      // Vision Anchor initialization - use ports to avoid circular ref
      // Note: self.orchestrator is blocked by defineProperty, so we get memoryGraph from ports
      const memoryGraph = ports?.getMemoryGraph ? ports.getMemoryGraph() : null;
      if (memoryGraph) {
        self.visionAnchor = new VisionAnchor({
          memoryGraph: memoryGraph
        });
        logger.info('VisionAnchor initialized successfully via ports');
      } else {
        logger.warn('VisionAnchor initialization skipped - no memoryGraph available');
      }
      
      // Skip Research Orchestrator initialization - will be created when needed
      // if (self.orchestrator.memoryGraph && self.orchestrator.cse && self.orchestrator.llm) {
      //   self.researchOrchestrator = new ResearchOrchestrator({
      //     cse: self.orchestrator.cse,
      //     memoryGraph: self.orchestrator.memoryGraph,
      //     llm: self.orchestrator.llm
      //   });
      //   logger.info('ResearchOrchestrator initialized successfully');
      // }
      
      self.logger.info('Orchestration layer initialized', {
        strategy: self.config.orchestrationStrategy
      });
    }
    
    self.initialized = true;
    self.logger.info('OrchestratorAgentLoop initialized successfully');
    
    return true;
    
  } catch (error) {
    self.logger.error('Failed to initialize agent loop', error);
    return false;
  }
}

/**
 * Orchestrator-Aware Agent Loop Class
 * 
 * Implements the core cognitive process with full orchestrator integration
 */
dlog('[CRITICAL MODULE DEBUG] orchestratorAgentLoop.js module loading...');
dlog('[CRITICAL MODULE DEBUG] Module path:', __filename);
dlog('[CRITICAL MODULE DEBUG] Load timestamp:', new Date().toISOString());

class OrchestratorAgentLoop {
  /**
   * Prevent accidental serialization of agent loop instances
   */
  toJSON() { 
    return '[OrchestratorAgentLoop]'; 
  }
  /**
   * Constructor
   * @param {Object} ports - Orchestrator ports interface (functions only, no class references)
   * @param {Object} config - Configuration options
   */
  constructor(ports, config = {}) {
    dlog('[CRITICAL CONSTRUCTOR DEBUG] OrchestratorAgentLoop constructor called');
    dlog('[CRITICAL CONSTRUCTOR DEBUG] Config:', JSON.stringify(config, null, 2));
    
    // Store ports first, validate after construction if needed
    this.ports = ports;
    
    // Debug: Check what methods are available on ports
    dlog('[PORTS DEBUG] Available methods:', Object.keys(ports).filter(k => typeof ports[k] === 'function'));
    
    // Validate ports interface to ensure we have all required methods
    try {
      validateOrchestratorPorts(ports);
      dlog('[PORTS DEBUG] Ports validation passed');
    } catch (error) {
      derror('[PORTS DEBUG] Ports validation failed:', error.message);
      // Don't throw - allow construction to continue for debugging
    }
    
    this.config = {
      enableReflection: true,
      enableUpdate: true,
      enableMetaCognition: true,
      enableLearning: true,
      reflectionThreshold: 0.7,
      updateThreshold: 0.5,
      maxReflectionDepth: 3,
      // Orchestration configuration
      orchestrationStrategy: config.orchestrationStrategy || 'default',
      enableOrchestration: config.enableOrchestration !== false,
      ...config
    };
    
    this.initialized = false;
    // this.orchestratorLogger = new OrchestratorLogger(); // Temporarily disabled
    
    // Initialize component logger
    this.logger = createComponentLogger(COMPONENT_NAME);
    
    // Initialize agent state
    this.agentState = {
      [SESSION_ID_KEY]: null,
      startTime: Date.now(),
      lastInteraction: null,
      mode: 'cognitive',
      tone: 'professional',
      metrics: {
        interactions: 0,
        reflections: 0,
        updates: 0,
        errors: 0
      },
      beliefs: new Map(),
      goals: new Map(),
      emergentIdentity: null,
      emergentCapabilities: [],
      reflectionDepth: 0,
      lastReflection: null,
      lastUpdate: null
    };
    
    this.logger.info('OrchestratorAgentLoop created with ports interface', { config: this.config });
  }
  
  /**
   * Initialize the agent loop
   * @param {Object} options - Initialization options
   * @param {Object} options.orchestrator - Reference to orchestrator
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize(options = {}) {
    if (this.initialized) return true;
    if (_initPromise) return _initPromise;
    
    // Remove orchestrator reference to break circular dependency
    // The orchestrator will be passed as parameter to process() method instead
    // DO NOT SET this.orchestrator - it creates circular reference for JSON serialization
    // if (options.orchestrator) {
    //   this.orchestrator = options.orchestrator;
    // }
    
    // CRITICAL: Ensure no orchestrator property is set to avoid circular reference
    if (this.orchestrator) {
      delete this.orchestrator;
      console.log('[CIRCULAR REF FIX] Removed orchestrator property to prevent JSON serialization error');
    }
    
    // Add property interceptor to catch any runtime assignment - silent mode
    Object.defineProperty(this, 'orchestrator', {
      get() { 
        // Silent - no logging to prevent stream conflicts
        return undefined; 
      },
      set(value) {
        // Silent - no logging to prevent stream conflicts
        // Do nothing - block the assignment
      },
      configurable: true,
      enumerable: false
    });
    
    // Additional check: Scan all properties for orchestrator references
    // Skip orchestratorLogger as it's a legitimate logging service, not a circular reference
    const props = Object.getOwnPropertyNames(this);
    for (const prop of props) {
      if (prop.toLowerCase().includes('orchestrator') && 
          prop !== 'orchestratorLogger' && 
          this[prop] && typeof this[prop] === 'object') {
        console.log(`[CIRCULAR REF FIX] Found potential orchestrator reference in property: ${prop}`);
        delete this[prop];
      }
    }
    
    _initPromise = _doInit(this).finally(() => { _initPromise = null; });
    return _initPromise;
  }
  
  /**
   * Build fusion prompt with neutral permissioning
   */
  buildFusionPrompt({ userInput, cseContext, agentState, budgets }) {
    return buildFusionPrompt({ userInput, cseContext, agentState, budgets });
  }

  /**
   * Main processing method - orchestrator-aware agent loop
   * @param {Object} params - Processing parameters
   * @param {string} params.userInput - User input text
   * @param {Object} params.userContext - User context
   * @param {Object} params.agentState - Current agent state
   * @returns {Promise<Object>} Processing result
   */
  async process({ userInput, userContext = {}, agentState }) {
    if (!this.initialized) await this.initialize(); // <- lazy-init
    
    // Initialize agentState if not provided
    if (!agentState) {
      agentState = {
        [SESSION_ID_KEY]: uuidv4(),
        beliefs: [],
        goals: [],
        tone: 'conversational',
        mode: 'cognitive-partner',
        metrics: {
          interactions: 0,
          memoryUpdates: 0,
          reflections: 0,
          learningEvents: 0,
          emergentDiscoveries: 0
        }
      };
    }
    
    // Safe preview function for logging
    function preview(val, max = 200) {
      if (typeof val === 'string') return val.length > max ? `${val.slice(0, max)}…` : val;
      if (val == null) return String(val);
      if (typeof val === 'object') return `[object ${val.constructor?.name || 'Object'}]`;
      return String(val);
    }
    
    // Input validation and coercion
    if (typeof userInput !== 'string') {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn('process() expected string userInput; received', { kind: typeof userInput });
      } else {
        console.warn('process() expected string userInput; received', { kind: typeof userInput });
      }
      userInput = String(userInput?.text ?? userInput ?? '');
    }
    
    // Reduce demo noise: only emit these when ALE debug is enabled
    if (_ALE_DEBUG_ON) {
      console.log('[CRITICAL AGENT LOOP DEBUG] ========== PROCESS METHOD ENTRY ==========');
      console.log('[CRITICAL AGENT LOOP DEBUG] PROCESS CALLED with userInput:', typeof userInput, preview(userInput));
      console.log('[CRITICAL AGENT LOOP DEBUG] ports available:', !!this.ports);
      console.log('[CRITICAL AGENT LOOP DEBUG] agentState sessionId:', agentState?.[SESSION_ID_KEY]);
      console.log('[CRITICAL AGENT LOOP DEBUG] this.constructor.name:', this.constructor.name);
      console.log('[CRITICAL AGENT LOOP DEBUG] ===================================================');
    }
    
    try {
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info('Starting agent loop process', {
          sessionId: agentState[SESSION_ID_KEY],
          inputLength: userInput?.length || 0
        });
      } else {
        dlog('Starting agent loop process', {
          sessionId: agentState[SESSION_ID_KEY],
          inputLength: userInput?.length || 0
        });
      }
      
      // Baseline mode support: Check if retrieval is disabled (for AVS comparison testing)
      const disableRetrieval = userContext?.disableRetrieval === true;
      const disableMemoryGraph = userContext?.disableMemoryGraph === true;
      
      if (disableRetrieval || disableMemoryGraph) {
        dlog('[BASELINE MODE] Retrieval disabled for comparison testing');
        // Skip to ACT phase with empty context
        const emptyResult = {
          input: userInput,
          userContext,
          phases: {
            observe: { input: userInput, inputAnalysis: { intent: 'general' } },
            reflect: { strategy: 'general_knowledge', contextUsed: [] },
            plan: { selectedSkill: 'llm_conversation' },
            act: null,
            update: null
          },
          llmResponse: null,
          metadata: { baselineMode: 'persistra_off', retrievalEnabled: false }
        };
        
        // Generate LLM response without memory context
        const messages = [{ role: 'user', content: userInput }];
        const llmResult = await this.ports.generateResponse(messages, { max_tokens: 3800, temperature: 0.5 });
        emptyResult.llmResponse = typeof llmResult === 'string' ? llmResult : llmResult.text;
        emptyResult.phases.act = { llmResponse: emptyResult.llmResponse };
        
        return emptyResult;
      }
      
      // Check for research query and use staged pipeline if available
      if (this.researchOrchestrator && this.researchOrchestrator.isResearchQuery && this.researchOrchestrator.isResearchQuery(userInput)) {
        if (this.logger && typeof this.logger.info === 'function') {
          this.logger.info('Research query detected, using staged pipeline', {
            query: userInput.substring(0, 100)
          });
        } else {
          dlog('Research query detected, using staged pipeline', {
            query: userInput.substring(0, 100)
          });
        }
        
        return await this.processResearchQuery(userInput, agentState);
      }
      
      // For regular queries, use the processRegularQuery method
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info('Regular query detected, using standard processing', {
          query: userInput.substring(0, 100)
        });
      } else {
        dlog('Regular query detected, using standard processing', {
          query: userInput.substring(0, 100)
        });
      }
      
      return await this.processRegularQuery(userInput, agentState);
      
      // Initialize result object
      const result = {
        input: userInput,
        userContext,
        phases: {
          observe: null,
          reflect: null,
          plan: null,
          act: null,
          update: null
        },
        cseContext: null,
        llmResponse: null,
        agentStateChanges: {},
        selectedSkill: null,
        skillInvocationResult: null,
        metadata: {
          startTime: Date.now(),
          endTime: null,
          duration: null,
          phasesExecuted: [],
          reflectionDepth: 0,
          learningEvents: [],
          skillsConsidered: [],
          skillSelected: null
        }
      };
      
      // === PHASE 1: OBSERVE ===
      // Ingest user input and log the observation
      dlog('[DEBUG] Starting OBSERVE phase...');
      const observeStartTime = Date.now();
      const observeResult = await this.observePhase(userInput, userContext, agentState);
      dlog('[DEBUG] OBSERVE phase returned, proceeding to REFLECT...');
      result.phases.observe = observeResult;
      result.phases.observe.duration = Date.now() - observeStartTime;
      dlog('[DEBUG] OBSERVE phase completed successfully');
      result.metadata.phasesExecuted.push('observe');
      this.updateLoopState('observe', result.phases.observe);
      
      // Log OBSERVE phase - temporarily disabled
      // this.orchestratorLogger.logEvent('observe', {
      //   userInput,
      //   inputAnalysis: result.phases.observe.inputAnalysis,
      //   cseContext: result.phases.observe.cseContext,
      //   specialCommands: result.phases.observe.specialCommands,
      //   duration: result.phases.observe.duration,
      //   sessionId: agentState.sessionId
      // });
      
      // === PHASE 2: REFLECT ===
      // Query memory graph for salient context using CSE for salience scoring
      if (this.config.enableReflection) {
        dlog('[DEBUG] Starting REFLECT phase...');
        const reflectStartTime = Date.now();
        result.phases.reflect = await this.reflectPhase(result.phases.observe, agentState);
        result.phases.reflect.duration = Date.now() - reflectStartTime;
        dlog('[DEBUG] REFLECT phase completed successfully');
        result.metadata.phasesExecuted.push('reflect');
        result.metadata.reflectionDepth = result.phases.reflect?.depth || 0;
        this.updateLoopState('reflect', result.phases.reflect);
        
        // Log REFLECT phase - temporarily disabled
        // this.orchestratorLogger.logEvent('reflect', {
        //   contextAnalysis: result.phases.reflect.contextAnalysis,
        //   responseStrategy: result.phases.reflect.responseStrategy,
        //   confidenceScore: result.phases.reflect.confidenceScore,
        //   depth: result.phases.reflect.depth,
        //   reflectionChain: result.phases.reflect.reflectionChain,
        //   duration: result.phases.reflect.duration,
        //   sessionId: agentState.sessionId
        // });
      }
      
      // === PHASE 3: PLAN ===
      // Determine next skill/capability to invoke from capability registry
      const planStartTime = Date.now();
      result.phases.plan = await this.planPhase(result.phases.observe, result.phases.reflect, agentState);
      result.phases.plan.duration = Date.now() - planStartTime;
      result.metadata.phasesExecuted.push('plan');
      result.selectedSkill = result.phases.plan?.selectedSkill;
      result.metadata.skillsConsidered = result.phases.plan?.skillsConsidered || [];
      result.metadata.skillSelected = result.phases.plan?.selectedSkill?.name;
      this.updateLoopState('plan', result.phases.plan);
      
      // Log PLAN phase - temporarily disabled
      // this.orchestratorLogger.logEvent('plan', {
      //   selectedSkill: result.phases.plan.selectedSkill,
      //   skillsConsidered: result.phases.plan.skillsConsidered,
      //   selectionReasoning: result.phases.plan.selectionReasoning,
      //   skillParameters: result.phases.plan.skillParameters,
      //   fallbackToLLM: result.phases.plan.fallbackToLLM,
      //   duration: result.phases.plan.duration,
      //   sessionId: agentState.sessionId
      // });
      
      // === PHASE 4: ACT ===
      // Execute the selected skill/capability
      const actStartTime = Date.now();
      result.phases.act = await this.actPhase(result.phases.observe, result.phases.plan, agentState);
      result.phases.act.duration = Date.now() - actStartTime;
      result.metadata.phasesExecuted.push('act');
      this.updateLoopState('act', result.phases.act);
      
      dlog('[POST-ACT DEBUG] ACT phase completed');
      dlog('[POST-ACT DEBUG] ACT phase keys:', Object.keys(result.phases.act || {}));
      dlog('[POST-ACT DEBUG] ACT llmResponse exists:', !!result.phases.act?.llmResponse);
      dlog('[POST-ACT DEBUG] ACT gatewayStamp exists:', !!result.phases.act?.gatewayStamp);
      dlog('[POST-ACT DEBUG] ACT gatewayStamp value:', result.phases.act?.gatewayStamp);
      dlog('[POST-ACT DEBUG] About to continue to extraction phase...');
      
      // Log ACT phase - temporarily disabled
      // this.orchestratorLogger.logEvent('act', {
      //   skillExecuted: result.phases.act.skillExecuted,
      //   skillResult: result.phases.act.skillResult,
      //   response: result.phases.act.response,
      //   type: result.phases.act.type,
      //   metadata: result.phases.act.metadata,
      //   duration: result.phases.act.duration,
      //   sessionId: agentState.sessionId
      // });
      
      // Extract main response and skill invocation result
      dlog('[EXTRACTION DEBUG] ACT phase keys:', Object.keys(result.phases.act || {}));
      dlog('[EXTRACTION DEBUG] ACT llmResponse:', result.phases.act?.llmResponse?.substring(0, 100));
      dlog('[EXTRACTION DEBUG] ACT gatewayStamp:', result.phases.act?.gatewayStamp);
      
      result.llmResponse = result.phases.act?.llmResponse;
      result.skillInvocationResult = result.phases.act?.skillResult;
      result.cseContext = result.phases.observe?.cseContext;
      result.gatewayStamp = result.phases.act?.gatewayStamp;
      result.metrics = result.phases.act?.metrics;
      
      dlog('[EXTRACTION DEBUG] Final llmResponse:', result.llmResponse?.substring(0, 100));
      dlog('[EXTRACTION DEBUG] Final gatewayStamp:', result.gatewayStamp);
      
      // === PHASE 5: UPDATE ===
      // Log results, update memory graph, adjust salience/identity as needed
      dlog('[DEBUG] About to start UPDATE phase, enableUpdate:', this.config.enableUpdate);
      if (this.config.enableUpdate) {
        const updateStartTime = Date.now();
        try {
          result.phases.update = await this.updatePhase(result, this.orchestrator, agentState);
          result.phases.update.duration = Date.now() - updateStartTime;
          result.metadata.phasesExecuted.push('update');
          result.agentStateChanges = result.phases.update?.agentStateChanges || {};
          result.metadata.learningEvents = result.phases.update?.learningEvents || [];
          this.updateLoopState('update', result.phases.update);
          dlog('[DEBUG] UPDATE phase completed successfully');
        } catch (updateError) {
          dlog('[DEBUG] UPDATE phase failed:', updateError.message);
          dlog('[DEBUG] UPDATE phase error stack:', updateError.stack);
          // Continue execution even if UPDATE fails
        }
        
        // Log UPDATE phase - temporarily disabled
        // this.orchestratorLogger.logEvent('update', {
        //   memoryUpdates: result.phases.update.memoryUpdates,
        //   agentStateChanges: result.phases.update.agentStateChanges,
        //   learningEvents: result.phases.update.learningEvents,
        //   duration: result.phases.update.duration,
        //   sessionId: agentState.sessionId
        // });
      } else {
        dlog('[DEBUG] UPDATE phase skipped (disabled)');
      }
      
      // Finalize result and bubble up LLM response
      result.metadata.endTime = Date.now();
      result.metadata.duration = result.metadata.endTime - result.metadata.startTime;
      
      dlog('[DEBUG] About to perform final extraction');
      dlog('[DEBUG] ACT phase exists:', !!result.phases?.act);
      dlog('[DEBUG] ACT phase gatewayStamp exists:', !!result.phases?.act?.gatewayStamp);
      
      // Extract LLM response and gateway stamp from any phase and bubble up to final result
      const finalLLMResponse = 
        result.phases?.observe?.llmResponse ||
        result.phases?.act?.llmResponse ||
        result.phases?.respond?.message ||
        result.llmResponse;
      
      const finalGatewayStamp = 
        result.phases?.act?.gatewayStamp ||
        result.gatewayStamp;
      
      if (finalLLMResponse) {
        result.llmResponse = finalLLMResponse;
        dlog('[DEBUG] Final LLM response set on result, length:', finalLLMResponse.length);
      } else {
        dlog('[DEBUG] No LLM response found in any phase');
      }
      
      if (finalGatewayStamp) {
        result.gatewayStamp = finalGatewayStamp;
        dlog('[DEBUG] Final gateway stamp set on result:', finalGatewayStamp);
      } else {
        dlog('[DEBUG] No gateway stamp found in any phase');
        dlog('[DEBUG] ACT phase gatewayStamp:', result.phases?.act?.gatewayStamp);
        dlog('[DEBUG] Result gatewayStamp before final extraction:', result.gatewayStamp);
      }
      
      componentLogger.info('Agent loop process completed', {
        sessionId: agentState[SESSION_ID_KEY],
        duration: result.metadata.duration,
        phasesExecuted: result.metadata.phasesExecuted,
        reflectionDepth: result.metadata.reflectionDepth,
        learningEvents: result.metadata.learningEvents
      });
      
      // Emit agent loop completion event
      eventBus.emit('agent-loop:completed', {
        sessionId: agentState[SESSION_ID_KEY],
        result,
        timestamp: Date.now()
      }, COMPONENT_NAME);
      
      return result;
      
    } catch (error) {
      dlog('[DEBUG] AGENT LOOP ERROR CAUGHT:');
      dlog('[DEBUG] Error message:', error.message);
      dlog('[DEBUG] Error stack:', error.stack);
      
      componentLogger.error('Agent loop process failed', {
        sessionId: agentState[SESSION_ID_KEY],
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }
  
  /**
   * OBSERVE Phase - Gather context and understand input
   * 
   * @param {string} userInput - User's input
   * @param {Object} userContext - User context
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Current agent state
   * @returns {Promise<Object>} Observe phase result
   */
  async observePhase(userInput, userContext, agentState) {
    try {
      dlog('[ObservePhase] STARTING observe phase for input:', userInput);
      componentLogger.debug('Executing OBSERVE phase', { sessionId: agentState[SESSION_ID_KEY] });
      
      dlog('[ObservePhase DEBUG] Raw userInput:', typeof userInput, JSON.stringify(userInput));
      
      const observeResult = {
        input: userInput,
        userContext,
        inputAnalysis: null,
        cseContext: null,
        memoryContext: null,
        specialCommands: null,
        timestamp: Date.now()
      };
      
      dlog('[ObservePhase DEBUG] observeResult.input:', typeof observeResult.input, JSON.stringify(observeResult.input));
      
      // Analyze input for special patterns
      observeResult.inputAnalysis = this.analyzeInput(userInput);
      
      // Handle special commands (remember, introspect, etc.)
      if (observeResult.inputAnalysis.isSpecialCommand) {
        observeResult.specialCommands = await this.handleSpecialCommands(
          observeResult.inputAnalysis, 
          agentState
        );
        
        // If special command was handled, return early
        if (observeResult.specialCommands?.handled) {
          return observeResult;
        }
      }
      
      // Get memory context through CSE via ports interface
      if (_ALE_DEBUG_ON) {
        dlog('[CRITICAL DEBUG] ========== MEMORY CONTEXT CALL ==========');
        dlog('[CRITICAL DEBUG] About to call ports.getSalientContext...');
        dlog('[CRITICAL DEBUG] Ports available:', !!this.ports);
        dlog('[CRITICAL DEBUG] getSalientContext type:', typeof this.ports?.getSalientContext);
        dlog('[CRITICAL DEBUG] userInput:', userInput);
        dlog('[CRITICAL DEBUG] ========================================');
      }
      
      if (!this.ports || typeof this.ports.getSalientContext !== 'function') {
        dlog('[CRITICAL DEBUG] PORTS VALIDATION FAILED!');
        throw new Error(`Invalid ports: ${typeof this.ports}, getSalientContext: ${typeof this.ports?.getSalientContext}`);
      }
      
      dlog('[CRITICAL DEBUG] PORTS VALIDATION PASSED');
      
      let rawContext;
      try {
        dlog('[CRITICAL DEBUG] CALLING ports.getSalientContext NOW...');
        
        // PHASE 3: Extract sessionId from agentState for conversation recall
        const { SESSION_ID_KEY } = require('../constants/session');
        const sessionId = agentState?.[SESSION_ID_KEY];

        // Phase 4 (ALE-v1): classify intent + scope (session vs global) deterministically
        let intent = 'knowledge_query';
        let scope = 'session';
        try {
          const classified = classifyIntentAndScope(userInput);
          intent = classified?.intent || intent;
          scope = classified?.scope || scope;

          const topicQuery = classified?.topicQuery || null;
          const cleanedQuery = classified?.cleanedQuery || null;

          // Attach to inputAnalysis for downstream stages (safe, non-breaking)
          if (observeResult && observeResult.inputAnalysis && typeof observeResult.inputAnalysis === 'object') {
            observeResult.inputAnalysis.intent = intent;
            observeResult.inputAnalysis.scope = scope;
            observeResult.inputAnalysis.intentConfidence = classified?.confidence;
            observeResult.inputAnalysis.topicQuery = topicQuery;
            observeResult.inputAnalysis.cleanedQuery = cleanedQuery;
            observeResult.inputAnalysis.recallPhrasesStripped = Array.isArray(classified?.removed) ? classified.removed : [];
          }

          // Stash on observeResult for later phases without changing user-visible input
          observeResult.topicQuery = topicQuery;
          observeResult.cleanedQuery = cleanedQuery;
        } catch (e) {
          // Never fail retrieval due to intent classification
        }

        rawContext = await this.ports.getSalientContext(userInput, {
          userContext,
          agentState,
          includeIdentity: true,
          includeCapabilities: true,
          // PHASE 3: Pass sessionId for conversation recall routing
          sessionId,
          intent,
          scope,
          // ALE-v1: Pass normalized queries for semantic retrieval
          topicQuery: observeResult.topicQuery,
          cleanedQuery: observeResult.cleanedQuery
        });
        dlog('[CRITICAL DEBUG] ports.getSalientContext COMPLETED, type:', typeof rawContext);
        dlog('[CRITICAL DEBUG] rawContext structure:', JSON.stringify(rawContext, null, 2).slice(0, 500));
        
        // A. Log memory cards after CSE returns
        const cards1 = rawContext?.fusion?.memoryCards?.length ?? 0;
        if (this.logger && typeof this.logger.info === 'function') {
          this.logger.info('[FUSION] CSE produced cards', { cards1 });
        } else {
          dlog('[FUSION] CSE produced cards', { cards1 });
        }
      } catch (memoryError) {
        dlog('[CRITICAL DEBUG] ports.getSalientContext FAILED:', memoryError.message);
        dlog('[CRITICAL DEBUG] Stack trace:', memoryError.stack);
        throw memoryError;
      }
      
      // Add consumer guards for safe array access
      dlog('[DEBUG] Processing CSE context, keys:', Object.keys(rawContext || {}));
      const cse = rawContext || {};
      const allMems = Array.isArray(cse.memories) ? cse.memories : [];
      const salient = Array.isArray(cse.salient) ? cse.salient
                     : Array.isArray(cse.salientMemories) ? cse.salientMemories
                     : [];
      
      dlog('[DEBUG] Consumer guards applied, allMems length:', allMems.length, 'salient length:', salient.length);
      
      // Extract LLM response if present
      const llmResponse = cse.llmResponse || rawContext.llmResponse;
      dlog('[DEBUG] Extracted LLM response length:', llmResponse?.length || 0);
      
      observeResult.cseContext = {
        ...cse,
        memories: allMems,
        salient: salient,
        salientMemories: salient
      };
      
      // Bubble up LLM response to observe result
      if (llmResponse) {
        observeResult.llmResponse = llmResponse;
        dlog('[DEBUG] LLM response bubbled up to observeResult');
      }
      
      dlog('[DEBUG] CSE context assigned to observeResult');
      dlog('[DEBUG] OBSERVE phase completed successfully');
      
      if (componentLogger && typeof componentLogger.debug === 'function') {
        componentLogger.debug('OBSERVE phase completed', {
          sessionId: agentState[SESSION_ID_KEY],
          hasContext: !!observeResult.cseContext,
          isSpecialCommand: observeResult.inputAnalysis.isSpecialCommand
        });
      } else {
        console.log('OBSERVE phase completed', {
          sessionId: agentState[SESSION_ID_KEY],
          hasContext: !!observeResult.cseContext,
          isSpecialCommand: observeResult.inputAnalysis.isSpecialCommand
        });
      }
      
      return observeResult;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error in OBSERVE phase', error);
      } else {
        console.error('Error in OBSERVE phase', error);
      }
      throw error;
    }
  }
  
  /**
   * REFLECT Phase - Analyze context and determine response strategy
   * 
   * @param {Object} observeResult - Result from observe phase
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Current agent state
   * @returns {Promise<Object>} Reflect phase result
   */
  async reflectPhase(observeResult, orchestrator, agentState) {
    try {
      console.log('[DEBUG] Starting REFLECT phase...');
      componentLogger.debug('Executing REFLECT phase', { sessionId: agentState[SESSION_ID_KEY] });
      
      const reflectResult = {
        contextAnalysis: null,
        responseStrategy: null,
        confidenceScore: 0,
        depth: 0,
        reflectionChain: [],
        timestamp: Date.now()
      };
      
      console.log('[DEBUG] About to call analyzeContext...');
      // Analyze the context quality and relevance
      reflectResult.contextAnalysis = this.analyzeContext(observeResult.cseContext);
      console.log('[DEBUG] analyzeContext completed');
      
      // Determine response strategy based on context
      reflectResult.responseStrategy = this.determineResponseStrategy(
        observeResult.inputAnalysis,
        reflectResult.contextAnalysis,
        agentState
      );
      
      // Calculate confidence score
      reflectResult.confidenceScore = this.calculateConfidenceScore(
        reflectResult.contextAnalysis,
        reflectResult.responseStrategy
      );
      
      // Perform deeper reflection if needed
      if (reflectResult.confidenceScore < this.config.reflectionThreshold && 
          this.loopState.reflectionDepth < this.config.maxReflectionDepth) {
        
        reflectResult.depth = await this.deepReflection(
          observeResult,
          reflectResult,
          orchestrator,
          agentState
        );
      }
      
      componentLogger.debug('REFLECT phase completed', {
        sessionId: agentState[SESSION_ID_KEY],
        strategy: reflectResult.responseStrategy?.type,
        confidence: reflectResult.confidenceScore,
        depth: reflectResult.depth
      });
      
      return reflectResult;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error in REFLECT phase', error);
      } else {
        console.error('Error in REFLECT phase', error);
      }
      throw error;
    }
  }
  
  /**
   * PLAN Phase - Determine next skill/capability to invoke
   * 
   * This phase selects the most appropriate skill/capability from the capability registry
   * based on the user input, context analysis, and response strategy.
   * 
   * @param {Object} observeResult - Result from observe phase
   * @param {Object} reflectResult - Result from reflect phase
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Current agent state
   * @returns {Promise<Object>} Plan phase result
   */
  async planPhase(observeResult, reflectResult, orchestrator, agentState) {
    try {
      componentLogger.debug('Executing PLAN phase', { sessionId: agentState[SESSION_ID_KEY] });
      
      const planResult = {
        selectedSkill: null,
        skillsConsidered: [],
        selectionReasoning: null,
        skillParameters: {},
        fallbackToLLM: false,
        timestamp: Date.now()
      };
      
      // Use orchestration layer if available, otherwise fallback to legacy method
      if (this.orchestrationLayer) {
        if (this.logger && typeof this.logger.debug === 'function') {
          this.logger.debug('Using orchestration layer for skill planning');
        } else {
          console.log('Using orchestration layer for skill planning');
        }
        
        // Prepare input for orchestration layer
        const orchestrationInput = {
          userInput: observeResult.input,
          inputAnalysis: observeResult.inputAnalysis,
          cseContext: observeResult.cseContext
        };
        
        const orchestrationContext = {
          sessionId: agentState[SESSION_ID_KEY],
          reflectionResult: reflectResult,
          agentState
        };
        
        // Use orchestration layer for skill discovery and selection
        let availableSkills;
        try {
          const skillsResult = await this.orchestrationLayer.discoverSkills(orchestrationInput, orchestrationContext);
          
          // Handle both array and object returns gracefully (your exact pattern)
          const skillList = Array.isArray(skillsResult) ? skillsResult : (skillsResult?.skills || []);
          if (!Array.isArray(skillList)) {
            console.warn('[OrchestratorAgentLoop] Skill discovery contract violated - got:', typeof skillsResult);
            console.warn('[OrchestratorAgentLoop] Skills unavailable; proceeding with retrieval-only context.');
            availableSkills = [];
          } else {
            availableSkills = skillList;
          }
        } catch (skillError) {
          console.warn('[OrchestratorAgentLoop] Skill discovery failed:', skillError.message);
          console.warn('[OrchestratorAgentLoop] Skills unavailable; proceeding with retrieval-only context.');
          availableSkills = [];
        }
        
        planResult.skillsConsidered = availableSkills.map(skill => ({
          name: skill.name,
          type: skill.type,
          category: skill.category,
          confidence: skill.confidence,
          priority: skill.priority
        }));
        
        // Select skill using orchestration strategy
        const skillSelection = this.orchestrationLayer.selectSkill(
          availableSkills,
          this.orchestrationLayer.strategy.getSkillSelectionConfig(),
          orchestrationContext
        );
        
        planResult.selectedSkill = {
          name: skillSelection.skill.name,
          type: skillSelection.skill.type,
          category: skillSelection.skill.category,
          description: skillSelection.skill.description,
          confidence: skillSelection.skill.confidence,
          parameters: skillSelection.parameters
        };
        
        planResult.skillParameters = skillSelection.parameters;
        planResult.selectionReasoning = {
          reason: skillSelection.selectionReason,
          confidence: skillSelection.skill.confidence,
          strategy: this.orchestrationLayer.strategy.currentStrategy
        };
        planResult.fallbackToLLM = skillSelection.fallback;
        
      } else {
        if (this.logger && typeof this.logger.debug === 'function') {
          this.logger.debug('Using legacy skill planning method');
        } else {
          console.log('Using legacy skill planning method');
        }
        
        // Legacy method - Get available skills/capabilities from orchestrator
        const availableSkills = await this.getAvailableSkills(orchestrator);
        planResult.skillsConsidered = availableSkills.map(skill => ({
          name: skill.name,
          type: skill.type,
          confidence: 0
        }));
        
        // Select the most appropriate skill based on input and context
        planResult.selectedSkill = await this.selectSkill(
          observeResult.input,
          observeResult.inputAnalysis,
          observeResult.cseContext,
          reflectResult,
          availableSkills,
          agentState
        );
        
        // If no specific skill selected, default to LLM conversation
        if (!planResult.selectedSkill) {
          planResult.selectedSkill = {
            name: 'llm_conversation',
            type: 'cognitive',
            description: 'Generate conversational response using LLM with memory context',
            confidence: 0.8,
            parameters: {
              useMemoryContext: true,
              useCSEContext: true,
              responseStrategy: reflectResult?.responseStrategy
            }
          };
          planResult.fallbackToLLM = true;
        }
        
        // Prepare skill parameters
        planResult.skillParameters = this.prepareSkillParameters(
          planResult.selectedSkill,
          observeResult,
          reflectResult,
          agentState
        );
        
        // Generate selection reasoning
        planResult.selectionReasoning = this.generateSelectionReasoning(
          planResult.selectedSkill,
          observeResult.inputAnalysis,
          reflectResult?.responseStrategy
        );
      }
      
      componentLogger.debug('PLAN phase completed', {
        sessionId: agentState[SESSION_ID_KEY],
        selectedSkill: planResult.selectedSkill.name,
        skillType: planResult.selectedSkill.type,
        confidence: planResult.selectedSkill.confidence,
        skillsConsidered: planResult.skillsConsidered.length
      });
      
      return planResult;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error in PLAN phase', error);
      } else {
        console.error('Error in PLAN phase', error);
      }
      throw error;
    }
  }
  
  /**
   * ACT Phase - Execute the selected skill/capability
   * 
   * @param {Object} observeResult - Result from observe phase
   * @param {Object} reflectResult - Result from reflect phase
   * @param {Object} planResult - Result from plan phase
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Current agent state
   * @returns {Promise<Object>} Act phase result
   */
  async actPhase(observeResult, reflectResult, planResult, agentState) {
    try {
      dlog('[ACT PHASE START] Beginning ACT phase execution');
      componentLogger.debug('Executing ACT phase', { sessionId: agentState[SESSION_ID_KEY] });
      
      // Handle special commands first
      if (observeResult.specialCommands?.handled) {
        return {
          response: observeResult.specialCommands.response,
          type: 'special_command',
          metadata: observeResult.specialCommands,
          timestamp: Date.now()
        };
      }
      
      const actResult = {
        response: null,
        skillResult: null,
        type: 'skill_execution',
        prompt: null,
        skillExecuted: planResult?.selectedSkill?.name,
        metadata: {
          strategy: reflectResult?.responseStrategy,
          confidence: reflectResult?.confidenceScore,
          contextUsed: !!observeResult.cseContext,
          skillType: planResult?.selectedSkill?.type,
          skillParameters: planResult?.skillParameters
        },
        timestamp: Date.now()
      };
      
      // Bulletproof fusion extraction with multiple property paths
      function getFusionEnvelope(observeResult, result) {
        // accept old and new shapes, multiple attachment points
        const c0 = observeResult?.cseContext;
        const c1 = result?.metadata;
        const cand = c0?.fusion || c1?.fusion || c0 || c1 || {};
        // normalize property names
        const cards =
          cand.memoryCards ||
          cand.cards ||
          cand.items ||
          [];
        return {
          memoryCards: Array.isArray(cards) ? cards : [],
          avgSalience: Number(cand.avgSalience ?? cand.salience ?? 0) || 0,
          memoryWeight: Number(cand.memoryWeight ?? 0) || 0,
          generalWeight: Number(cand.generalWeight ?? (1 - (Number(cand.memoryWeight||0)))) || 0,
          routingHint: cand.routingHint || '',
          rationale: cand.rationale || ''
        };
      }

      // Safe token estimator with minimum attachment floor
      function safeEstimateTokens(text) {
        if (!text) return 0;
        try {
          const len = typeof text === 'string' ? text.length : JSON.stringify(text).length;
          // ~4 chars/token heuristic with floor
          return Math.max(1, Math.ceil(len / 4));
        } catch { return 50; }
      }

      function formatCard(card, idx) {
        const title = card.title || card.metadata?.title || `Memory ${idx+1}`;
        let snippet = card.snippet || card.content || '';
        
        // CRITICAL: Strip raw MEMORY_SNIPPET formatting from prompt content
        if (snippet.includes('MEMORY_SNIPPET')) {
          console.log('[PROMPT SANITIZATION] Stripping MEMORY_SNIPPET from card content');
          snippet = snippet
            .replace(/^\*\*?\[?MEMORY_SNIPPET[^\n]*\n?/gmi, '')
            .replace(/^\s*Salience:\s*[0-9.]+\s*$/gmi, '')
            .replace(/^\s*Summary:\s*/gmi, '')
            .trim();
        }
        
        const source = card.source || card.metadata?.source || '';
        const sal = (Number(card.salience)||0).toFixed(2);
        return `• Project Memory: ${title} (relevance:${sal}${source ? `, source:${source}`:''})\n  ${snippet}`;
      }

      function fitCardsToBudget(cards, budgetTokens, maxCards = 12, minCards = 1) {
        const picked = [];
        let used = 0;

        for (const c of cards.slice(0, maxCards)) {
          const t = safeEstimateTokens(formatCard(c, picked.length));
          if (t <= 0 || !Number.isFinite(t)) continue;

          if (used + t > budgetTokens) continue;   // skip but keep trying others
          picked.push({ card: c, tokens: t });
          used += t;
        }

        // If we failed to include any but we DO have cards, force-include the first N tiny versions
        if (!picked.length && cards.length) {
          const tiny = cards.slice(0, Math.max(minCards, Math.min(3, cards.length)))
            .map((c, i) => ({ card: c, tokens: 50, isTiny: true }));
          return { picked: tiny, tokensUsed: tiny.reduce((s,x)=>s+x.tokens,0), forced: true };
        }
        return { picked, tokensUsed: used, forced: false };
      }

      function synthesizeFromCards(cards, userInput) {
        // Block local synthesis with environment variable
        if (process.env.LPAC_DISABLE_LOCAL_SYNTH === '1') {
          throw new Error('Local synthesis disabled: use LLM gateway');
        }
        console.log('[FALLBACK SYNTHESIS] WARNING: synthesizeFromCards called - this should be blocked!');
        throw new Error('BLOCKED: Local synthesis fallback forbidden - LLM gateway must be used');
      }

      // Extract fusion envelope once at start of ACT
      const fusion = getFusionEnvelope(observeResult, actResult);
      actResult.metadata = { ...(actResult.metadata||{}), fusion };

      const MAX_TOK = 4000;        // Claude Haiku max output tokens (4096 limit)
      const SYS_BUDGET = 600;      // system policy text
      const USER_BUDGET = 1000;    // user request  
      const CONTEXT_BUDGET = Math.max(500, MAX_TOK - SYS_BUDGET - USER_BUDGET);

      // sort by salience desc
      const sorted = [...fusion.memoryCards].sort((a,b)=> (b.salience||0)-(a.salience||0));

      // fit to budget
      const { picked, tokensUsed, forced } = fitCardsToBudget(sorted, CONTEXT_BUDGET, 12, 1);

      // Build fusion pack - compressed, diverse facts instead of raw memory
      const { buildFusionPack, renderFusionFactsBlock } = require('../fusion/fusionPack');
      const { fusionCoverage, getGKAllowance, getDecisionMode } = require('../fusion/fusionCoverage');
      
      // Phase 2C: Adaptive diversity based on query type
      const { detectQueryType } = require('../fusion/fusionCoverage');
      const queryType = detectQueryType(observeResult?.input || '');
      
      // Deep queries (factual, definition) need focused context (lower diversity)
      // Broad queries (comparison, analysis) need diverse context (higher diversity)
      const diversityMap = {
        'factual': 0.5,      // Focus on specific facts
        'definition': 0.6,   // Focused but allow some breadth
        'analysis': 0.8,     // Need diverse perspectives
        'comparison': 0.8,   // Need diverse sources for comparison
        'general': 0.7       // Balanced default
      };
      const adaptiveDiversity = diversityMap[queryType] || 0.7;
      
      const fusionPack = buildFusionPack(picked.map(p => p.card), { 
        k: 20,              // Phase 1: Increased from 14 to allow more relevant memories
        maxCharsPerFact: 400,  // WEEK 2: Increased from 280 to preserve unique identifiers (DR-014, Q7F3)
        diversity: adaptiveDiversity  // Phase 2C: Query-adaptive diversity
      });
      const factsBlock = renderFusionFactsBlock(fusionPack);
      
      // Calculate coverage and determine GK allowance (query-aware - Phase 2)
      const coverage = fusionCoverage(fusionPack);
      const query = observeResult?.input || '';
      const gkAllowance = getGKAllowance(coverage, query);
      const decisionMode = getDecisionMode(coverage);
      
      console.log(`[Fusion Coverage] score=${coverage.toFixed(2)}, mode=${decisionMode}, gkAllowance=${gkAllowance}`);

      // Anti-generic system prompts with controlled GK allowance
      const BUDGET = 3500;
      const antiGeneric = `
Rules: Avoid textbook preambles or vague statements. Lead with specifics.
Use retrieved evidence first. If necessary, you MAY add up to ${gkAllowance} concise
supplemental items from general knowledge; mark each with [GK]. No more.
Each [GK] must name a concrete term, metric, or proper noun.
Do NOT refer to the retrieved block as “FACTS” or write phrases like “The FACTS indicate…”.
`.trim();

      const gkQuality = `
When adding [GK], favor:
- named algorithms/libraries (e.g., Clifford group, Qiskit, Lindblad),
- metrics/benchmarks (fidelity %, error rates, dataset names),
- standards or well-known protocols.
Avoid generic definitions or history.
`.trim();

      const systemHeader = `You have a ${BUDGET}-token budget. Allocate ≈10% setup, 70% memory-grounded specifics, 20% confidence+next steps.`;
      
      const structure = `
STRUCTURE:
1) Specific, differentiating points (use memory facts; cite (ID:xxx); include numbers/names)
2) Implications for the question (mechanism or why-it-matters)
3) Confidence: choose ONE of {low|med|high} (do NOT output multiple/conflicting confidences). If confidence is high, do NOT add a second confidence later; you may still add “Next retrievals (optional)” if helpful.
4) Expanded explanation (ONLY if the user explicitly asks to explain/teach or uses educational phrasing like “explain”, “help me understand”, “walk me through”). Keep it to 4–8 sentences. Do NOT include rubric labels like FACTS/CONFIDENCE/NEXT_RETRIEVALS.
EVIDENCE (retrieved context):
${factsBlock}
`.trim();
      // Note: Grounding/expansion block moved to after llmResponse is assigned (see line ~1681)
      
      const baseSystemMsg = antiGeneric;
      
      // Policy pack injection based on decision signals
      const policyPacks = require('./policyPacks');
      const sessionContext = { 
        audience: process.env.LPAC_INVESTOR_MODE === '1' ? 'investor' : 'general' 
      };
      const policyResult = policyPacks.injectPolicyPacks(fusion, picked.map(p => p.card), sessionContext);
      
      // Log policy application for transparency
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info('POLICY_PACKS_APPLIED', {
          appliedPacks: policyResult.appliedPacks,
          tokensUsed: policyResult.tokensUsed,
          totalAvailable: policyResult.totalAvailable
        });
      }

      // Build messages with fusion pack facts and GK guidance
      const messages = fusionPack.length > 0 ? [
        { role: 'system', content: baseSystemMsg },
        { role: 'system', content: gkQuality },
        { role: 'system', content: systemHeader },
        { role: 'system', content: structure },
        ...policyResult.messages,
        { role: 'user', content: observeResult.input }
      ] : [
        { role: 'system', content: baseSystemMsg },
        ...policyResult.messages,
        { role: 'user', content: observeResult.input }
      ];
      
      // Store policy metadata for metrics
      actResult.metadata = { 
        ...(actResult.metadata || {}), 
        policyPacks: policyResult.appliedPacks,
        policyTokens: policyResult.tokensUsed
      };

      // log *after* fitting
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info('ACT.attachMemory', {
          available: fusion.memoryCards?.length || 0,
          attached: picked.length,
          tokensUsed, maxTok: MAX_TOK,
          contextBudget: CONTEXT_BUDGET
        });
      } else {
        console.log('ACT.attachMemory', {
          available: fusion.memoryCards?.length || 0,
          attached: picked.length,
          tokensUsed, maxTok: MAX_TOK,
          contextBudget: CONTEXT_BUDGET
        });
      }

      // expose to UI & process feed
      fusion.memoryCardsAttached = picked.length;
      fusion.memoryCardsAttachedIds = picked.map(p => p.card.id || p.card.key);
      fusion.contextTokensUsed = tokensUsed;

      // Generate LLM response with proper error handling and fallback
      dlog('[ActPhase] Using ports.generateResponse for LLM generation');
      dlog('[ActPhase] Generating LLM response via ports interface');
      dlog('[DEBUG] Fusion pack facts being sent to LLM:', factsBlock.substring(0, 500) + '...');
      
      // OPTION A: Bypass agent loop message construction and use Phase 1 orchestrator prompts
      const USE_ORCH_PROMPTS = process.env.USE_ORCH_PROMPTS !== 'false'; // Default to true
      
      let llmResponse;
      let gatewayStamp;
      let usePhase1 = USE_ORCH_PROMPTS; // Mutable flag for fallback control
      
      if (usePhase1) {
        dlog('[ActPhase] ✅ Using orchestrator Phase 1 prompts (bypass agent loop messages)');
        
        try {
          // Convert fusion pack to context array for orchestrator
          const contextArray = fusionPack.map(f => ({
            content: f.fact || f.text || '',
            source: f.source || '',
            id: f.id || '',
            salience: f.salience || 0
          }));
          
          // Call orchestrator's generateLLMResponse directly (Phase 1 path)
          const strategy = contextArray.length > 0 ? 'memory_informed' : 'general_knowledge';
          dlog('[ActPhase] Calling orchestrator.generateLLMResponse:', {
            query: observeResult.input.substring(0, 100),
            contextLength: contextArray.length,
            strategy
          });
          
          // Access orchestrator through ports (it's available via closure in factory)
          if (this.ports.getOrchestrator && typeof this.ports.getOrchestrator === 'function') {
            const orchestrator = this.ports.getOrchestrator();
            llmResponse = await orchestrator.generateLLMResponse({
              query: observeResult.input,
              context: contextArray,
              strategy
            });
            
            // Create gateway stamp for consistency
            gatewayStamp = {
              gateway: 'orchestrator-phase1',
              callCount: 1,
              timestamp: Date.now()
            };
            
            dlog('[ActPhase] ✅ Phase 1 response received, length:', llmResponse?.length);
          } else {
            throw new Error('Orchestrator not available via ports');
          }
        } catch (error) {
          console.error('[ActPhase] ❌ Phase 1 path failed:', error.message);
          dlog('[ActPhase] Falling back to legacy message-based path');
          // Fall through to legacy path below
          usePhase1 = false; // Force fallback
        }
      }
      
      // LEGACY PATH: Original message-based approach
      if (!usePhase1 || !llmResponse) {
        dlog('[ActPhase] Using legacy message-based path');
        
        // Pass fusion pack as salientMemories so orchestrator.generateLLMResponse can use Phase 1 prompts
        const opts = { 
          max_tokens: 3800, 
          temperature: 0.5, 
          top_p: 0.9, 
          stream: false,
          salientMemories: fusionPack.map(f => ({
            content: f.fact,
            source: f.source,
            id: f.id
          }))
        };
        dlog('[ActPhase] LLM CALL', { opts, salientMemoriesCount: opts.salientMemories.length });

        try {
          console.log('[ActPhase DEBUG] this.ports type:', typeof this.ports);
          console.log('[ActPhase DEBUG] this.ports.generateResponse type:', typeof this.ports?.generateResponse);
          console.log('[ActPhase DEBUG] this.ports keys:', this.ports ? Object.keys(this.ports).slice(0, 10) : []);
          
          const llmResult = await this.ports.generateResponse(messages, opts);
          
          // STAMP VALIDATION: Ensure response came through gateway with proper stamp
          if (typeof llmResult === 'object' && llmResult.__lpacStamp) {
            dlog('[ORCHESTRATOR] Gateway stamp validated:', llmResult.__lpacStamp.gateway, 'call:', llmResult.__lpacStamp.callCount);
            llmResponse = llmResult.text;
            gatewayStamp = llmResult.__lpacStamp;
          } else if (typeof llmResult === 'string') {
            // Legacy response format - should not happen with new gateway
            console.error('[ORCHESTRATOR] WARNING: LLM response missing gateway stamp!');
            throw new Error('LLM response missing gateway stamp - local synthesis forbidden');
          } else {
            throw new Error('Invalid LLM response format from gateway');
          }
          
          dlog('[ORCHESTRATOR DEBUG] LLM response received:', llmResponse?.substring(0, 200));

        } catch (e) {
          console.error('[ActPhase] LLM generation failed:', e.message);
          if (this.logger && typeof this.logger.error === 'function') {
            this.logger.error('LLM.generate failed', { message: e.message, code: e.code });
          }
          
          // Even on error, preserve gateway stamp if available
          const llmResult = e.llmResult || {};
          if (llmResult.__lpacStamp) {
            gatewayStamp = llmResult.__lpacStamp;
            dlog('[ORCHESTRATOR] Gateway stamp preserved from error response:', gatewayStamp);
          }
          
          // Create error response but preserve gateway validation
          llmResponse = `[ClaudeLLMClient] Claude API error: ${e.message}`;
        }
      }
      
      // Validation: ensure we have a response
      if (!llmResponse || typeof llmResponse !== 'string') {
        throw new Error('Guard: ACT produced no llmResponse - local synthesis forbidden');
      }

      // === ALE-v1 Pilot Output Hygiene (single integration point) ===
      // Hide internal rubric labels (FACTS/CONFIDENCE/NEXT_RETRIEVALS) from end-users by default.
      // Enable user-facing diagnostics by setting: LEO_ALE_DIAGNOSTICS=true
      const aleDiagnosticsOn = String(process.env.LEO_ALE_DIAGNOSTICS || '').toLowerCase() === 'true';

      function _stripInternalLabels(text) {
        let out = String(text || '');
        const removed = [];

        // 1) Remove the specific confusing lead-in phrasing
        // e.g., "The FACTS indicate that ..." / "FACTS:" etc.
        if (/\bthe\s+facts\s+indicate\b/i.test(out)) {
          out = out.replace(/\bthe\s+facts\s+indicate\b\s*/gi, '');
          removed.push('the_facts_indicate');
        }
        if (/^\s*facts\s*:\s*\n?/gmi.test(out)) {
          out = out.replace(/^\s*facts\s*:\s*\n?/gmi, '');
          removed.push('facts_label');
        }

        // 2) Remove user-confusing diagnostic blocks/lines by default
        // Remove CONFIDENCE labels (both standalone lines and end-of-line occurrences)
        if (/\bconfidence\s*:\s*/i.test(out)) {
          // Match either: start of line OR after whitespace/punctuation
          out = out.replace(/(?:^|[\s\(\[\{\-—,:;\.])confidence\s*:\s*[^\s\n]+/gmi, ' ').replace(/\s{2,}/g, ' ').trim();
          removed.push('confidence_lines');
        }

        // Remove NEXT_RETRIEVALS / "Next Retrievals" sections (and any immediate wrapped lines)
        if (/\bnext[_\s]retrievals\s*[:\(]/i.test(out)) {
          // Match both standalone lines and end-of-line occurrences
          out = out
            .replace(/(?:^|\s+)next[_\s]retrievals\s*[:\(].*(?:\n\s*\(.*\)\s*.*)*$/gmi, '')
            .trim();
          removed.push('next_retrievals_block');
        }

        // Clean up excessive blank lines left by removals
        out = out.replace(/\n{3,}/g, '\n\n').trim();

        return { out, removed };
      }

      // By default, sanitize end-user output. Diagnostics remain available via env flag.
      if (!aleDiagnosticsOn) {
        const cleaned = _stripInternalLabels(llmResponse);
        llmResponse = cleaned.out;
      } else {
        const cleaned = _stripInternalLabels(llmResponse);
        if (cleaned.removed.length > 0) {
          console.log('[ALE_DIAGNOSTICS] Output hygiene would remove:', cleaned.removed);
        } else {
          console.log('[ALE_DIAGNOSTICS] Output hygiene: no removals needed');
        }
      }
      // === End ALE-v1 Pilot Output Hygiene ===

      // === Pilot UX polish (grounding marker + controlled expansion) ===
      // IMPORTANT: Must run AFTER llmResponse exists and AFTER hygiene.
      try {
        llmResponse = _applyPilotUXPolish({
          text: llmResponse,
          userInput: observeResult?.input,
          intent: observeResult?.inputAnalysis?.intent,
          memoryUsedCount: Number(picked?.length || 0),
          avgSalience: Number(fusion?.avgSalience || 0)
        });
      } catch (e) {
        // Never let pilot polish break the pipeline
        dwarn('[PilotUXPolish] Skipped due to error:', e?.message || e);
      }
      // === End Pilot UX polish ===

      // === Week 3 Policy Enforcement (single control point) ===
      // Order: LLM → hygiene → pilot polish → PolicyEnforcer → PermissionController.emit_response → return
      const policyEnforcementEnabled = process.env.LEO_POLICY_ENFORCEMENT === 'true';
      
      console.log('[POLICY] Enforcement enabled:', policyEnforcementEnabled);
      
      if (policyEnforcementEnabled) {
        try {
          const PolicyEnforcer = require('../security/policyEnforcer');
          const enforcer = new PolicyEnforcer(this.logger);
          
          // Extract policy constraints from userContext or retrieved memories
          const userContext = observeResult?.userContext || {};
          let policies = userContext?.policies || {};
          
          // If no explicit policies in userContext, extract from retrieved memory context (fallback)
          if (Object.keys(policies).length === 0 && fusion?.memoryCards) {
            const memoryContent = fusion.memoryCards
              .map(card => card.content || '')
              .join(' ')
              .toLowerCase();
            
            // Extract forbidden technologies from memory (AWS, cloud, etc.)
            if (memoryContent.includes('aws') && memoryContent.includes('forbidden')) {
              policies.forbidden_tech = policies.forbidden_tech || [];
              if (!policies.forbidden_tech.includes('AWS')) policies.forbidden_tech.push('AWS');
              if (!policies.forbidden_tech.includes('cloud')) policies.forbidden_tech.push('cloud');
            }
            
            // Extract budget cap from memory
            const budgetMatch = memoryContent.match(/budget cap.*?\$?(\d+,?\d*)/i);
            if (budgetMatch) {
              policies.budget_cap = parseInt(budgetMatch[1].replace(',', ''));
            }
          }
          
          console.log('[POLICY] emit_response check invoked, sessionId:', agentState[SESSION_ID_KEY]);
          console.log('[POLICY] Policies to check:', Object.keys(policies).length > 0 ? Object.keys(policies) : 'NONE');
          console.log('[POLICY] Extracted policies:', JSON.stringify(policies));
          console.log('[POLICY] Response to check (first 200 chars):', llmResponse.substring(0, 200));
          
          // Check response against policies
          const check = enforcer.checkResponse(llmResponse, {
            estimatedTokens: Math.ceil(llmResponse.length / 4), // Rough token estimate
            policies,
            audience: userContext?.audience,
            mode: userContext?.mode,
            sessionId: agentState[SESSION_ID_KEY]
          });
          
          console.log('[POLICY] PolicyEnforcer check result:', JSON.stringify({
            allowed: check.allowed,
            violationCount: check.violationCount,
            violations: check.violations
          }));

          // Ask PermissionController for a structured decision (no log re-parsing)
          const decisionResult = PermissionController.checkPermission('emit_response', {
            returnDecision: true,
            violations: Array.isArray(check?.violations) ? check.violations : [],
            violationCount: Number(check?.violationCount || 0),
            audience: userContext?.audience,
            mode: userContext?.mode,
            sessionId: agentState[SESSION_ID_KEY]
          });

          // Back-compat: PermissionController may return boolean OR a structured decision
          const allowed = (typeof decisionResult === 'boolean')
            ? decisionResult
            : !!decisionResult?.allowed;

          const effectiveViolations = (typeof decisionResult === 'object' && decisionResult)
            ? (decisionResult.violations || [])
            : (Array.isArray(check?.violations) ? check.violations : []);

          const violationTypesArr = [...new Set((effectiveViolations || []).map(v => v?.type).filter(Boolean))];
          const violationTypes = violationTypesArr.join(', ');

          // Attach structured decision metadata for upstream/UI (no log parsing)
          actResult.metadata = {
            ...(actResult.metadata || {}),
            policyBlocked: !allowed,
            policyDecision: allowed ? 'ALLOW' : 'DENY',
            violationTypes: violationTypesArr,
            policyViolations: effectiveViolations,
            policyViolationCount: (effectiveViolations || []).length
          };
          
          console.log('[POLICY] actResult.metadata after setting:', JSON.stringify({
            policyBlocked: actResult.metadata.policyBlocked,
            policyDecision: actResult.metadata.policyDecision,
            violationTypes: actResult.metadata.violationTypes
          }));

          if (!allowed) {
            // DENY: Replace with enterprise-clean block message
            llmResponse = `This response violates policy constraints (${violationTypes || 'policy'}). ` +
              `Please provide a compliant alternative that adheres to the established requirements.`;

            dlog('[PolicyEnforcer] Response DENIED:', {
              violations: (effectiveViolations || []).length,
              types: violationTypes
            });
          } else if ((effectiveViolations || []).length > 0) {
            // ALLOW with warnings (medium severity)
            dlog('[PolicyEnforcer] Response ALLOWED with warnings:', {
              violations: (effectiveViolations || []).length,
              types: violationTypes
            });
          } else {
            dlog('[PolicyEnforcer] Response ALLOWED (no violations)');
          }
        } catch (error) {
          dwarn('[PolicyEnforcer] Enforcement check failed, allowing response:', error.message);
          // Attach a safe flag so callers can see enforcement errored (optional)
          actResult.metadata = {
            ...(actResult.metadata || {}),
            policyEnforcementError: true,
            policyEnforcementErrorMessage: String(error?.message || error)
          };
        }
      }
      // === End Policy Enforcement ===

      // Compute cognitive metrics for UI
      const metrics = {
        avgSalience: Number(fusion.avgSalience ?? 0),
        memoryWeight: Number(fusion.memoryWeight ?? 0),
        memoryCards: Array.isArray(fusion.memoryCards) ? fusion.memoryCards.length : 0,
        decisionMode: routingHintToDecisionMode(fusion.routingHint),
        tokenBudget: Number(MAX_TOK ?? 0),
      };

      // CRITICAL: Set response fields AFTER policy enforcement so policy-blocked responses are captured
      actResult.skillResult = {
        response: llmResponse,
        type: 'fusion_response',
        routing: {
          avgSalience: fusion.avgSalience,
          memoryWeight: fusion.memoryWeight,
          generalWeight: fusion.generalWeight,
          memoryCards: fusion.memoryCards.length,
          adaptiveTokens: MAX_TOK
        }
      };
      actResult.response = llmResponse;
      actResult.type = 'fusion_response';
      actResult.llmResponse = llmResponse;
      actResult.gatewayStamp = gatewayStamp;
      actResult.metrics = metrics;
      
      dlog('[ACT PHASE DEBUG] Setting actResult properties:');
      dlog('[ACT PHASE DEBUG] llmResponse exists:', !!llmResponse);
      dlog('[ACT PHASE DEBUG] gatewayStamp exists:', !!gatewayStamp);
      dlog('[ACT PHASE DEBUG] gatewayStamp value:', gatewayStamp);
      dlog('[ACT PHASE DEBUG] actResult keys after assignment:', Object.keys(actResult));

      if (planResult.selectedSkill?.name === 'llm_conversation') {
        // Fallback to structured reasoning for comparative queries
        const queryPack = this.analyzeQueryIntent(observeResult.input);
        
        if (queryPack.intent === 'COMPARE' || queryPack.intent === 'ANALYZE') {
          actResult.skillResult = await this.executeStructuredReasoning(
            queryPack,
            observeResult,
            planResult,
            orchestrator,
            agentState
          );
        } else {
          // Execute the selected skill/capability normally
          // Extract memories from fusion context for skill compatibility
          const memories = observeResult.cseContext?.memories || 
                          observeResult.cseContext?.salientMemories || 
                          [];
          
          actResult.skillResult = await this.invokeSkill(
            planResult.selectedSkill,
            planResult.skillParameters,
            {
              userInput: observeResult.input,
              memories: memories,
              context: observeResult.cseContext,
              fusionContext: observeResult.cseContext, // Pass full fusion context
              agentState,
              orchestrator // Keep orchestrator for skill execution but prevent circular reference in result
            }
          );
        }
      }
      
      // Extract response from skill result
      actResult.response = actResult.skillResult?.response || actResult.skillResult?.output || 'Skill executed successfully';
      actResult.type = actResult.skillResult?.type || 'skill_execution';
      
      componentLogger.debug('ACT phase completed', {
        sessionId: agentState[SESSION_ID_KEY],
        responseLength: actResult.response?.length || 0,
        strategy: actResult.metadata.strategy?.type
      });
      
      dlog('[ACT PHASE END] Returning actResult with keys:', Object.keys(actResult));
      dlog('[ACT PHASE END] gatewayStamp in return value:', !!actResult.gatewayStamp);
      dlog('[ACT PHASE END] gatewayStamp value:', actResult.gatewayStamp);
      
      return actResult;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error in ACT phase', error);
      } else {
        console.error('Error in ACT phase', error);
      }
      throw error;
    }
  }
  
  /**
   * UPDATE Phase - Update memory and agent state
   * 
   * @param {Object} result - Complete agent loop result so far
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Current agent state
   * @returns {Promise<Object>} Update phase result
   */
  async updatePhase(result, orchestrator, agentState) {
    try {
      componentLogger.debug('Executing UPDATE phase', { sessionId: agentState[SESSION_ID_KEY] });
      
      const updateResult = {
        memoryUpdates: [],
        agentStateChanges: {},
        learningEvents: []
      };
      
      // ARCHITECTURAL FIX: Store conversation summaries (decoupled from contextProcessor)
      // Conversation summaries are first-class memory, not dependent on awareness
      if (orchestrator && orchestrator.memoryGraph && result.phases?.observe?.input && result.response) {
        try {
          const conversationSummary = this.generateConversationSummary(
            result.phases.observe.input,
            result.response,
            result.phases.observe.cseContext
          );
          
          if (conversationSummary) {
            const summaryEmbedding = await trueSemanticEmbeddings.generate(conversationSummary);
            const eventTimestamp = Date.now();
            const sessionId = agentState[SESSION_ID_KEY] || `session_${eventTimestamp}`;
            const messageId = `msg_${eventTimestamp}`;
            
            await orchestrator.memoryGraph.addMemory(conversationSummary, {
              type: 'conversation_summary',
              source: 'orchestrator_agent_loop',
              embedding: summaryEmbedding,
              originalInteraction: {
                userInput: result.phases.observe.input.substring(0, 100),
                response: result.response.substring(0, 100)
              },
              // PROPER CONVERSATION PROVENANCE
              metadata: {
                source_kind: 'conversation',
                source_id: `conv:${sessionId}/msg:${messageId}`,
                chunk_type: 'conversation_event',
                timestamp: eventTimestamp,
                ingested_at: Date.now(),
                timestamp_source: 'conversation_event_time',
                conversation_timestamp: eventTimestamp,
                message_timestamp: eventTimestamp,
                session_id: sessionId,
                message_id: messageId
              }
            });
            
            updateResult.memoryUpdates.push({
              type: 'conversation_summary',
              status: 'stored',
              messageId: messageId
            });
            
            componentLogger.info('Stored conversation summary in memory graph', {
              sessionId: sessionId,
              messageId: messageId
            });
          }
        } catch (summaryError) {
          componentLogger.warn('Failed to store conversation summary', summaryError);
        }
      }
      
      // Record learning events
      updateResult.learningEvents = this.identifyLearningEvents(result, agentState);
      
      componentLogger.debug('UPDATE phase completed', {
        sessionId: agentState[SESSION_ID_KEY],
        memoryUpdates: updateResult.memoryUpdates.length,
        stateChanges: Object.keys(updateResult.agentStateChanges).length,
        learningEvents: updateResult.learningEvents.length
      });
      
      return updateResult;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error in UPDATE phase', error);
      } else {
        console.error('Error in UPDATE phase', error);
      }
      throw error;
    }
  }
  
  /**
   * Generate conversation summary for memory storage
   */
  generateConversationSummary(userInput, llmResponse, cseContext) {
    try {
      // Create concise summary
      const inputSummary = userInput.length > 100 ? userInput.substring(0, 100) + '...' : userInput;
      const responseSummary = llmResponse.length > 200 ? llmResponse.substring(0, 200) + '...' : llmResponse;
      
      // Extract key topics from CSE context
      const contextTopics = [];
      if (cseContext && cseContext.salientMemories) {
        cseContext.salientMemories.slice(0, 3).forEach(mem => {
          if (mem.type) contextTopics.push(mem.type);
        });
      }
      
      const topicsStr = contextTopics.length > 0 ? ` [Topics: ${contextTopics.join(', ')}]` : '';
      
      return `Q: ${inputSummary}\nA: ${responseSummary}${topicsStr}`;
    } catch (error) {
      componentLogger.warn('Error generating conversation summary', error);
      return null;
    }
  }
  
  /**
   * Analyze user input for patterns and intent
   * @param {string} input - User input
   * @returns {Object} Input analysis
   */
  analyzeInput(input) {
    const analysis = {
      isSpecialCommand: false,
      commandType: null,
      intent: null,
      complexity: 'simple',
      requiresMemory: true,
      requiresReflection: false
    };
    
    if (!input || typeof input !== 'string') {
      return analysis;
    }
    
    const lowerInput = input.toLowerCase().trim();
    
    // Check for special commands
    if (lowerInput.startsWith('/') || 
        lowerInput.match(/^(remember|memorize|introspect|debug|who are you|what do you remember)/)) {
      analysis.isSpecialCommand = true;
      
      if (lowerInput.includes('remember') || lowerInput.includes('memorize')) {
        analysis.commandType = 'remember';
      } else if (lowerInput.includes('introspect') || lowerInput.includes('debug')) {
        analysis.commandType = 'introspect';
      } else if (lowerInput.includes('who are you')) {
        analysis.commandType = 'identity';
      } else if (lowerInput.includes('what do you remember')) {
        analysis.commandType = 'memory_query';
      }
    }
    
    // Determine complexity
    if (input.length > 200 || input.includes('?') && input.includes('and')) {
      analysis.complexity = 'complex';
      analysis.requiresReflection = true;
    }
    
    return analysis;
  }
  
  /**
   * Handle special commands
   * @param {Object} inputAnalysis - Input analysis result
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Agent state
   * @returns {Promise<Object>} Special command result
   */
  async handleSpecialCommands(inputAnalysis, agentState) {
    const result = {
      handled: false,
      response: null,
      type: inputAnalysis.commandType
    };
    
    try {
      // Note: Continue command handling moved to processRegularQuery() 
      // to allow input rewriting before observe phase
      
      switch (inputAnalysis.commandType) {
        case 'introspect':
          // Get introspection data via ports interface
          const agentStateData = this.ports.getAgentState();
          // Create safe introspection data without circular references
          const safeIntrospectionData = {
            agentState: agentStateData,
            orchestrator: undefined, // Remove orchestrator reference
            agentLoop: undefined     // Remove agent loop reference
          };
          result.response = JSON.stringify(safeIntrospectionData, null, 2);
          result.handled = true;
          break;
          
        case 'identity':
          const identity = agentState.identity || { core: [], dynamic: [] };
          result.response = `I am Leo, your cognitive partner. My identity includes:\n\nCore: ${identity.core.join(', ')}\nDynamic: ${identity.dynamic.join(', ')}`;
          result.handled = true;
          break;
          
        case 'memory_query':
          const recentMemories = await this.ports.searchMemory('recent memories', { limit: 5 });
          result.response = `Here's what I remember:\n\n${recentMemories.map((mem, i) => `${i+1}. ${mem.content || mem.text || 'Memory content'}`).join('\n')}`;
          result.handled = true;
          break;
      }
      
      return result;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error handling special command', error);
      } else {
        console.error('Error handling special command', error);
      }
      result.response = `Error handling command: ${error.message}`;
      result.handled = true;
      return result;
    }
  }
  
  /**
   * Build prompt with CSE context
   * @param {string} input - User input
   * @param {Object} cseContext - CSE context
   * @param {Object} strategy - Response strategy
   * @param {Object} agentState - Agent state
   * @returns {Array} Prompt messages
   */
  buildPrompt(input, cseContext, strategy, agentState) {
    const messages = [];
    
    // System message with identity and context
    let systemMessage = "You have access to LPAC (Leo Persistent AI Cognition), a system that provides project memory and context for this development project.";
    
    // Inject VisionAnchor context if available
    if (this.visionAnchor) {
      try {
        const visionContext = this.visionAnchor.getFormattedVisionContext();
        if (visionContext) {
          systemMessage += `\n\n${visionContext}`;
        }
      } catch (error) {
        if (this.logger && typeof this.logger.warn === 'function') {
          this.logger.warn('Failed to get vision context:', error.message);
        } else {
          console.warn('Failed to get vision context:', error.message);
        }
      }
    }
    
    if (cseContext && cseContext.identity) {
      systemMessage += `\n\nYour identity: ${cseContext.identity.join(' ')}`;
    }
    
    if (cseContext && cseContext.capabilities) {
      systemMessage += `\n\nYour capabilities: ${cseContext.capabilities.join(', ')}`;
    }
    
    if (cseContext && cseContext.memoryContext) {
      systemMessage += `\n\nRelevant memory context:\n${cseContext.memoryContext}`;
    }
    
    systemMessage += "\n\nRespond naturally as Leo, using the memory context when relevant.";
    
    messages.push({
      role: 'system',
      content: systemMessage
    });
    
    // User message
    messages.push({
      role: 'user',
      content: input
    });
    
    return messages;
  }
  
  /**
   * Generate response using LLM
   * @param {Array} prompt - Prompt messages
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Agent state
   * @returns {Promise<string>} Generated response
   */
  async generateResponse(prompt, orchestrator, agentState, cseContext = {}) {
    try {
      // Apply your exact surgical patch for controlled fallback
      const semHits = cseContext.memoryContext?.length || 0;
      const catHits = cseContext.categoryResults?.length || 0;
      const avgScore = semHits > 0 ? 
        cseContext.memoryContext.reduce((sum, m) => sum + (m.salience || 0), 0) / semHits : 0;
      
      const { K_min = 3, K_fallback = 1, tau_conf = 0.62, max_non_graph_tokens = 1500 } = 
        this.config?.fallback || {};
      
      // New, more forgiving policy - your exact pattern:
      let mode;
      if (semHits >= 3 && avgScore >= 0.62) mode = 'LCOS_ONLY';
      else if (semHits >= 1 || catHits >= 1) mode = 'BLEND';    // <= key change
      else mode = 'FALLBACK';
      
      // Extract entity name for validation
      const entityMatch = agentState.userInput?.match(/\b(htlogicalgates|quantum|stabilizer)\b/i);
      const entityName = entityMatch ? entityMatch[0].toLowerCase() : 'the topic';
      
      if (process.env.LEO_DEBUG === 'true') {
        console.log('\n🎯 === CONTROLLED FALLBACK DECISION ===');
        console.log(`📊 SemHits: ${semHits}, CatHits: ${catHits}, Avg Score: ${avgScore.toFixed(3)}, Mode: ${mode}`);
        console.log(`🎯 Entity: ${entityName}`);
        console.log(`🎯 Memory items count: ${memoryItems.length}`);
        if (memoryItems.length > 0) {
          console.log(`🎯 First memory preview: ${String(memoryItems[0].content || '').substring(0, 100)}`);
        }
      }
      
      // Generate grounded fact bullets from CSE memories
      const memoryItems = cseContext.memories || [];
      
      if (process.env.LEO_DEBUG === 'true') {
        console.log(`🎯 Memory items count: ${memoryItems.length}`);
        if (memoryItems.length > 0) {
          console.log(`🎯 First memory preview: ${String(memoryItems[0].content || '').substring(0, 100)}`);
          console.log(`🎯 Memory items types: ${memoryItems.map(m => m.type || 'unknown').join(', ')}`);
          console.log(`🎯 Memory items sources: ${memoryItems.map(m => m.source || 'unknown').join(', ')}`);
        }
      }
      
      // Filter out conversation events and only use actual knowledge memories
      const knowledgeMemories = memoryItems.filter(m => 
        m.type !== 'conversation_event' && 
        m.source !== 'recent_conversation' &&
        m.content && 
        typeof m.content === 'string' &&
        m.content.length > 50
      );
      
      if (process.env.LEO_DEBUG === 'true') {
        console.log(`🎯 Knowledge memories count: ${knowledgeMemories.length}`);
        if (knowledgeMemories.length > 0) {
          console.log(`🎯 First knowledge memory: ${String(knowledgeMemories[0].content || '').substring(0, 100)}`);
        }
      }
      
      const groundedFacts = generateGroundedFactBullets(knowledgeMemories, entityName);
      
      if (process.env.LEO_DEBUG === 'true') {
        console.log(`🎯 Generated ${groundedFacts.length} grounded facts`);
        if (groundedFacts.length > 0) {
          console.log(`🎯 First fact: ${groundedFacts[0]}`);
        }
      }
      
      // Build meta-agent prompt with grounded facts
      const metaPrompt = buildMetaAgentPrompt({
        userQuery: agentState.userInput,
        entity: entityName,
        mode: mode,
        policy: `${semHits} semantic hits, ${catHits} category hits`,
        groundedFacts: groundedFacts,
        maxTokens: mode === 'FALLBACK' ? 1500 : max_non_graph_tokens
      });
      
      // Generate initial response using ports interface
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info(`[LLM] Generating with strategy=${mode} via ports interface`);
      } else {
        console.log(`[LLM] Generating with strategy=${mode} via ports interface`);
      }
      if (!this.ports || typeof this.ports.generateResponse !== 'function') {
        if (this.logger && typeof this.logger.error === 'function') {
          this.logger.error('[LLM] Service missing from ports interface');
        } else {
          console.error('[LLM] Service missing from ports interface');
        }
        throw new Error('LLM service unavailable via ports');
      }
      
      console.log('[DEBUG] Calling LLM with context:', {
        query: agentState.userInput,
        knowledgeMemoriesCount: knowledgeMemories.length,
        cseContextKeys: Object.keys(cseContext)
      });
      
      // Call ports.generateResponse with proper parameters
      let response = await this.ports.generateResponse([
        { role: 'user', content: agentState.userInput }
      ], {
        salientMemories: knowledgeMemories,
        cseContext: cseContext
      });
      
      console.log('[DEBUG] LLM response received:', response ? response.substring(0, 100) + '...' : 'null');
      
      // Guarantee we have a response
      if (!response || !response.trim()) {
        if (this.logger && typeof this.logger.warn === 'function') {
          this.logger.warn('[LLM] Empty response — using general-knowledge fallback');
        } else {
          console.warn('[LLM] Empty response — using general-knowledge fallback');
        }
        const fallbackPrompt = `Please provide a helpful response to: ${agentState.userInput}`;
        response = await this.ports.generateResponse([
          { role: 'user', content: fallbackPrompt }
        ], {
          max_tokens: 1500,
          temperature: 0.8
        });
      }
      
      // Validate entity citations for LCOS_ONLY and BLEND modes
      if (mode !== 'FALLBACK') {
        const validation = validateEntityCitations(response, {
          entity: entityName,
          aliases: [entityName, entityName.toUpperCase(), `the ${entityName} library`],
          requireCitations: true
        });
        
        if (!validation.ok && validation.redlines.length > 0) {
          if (process.env.LEO_DEBUG === 'true') {
            console.log('🚨 Citation validation failed:', validation.redlines.length, 'issues');
            validation.redlines.forEach(r => console.log(`  - ${r.issue}: ${r.sentence}`));
          }
          
          // Auto-fix: Re-prompt with citation guidance
          const fixPrompt = prompt + `\n\nIMPORTANT: The following sentences need source tags:
${validation.suggestions.map(s => `- "${s.fix}"`).join('\n')}

Please revise your answer to include bracketed source tags like [M123] or [repo/file#L22] after each entity-specific claim.`;
          
          const llmResponse = await this.ports.generateResponse([
            { role: 'user', content: fixPrompt }
          ], {
            max_tokens: 2000,
            temperature: 0.7,
            enableProvenanceCitation: true
          });
        }
      }
      
      // Apply surface sanitization to remove system internals
      const cleanResponse = sanitizeSurface(response);
      
      // Check vision alignment if VisionAnchor is available
      if (this.visionAnchor && cleanResponse) {
        try {
          const alignmentCheck = await this.visionAnchor.checkAlignment(cleanResponse);
          if (!alignmentCheck.aligned && alignmentCheck.confidence < 0.72) {
            if (this.logger && typeof this.logger.warn === 'function') {
              this.logger.warn('Vision alignment drift detected', {
                confidence: alignmentCheck.confidence,
                driftIndicators: alignmentCheck.driftIndicators
              });
            } else {
              console.warn('Vision alignment drift detected', {
                confidence: alignmentCheck.confidence,
                driftIndicators: alignmentCheck.driftIndicators
              });
            }
            
            // Optionally trigger vision reinforcement or response adjustment
            if (process.env.LEO_DEBUG === 'true') {
              console.log('🚨 Vision drift detected - confidence:', alignmentCheck.confidence);
            }
          }
        } catch (alignmentError) {
          if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn('Vision alignment check failed:', alignmentError.message);
          } else {
            console.warn('Vision alignment check failed:', alignmentError.message);
          }
        }
      }
      
      // Demo-safe surface filter guards
      if (process.env.LCOS_SURFACE_FILTER === 'on') {
        const surfaceLeaks = this.detectSurfaceLeakage(cleanResponse);
        if (surfaceLeaks.length > 0) {
          if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn('[SurfaceFilter] Surface leakage detected, applying additional sanitization', {
              leaks: surfaceLeaks
            });
          } else {
            console.warn('[SurfaceFilter] Surface leakage detected, applying additional sanitization', {
              leaks: surfaceLeaks
            });
          }
          cleanResponse = this.applySurfaceSanitization(cleanResponse);
        }
      }
      
      // Guard against apology mode override
      if (process.env.LCOS_CONTROLLED_FALLBACK === 'blend' && 
          /I apologize.*trouble.*response/i.test(cleanResponse)) {
        if (this.logger && typeof this.logger.warn === 'function') {
          this.logger.warn('[ControlledFallback] Overriding apology mode to FALLBACK');
        } else {
          console.warn('[ControlledFallback] Overriding apology mode to FALLBACK');
        }
        cleanResponse = "Let me provide what information I can find on this topic.";
      }
      
      if (process.env.LEO_DEBUG === 'true') {
        console.log('🧹 Surface sanitized:', cleanResponse !== response);
        console.log('🛡️ Surface guards active:', process.env.LCOS_SURFACE_FILTER === 'on');
      }
      
      return cleanResponse;
      
    } catch (error) {
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error generating LLM response', error);
      } else {
        console.error('Error generating LLM response', error);
      }
      return "I apologize, but I'm having trouble generating a response right now.";
    }
  }

  /**
   * Detect surface leakage patterns in response
   */
  detectSurfaceLeakage(response) {
    const leakagePatterns = [
      { pattern: /\b(memory graph|chunks?|based on provided context)\b/i, type: 'system_internals' },
      { pattern: /\b(semantic search|embeddings|vector)\b/i, type: 'search_internals' },
      { pattern: /\b(retrieval|indexed|database)\b/i, type: 'storage_internals' },
      { pattern: /\b(system prompt|context window)\b/i, type: 'prompt_internals' },
      { pattern: /\b(orchestrator|agent loop)\b/i, type: 'architecture_internals' }
    ];
    
    const leaks = [];
    for (const { pattern, type } of leakagePatterns) {
      if (pattern.test(response)) {
        leaks.push(type);
      }
    }
    
    return leaks;
  }

  /**
   * Apply additional surface sanitization
   */
  applySurfaceSanitization(response) {
    let sanitized = response;
    
    // Replace system internals with user-friendly terms
    const replacements = [
      { from: /\bmemory graph\b/gi, to: 'knowledge base' },
      { from: /\bchunks?\b/gi, to: 'information' },
      { from: /\bbased on provided context\b/gi, to: 'based on available information' },
      { from: /\bsemantic search\b/gi, to: 'search' },
      { from: /\bembeddings\b/gi, to: 'representations' },
      { from: /\bretrieval\b/gi, to: 'finding' },
      { from: /\bindexed\b/gi, to: 'organized' },
      { from: /\bsystem prompt\b/gi, to: 'instructions' },
      { from: /\borchestrator\b/gi, to: 'system' }
    ];
    
    for (const { from, to } of replacements) {
      sanitized = sanitized.replace(from, to);
    }
    
    return sanitized;
  }
  
  /**
   * Update loop state
   * @param {string} phase - Current phase
   * @param {Object} result - Phase result
   */
  updateLoopState(phase, result) {
    this.loopState.currentPhase = phase;
    this.loopState.phaseHistory.push({
      phase,
      timestamp: Date.now(),
      result
    });
    
    // Keep history manageable
    if (this.loopState.phaseHistory.length > 20) {
      this.loopState.phaseHistory = this.loopState.phaseHistory.slice(-20);
    }
  }
  
  /**
   * Analyze context quality
   * @param {Object} cseContext - CSE context
   * @returns {Object} Context analysis
   */
  analyzeContext(cseContext) {
    return {
      hasContext: !!cseContext,
      hasIdentity: !!(cseContext?.identity?.length),
      hasMemory: !!(cseContext?.memoryContext),
      hasCapabilities: !!(cseContext?.capabilities?.length),
      quality: cseContext ? 'good' : 'poor'
    };
  }
  
  /**
   * Determine response strategy
   * @param {Object} inputAnalysis - Input analysis
   * @param {Object} contextAnalysis - Context analysis
   * @param {Object} agentState - Agent state
   * @returns {Object} Response strategy
   */
  determineResponseStrategy(inputAnalysis, contextAnalysis, agentState) {
    return {
      type: contextAnalysis.hasMemory ? 'memory_informed' : 'general',
      useIdentity: contextAnalysis.hasIdentity,
      useCapabilities: contextAnalysis.hasCapabilities,
      confidence: contextAnalysis.quality === 'good' ? 0.8 : 0.4
    };
  }
  
  /**
   * Calculate confidence score
   * @param {Object} contextAnalysis - Context analysis
   * @param {Object} strategy - Response strategy
   * @returns {number} Confidence score
   */
  calculateConfidenceScore(contextAnalysis, strategy) {
    let score = 0.5; // Base score
    
    if (contextAnalysis.hasMemory) score += 0.2;
    if (contextAnalysis.hasIdentity) score += 0.1;
    if (contextAnalysis.hasCapabilities) score += 0.1;
    if (strategy.confidence) score += strategy.confidence * 0.1;
    
    return Math.min(1.0, score);
  }
  
  /**
   * Perform deep reflection
   * @param {Object} observeResult - Observe result
   * @param {Object} reflectResult - Current reflect result
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Agent state
   * @returns {Promise<number>} Reflection depth
   */
  async deepReflection(observeResult, reflectResult, orchestrator, agentState) {
    // Placeholder for deep reflection logic
    this.loopState.reflectionDepth++;
    return this.loopState.reflectionDepth;
  }
  
  /**
   * Update memory with interaction
   * @param {Object} result - Agent loop result
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Agent state
   * @returns {Promise<Object>} Memory update result
   */
  async updateMemory(result, orchestrator, agentState) {
    try {
      const memoryData = {
        type: 'interaction',
        content: `User: ${result.input}\nLeo: ${result.phases.act.response}`,
        timestamp: Date.now(),
        sessionId: agentState[SESSION_ID_KEY],
        metadata: {
          strategy: result.phases.act.metadata.strategy,
          confidence: result.phases.act.metadata.confidence
        }
      };
      
      await this.ports.updateMemory(memoryData);
      
      return { success: true, type: 'interaction' };
      
    } catch (error) {
      logger.error('Error updating memory', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Update agent state
   * @param {Object} result - Agent loop result
   * @param {Object} agentState - Agent state
   * @returns {Object} Agent state changes
   */
  updateAgentState(result, agentState) {
    const changes = {};
    
    // Update interaction count
    if (agentState.metrics) {
      changes.interactions = (agentState.metrics.interactions || 0) + 1;
    }
    
    return changes;
  }
  
  /**
   * Identify learning events
   * @param {Object} result - Agent loop result
   * @param {Object} agentState - Agent state
   * @returns {Array} Learning events
   */
  identifyLearningEvents(result, agentState) {
    const events = [];
    
    // Check for new information in user input
    if (result.input && result.input.includes('remember')) {
      events.push({
        type: 'explicit_learning',
        content: result.input,
        timestamp: Date.now()
      });
    }
    
    return events;
  }
  
  /**
   * Get available skills/capabilities from orchestrator
   * @param {Object} orchestrator - Orchestrator instance
   * @returns {Promise<Array>} Available skills
   */
  async getAvailableSkills(orchestrator) {
    try {
      // Get capabilities from capability registry via ports
      const capabilities = [];
      
      // Define core cognitive skills
      const coreSkills = [
        {
          name: 'llm_conversation',
          type: 'cognitive',
          description: 'Generate conversational response using LLM with memory context',
          confidence: 0.8
        },
        {
          name: 'memory_search',
          type: 'cognitive',
          description: 'Search memory graph for specific information',
          confidence: 0.9
        },
        {
          name: 'identity_reinforcement',
          type: 'cognitive',
          description: 'Reinforce identity through CSE-selected affirmations',
          confidence: 0.7
        },
        {
          name: 'introspection',
          type: 'meta',
          description: 'Provide system introspection and state analysis',
          confidence: 0.9
        }
      ];
      
      // Combine core skills with registered capabilities
      const allSkills = [...coreSkills, ...capabilities.map(cap => ({
        name: cap.name,
        type: cap.type || 'capability',
        description: cap.description || 'Registered capability',
        confidence: 0.6
      }))];;
      
      return allSkills;
      
    } catch (error) {
      logger.error('Error getting available skills', error);
      return [];
    }
  }
  
  /**
   * Select the most appropriate skill based on input and context
   * @param {string} userInput - User input
   * @param {Object} inputAnalysis - Input analysis
   * @param {Object} cseContext - CSE context
   * @param {Object} reflectResult - Reflection result
   * @param {Array} availableSkills - Available skills
   * @param {Object} agentState - Agent state
   * @returns {Promise<Object>} Selected skill
   */
  async selectSkill(userInput, inputAnalysis, cseContext, reflectResult, availableSkills, agentState) {
    try {
      // Handle special commands first
      if (inputAnalysis.isSpecialCommand) {
        if (inputAnalysis.command === 'introspect') {
          return availableSkills.find(skill => skill.name === 'introspection');
        }
        if (inputAnalysis.command === 'identity' || inputAnalysis.command === 'who') {
          return availableSkills.find(skill => skill.name === 'identity_reinforcement');
        }
        if (inputAnalysis.command === 'remember' || inputAnalysis.command === 'memory') {
          return availableSkills.find(skill => skill.name === 'memory_search');
        }
      }
      
      // Simple skill selection logic (can be enhanced with ML/LLM later)
      const inputLower = userInput.toLowerCase();
      
      // Memory-related queries
      if (inputLower.includes('remember') || inputLower.includes('recall') || 
          inputLower.includes('what do you know about')) {
        return availableSkills.find(skill => skill.name === 'memory_search');
      }
      
      // Identity-related queries
      if (inputLower.includes('who are you') || inputLower.includes('what are you') ||
          inputLower.includes('your identity') || inputLower.includes('tell me about yourself')) {
        return availableSkills.find(skill => skill.name === 'identity_reinforcement');
      }
      
      // System introspection
      if (inputLower.includes('introspect') || inputLower.includes('system state') ||
          inputLower.includes('debug') || inputLower.includes('status')) {
        return availableSkills.find(skill => skill.name === 'introspection');
      }
      
      // Default to conversational LLM
      return availableSkills.find(skill => skill.name === 'llm_conversation');
      
    } catch (error) {
      logger.error('Error selecting skill', error);
      return null;
    }
  }
  
  /**
   * Prepare parameters for skill invocation
   * @param {Object} selectedSkill - Selected skill
   * @param {Object} observeResult - Observe result
   * @param {Object} reflectResult - Reflect result
   * @param {Object} agentState - Agent state
   * @returns {Object} Skill parameters
   */
  prepareSkillParameters(selectedSkill, observeResult, reflectResult, agentState) {
    const baseParameters = {
      userInput: observeResult.input,
      context: observeResult.cseContext,
      agentState,
      sessionId: agentState.sessionId,
      timestamp: Date.now()
    };
    
    // Add skill-specific parameters
    switch (selectedSkill.name) {
      case 'llm_conversation':
        return {
          ...baseParameters,
          useMemoryContext: true,
          useCSEContext: true,
          responseStrategy: reflectResult?.responseStrategy,
          confidence: reflectResult?.confidenceScore
        };
        
      case 'memory_search':
        return {
          ...baseParameters,
          searchQuery: observeResult.input,
          maxResults: 10,
          includeEmbeddings: true
        };
        
      case 'identity_reinforcement':
        return {
          ...baseParameters,
          includeIdentityAffirmations: true,
          includeCapabilities: true,
          reinforcementLevel: 'standard'
        };
        
      case 'introspection':
        return {
          ...baseParameters,
          includeAgentState: true,
          includeLoopState: true,
          includeComponentStatus: true
        };
        
      default:
        return baseParameters;
    }
  }
  
  /**
   * Invoke the selected skill/capability
   * @param {Object} skill - Selected skill
   * @param {Object} parameters - Skill parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Skill execution result
   */
  async invokeSkill(skill, parameters, context) {
    try {
      logger.debug('Invoking skill', { 
        skillName: skill.name, 
        skillType: skill.type,
        sessionId: context.agentState[SESSION_ID_KEY]
      });
      
      // Route to appropriate skill handler
      switch (skill.name) {
        case 'llm_conversation':
          return await this.invokeLLMConversation(parameters, context);
          
        case 'memory_search':
          return await this.invokeMemorySearch(parameters, context);
          
        case 'identity_reinforcement':
          return await this.invokeIdentityReinforcement(parameters, context);
          
        case 'introspection':
          return await this.invokeIntrospection(parameters, context);
          
        case 'fusion_response':
          // Return the fusion response that was already generated
          return {
            success: true,
            response: context.fusionResponse || context.response || 'Fusion response generated',
            type: 'fusion_response'
          };
          
        default:
          // For registered capabilities, try to invoke through orchestrator
          return await this.invokeRegisteredCapability(skill, parameters, context);
      }
      
    } catch (error) {
      logger.error('Error invoking skill', { skill: skill.name, error });
      return {
        success: false,
        error: error.message,
        response: `Error executing ${skill.name}: ${error.message}`,
        type: 'error'
      };
    }
  }
  
  /**
   * Invoke LLM conversation skill
   */
  async invokeLLMConversation(parameters, context) {
    try {
      // Build prompt with CSE context
      const prompt = this.buildPrompt(
        parameters.userInput,
        parameters.context,
        parameters.responseStrategy,
        parameters.agentState
      );
      
      // Generate response via orchestrator's LLM
      const response = await this.generateResponse(
        prompt,
        context.orchestrator,
        parameters.agentState,
        parameters.cseContext
      );
      
      return {
        success: true,
        response,
        type: 'llm_response',
        metadata: {
          promptLength: prompt.length,
          responseLength: response.length,
          useMemoryContext: parameters.useMemoryContext,
          confidence: parameters.confidence
        }
      };
      
    } catch (error) {
      throw new Error(`LLM conversation failed: ${error.message}`);
    }
  }
  
  /**
   * Invoke memory search skill
   */
  async invokeMemorySearch(parameters, context) {
    try {
      // Search memory via ports interface
      const searchResults = await context.ports.getSalientContext(
        parameters.searchQuery,
        {
          maxResults: parameters.maxResults,
          includeEmbeddings: parameters.includeEmbeddings
        }
      );
      
      // Format results for response
      const formattedResults = this.formatMemorySearchResults(searchResults);
      
      return {
        success: true,
        response: formattedResults,
        type: 'memory_search',
        data: searchResults,
        metadata: {
          resultsCount: searchResults?.length || 0,
          searchQuery: parameters.searchQuery
        }
      };
      
    } catch (error) {
      throw new Error(`Memory search failed: ${error.message}`);
    }
  }
  
  /**
   * Invoke identity reinforcement skill
   */
  async invokeIdentityReinforcement(parameters, context) {
    try {
      // Get identity context via ports interface
      const identityContext = await context.ports.getSalientContext(
        'identity affirmations capabilities',
        {
          includeIdentity: true,
          includeCapabilities: true
        }
      );
      
      // Format identity response
      const identityResponse = this.formatIdentityResponse(identityContext);
      
      return {
        success: true,
        response: identityResponse,
        type: 'identity_reinforcement',
        data: identityContext,
        metadata: {
          reinforcementLevel: parameters.reinforcementLevel,
          identityItemsCount: identityContext?.identity?.length || 0
        }
      };
      
    } catch (error) {
      throw new Error(`Identity reinforcement failed: ${error.message}`);
    }
  }
  
  /**
   * Invoke introspection skill
   */
  async invokeIntrospection(parameters, context) {
    try {
      // Get full system introspection via ports interface
      const introspectionData = context.ports.getAgentState();
      
      // Remove circular references before processing
      const safeIntrospectionData = {
        ...introspectionData,
        orchestrator: undefined, // Remove orchestrator reference
        agentLoop: undefined     // Remove agent loop reference
      };
      
      // Format introspection response
      const introspectionResponse = this.formatIntrospectionResponse(safeIntrospectionData);
      
      return {
        success: true,
        response: introspectionResponse,
        type: 'introspection',
        data: safeIntrospectionData, // Use safe data without circular references
        metadata: {
          includeAgentState: parameters.includeAgentState,
          includeLoopState: parameters.includeLoopState,
          includeComponentStatus: parameters.includeComponentStatus
        }
      };
      
    } catch (error) {
      throw new Error(`Introspection failed: ${error.message}`);
    }
  }
  
  /**
   * Invoke registered capability
   */
  async invokeRegisteredCapability(skill, parameters, context) {
    try {
      // Placeholder for registered capability invocation
      // This would integrate with the capability registry and meta-programming tools
      
      return {
        success: true,
        response: `Capability '${skill.name}' executed successfully.`,
        type: 'registered_capability',
        metadata: {
          skillName: skill.name,
          skillType: skill.type
        }
      };
      
    } catch (error) {
      throw new Error(`Registered capability failed: ${error.message}`);
    }
  }
  
  /**
   * Generate selection reasoning
   */
  generateSelectionReasoning(selectedSkill, inputAnalysis, responseStrategy) {
    return {
      skillSelected: selectedSkill.name,
      reason: `Selected ${selectedSkill.name} based on input analysis and response strategy`,
      confidence: selectedSkill.confidence,
      inputFactors: {
        isSpecialCommand: inputAnalysis.isSpecialCommand,
        commandType: inputAnalysis.command,
        inputLength: inputAnalysis.length
      },
      strategyFactors: {
        responseType: responseStrategy?.type,
        confidence: responseStrategy?.confidence
      }
    };
  }
  
  /**
   * Format memory search results
   */
  formatMemorySearchResults(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return "I don't have any relevant memories for that query.";
    }
    
    return `I found ${searchResults.length} relevant memories:\n\n${searchResults.slice(0, 5).map((result, i) => 
      `${i + 1}. ${result.content || result.text || 'Memory item'}`
    ).join('\n\n')}`;
  }
  
  /**
   * Format identity response
   */
  formatIdentityResponse(identityContext) {
    const identity = identityContext?.identity || [];
    const capabilities = identityContext?.capabilities || [];
    
    let response = "I am Leo, your persistent cognitive AI partner.\n\n";
    
    if (identity.length > 0) {
      response += "My core identity:\n";
      response += identity.slice(0, 3).map(item => `• ${item}`).join('\n');
      response += "\n\n";
    }
    
    if (capabilities.length > 0) {
      response += "My key capabilities:\n";
      response += capabilities.slice(0, 3).map(cap => `• ${cap}`).join('\n');
    }
    
    return response;
  }
  
  /**
   * Format introspection response
   */
  formatIntrospectionResponse(introspectionData) {
    const orchestrator = introspectionData.orchestrator || {};
    const agentState = introspectionData.agentState || {};
    
    let response = "🧠 Leo System Introspection\n\n";
    
    response += `📊 Agent State:\n`;
    response += `• Session: ${agentState.sessionId}\n`;
    response += `• Interactions: ${agentState.metrics?.interactions || 0}\n`;
    response += `• Uptime: ${Date.now() - (agentState.startTime || Date.now())}ms\n\n`;
    
    response += `🔧 Components:\n`;
    const components = Object.keys(orchestrator.components || {});
    response += components.map(comp => `• ${comp}: ${orchestrator.components[comp] ? '✅' : '❌'}`).join('\n');
    
    return response;
  }

  /**
   * Process research query using staged pipeline
   * @param {string} userInput - Research query
   * @param {Object} orchestrator - Orchestrator instance
   * @param {Object} agentState - Agent state
   * @returns {Promise<Object>} Research result
   */
  async processResearchQuery(userInput, orchestrator, agentState) {
    try {
      componentLogger.info('Processing research query with staged pipeline', {
        query: userInput.substring(0, 100),
        sessionId: agentState[SESSION_ID_KEY]
      });

      const startTime = Date.now();
      
      // PASS 1: Start research workspace
      const workspace = await this.researchOrchestrator.start(userInput);
      
      // PASS 2: Plan aspects using CSE governance
      const aspectPlan = await this.researchOrchestrator.planAspects(userInput);
      workspace.setAspects(aspectPlan.aspects, aspectPlan.gaps, aspectPlan.mustCover);
      
      // PASS 3: Gather and summarize sources for each aspect
      for (const aspect of aspectPlan.aspects) {
        logger.debug('Processing aspect', { aspect: aspect.aspect });
        
        // Gather sources with CSE multi-factor ranking
        const sources = await this.researchOrchestrator.gatherSources(aspect, 40);
        workspace.addSources(aspect.aspect, sources);
        
        // Batch summarize with quality gates
        const summaries = await this.researchOrchestrator.batchSummarize(
          sources, 
          8, 
          aspect
        );
        
        // Add summaries to workspace
        summaries.forEach(summary => workspace.addSummary(summary));
      }
      
      // PASS 4: Mine connections between summaries
      const connections = await this.researchOrchestrator.mineConnections(workspace.id);
      workspace.setConnections(
        connections.connections,
        connections.contradictions,
        connections.contradictionClusters
      );
      
      // PASS 5: Build synthesis context with token budgeting
      const synthesisContext = await this.researchOrchestrator.buildSynthesisContext(
        workspace.id,
        3500
      );
      
      // PASS 6: Generate synthesis
      const synthesis = await this.researchOrchestrator.synthesize(synthesisContext);
      workspace.setSynthesis(synthesis);
      
      // PASS 7: Store synthesis in memory
      const storageResult = await this.researchOrchestrator.storeSynthesis(
        workspace.id,
        synthesis
      );
      
      const duration = Date.now() - startTime;
      
      logger.info('Research pipeline completed successfully', {
        workspaceId: workspace.id,
        duration,
        aspectCount: workspace.aspects.length,
        summaryCount: workspace.summaries.length,
        connectionCount: workspace.connections.length,
        synthesisLength: synthesis.length
      });
      
      // Return result in agent loop format
      return {
        input: userInput,
        userContext: {},
        phases: {
          observe: {
            inputAnalysis: { isResearchQuery: true },
            cseContext: null,
            duration: 0
          },
          reflect: null,
          plan: {
            selectedSkill: { name: 'research_orchestrator', type: 'cognitive' },
            aspectsPlan: aspectPlan,
            duration: 0
          },
          act: {
            response: synthesis,
            type: 'research_synthesis',
            skillResult: {
              success: true,
              workspace: workspace.getSummary(),
              metrics: this.researchOrchestrator.getMetrics()
            },
            duration
          },
          update: {
            memoryUpdates: [storageResult],
            duration: 0
          }
        },
        cseContext: null,
        llmResponse: synthesis,
        agentStateChanges: {},
        selectedSkill: { name: 'research_orchestrator' },
        skillInvocationResult: {
          success: true,
          workspace: workspace.getSummary(),
          storageResult
        },
        metadata: {
          startTime,
          endTime: Date.now(),
          duration,
          phasesExecuted: ['observe', 'plan', 'act', 'update'],
          researchPipeline: true,
          workspaceId: workspace.id
        }
      };
      
    } catch (error) {
      logger.error('Research pipeline failed', {
        query: userInput.substring(0, 100),
        error: error.message
      });
      
      // Fallback to regular processing
      logger.info('Falling back to regular agent loop processing');
      return await this.processRegularQuery(userInput, agentState);
    }
  }

  /**
   * Process regular query using standard OODA loop
   * @param {string} userInput - User input
   * @param {Object} agentState - Agent state
   * @returns {Promise<Object>} Regular processing result
   */
  async processRegularQuery(userInput, agentState) {
    // === Continue Command Detection & Input Rewriting ===
    // Lazy initialize VisionAnchor if not already done (fallback for init issues)
    if (!this.visionAnchor && this.ports?.getMemoryGraph) {
      try {
        const memoryGraph = this.ports.getMemoryGraph();
        if (memoryGraph) {
          this.visionAnchor = new VisionAnchor({ memoryGraph });
          if (_ALE_DEBUG_ON) {
            console.log('[CONTINUE] Lazy-initialized VisionAnchor via ports');
          }
        }
      } catch (err) {
        if (_ALE_DEBUG_ON) {
          console.warn('[CONTINUE] Failed to lazy-init VisionAnchor:', err.message);
        }
      }
    }
    
    // Check for continuation prompts BEFORE observe phase so we can rewrite the input
    if (this.visionAnchor && userInput && typeof userInput === 'string') {
      const continueResult = await this.visionAnchor.handleContinueCommand(userInput);
      if (continueResult.handled && continueResult.rewrittenUserInput) {
        // Rewrite the user input to make continuation explicit
        userInput = continueResult.rewrittenUserInput;
        agentState.userInput = userInput;
        
        if (_ALE_DEBUG_ON) {
          console.log('[CONTINUE] Detected continuation prompt, rewrote to:', userInput);
        }
        
        // Continue processing with rewritten input (do NOT return early)
      }
    }
    // === End Continue Command Detection ===
    
    if (componentLogger && typeof componentLogger.info === 'function') {
      componentLogger.info('Processing regular query with decision gate', {
        query: userInput.substring(0, 100),
        sessionId: agentState[SESSION_ID_KEY]
      });
    } else {
      console.log('Processing regular query with decision gate', {
        query: userInput.substring(0, 100),
        sessionId: agentState[SESSION_ID_KEY]
      });
    }
    
    console.log('[CRITICAL DEBUG] ========== processRegularQuery ENTRY ==========');
    console.log('[CRITICAL DEBUG] userInput:', userInput);
    console.log('[CRITICAL DEBUG] ports available:', !!this.ports);
    console.log('[CRITICAL DEBUG] agentState:', agentState?.[SESSION_ID_KEY]);
    console.log('[CRITICAL DEBUG] About to call observePhase...');
    
    const startTime = Date.now();
    
    // OBSERVE phase - get memory context
    console.log('[CRITICAL DEBUG] CALLING observePhase NOW...');
    const observeResult = await this.observePhase(userInput, {}, agentState);
    console.log('[CRITICAL DEBUG] observePhase COMPLETED, result keys:', Object.keys(observeResult || {}));
    
    // PLAN phase - use fusion system for all queries
    const planResult = {
      selectedSkill: { name: 'fusion_response', type: 'llm' },
      skillParameters: {},
      duration: 0
    };
    
    // ACT phase - use our decision gate implementation
    const actResult = await this.actPhase(observeResult, null, planResult, agentState);
    
    // === VisionAnchor conversation history update (for continue command) ===
    // Store both user input and assistant output so continuation can reference last response
    if (this.visionAnchor && actResult && (actResult.llmResponse || actResult.response)) {
      try {
        const _vaOut = String(actResult.llmResponse || actResult.response || '').trim();
        if (_vaOut) {
          this.visionAnchor.updateConversationHistory(userInput, _vaOut);
          if (_ALE_DEBUG_ON) {
            console.log('[VISION] Updated conversation history with assistant output');
          }
        }
      } catch (err) {
        if (_ALE_DEBUG_ON) {
          console.warn(
            '[VISION] Failed to update conversation history:',
            err && err.message ? err.message : err
          );
        }
      }
    }
    // === End VisionAnchor conversation history update ===
    
    console.log('[PROCESS REGULAR QUERY] Final result assembly');
    console.log('[PROCESS REGULAR QUERY] actResult.llmResponse exists:', !!actResult.llmResponse);
    console.log('[PROCESS REGULAR QUERY] actResult.gatewayStamp exists:', !!actResult.gatewayStamp);
    console.log('[PROCESS REGULAR QUERY] actResult.gatewayStamp value:', actResult.gatewayStamp);

    // ARCHITECTURAL FIX: Store conversation summaries (decoupled from contextProcessor)
    // This is the actual execution path used by the web server
    // Use ports.updateMemory interface (this.orchestrator is not set to avoid circular refs)
    if (!this.ports?.updateMemory) {
      componentLogger.warn('Conversation summary skipped', {
        reason: 'no_updateMemory_port',
        sessionId: agentState[SESSION_ID_KEY]
      });
    } else if (!userInput) {
      componentLogger.warn('Conversation summary skipped', {
        reason: 'no_user_input',
        sessionId: agentState[SESSION_ID_KEY]
      });
    } else if (!actResult.llmResponse) {
      componentLogger.warn('Conversation summary skipped', {
        reason: 'no_llm_response',
        sessionId: agentState[SESSION_ID_KEY]
      });
    } else {
      try {
        const conversationSummary = this.generateConversationSummary(
          userInput,
          actResult.llmResponse,
          observeResult.cseContext
        );
        
        if (!conversationSummary) {
          componentLogger.warn('Conversation summary skipped', {
            reason: 'generation_returned_null',
            sessionId: agentState[SESSION_ID_KEY]
          });
        } else {
          // DEDUPLICATION: Hash-based guard to prevent retry inflation
          const crypto = require('crypto');
          const { getInteractionsPath } = require('../utils/paths');
          const sessionId = agentState[SESSION_ID_KEY] || `session_${Date.now()}`;
          
          // Normalize inputs to reduce hash noise from formatting differences
          // Harden against undefined/null inputs
          const normalizeText = (text = '') => {
            return String(text)
              .trim()
              .replace(/\s+/g, ' ')  // Collapse repeated whitespace
              .replace(/\r\n/g, '\n'); // Normalize newlines
          };
          
          const normalizedInput = normalizeText(userInput);
          const normalizedResponse = normalizeText(actResult.llmResponse);
          const dedupeInput = `${sessionId}:${normalizedInput}:${normalizedResponse}`;
          const summaryHash = crypto.createHash('sha256').update(dedupeInput).digest('hex').substring(0, 16);
          
          // DURABLE DEDUPE: Check for existing summary with this hash
          // This survives restarts but has concurrency limitations (see docs)
          // We check the interactions file directly since it's the source of truth
          const fs = require('fs');
          const interactionsPath = getInteractionsPath();
          
          let shouldSkip = false;
          if (fs.existsSync(interactionsPath)) {
            try {
              const interactionsData = fs.readFileSync(interactionsPath, 'utf8');
              const interactions = JSON.parse(interactionsData);
              
              // Find existing summary with same hash in same session
              const existing = interactions.find(i => 
                i.type === 'conversation_summary' &&
                i.metadata?.summary_hash === summaryHash &&
                i.metadata?.session_id === sessionId
              );
              
              if (existing) {
                const existingAge = Date.now() - (existing.metadata?.ingested_at || 0);
                const TIME_WINDOW_MS = 300000; // 5 minutes
                
                // Only dedupe if within time window (allows legitimate repeated interactions later)
                if (existingAge < TIME_WINDOW_MS) {
                  componentLogger.warn('Conversation summary skipped', {
                    reason: 'duplicate_detected_in_file',
                    sessionId: sessionId,
                    summaryHash: summaryHash,
                    existingAge: Math.round(existingAge / 1000) + 's'
                  });
                  shouldSkip = true;
                } else {
                  componentLogger.info('Allowing repeated interaction after time window', {
                    sessionId: sessionId,
                    summaryHash: summaryHash,
                    timeSinceFirst: Math.round(existingAge / 1000) + 's'
                  });
                }
              }
            } catch (readError) {
              componentLogger.warn('Could not check for duplicate summaries', {
                error: readError.message
              });
            }
          }
          
          if (shouldSkip) {
            return;
          }
          
          const summaryEmbedding = await trueSemanticEmbeddings.generate(conversationSummary);
          const eventTimestamp = Date.now();
          const messageId = `msg_${crypto.randomUUID()}`;
          
          // PHASE 2: Store as typed cognitive artifact
          const { storeConversationArtifact } = require('../memory/storeConversationArtifact');
          
          const baseObj = {
            type: 'conversation_summary',
            source: 'orchestrator_agent_loop',
            embedding: summaryEmbedding,
            originalInteraction: {
              userInput: userInput.substring(0, 100),
              response: actResult.llmResponse.substring(0, 100)
            },
            metadata: {
              source_kind: 'conversation',
              source_id: `conv:${sessionId}/msg:${messageId}`,
              timestamp: eventTimestamp,
              ingested_at: Date.now(),
              timestamp_source: 'ingest_time_fallback',
              conversation_timestamp: eventTimestamp,
              message_timestamp: eventTimestamp,
              session_id: sessionId,
              message_id: messageId,
              summary_hash: summaryHash
            }
          };
          
          // Writer function for orchestratorAgentLoop (uses ports.updateMemory)
          const writeMemory = async (text, obj) => {
            await this.ports.updateMemory(text, obj);
          };
          
          const classification = await storeConversationArtifact({
            writeMemory,
            summaryText: conversationSummary,
            embedding: summaryEmbedding,
            baseObj
          });
          
          componentLogger.info('Stored conversation artifact via storeConversationArtifact', {
            sessionId: sessionId,
            messageId: messageId,
            summaryHash: summaryHash,
            artifactType: classification.artifactType,
            confidence: classification.confidence
          });
        }
      } catch (summaryError) {
        componentLogger.warn('Conversation summary skipped', {
          reason: 'error',
          error: summaryError.message,
          sessionId: agentState[SESSION_ID_KEY]
        });
      }
    }

    console.log('[PROCESS REGULAR QUERY] actResult.metadata before return:', JSON.stringify({
      policyBlocked: actResult.metadata?.policyBlocked,
      policyDecision: actResult.metadata?.policyDecision,
      violationTypes: actResult.metadata?.violationTypes,
      allKeys: Object.keys(actResult.metadata || {})
    }));

    return {
      input: userInput,
      userContext: {},
      phases: {
        observe: observeResult,
        reflect: null,
        plan: planResult,
        act: actResult,
        update: null
      },
      cseContext: observeResult.cseContext,
      llmResponse: actResult.llmResponse || actResult.response,
      gatewayStamp: actResult.gatewayStamp,
      metrics: actResult.metrics,
      agentStateChanges: {},
      selectedSkill: planResult.selectedSkill,
      skillInvocationResult: actResult.skillResult,
      // Policy decision metadata (machine-checkable)
      policyBlocked: actResult.metadata?.policyBlocked || false,
      policyDecision: actResult.metadata?.policyDecision || null,
      violationTypes: actResult.metadata?.violationTypes || [],
      metadata: {
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        phasesExecuted: ['observe', 'plan', 'act'],
        researchPipeline: false,
        // Include policy metadata for transparency
        ...(actResult.metadata?.policyBlocked !== undefined && {
          policyEnforcement: {
            blocked: actResult.metadata.policyBlocked,
            decision: actResult.metadata.policyDecision,
            violationTypes: actResult.metadata.violationTypes,
            violationCount: actResult.metadata.policyViolationCount
          }
        })
      }
    };
  }

  /**
   * Analyze query intent for structured reasoning
   */
  analyzeQueryIntent(userInput) {
    const query = userInput.toLowerCase();
    
    const intentPatterns = {
      COMPARE: /\b(compare|versus|vs|difference|contrast|against)\b/i,
      ANALYZE: /\b(analyze|analysis|examine|study|investigate|breakdown)\b/i
    };
    
    let intent = 'DIRECT';
    for (const [intentType, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(query)) {
        intent = intentType;
        break;
      }
    }
    
    // Extract entities for comparative analysis
    const entities = [];
    const entityPatterns = {
      tensoract: /\b(tensoract|DDBH|BoseHubbard|MPO|tensor)\b/i,
      textbook: /\b(textbook|standard|canonical|traditional|classic)\b/i,
      quantum: /\b(quantum|qubit|superposition|entanglement)\b/i
    };
    
    for (const [entity, pattern] of Object.entries(entityPatterns)) {
      if (pattern.test(userInput)) {
        entities.push(entity);
      }
    }
    
    return { intent, entities, originalQuery: userInput };
  }

  /**
   * Execute structured reasoning for comparative/analytical queries
   */
  async executeStructuredReasoning(queryPack, observeResult, planResult, orchestrator, agentState) {
    try {
      const { intent, entities, originalQuery } = queryPack;
      
      // Step 1: Gather entity-specific information
      const entitySummaries = {};
      
      for (const entity of entities) {
        const entityQuery = `${entity} implementation details`;
        const entityContext = await orchestrator.getMemoryContext(entityQuery, {
          userContext: observeResult.userContext,
          agentState,
          includeIdentity: false,
          includeCapabilities: false
        });
        
        entitySummaries[entity] = this.summarizeEntityContext(entityContext, entity);
      }
      
      // Step 2: Build structured reasoning prompt
      let structuredPrompt = '';
      
      if (intent === 'COMPARE') {
        structuredPrompt = this.buildComparativePrompt(entitySummaries, originalQuery);
      } else if (intent === 'ANALYZE') {
        structuredPrompt = this.buildAnalyticalPrompt(entitySummaries, originalQuery);
      }
      
      // Step 3: Generate structured response
      const response = await this.generateStructuredResponse(
        structuredPrompt,
        orchestrator,
        agentState,
        observeResult.cseContext
      );
      
      return {
        response,
        type: 'structured_reasoning',
        reasoning: {
          intent,
          entities,
          entitySummaries,
          structuredPrompt
        }
      };
      
    } catch (error) {
      console.error('[StructuredReasoning] Error:', error);
      
      // Fallback to normal skill execution
      return await this.invokeSkill(
        planResult.selectedSkill,
        planResult.skillParameters,
        {
          userInput: observeResult.input,
          memories: observeResult.cseContext,
          context: observeResult.cseContext,
          agentState,
          orchestrator
        }
      );
    }
  }

  /**
   * Summarize entity context for structured reasoning
   */
  summarizeEntityContext(context, entity) {
    const memories = context?.memories || [];
    const relevantMemories = memories.filter(m => 
      m.content && 
      m.content.toLowerCase().includes(entity.toLowerCase())
    ).slice(0, 3);
    
    if (relevantMemories.length === 0) {
      return `No specific information found about ${entity}`;
    }
    
    const summary = relevantMemories
      .map(m => m.content.substring(0, 200))
      .join('\n\n');
    
    return summary;
  }

  /**
   * Build comparative reasoning prompt
   */
  buildComparativePrompt(entitySummaries, originalQuery) {
    const entities = Object.keys(entitySummaries);
    
    let prompt = `Please provide a structured comparison for: ${originalQuery}\n\n`;
    
    // Step 1: Summarize each entity
    entities.forEach((entity, index) => {
      prompt += `Step ${index + 1}: ${entity.charAt(0).toUpperCase() + entity.slice(1)} Summary:\n`;
      prompt += `${entitySummaries[entity]}\n\n`;
    });
    
    // Step 2: Direct comparison
    prompt += `Step ${entities.length + 1}: Direct Comparison:\n`;
    prompt += `Compare the key differences, similarities, and trade-offs between ${entities.join(' and ')}.\n\n`;
    
    // Step 3: Analysis and conclusions
    prompt += `Step ${entities.length + 2}: Analysis:\n`;
    prompt += `Provide insights about which approach might be better for different use cases and why.\n\n`;
    
    return prompt;
  }

  /**
   * Build analytical reasoning prompt
   */
  buildAnalyticalPrompt(entitySummaries, originalQuery) {
    const entities = Object.keys(entitySummaries);
    
    let prompt = `Please provide a structured analysis for: ${originalQuery}\n\n`;
    
    // Step 1: Context and background
    entities.forEach((entity, index) => {
      prompt += `Step ${index + 1}: ${entity.charAt(0).toUpperCase() + entity.slice(1)} Context:\n`;
      prompt += `${entitySummaries[entity]}\n\n`;
    });
    
    // Step 2: Technical analysis
    prompt += `Step ${entities.length + 1}: Technical Analysis:\n`;
    prompt += `Analyze the technical aspects, implementation details, and design decisions.\n\n`;
    
    // Step 3: Implications and insights
    prompt += `Step ${entities.length + 2}: Implications:\n`;
    prompt += `Discuss the broader implications, advantages, limitations, and potential applications.\n\n`;
    
    return prompt;
  }

  /**
   * Generate structured response using LLM
   */
  async generateStructuredResponse(structuredPrompt, orchestrator, agentState, cseContext) {
    const messages = [
      {
        role: 'system',
        content: 'You have access to LPAC (Leo Persistent AI Cognition), which provides project memory and context. Provide detailed, structured responses based on the given context and prompts. Use the structured format provided and be thorough in your analysis.'
      },
      {
        role: 'user',
        content: structuredPrompt
      }
    ];
    
    // Use the LLM context manager to generate response
    const llmContextManager = orchestrator.llmContextManager;
    if (llmContextManager && typeof llmContextManager.generateResponse === 'function') {
      return await llmContextManager.generateResponse({
        prompt: messages,
        context: cseContext
      });
    }
    
    // Fallback to direct LLM call
    const llmClient = orchestrator.llmClient;
    if (llmClient && typeof llmClient.generate === 'function') {
      return await llmClient.generate(messages);
    }
    
    return 'Unable to generate structured response - LLM not available';
  }
}

module.exports = OrchestratorAgentLoop;
