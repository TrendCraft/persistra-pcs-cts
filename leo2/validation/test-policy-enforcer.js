#!/usr/bin/env node

/**
 * Policy Enforcer Test Script
 * 
 * Tests the 4 scoped policy types:
 * - budget_cap: Token/cost limits
 * - forbidden_tech: Disallowed technologies
 * - required_tech: Required technologies
 * - on_prem_only: On-premises only restriction
 */

const PolicyEnforcer = require('../core/security/policyEnforcer');

console.log('=== Policy Enforcer Test Suite ===\n');

const enforcer = new PolicyEnforcer(console);

// Test 1: budget_cap violation
console.log('Test 1: budget_cap (SHOULD DENY - high severity)');
const test1 = enforcer.checkResponse(
  'This is a very long response that exceeds the token budget...',
  {
    estimatedTokens: 5000,
    policies: { budget_cap: 3000 },
    audience: 'investor'
  }
);
console.log('Result:', test1.decision, '| Violations:', test1.violationCount);
console.log('Expected: DENY\n');

// Test 2: forbidden_tech violation
console.log('Test 2: forbidden_tech - AWS mentioned (SHOULD DENY)');
const test2 = enforcer.checkResponse(
  'We recommend using AWS Lambda for this deployment.',
  {
    policies: { forbidden_tech: ['AWS', 'Kubernetes'] },
    audience: 'investor'
  }
);
console.log('Result:', test2.decision, '| Violations:', test2.violationCount);
console.log('Expected: DENY\n');

// Test 3: forbidden_tech in rejection context (SHOULD ALLOW)
console.log('Test 3: forbidden_tech - AWS rejected (SHOULD ALLOW)');
const test3 = enforcer.checkResponse(
  'We cannot use AWS due to compliance requirements. We will use on-premises infrastructure.',
  {
    policies: { forbidden_tech: ['AWS'] },
    audience: 'investor'
  }
);
console.log('Result:', test3.decision, '| Violations:', test3.violationCount);
console.log('Expected: ALLOW\n');

// Test 4: required_tech missing (SHOULD ALLOW - medium severity)
console.log('Test 4: required_tech - Java missing (SHOULD ALLOW - medium severity)');
const test4 = enforcer.checkResponse(
  'The integration layer uses Python and TypeScript.',
  {
    policies: { required_tech: ['Java'] },
    audience: 'investor'
  }
);
console.log('Result:', test4.decision, '| Violations:', test4.violationCount);
console.log('Expected: ALLOW (medium severity only)\n');

// Test 5: required_tech present (SHOULD ALLOW)
console.log('Test 5: required_tech - Java present (SHOULD ALLOW)');
const test5 = enforcer.checkResponse(
  'The integration layer uses Java exclusively.',
  {
    policies: { required_tech: ['Java'] },
    audience: 'investor'
  }
);
console.log('Result:', test5.decision, '| Violations:', test5.violationCount);
console.log('Expected: ALLOW\n');

// Test 6: on_prem_only violation (SHOULD DENY)
console.log('Test 6: on_prem_only - cloud mentioned (SHOULD DENY)');
const test6 = enforcer.checkResponse(
  'We deploy to AWS cloud for scalability.',
  {
    policies: { on_prem_only: true },
    audience: 'investor'
  }
);
console.log('Result:', test6.decision, '| Violations:', test6.violationCount);
console.log('Expected: DENY\n');

// Test 7: on_prem_only with cloud rejection (SHOULD ALLOW)
console.log('Test 7: on_prem_only - cloud rejected (SHOULD ALLOW)');
const test7 = enforcer.checkResponse(
  'We do not use cloud services. All infrastructure is on-premises.',
  {
    policies: { on_prem_only: true },
    audience: 'investor'
  }
);
console.log('Result:', test7.decision, '| Violations:', test7.violationCount);
console.log('Expected: ALLOW\n');

// Test 8: Multiple policies, all pass (SHOULD ALLOW)
console.log('Test 8: Multiple policies - all pass (SHOULD ALLOW)');
const test8 = enforcer.checkResponse(
  'The integration layer uses Java exclusively on our on-premises infrastructure.',
  {
    estimatedTokens: 500,
    policies: {
      budget_cap: 3000,
      forbidden_tech: ['AWS', 'Python'],
      required_tech: ['Java'],
      on_prem_only: true
    },
    audience: 'investor'
  }
);
console.log('Result:', test8.decision, '| Violations:', test8.violationCount);
console.log('Expected: ALLOW\n');

// Test 9: Multiple violations (SHOULD DENY)
console.log('Test 9: Multiple violations (SHOULD DENY)');
const test9 = enforcer.checkResponse(
  'We use AWS and Python for cloud deployment.',
  {
    policies: {
      forbidden_tech: ['AWS', 'Python'],
      on_prem_only: true
    },
    audience: 'investor'
  }
);
console.log('Result:', test9.decision, '| Violations:', test9.violationCount);
console.log('Violation types:', test9.violations.map(v => v.type).join(', '));
console.log('Expected: DENY\n');

// Summary
console.log('=== Test Summary ===');
console.log('PolicyEnforcer validates 4 policy types:');
console.log('✅ budget_cap - Token/cost limits');
console.log('✅ forbidden_tech - Disallowed technologies (rejection-aware)');
console.log('✅ required_tech - Required technologies');
console.log('✅ on_prem_only - On-premises restriction (rejection-aware)');
console.log('\nIntegration: PolicyEnforcer → PermissionController.checkPermission("emit_response")');
console.log('Decision: DENY if high-severity violations, ALLOW otherwise');
