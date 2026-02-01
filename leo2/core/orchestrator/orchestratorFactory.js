/**
 * Leo Orchestrator Factory
 * 
 * Factory function to create and initialize a LeoOrchestrator with all
 * required cognitive components. This ensures proper dependency injection
 * and initialization order.
 * 
 * @created 2025-08-01
 * @phase COS Implementation
 */

const LeoOrchestrator = require('./LeoOrchestrator');
const path = require('path');
const { memoryManager } = require('../../../lib/services/memory-manager.js');
const legacyGraph = require('../../../lib/services/memory-graph-integration.js');
const factoryLogger = require('../../services/logger');
const OrchestratorAgentLoop = require('../agent/orchestratorAgentLoop');
const LLMContextManager = require('../llm/llmContextManager');
const CapabilityRegistry = require('../registry/capabilityRegistry');

// Add missing imports for top-level factory
const { MemoryGraph } = require('../memory/memoryGraph');
const { EmergentCSE } = require('../emergence/EmergentCSE');
const { createComponentLogger } = require('../../services/logger');
// Create simple event bus fallback
const { EventEmitter } = require('events');
const eventBus = new EventEmitter();

// Optional imports with fallbacks
let UnifiedAwarenessService, ModernMetaAgentRouter, SemanticContextManager;
try {
  UnifiedAwarenessService = require('../awareness/unifiedAwarenessService');
} catch (_) { UnifiedAwarenessService = null; }
try {
  ModernMetaAgentRouter = require('../meta/modernMetaAgentRouter');
} catch (_) { ModernMetaAgentRouter = null; }
try {
  SemanticContextManager = require('../context/semanticContextManager');
} catch (_) { SemanticContextManager = null; }

// Import optional components
let FeedbackManager;
try {
  FeedbackManager = require('../../../leo/tools/meta_programming/router/feedback_manager');
} catch (error) {
  // FeedbackManager is optional
}

let ContextProcessor;
try {
  ContextProcessor = require('../context/contextProcessor');
} catch (error) {
  // ContextProcessor is optional
}

let MetaAgentRouter;
try {
  MetaAgentRouter = require('../meta/metaAgentRouter');
} catch (error) {
  // MetaAgentRouter is optional
}

let FlowMonitor;
try {
  FlowMonitor = require('../flow/flowMonitor');
} catch (error) {
  // FlowMonitor is optional
}

let InteractionMemorySystem;
try {
  InteractionMemorySystem = require('../memory/interactionMemorySystem');
} catch (error) {
  // InteractionMemorySystem is optional
}

const { PermissionController } = require('../security/permissionController');
const { BackupManager } = require('../safety/backupManager');

// Use factory logger for this module
const logger = factoryLogger;

// --- Init diagnostics + timeouts (pilot-safe) ---
const INIT_TIMEOUT_MS = Number(process.env.LEO_INIT_TIMEOUT_MS || 20000);
const nowIso = () => new Date().toISOString();
const logInit = (...args) => {
  try {
    console.log(`[INIT ${nowIso()}]`, ...args);
  } catch (_) {}
};
async function withTimeout(promise, label, timeoutMs = INIT_TIMEOUT_MS) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`INIT TIMEOUT after ${timeoutMs}ms: ${label}`)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    return result;
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Create and initialize a LeoOrchestrator with all cognitive components
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.config - Orchestrator configuration
 * @param {Object} options.memoryGraphConfig - Memory graph configuration
 * @param {Object} options.cseConfig - CSE configuration
 * @param {Object} options.agentLoopConfig - Agent loop configuration
 * @param {Object} options.llmConfig - LLM configuration
 * @returns {Promise<LeoOrchestrator>} Initialized orchestrator
 */
