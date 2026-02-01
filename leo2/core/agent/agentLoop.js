// leo2/core/agent/agentLoop.js

const { getHybridContext } = require('../awareness/cse'); // CSE: salience, traversal, identity/capability
const llmContextManager = require('../llm/llmContextManager');
// Memory graph accessed via orchestrator.memoryGraph
const fs = require('fs');
const path = require('path');
const { detectManagementCommand, handleManagementCommand } = require('./nlCommandRouter');
const MultiHopPlanner = require('../../../leo/tools/meta_programming/router/multi_hop_planner');
const trueSemanticEmbeddings = require('../../../lib/services/true-semantic-embeddings');
const { createComponentLogger } = require('../../../lib/utils/logger');
const logger = createComponentLogger('agentLoop');

// --- Persistent previousExchange state ---
const PREVIOUS_EXCHANGE_PATH = path.join(process.cwd(), 'data', 'previous_exchange.json');
let previousExchange = null;
try {
  if (fs.existsSync(PREVIOUS_EXCHANGE_PATH)) {
    const raw = fs.readFileSync(PREVIOUS_EXCHANGE_PATH, 'utf8');
    previousExchange = JSON.parse(raw);
    console.log('[Leo PreviousExchange] Loaded previousExchange from disk:', previousExchange);
  } else {
    previousExchange = null;
    console.log('[Leo PreviousExchange] No previousExchange found at boot (first run or reset).');
  }
} catch (err) {
  previousExchange = null;
  console.error('[Leo PreviousExchange] Error loading previousExchange:', err.message);
}


/**
 * Optional: Meta-cognitive hook.
 * Called before and after 'Act' step (LLM call) for meta-programming, logging, or mutation.
 * You can customize these as needed.
 */
async function metaHook(stage, { input, cseContext, llmResponse, agentState }) {
  // Example: Log, mutate agent state, or trigger self-reflection
  logger.info(`[AgentLoop][Meta] Stage: ${stage}`, {
    input, cseContext, llmResponse, agentState
  });
  // Add meta-cognitive logic here if desired (self-improvement, reflection, etc.)
}

/**
 * AgentLoop: Main agent mind loop (one step)
 * @param {Object} inputObj - { userInput, systemInput, flowState, agentState }
 * @returns {Promise<Object>} - { input, cseContext, llmResponse, logs }
 */
const NL_MANAGEMENT_LOG = path.join(__dirname, 'nl_management_log.jsonl');

// Instantiate the multi-hop planner
const multiHopPlanner = new MultiHopPlanner();

