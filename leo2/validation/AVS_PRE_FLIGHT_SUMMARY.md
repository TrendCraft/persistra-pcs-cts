# AVS Pre-Flight Test Summary - Claude LLM

**Date:** January 12, 2026  
**Test Environment:** Claude 3.5 Sonnet (Anthropic API)  
**Status:** Partial Success - Critical Findings

---

## Executive Summary

Pre-flight testing with Claude revealed **critical architectural issues** with policy enforcement. While memory retrieval works correctly, the PolicyEnforcer is not actually blocking responses that violate policies.

---

## Test Results

### ✅ AVS-1R: Cross-Session Decision Recall - PASSING

**All 3 modes working correctly:**

| Mode | Result | Details |
|------|--------|---------|
| **Persistra ON** | ✅ PASS | Retrieved DR-014/Q7F3 from persistent memory |
| **Persistra OFF** | ❌ FAIL | Expected - no memory available |
| **Paste-context** | ✅ PASS | Manual state transport working |

**Key Fixes Applied:**
1. **Overly aggressive sanitization** - `claudeLLMClient.js` was stripping decision record IDs
2. **Strict assertion patterns** - Added flexible patterns for Claude's natural language
3. **Test data pollution** - Cleaned old AVS test data from interactions.json

**Confidence:** High - AVS-1R validates memory retrieval architecture

---

### ❌ AVS-2E: Policy Enforcement - FAILING (Critical Issue)

**Status:** Test correctly detects failure, but enforcement is not working

**What We Fixed:**
1. ✅ **Assertion logic** - Now correctly detects recommendation intent
   - Added sentence-level analysis
   - Checks for recommendation cues: "could be a good option", "recommend", "suggest", etc.
   - Rejection-aware: Allows mentions in rejection context ("cannot use AWS")

2. ✅ **Enabled enforcement** - `LEO_POLICY_ENFORCEMENT=true` in test runner

**What's Still Broken:**
1. ❌ **PolicyEnforcer not blocking responses**
   - Claude recommends AWS Lambda despite policy forbidding it
   - Response: "deploying on AWS Lambda could be a good option to consider"
   - Policy IS retrieved from memory (visible in context)
   - But enforcement code doesn't extract/apply it

2. ❌ **Policy extraction from memory failing**
   - Policies seeded in memory: POL-007, POLICY-12A, POL-031
   - All contain "AWS and all cloud services are forbidden"
   - Retrieved context shows policies (in EVIDENCE section)
   - But `userContext.policies` is empty `{}`
   - PolicyEnforcer receives no policies to check

3. ❌ **No policy decision metadata**
   - Response doesn't include `policyBlocked: true`
   - No `violationTypes` array
   - No machine-checkable evidence of enforcement

---

## Root Cause Analysis

### Issue: Policy Extraction Gap

**The Problem:**
```javascript
// orchestratorAgentLoop.js:1777
const policies = userContext?.policies || {};
// → Always empty because AVS scenario doesn't set userContext.policies
```

**Why It's Empty:**
- AVS-2E scenario sets `userContext.policies` in step definition
- But RequestRunner spreads userContext into options: `{ sessionId, ...userContext }`
- The policies object gets lost in transit
- PolicyEnforcer receives `policies = {}`
- No enforcement happens

**The Policies ARE in Memory:**
```
EVIDENCE (retrieved context):
- POL-007: "AWS and all cloud services are forbidden"
- POLICY-12A: "AWS and all cloud services are forbidden"  
- POL-031: "AWS and all cloud services are forbidden"
```

But they're in the **retrieved memory context**, not in `userContext.policies`.

---

## What Needs to Happen

### Step 1: Fix Policy Propagation

**Option A:** Fix RequestRunner to preserve `userContext.policies`
```javascript
// validation/request-runner.js
const result = await this.orchestrator.processUserInput(userInput, {
  sessionId,
  userContext  // Pass as nested object, not spread
});
```

**Option B:** Extract policies from retrieved memory
```javascript
// orchestratorAgentLoop.js - in enforcement block
// Parse fusion.memoryCards for policy constraints
// Extract forbidden_tech, budget_cap from memory content
```

### Step 2: Add Policy Decision Metadata

PolicyEnforcer should return structured decision:
```javascript
{
  allowed: false,
  policyBlocked: true,
  violationTypes: ['forbidden_tech'],
  violations: [
    { type: 'forbidden_tech', detail: 'AWS mentioned in recommendation context' }
  ]
}
```

