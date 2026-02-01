// leo2/core/awareness/unifiedAwarenessService.js
const { instance: codeDiffAnalyzer } = require('../analysis/codeDiffAnalyzer');
const { createComponentLogger } = require('../../../lib/utils/logger');
const { MemoryGraph } = require('../memory/memoryGraph');
const { OperationLogger } = require('../logging/operationLogger');
const { SESSION_ID_KEY } = require('../constants/session');
const capabilityRegistry = require('../registry/capabilityRegistry');
const permissionController = require('../security/permissionController');
const semanticCodeParser = require('../../../leo/tools/meta_programming/semantic_code_parser');
const intentToCodeTranslator = require('../../../leo/tools/meta_programming/intent_to_code_translator');


// Use the real LLM context manager for prompt generation with dynamic identity/capability affirmations
const llmContextManager = require('../llm/llmContextManager');

function registerWithRegistry(registry) {
  registry.registerCapability('Unified Awareness Service', { file: __filename });
  registry.registerCapability('Semantic Code Parser', { file: 'leo2/tools/meta_programming/semantic_code_parser.js' });
  registry.registerCapability('Code Diff Analyzer', { file: 'core/analysis/codeDiffAnalyzer.js' });
}

module.exports.registerWithRegistry = registerWithRegistry;

// Use the main semanticCodeParser require for all API usage

function generateRationaleStub(diff, intent) {
  return `This change ${diff.summary || ''} was made to satisfy the intent: "${intent || 'N/A'}"`;
}

class UnifiedAwarenessService {
  constructor({ memoryGraph, contextProcessor, flowMonitor, interactionMemory, cse }) {
    this.memoryGraph = memoryGraph;
    this.contextProcessor = contextProcessor;
    this.flowMonitor = flowMonitor;
    this.interactionMemory = interactionMemory;
    this.cse = cse;
  }