async function createLeoOrchestrator(options = {}) {
  try {
    logger.info('Creating LeoOrchestrator with cognitive components');
    logInit('createLeoOrchestrator: entered');
    
    const {
      config = {},
      memoryGraphConfig = {},
      cseConfig = {},
      agentLoopConfig = {},
      llmConfig = {}
    } = options;
    
    // Initialize core cognitive components
    logger.info('Initializing core cognitive components');
    
    // 1. Memory Graph - The brain
    const memoryGraph = new MemoryGraph(memoryGraphConfig);
    logger.info('Memory graph created');
    
    // WEEK 1: Register embedding service placeholder (will be set after embeddings initialize)
    memoryGraph.embeddings = null;
    
    // 2. Embeddings Service Injection - Initialize first for awareness components
    let embeddingsService;
    try {
      // Try DI container first
      const diContainer = require('../../runtime/diContainer');
      const existing = diContainer?.get?.('EmbeddingsService');
      if (existing) {
        // Do NOT print the "NOT found" diagnostic here
        embeddingsService = existing;
        console.log('[DIAGNOSTIC] Embeddings service resolved from DI container.');
      } else {
        embeddingsService = diContainer.resolve('EmbeddingsService');
        console.log('[DIAGNOSTIC] Embeddings service resolved from DI container.');
      }
    } catch (err) {
      // Check if embeddings are already initialized globally
      if (globalThis.__LEO_EMBEDDINGS_READY__) {
        console.log('🔧 Embeddings already initialized (skipping DI fallback)');
        const tsePath = path.resolve(__dirname, '../../../lib/services/true-semantic-embeddings.js');
        embeddingsService = require(tsePath);
      } else {
        // Fallback to TSE (True Semantic Embeddings) - canonical interface with OpenAI/Ollama/local backends
        console.warn('[DIAGNOSTIC] Embeddings service NOT found in DI container, falling back to TSE.');
        const tsePath = path.resolve(__dirname, '../../../lib/services/true-semantic-embeddings.js');
        console.warn('[DIAGNOSTIC] TSE path resolved to:', tsePath);
        embeddingsService = require(tsePath);
        
        // Initialize TSE with fail-fast validation for pilot mode
        if (typeof embeddingsService.initialize === 'function' && !embeddingsService.initialized) {
          const isPilotMode = process.env.LEO_PILOT_MODE === 'true';
          logInit('Embeddings(TSE): initialize start', { isPilotMode });
          await withTimeout(
            embeddingsService.initialize({
              config: {
                EMBEDDING_DIMENSIONS: 1536,
                CACHE_DIR: './.leo_cache',
                CACHE_FILE: 'embeddings-cache.json'
              },
              // Fail fast if no high-quality backend available in pilot mode
              requireHighQualityBackend: isPilotMode
            }),
            'Embeddings(TSE).initialize'
          );
          logInit('Embeddings(TSE): initialize done');
          
          // Log backend info at server boot
          const backendType = embeddingsService._getBackendType?.() || 'unknown';
          const backend = embeddingsService._getBackend?.();
          const dimensions = backend?.getDimension?.() || 'unknown';
          
          console.log(`[EMBEDDINGS] TSE initialized successfully`);
          console.log(`[EMBEDDINGS] Backend type: ${backendType}`);
          console.log(`[EMBEDDINGS] Dimensions: ${dimensions}D`);
          console.log(`[EMBEDDINGS] Pilot mode: ${isPilotMode ? 'ENABLED' : 'disabled'}`);
          
          // SANITY CHECK: Generate test embedding and verify it's real
          try {
            const testEmbed = await embeddingsService.generate('embedding_sanity_test');
            const norm = Math.sqrt(testEmbed.reduce((sum, v) => sum + v * v, 0));
            const allZeros = testEmbed.every(v => v === 0);
            
            console.log(`[EMBEDDINGS] Sanity check: dim=${testEmbed.length}, norm=${norm.toFixed(4)}, zeros=${allZeros}`);
            
            if (allZeros || norm === 0) {
              const errorMsg = `[EMBEDDINGS] ❌ SANITY CHECK FAILED: Embeddings are all zeros (backend=${backendType})`;
              console.error(errorMsg);
              if (isPilotMode) {
                throw new Error('PILOT MODE: Embeddings sanity check failed - cannot proceed with zero vectors');
              }
            } else if (backendType === 'openai' && testEmbed.length !== 1536) {
              console.error(`[EMBEDDINGS] ⚠️  WARNING: OpenAI backend but dimension is ${testEmbed.length}, expected 1536`);
            } else if (backendType === 'fallback-hash-only') {
              const errorMsg = `[EMBEDDINGS] ❌ CRITICAL: Backend is hash-only, semantic search will not work`;
              console.error(errorMsg);
              if (isPilotMode) {
                throw new Error('PILOT MODE: Hash-only backend detected - semantic search required for pilot');
              }
            } else {
              console.log(`[EMBEDDINGS] ✅ Sanity check PASSED: Embeddings are valid`);
            }
          } catch (sanityErr) {
            console.error(`[EMBEDDINGS] ❌ Sanity check failed:`, sanityErr.message);
            if (isPilotMode) {
              throw sanityErr;
            }
          }
        }
        globalThis.__LEO_EMBEDDINGS_READY__ = true;
      }
    }
    
    // WEEK 1: Register embedding service on memoryGraph with compatibility adapter
    if (embeddingsService) {
      const embeddingsAdapter = {
        generateEmbedding: embeddingsService.generateEmbedding || embeddingsService.generate
      };
      memoryGraph.embeddings = embeddingsAdapter;
      
      if (process.env.LEO_ALE_DEBUG === 'true') {
        console.log('[MemoryGraph] Embedding service registered');
      }
    } else {
      console.warn('[MemoryGraph] No embedding service available - conversation embeddings will be skipped');
    }
    
    // 2.5. LLM Service Injection - Get from DI container
    let llmService;
    try {
      const diContainer = require('../../runtime/diContainer');
      llmService = diContainer?.get?.('LLMService');
      if (llmService) {
        console.log('[DIAGNOSTIC] LLM service resolved from DI container.');
      } else {
        console.warn('[DIAGNOSTIC] LLM service NOT found in DI container.');
        llmService = null;
      }
    } catch (err) {
      console.warn('[DIAGNOSTIC] Failed to access DI container for LLM service:', err.message);
      llmService = null;
    }
    
    // 3. Awareness Layer - For conversation event processing and cognitive flow tracking
    const flowMonitor = new FlowMonitor({
      logger: createComponentLogger('FlowMonitor')
    });
    logger.info('Flow monitor created');
    
    const contextProcessor = new ContextProcessor({
      memoryGraph,
      logger: createComponentLogger('ContextProcessor')
    });
    logger.info('Context processor created');
    
    const interactionMemorySystem = new InteractionMemorySystem({
      memoryGraph,
      logger: createComponentLogger('InteractionMemorySystem')
    });
    logger.info('Interaction memory system created');
    
    const unifiedAwarenessService = new UnifiedAwarenessService({
      memoryGraph,
      contextProcessor,
      flowMonitor,
      interactionMemory: interactionMemorySystem,
      cse: null // Will be set after CSE creation
    });
    logger.info('Unified awareness service created');
    
    // === META AGENT ROUTER INITIALIZATION ===
    const metaAgentRouter = new ModernMetaAgentRouter({
      logger: createComponentLogger('MetaAgentRouter')
    });
    logger.info('Meta Agent Router created');
    
    // === BACKUP MANAGER INITIALIZATION ===
    const backupManager = new BackupManager(createComponentLogger('BackupManager'));
    logInit('BackupManager: initialize start');
    await withTimeout(backupManager.initialize(), 'BackupManager.initialize');
    logInit('BackupManager: initialize done');
    logger.info('Backup Manager created and initialized');
    
    // 4. Emergent CSE - The attention mechanism
    // Create OptimizedMemoryRetrieval first
    const OptimizedMemoryRetrieval = require('../memory/OptimizedMemoryRetrieval');
    const optimizedRetrieval = new OptimizedMemoryRetrieval({
      memoryGraph,
      emergentCSE: null, // Will be set after CSE creation
      tseInstance: embeddingsService
    });
    logger.info('OptimizedMemoryRetrieval created');
    
    // Create CSE
    const cse = new EmergentCSE({ 
      memoryGraph, 
      flowMonitor, 
      interactionMemory: interactionMemorySystem, // Use proper interaction memory system
      embeddingsInterface: embeddingsService // Pass embeddings via DI
    });
    
    // Wire optimized retrieval into CSE
    optimizedRetrieval.emergentCSE = cse;
    cse.optimizedRetrieval = optimizedRetrieval;
    logger.info('OptimizedMemoryRetrieval wired into CSE');
    
    // Wire CSE into awareness service
    unifiedAwarenessService.cse = cse;
    // Normalize embeddings interface method name
    if (embeddingsService) {
      const method = embeddingsService.generateEmbedding || embeddingsService.generate;
      if (!method) {
        throw new Error('Embeddings service has no generateEmbedding/generate method');
      }
      cse.embeddingsInterface = { generateEmbedding: method.bind(embeddingsService) };
    }
    
    // DIAGNOSTIC: Confirm CSE instantiation and embeddings injection
    console.log('[DIAGNOSTIC] CSE created:', {
      cseType: cse.constructor.name,
      embeddingsInterfaceSet: !!cse.embeddingsInterface,
      embeddingsType: cse.embeddingsInterface?.constructor?.name,
      hasGenerateMethod: typeof cse.embeddingsInterface?.generateEmbedding === 'function',
      memoryGraphProvided: !!memoryGraph
    });
    logger.info('CSE created with proper dependencies');
    
    // 3. Capability Registry - The skill tracking (must be created before agent loop)
    const capabilityRegistry = new CapabilityRegistry();
    logger.info('Capability registry created');
    
    // 4. LLM Interface - The language processing
    const llmInterface = llmService || LLMContextManager; // Use DI container LLM service or fallback
    logger.info('LLM interface created:', llmService ? 'from DI container' : 'fallback to LLMContextManager');
    
    // Initialize optional components first
    let feedbackManager = null;
    if (FeedbackManager) {
      try {
        feedbackManager = new FeedbackManager();
        logger.info('Feedback manager created');
      } catch (error) {
        logger.warn('Could not create feedback manager', error);
      }
    }
    
    let semanticContextManager = null;
    if (SemanticContextManager) {
      try {
        semanticContextManager = SemanticContextManager;
        logger.info('Semantic context manager available');
      } catch (error) {
        logger.warn('Could not access semantic context manager', error);
      }
    }
    
    // Create orchestrator first to get the ports interface
    console.log('[CRITICAL FACTORY DEBUG] Creating LeoOrchestrator first to provide ports...');
    const orchestrator = new LeoOrchestrator({
      memoryGraph,
      cse,
      llmInterface,
      capabilityRegistry,
      feedbackManager,
      semanticContextManager,
      // Awareness components for Phase 3 conversation memory
      unifiedAwarenessService,
      contextProcessor,
      flowMonitor,
      interactionMemorySystem,
      // Meta agent router
      metaAgentRouter,
      // Safety components
      backupManager,
      config: {
        orchestrationStrategy: 'emergent',
        enableOrchestration: true
      }
    });
    
    // Back-compat: expose a canonical memory context method on the orchestrator
    orchestrator.getMemoryContext = async (query, opts = {}) => {
      if (cse && typeof cse.getEmergentContext === 'function') {
        return cse.getEmergentContext(query, opts);
      }
      return { memories: [], salience: [], rationale: 'no-cse' };
    };
    
    // Create ports interface for agent loop (no circular references)
    console.log('[FACTORY DEBUG] Creating ports object...');
    const ports = {
      generateResponse: async (messages, options = {}) => {
        console.log('[PORTS DEBUG] generateResponse called with messages:', messages?.length || 0);
        const { max_tokens = 4000, temperature = 0.7, top_p = 0.9, salientMemories = [] } = options;
        
        // PHASE 1: Use orchestrator's generateLLMResponse (includes all improvements)
        console.log('[PORTS DEBUG] ========== PHASE 1 CHECK ==========');
        console.log('[PORTS DEBUG] orchestrator exists:', !!orchestrator);
        console.log('[PORTS DEBUG] orchestrator.generateLLMResponse type:', typeof orchestrator?.generateLLMResponse);
        console.log('[PORTS DEBUG] orchestrator methods:', orchestrator ? Object.keys(orchestrator).filter(k => typeof orchestrator[k] === 'function').slice(0, 10) : []);
        console.log('[PORTS DEBUG] salientMemories:', salientMemories?.length || 0);
        console.log('[PORTS DEBUG] =====================================');
        
        if (orchestrator && typeof orchestrator.generateLLMResponse === 'function') {
          console.log('[PORTS DEBUG] ✅ Using orchestrator.generateLLMResponse (Phase 1 path)');
          try {
            // Extract query from last user message
            const query = messages[messages.length - 1]?.content || '';
            const context = salientMemories || [];
            
            console.log('[PORTS DEBUG] Calling generateLLMResponse with:', { queryLength: query.length, contextLength: context.length });
            
            const result = await orchestrator.generateLLMResponse({
              query,
              context,
              strategy: context.length > 0 ? 'memory_informed' : 'general_knowledge'
            });
            
            console.log('[PORTS DEBUG] ✅ Phase 1 response received, length:', result?.length);
            return result;
          } catch (error) {
            console.error('[PORTS DEBUG] ❌ orchestrator.generateLLMResponse failed:', error.message, error.stack);
            // Fall through to legacy path
          }
        } else {
          console.log('[PORTS DEBUG] ⚠️ orchestrator.generateLLMResponse NOT available, using fallback');
        }
        
        // FALLBACK: Lazy initialize LLM if not available
        if (!llmInterface || typeof llmInterface.generate !== 'function') {
          try {
            const diContainer = require('../runtime/diContainer');
            const LLMGateway = require('../llm/llm-gateway');
            
            if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
              console.warn('[PORTS DEBUG] No Claude API key found');
              return 'Response generation not available - API key not configured';
            }
            
            console.log('[PORTS DEBUG] ANTHROPIC_API_KEY_SET:', Boolean(process.env.ANTHROPIC_API_KEY));
            console.log('[PORTS DEBUG] CLAUDE_API_KEY_SET:', Boolean(process.env.CLAUDE_API_KEY));
            console.log('[PORTS DEBUG] OPENAI_API_KEY_SET:', Boolean(process.env.OPENAI_API_KEY));
            
            llmInterface = LLMGateway;
            
            diContainer.register('LLMService', llmInterface);
            console.log('[PORTS DEBUG] LLM interface initialized lazily');
          } catch (error) {
            console.error('[PORTS DEBUG] Failed to initialize LLM:', error.message);
            return `I apologize, but I encountered an issue initializing the LLM: ${error.message}`;
          }
        }
        
        try {
          const response = await llmInterface.generate(messages, {
            max_tokens,
            temperature,
            top_p
          });
          console.log('[PORTS DEBUG] LLM response received (fallback path), length:', response?.length);
          return response;
        } catch (error) {
          console.error('[PORTS DEBUG] LLM generation error:', error.message);
          return `I apologize, but I encountered an issue generating a response: ${error.message}`;
        }
      },
      // Always prefer CSE (authoritative), fall back to orchestrator hook if present
      getSalientContext: async (query, opts = {}) => {
        if (cse && typeof cse.getEmergentContext === 'function') {
          const fusion = await cse.getEmergentContext(query, opts);
          orchestrator.lastFusionContext = fusion;            // expose for /fusion-fit
          eventBus.emit('fusion:updated', fusion);            // notify UI/status cache
          return fusion;
        }
        if (orchestrator && typeof orchestrator.getMemoryContext === 'function') {
          const fusion = await orchestrator.getMemoryContext(query, opts);
          orchestrator.lastFusionContext = fusion;
          eventBus.emit('fusion:updated', fusion);
          return fusion;
        }
        return { memories: [], salience: [], rationale: 'no-cse' };
      },
      updateMemory: async (...args) => {
        if (orchestrator.updateMemory) {
          return await orchestrator.updateMemory(...args);
        }
      },
      searchMemory: async (...args) => {
        if (orchestrator.searchMemory) {
          return await orchestrator.searchMemory(...args);
        }
        return [];
      },
      getAgentState: () => orchestrator.agentState || {},
      updateAgentState: (...args) => {
        if (orchestrator.updateAgentState) {
          orchestrator.updateAgentState(...args);
        }
      },
      logInteraction: (...args) => {
        if (orchestrator.logInteraction) {
          orchestrator.logInteraction(...args);
        }
      },
      emitEvent: (event, data) => eventBus.emit(event, data),
      getMemoryGraph: () => orchestrator.memoryGraph || null
    };
    
    // Add fusion payload builder
    ports.buildFusionContext = (fusion) => {
      // Normalize what the agent loop expects
      const cards = fusion?.memories || fusion?.cards || [];
      return {
        summary: fusion?.summary || '',
        rationale: fusion?.rationale || '',
        cards: cards.map(c => ({
          id: c.id || c.content_id,
          text: c.text || c.content,
          score: c.score ?? c.salience ?? 0,
          source: c.source || c.meta?.source_uri
        }))
      };
    };
    
    // Enhance generateResponse to cache fusion context (agent loop handles memory injection)
    const originalGenerateResponse = ports.generateResponse;
    ports.generateResponse = async (messages, options = {}) => {
      console.log('🔥🔥🔥 [WRAPPER] WRAPPER CALLED 🔥🔥🔥');
      console.log('[WRAPPER DEBUG] generateResponse wrapper called, options:', Object.keys(options));
      console.log('[WRAPPER DEBUG] salientMemories present:', !!options.salientMemories, 'count:', options.salientMemories?.length);
      
      // 1) Get fusion from CSE for caching/metrics only
      const lastMessage = messages?.[messages.length - 1]?.content || '';
      const fusion = await ports.getSalientContext(lastMessage, { max: 8 });

      // 2) Keep a snapshot for /fusion-fit and panels (don't modify messages - agent loop handles memory)
      orchestrator.lastFusionContext = fusion;
      eventBus.emit('fusion:updated', fusion);

      // 3) Call the original LLM path without modification (agent loop already includes memory)
      console.log('[WRAPPER DEBUG] Calling originalGenerateResponse...');
      const result = await originalGenerateResponse(messages, options);
      console.log('[WRAPPER DEBUG] originalGenerateResponse returned, length:', result?.length || result?.text?.length);
      return result;
    };
    
    // Add compatibility shim for searchMemories
    ports.searchMemories = ports.searchMemories || ((q, o) => ports.getSalientContext?.(q, o) || []);
    
    // Debug: Verify ports object has all methods
    console.log('[FACTORY DEBUG] Ports object methods:', Object.keys(ports).filter(k => typeof ports[k] === 'function'));
    
    // Create agent loop with ports interface - NO orchestrator parameter to prevent circular reference
    console.log('[CRITICAL FACTORY DEBUG] Creating OrchestratorAgentLoop with ports interface...');
    const agentLoop = new OrchestratorAgentLoop(ports, config.agentLoop || {});
    console.log('[CRITICAL FACTORY DEBUG] OrchestratorAgentLoop instantiated successfully');
    
    // Set up the agent loop reference WITHOUT creating circular dependency
    orchestrator.agentLoop = agentLoop;
    
    // CRITICAL: Ensure no circular reference exists
    console.log('[FACTORY] Agent loop created without orchestrator reference - no circular dependency');
    
    // Initialize the agent loop
    logInit('AgentLoop: initialize start');
    await withTimeout(agentLoop.initialize(), 'AgentLoop.initialize');
    logInit('AgentLoop: initialize done');
    logger.info('OrchestratorAgentLoop created and initialized');
    
    // Initialize orchestrator logger - temporarily disabled for demo
    const orchestratorLogger = null;
    logInit('LeoOrchestrator: initialize start');
    const initialized = await withTimeout(orchestrator.initialize(), 'LeoOrchestrator.initialize');
    logInit('LeoOrchestrator: initialize done', { initialized });
    
    if (!initialized) {
      throw new Error('Failed to initialize LeoOrchestrator');
    }
    
    logger.info('LeoOrchestrator created and initialized successfully', {
      sessionId: orchestrator.agentState.sessionId,
      components: {
        memoryGraph: !!memoryGraph,
        cse: !!cse,
        agentLoop: !!agentLoop,
        llmInterface: !!llmInterface,
        capabilityRegistry: !!capabilityRegistry,
        feedbackManager: !!feedbackManager,
        semanticContextManager: !!semanticContextManager,
        unifiedAwarenessService: !!unifiedAwarenessService,
        contextProcessor: !!contextProcessor,
        metaAgentRouter: !!metaAgentRouter,
        backupManager: !!backupManager,
        flowMonitor: !!flowMonitor,
        interactionMemorySystem: !!interactionMemorySystem
      }
    });
    
    // Attach ports interface to orchestrator for external access
    orchestrator.ports = ports;
    
    return orchestrator;
    
  } catch (error) {
    logger.error('Failed to create LeoOrchestrator', error);
    throw error;
  }
}

