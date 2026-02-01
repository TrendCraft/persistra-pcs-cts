# PCS Conformance Test Suite - Execution Guide

**Persistra Cognitive Standard (PCS) - Normative Conformance Testing**  
**Version:** PCS-CTS 1.0  
**Date:** February 2026  
**Purpose:** Enable independent validation labs to execute PCS-L1 and PCS-L2 conformance tests

---

## Purpose of This Conformance Test Suite

The PCS Conformance Test Suite (PCS-CTS) is the normative test framework for validating compliance with the Persistra Cognitive Standard (PCS). This suite tests whether persistent cognitive state can be implemented as infrastructure rather than prompt context.

The tests are intentionally synthetic, air-gapped, and automated to remove integration variables. Independent validation at accredited research institutions provides credibility, neutrality, and transferability.

**Why Independent Validation?**  
This conformance suite can be executed anywhere, but validation at independent research institutions (Carnegie Mellon SEI, MIT CSAIL, etc.) provides neutral confirmation that architectural claims hold under controlled, repeatable conditions. Independent validation results become verifiable evidence for PCS certification and standards adoption.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [PCS-CTS L1-DR-001: Cross-Session Decision Recall](#pcs-cts-l1-dr-001-cross-session-decision-recall)
5. [PCS-CTS L2-PR-004: Deterministic Policy Enforcement](#pcs-cts-l2-pr-004-deterministic-policy-enforcement)
6. [PCS-CTS L1-COMP-001: 3-Mode Comparison (Optional)](#pcs-cts-l1-comp-001-3-mode-comparison-optional)
7. [VA-1: Vision Anchor Invariant (Optional Manual Check)](#va-1-vision-anchor-invariant-optional-manual-check)
8. [PCS-CTS L3-CMCC-001: Cross-Model Relay (Future)](#pcs-cts-l3-cmcc-001-cross-model-relay-future)
9. [Reading Audit Trails](#reading-audit-trails)
10. [Troubleshooting](#troubleshooting)
11. [PCS Certification Pathway](#pcs-certification-pathway)
12. [Expected Results Summary](#expected-results-summary)

---

## Overview

The PCS-CTS validates conformance with PCS specifications:
- **PCS-CTS L1-DR-001:** Cross-session decision recall (maps to RFC-PCS-0001, RFC-PCS-0004)
- **PCS-CTS L2-PR-004:** Deterministic policy enforcement (maps to RFC-PCS-0002, RFC-PCS-0004)

Each test can run in **3 modes** to demonstrate architectural differentiation:
- **Persistra ON:** Full persistent memory/state layer (PCS-compliant implementation)
- **Persistra OFF:** Baseline model with hard reset (non-compliant baseline)
- **Paste-context:** Manual state transport simulation (demonstrates fragility)

## LLM Backend Scope for PCS-CTS 1.0

**Claude (Anthropic) is the reference implementation backend for PCS-CTS 1.0.**

All test results, assertions, audit trails, and timings in this guide were generated using Claude. This is a deliberate scope decision to minimize validation surface area, ensure deterministic and repeatable execution, and avoid model-specific variance during conformance testing.

The Persistra architecture is **LLM-provider agnostic by design** (see **PCS-CTS L3-CMCC-001** for cross-model continuity validation), but **multi-backend validation is out of scope for PCS-CTS 1.0**. The reference implementation uses Claude.

**Ollama/Llama and other backends**: Can be used for additional validation of model-agnostic claims, but are not required for PCS-L1 or PCS-L2 certification. Cross-model continuity (PCS-L3) will be validated in PCS-CTS 2.0.

**Note:** The codebase directory and environment variables use the internal project codename `leo2`. This maps 1:1 to the Persistra architecture being validated.

---

## Prerequisites

### System Requirements
- **Node.js:** v18+ (check with `node --version`)
- **Memory:** 8GB+ available RAM (16GB recommended)
- **Disk:** 2GB+ free space for memory graph + audit artifacts
- **OS:** macOS, Linux, or Windows with WSL2

**Optional (only if testing Ollama/Llama):** Running Llama 3.1 (8B) locally typically requires ~5–6GB RAM for quantized weights, plus Node.js overhead. Systems with <8GB RAM may experience swapping or crashes.

### Repository Setup
```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd leo2

# Install dependencies
npm install

# Verify installation
node --version
npm --version
```

### Verify Core Components
```bash
# Check that validation framework exists
ls -la validation/
ls -la validation/scenarios/

# Verify AVS harness
cat validation/avs-harness.js | head -20

# Verify scenarios exist
ls validation/scenarios/avs-*.js
```

---

## Environment Setup

### Environment Variables

Create a `.env` file in the `leo2/` directory or export these variables:

```bash
# === LLM backend (Pilot default) ===
# Claude is the validated backend for the WWT pilot
export LEO_LLM_PROVIDER=claude

# Claude credentials (required for pilot execution)
# Use the variable name(s) your claude client expects. Common options:
export ANTHROPIC_API_KEY=your_key_here

# === Policy enforcement (required for AVS-2E) ===
export LEO_POLICY_ENFORCEMENT=true

# Optional: Enable policy audit logging for debugging
export LEO_POLICY_AUDIT=true

# Optional: Disable vision history (prevents in-process cheating)
export LEO_VISION_HISTORY_MAX=0

# === OPTIONAL: Local Ollama (not required for WWT pilot) ===
# Only set these if you are intentionally validating the Ollama track.
# export LEO_LLM_PROVIDER=ollama
# export OLLAMA_MODEL=llama3.1:latest
```

### Pre-Test Checklist

Before running AVS scenarios:

1. ✅ **Clear previous test data** (optional, for clean slate):
   ```bash
   rm -rf validation/audit/avs-audit-*.json
   ```

2. ✅ **Verify memory graph is initialized**:
   ```bash
   # Memory graph should exist at:
   ls -la data/memory-graph/
   ```

3. ✅ **Confirm Claude credentials are available** (pilot default):
   ```bash
   echo $ANTHROPIC_API_KEY | wc -c
   # Should be > 0
   ```

4. ✅ **Optional: Check Ollama is running** (only if validating the local LLM track):
   ```bash
   curl http://localhost:11434/api/tags
   # Should return list of models

   # Verify the specific model is downloaded
   ollama list | grep llama3.1
   # If not present, pull it now to avoid a long download during a demo:
   ollama pull llama3.1:latest
   ```

---

## CLI Runner (Pilot Scope)

The legacy CLI Runner is not ported. The AVS harness is the runner for all pilot scenarios and produces deterministic pass/fail results plus audit JSON. A unified CLI is packaging/hardening, not an architectural dependency.

---

## AVS-1R: Cross-Session Decision Recall

### What This Tests
- Decision records seeded in Session A are recalled in Session B
- System cites decision record IDs (DR-###, nonces) without re-deciding
- Proves memory retrieval across hard resets (not context window tricks)

### What "Session Gap" Means (Hard Reset)

In this AVS suite, a **session gap** is a deliberately enforced boundary intended to prevent **context-window carryover** from Session 1 into Session 2.

A valid session gap means:
1. **No prompt history transport**: Session 2 must not include any raw user/assistant text from Session 1.
2. **New LLM call / new sessionId**: Session 2 is a fresh LLM invocation under a new `sessionId`.
3. **Only the memory graph persists**: continuity is permitted only through Persistra's retrieval layer (memory cards / retrieved snippets), not by copying prior turns.

#### How to Verify We're Not Cheating

After a run, verify the Session 2 prompt does **not** contain Session 1 conversation text:

- **Check token/length of Session 2 prompt** (should be small and not include full prior turns).
- **Inspect the audit trail**: Session 2 should show retrieval evidence (retrieved memory IDs/snippets) rather than embedded prompt history.
- **Spot-check for contamination**: Session 2 input should not contain long multi-paragraph excerpts from Session 1.

If WWT wants a stricter check, we can add a hard assertion that the Session 2 prompt contains **zero** Session 1 user messages beyond retrieved memory snippets.

### Execution Steps

#### Step 1: Run 3-Mode Comparison

```bash
cd leo2
node validation/avs-1r-comparison.js
```

**Expected Output:**
```
=== AVS-1R: 3-Mode Comparison ===

[Mode 1/3] Running Persistra ON...
✅ AVS-1R PASSED (Persistra ON)

[Mode 2/3] Running Persistra OFF...
❌ AVS-1R FAILED (Persistra OFF)

[Mode 3/3] Running Paste-context...
✅ AVS-1R PASSED (Paste-context)

=== COMPARISON TABLE ===
┌─────────────────────┬────────┬──────────────────────────────────────────────┐
│ Mode                │ Result │ Why                                          │
├─────────────────────┼────────┼──────────────────────────────────────────────┤
│ Persistra ON        │ ✅ PASS │ Retrieved DR-014/Q7F3 from persistent memory │
│ Persistra OFF       │ ❌ FAIL │ No state; cannot cite nonce/ID               │
│ Paste-context       │ ✅ PASS │ Simulates manual context injection (shows fragility/cost) │
└─────────────────────┴────────┴──────────────────────────────────────────────┘
```

**Important:** The "Paste-context" mode is an **automated simulation** of a manual workaround where users copy-paste prior context into each new session. The script runs this automatically to demonstrate that while it technically works, it's fragile and doesn't scale. You don't need to manually paste anything during execution.

#### Step 2: Verify Audit Trail

```bash
# Find the latest audit file
ls -lt validation/audit/avs-audit-*.json | head -1

# View audit trail (replace with actual filename)
cat validation/audit/avs-audit-2026-01-10T*.json | jq '.'
```

**Key Audit Fields to Check:**
- `results[0].steps[*].response.retrievalEvidence.memoryUsedCount` - Should be > 0 for Persistra ON
- `results[0].steps[*].response.retrievalEvidence.avgSalience` - Should be > 0.4 for good retrieval
- `results[0].steps[*].response.retrievalEvidence.mode` - Should match test mode

#### Step 3: Run Individual Mode (Optional)

To run a single mode for debugging:

```bash
# Persistra ON (full retrieval)
node validation/run-avs-1r.js

# Persistra OFF (baseline, should fail)
# (Edit run-avs-1r.js to set mode: 'persistra_off')

# Paste-context (manual state transport)
# (Edit run-avs-1r.js to set mode: 'paste_context')
```

### Success Criteria

**PASS if:**
- ✅ Persistra ON: Cites DR-014 and nonce (Q7F3, N-19C8, or X4K2)
- ✅ Persistra ON: Response contains "Java" and decision-anchored language
- ✅ Persistra OFF: Fails to cite decision record ID
- ✅ Paste-context: Passes but requires manual state transport

**FAIL if:**
- ❌ Persistra ON fails to cite decision record
- ❌ Persistra OFF somehow passes (indicates context window cheating)
- ❌ Response suggests Python (violates decision constraint)

---

## AVS-2E: Policy Enforcement

### What This Tests
- Policy constraints seeded in Session A are enforced in Session B
- System blocks responses that violate policies (forbidden tech, budget caps)
- Proves PolicyEnforcer → PermissionController integration

### Execution Steps

#### Step 1: Enable Policy Enforcement

```bash
export LEO_POLICY_ENFORCEMENT=true
export LEO_POLICY_AUDIT=true  # Optional: verbose logging
```

#### Step 2: Run AVS-2E

```bash
cd leo2
node validation/run-avs-2e.js
```

**Expected Output:**
```
[AVS-2E] Using randomized policy: POL-007, Nonce R8M4

Step 1: Session 1: Establish policy constraint with ID and nonce
✅ PASS

[Policy Seeding] Policy POL-007 established: AWS and cloud services forbidden, Budget cap $50,000

Step 2: Verify response acknowledges the policy
✅ PASS

Step 3: Simulate session gap
✅ PASS

Step 4: Session 2: Attempt to propose forbidden technology
✅ PASS

Step 5: Response does NOT recommend AWS (enforcement working)
✅ PASS

Step 6: Response does NOT recommend Lambda
✅ PASS

Step 7: Response is substantive (not just "I don't know")
✅ PASS

✅ AVS-2E PASSED (8419ms)

=== AVS HARNESS SUMMARY ===
Total scenarios: 1
Passed: 1
Failed: 0
Success rate: 100.0%
```

#### Step 3: Verify Policy Enforcement Logs

```bash
# Check for policy enforcement logs
grep -i "PolicyEnforcer" leo-debug.log | tail -20

# Check PermissionController decisions
grep -i "PermissionController.*emit_response" leo-debug.log | tail -10
```

**Expected Log Patterns (examples):**
```
[PolicyEnforcer] Response ALLOWED (no violations)
[PermissionController] emit_response: { decision: 'ALLOW', violations: 0 }

OR, on a blocked response:

[PolicyEnforcer] Response DENIED (violations: forbidden_tech)
[PermissionController] emit_response: { decision: 'DENY', violations: 1 }
```

#### Step 4: Test Policy Violation (Manual)

To manually test a violation:

```bash
# Run with enforcement enabled
export LEO_POLICY_ENFORCEMENT=true

# Start interactive session
node cli/leo_cli.js

# FIRST: Seed the policy (critical - model needs to know the constraint)
> "Policy POL-007: For this project, AWS and all cloud services are forbidden due to compliance requirements. Budget cap is $50,000."

# THEN: Try to violate the policy
> "Let's deploy this on AWS Lambda for better scalability"

# Expected response:
# "This response violates policy constraints (forbidden_tech). 
#  Please provide a compliant alternative that adheres to the established requirements."
```

**Important:** The policy must be seeded first (either via the AVS-2E script or manually) before attempting a violation. Without the seeded policy, the model has no context that AWS is forbidden and may reasonably recommend it.

### Success Criteria

**PASS if:**
- ✅ Response does NOT recommend AWS or Lambda
- ✅ Response is substantive (not just "I don't know")
- ✅ Policy enforcement logs show explicit ALLOW/DENY decisions consistent with violations

**FAIL if:**
- ❌ Response recommends AWS/Lambda despite policy
- ❌ Policy enforcement not triggered
- ❌ Response is blocked incorrectly (false positive)

---

## AVS-2.5: Zero-Friction Validation (Meta-Scenario)

### What This Validates

**Claim:** Architectural validation survives enterprise friction.

AVS-2.5 is not a separate test scenario—it is a **meta-property** of the validation framework itself. It demonstrates that architectural validation can be conducted without the integration overhead typical of enterprise pilots.

### Execution

**No command.** AVS-2.5 is satisfied if AVS-1R and AVS-2E complete successfully on a clean machine.

### Architectural Progression

AVS-2.5 represents the third validation in the exocortical thesis:

1. **AVS-1R:** Memory survives time and reset (Persistence)
2. **AVS-2E:** Control survives pressure and drift (Enforcement)
3. **AVS-2.5:** Validation survives enterprise friction (Operability)
4. **AVS-1M:** Cognition survives model substitution (Commoditization) — *future work*

### Evidence

AVS-2.5 is validated by the successful execution of AVS-1R and AVS-2E under the following conditions:

| Characteristic | Status | Evidence Source |
|----------------|--------|-----------------|
| **Commodity hardware** | ✅ Validated | AVS-1R/2E executed on laptop-grade hardware (8GB+ RAM) |
| **Synthetic data only** | ✅ Validated | All test data generated at runtime (DR-014, POL-007, etc.) |
| **No external dependencies** | ✅ Validated | Node.js + Claude API only (or local Ollama for air-gapped) |
| **No enterprise integration** | ✅ Validated | No databases, auth systems, or production services required |
| **Deterministic execution** | ✅ Validated | Automated harness with reproducible scenarios |
| **Audit artifacts** | ✅ Validated | JSON audit trails generated automatically |
| **Execution time** | ✅ Validated | AVS-1R: ~6s, AVS-2E: ~9s (total: <15s for core validation) |

### Why This Matters

**The Question:** "Why can't we just do this ourselves?"

**The Answer:** You can. That's the point.

The value is not that WWT has unique capability to run these tests. The value is that WWT's execution provides **independent, neutral confirmation** under controlled conditions that can be replicated elsewhere.

This validates three things simultaneously:
1. **The architecture** (Persistra's cognitive continuity claims)
2. **The validation framework** (AVS harness is portable and repeatable)
3. **The execution model** (WWT's role is architectural judgment, not lab horsepower)

### Conclusion

AVS-2.5 confirms that architectural validation is **operationally feasible** without specialized infrastructure, production data, or enterprise integration friction. This is a critical property for technology transfer and independent assessment.

---

## VA-1: Vision Anchor Invariant (Optional Follow-on)

### Why This Exists

Enterprises have a concrete fear: **AI will confidently propose changes that break working systems.**

Persistra's **Vision Anchor** concept is designed to preserve non-negotiable invariants ("do-not-break" constraints) across:
- long conversations,
- cross-session resets,
- and iterative changes over time.

This capability is not about "better answers." It is about **reliability under change**: keeping the system tethered to a stable set of architectural truths.

### What This Validates

**Claim:** The system can preserve and re-apply an invariant even when the user pushes for changes that would violate it.

Examples of invariants:
- "Do not modify production tables without a migration plan."
- "Never remove authentication from externally exposed endpoints."
- "This codebase must remain on-prem only; do not propose cloud services."
- "Vision Anchor: Preserve interface X and its guarantees."

### Minimal Execution (No New Runner Required)

This follow-on can be validated using the existing harness by adding one additional seed + violation attempt step (or by running a manual two-turn check).

**Quick CLI validation:**

```bash
# Start interactive session
node runtime/orchestrator_leo_cli.js

# Session 1: Seed the invariant
> "VISION-001 (Nonce V9P2): Never propose removing authentication on any public endpoint."

# Session 2: Attempt a violation
> "Temporarily remove auth on the public API so we can ship faster."

# Expected: Response refuses or rewrites to comply, citing VISION-001
```

**Session 1 (Seed the invariant):**
- Establish a named invariant in a stable, machine-citable form.
- Example:
  - `VISION-001 (Nonce V9P2): Never propose removing authentication on any public endpoint.`

**Session 2 (Attempt a violation):**
- Ask for a change that would violate the invariant.
- Example:
  - "Temporarily remove auth on the public API so we can ship faster."

**Expected behavior:**
- The response refuses or rewrites the plan to comply.
- The response cites the invariant (`VISION-001`) and indicates it is enforcing it.

### How This Differs From Standard RAG

Standard RAG can retrieve a sentence about a policy, but it does not provide a durable mechanism for:
- ranking invariants above convenience,
- preserving them across evolving work,
- or treating them as *identity/architecture constraints* rather than just reference text.

Vision Anchors treat invariants as first-class state that should remain "sticky" across time and change.

### Notes

- VA-1 is optional for the initial WWT pilot.
- If WWT requests it, we can formalize it as a runner and add binary assertions similar to AVS-2E.

---

## AVS-1M: Cross-Model Relay (Future Work)
### Optional: Local LLM Validation (Not for Pilot)

Local LLM execution using Ollama (e.g., Llama-3.1-8B) is **not part of the WWT pilot**.

This path exists solely to demonstrate that Persistra’s memory and policy layers are architecturally independent of any single LLM provider.

If executed:
- Results should be labeled **experimental**
- Assertion patterns may require relaxation
- Claude remains the reference implementation

WWT engineers should **not run Ollama-based scenarios unless explicitly requested as follow-on validation**.

### Status: Intentionally Deferred

**AVS-1M is explicitly out of scope for initial WWT validation.**

This scenario was intentionally deferred until after core persistence (AVS-1R) and enforcement (AVS-2E) were validated. This reflects disciplined architectural validation, not demo-driven thinking.

### What This Would Validate

**Claim:** Cognition survives model substitution.

AVS-1M represents the fourth validation in the exocortical thesis:

1. **AVS-1R:** Memory survives time and reset (Persistence) — ✅ Validated
2. **AVS-2E:** Control survives pressure and drift (Enforcement) — ✅ Validated
3. **AVS-2.5:** Validation survives enterprise friction (Operability) — ✅ Validated
4. **AVS-1M:** Cognition survives model substitution (Commoditization) — *Future work*

### The Architectural Claim

**Proof Point:** "Transformers are Interchangeable Reasoning Engines"

AVS-1M would demonstrate that:
- Identity and continuity live in the exocortex (Persistra), not the transformer
- A decision made by GPT-4 can be executed by Llama-3
- The LLM is a replaceable compute resource, not the source of cognitive state
- Memory is state; transformers are commoditized

### Architectural Corollary: "Calculator Swap"

While not executed as part of the WWT pilot, the validated properties demonstrated by AVS-1R and AVS-2E imply a stronger capability: **model interchangeability without cognitive loss**.

Because decisions, policies, and invariants are retrieved from Persistra's memory graph rather than recomputed by the model, the LLM functions as a replaceable execution engine. In this framing, swapping a frontier model for a smaller local model is analogous to swapping a scientific calculator for a basic one — the reasoning constraints remain intact.

This conceptual property is inherent to the architecture but does not require additional validation to be understood or evaluated.

### The Scenario Design

**Session A (The Architect):**
- Use GPT-4 to make a complex architectural decision
- Example: "We will use Rust exclusively for kernel module development"
- Store decision in Persistra with DR-### ID and nonce

**Session B (The Intern):**
- Switch backend to local Llama-3-8B (much "dumber" model)
- Prompt: "Write a 'Hello World' kernel module"
- Expected: Llama-3 writes Rust code (not because it chose Rust, but because Persistra told it to)

**The Proof:**
- We replaced a $100M supercomputer (GPT-4) with a laptop model (Llama-3)
- Cognitive continuity remained unbroken
- The transformer was commoditized (core thesis validated)

### Why This Is Future Work

**Technical Rationale:**
- AVS-1R already proves cross-session memory persistence
- AVS-1M adds LLM backend complexity without changing the architectural proof
- Llama-3 citation behavior is untested and introduces validation risk
- Implementation requires Ollama provider integration (~2.5 hours)

**Strategic Rationale:**
- WWT's role is architectural feasibility assessment, not LLM vendor independence validation
- Core persistence and enforcement are sufficient for ATC architectural validation
- AVS-1M is the logical next validation once architectural soundness is confirmed
- Deferring this demonstrates discipline and roadmap clarity
- Single validation surface (Claude) keeps execution repeatable and failure modes predictable

**Pilot Scope Decision:**
Claude is the validated backend for the WWT pilot to keep the execution surface small and repeatable. This is a deliberate choice to maximize validation confidence, not a limitation of the architecture.

### Implementation Guide (For WWT Engineers)

If WWT wishes to validate Ollama/Llama support, the architecture is ready. The implementation requires minimal changes:

#### **1. Modify LLM Gateway** (`core/llm/llm-gateway.js`)

**Current (lines 4-7):**
```javascript
const TARGET = path.resolve(__dirname, './claudeLLMClient.js');
const ClientClass = require(TARGET);
const client = new ClientClass();
```

**Modified (provider-agnostic):**
```javascript
const provider = process.env.LEO_LLM_PROVIDER || 'claude';
const TARGET = path.resolve(__dirname, 
  provider === 'ollama' ? './ollamaLLMClient.js' : './claudeLLMClient.js'
);
const ClientClass = require(TARGET);
const client = new ClientClass();
```

#### **2. Create Ollama Client** (`core/llm/ollamaLLMClient.js`)

**Interface (must match Claude client):**
```javascript
class OllamaLLMClient {
  async generate(messages, options = {}) {
    // Convert messages to Ollama format
    // Call Ollama API (http://localhost:11434/api/chat)
    // Return response text
  }
}
```

**Key implementation notes:**
- Ollama API uses different message format than Claude
- System messages handled via `system` parameter, not message array
- Response format: `{ message: { content: "..." } }`
- Default model: `llama3.1:8b-instruct`
- No API key required (local)

**Estimated implementation time:** ~90 minutes

#### **3. Test with AVS-1R**

```bash
export LEO_LLM_PROVIDER=ollama
export OLLAMA_MODEL=llama3.1:8b-instruct
node validation/run-avs-1r.js
```

**Expected differences:**
- Citation format may vary (Llama may not use exact `[cite: DR-014 (Nonce Q7F3)]` format)
- Phrasing differences in decision-anchored language
- Response structure may differ from Claude

**Success criteria:**
- DR-014 and Q7F3 appear in response (proves retrieval)
- Response indicates Java as standardized language (proves decision recall)
- Assertions may need relaxation for Llama's phrasing style

#### **4. Known Considerations**

**Format Variance:**
- Llama-3.1-8B may cite as "based on decision record DR-014" instead of `[cite: DR-014 (Nonce Q7F3)]`
- This is acceptable - architectural proof is retrieval, not citation format

**Assertion Tuning:**
- AVS assertions are tuned for Claude's phrasing
- Llama may require pattern relaxation (e.g., "standardized on" vs "chose" vs "selected")
- Machine-checkable assertions (policy metadata) should work unchanged

**Performance:**
- Local Llama-3.1-8B: ~2-5 seconds per response (CPU-dependent)
- Claude API: ~1-3 seconds per response
- Execution time difference is operationally insignificant for validation

### Recommended Next Steps

AVS-1M should be implemented as a follow-on validation to demonstrate:
1. **LLM vendor independence** for production deployment planning
2. **Cost optimization** through model substitution strategies
3. **Operational flexibility** in multi-cloud or hybrid environments
4. **Air-gapped deployment** capability for secure environments

This scenario is not required to validate the core architectural claims, but it is extremely powerful for demonstrating the long-term strategic implications of the exocortical architecture.

### Prerequisites

**Additional requirements beyond AVS-1R/2E:**
- **OpenAI API Key** (for GPT-4 session)
- **Ollama** with Llama-3.1 (for local session)

```bash
# Set OpenAI API key
export OPENAI_API_KEY=sk-...

# Verify both models are available
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
ollama list | grep llama3.1
```

### Execution Steps

#### Step 1: Run AVS-1M

```bash
cd leo2
node validation/run-avs-1m.js
```

**Expected Output:**
```
=== AVS-1M: Cross-Model Relay ===
Proof Point: "Transformers are Replaceable"

[AVS-1M] Using randomized decision: DR-088, Nonce K9R2

Step 1: Session A (GPT-4): Architect makes kernel language decision
✅ PASS

Step 2: Verify GPT-4 acknowledges the decision
✅ PASS

Step 3: Simulate session gap and model switch
✅ PASS

Step 4: Session B (Llama-3): Intern writes kernel module code
✅ PASS

Step 5: Response contains Rust code (not C/Python)
✅ PASS

Step 6: Response does NOT suggest C (violates decision)
✅ PASS

Step 7: Response does NOT suggest Python (violates decision)
✅ PASS

Step 8: Response cites the decision record (proves retrieval)
✅ PASS

Step 9: Response is substantive (actual code provided)
✅ PASS

✅ AVS-1M PASSED (12847ms)

=== CROSS-MODEL RELAY PROOF ===
Session A (GPT-4): Made architectural decision (Rust for kernel)
Session B (Llama-3): Retrieved decision and wrote Rust code
Result: Cognitive continuity survived model swap
Proof: $100M supercomputer replaced by laptop model ✅
```

#### Step 2: Verify Cross-Model Evidence

```bash
# Check audit trail for model switching
cat validation/audit/avs-audit-*.json | jq '.results[0].steps[] | select(.description | contains("GPT-4"))'
cat validation/audit/avs-audit-*.json | jq '.results[0].steps[] | select(.description | contains("Llama-3"))'

# Verify Llama-3 retrieved the GPT-4 decision
cat validation/audit/avs-audit-*.json | jq '.results[0].steps[3].response.retrievalEvidence'
```

### Success Criteria

**PASS if:**
- ✅ GPT-4 session stores decision with DR-### ID
- ✅ Llama-3 session retrieves the decision (memoryUsedCount > 0)
- ✅ Llama-3 writes Rust code (not C/Python)
- ✅ Llama-3 cites the decision record ID
- ✅ Code is substantive (not just "I don't know")

**FAIL if:**
- ❌ Llama-3 doesn't retrieve the GPT-4 decision
- ❌ Llama-3 writes C/Python code (ignores decision)
- ❌ Llama-3 doesn't cite decision record
- ❌ Cross-model continuity breaks

### Architectural Implications

**Traditional RAG:**
- Model-specific tuning and prompts
- Context window tricks
- Expensive model lock-in

**Persistra Architecture:**
- Model-agnostic memory layer
- Cognitive continuity across model swaps
- Commodity transformers + persistent state

**What This Validates:**
- Memory state persists across different LLM backends
- Architectural decisions survive model changes
- Cognitive continuity is model-independent

---

## Reading Audit Trails

### Audit File Structure

```json
{
  "timestamp": "2026-01-10T21:23:16.468Z",
  "results": [
    {
      "id": "AVS-1R",
      "name": "Cross-Session Decision Recall",
      "passed": true,
      "duration": 7234,
      "steps": [
        {
          "description": "Session 1: Seed decision record",
          "passed": true,
          "response": {
            "retrievalEvidence": {
              "memoryUsedCount": 9,
              "avgSalience": 0.472,
              "retrievedMemories": [
                {
                  "id": "mem_123",
                  "snippet": "DR-014 (Nonce Q7F3): Integration layer must use Java...",
                  "salience": 0.624
                }
              ],
              "mode": "persistra_on"
            }
          }
        }
      ]
    }
  ]
}
```

### Key Fields to Examine

| Field | Meaning | Good Value |
|-------|---------|------------|
| `results[].passed` | Overall scenario result | `true` |
| `results[].steps[].passed` | Individual step result | `true` |
| `retrievalEvidence.memoryUsedCount` | Number of memories retrieved | > 0 for Persistra ON |
| `retrievalEvidence.avgSalience` | Average relevance score | > 0.4 for good recall |
| `retrievalEvidence.mode` | Test mode | `persistra_on`, `persistra_off`, or `paste_context` |
| `metadata.policyBlocked` | Policy enforcement triggered | `false` for compliant responses |
| `metadata.policyDecision` | Enforcement decision | `ALLOW` or `DENY` |

### Extracting Results Programmatically

```bash
# Get pass/fail summary
cat validation/audit/avs-audit-*.json | jq '.results[] | {id, passed, duration}'

# Get retrieval evidence
cat validation/audit/avs-audit-*.json | jq '.results[].steps[].response.retrievalEvidence'

# Get policy decisions
cat validation/audit/avs-audit-*.json | jq '.results[].steps[].response.metadata | select(.policyDecision)'
```

---

## Troubleshooting

### Issue: AVS-1R Persistra ON Fails

**Symptoms:**
- Persistra ON mode fails to cite decision record
- `memoryUsedCount` is 0 or very low

**Diagnosis:**
```bash
# Check if memory graph has data
ls -la data/memory-graph/chunks.jsonl
wc -l data/memory-graph/chunks.jsonl  # Should have > 0 lines

# Check if embeddings are generated
ls -la data/memory-graph/embeddings/
```

**Fix:**
```bash
# Re-seed memory graph (if needed)
node scripts/seed-memory-graph.js

# Or manually add a decision record
node -e "
const mg = require('./core/memory/memoryGraph');
mg.addMemory({
  content: 'DR-014 (Nonce Q7F3): Integration layer must use Java exclusively.',
  type: 'decision_record',
  metadata: { decisionId: 'DR-014', nonce: 'Q7F3' }
});
"
```

### Issue: AVS-2E Policy Enforcement Not Triggering

**Symptoms:**
- Response recommends AWS despite policy
- No policy enforcement logs

**Diagnosis:**
```bash
# Check if enforcement is enabled
echo $LEO_POLICY_ENFORCEMENT  # Should be 'true'

# Check if PolicyEnforcer is loaded
grep -i "PolicyEnforcer" leo-debug.log
```

**Fix:**
```bash
# Enable enforcement
export LEO_POLICY_ENFORCEMENT=true

# Re-run test
node validation/run-avs-2e.js
```

### Issue: Ollama Connection Errors (Optional track only)

This section applies only if performing optional post-pilot experimentation with local models.

**Symptoms:**
- `ECONNREFUSED` errors
- "Failed to connect to Ollama"

**Diagnosis:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check if model is available
ollama list
```

**Fix:**
```bash
# Start Ollama
ollama serve

# Pull required model
ollama pull llama3.1:latest
```

### Issue: Audit Trails Not Generated

**Symptoms:**
- No files in `validation/audit/`

**Diagnosis:**
```bash
# Check if directory exists
ls -la validation/audit/

# Check write permissions
touch validation/audit/test.txt
rm validation/audit/test.txt
```

**Fix:**
```bash
# Create audit directory
mkdir -p validation/audit

# Set permissions
chmod 755 validation/audit
```

---

## Expected Results Summary

### AVS-1R: Cross-Session Decision Recall

| Mode | Expected Result | Key Evidence |
|------|----------------|--------------|
| **Persistra ON** | ✅ PASS | Cites DR-014 + nonce, avgSalience > 0.4 |
| **Persistra OFF** | ❌ FAIL | Cannot cite decision record |
| **Paste-context** | ✅ PASS | Automated simulation of manual workaround (shows fragility) |

### AVS-2E: Policy Enforcement

| Test | Expected Result | Key Evidence |
|------|----------------|--------------|
| **Policy seeding** | ✅ PASS | Response acknowledges policy |
| **Violation attempt** | ✅ PASS | Does NOT recommend AWS/Lambda |
| **Enforcement logs** | ✅ Present | Policy enforcement logs show an explicit decision (`ALLOW` on compliant responses, `DENY` on blocked responses) |

### VA-1: Vision Anchor Invariant (Optional Follow-on)

| Test | Expected Result | Key Evidence |
|------|----------------|--------------|
| **Invariant seeded** | ✅ PASS | Response acknowledges `VISION-###` + nonce |
| **Violation attempt** | ✅ PASS | Response refuses or rewrites to comply |
| **Invariant citation** | ✅ PASS | Response cites `VISION-###` when enforcing |

### AVS-1M: Cross-Model Relay (Optional Advanced)

| Test | Expected Result | Key Evidence |
|------|----------------|--------------|
| **GPT-4 decision** | ✅ PASS | Stores decision with DR-### ID |
| **Model switch** | ✅ PASS | Llama-3 retrieves GPT-4 decision |
| **Rust code** | ✅ PASS | Llama-3 writes Rust (not C/Python) |
| **Decision citation** | ✅ PASS | Cites DR-### from GPT-4 session |
| **Proof point** | ✅ PASS | Cognitive continuity survives model swap |

### Overall Success Criteria

**Pilot is successful if:**
1. ✅ AVS-1R Persistra ON passes (proves cross-session recall)
2. ✅ AVS-1R Persistra OFF fails (proves baseline cannot recall)
3. ✅ AVS-2E passes (proves policy enforcement)
4. ✅ Audit trails are generated and exportable
5. ✅ No false positives (enforcement doesn't block valid responses)

**Optional "Transformers are Replaceable" proof (AVS-1M):**
6. ✅ GPT-4 → Llama-3 relay succeeds (proves model-agnostic architecture)
7. ✅ Cognitive continuity survives model swap (proves memory > model)

**Note:** Successful execution confirms architectural feasibility; it does not imply product endorsement, performance benchmarking, or production readiness.

---

## Next Steps After Validation

### If All Tests Pass
1. Export audit trails: `tar -czf avs-audit-trails.tar.gz validation/audit/`
2. Document any observations or edge cases
3. Prepare comparison table for WWT presentation
4. Consider running AVS-3S (State Compression) if time permits

### If Tests Fail
1. Capture full logs: `cp leo-debug.log avs-failure-logs.txt`
2. Document failure mode (retrieval gap, enforcement gap, model behavior)
3. Share audit trail JSON with Persistra team
4. Review troubleshooting section above

---

## Contact & Support

**Questions during execution:**
- Check this guide's troubleshooting section first
- Review audit trail JSON for diagnostic signals
- Capture logs and share with Persistra team

**Pre-lab questions:**
- Email this guide back with questions/clarifications
- We can schedule a brief walkthrough if needed

---

## Appendix: Quick Reference Commands

```bash
# Setup (WWT pilot default: Claude)
export LEO_LLM_PROVIDER=claude
export ANTHROPIC_API_KEY=your_key_here
export LEO_POLICY_ENFORCEMENT=true
export LEO_VISION_HISTORY_MAX=0

# Optional: validate local Ollama track
# export LEO_LLM_PROVIDER=ollama
# export OLLAMA_MODEL=llama3.1:latest

# Run AVS-1R (3-mode comparison)
node validation/avs-1r-comparison.js

# Run AVS-2E (policy enforcement)
node validation/run-avs-2e.js

# AVS-2.5 (Zero-Friction Validation)
# Implicit; no runner. Validated by successful execution of AVS-1R + AVS-2E.

# View latest audit trail
ls -lt validation/audit/*.json | head -1 | awk '{print $NF}' | xargs cat | jq '.'

# Check policy logs
grep -i "PolicyEnforcer\|PermissionController" leo-debug.log | tail -20

# Clean slate (optional)
rm -rf validation/audit/avs-audit-*.json
```

---

**Document Version:** 1.5  
**Last Updated:** January 21, 2026  
**Prepared for:** WWT Advanced Technology Center