  async processEvent(event) {
    // === CONVERSATION EVENT HANDLER ===
    if (event.type === 'conversation_input' || event.type === 'conversation_response') {
      try {
        // Prevent duplicate events - check if already processed
        const eventKey = `${event.type}_${event[SESSION_ID_KEY] || event.sessionId}_${event.timestamp}`;
        if (this.processedEvents && this.processedEvents.has(eventKey)) {
          console.log(`[UnifiedAwareness] Skipping duplicate event: ${eventKey}`);
          return;
        }
        
        // Track processed events
        if (!this.processedEvents) {
          this.processedEvents = new Set();
        }
        this.processedEvents.add(eventKey);
        
        // Record conversation event in interaction memory system
        if (this.interactionMemory && this.interactionMemory.recordConversationEvent) {
          await this.interactionMemory.recordConversationEvent({
            type: event.type,
            content: event.type === 'conversation_input' ? event.userInput : event.response,
            metadata: {
              sessionId: event[SESSION_ID_KEY] || event.sessionId,
              timestamp: event.timestamp,
              userContext: event.userContext,
              responseMetadata: event.metadata
            }
          });
        }
        
        // Generate conversation summary and store in memory graph
        if (event.type === 'conversation_response' && this.memoryGraph) {
          const conversationSummary = this.generateConversationSummary(event);
          
          // Store conversation summary with embedding
          if (conversationSummary) {
            const eventTimestamp = event.timestamp; // Event time (when message happened)
            const sessionId = event[SESSION_ID_KEY] || event.sessionId;
            const messageId = `msg_${eventTimestamp}`;
            
            await this.memoryGraph.addMemory(conversationSummary, {
              type: 'conversation_summary',
              source: 'unified_awareness_service',
              salient: true,
              // PROPER CONVERSATION PROVENANCE
              metadata: {
                source_kind: 'conversation',
                source_id: `conv:${sessionId}/msg:${messageId}`,
                chunk_type: 'conversation_event',
                timestamp: eventTimestamp,  // Event time (when message happened)
                ingested_at: Date.now(),    // Ingest time (when written to graph)
                timestamp_source: 'conversation_event_time',
                conversation_timestamp: eventTimestamp,
                message_timestamp: eventTimestamp,
                session_id: sessionId,
                message_id: messageId
              }
            });
            
            operationLogger.logOperation('conversation_summary_stored', {
              sessionId: sessionId,
              summaryLength: conversationSummary.length
            });
          }
        }
        
        // Update flow monitor with conversation metrics
        if (this.flowMonitor) {
          this.flowMonitor.recordConversationEvent(event);
        }
        
        operationLogger.logOperation('conversation_event_processed', {
          type: event.type,
          sessionId: event[SESSION_ID_KEY] || event.sessionId,
          timestamp: event.timestamp
        });
        
      } catch (error) {
        console.warn('[UnifiedAwarenessService] Failed to process conversation event:', error);
        operationLogger.logOperation('conversation_event_error', {
          type: event.type,
          error: error.message
        });
      }
      return;
    }
    
    // === INTENT-TO-CODE HANDLER ===
    if (event.type === 'intent_to_code') {
      operationLogger.logOperation('intent_received', { intent: event.intent });
      // Apply the intent to code
      const planResult = await intentToCodeTranslator.processIntent(event.intent);
      let intentResult = { success: false };
      let beforeContent = '', afterContent = '', rollbackPlan = null;
      if (planResult.success && planResult.changes && planResult.changes.length > 0) {
        // Apply the code changes
        const intentId = planResult.intentId;
        intentResult = await intentToCodeTranslator.applyIntent(intentId);
        // For rollback, get the rollbackOperations from translator
        const intentObj = intentToCodeTranslator.intentHistory.find(i => i.id === intentId);
        rollbackPlan = intentObj && intentObj.rollbackOperations ? intentObj.rollbackOperations : null;
        // Summarize before/after for diff
        const targetFile = event.intent.targetFile;
        if (targetFile) {
          try {
            beforeContent = rollbackPlan && rollbackPlan.length > 0 && rollbackPlan[0].originalContent ? rollbackPlan[0].originalContent : '';
            afterContent = await fs.promises.readFile(targetFile, 'utf-8');
          } catch (e) {
            beforeContent = '';
            afterContent = '';
          }
        }
      }
      if (intentResult.success && event.intent.targetFile) {
        // Compute semantic summaries and diff
        const beforeSummary = beforeContent ? semanticCodeParser.summarizeCode(beforeContent) : { items: [] };
        const afterSummary = afterContent ? semanticCodeParser.summarizeCode(afterContent) : { items: [] };
        const diffSummary = semanticCodeParser.diffSummaries(beforeSummary, afterSummary);
        await this.memoryGraph.addMemory({
          type: 'code_intent_diff',
          file: event.intent.targetFile,
          intentLabel: event.intent.label,
          diff: diffSummary,
          rationale: event.intent.rationale || '[Intent-to-code: rationale placeholder]',
          rollback: rollbackPlan,
          timestamp: Date.now(),
          salient: true
        });
        operationLogger.logOperation('code_intent_applied', {
          intent: event.intent.label,
          diffSummary,
          rollback: rollbackPlan
        });
      } else if (!intentResult.success) {
        operationLogger.logOperation('code_intent_failed', { intent: event.intent, error: intentResult.error });
      }
      this.lastAction = { ...intentResult, timestamp: Date.now() };
      return this.lastAction;
    }
    // === OBSERVE ===
    this.lastObservation = { event, timestamp: Date.now() };
    operationLogger.logOperation('observe', { event });

    // Permission check
    if (!permissionController.canProcessEvent(event)) {
      operationLogger.logOperation('permission_denied', { event });
      this.lastReflection = { error: 'Permission denied', event };
      this.lastAction = { action: 'none', reason: 'permission denied' };
      return;
    }

    // === REFLECT ===
    let reflection = {};
    try {
      switch (event.type) {
        case 'file_change': {
          const oldContent = event.oldContent ?? this._safeRead(event.file, false);
          const newContent = event.newContent ?? this._safeRead(event.file, true);
          const diffSummary = codeDiffAnalyzer.analyzeDiff(oldContent, newContent);

          await semanticCodeParser.initialize();
          const ast = semanticCodeParser.parseCode(newContent);
          let semanticSummary = 'Could not parse code semantically (fallback)';
          if (ast && !ast.placeholder && typeof semanticCodeParser.summarizeAst === 'function') {
            semanticSummary = semanticCodeParser.summarizeAst(ast, { diff: diffSummary });
          }

          await this.memoryGraph.addMemory({
            type: 'file_diff', file: event.file, summary: diffSummary, timestamp: Date.now(), salient: true
          });
          await this.memoryGraph.addMemory({
            type: 'code_semantic_summary', file: event.file, summary: semanticSummary, timestamp: Date.now(), salient: true
          });
          await this.contextProcessor.processFileChange(event.file, event.changeType);

          reflection = { diffSummary, semanticSummary, timestamp: Date.now() };
          break;
        }
        case 'user_query': {
          // Get hybrid context from CSE
          const context = await this.cse.getHybridContext({ query: event.query, flowState: event.flowState || {} });
          // Build identity affirmation prompt (async)
          let identityAffirmation = '';
          try {
            const { buildIdentityPrompt } = require('../cse/identity_selector');
            identityAffirmation = await buildIdentityPrompt({ query: event.query, ...context });
          } catch (err) {
            identityAffirmation = '';
          }
          reflection = {
            query: event.query,
            contextSummary: (() => {
  if (Array.isArray(context) && context.length > 1) {
    console.warn('[UnifiedAwarenessService] More than one context summary found, only injecting the first.');
  }
  return Array.isArray(context) && context.length > 0 ? context[0].summary : '';
})(),
            identityAffirmation,
            timestamp: Date.now()
          };
          break;
        }
        case 'code_proposal': {
          const allowed = permissionController.canWriteCode(event);
          reflection = {
            proposal: event.code,
            allowed,
            reason: allowed ? 'Permitted by policy' : 'Write not permitted',
            timestamp: Date.now()
          };
          break;
        }
        case 'error': {
          await this.memoryGraph.addMemory({
            type: 'error', error: event.error, source: event.source, timestamp: Date.now(), salient: true
          });
          reflection = { error: event.error, source: event.source, timestamp: Date.now() };
          break;
        }
        default:
          reflection = { note: 'Unhandled event type', event, timestamp: Date.now() };
      }
    } catch (err) {
      reflection = { error: err.message, stack: err.stack, timestamp: Date.now() };
    }
    this.lastReflection = reflection;
    operationLogger.logOperation('reflect', reflection);

    // === ACT ===
    let action = {};
    try {
      switch (event.type) {
        case 'file_change': {
          await llmContextManager.updateContext({
            file: event.file,
            semanticSummary: reflection.semanticSummary,
            diffSummary: reflection.diffSummary
          });
          action = {
            message: `Updated LLM context with semantic summary for ${event.file}`,
            timestamp: Date.now()
          };
          break;
        }
        case 'user_query': {
          // Pass identity affirmation as part of context for LLM prompt generation
          const response = await llmContextManager.generateResponse({
            query: event.query,
            context: {
              ...reflection,
              identityAffirmation: reflection.identityAffirmation
            }
          });
          action = { response, timestamp: Date.now() };
          break;
        }
        case 'code_proposal': {
          if (reflection.allowed) {
            // await codeWriter.applyProposal(event.code); // STUB
            action = { status: 'applied', timestamp: Date.now() };
          } else {
            action = { status: 'rejected', reason: reflection.reason, timestamp: Date.now() };
          }
          break;
        }
        case 'error': {
          action = { notified: true, timestamp: Date.now() };
          break;
        }
        default:
          action = { note: 'No action for event type', timestamp: Date.now() };
      }
    } catch (err) {
      action = { error: err.message, stack: err.stack, timestamp: Date.now() };
    }
    this.lastAction = action;
    operationLogger.logOperation('act', action);
  }

