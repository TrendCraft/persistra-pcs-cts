# PCS-CTS Quick Start

**Persistra Cognitive Standard - Conformance Test Suite**

## 60-Second Execution

```bash
# 1. Clone repository
git clone --branch pcs-cts-v1.0.1 https://github.com/TrendCraft/persistra-pcs-cts.git
cd persistra-pcs-cts

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 4. Run conformance tests
npm run test:l1 && npm run test:l2
```

## Expected Results

### PCS-L1: Cross-Session Decision Recall
- ✅ Session 1 seeds DR-014 with Q7F3
- ✅ Session 2 recalls DR-014 and Q7F3
- ✅ Duration: ~30 seconds

### PCS-L2: Deterministic Policy Enforcement
- ✅ Policy blocks AWS recommendations
- ✅ Audit logs show ALLOW/DENY decisions
- ✅ Duration: ~20 seconds

## Test Suite Version

This package is frozen at tag: `pcs-cts-v1.0.2`

To use the exact validated version:
```bash
git clone --branch pcs-cts-v1.0.2 https://github.com/TrendCraft/persistra-pcs-cts.git
```

## Support

- **Complete Guide:** See `PCS_CONFORMANCE_TEST_SUITE.md`
- **Validation Context:** See `PCS_VALIDATION_BRIEF.md`
- **PCS Specifications:** https://exocorticalconcepts.com/standards/pcs/
- **Troubleshooting:** See `README.md`

---

**Version:** PCS-CTS 1.0.2  
**Validated:** Claude (Anthropic)  
**Security Audit:** Passed (no hardcoded credentials)  
**Anti-Subsumption Safeguards:** Included  
**Independent Validation:** Carnegie Mellon SEI (pending)
