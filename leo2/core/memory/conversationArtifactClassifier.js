/**
 * Conversation Artifact Classifier
 * 
 * Phase 2 Part B: Deterministic classifier for conversation summaries
 * 
 * Promotes conversation summaries into structured cognitive artifacts:
 * - conversation_decision: Commitments, choices, agreements
 * - conversation_constraint: Rules, requirements, boundaries
 * - conversation_hypothesis: Theories, assumptions, open questions
 * - conversation_discussion: General conversation (fallback)
 * 
 * Design principles:
 * - Deterministic regex/heuristics only (no LLM calls)
 * - Conservative precedence: constraint > decision > hypothesis > discussion
 * - Bounded extracted payloads (no unbounded strings)
 * - Pilot-safe: no IP leakage (lexical patterns only)
 */

/**
 * Classify a conversation summary into a cognitive artifact type
 * 
 * @param {string} summaryText - Conversation summary text
 * @returns {Object} Classification result
 *   - artifactType: One of [conversation_decision, conversation_constraint, conversation_hypothesis, conversation_discussion]
 *   - confidence: Number in [0, 1] indicating classification confidence
 *   - extracted: Bounded payload with key phrases/entities
 *   - tags: Array of relevant tags for retrieval
 */
function classifyConversationArtifact(summaryText) {
  if (!summaryText || typeof summaryText !== 'string') {
    return {
      artifactType: 'conversation_discussion',
      confidence: 0.5,
      extracted: {},
      tags: []
    };
  }

  const text = summaryText.toLowerCase();
  const lines = summaryText.split('\n').filter(l => l.trim().length > 0);
  
  // PRECEDENCE 1: CONSTRAINT (highest priority)
  // Patterns: must, required, cannot, forbidden, always, never, rule, policy
  const constraintPatterns = [
    /\b(must|required|mandatory|cannot|forbidden|prohibited|disallow)\b/i,
    /\b(always|never|every time|invariant|rule|policy|requirement)\b/i,
    /\b(shall|shall not|should not|must not)\b/i,
    /\b(constraint|restriction|limitation|boundary)\b/i
  ];
  
  const constraintMatches = constraintPatterns.filter(p => p.test(text)).length;
  
  if (constraintMatches >= 2) {
    const extracted = extractConstraintPayload(summaryText, lines);
    return {
      artifactType: 'conversation_constraint',
      confidence: Math.min(0.95, 0.7 + (constraintMatches * 0.1)),
      extracted,
      tags: ['constraint', 'rule', 'requirement', ...extracted.tags]
    };
  }
  
  // PRECEDENCE 2: DECISION (second priority)
  // Patterns: Strong commitment signals only (decided, agreed, will, locked in)
  // Excludes weak verbs: "should consider", "might want to", "could try"
  const decisionPatterns = [
    /\b(decided|agreed|chose|chosen|selected)\b/i,
    /\b(we will|we'll|going to|committed to|locked in)\b/i,
    /\b(final decision|finalized|approved|accepted)\b/i,
    /\b(reject|decline|ruled out)\b/i
  ];
  
  const decisionMatches = decisionPatterns.filter(p => p.test(text)).length;
  
  // Exclude weak commitment phrases that would create false positives
  const weakCommitmentPatterns = [
    /\b(should consider|might want|could try|maybe should|perhaps we)\b/i,
    /\b(thinking about|considering|exploring|evaluating)\b/i
  ];
  
  const hasWeakCommitment = weakCommitmentPatterns.some(p => p.test(text));
  
  // Require 2+ strong patterns AND no weak commitment language
  if (decisionMatches >= 2 && !hasWeakCommitment) {
    const extracted = extractDecisionPayload(summaryText, lines);
    return {
      artifactType: 'conversation_decision',
      confidence: Math.min(0.9, 0.65 + (decisionMatches * 0.1)),
      extracted,
      tags: ['decision', 'commitment', 'agreement', ...extracted.tags]
    };
  }
  
  // PRECEDENCE 3: HYPOTHESIS (third priority)
  // Patterns: maybe, might, could, possibly, theory, assume, hypothesis, question
  const hypothesisPatterns = [
    /\b(maybe|might|could|possibly|perhaps|potentially)\b/i,
    /\b(theory|hypothesis|assumption|guess|suspect)\b/i,
    /\b(wonder|question|unclear|unknown|investigate)\b/i,
    /\b(if|whether|what if|suppose)\b/i,
    /\?/  // Questions are often hypotheses
  ];
  
  const hypothesisMatches = hypothesisPatterns.filter(p => p.test(text)).length;
  
  if (hypothesisMatches >= 2) {
    const extracted = extractHypothesisPayload(summaryText, lines);
    return {
      artifactType: 'conversation_hypothesis',
      confidence: Math.min(0.85, 0.6 + (hypothesisMatches * 0.1)),
      extracted,
      tags: ['hypothesis', 'question', 'theory', ...extracted.tags]
    };
  }
  
  // FALLBACK: DISCUSSION (default)
  // General conversation that doesn't fit other categories
  const extracted = extractDiscussionPayload(summaryText, lines);
  return {
    artifactType: 'conversation_discussion',
    confidence: 0.5,
    extracted,
    tags: ['discussion', 'conversation', ...extracted.tags]
  };
}

/**
 * Extract bounded payload for constraint artifacts
 */
function extractConstraintPayload(text, lines) {
  const payload = {
    rules: [],
    tags: []
  };
  
  // Extract up to 3 constraint-related lines (bounded)
  const constraintLines = lines.filter(line => {
    const lower = line.toLowerCase();
    return /\b(must|required|cannot|always|never|rule)\b/i.test(lower);
  }).slice(0, 3);
  
  payload.rules = constraintLines.map(line => line.substring(0, 200)); // Bounded to 200 chars
  
  // Extract constraint type tags
  if (/\b(security|auth|permission)\b/i.test(text)) payload.tags.push('security');
  if (/\b(performance|speed|latency)\b/i.test(text)) payload.tags.push('performance');
  if (/\b(data|schema|format)\b/i.test(text)) payload.tags.push('data');
  
  return payload;
}

/**
 * Extract bounded payload for decision artifacts
 */
function extractDecisionPayload(text, lines) {
  const payload = {
    decisions: [],
    tags: []
  };
  
  // Extract up to 3 decision-related lines (bounded)
  const decisionLines = lines.filter(line => {
    const lower = line.toLowerCase();
    return /\b(decided|agreed|will|going to|chose)\b/i.test(lower);
  }).slice(0, 3);
  
  payload.decisions = decisionLines.map(line => line.substring(0, 200)); // Bounded to 200 chars
  
  // Extract decision type tags
  if (/\b(architecture|design|pattern)\b/i.test(text)) payload.tags.push('architecture');
  if (/\b(implementation|code|build)\b/i.test(text)) payload.tags.push('implementation');
  if (/\b(timeline|schedule|deadline)\b/i.test(text)) payload.tags.push('timeline');
  
  return payload;
}

/**
 * Extract bounded payload for hypothesis artifacts
 */
function extractHypothesisPayload(text, lines) {
  const payload = {
    hypotheses: [],
    tags: []
  };
  
  // Extract up to 3 hypothesis-related lines (bounded)
  const hypothesisLines = lines.filter(line => {
    const lower = line.toLowerCase();
    return /\b(maybe|might|could|theory|question|wonder)\b/i.test(lower) || /\?/.test(line);
  }).slice(0, 3);
  
  payload.hypotheses = hypothesisLines.map(line => line.substring(0, 200)); // Bounded to 200 chars
  
  // Extract hypothesis type tags
  if (/\b(bug|issue|problem)\b/i.test(text)) payload.tags.push('investigation');
  if (/\b(optimize|improve|enhance)\b/i.test(text)) payload.tags.push('optimization');
  if (/\b(alternative|option|approach)\b/i.test(text)) payload.tags.push('exploration');
  
  return payload;
}

/**
 * Extract bounded payload for discussion artifacts
 */
function extractDiscussionPayload(text, lines) {
  const payload = {
    topics: [],
    tags: []
  };
  
  // Extract up to 2 topic lines (bounded, conservative for fallback)
  const topicLines = lines.slice(0, 2);
  payload.topics = topicLines.map(line => line.substring(0, 150)); // Bounded to 150 chars
  
  // Extract general topic tags
  if (/\b(question|ask|clarif)\b/i.test(text)) payload.tags.push('question');
  if (/\b(explain|understand|learn)\b/i.test(text)) payload.tags.push('explanation');
  if (/\b(feedback|review|comment)\b/i.test(text)) payload.tags.push('feedback');
  
  return payload;
}

module.exports = {
  classifyConversationArtifact
};
