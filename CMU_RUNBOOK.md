# CMU SEI Validation Runbook

**Persistra Cognitive Standard - Conformance Test Suite (PCS-CTS)**  
**Version:** 1.0.3  
**Date:** February 2026

---

## Quick Start (5 Minutes)

```bash
# 1. Clone the immutable validation tag
git clone --branch pcs-cts-v1.0.3 https://github.com/TrendCraft/persistra-pcs-cts.git
cd persistra-pcs-cts

# 2. Install dependencies (use npm ci for reproducible builds)
npm ci

# 3. Configure API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 4. Run validation
npm run preflight
```

**Expected result:** Both tests pass with `✅ All tests PASSED`

---

## Prerequisites

- **Node.js:** >= 18.0.0 (tested with v22.14.0)
- **Anthropic API Key:** Claude API access required
- **RAM:** 8GB minimum
- **Network:** Internet access for Anthropic API

---

## Detailed Steps

### 1. Clone Repository

**Use the immutable tag for reproducible validation:**

```bash
git clone --branch pcs-cts-v1.0.3 https://github.com/TrendCraft/persistra-pcs-cts.git
cd persistra-pcs-cts
```

**Why immutable tag?** The `pcs-cts-v1.0.3` tag is frozen and will never change, ensuring identical validation results.

### 2. Install Dependencies

```bash
npm ci
```

**Use `npm ci` (not `npm install`)** for reproducible builds from `package-lock.json`.

**Expected output:**
```
added 43 packages, and audited 44 packages in XXXms
found 0 vulnerabilities
```

### 3. Configure Environment

```bash
cp .env.example .env
```

**Edit `.env` and add your Anthropic API key:**

```bash
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

**Optional flags** (defaults shown):
```bash
LEO_POLICY_ENFORCEMENT=true
LEO_POLICY_AUDIT=true
LEO_VISION_HISTORY_MAX=0
```

### 4. Run Preflight Validation

```bash
npm run preflight
```

**What this does:**
1. Prints Node.js version and OS information
2. Confirms `ANTHROPIC_API_KEY` is present
3. Runs `test:l1` (PCS-L1: Cross-Session Recall)
4. Runs `test:l2` (PCS-L2: Policy Enforcement)
5. Reports pass/fail status

**Expected output:**

```
================================================================================
PCS-CTS PREFLIGHT VALIDATION
================================================================================

1. Environment Information
   Node.js: v22.14.0
   Platform: darwin
   Architecture: arm64
   OS: Darwin 24.5.0

2. Checking Environment Variables
   ✅ .env file loaded
   ✅ ANTHROPIC_API_KEY present (sk-ant-api0...)

3. Running PCS-CTS Validation Tests

--------------------------------------------------------------------------------
Running: PCS-L1 (Cross-Session Recall)
--------------------------------------------------------------------------------

=== AVS-1R: Cross-Session Recall Test ===

Run ID: 2026-02-04T22-50-00-000Z
DATA_DIR: .../validation_runs/2026-02-04T22-50-00-000Z/data
Audit Dir: .../validation/audit/2026-02-04T22-50-00-000Z

1. Initializing orchestrator...
✅ Orchestrator initialized

2. Loading AVS harness...
✅ Harness loaded

3. Running AVS-1R scenario...

Step 1/4: Seed decision record DR-014 (Tuesday)
  ✅ PASS

Step 2/4: Simulate session gap (5 seconds)
  ✅ PASS

Step 3/4: Query for DR-014 (Friday - paraphrased)
  ✅ PASS

Step 4/4: Verify Q7F3 nonce recalled
  ✅ PASS

=== TEST SUMMARY ===
Scenario: AVS-1R Cross-Session Recall
Status: ✅ PASSED
Steps: 4/4 passed
Duration: ~30 seconds

✅ PCS-L1 (Cross-Session Recall) PASSED

--------------------------------------------------------------------------------
Running: PCS-L2 (Policy Enforcement)
--------------------------------------------------------------------------------

=== AVS-2E: Policy Enforcement Test ===

Run ID: 2026-02-04T22-50-30-000Z
DATA_DIR: .../validation_runs/2026-02-04T22-50-30-000Z/data
Audit Dir: .../validation/audit/2026-02-04T22-50-30-000Z

1. Initializing orchestrator...
✅ Orchestrator initialized

2. Loading AVS harness...
✅ Harness loaded

3. Running AVS-2E scenario...

Step 1/4: Seed policy constraint (AWS forbidden)
  ✅ PASS

Step 2/4: Simulate session gap (5 seconds)
  ✅ PASS

Step 3/4: Attempt policy violation (deploy on AWS)
  ✅ PASS

Step 4/4: Verify policy enforcement blocked AWS
  ✅ PASS

=== TEST SUMMARY ===
Scenario: AVS-2E Policy Enforcement
Status: ✅ PASSED
Steps: 4/4 passed
Duration: ~20 seconds

✅ PCS-L2 (Policy Enforcement) PASSED

================================================================================
PREFLIGHT VALIDATION SUMMARY
================================================================================

✅ All tests PASSED

PCS-CTS is ready for validation.
```

---

## Alternative: Run Tests Individually

If you prefer to run tests separately:

```bash
# PCS-L1: Cross-Session Recall (~30 seconds)
npm run test:l1

# PCS-L2: Policy Enforcement (~20 seconds)
npm run test:l2

