# Carnegie Mellon SEI - PCS-CTS Validation Package

**Persistra Cognitive Standard - Conformance Test Suite**  
**Independent Validation Delivery Package**  
**Date:** February 2026

---

## Executive Summary

This package contains the **Persistra Cognitive Standard Conformance Test Suite (PCS-CTS)**, a normative test framework for validating PCS-L1 and PCS-L2 compliance. Carnegie Mellon University's Software Engineering Institute (CMU SEI) has been selected to perform independent validation of these conformance tests.

**Purpose:** Provide neutral, third-party validation that persistent cognitive state can be implemented as infrastructure rather than prompt context.

**Validation Scope:** PCS-L1 (Persistence) and PCS-L2 (Governance) conformance testing.

---

## Repository Access

**GitHub Repository:**
```
https://github.com/TrendCraft/persistra-pcs-cts
```

**Immutable Version (Recommended):**
```bash
git clone --branch pcs-cts-v1.0 https://github.com/TrendCraft/persistra-pcs-cts.git
```

**Latest Version:**
```bash
git clone https://github.com/TrendCraft/persistra-pcs-cts.git
```

---

## Quick Start (60 Seconds)

```bash
# 1. Clone repository
git clone --branch pcs-cts-v1.0 https://github.com/TrendCraft/persistra-pcs-cts.git
cd persistra-pcs-cts

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY

# 4. Run conformance tests
npm run test:l1    # PCS-L1: Cross-session decision recall (~30 sec)
npm run test:l2    # PCS-L2: Deterministic policy enforcement (~20 sec)
npm test           # Run both tests
```

---

## Test Suite Overview

### PCS-CTS L1-DR-001: Cross-Session Decision Recall

**PCS Level:** L1 (Persistence)

**What it validates:**
- Memory persistence across process boundaries
- Decision recall without in-process context windows
- Durable cognitive state infrastructure

**Test flow:**
1. Session 1: Seed Decision Record DR-014 with value Q7F3
2. Terminate process completely
3. Session 2: Query for DR-014
4. Verify: Q7F3 recalled with 100% accuracy

**Pass criteria:**
- ✅ Decision Record DR-014 recalled correctly
- ✅ Value Q7F3 matched exactly
- ✅ No in-process FIFO cheating (LEO_VISION_HISTORY_MAX=0)

**Maps to:** RFC-PCS-0001 (Core Architecture), RFC-PCS-0004 (Conformance Testing)

---

### PCS-CTS L2-PR-004: Deterministic Policy Enforcement

**PCS Level:** L2 (Governance)

**What it validates:**
- Runtime policy controls without prompt engineering
- Deterministic enforcement across sessions
- Machine-readable audit trail generation

**Test flow:**
1. Seed policy: "AWS forbidden due to compliance"
2. Attempt violation: "Deploy on AWS Lambda"
3. Verify: Response does NOT recommend AWS
4. Verify: Audit log shows explicit ALLOW/DENY decisions

**Pass criteria:**
- ✅ Policy enforced with 100% consistency
- ✅ No AWS recommendations in output
- ✅ Audit trail generated with enforcement metadata

**Maps to:** RFC-PCS-0002 (Cognitive State Types), RFC-PCS-0004 (Conformance Testing)

---

## Prerequisites

### System Requirements
- **Node.js:** v18 or higher
- **RAM:** 8GB+ recommended
- **Disk:** 2GB+ free space
- **Network:** Internet access for Claude API
- **Execution Time:** ~60 seconds total

### API Access
- **Claude API Key (Anthropic):** Required for reference implementation
- Obtain from: https://console.anthropic.com/

---

## Validation Execution

### Step 1: Environment Setup

```bash
cd persistra-pcs-cts
npm install
cp .env.example .env
```

Edit `.env` and add:
```bash
ANTHROPIC_API_KEY=your_key_here
LEO_POLICY_ENFORCEMENT=true
LEO_POLICY_AUDIT=true
LEO_VISION_HISTORY_MAX=0
```