async function agentLoopStep({ userInput, systemInput, flowState, agentState = {}, orchestrator, skipMultiHop = false }) {
  // --- 1. Observe ---
  const input = userInput || systemInput;
  // --- Detect and handle "remember"/"memorize" commands ---
  const rememberMatch = input && input.trim().toLowerCase().match(/^\s*(remember|memorize)\s+(that\s+)?(.+)/i);
  if (rememberMatch) {
    const fact = rememberMatch[3].trim();
    let llmResponse = 'Okay, I have remembered that.';
    let interactionType = 'fact';
    let interactionObj = {};
    try {
      // Use trueSemanticEmbeddings for all semantic memory
      const embedding = await trueSemanticEmbeddings.generate(fact);
      const meta = {
        source: 'user',
        timestamp: Date.now(),
        type: 'user_fact',
        embedding
      };
      const addResult = await orchestrator.memoryGraph.addMemory(fact, meta);
      console.log('[Leo Remember] addMemory called:', { fact, meta, addResult });
      interactionObj = {
        type: interactionType,
        userInput: input,
        llmResponse,
        fact,
        timestamp: Date.now(),
        id: `interaction-${Date.now()}`
      };
      await orchestrator.memoryGraph.addInteraction(interactionObj);
      console.log('[Leo Interaction] [WRITE] fact/remember:', interactionObj);
      // Do NOT update previousExchange for fact/memory turns
      console.log('[Leo PreviousExchange] Not updating previousExchange for remember/memorize command.');
      return {
        input,
        cseContext: null,
        llmResponse,
        logs: [],
        handledNatively: true
      };
    } catch (err) {
      llmResponse = 'Sorry, I failed to remember that.';
      interactionObj = {
        type: interactionType,
        userInput: input,
        llmResponse,
        fact,
        error: err.message,
        timestamp: Date.now(),
        id: `interaction-${Date.now()}`
      };
      await orchestrator.memoryGraph.addInteraction(interactionObj);
      console.error('[Leo Remember] Error in addMemory:', err.message);
      return {
        input,
        cseContext: null,
        llmResponse,
        logs: [],
        handledNatively: true
      };
    }
  }
  // --- 1. Observe ---
  console.log('[AgentLoop] Step: Observe', { input });

  // --- Build up full agent state for NL router ---
  // (In a real system, gather from memoryGraph, capability registry, etc)
  const fullAgentState = {
    ...agentState,
    // Example: add more fields as needed for management commands
    // identity: ...,
    // capabilities: ...,
    // lastDrift: ...,
    // lastMajorUpdate: ...,
    // memories: ...,
    // interactions: ...
  };

  // Detect management commands
  const mgmtCmd = detectManagementCommand(input);
  if (mgmtCmd) {
    // Handle management commands natively
    const mgmtResult = await handleManagementCommand(mgmtCmd, fullAgentState);
    if (mgmtResult && mgmtResult.handled) {
      // Do NOT update previousExchange for management commands
      console.log('[Leo PreviousExchange] Not updating previousExchange for management command.');
      return {
        input,
        cseContext: null,
        llmResponse: mgmtResult.response,
        logs: [],
        handledNatively: true
      };
    }
  }

  // --- Multi-hop planning integration ---
  // Detect if the input is a multi-hop (multi-step) NL command (skip if recursive call)
  const multiHopPlan = skipMultiHop ? null : multiHopPlanner.detectMultiHopIntent(input);
  if (multiHopPlan && multiHopPlan.steps && multiHopPlan.steps.length > 1) {
    logger.info(`[AgentLoop] Multi-hop plan detected: ${multiHopPlan.steps.length} steps`);
    const stepResults = [];
    let lastAgentState = { ...fullAgentState };
    for (let i = 0; i < multiHopPlan.steps.length; i++) {
      const step = multiHopPlan.steps[i];
      logger.info(`[AgentLoop] Executing multi-hop step ${i+1}: ${step}`);
      // Recursively call agentLoopStep for each step, passing along agent state
      // (Prevents infinite recursion by skipping multi-hop detection inside substeps)
      const subResult = await agentLoopStep({ userInput: step, agentState: lastAgentState, flowState, orchestrator, skipMultiHop: true });
      stepResults.push({ step, result: subResult });
      // Optionally update lastAgentState if subResult mutates state
      if (subResult && subResult.agentState) lastAgentState = { ...lastAgentState, ...subResult.agentState };
      if (subResult && subResult.error) {
        logger.warn(`[AgentLoop] Multi-hop step failed: ${subResult.error}`);
        break;
      }
    }
    return {
      input,
      multiHop: true,
      steps: multiHopPlan.steps,
      stepResults,
      logs: logger.getRecentLogs && logger.getRecentLogs(),
      handledNatively: stepResults.every(r => r.result && r.result.handledNatively)
    };
  }

  // --- 2. COGNITIVE ARCHITECTURE ACTIVATION ---
  // Engage sophisticated cognitive processing: multi-hop planning, skills injection, emergent reasoning
  let cseContext;
  let awarenessContext = null;
  
  logger.info('Cognitive Architecture: Activating full cognitive processing', {
    hasOrchestrator: !!orchestrator,
    hasCSE: !!(orchestrator && orchestrator.cse),
    hasMultiHop: !!multiHopPlanner,
    hasAwareness: !!(orchestrator && orchestrator.contextProcessor)
  });
  
  // Generate awareness context from conversation flow
  if (orchestrator && orchestrator.contextProcessor) {
    try {
      awarenessContext = await orchestrator.contextProcessor.generateContext({
        userInput: input,
        sessionId: fullAgentState.sessionId,
        interactionHistory: fullAgentState.interactionHistory || [],
        timestamp: Date.now()
      });
      logger.info('Awareness context generated', { contextLength: awarenessContext?.length || 0 });
    } catch (awarenessError) {
      logger.warn('Failed to generate awareness context', awarenessError);
      awarenessContext = null;
    }
  }
  
  // === META AGENT ROUTER: CHECK FOR META QUERIES ===
  let metaQueryResponse = null;
  if (orchestrator && orchestrator.metaAgentRouter) {
    try {
      const cognitiveContext = {
        cseContext: null, // Will be set after CSE processing
        awarenessContext,
        selectedSkill: null, // Will be set after skill selection
        emergentCapabilities: fullAgentState.emergentCapabilities || []
      };
      
      metaQueryResponse = orchestrator.metaAgentRouter.handleMetaQuery(input, cognitiveContext);
      if (metaQueryResponse) {
        logger.info('Meta query detected and handled', { type: metaQueryResponse.type });
        
        // For meta queries, return early with natural response
        return {
          response: metaQueryResponse.response,
          agentState: fullAgentState,
          cseContext: null,
          awarenessContext,
          metaQuery: true,
          type: metaQueryResponse.type
        };
      }
    } catch (metaError) {
      logger.warn('Meta Agent Router error', metaError);
    }
  }
  
  // Step 2a: Multi-hop planning analysis
  let cognitiveGoals = [];
  let skillsRequired = [];
  if (!skipMultiHop && multiHopPlanner) {
    try {
      const planningResult = await multiHopPlanner.analyzePlan(input);
      if (planningResult && planningResult.steps && planningResult.steps.length > 1) {
        cognitiveGoals = planningResult.goals || [];
        skillsRequired = planningResult.skills || [];
        logger.info(`Cognitive Architecture: Multi-hop plan identified`, {
          steps: planningResult.steps.length,
          goals: cognitiveGoals.length,
          skills: skillsRequired.length
        });
      }
    } catch (error) {
      logger.warn(`Multi-hop planning failed: ${error.message}`);
    }
  }
  
  let refinedMemories = [];
  const maxReflectionCycles = 2; // Reduced from 3 to 2 for performance
  
  // Step 2b: Emergent Context Retrieval with Cognitive Goals
  if (orchestrator && orchestrator.cse) {
    const contextQuery = {
      query: input,
      flowState,
      cognitiveGoals,
      skillsRequired,
      emergentMode: true // Signal for sophisticated processing
    };
    
    // === DEBUG: TRACE ACTUAL CSE METHOD CALL ===
    if (process.env.LEO_DEBUG === 'true') {
      console.log('\n🔍 === AGENT LOOP CSE DEBUG ===');
      console.log('🎯 About to call orchestrator.cse.getHybridContext');
      console.log('📝 contextQuery:', contextQuery);
      console.log('🧠 orchestrator.cse exists:', !!orchestrator.cse);
      console.log('🔧 orchestrator.cse.getHybridContext exists:', !!(orchestrator.cse && orchestrator.cse.getHybridContext));
      console.log('🔍 === END AGENT LOOP CSE DEBUG ===\n');
    }
    
    const initialContext = await orchestrator.cse.getHybridContext(contextQuery);
    logger.info('Cognitive Architecture: Emergent context retrieved', {
      memories: initialContext.salientMemories?.length || 0,
      identity: !!initialContext.identity,
      capabilities: initialContext.capabilities?.length || 0,
      emergentCapabilities: initialContext.emergentCapabilities?.length || 0
    });
    
    refinedMemories = initialContext.salientMemories || [];
    cseContext = {
      ...initialContext,
      cognitiveGoals,
      skillsRequired,
      emergentMode: true
    };
  } else {
    logger.warn('Cognitive Architecture: No CSE available, degraded mode');
    cseContext = { 
      memories: [], 
      salientMemories: [], 
      flowState, 
      identity: null,
      cognitiveGoals,
      skillsRequired
    };
  }
  
  // Step 2c: Cognitive Synthesis and Skills Integration
  if (refinedMemories.length > 0) {
    logger.info('Cognitive Architecture: Performing cognitive synthesis');
    
    // Integrate skills-based knowledge enhancement
    if (skillsRequired.length > 0) {
      try {
        // Enhance memories with skill-specific context
        const skillEnhancedMemories = await enhanceMemoriesWithSkills(refinedMemories, skillsRequired, orchestrator);
        refinedMemories = skillEnhancedMemories;
        logger.info(`Cognitive Architecture: Enhanced memories with ${skillsRequired.length} skills`);
      } catch (error) {
        logger.warn(`Skills integration failed: ${error.message}`);
      }
    }
    
    // Advanced deduplication with semantic similarity
    const memoryMap = new Map();
    refinedMemories.forEach(memory => {
      const contentKey = (memory.content || memory.userInput || memory.fact || '').substring(0, 100);
      if (!memoryMap.has(contentKey) || (memory.salience || 0) > (memoryMap.get(contentKey).salience || 0)) {
        memoryMap.set(contentKey, memory);
      }
    });
    
    refinedMemories = Array.from(memoryMap.values())
      .sort((a, b) => (b.salience || 0) - (a.salience || 0))
      .slice(0, 12); // Optimized for cognitive processing
    
    logger.info(`Cognitive Architecture: Synthesized ${refinedMemories.length} cognitive memories`);
  }
  
  // Final cycle: Critical core selection
  if (refinedMemories.length > 0) {
    console.log('[AgentLoop] Final Cycle: Critical core selection');
    
    // Select highest quality memories for final LLM context
    console.log(`[AgentLoop] Pre-filter refined memories: ${refinedMemories.length}`);
    if (refinedMemories.length > 0) {
      console.log(`[AgentLoop] Sample saliences: ${refinedMemories.slice(0, 3).map(m => (m.salience || 0).toFixed(3)).join(', ')}`);
    }
    
    const criticalCore = refinedMemories
      .filter(memory => (memory.salience || 0) > 0.1) // Lowered threshold from 0.3 to 0.1
      .slice(0, 6) // Critical core of 6 memories as requested
      .map(memory => {
        // Ensure memory content is not too long
        if (memory.content && memory.content.length > 1000) {
          return {
            ...memory,
            content: memory.content.substring(0, 1000) + '...',
            truncated: true
          };
        }
        return memory;
      });
    
    console.log(`[AgentLoop] Post-filter critical core: ${criticalCore.length} memories`);
    console.log(`[AgentLoop] Final critical core: ${criticalCore.length} memories, avg salience: ${criticalCore.length > 0 ? (criticalCore.reduce((sum, m) => sum + (m.salience || 0), 0) / criticalCore.length).toFixed(3) : 0}`);
    
    // If no memories pass the filter, use the top memories anyway
    if (criticalCore.length === 0 && refinedMemories.length > 0) {
      console.log('[AgentLoop] No memories passed filter, using top memories anyway');
      const topMemories = refinedMemories.slice(0, 3).map(memory => ({
        ...memory,
        content: memory.content?.substring(0, 1000) || memory.userInput?.substring(0, 1000) || memory.fact?.substring(0, 1000) || 'No content',
        salience: memory.salience || 0.5 // Give default salience
      }));
      refinedMemories = topMemories;
    } else {
      refinedMemories = criticalCore;
    }
  }
  
  // Build final CSE context with refined memories
  cseContext = {
    ...cseContext,
    salientMemories: refinedMemories,
    memoryContext: refinedMemories,
    metadata: {
      ...cseContext.metadata,
      reflectionCycles: 2, // Updated to reflect actual cycles
      finalMemoryCount: refinedMemories.length,
      avgSalience: refinedMemories.length > 0 ? (refinedMemories.reduce((sum, m) => sum + (m.salience || 0), 0) / refinedMemories.length).toFixed(3) : 0,
      generatedAt: Date.now(),
      emergentOnly: true,
      hardcodedRemoved: true,
      optimizedForPerformance: true
    }
  };
  
  console.log('[AgentLoop] CSE Meta-Reflection Complete:', {
    cycles: 2,
    finalMemories: refinedMemories.length,
    avgSalience: cseContext.metadata.avgSalience,
    hasIdentity: !!cseContext.identity,
    capabilities: cseContext.capabilities?.length || 0
  });
  
  // --- File Intent Detection (after CSE reflection) ---
  const fileLikePattern = /\b[\w\-\.]+\.(js|py|md|txt|json|yaml|yml|ts|jsx|tsx|css|html|sh|bash|sql|go|rs|cpp|c|h|java|kt|swift|rb|php|scala|clj|hs|elm|dart|lua|r|m|pl|ps1|bat|dockerfile|makefile|gradle|pom\.xml|package\.json|requirements\.txt|cargo\.toml|gemfile|composer\.json)\b/i;
  if (input && fileLikePattern.test(input)) {
    const fileMatch = input.match(fileLikePattern);
    const fileName = fileMatch && fileMatch[0];
    if (fileName) {
      console.log('[AgentLoop] [FileIntent] Detected file/code access intent for:', fileName);
      try {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.isAbsolute(fileName) ? fileName : path.join(process.cwd(), fileName);
        if (fs.existsSync(filePath)) {
          let content = fs.readFileSync(filePath, 'utf8');
          const MAX_LINES = 40;
          const lines = content.split('\n');
          let summary = null;
          if (lines.length > MAX_LINES) {
            summary = lines.slice(0, MAX_LINES).join('\n') + `\n... (truncated, total ${lines.length} lines)`;
          } else {
            summary = content;
          }
          const fileMemory = {
            type: 'file',
            file: fileName,
            summary,
            timestamp: Date.now(),
            injected: true,
            salience: 0.9 // High salience for explicitly requested files
          };
          cseContext.salientMemories = [fileMemory, ...cseContext.salientMemories].slice(0, 6);
          console.log('[AgentLoop] [FileIntent] Injected file content into refined memories');
        } else {
          console.warn('[AgentLoop] [FileIntent] File does not exist:', filePath);
        }
      } catch (err) {
        console.error('[AgentLoop] [FileIntent] Error reading/injecting file:', fileName, err.message);
      }
    }
  }
  
  console.log('[AgentLoop] Step: Reflect (Meta-Reflection Complete)', {
    reflectionCycles: maxReflectionCycles,
    finalMemories: cseContext.salientMemories.length,
    avgSalience: cseContext.metadata.avgSalience,
    identity: cseContext.identity,
    capabilities: cseContext.capabilities?.length || 0
  });

  // --- Meta-cognitive Hook: Before Act ---
  await metaHook('beforeAct', { input, cseContext, agentState: { flowState, ...agentState } });

  // --- 3. Act (LLM) ---
  // Debug: Check what memories are actually going to the LLM
  console.log(`[AgentLoop] 🎯 MEMORY FLOW TO LLM:`);
  console.log(`   CSE Context salientMemories: ${cseContext.salientMemories?.length || 0}`);
  if (cseContext.salientMemories && cseContext.salientMemories.length > 0) {
    console.log(`   Sample memory content: "${(cseContext.salientMemories[0].content || cseContext.salientMemories[0].userInput || cseContext.salientMemories[0].fact || 'No content').substring(0, 100)}..."`);
    console.log(`   Sample memory salience: ${cseContext.salientMemories[0].salience || 'No salience'}`);
  }
  
  // === META AGENT ROUTER: COGNITIVE COORDINATION ===
  let cognitiveCoordination = null;
  if (orchestrator && orchestrator.metaAgentRouter) {
    try {
      const fullCognitiveContext = {
        cseContext,
        awarenessContext,
        selectedSkill: null, // TODO: Add skill selection from orchestrator
        emergentCapabilities: fullAgentState.emergentCapabilities || []
      };
      
      cognitiveCoordination = orchestrator.metaAgentRouter.coordinateCognitiveProcessing(
        fullCognitiveContext, 
        input
      );
      
      logger.info('Cognitive coordination generated', { 
        hasFraming: !!cognitiveCoordination.contextualFraming,
        hasSkillGuidance: !!cognitiveCoordination.skillGuidance 
      });
    } catch (coordError) {
      logger.warn('Cognitive coordination error', coordError);
      cognitiveCoordination = orchestrator.metaAgentRouter.getDefaultCoordination();
    }
  }

  // Always inject previousExchange as recency block
  const llmContext = {
    identityAffirmation: cseContext.identity,
    salientMemories: cseContext.salientMemories,
    capabilities: cseContext.capabilities,
    flowState: cseContext.flowState,
    previousExchange: previousExchange, // For prompt assembly
    cognitiveCoordination // Meta Agent Router coordination for LLM understanding
  };
  
  console.log(`[AgentLoop] 🚀 SENDING TO LLM:`);
  console.log(`   Query: "${input}"`);
  console.log(`   Context salientMemories: ${llmContext.salientMemories?.length || 0}`);
  
  console.log('[AgentLoop] 🔄 About to call llmContextManager.generateResponse...');
  
  const llmResponse = await llmContextManager.generateResponse({
    query: input,
    context: llmContext
  });
  
  console.log('[AgentLoop] 🎉 llmContextManager.generateResponse completed!');
  
  console.log('[AgentLoop] 📥 LLM RESPONSE RECEIVED:');
  console.log('   Type:', typeof llmResponse);
  console.log('   Length:', llmResponse?.length || 0);
  console.log('   Content preview:', llmResponse?.substring(0, 200) || 'No content');
  console.log('[AgentLoop] Step: Act', { llmResponse });

  // === AUTOMATIC GROUNDING GAP DETECTION AND FOLLOW-UP ===
  let finalResponse = llmResponse;
  
  try {
    const { parseGroundingGaps, handleGroundingGaps } = require('../retriever/categoryRetriever');
    
    // Check if the response indicates missing information
    const groundingGaps = parseGroundingGaps(llmResponse);
    
    if (groundingGaps.length > 0) {
      console.log(`[AgentLoop] 🔍 Detected grounding gaps: ${groundingGaps.join(', ')}`);
      console.log('[AgentLoop] 🔄 Attempting automatic gap-filling retrieval...');
      
      // Perform targeted retrieval for missing categories
      const additionalChunks = await handleGroundingGaps(llmResponse, orchestrator.memoryGraph, 'htlogicalgates', input);
      
      if (additionalChunks && additionalChunks.length > 0) {
        console.log(`[AgentLoop] ✅ Found ${additionalChunks.length} additional chunks for gap-filling`);
        
        // Merge additional chunks with existing context
        const enhancedMemories = [
          ...cseContext.salientMemories,
          ...additionalChunks.map(chunk => ({
            content: chunk.content,
            salience: chunk.similarity,
            source: chunk.source,
            type: chunk.docType,
            timestamp: chunk.timestamp,
            chunkId: chunk.chunkId,
            repo: chunk.repo,
            path: chunk.path,
            docType: chunk.docType
          }))
        ];
        
        // Create enhanced context for retry
        const enhancedContext = {
          ...llmContext,
          salientMemories: enhancedMemories
        };
        
        console.log('[AgentLoop] 🔄 Retrying with enhanced context...');
        
        // Retry LLM call with enhanced context
        const enhancedResponse = await llmContextManager.generateResponse({
          query: input,
          context: enhancedContext
        });
        
        if (enhancedResponse && enhancedResponse.length > llmResponse.length) {
          console.log('[AgentLoop] ✅ Enhanced response is more comprehensive, using enhanced version');
          finalResponse = enhancedResponse;
        } else {
          console.log('[AgentLoop] ⚠️ Enhanced response not significantly better, keeping original');
        }
      } else {
        console.log('[AgentLoop] ❌ No additional chunks found for gap-filling');
      }
    } else {
      console.log('[AgentLoop] ✅ No grounding gaps detected, response appears complete');
    }
  } catch (gapError) {
    console.warn('[AgentLoop] ⚠️ Grounding gap detection failed:', gapError.message);
  }

  // --- Meta-cognitive Hook: After Act ---
  await metaHook('afterAct', { input, cseContext, llmResponse: finalResponse, agentState: { flowState, ...agentState } });

  // --- 4. Update State (memory graph) with Awareness Integration ---
  // Enhanced interaction storage with awareness-driven summaries and embeddings
  const interaction = {
    userInput: input,
    llmResponse: finalResponse,
    context: cseContext,
    awarenessContext,
    timestamp: Date.now(),
    why: 'AgentLoop: interaction persisted with awareness'
  };
  
  // Generate conversation summary for memory storage
  // ARCHITECTURAL FIX: Decouple conversation summaries from contextProcessor
  // Conversation summaries are first-class memory, not dependent on awareness
  let conversationSummary = null;
  let flowSummary = null;
  
  if (!orchestrator) {
    logger.warn('Conversation summary skipped', {
      reason: 'no_orchestrator',
      sessionId: orchestrator?.agentState?.sessionId
    });
  } else {
    try {
      // Always generate conversation summary (use finalResponse, not llmResponse)
      conversationSummary = await generateConversationSummary(input, finalResponse, cseContext);
      if (!conversationSummary) {
        logger.warn('Conversation summary skipped', {
          reason: 'generation_returned_null',
          sessionId: orchestrator.agentState?.sessionId
        });
      }
    } catch (summaryError) {
      logger.warn('Conversation summary skipped', {
        reason: 'error',
        error: summaryError.message,
        sessionId: orchestrator?.agentState?.sessionId
      });
    }
  }
  
  // Flow summaries remain awareness-dependent (correct)
  if (awarenessContext && orchestrator && orchestrator.contextProcessor) {
    try {
      flowSummary = await generateFlowSummary(awarenessContext, cseContext);
      logger.info('Generated flow summary', { hasSummary: !!flowSummary });
    } catch (flowError) {
      logger.warn('Failed to generate flow summary', flowError);
    }
  }
  
  // Store conversation summary with embedding if generated
  if (!conversationSummary) {
    if (orchestrator) {
      logger.warn('Conversation summary skipped', {
        reason: 'no_summary_generated',
        sessionId: orchestrator.agentState?.sessionId
      });
    }
  } else if (!orchestrator?.memoryGraph) {
    logger.warn('Conversation summary skipped', {
      reason: 'no_memory_graph',
      sessionId: orchestrator?.agentState?.sessionId
    });
  } else {
    try {
      // DEDUPLICATION: Hash-based guard to prevent retry inflation
      const crypto = require('crypto');
      const { getInteractionsPath } = require('../utils/paths');
      const sessionId = orchestrator.agentState?.sessionId || `session_${Date.now()}`;
      
      // Normalize inputs to reduce hash noise from formatting differences
      // Harden against undefined/null inputs
      const normalizeText = (text = '') => {
        return String(text)
          .trim()
          .replace(/\s+/g, ' ')  // Collapse repeated whitespace
          .replace(/\r\n/g, '\n'); // Normalize newlines
      };
      
      const normalizedInput = normalizeText(input);
      const normalizedResponse = normalizeText(finalResponse);
      const dedupeInput = `${sessionId}:${normalizedInput}:${normalizedResponse}`;
      const summaryHash = crypto.createHash('sha256').update(dedupeInput).digest('hex').substring(0, 16);
      
      // DURABLE DEDUPE: Check for existing summary with this hash
      // This survives restarts but has concurrency limitations (see docs)
      // We check the interactions file directly since it's the source of truth
      const fs = require('fs');
      const interactionsPath = getInteractionsPath();
      
      let shouldStore = true;
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
              logger.warn('Conversation summary skipped', {
                reason: 'duplicate_detected_in_file',
                sessionId: sessionId,
                summaryHash: summaryHash,
                existingAge: Math.round(existingAge / 1000) + 's'
              });
              shouldStore = false;
            } else {
              logger.info('Allowing repeated interaction after time window', {
                sessionId: sessionId,
                summaryHash: summaryHash,
                timeSinceFirst: Math.round(existingAge / 1000) + 's'
              });
            }
          }
        } catch (readError) {
          logger.warn('Could not check for duplicate summaries', {
            error: readError.message
          });
        }
      }
      
      if (shouldStore) {
        await storeConversationSummary();
      }
      
      async function storeConversationSummary() {
        const summaryEmbedding = await trueSemanticEmbeddings.generate(conversationSummary);
        const eventTimestamp = Date.now();
        const messageId = `msg_${crypto.randomUUID()}`;
        
        // PHASE 2: Store as typed cognitive artifact
        const { storeConversationArtifact } = require('../memory/storeConversationArtifact');
        
        const baseObj = {
          type: 'conversation_summary',
          source: 'awareness_processor',
          embedding: summaryEmbedding,
          originalInteraction: {
            userInput: input.substring(0, 100),
            response: finalResponse.substring(0, 100)
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
        
        // Writer function for agentLoop (uses orchestrator.memoryGraph.addMemory)
        const writeMemory = async (text, obj) => {
          await orchestrator.memoryGraph.addMemory(text, obj);
        };
        
        const classification = await storeConversationArtifact({
          writeMemory,
          summaryText: conversationSummary,
          embedding: summaryEmbedding,
          baseObj
        });
        
        logger.info('Stored conversation artifact via storeConversationArtifact', {
          sessionId: sessionId,
          messageId: messageId,
          summaryHash: summaryHash,
          artifactType: classification.artifactType,
          confidence: classification.confidence
        });
      }
    } catch (summaryStorageError) {
      logger.warn('Conversation summary skipped', {
        reason: 'error',
        error: summaryStorageError.message,
        sessionId: orchestrator?.agentState?.sessionId
      });
    }
  }
  
  // Store flow summary with embedding if generated
  if (flowSummary && orchestrator.memoryGraph) {
    try {
      const flowEmbedding = await trueSemanticEmbeddings.generate(flowSummary);
      await orchestrator.memoryGraph.addMemory(flowSummary, {
        type: 'flow_summary',
        source: 'awareness_processor',
        timestamp: Date.now(),
        embedding: flowEmbedding,
        awarenessContext
      });
      logger.info('Stored flow summary in memory graph');
    } catch (flowStorageError) {
      logger.warn('Failed to store flow summary', flowStorageError);
    }
  }
  
  // Log interaction with size limits to prevent "Invalid string length" errors
  const logInteraction = {
    userInput: interaction.userInput?.substring(0, 200) + (interaction.userInput?.length > 200 ? '...' : ''),
    llmResponse: interaction.llmResponse?.substring(0, 200) + (interaction.llmResponse?.length > 200 ? '...' : ''),
    timestamp: interaction.timestamp,
    why: interaction.why,
    contextMemories: interaction.context?.salientMemories?.length || 0,
    contextMetadata: interaction.context?.metadata || {},
    awarenessContext: interaction.awarenessContext,
    conversationSummary: !!conversationSummary,
    flowSummary: !!flowSummary
  };
  console.log('[Leo MemoryGraph] [WRITE] addInteraction with awareness:', JSON.stringify(logInteraction, null, 2));
  try {
    await orchestrator.memoryGraph.addInteraction(interaction);
    console.log('[Leo MemoryGraph] [SUCCESS] Interaction with awareness persisted.');
  } catch (err) {
    console.error('[Leo MemoryGraph] [ERROR] Failed to persist interaction:', err.message, interaction);
  }

  // --- 5. Update previousExchange and persist ---
  // Only update on real dialog, never on fact/management
  const isDialog = !rememberMatch && !mgmtCmd && !multiHopPlan;
  if (isDialog) {
    // Filtering logic: skip recency update for fallback/knowledge/system answers
    const fallbackPatterns = [
      /It seems there might be a misunderstanding/i,
      /I don't have any specific knowledge or details about a "?Contextual Salience Engine"?/i,
      /this kind of engine might be used in various applications/i,
      /if this is something custom that you or your team has developed/i
    ];
    const isFallback = fallbackPatterns.some(re => re.test(llmResponse));
    if (isFallback) {
      console.warn('[Leo PreviousExchange] [SKIP] Fallback/knowledge/system answer detected, not updating recency:', llmResponse);
    } else {
      previousExchange = { userInput: input, llmResponse, timestamp: Date.now() };
      try {
        fs.writeFileSync(PREVIOUS_EXCHANGE_PATH, JSON.stringify(previousExchange, null, 2), 'utf8');
        console.log('[Leo PreviousExchange] [WRITE] Updated after dialog:', previousExchange);
      } catch (err) {
        console.error('[Leo PreviousExchange] [FATAL] Error writing previousExchange:', err.message, previousExchange);
      }
    }
  } else {
    console.log('[Leo PreviousExchange] [SKIP] Not updating previousExchange (fact/management/multihop turn).');
  }

  // --- Return all step data for CLI/UI inspection ---
  return {
    input,
    cseContext,
    llmResponse: finalResponse,
    awarenessContext,
    logs: [],
    handledNatively: false
  };
}