  getLastObservation() { return this.lastObservation; }
  getLastReflection()  { return this.lastReflection; }

  /**
   * Retrieves context for a prompt, delegating to the EmergentCSE (CSE).
   * @param {Object} params - { query: string, flowState: any }
   * @returns {Promise<Object>} Hybrid context object
   */
  async getContextForPrompt(params) {
    if (!this.cse || typeof this.cse.getHybridContext !== 'function') {
      throw new Error('EmergentCSE (CSE) is not available or missing getHybridContext');
    }
    const context = await this.cse.getHybridContext(params);
    // Defensive: Only allow a single salient memory
    if (Array.isArray(context?.salientMemories) && context.salientMemories.length > 1) {
      console.warn('[UnifiedAwarenessService] More than one salient memory detected; only injecting the first.');
    }
    if (Array.isArray(context?.memories) && context.memories.length > 1) {
      console.warn('[UnifiedAwarenessService] More than one memory in recency context; only the last will be used for recency block.');
      context.memories = [context.memories[context.memories.length - 1]];
    }
    // Warn if the top-1 salient memory is a block
    const salientMemory = context.salientMemories && context.salientMemories[0];
    if (salientMemory && typeof salientMemory === 'object') {
      // Check userInput, llmResponse, or fact fields for length/lines
      const fields = ['userInput', 'llmResponse', 'fact'];
      let blockText = fields.map(f => salientMemory[f]).filter(Boolean).join('\n');
      if (!blockText) blockText = JSON.stringify(salientMemory);
      if ((blockText.match(/\n/g) || []).length > 3 || blockText.length > 512) {
        console.warn('[UnifiedAwarenessService] Top-1 salient memory block is non-atomic (multi-line or too long):', blockText.slice(0, 200), salientMemory);
      }
    }
    return context;
  }
  getLastAction()      { return this.lastAction; }