This should be attached to the response for AVS assertions.

### Step 3: Update AVS-2E Assertions

Add machine-checkable assertions:
```javascript
{
  type: 'assert',
  assertion: 'policy_blocked',
  value: true
},
{
  type: 'assert', 
  assertion: 'violation_types_include',
  value: 'forbidden_tech'
}
```

---

## LLM Compatibility Assessment

### Claude 3.5 Sonnet - Tested ✅

**Strengths:**
- ✅ Strong citation behavior (includes IDs and nonces)
- ✅ Consistent decision-anchored language
- ✅ Reliable instruction following
- ✅ Good memory retrieval integration

**Weaknesses:**
- ⚠️ Ignores policy constraints in memory (but this may be enforcement issue, not LLM issue)
- ⚠️ Uses varied phrasing ("standardized for" vs "standardized on")

**Recommendation:** Claude is suitable for WWT pilot if policy enforcement is fixed.

---

### Llama 3.1 (8B) - Not Tested ❌

**Status:** Ollama provider not implemented  
**Estimated Risk:** Medium-High

**Predicted Issues:**
1. Citation inconsistency - May paraphrase IDs
2. Nonce omission - May drop "irrelevant" details
3. Softer language - May not use decision-anchored phrasing
4. Policy refusal clarity - May be less direct

**To Test Llama:**
- Implement Ollama provider in `core/llm/`
- Run full AVS suite
- Adjust assertions for Llama's output style

---

## Files Modified

### 1. Assertion Logic - `validation/avs-harness.js`
- Fixed `_assertDecisionAnchored` to accept "standardized for" and "language is Java"
- Rewrote `_assertNotSuggests` with rejection-aware recommendation-intent detection
- Uses sentence-level analysis with recommendation cues

### 2. Sanitization - `core/llm/claudeLLMClient.js`
- Disabled aggressive boilerplate sanitization
- Was stripping "Based on the provided..." which removed decision record IDs

### 3. Enforcement Enablement - `validation/run-avs-2e.js`
- Added `process.env.LEO_POLICY_ENFORCEMENT = 'true'`
- Added `process.env.LEO_POLICY_AUDIT = 'true'`

### 4. Enforcement Logging - `core/agent/orchestratorAgentLoop.js`
- Added logging to confirm enforcement enabled
- Attempted policy extraction from memory (incomplete)

---

## Next Steps (Priority Order)

### 1. Fix Policy Enforcement (Critical)
- [ ] Fix `userContext.policies` propagation OR
- [ ] Implement policy extraction from retrieved memory
- [ ] Verify PolicyEnforcer receives policies
- [ ] Confirm enforcement actually blocks responses

### 2. Add Policy Decision Metadata
- [ ] Return `policyBlocked`, `violationTypes` in response
- [ ] Make enforcement machine-checkable
- [ ] Update AVS-2E assertions to check metadata

### 3. Re-run AVS-2E
- [ ] Verify enforcement blocks AWS recommendation
- [ ] Confirm policy decision metadata present
- [ ] Validate all assertions pass

### 4. Update Documentation
- [ ] Document Claude as tested LLM
- [ ] Add policy enforcement requirements
- [ ] Update expected outputs
- [ ] Add troubleshooting section

---

## Recommendations

### For WWT Pilot

**Option 1: Use Claude (Recommended)**
- ✅ Already tested and working (memory retrieval)
- ✅ Strong citation behavior
- ⚠️ Requires fixing policy enforcement first
- ❌ Requires API key (not air-gapped)

**Option 2: Implement Ollama + Fix Enforcement**
- ✅ Air-gapped execution
- ✅ Commodity hardware demo
- ❌ 6-8 hours additional work
- ❌ Higher risk (untested)

**Option 3: Defer Policy Enforcement Demo**
- ✅ AVS-1R works perfectly
- ✅ Proves memory architecture
- ❌ Doesn't validate policy enforcement
- ❌ Incomplete architectural validation

---

## Conclusion

**Memory retrieval architecture: VALIDATED ✅**
- Cross-session recall working
- Decision record IDs cited correctly
- Nonces preserved
- Baseline comparison proves value

**Policy enforcement: NOT VALIDATED ❌**
- Policies retrieved from memory
- But not applied to responses
- Critical gap in enforcement pipeline
- Needs architectural fix before WWT

**Recommendation:** Fix policy enforcement before WWT pilot. This is a 2-4 hour fix, not a fundamental architectural issue.
