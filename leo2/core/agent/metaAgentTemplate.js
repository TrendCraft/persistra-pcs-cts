/**
 * Meta-Agent Prompt Template with Grounded Bullets Generator
 * 
 * Generates professional meta-agent prompts with properly formatted citations
 * using normalized CategoryRetriever output.
 */

/**
 * Generate grounded fact bullets from normalized category results
 * @param {Array} items - Normalized items from CategoryRetriever
 * @param {string} entity - Target entity (e.g., 'htlogicalgates')
 * @returns {Array} Array of grounded fact bullets with proper citations
 */
function generateGroundedFactBullets(items, entity = 'htlogicalgates') {
  const bullets = [];
  
  for (const item of items) {
    // Handle both CSE memory format and categoryResults format
    const content = item.content || item.summary || '';
    if (!content) continue;
    
    // Extract key facts from content
    const contentStr = String(content).trim();
    const preview = contentStr.substring(0, 120).replace(/\n/g, ' ');
    
    // Create reference from available fields
    const ref = item.ref || item.id || item.source || 'memory';
    
    // Generate contextual bullet based on doc type or content type
    let bullet;
    const docType = item.docType || item.type || 'unknown';
    
    switch (docType) {
      case 'readme_overview':
        bullet = `• ${entity} overview: ${preview} [${ref}]`;
        break;
      case 'api_examples':
        bullet = `• API usage: ${preview} [${ref}]`;
        break;
      case 'code':
      case 'quantum_research':
        bullet = `• Implementation: ${preview} [${ref}]`;
        break;
      case 'metadata':
        bullet = `• Project metadata: ${preview} [${ref}]`;
        break;
      case 'paper':
        bullet = `• Research: ${preview} [${ref}]`;
        break;
      default:
        bullet = `• ${preview} [${ref}]`;
    }
    
    bullets.push(bullet);
  }
  
  return bullets;
}

/**
 * Build professional meta-agent prompt template
 * @param {Object} params - Template parameters
 * @returns {string} Complete meta-agent prompt
 */
function buildMetaAgentPrompt({
  userQuery,
  entity,
  mode,
  policy,
  groundedFacts = [],
  maxTokens = 1500
}) {
  const template = `
**ROLE**: You are a professional AI assistant with access to specialized knowledge about ${entity}.

**USER ASK**: ${userQuery}

**HIDDEN INPUTS**:
- Entity: ${entity}
- Mode: ${mode}
- Policy: ${policy}
- Grounded Facts:
${groundedFacts.map(fact => `  ${fact}`).join('\n')}

**OUTPUT GOAL**: Provide a clear, accurate response about ${entity} using the grounded facts above.

**STYLE**: 
- Natural, conversational tone
- Use bracketed citations like [ref] for all entity-specific claims
- No system jargon or technical internals
- Maximum ${maxTokens} tokens for non-graph content

**RESPONSE SHAPE**:
Answer the user's question directly using the provided grounded facts. Include proper citations in brackets for all specific claims about ${entity}.
`;

  return template.trim();
}

module.exports = {
  generateGroundedFactBullets,
  buildMetaAgentPrompt
};