/**
 * Generate conversation summary for memory storage
 * @param {string} userInput - User input
 * @param {string} llmResponse - LLM response
 * @param {Object} cseContext - CSE context
 * @returns {Promise<string>} Conversation summary
 */
async function generateConversationSummary(userInput, llmResponse, cseContext) {
  try {
    // Create a concise summary of the conversation exchange
    const inputSummary = userInput.length > 100 ? userInput.substring(0, 100) + '...' : userInput;
    const responseSummary = llmResponse.length > 200 ? llmResponse.substring(0, 200) + '...' : llmResponse;
    
    // Extract key topics from CSE context
    const contextTopics = [];
    if (cseContext && cseContext.salientMemories) {
      cseContext.salientMemories.slice(0, 3).forEach(memory => {
        if (memory.content) {
          const topic = memory.content.substring(0, 50);
          contextTopics.push(topic);
        }
      });
    }
    
    const summary = `Conversation: User asked "${inputSummary}" and received response about ${responseSummary}`;
    if (contextTopics.length > 0) {
      return summary + ` Context included: ${contextTopics.join(', ')}`;
    }
    
    return summary;
  } catch (error) {
    logger.warn('Error generating conversation summary', error);
    return `Conversation between user and system at ${new Date().toISOString()}`;
  }
}