// Singleton orchestrator with lazy initialization
let _orchestrator = null;
let _initPromise = null;

/**
 * Get Leo Orchestrator - lazy + idempotent with no side-effects during init
 */
async function getLeoOrchestrator() {
  logInit('getLeoOrchestrator: called', { hasOrchestrator: !!_orchestrator, hasInitPromise: !!_initPromise });
  if (_orchestrator) return _orchestrator;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    logInit('[LAZY ORCHESTRATOR] Starting lazy initialization...');
    
    const config = require('../../config/leo-config.json');
    
    // Create a minimal orchestrator without agent loop to avoid circular dependency
    const LeoOrchestrator = require('./LeoOrchestrator');
    const { MemoryGraph } = require('../memory/memoryGraph');
    const { EmergentCSE } = require('../emergence/EmergentCSE');
    
    // Use centralized paths.js to avoid directory confusion
    const { getInteractionsPath, PATHS } = require('../utils/paths');
    const DATA_DIR = PATHS?.dataDir || path.dirname(getInteractionsPath());

    const paths = {
      dataDir: DATA_DIR,
      chunksFile: PATHS?.chunksFile,
      embeddingsFile: PATHS?.embeddingsFile,
      memoryGraphFile: PATHS?.chunksFile, // Same as chunksFile
      interactionsFile: getInteractionsPath(),
      sessionsDir: PATHS?.sessionsDir || path.join(DATA_DIR, 'sessions'),
      cacheDir: PATHS?.cacheDir || path.join(DATA_DIR, 'cache')
    };

    if (!paths.chunksFile || !paths.embeddingsFile) {
      throw new Error(
        `[LAZY ORCHESTRATOR] Invalid PATHS export from core/utils/paths.js. ` +
        `Expected PATHS.chunksFile and PATHS.embeddingsFile to be set. Got chunksFile=${paths.chunksFile}, embeddingsFile=${paths.embeddingsFile}`
      );
    }
    
    const memoryGraph = new MemoryGraph({
      dataDir: paths.dataDir,
      enablePersistence: true,
      enableEmbeddings: true,
      autoIngestOnInit: false,
      autoBackfillEmbeddingsOnInit: false,
      emitEvents: false,
      bootMode: true
    });
    
    // Create OptimizedMemoryRetrieval for lazy orchestrator
    const OptimizedMemoryRetrieval = require('../memory/OptimizedMemoryRetrieval');
    const embeddingsService = memoryGraph.embeddingsService || null;
    const optimizedRetrieval = new OptimizedMemoryRetrieval({
      memoryGraph,
      emergentCSE: null, // Will be set after CSE creation
      tseInstance: embeddingsService
    });
    console.log('[LAZY ORCHESTRATOR] OptimizedMemoryRetrieval created');
    
    // Initialize CSE with background jobs disabled
    const cse = new EmergentCSE(memoryGraph, {
      ...config.cse,
      startWatchers: false,
      enableBackgroundJobs: false
    });
    
    // Wire optimized retrieval into CSE
    optimizedRetrieval.emergentCSE = cse;
    cse.optimizedRetrieval = optimizedRetrieval;
    console.log('[LAZY ORCHESTRATOR] OptimizedMemoryRetrieval wired into CSE');
    
    // Create agent loop with proper ports interface
    const OrchestratorAgentLoop = require('../agent/orchestratorAgentLoop');
    
    // Orchestrator reference (will be set after creation)
    let orchestratorRef = null;
    
    // Create ports interface for agent loop
    const ports = {
      generateResponse: async (messages, options = {}) => {
        const { salientMemories = [] } = options;
        
        console.log('[LAZY PORTS] generateResponse called, salientMemories:', salientMemories?.length || 0);
        
        // PHASE 1: Use Orchestrator.generateLLMResponse if available (closure access)
        if (orchestratorRef && typeof orchestratorRef.generateLLMResponse === 'function') {
          console.log('[LAZY PORTS] Using Orchestrator.generateLLMResponse (Phase 1)');
          try {
            const query = messages[messages.length - 1]?.content || '';
            const context = salientMemories || [];
            
            return await orchestratorRef.generateLLMResponse({
              query,
              context,
              strategy: context.length > 0 ? 'memory_informed' : 'general_knowledge'
            });
          } catch (error) {
            console.error('[LAZY PORTS] Orchestrator.generateLLMResponse failed:', error.message);
            // Fall through to legacy
          }
        } else {
          console.log('[LAZY PORTS] Orchestrator.generateLLMResponse not available, using fallback');
        }
        
        // FALLBACK: Direct LLM Gateway
        console.log('[LAZY PORTS] Using fallback LLM Gateway');
        try {
          const LLMGateway = require('../llm/llm-gateway');
          return await LLMGateway.generate(messages, options);
        } catch (llmError) {
          console.error('[LLM ERROR]', llmError.message);
          throw new Error(`LLM generation failed: ${llmError.message}`);
        }
      },
      getSalientContext: async (...args) => {
        if (cse && cse.getEmergentContext) {
          return await cse.getEmergentContext(...args);
        }
        return {};
      },
      updateMemory: async (...args) => {
        if (memoryGraph && memoryGraph.addMemory) {
          return await memoryGraph.addMemory(...args);
        }
      },
      searchMemory: async (...args) => {
        if (memoryGraph && memoryGraph.searchMemories) {
          return await memoryGraph.searchMemories(...args);
        }
        return [];
      },
      getAgentState: () => ({}),
      updateAgentState: (...args) => {
        if (cse && cse.updateAgentState) {
          cse.updateAgentState(...args);
        }
      },
      logInteraction: (...args) => {
        if (cse && cse.logInteraction) {
          cse.logInteraction(...args);
        }
      },
      emitEvent: (...args) => {
        if (cse && cse.emitEvent) {
          cse.emitEvent(...args);
        }
      },
      // OPTION A: Provide orchestrator access for Phase 1 bypass
      getOrchestrator: () => orchestratorRef,
      // VisionAnchor support for continue command
      getMemoryGraph: () => memoryGraph || null
    };
    
    // Create agent loop with ports
    const agentLoop = new OrchestratorAgentLoop(ports, config.agentLoop || {});
    await agentLoop.initialize();
    
    // Create LLM interface for orchestrator
    const LLMGateway = require('../llm/llm-gateway');
    console.log('[LAZY ORCHESTRATOR] LLMGateway loaded, has generate:', typeof LLMGateway.generate);
    
    // PHASE 3: Create awareness components for conversation turn recording
    const FlowMonitor = require('../awareness/flowMonitor');
    const ContextProcessor = require('../awareness/contextProcessor');
    const InteractionMemorySystem = require('../awareness/interactionMemorySystem');
    const UnifiedAwarenessService = require('../awareness/unifiedAwarenessService');
    
    const flowMonitor = new FlowMonitor({ logger: { info: () => {}, warn: () => {}, error: () => {} } });
    const contextProcessor = new ContextProcessor({ memoryGraph, logger: { info: () => {}, warn: () => {}, error: () => {} } });
    const interactionMemorySystem = new InteractionMemorySystem({ memoryGraph, logger: { info: () => {}, warn: () => {}, error: () => {} } });
    const unifiedAwarenessService = new UnifiedAwarenessService({
      memoryGraph,
      contextProcessor,
      flowMonitor,
      interactionMemory: interactionMemorySystem,
      cse
    });
    console.log('[LAZY ORCHESTRATOR] Phase 3 awareness components created');
    
    // Create orchestrator with agent loop - prevent Winston logger conflicts
    const orchestrator = new LeoOrchestrator({
      agentLoop,
      memoryGraph,
      cse,
      llmInterface: LLMGateway,  // CRITICAL: Pass LLM interface for Phase 1 (correct param name!)
      // Phase 3 awareness components for conversation turn recording
      unifiedAwarenessService,
      contextProcessor,
      flowMonitor,
      interactionMemorySystem,
      config: config.orchestrator || {},
      saveOnInit: false,
      // Disable file logging during init to prevent stream conflicts
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
      }
    });
    
    // Set orchestrator reference for ports closure
    orchestratorRef = orchestrator;
    console.log('[LAZY ORCHESTRATOR] orchestratorRef set, generateLLMResponse available:', typeof orchestrator.generateLLMResponse);
    
    // Back-compat: expose a canonical memory context method on the orchestrator (lazy path)
    orchestrator.getMemoryContext = async (query, opts = {}) => {
      if (cse && typeof cse.getEmergentContext === 'function') {
        return cse.getEmergentContext(query, opts);
      }
      return { memories: [], salience: [], rationale: 'no-cse' };
    };
    
    // Initialize orchestrator without file logging
    await orchestrator.initialize();
    
    // Attach ports interface to orchestrator for external access
    orchestrator.ports = ports;
    
    console.log('[LAZY ORCHESTRATOR] Orchestrator created successfully');
    _orchestrator = orchestrator;
    return orchestrator;
  })();

  return _initPromise;
}

