/**
 * Meta-Prompt Manager - LLM Cognitive Enhancement Layer
 * 
 * Implements meta-cognitive enhancement capabilities that transform
 * basic prompts into rich cognitive contexts for the LLM.
 */

/**
 * Analyze the user's intent from their prompt
 * @param {string} userPrompt - The user's original prompt
 * @returns {Object} Intent analysis
 */
function analyzeIntent(userPrompt) {
  // Simple intent analysis based on keywords
  const intent = {
    isQuestion: userPrompt.includes('?'),
    isCoding: /code|function|class|implement|build|create/i.test(userPrompt),
    isPlanning: /plan|roadmap|strategy|outline/i.test(userPrompt),
    isExploration: /explore|investigate|research|analyze/i.test(userPrompt),
    isDecision: /decide|choose|select|determine/i.test(userPrompt),
    isProblemSolving: /solve|fix|debug|issue|problem/i.test(userPrompt),
    domain: detectDomain(userPrompt)
  };
  
  return intent;
}

/**
 * Detect the domain of the user's prompt
 * @param {string} userPrompt - The user's original prompt
 * @returns {string} Detected domain
 */
function detectDomain(userPrompt) {
  const domains = [
    { name: 'coding', patterns: ['code', 'function', 'class', 'programming', 'javascript', 'python'] },
    { name: 'architecture', patterns: ['architecture', 'system design', 'component', 'interface'] },
    { name: 'planning', patterns: ['plan', 'roadmap', 'milestone', 'timeline', 'schedule'] },
    { name: 'debugging', patterns: ['debug', 'error', 'fix', 'issue', 'problem', 'exception'] },
    { name: 'learning', patterns: ['explain', 'understand', 'learn', 'how does', 'what is'] }
  ];
  
  for (const domain of domains) {
    if (domain.patterns.some(pattern => userPrompt.toLowerCase().includes(pattern))) {
      return domain.name;
    }
  }
  
  return 'general';
}

/**
 * Format memory matches for inclusion in the prompt
 * @param {Array} memoryMatches - Memory matches from search
 * @param {Object} intent - Intent analysis
 * @returns {string} Formatted memory text
 */
function formatMemoryMatches(memoryMatches = [], intent) {
  if (!memoryMatches || memoryMatches.length === 0) {
    return "No relevant memory found.";
  }
  
  // Prioritize memories based on intent
  const sortedMatches = [...memoryMatches].sort((a, b) => {
    // If the intent is coding, prioritize code examples
    if (intent.isCoding && a.content?.includes('```') && !b.content?.includes('```')) {
      return -1;
    }
    if (intent.isCoding && !a.content?.includes('```') && b.content?.includes('```')) {
      return 1;
    }
    
    // Otherwise sort by relevance score if available
    return (b.relevance || 0) - (a.relevance || 0);
  });
  
  // Format the memories
  return sortedMatches
    .map(m => `• ${m.content || m.text}`)
    .join("\n");
}

/**
 * Generate cognitive context based on flow state
 * @param {Object} flowState - Current flow state
 * @returns {string} Cognitive context
 */
function generateCognitiveContext(flowState = {}) {
  const context = [];
  
  // Add current flow information
  context.push(`Current Mode: ${flowState.currentFlow || 'unknown'}`);
  context.push(`Phase: ${flowState.flowPhase || 'unknown'}`);
  context.push(`Cognitive Load: ${flowState.cognitiveLoad || 'normal'}`);
  
  // Add boundary awareness if approaching token boundary
  if (flowState.tokenUsage > 6000) { // Approaching 8K token limit
    context.push(`⚠️ Approaching token boundary: ${flowState.tokenUsage}/8192`);
    context.push(`Prepare for cognitive continuity preservation`);
  }
  
  // Add continuity information if we've crossed boundaries
  if (flowState.boundaryTransitions > 0) {
    context.push(`Cognitive continuity maintained across ${flowState.boundaryTransitions} boundaries`);
    context.push(`Continuity score: ${flowState.continuityScore || 1.0}`);
  }
  
  return context.join("\n");
}

/**
 * Generate a meta-prompt that enhances LLM cognitive capabilities
 * @param {string} userPrompt - The user's original prompt
 * @param {Object} options - Options including sessionContext, flowState, and memoryMatches
 * @returns {string} Enhanced meta-prompt
 */
function generate(userPrompt, { sessionContext = {}, flowState = {}, memoryMatches = [] }) {
  // Analyze user intent
  const intent = analyzeIntent(userPrompt);
  
  // Format memory matches based on intent
  const memoryText = formatMemoryMatches(memoryMatches, intent);
  
  // Get project vision
  const vision = sessionContext.visionAlignment || "Enable cognitive continuity and partnership";
  
  // Generate cognitive context
  const cognitiveContext = generateCognitiveContext(flowState);
  
  // Only include technical/engineering sections if debug mode is enabled
  const isDebug = process.env.LEO_DEBUG_CONTEXT === '1';
  const sections = [];

  // Always include these
  sections.push(`# Project Vision\n${vision}`);

  // Manual context: only include titles unless debug mode
  if (sessionContext.manualContextDocs && sessionContext.manualContextDocs.length > 0) {
    if (isDebug) {
      const manualContext = sessionContext.manualContextDocs
        .map(doc => `## ${doc.title || 'Document'}\n${doc.content}`)
        .join('\n\n');
      sections.push(`# Manual Context\n${manualContext}`);
    } else {
      const manualTitles = sessionContext.manualContextDocs
        .map(doc => `• ${doc.title || 'Document'}`)
        .join('\n');
      sections.push(`# Manual Context\n${manualTitles}`);
    }
  }

  // Only include technical/engineering sections if debug mode
  if (isDebug) {
    sections.push(`# Cognitive Context\n${cognitiveContext}`);
    sections.push(`# Intent Analysis\n${Object.entries(intent).map(([k, v]) => `${k}: ${v}`).join('\n')}`);
  }

  // Always include memory and prompt
  sections.push(`# Related Memory\n${memoryText}`);
  sections.push(`# User Prompt\n${userPrompt}`);

  // Optionally append a # Debug Info section if debug mode
  if (isDebug) {
    sections.push(`# Debug Info\nDebug mode enabled. Full context and technical details included.`);
  }

  return sections.join('\n\n').trim();
}

module.exports = { 
  generate,
  analyzeIntent,
  detectDomain,
  formatMemoryMatches,
  generateCognitiveContext
};