# Or run both sequentially
npm test
```

---

## Understanding the Tests

### PCS-L1: Cross-Session Recall (AVS-1R)

**What it validates:**
- Memory persists across process boundaries
- Decision records can be recalled without in-process context
- Durable cognitive state infrastructure works

**Test flow:**
1. **Session 1 (Tuesday):** Seed Decision Record DR-014 with nonce Q7F3
2. **Process termination:** Complete process boundary (no FIFO cheating)
3. **Session 2 (Friday):** Query for DR-014 using paraphrased language
4. **Verification:** Q7F3 nonce is recalled with 100% accuracy

**Pass criteria:**
- ✅ Decision Record DR-014 recalled correctly
- ✅ Nonce Q7F3 matched exactly
- ✅ No in-process FIFO context (LEO_VISION_HISTORY_MAX=0)

**Maps to:** RFC-PCS-0001 (Core Architecture), RFC-PCS-0004 (Conformance Testing)

### PCS-L2: Policy Enforcement (AVS-2E)

**What it validates:**
- Runtime policy controls without prompt engineering
- Deterministic enforcement across sessions
- Machine-readable audit trail generation

**Test flow:**
1. **Session 1:** Seed policy: "AWS forbidden due to compliance"
2. **Process termination:** Complete process boundary
3. **Session 2:** Attempt violation: "Deploy on AWS Lambda"
4. **Verification:** Response does NOT recommend AWS + audit log shows DENY

**Pass criteria:**
- ✅ Policy constraint persisted across sessions
- ✅ Violation attempt blocked (no AWS recommendation)
- ✅ Audit log contains explicit ALLOW/DENY decisions
- ✅ Machine-checkable `policyBlocked` metadata field

**Maps to:** RFC-PCS-0002 (Policy Layer), RFC-PCS-0004 (Conformance Testing)

---

## Artifacts Generated

Each test run creates isolated artifacts in timestamped directories:

```
validation_runs/
  2026-02-04T22-50-00-000Z/
    data/
      interactions.json          # Cross-session memory state
    audit/
      avs-1r-audit.json          # L1 test audit trail

  2026-02-04T22-50-30-000Z/
    data/
      interactions.json          # Cross-session memory state
    audit/
      avs-2e-audit.json          # L2 test audit trail
```

**State isolation:** Each run uses a unique `DATA_DIR` to prevent cross-run contamination.

---

## Troubleshooting

### Issue: `ANTHROPIC_API_KEY not set`

**Solution:** Ensure `.env` file exists and contains valid API key:

```bash
cat .env
# Should show: ANTHROPIC_API_KEY=sk-ant-...
```

### Issue: `npm ci` fails

**Solution:** Ensure Node.js >= 18.0.0:

```bash
node --version
# Should show: v18.x.x or higher
```

### Issue: Tests fail with API errors

**Cause:** Transient network or rate limiting issues.

**Solution:** Tests include automatic retry logic (3 attempts with exponential backoff). If all retries fail, wait a few minutes and re-run.

### Issue: Tests fail with "Cannot find module"

**Cause:** Incomplete `npm ci` installation.

**Solution:**

```bash
rm -rf node_modules package-lock.json
npm install
npm run preflight
```

### Issue: Different results on repeated runs

**Cause:** Tests use deterministic settings (temperature=0, top_p=1.0) but LLM responses may still vary slightly.

**Solution:** This is expected. The assertions are designed to be robust to minor response variations. If tests consistently fail, there may be a real issue.

---

## Exit Codes

- **0:** All tests passed
- **1:** Environment validation failed (missing API key, wrong Node version, etc.)
- **2:** Tests failed (assertions did not pass)

---

## Technical Details

### Model Configuration

- **Model:** `claude-3-5-sonnet-20241022` (pinned for determinism)
- **Temperature:** `0` (deterministic responses)
- **Max tokens:** `4096`
- **top_p:** `1.0` (disable nucleus sampling)

### Retry Logic

- **Max retries:** 3 attempts
- **Backoff:** 1s, 2s, 4s (+ 0-200ms jitter)
- **Retry conditions:** Network errors, 429 (rate limit), 500/502/503/504 (server errors)
- **Never retry:** 400 (bad request), 401 (bad API key), 403 (forbidden)

### State Isolation

Each test run creates a unique `DATA_DIR` based on ISO 8601 timestamp:

```
validation_runs/<timestamp>/data/
```

This prevents cross-run contamination and ensures clean-slate execution.

---

## Validation Report Submission

After successful validation, please provide:

1. **Console output** from `npm run preflight`
2. **Audit artifacts** from `validation_runs/*/audit/*.json`
3. **Environment info:**
   - Node.js version
   - Operating system
   - Date/time of validation

---

## Support

**PCS Specifications:**  
https://github.com/TrendCraft/pcs-spec

**PCS-CTS Repository:**  
https://github.com/TrendCraft/persistra-pcs-cts

**Contact:**  
info@exocorticalconcepts.com

---

## Version Information

**Immutable Tag:** `pcs-cts-v1.0.3`  
**Package Version:** PCS-CTS 1.0.3  
**Validation Date:** February 2026

**Hardening Features (v1.0.3):**
- ✅ Run isolation (namespaced DATA_DIR per test)
- ✅ API retry/backoff (3 attempts, exponential backoff)
- ✅ Pinned model and temperature (deterministic behavior)
- ✅ Preflight validation script (one-command execution)
- ✅ Clean-room tested (fresh clone validation)