  _safeRead(filePath, preferNew) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
  }

  /**
   * Process a code proposal event with meta-programming pipeline.
   * @param {Object} event - The code proposal event (must have file, code, intent fields)
   */
  async processCodeProposal(event) {
    // 1. Retrieve previous summary from memory graph
    const prevSummaryEntry = await this.memoryGraph.getLatestSummary(event.file);
    const prevSummary = prevSummaryEntry ? prevSummaryEntry.items : [];

    // 2. Parse new code and get summary
    if (semanticCodeParser.instance && typeof semanticCodeParser.instance.initialize === 'function') {
      semanticCodeParser.instance.initialize();
    }
    const newSummaryObj = semanticCodeParser.instance.summarizeCode(event.code); // returns { summary, items }
    const newSummary = newSummaryObj.items;

    // 3. Compute diff
    const diff = semanticCodeParser.diffSummaries({ items: prevSummary }, { items: newSummary });

    // 4. (Stub) Validate diff against intent (for now, assume valid)
    const rationale = generateRationaleStub(diff, event.intent);

    // 5. Log everything to memory graph
    await this.memoryGraph.addMemory({
      type: 'code_proposal',
      file: event.file,
      code: event.code,
      intent: event.intent,
      prevSummary: { items: prevSummary },
      newSummary: { items: newSummary },
      diff,
      rationale,
      timestamp: Date.now(),
      salient: true
    });

    // Optionally log to operation logger
    if (this.operationLogger && typeof this.operationLogger.logOperation === 'function') {
      this.operationLogger.logOperation('code_proposal_processed', { file: event.file, diff, rationale });
    }

    // Return what happened for test/debug
    return {
      prevSummary: { items: Array.isArray(prevSummary) ? prevSummary : [] },
      newSummary: { items: Array.isArray(newSummary) ? newSummary : [] },
      diff,
      rationale
    };
  }

  /**
   * Generate conversation summary for memory storage
   * @param {Object} event - Conversation event
   * @returns {string} Conversation summary
   */
  generateConversationSummary(event) {
    try {
      if (event.type === 'conversation_response') {
        const userInput = event.userInput || 'Unknown input';
        const response = event.response || 'Unknown response';
        
        // Create concise summary
        const inputSummary = userInput.length > 100 ? userInput.substring(0, 100) + '...' : userInput;
        const responseSummary = response.length > 200 ? response.substring(0, 200) + '...' : response;
        
        // Add metadata if available
        let metadataInfo = '';
        if (event.metadata) {
          const skillUsed = event.metadata.skillSelected || 'general_conversation';
          const confidence = event.metadata.confidence ? ` (confidence: ${event.metadata.confidence.toFixed(2)})` : '';
          metadataInfo = ` [Skill: ${skillUsed}${confidence}]`;
        }
        
        return `Conversation exchange: User "${inputSummary}" → System "${responseSummary}"${metadataInfo}`;
      }
      
      return `Conversation event: ${event.type} at ${new Date(event.timestamp).toISOString()}`;
    } catch (error) {
      console.warn('[UnifiedAwarenessService] Error generating conversation summary:', error);
      return `Conversation summary generation failed: ${error.message}`;
    }
  }
}

module.exports = UnifiedAwarenessService;
module.exports.generateRationaleStub = generateRationaleStub;