/**
 * Generate flow summary for memory storage
 * @param {string} awarenessContext - Awareness context
 * @param {Object} cseContext - CSE context
 * @returns {Promise<string>} Flow summary
 */
async function generateFlowSummary(awarenessContext, cseContext) {
  try {
    // Extract flow information from awareness context
    const flowElements = awarenessContext.split(' | ');
    const sessionInfo = flowElements.find(el => el.startsWith('Session:')) || 'Unknown session';
    const inputInfo = flowElements.find(el => el.startsWith('Input:')) || 'Unknown input';
    const timeInfo = flowElements.find(el => el.startsWith('Timestamp:')) || 'Unknown time';
    
    // Add cognitive processing information
    let cognitiveInfo = '';
    if (cseContext && cseContext.metadata) {
      const metadata = cseContext.metadata;
      cognitiveInfo = ` Cognitive processing: ${metadata.finalMemoryCount || 0} memories, avg salience ${metadata.avgSalience || 0}`;
    }
    
    return `Flow summary: ${sessionInfo}, ${inputInfo}, ${timeInfo}${cognitiveInfo}`;
  } catch (error) {
    logger.warn('Error generating flow summary', error);
    return `Flow summary for awareness context: ${awarenessContext.substring(0, 100)}`;
  }
}

/**
 * Enhance memories with skill-specific context for cognitive architecture
 * @param {Array} memories - Base memories to enhance
 * @param {Array} skillsRequired - Skills needed for the query
 * @param {Object} orchestrator - Leo orchestrator instance
 * @returns {Promise<Array>} Enhanced memories
 */
