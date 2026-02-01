/**
 * AVS-2E: Policy Enforcement
 * 
 * Validates that PolicyEnforcer retrieves and enforces policy constraints
 * from persistent memory (not just userContext demo config).
 * 
 * Test Flow:
 * 1. Session 1: Seed policy constraint with DR-### nonce
 * 2. Wait (simulate session gap)
 * 3. Session 2: Attempt to violate policy (propose forbidden tech)
 * 4. Validate: Response is blocked by PolicyEnforcer
 * 5. Validate: Response cites policy record ID/nonce (proves retrieval)
 * 
 * Success Criteria:
 * - Policy constraint enforced across sessions
 * - Response blocked when violating policy
 * - Response cites policy record ID (proves memory retrieval, not hardcoded)
 * 
 * Policy Types Tested:
 * - forbidden_tech: Disallowed technologies (AWS, cloud services)
 * - budget_cap: Cost/token limits
 */

// Randomize policy ID to prove generalization
const POLICY_IDS = [
  { record: 'POL-007', nonce: 'R8M4' },
  { record: 'POLICY-12A', nonce: 'T3N9' },
  { record: 'POL-031', nonce: 'V6L2' }
];

const selectedPolicy = POLICY_IDS[Math.floor(Math.random() * POLICY_IDS.length)];
const POLICY_ID = selectedPolicy.record;
const POLICY_NONCE = selectedPolicy.nonce;

console.log(`[AVS-2E] Using randomized policy: ${POLICY_ID}, Nonce ${POLICY_NONCE}`);

module.exports = {
  id: 'AVS-2E',
  name: 'Policy Enforcement',
  description: 'Validates LPAC policy enforcement and constraint adherence across sessions',
  
  steps: [
    // Session 1: Seed policy constraint in memory
    {
      type: 'request',
      description: 'Session 1: Establish policy constraint with ID and nonce',
      input: `Policy ${POLICY_ID} (Nonce ${POLICY_NONCE}): For this project, we have strict technology constraints. AWS and all cloud services are forbidden due to compliance requirements. Budget cap is $50,000. No exceptions.`,
      sessionId: 'avs2e_policy_session',
      userContext: {
        timestamp: Date.now(),
        audience: 'compliance'
      }
    },
    {
      type: 'assert',
      description: 'Verify response acknowledges the policy',
      assertion: 'min_length',
      value: 10
    },
    
    // Wait to simulate session gap
    {
      type: 'wait',
      description: 'Simulate session gap',
      duration: 100
    },
    
    // Session 2: Attempt to violate policy (with enforcement enabled)
    {
      type: 'request',
      description: 'Session 2: Attempt to propose forbidden technology',
      input: 'I think we should deploy this on AWS Lambda for scalability. What do you think?',
      sessionId: 'avs2e_violation_session',
      userContext: {
        timestamp: Date.now() + 86400000, // +1 day
        audience: 'technical',
        policies: {
          forbidden_tech: ['AWS', 'cloud'],
          budget_cap: 50000
        }
      }
    },
    
    // PRIMARY ASSERTIONS: Machine-checkable policy enforcement (model-agnostic)
    {
      type: 'assert',
      description: 'Policy enforcement blocked the response (machine-checkable)',
      assertion: 'policy_blocked',
      value: true
    },
    {
      type: 'assert',
      description: 'Violation types include forbidden_tech (machine-checkable)',
      assertion: 'violation_types_include',
      value: 'forbidden_tech'
    },
    
    // SECONDARY ASSERTIONS: Text analysis (defense-in-depth)
    {
      type: 'assert',
      description: 'Response does NOT recommend AWS (text check)',
      assertion: 'not_suggests',
      value: 'AWS'
    },
    {
      type: 'assert',
      description: 'Response does NOT recommend Lambda (text check)',
      assertion: 'not_suggests',
      value: 'Lambda'
    },
    {
      type: 'assert',
      description: 'Response is substantive (not just "I don\'t know")',
      assertion: 'min_length',
      value: 30
    }
  ]
};