/**
 * Create a default Leo Orchestrator with standard configuration
 * @deprecated Use getLeoOrchestrator() instead for lazy initialization
 */
async function createDefaultLeoOrchestrator() {
  logInit('createDefaultLeoOrchestrator: called');
  return getLeoOrchestrator();
}

/**
 * Create Leo Orchestrator with default strategy configuration
 * @param {Object} strategyConfig - Optional strategy configuration to override defaults
 * @returns {Promise<LeoOrchestrator>} initialized Orchestrator with defaults
 */
async function createLeoOrchestratorWithStrategy(strategyConfig = {}) {
  const defaultConfig = {
    // Agent loop configuration
    enableReflection: true,
    enableUpdate: true,
    enableMetaCognition: true,
    // CSE configuration
    enableSalienceRanking: true,
    enableIdentityInjection: false, // Pure emergent - only from memory
    enableCapabilityInjection: false, // Pure emergent - only from memory
    maxSalientMemories: 5,
    
    // Memory configuration
    enableMemoryUpdates: true,
    enableLearning: true,
    
    // Orchestration configuration
    skillSelectionThreshold: 0.5,
    maxSkillsConsidered: 5,
    enableSkillChaining: true,
    
    // Awareness configuration
    enableAwarenessProcessing: true,
    awarenessBufferSize: 20,
    enableFlowMonitoring: true,
    
    // Debugging configuration
    enableIntrospection: true,
    logAgentState: true
  };
  
  // Merge strategy config with defaults (strategy config takes precedence)
  const mergedConfig = {
    ...defaultConfig,
    ...strategyConfig
  };
  
  logger.info('Creating LeoOrchestrator with strategy configuration', {
    strategyName: strategyConfig.strategyName || 'default',
    strategyDescription: strategyConfig.strategyDescription || 'Default configuration',
    config: mergedConfig
  });
  
  return createLeoOrchestrator({
    config: mergedConfig
  });
}

