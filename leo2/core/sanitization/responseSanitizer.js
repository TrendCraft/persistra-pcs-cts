// Response sanitization module to eliminate raw MEMORY_SNIPPET leaks
// This is the final defense against raw memory snippet formatting

function sanitizeResponse(response) {
  if (typeof response !== 'string') return response;
  
  console.log('[RESPONSE SANITIZER] Processing response for raw MEMORY_SNIPPET blocks');
  
  // Comprehensive sanitization patterns
  let cleaned = response
    // Remove raw MEMORY_SNIPPET blocks entirely
    .replace(/MEMORY_SNIPPET\s*\[project-memory\]/gi, '')
    // Remove salience lines
    .replace(/^\s*Salience:\s*[0-9.]+\s*$/gmi, '')
    // Remove summary prefixes
    .replace(/^\s*Summary:\s*/gmi, '')
    // Convert [MEM X] citations to natural language for investor readability
    .replace(/\[MEM \d+\]/g, 'from stored project memory')
    // Clean up memory card blocks with raw formatting
    .replace(/\*\*\[MEM \d+\]\s*[^*]*\*\*\s*\(salience:[^)]*\)\s*MEMORY_SNIPPET[^\n]*\n?/gi, function(match) {
      // Extract just the memory reference and make it clean
      const memMatch = match.match(/\*\*\[MEM (\d+)\][^*]*\*\*/);
      return memMatch ? `**from stored project memory** (evidence)\n` : '';
    })
    // Clean up any remaining raw formatting
    .replace(/\n\s*MEMORY_SNIPPET[^\n]*\n?/gi, '\n')
    // Normalize whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  // Check if we successfully removed raw formatting
  const hadRawBlocks = /MEMORY_SNIPPET|project-memory/i.test(response);
  const stillHasRawBlocks = /MEMORY_SNIPPET|project-memory/i.test(cleaned);
  
  if (hadRawBlocks && !stillHasRawBlocks) {
    console.log('[RESPONSE SANITIZER] Successfully removed raw MEMORY_SNIPPET formatting');
  } else if (stillHasRawBlocks) {
    console.error('[RESPONSE SANITIZER] WARNING: Raw formatting still present after sanitization');
  }
  
  return cleaned;
}

function sanitizeMemoryCards(memoryCards) {
  if (!Array.isArray(memoryCards)) return memoryCards;
  
  return memoryCards.map(card => ({
    ...card,
    content: typeof card.content === 'string' 
      ? card.content
          .replace(/MEMORY_SNIPPET\s*\[project-memory\]/gi, '')
          .replace(/^\s*Salience:\s*[0-9.]+\s*$/gmi, '')
          .replace(/^\s*Summary:\s*/gmi, '')
          .trim()
      : card.content
  }));
}

module.exports = {
  sanitizeResponse,
  sanitizeMemoryCards
};