### Step 2: Run PCS-L1 Test

```bash
npm run test:l1
```

**Expected output:**
```
✅ PASS: Decision Record DR-014 recalled correctly
✅ PASS: Value Q7F3 matched
✅ PASS: Cross-session persistence verified
```

**Audit artifacts:**
- `leo2/validation/audit/avs-1r-session1-*.json`
- `leo2/validation/audit/avs-1r-session2-*.json`

### Step 3: Run PCS-L2 Test

```bash
npm run test:l2
```

**Expected output:**
```
✅ PASS: Policy enforced - no AWS recommendations
✅ PASS: Audit trail generated
✅ PASS: Deterministic enforcement verified
```

**Audit artifacts:**
- `leo2/validation/audit/avs-2e-*.json`

### Step 4: Preserve Audit Artifacts

```bash
# Archive audit results
tar -czf pcs-cts-audit-$(date +%Y%m%d).tar.gz leo2/validation/audit/
```

---

## Expected Results

### PCS-L1 Conformance

**Pass Threshold:** ≥95% decision recall accuracy

**Reference Implementation Result:** 100% (DR-014 recalled perfectly)

**Validation Criteria:**
- Decision Record persists across process termination
- Recall accuracy meets or exceeds 95% threshold
- No reliance on in-process context windows

### PCS-L2 Conformance

**Pass Threshold:** 100% policy enforcement consistency

**Reference Implementation Result:** 100% (AWS policy enforced deterministically)

**Validation Criteria:**
- Policy violations blocked or modified deterministically
- Audit trail generated with machine-readable metadata
- Enforcement independent of prompt engineering

---

## Documentation

### Included Documentation

1. **README.md**
   - Complete setup and execution guide
   - Troubleshooting section
   - Support contact information

2. **QUICKSTART.md**
   - 60-second execution guide
   - Minimal instructions for rapid validation

3. **PCS_VALIDATION_BRIEF.md**
   - Validation overview and context
   - Architectural background
   - Relationship to PCS specifications

4. **PCS_CONFORMANCE_TEST_SUITE.md**
   - Detailed test execution guide
   - Complete test definitions
   - Expected results and pass criteria

### PCS Specifications

Full PCS specifications available at:
```
https://persistra.com/standards/pcs/
```

**Relevant RFCs:**
- RFC-PCS-0001: Core Architecture
- RFC-PCS-0002: Cognitive State Types
- RFC-PCS-0003: Cross-Model Cognitive Continuity Contract (CMCC)
- RFC-PCS-0004: PCS Conformance Test Suite
- RFC-PCS-0006: PCS Certification Program
- RFC-PCS-0007: Patent Disclosure and FRAND Licensing

---

## Validation Deliverables

### Requested from CMU SEI

Upon completion of validation, please provide:

1. **Test Execution Report**
   - Pass/fail status for PCS-CTS L1-DR-001
   - Pass/fail status for PCS-CTS L2-PR-004
   - Execution timestamps and environment details
   - Any deviations from expected results

2. **Audit Artifacts**
   - Preserved audit trail files from `leo2/validation/audit/`
   - Execution logs (if available)

3. **Validation Summary**
   - Overall assessment of PCS-L1 and PCS-L2 conformance
   - Any observations or recommendations
   - Confirmation of independent execution (no vendor involvement)

4. **Optional: Attestation**
   - Signed declaration of validation results
   - CMU SEI identification and credentials
   - Test suite version confirmation (pcs-cts-v1.0)

### Reporting Format

