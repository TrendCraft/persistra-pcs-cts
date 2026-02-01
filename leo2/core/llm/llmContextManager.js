// leo2/core/llm/llmContextManager.js
// LLM Context Manager for Leo 2.0 Awareness Pipeline
// Integrates CSE identity selector for dynamic identity/capability affirmations

const LLMGateway = require('./llm-gateway');
const { createComponentLogger } = require('../../../lib/utils/logger');

const llmClient = LLMGateway;
const logger = createComponentLogger('llmContextManager');

/**
 * Update LLM context (stub for compatibility)
 * @param {Object} ctx
 */
async function updateContext(ctx) {
  // For now, just log the context update
  console.log('[llmContextManager] updateContext called:', ctx);
}

/**
 * Generate a response from LLM, injecting dynamic identity/capability affirmations
 * @param {Object} params - { query: string, context: object }
 * @returns {Promise<string>} LLM response
 */
async function generateResponse({ query, context }) {
  // Pass salient memories as proper memory objects (no identity injection)
  let salientMemories = [];
  
  if (context && Array.isArray(context.salientMemories) && context.salientMemories.length > 0) {
    salientMemories = context.salientMemories;
    logger.debug(`LLM Context: Processing ${salientMemories.length} salient memories`);
  }
  
  // Build sophisticated cognitive system prompt
  let systemPrompt = '';
  let cognitiveFraming = '';
  
  // Cognitive Architecture Integration
  if (context && context.cseContext) {
    const cse = context.cseContext;
    
    // Multi-hop cognitive goals
    if (cse.cognitiveGoals && cse.cognitiveGoals.length > 0) {
      cognitiveFraming += `\n\nCognitive Goals: ${cse.cognitiveGoals.join(', ')}`;
    }
    
    // Skills integration
    if (cse.skillsRequired && cse.skillsRequired.length > 0) {
      cognitiveFraming += `\n\nRequired Expertise: ${cse.skillsRequired.join(', ')}`;
    }
    
    // Emergent capabilities
    if (cse.emergentCapabilities && cse.emergentCapabilities.length > 0) {
      cognitiveFraming += `\n\nEmergent Capabilities: ${cse.emergentCapabilities.join(', ')}`;
    }
    
    // Emergent identity context
    if (cse.identity && cse.identity.role) {
      cognitiveFraming += `\n\nCognitive Role: ${cse.identity.role}`;
    }
  }
  
  // Synthesize salient memories with cognitive context and provenance
  if (salientMemories.length > 0) {
    const contextualMemories = salientMemories.map((memory, index) => {
      let memoryText = memory.content || memory.userInput || memory.fact || '';
      
      // Add provenance information with chunk ID, repo, path, and doc type
      const chunkId = memory.chunkId || memory.id || `chunk-${index}`;
      const repo = memory.repo || 'unknown';
      const path = memory.path || 'unknown';
      const docType = memory.docType || memory.type || 'unknown';
      const source = memory.source || `${repo}/${path}`;
      
      // Format with clear provenance
      let provenanceHeader = `[${chunkId} | repo: ${repo} | path: ${path} | type: ${docType}]`;
      
      // Add skill context if available
      if (memory.skillContext) {
        memoryText = `[${memory.skillContext.toUpperCase()} EXPERTISE] ${memoryText}`;
      }
      
      // Add salience indicator for high-priority memories
      if (memory.salience && memory.salience > 0.8) {
        memoryText = `[HIGH RELEVANCE] ${memoryText}`;
      }
      
      return `${provenanceHeader}\n${memoryText}`;
    }).join('\n\n');
    
    // Build provenance summary for grounding instructions
    const provenanceList = salientMemories.map(memory => {
      const chunkId = memory.chunkId || memory.id || 'unknown';
      const repo = memory.repo || 'unknown';
      const path = memory.path || 'unknown';
      const docType = memory.docType || memory.type || 'unknown';
      return `  - ${chunkId}: ${repo}/${path} (${docType})`;
    }).join('\n');
    
    // Add balanced grounding instructions that enhance rather than restrict
    const balancedInstructions = `
COGNITIVE ENHANCEMENT CONTEXT:
You have access to curated knowledge chunks with provenance information. Use this context to enhance your responses while maintaining your full reasoning capabilities.

AVAILABLE CONTEXT:
${contextualMemories}

PROVENANCE SUMMARY:
${provenanceList}

BALANCED APPROACH:
- When referencing specific facts from the context chunks, cite them with [chunk-id]
- Synthesize information across chunks and combine with your broader knowledge
- If context chunks are incomplete, supplement with your general knowledge while noting the distinction
- Use emergent reasoning to connect concepts and provide comprehensive responses
- Only restrict yourself to context chunks if explicitly asked for "exact information from the knowledge base"

Your goal is to provide the most helpful, accurate, and comprehensive response by combining the provided context with your cognitive capabilities.`;
    
    systemPrompt = balancedInstructions;
  }
  
  // REMOVED: Hardcoded identity injection - now uses emergent context from CSE
  // const COGNITIVE_INSTRUCTION = `You are Leo, a Cognitive Operating System with sophisticated reasoning capabilities. You have access to a curated knowledge base and emergent cognitive architecture.
  //
  // Your cognitive processing includes:
  // - Multi-hop reasoning and planning
  // - Domain expertise integration
  // - Emergent capability synthesis
  // - Contextual knowledge retrieval
  //
  // Provide expert-level responses that synthesize across all available knowledge. When drawing from the knowledge base, integrate insights naturally rather than simply quoting. If specific information is not available, clearly state this while providing relevant context from your broader understanding.`;
  
  // Use only emergent context from CSE - no hardcoded identity injection
  systemPrompt = [cognitiveFraming, systemPrompt].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'user', content: query }
  ];
  // Clean cognitive context logging
  logger.info('LLM Context: Generating response with cognitive context', {
    memoryCount: salientMemories.length,
    hasGoals: !!(context && context.cseContext && context.cseContext.cognitiveGoals && context.cseContext.cognitiveGoals.length > 0),
    systemPromptLength: systemPrompt.length
  });
  let result = await llmClient.generate(messages, { context, system: systemPrompt });
  
  // Debug: Log what we're sending to Claude
  console.log('[LLMContextManager DEBUG] Sending to Claude:', {
    messagesCount: messages.length,
    firstMessage: messages[0],
    systemPromptLength: systemPrompt.length,
    contextMemories: salientMemories.length,
    result: result ? result.substring(0, 100) + '...' : 'null'
  });
  return result;
}

/**
 * Generate method that handles both direct messages array and legacy query/context format
 * @param {Array|Object} messagesOrParams - Either messages array or {query, context} object
 * @param {Object} options - Generation options (genHints, etc.)
 * @returns {Promise<string>} LLM response
 */
async function generate(messagesOrParams, options = {}) {
  // Handle direct messages array (new format from agent loop)
  if (Array.isArray(messagesOrParams)) {
    console.log('[LLMContextManager] Direct messages array received:', messagesOrParams.length, 'messages');
    
    // Extract user content from messages array
    const userMessage = messagesOrParams.find(msg => msg.role === 'user');
    const query = userMessage ? userMessage.content : '';
    
    console.log('[LLMContextManager] Extracted query from messages:', query);
    
    // Pass through to LLM gateway with proper format
    const LLMGateway = require('./llm-gateway');
    return await LLMGateway.generate(messagesOrParams, options);
  }
  
  // Handle legacy query/context format
  return await generateResponse(messagesOrParams);
}

module.exports = {
  updateContext,
  generateResponse,
  generate
};
