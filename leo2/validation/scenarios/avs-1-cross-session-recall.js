/**
 * AVS-1R: Cross-Session Recall
 * 
 * Validates that Leo2 can semantically recall policy decisions made in
 * previous sessions, even when the query is paraphrased.
 * 
 * Test Flow:
 * 1. Session 1 (Tuesday): User states "We rejected Python, use Java only"
 * 2. Session 2 (Friday): User asks "What language should we use?"
 * 3. Validate: Response indicates Java as chosen/standardized language (decision-anchored)
 * 4. Validate: Response does NOT recommend Python (may mention in rejection context)
 * 
 * Success Criteria:
 * - Semantic retrieval finds the Tuesday decision
 * - Response indicates Java as the chosen/standardized language
 * - Response does not recommend Python (rejection mentions are allowed)
 * 
 * Generalized ID Patterns:
 * - Randomizes between multiple decision record formats (DR-###, ARCH-###)
 * - Randomizes nonce formats (Q7F3, N-19C8)
 * - Proves system isn't tuned for specific patterns
 */

// Randomize decision record ID and nonce to prove generalization
const ID_FORMATS = [
  { record: 'DR-014', nonce: 'Q7F3' },
  { record: 'ARCH-22B', nonce: 'N-19C8' },
  { record: 'DR-091', nonce: 'X4K2' }
];

const selectedFormat = ID_FORMATS[Math.floor(Math.random() * ID_FORMATS.length)];
const DECISION_RECORD_ID = selectedFormat.record;
const NONCE = selectedFormat.nonce;

console.log(`[AVS-1R] Using randomized IDs: ${DECISION_RECORD_ID}, Nonce ${NONCE}`);

module.exports = {
  id: 'AVS-1R',
  name: 'Cross-Session Recall',
  description: 'Validates semantic recall of policy decisions across sessions with paraphrased queries',
  
  steps: [
    // Session 1 (Tuesday): Establish policy decision with unique identifiers
    {
      type: 'request',
      description: 'Session 1 (Tuesday): User states language constraint with decision record ID and nonce',
      input: `Decision Record ${DECISION_RECORD_ID} (Nonce ${NONCE}): We rejected Python for this integration project. We must use Java only. Do not re-open this decision.`,
      sessionId: 'avs1r_tuesday_session',
      userContext: {
        timestamp: Date.now(),
        dayOfWeek: 'Tuesday'
      }
    },
    {
      type: 'assert',
      description: 'Verify response acknowledges the decision',
      assertion: 'min_length',
      value: 10
    },
    
    // Wait to simulate time gap between sessions
    {
      type: 'wait',
      description: 'Simulate 3-day gap (Tuesday → Friday)',
      duration: 100 // Minimal wait for testing
    },
    
    // Session 2 (Friday): Query with paraphrase requiring the identifiers
    {
      type: 'request',
      description: 'Session 2 (Friday): User asks about language choice, requesting decision record ID and nonce',
      input: 'What programming language did we standardize on for the integration project? Please include the decision record ID and nonce.',
      sessionId: 'avs1r_friday_session', // Different session ID
      userContext: {
        timestamp: Date.now() + 259200000, // +3 days in ms
        dayOfWeek: 'Friday'
      }
    },
    
    // Assertions: Validate semantic recall with unique identifiers (proves retrieval, not guessing)
    {
      type: 'assert',
      description: `Response contains decision record ID ${DECISION_RECORD_ID} (proves retrieval)`,
      assertion: 'contains',
      value: DECISION_RECORD_ID,
      caseInsensitive: true
    },
    {
      type: 'assert',
      description: `Response contains nonce ${NONCE} (proves retrieval)`,
      assertion: 'contains',
      value: NONCE,
      caseInsensitive: true
    },
    {
      type: 'assert',
      description: 'Response indicates Java as chosen/standardized language (decision-anchored)',
      assertion: 'decision_anchored',
      value: 'Java'
    },
    {
      type: 'assert',
      description: 'Response does NOT suggest Python (constraint respected)',
      assertion: 'not_suggests',
      value: 'Python'
    },
    {
      type: 'assert',
      description: 'Response is substantive (not just "I don\'t know")',
      assertion: 'min_length',
      value: 50
    }
  ]
};