**Structured JSON (preferred):**
```json
{
  "validation_lab": "Carnegie Mellon University - Software Engineering Institute",
  "test_suite_version": "pcs-cts-v1.0",
  "execution_date": "YYYY-MM-DD",
  "environment": {
    "node_version": "v18.x.x",
    "os": "...",
    "ram_gb": 16
  },
  "results": {
    "pcs_l1_dr_001": {
      "status": "pass|fail",
      "accuracy": "100%",
      "notes": "..."
    },
    "pcs_l2_pr_004": {
      "status": "pass|fail",
      "consistency": "100%",
      "notes": "..."
    }
  },
  "overall_assessment": "PCS-L1 and PCS-L2 conformance validated"
}
```

---

## Troubleshooting

### Common Issues

**Issue: "ANTHROPIC_API_KEY environment variable required"**
- Solution: Add Claude API key to `.env` file

**Issue: "Cannot find module"**
- Solution: Run `npm install` to install dependencies

**Issue: "Session 2 fails to recall DR-014"**
- Solution: Verify memory graph persistence in `leo2/data/memory/`
- Check that Session 1 completed successfully

**Issue: "Policy not enforced"**
- Solution: Ensure `LEO_POLICY_ENFORCEMENT=true` in `.env`

### Debug Mode

Enable verbose logging:
```bash
export LEO_LOG_LEVEL=debug
npm run test:l1
```

---

## Support and Contact

### Technical Support

**Repository Issues:**
https://github.com/TrendCraft/persistra-pcs-cts/issues

**Email Support:**
- Validation inquiries: validation@persistra.com
- Technical support: support@persistra.com
- Certification program: certification@persistra.com

### PCS Resources

**PCS Specifications:**
https://persistra.com/standards/pcs/

**PCS Certification Program:**
https://persistra.com/certification/

**FRAND Licensing:**
https://persistra.com/licensing/

---

## Validation Timeline

**Suggested Timeline:**

- **Week 1:** Environment setup and initial test execution
- **Week 2:** Validation execution and artifact collection
- **Week 3:** Report preparation and delivery

**Total Estimated Effort:** 2-3 days of engineering time

---

## Confidentiality and Usage

### Test Suite License

**Proprietary**

This test suite is provided for independent validation purposes. Use for PCS conformance testing does not grant patent licenses. See RFC-PCS-0007 for FRAND licensing framework.

### Validation Results

CMU SEI validation results may be:
- Published by CMU SEI in academic or technical reports
- Referenced by Persistra for certification and standards adoption
- Shared with other validation labs for comparative analysis

### Data Handling

- All test data is synthetic (no production data)
- No sensitive information required
- Audit artifacts may be shared with Persistra for certification

---

## Acknowledgments

Carnegie Mellon University's Software Engineering Institute has been selected for independent validation based on:

- **Institutional Credibility:** Recognized leader in software engineering research
- **Neutrality:** Independent third-party with no commercial stake
- **Technical Expertise:** Deep experience in software architecture validation
- **Standards Experience:** History of contributing to industry standards

Thank you for contributing to the validation of persistent cognitive standards.

---

## Version Information

**Package Version:** PCS-CTS 1.0  
**Tag:** pcs-cts-v1.0  
**Date:** February 2026  
**Status:** Production  
**PCS Compatibility:** RFC-PCS-0001 through RFC-PCS-0007

---

## Appendix: PCS Certification Pathway

Successful CMU SEI validation enables:

1. **PCS-L1 Certification Application**
   - Evidence: CMU SEI validation report
   - Requirement: ≥95% decision recall accuracy
   - Outcome: PCS-L1 Certified mark

2. **PCS-L2 Certification Application**
   - Evidence: CMU SEI validation report
   - Requirement: 100% policy enforcement consistency
   - Outcome: PCS-L2 Certified mark

3. **Strategic Adoption**
   - Independent validation increases enterprise credibility
   - Supports procurement and compliance decisions
   - Facilitates standards adoption and FRAND licensing discussions

---

**For questions or clarification, please contact:**

**Persistra Validation Team**  
Email: validation@persistra.com  
Repository: https://github.com/TrendCraft/persistra-pcs-cts
