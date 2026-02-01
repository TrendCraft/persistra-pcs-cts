/**
 * Entity Citation Validator - Red-lines entity claims without citations
 * Ensures grounding integrity in LCOS responses
 */

function validateEntityCitations(answer, {
  entity = "htlogicalgates",
  aliases = ["htlogicalgates", "HTLogicalGates", "ht lg", "the htlogicalgates library"],
  requireCitations = true
} = {}) {
  if (!requireCitations) {
    return { ok: true, redlines: [], suggestions: [] };
  }

  // Basic sentence split
  const sentences = answer
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(""'])/);

  // Heuristics
  const entRegex = new RegExp(
    `\\b(${[entity, ...aliases].map(s => escapeRegExp(s)).join('|')})\\b`,
    'i'
  );
  const pronounRegex = /\b(it|this|that|the (library|package|tool|system))\b/i;
  // Citation = any bracketed segment with at least 3 visible chars (e.g., [M123], [repo/file#22], [paper:…])
  const citationRegex = /\[[^\]\n]{3,}\]/;

  let lastWasEntityMention = false;
  const redlines = [];
  const suggestions = [];

  sentences.forEach((s, idx) => {
    const mentionsEntity = entRegex.test(s);
    const mentionsPronoun = pronounRegex.test(s);
    const needsCheck = mentionsEntity || (lastWasEntityMention && mentionsPronoun);

    // Update entity mention state (hard reset if explicit mention)
    if (mentionsEntity) lastWasEntityMention = true;
    else if (!mentionsPronoun) lastWasEntityMention = false;

    if (!needsCheck) return;

    const hasCitation = citationRegex.test(s);
    if (!hasCitation) {
      // Flag and propose a lightweight fix
      const short = s.length > 180 ? s.slice(0, 177) + '…' : s;
      redlines.push({
        sentenceIndex: idx,
        sentence: short,
        issue: "Entity-specific claim lacks a source tag",
        rule: "entityClaimsMustBeCited"
      });
      suggestions.push({
        sentenceIndex: idx,
        fix: s.trim().endsWith('.') ? `${s} [ref]` : `${s} [ref].`,
        note: "Attach a bracketed source tag (e.g., [M221] or [repo/path#L22])"
      });
    }
  });

  return { ok: redlines.length === 0, redlines, suggestions };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Surface sanitizer - strips forbidden phrasing that leaks internals
 */
function sanitizeSurface(answer) {
  // Remove phrases that leak internals
  const patterns = [
    /\b(based on|from) the (provided|given) (context|chunks?|memory graph)\b/gi,
    /\bfrom the retrieved documents?\b/gi,
    /\bRAG\b/gi,
    /\baccording to the context\b/gi,
    /\bthe provided information shows\b/gi
  ];
  let out = answer;
  patterns.forEach(p => { out = out.replace(p, ''); });
  // Clean double spaces after removal
  return out.replace(/\s{2,}/g, ' ').trim();
}

module.exports = { validateEntityCitations, sanitizeSurface };