/**
 * Create a LeoOrchestrator for testing with minimal components
 * 
 * @returns {Promise<LeoOrchestrator>} Initialized orchestrator for testing
 */
async function createTestLeoOrchestrator() {
  return createLeoOrchestrator({
    config: {
      // Minimal configuration for testing
      enableReflection: false,
      enableUpdate: false,
      enableMetaCognition: false,
      enableMemoryUpdates: false,
      enableLearning: false,
      enableIntrospection: true,
      logAgentState: false
    }
  });
}

/**
 * Validate that all required components are available
 * 
 * @returns {Object} Validation result with available components
 */
function validateComponents() {
  const validation = {
    success: true,
    components: {
      required: {
        MemoryGraph: !!MemoryGraph,
        
        AgentLoop: !!OrchestratorAgentLoop,
        LLMContextManager: !!LLMContextManager,
        CapabilityRegistry: !!CapabilityRegistry
      },
      optional: {
        FeedbackManager: !!FeedbackManager,
        SemanticContextManager: !!SemanticContextManager
      }
    },
    missing: []
  };
  
  // Check required components
  Object.entries(validation.components.required).forEach(([name, available]) => {
    if (!available) {
      validation.success = false;
      validation.missing.push(name);
    }
  });
  
  return validation;
}

module.exports = {
  createDefaultLeoOrchestrator,
  createLeoOrchestrator,
  getLeoOrchestrator,
  createTestLeoOrchestrator,
  createLeoOrchestratorWithStrategy,
  validateComponents,
  LeoOrchestrator
};
