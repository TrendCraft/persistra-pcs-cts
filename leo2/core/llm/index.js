const LLMGateway = require('./llm-gateway');

let llm = null;

function getLLM() {
  if (llm) return llm;
  llm = LLMGateway;
  return llm;
}

/**
 * Synthesize response from memory cards when LLM fails
 * NOTE: This fallback should rarely be used - orchestrator agent loop handles synthesis
 */
function synthesizeFromMemoryCards(memoryCards, query) {
  if (!memoryCards || memoryCards.length === 0) {
    return `I don't have specific information about "${query}" in my project memory. This appears to be a specialized topic that would benefit from additional context or documentation.`;
  }

  const sections = [];
  
  // Header
  sections.push(`# ${query.charAt(0).toUpperCase() + query.slice(1)}`);
  sections.push('');
  sections.push('## Project-Specific Evidence Summary');
  sections.push('');
  
  // Create evidence header with citations like the orchestrator does
  const evidenceHeader = memoryCards.slice(0, 8).map((card, i) => 
    `[#${i+1}] ${card.label || card.source || 'project-memory'} — salience ${(card.salience || 0).toFixed(2)}`
  ).join('\n');
  
  sections.push('Evidence available:');
  sections.push(evidenceHeader);
  sections.push('');

  // Synthesis
  sections.push('## Analysis');
  sections.push('');
  sections.push(`Based on ${memoryCards.length} memory entries with evidence [#1] through [#${Math.min(memoryCards.length, 8)}], this appears to be a documented component in the project. The evidence suggests specific implementation details and usage patterns are available.`);
  sections.push('');
  sections.push('For detailed information, please refer to the cited evidence sources above.');

  return sections.join('\n');
}

module.exports = { getLLM, synthesizeFromMemoryCards };
