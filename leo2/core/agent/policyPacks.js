/**
 * LPAC Policy Pack System
 * Dynamic prompt injection based on decision signals
 * Keeps system prompt minimal and evergreen
 */

const POLICY_PACKS = {
  ANTI_GENERALIZATION: {
    id: 'anti_gen',
    priority: 1,
    tokens: 85,
    content: "Lead with unique differentiators that distinguish this topic from similar technologies. Avoid table-stakes statements that apply broadly to the field."
  },
  
  CONFIDENCE_CALIBRATION: {
    id: 'confidence',
    priority: 2, 
    tokens: 95,
    content: "Label all claims with confidence qualifiers: 'Lab-scale demonstrations show...', 'Preliminary results indicate...', 'Theory suggests...', 'Limited to X-qubit systems...'. Explicitly note gaps in coverage."
  },
  
  QUANTITATIVE_CLAIMS: {
    id: 'quant_claims',
    priority: 3,
    tokens: 75,
    content: "Only cite specific numbers found in memory. If no quantified data exists, state 'no verified benchmarks in memory' rather than fabricating metrics."
  },
  
  INVESTOR_MODE: {
    id: 'investor',
    priority: 4,
    tokens: 90,
    content: "Structure as 2-3 crisp bullets focusing on market relevance, competitive advantages, and concrete benchmarks. Emphasize commercial viability and differentiation."
  },
  
  CONSERVATIVE_MODE: {
    id: 'conservative',
    priority: 5,
    tokens: 70,
    content: "Use cautious language for low-coverage topics. Suggest expanding search or requesting clarification when memory is sparse."
  }
};

/**
 * Determine which policy packs to inject based on LPAC decision signals
 */
function selectPolicyPacks(fusion, memoryCards, sessionContext = {}) {
  const packs = [];
  const avgSalience = fusion?.avgSalience || 0;
  const decisionMode = fusion?.routingHint || '';
  const memoryWeight = fusion?.memoryWeight || 0;
  
  // High-salience memory-first mode gets anti-generalization + confidence
  if (avgSalience >= 0.65 && (decisionMode.includes('memory') || memoryWeight > 0.6)) {
    packs.push(POLICY_PACKS.ANTI_GENERALIZATION);
    packs.push(POLICY_PACKS.CONFIDENCE_CALIBRATION);
  }
  
  // Detect quantitative data in memory cards
  const hasQuantData = memoryCards.some(card => {
    const content = (card.content || card.snippet || '').toLowerCase();
    return /%|db|qubit|ms|ns|ghz|mhz|fidelity|error rate|\d+\.?\d*\s*(percent|%|db|ms|ns|qubits?)/.test(content);
  });
  
  if (hasQuantData) {
    packs.push(POLICY_PACKS.QUANTITATIVE_CLAIMS);
  }
  
  // Investor demo mode
  if (sessionContext.audience === 'investor' || process.env.LPAC_INVESTOR_MODE === '1') {
    packs.push(POLICY_PACKS.INVESTOR_MODE);
  }
  
  // Low coverage mode
  const cardCount = memoryCards.length;
  const lowCoverage = cardCount < 3 || avgSalience < 0.4;
  if (lowCoverage && !packs.length) {
    packs.push(POLICY_PACKS.CONSERVATIVE_MODE);
  }
  
  return packs;
}

/**
 * Apply token budget constraints and prioritization
 */
function applyTokenBudget(selectedPacks, maxTokens = 300, maxPacks = 3) {
  // Sort by priority (lower number = higher priority)
  const sorted = [...selectedPacks].sort((a, b) => a.priority - b.priority);
  
  const applied = [];
  let tokensUsed = 0;
  
  for (const pack of sorted) {
    if (applied.length >= maxPacks) break;
    if (tokensUsed + pack.tokens > maxTokens) break;
    
    applied.push(pack);
    tokensUsed += pack.tokens;
  }
  
  return { applied, tokensUsed };
}

/**
 * Convert policy packs to developer messages for prompt injection
 */
function createPolicyMessages(appliedPacks) {
  return appliedPacks.map(pack => ({
    role: 'developer',
    content: `[Policy: ${pack.id.toUpperCase()}] ${pack.content}`
  }));
}

/**
 * Main policy pack injection function
 */
function injectPolicyPacks(fusion, memoryCards, sessionContext = {}, tokenBudget = 300) {
  const selectedPacks = selectPolicyPacks(fusion, memoryCards, sessionContext);
  const { applied, tokensUsed } = applyTokenBudget(selectedPacks, tokenBudget);
  const messages = createPolicyMessages(applied);
  
  return {
    messages,
    appliedPacks: applied.map(p => p.id),
    tokensUsed,
    totalAvailable: Object.keys(POLICY_PACKS).length
  };
}

module.exports = {
  POLICY_PACKS,
  selectPolicyPacks,
  applyTokenBudget,
  createPolicyMessages,
  injectPolicyPacks
};