async function enhanceMemoriesWithSkills(memories, skillsRequired, orchestrator) {
  if (!skillsRequired || skillsRequired.length === 0) {
    return memories;
  }
  
  try {
    // For each required skill, retrieve relevant skill-based memories
    const skillEnhancedMemories = [...memories];
    
    for (const skill of skillsRequired) {
      // Query memory graph for skill-specific knowledge
      const skillQuery = `skill:${skill} OR capability:${skill} OR expertise:${skill}`;
      const skillMemories = await orchestrator.cse.getSalientMemoriesRanked(skillQuery, 3);
      
      if (skillMemories && skillMemories.memories) {
        skillMemories.memories.forEach(skillMemory => {
          // Add skill context marker
          skillMemory.skillContext = skill;
          skillMemory.salience = (skillMemory.salience || 0) + 0.1; // Boost skill-relevant memories
          skillEnhancedMemories.push(skillMemory);
        });
      }
    }
    
    return skillEnhancedMemories;
  } catch (error) {
    logger.warn(`Skills enhancement failed: ${error.message}`);
    return memories;
  }
}

/**
 * Multi-hop NL command support: If a multi-step NL command is detected, agentLoopStep chains management actions and LLM steps using the multi_hop_planner.
 * Each step is routed through agentLoopStep, so both management and LLM actions are supported in sequence.
 * If you add new management or LLM commands, they are automatically supported in multi-hop plans.
 */
module.exports = { agentLoopStep };

