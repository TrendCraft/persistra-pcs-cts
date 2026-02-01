// core/fusion/fusionPack.js

// ---------- Public API ----------
/**
 * Build a compact, diverse pack of memory facts for prompt fusion.
 * cards: array of memory cards from CSE (ctx.fusion.memoryCards)
 */
function buildFusionPack(cards, opts = {}) {
  const {
    k = 12,
    maxCharsPerFact = 300,
    diversity = 0.7,          // 0..1, higher = more diversity
    minSentLen = 35,
    maxSentLen = 240
  } = opts;

  if (!Array.isArray(cards) || cards.length === 0) return [];

  // 1) Normalize + dedupe
  const norm = cards
    .map(c => normalizeCard(c))
    .filter(c => !!c.text);                 // drop empties
  const byId = new Map();
  for (const c of norm) if (!byId.has(c.id)) byId.set(c.id, c);
  const uniq = [...byId.values()];

  // 2) Rank by score, then apply MMR-style diversification
  const ranked = uniq.sort((a, b) => (b.score - a.score));
  const diversified = mmrDiversify(ranked, k, diversity);

  // 3) Compress each to 2–3 salient, number-bearing sentences
  const pack = diversified.map(c => ({
    id: c.id,
    score: round2(c.score),
    source: c.source,
    fact: compressToFacts(c.text, { maxCharsPerFact, minSentLen, maxSentLen })
  })).filter(f => f.fact);

  return pack;
}

/**
 * Convenience: builds a single string block suitable for a system message.
 */
function renderFusionFactsBlock(fusionPack) {
  if (!fusionPack?.length) return 'No salient memory available.';
  return fusionPack
    .map(f => `- [${f.score}] (${f.id}) ${f.fact}`)
    .join('\n');
}

// ---------- Internal Helpers ----------

function normalizeCard(card) {
  return {
    id: card.id || card.content_id || card.sourceId || `mem_${Math.random().toString(36).slice(2,8)}`,
    text: card.content || card.text || '',
    score: card.score ?? card.salience ?? 0,
    source: card.source || card.meta?.source_uri || card.sourceId || 'unknown',
    embedding: card.embedding || card.meta?.embedding
  };
}

function mmrDiversify(cards, k, diversity) {
  if (cards.length <= k) return cards;
  
  const selected = [cards[0]]; // start with highest score
  const remaining = cards.slice(1);
  
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.score;
      
      // Calculate diversity (average distance from selected items)
      let avgDiversity = 0;
      for (const sel of selected) {
        avgDiversity += calculateSimilarity(candidate, sel);
      }
      avgDiversity = 1 - (avgDiversity / selected.length); // convert similarity to diversity
      
      // MMR score: balance relevance and diversity
      const mmrScore = (1 - diversity) * relevance + diversity * avgDiversity;
      
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  
  return selected;
}

function calculateSimilarity(card1, card2) {
  // Use embeddings if available, otherwise fall back to lexical similarity
  if (card1.embedding && card2.embedding) {
    return cosineSimilarity(card1.embedding, card2.embedding);
  }
  
  // Lexical similarity fallback
  const words1 = new Set(card1.text.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const words2 = new Set(card2.text.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

function compressToFacts(text, opts) {
  const { maxCharsPerFact, minSentLen, maxSentLen } = opts;
  
  // Extract sentences, prioritizing those with numbers, technical terms, or specific names
  const sentences = extractSentencesKeepingNumbers(text);
  
  // Phase 2: Semantic truncation instead of blind char limit
  // Build up to target length, but allow 20% overrun to avoid cutting critical content
  const targetLength = maxCharsPerFact;
  const maxLength = Math.floor(maxCharsPerFact * 1.2); // 20% overrun allowed
  
  let compressed = '';
  let sentenceCount = 0;
  
  for (const sentence of sentences) {
    if (sentenceCount >= 3) break; // Still cap at 3 sentences for readability
    
    const candidate = compressed ? `${compressed} ${sentence}` : sentence;
    
    // If adding this sentence would exceed max, check if we're at least at target
    if (candidate.length > maxLength) {
      if (compressed.length >= targetLength * 0.8) {
        // We have enough content, stop here
        break;
      }
      // Otherwise, we need more content - truncate this sentence to fit
      const remaining = maxLength - compressed.length - 1;
      if (remaining > 50) { // Only add if we can fit meaningful content
        compressed = compressed ? `${compressed} ${sentence.substring(0, remaining)}...` : sentence.substring(0, remaining) + '...';
      }
      break;
    }
    
    compressed = candidate;
    sentenceCount++;
  }
  
  return compressed.trim();
}

function extractSentencesKeepingNumbers(text) {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
  
  // Score sentences by information density (numbers, technical terms, specificity)
  const scored = sentences.map(sent => ({
    text: sent,
    score: scoreSentenceInformation(sent)
  }));
  
  // Sort by information score
  scored.sort((a, b) => b.score - a.score);
  
  return scored.map(s => s.text);
}

function scoreSentenceInformation(sentence) {
  let score = 0;
  
  // WEEK 2: Decision record IDs and nonces (highest priority for traceability)
  // Generalized patterns to support multiple formats (DR-###, ARCH-###, etc.)
  if (/\b(DR|ARCH)-[A-Z0-9]+\b/i.test(sentence)) score += 10;  // Decision Record ID (generalized)
  if (/\bNonce\s+[A-Z0-9]+\b/i.test(sentence)) score += 10;  // Nonce identifier
  if (/\b[A-Z]\d[A-Z0-9]{2,3}\b/.test(sentence)) score += 8;  // Standalone nonce patterns (Q7F3, N-19C8, X4K2)
  
  // Numbers and percentages
  score += (sentence.match(/\d+\.?\d*%?/g) || []).length * 3;
  
  // Technical terms (camelCase, snake_case, or technical patterns)
  score += (sentence.match(/[A-Z][a-z]+[A-Z][a-zA-Z]*|[a-z]+_[a-z]+|\w+\(\)/g) || []).length * 2;
  
  // Specific names (capitalized words)
  score += (sentence.match(/\b[A-Z][a-z]+\b/g) || []).length * 1;
  
  // Technical keywords
  const techKeywords = ['algorithm', 'implementation', 'framework', 'library', 'module', 'function', 'class', 'method', 'parameter', 'tensor', 'quantum', 'network'];
  for (const keyword of techKeywords) {
    if (sentence.toLowerCase().includes(keyword)) score += 1;
  }
  
  return score;
}

function round2(num) {
  return Math.round((num || 0) * 100) / 100;
}

module.exports = {
  buildFusionPack,
  renderFusionFactsBlock
};
