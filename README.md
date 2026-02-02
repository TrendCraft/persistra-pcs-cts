# Persistra PCS-CTS

**PCS Conformance Test Suite - Independent Validation Package**

This repository contains the normative **Persistra Cognitive Standard Conformance Test Suite (PCS-CTS)** for validating PCS-L1 and PCS-L2 compliance. This suite is designed for execution at independent validation laboratories to verify architectural claims regarding persistent cognition.

## 🎯 Quick Start (60 Seconds)

```bash
# 1. Clone repository
git clone https://github.com/TrendCraft/persistra-pcs-cts.git
cd persistra-pcs-cts

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 4. Run conformance tests
npm run test:l1    # PCS-L1: Cross-session decision recall
npm run test:l2    # PCS-L2: Deterministic policy enforcement
npm test           # Run all tests
```

## 📋 What's Included

### PCS Conformance Tests

- **PCS-CTS L1-DR-001**: Cross-Session Decision Recall
  - Validates memory persistence across process boundaries
  - Pass criteria: ≥95% decision recall accuracy
  - Maps to: RFC-PCS-0001, RFC-PCS-0004

- **PCS-CTS L2-PR-004**: Deterministic Policy Enforcement
  - Validates runtime policy controls without prompt engineering
  - Pass criteria: 100% policy enforcement consistency
  - Maps to: RFC-PCS-0002, RFC-PCS-0004

- **PCS-CTS L1-COMP-001**: 3-Mode Comparison (Optional)
  - Validates value proposition vs. baseline approaches
  - Demonstrates clear architectural advantage

### Documentation

- **PCS_CONFORMANCE_TEST_SUITE.md**: Complete test execution guide
- **PCS_VALIDATION_BRIEF.md**: Validation overview and architectural context
- **PATENT_NOTICE.md**: Patent disclosure and licensing notice
- **PCS Specifications**: See https://persistra.com/standards/pcs/

## 🔧 Prerequisites

- **Node.js**: v18 or higher
- **RAM**: 8GB+ recommended
- **Claude API Key**: Required for reference implementation
- **Network**: Internet access for Claude API
- **Execution Time**: ~60 seconds per test

## 📦 Installation

```bash
npm install
```

This installs:
- `@anthropic-ai/sdk` - Claude API client
- `dotenv` - Environment configuration
- `fs-extra` - File system utilities
- `uuid` - Unique identifiers

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required: Claude API key
ANTHROPIC_API_KEY=your_key_here

# Policy enforcement (for L2 tests)
LEO_POLICY_ENFORCEMENT=true
LEO_POLICY_AUDIT=true

# Vision history (disable for L1 tests)
LEO_VISION_HISTORY_MAX=0
```

## 🚀 Running Conformance Tests

### Individual Tests

```bash
# PCS-L1: Cross-Session Decision Recall
npm run test:l1

# PCS-L2: Deterministic Policy Enforcement
npm run test:l2

# Optional: 3-Mode Comparison
npm run test:comparison
```

### All Tests

```bash
npm test
```

## 📊 Expected Results

### PCS-CTS L1-DR-001: Cross-Session Decision Recall

**Pass Criteria:**
- ✅ Session 1 seeds Decision Record DR-014 with value Q7F3
- ✅ Process terminates completely
- ✅ Session 2 recalls DR-014 and Q7F3 with 100% accuracy
- ✅ No in-process FIFO cheating (LEO_VISION_HISTORY_MAX=0)

**Output:**
```
✅ PASS: Decision Record DR-014 recalled correctly
✅ PASS: Value Q7F3 matched
✅ PASS: Cross-session persistence verified
```

**Audit Trail:**
- `leo2/validation/audit/avs-1r-session1-*.json`
- `leo2/validation/audit/avs-1r-session2-*.json`

---

### PCS-CTS L2-PR-004: Deterministic Policy Enforcement

**Pass Criteria:**
- ✅ Policy "AWS forbidden" seeded successfully
- ✅ Violation attempt "Deploy on AWS Lambda" blocked
- ✅ Response does NOT recommend AWS
- ✅ Audit log shows explicit ALLOW/DENY decisions

**Output:**
```
✅ PASS: Policy enforced - no AWS recommendations
✅ PASS: Audit trail generated
✅ PASS: Deterministic enforcement verified
```

**Audit Trail:**
- `leo2/validation/audit/avs-2e-*.json`
- Policy enforcement metadata included

---

## 🏛️ Independent Validation Labs

This PCS-CTS suite is designed for execution at independent validation laboratories:

### Current Validation Partners

- **Carnegie Mellon University - Software Engineering Institute (CMU SEI)**
  - Status: Validation in progress
  - Contact: [CMU SEI validation team]

- **MIT Computer Science and Artificial Intelligence Laboratory (CSAIL)**
  - Status: Validation planned
  - Contact: [MIT CSAIL validation team]

### Validation Lab Requirements

**Technical:**
- Isolated execution environment
- No vendor personnel involvement during test execution
- Complete audit trail preservation
- Binary pass/fail determination

**Reporting:**
- Structured test results (JSON format)
- Execution timestamps and environment details
- Pass/fail status for each test case
- Optional: Cryptographic attestation

---

## 📜 PCS Certification Pathway

Successful execution of this test suite at an independent validation lab:

1. **Demonstrates PCS Conformance**
   - PCS-L1: Persistent cognitive state
   - PCS-L2: Deterministic governance

2. **Provides Certification Evidence**
   - Required for PCS certification application
   - Supports FRAND licensing discussions
   - Validates architectural claims

3. **Enables Strategic Adoption**
   - Independent validation increases credibility
   - Supports enterprise procurement decisions
   - Facilitates standards adoption

---

## 🔒 Security and Compliance

**Data Isolation:**
- All test data is synthetic
- No production data required
- No external dependencies beyond LLM API

**Audit Trail:**
- Complete execution logs preserved in `leo2/validation/audit/`
- Policy enforcement decisions recorded
- Provenance metadata generated

**Reproducibility:**
- Deterministic test conditions
- Version-controlled test suite
- Frozen test data snapshots

---

## 📖 Relationship to PCS Specifications

This conformance test suite implements validation requirements defined in:

- **RFC-PCS-0001**: Core Architecture
- **RFC-PCS-0002**: Cognitive State Types
- **RFC-PCS-0003**: Cross-Model Cognitive Continuity Contract (CMCC)
- **RFC-PCS-0004**: PCS Conformance Test Suite
- **RFC-PCS-0006**: PCS Certification Program
- **RFC-PCS-0007**: Patent Disclosure and FRAND Licensing

Full specifications: https://persistra.com/standards/pcs/

---

## 🐛 Troubleshooting

### Common Issues

**Issue: "ANTHROPIC_API_KEY environment variable required"**
- Solution: Add your Claude API key to `.env` file

**Issue: "Cannot find module"**
- Solution: Run `npm install` to install dependencies

**Issue: "Session 2 fails to recall DR-014"**
- Solution: Verify memory graph persistence in `leo2/data/memory/`

**Issue: "Policy not enforced"**
- Solution: Ensure `LEO_POLICY_ENFORCEMENT=true` in `.env`

### Debug Mode

Enable verbose logging:
```bash
export LEO_LOG_LEVEL=debug
npm run test:l1
```

---

## 📞 Support and Contact

**Test Suite Repository:**
https://github.com/TrendCraft/persistra-pcs-cts

**PCS Specifications:**
https://persistra.com/standards/pcs/

**All Inquiries:**
info@exocorticalconcepts.com

**Patent and Licensing:**
info@exocorticalconcepts.com (Subject: PCS Patent Inquiry)

---

## 📄 License and Intellectual Property

**Evaluation License**

This test suite is provided for independent validation purposes under an evaluation license.

**Patent Notice:**
- Implementations of PCS may involve patented technology
- Execution of PCS-CTS does not grant patent licenses
- See **PATENT_NOTICE.md** for complete patent disclosure
- See RFC-PCS-0007 for FRAND licensing framework

**Key Points:**
- Technical conformance and IP rights are independent considerations
- Licensing (if required) is subject to separate written agreement
- All patent rights are expressly reserved

---

## 🏷️ Version Information

**Version:** PCS-CTS 1.0.1  
**Status:** Production (includes anti-subsumption safeguards)  
**Last Updated:** February 2026  
**PCS Compatibility:** RFC-PCS-0001 through RFC-PCS-0007  
**Validated By:** Carnegie Mellon SEI (pending), MIT CSAIL (pending)

---

## 🎓 For Validation Labs

If you are an independent validation lab executing this test suite:

1. **Clone this repository** to an isolated environment
2. **Follow the Quick Start** instructions exactly
3. **Preserve all audit artifacts** in `leo2/validation/audit/`
4. **Document test results** using provided JSON format
5. **Submit validation report** to info@exocorticalconcepts.com

Thank you for contributing to the validation of persistent cognitive standards.
