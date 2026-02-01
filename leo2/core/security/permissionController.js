// leo2/core/security/permissionController.js
const logger = require('../../../lib/utils/logger');
const POLICY_LOG_ENABLED =
  String(process.env.LEO_POLICY_AUDIT || '').toLowerCase() === 'true' ||
  String(process.env.LEO_ALE_DIAGNOSTICS || '').toLowerCase() === 'true' ||
  String(process.env.LEO_ALE_DEBUG || '').toLowerCase() === 'true';
class PermissionController {
  checkPermission(action, context = {}) {
    const returnDecision = context && context.returnDecision === true;

    const violations = Array.isArray(context?.violations) ? context.violations : [];
    const violationTypes = [...new Set(violations.map(v => v?.type).filter(Boolean))];

    let allowed = true;
    let decision = 'ALLOW';

    // Week 3: emit_response policy gate
    if (action === 'emit_response') {
      const HIGH_SEVERITY_TYPES = new Set(['budget_cap', 'forbidden_tech', 'on_prem_only']);

      const hasHigh = violations.some(v => {
        const sev = String(v?.severity || '').toLowerCase();
        if (sev === 'high') return true;
        const t = String(v?.type || '').toLowerCase();
        return HIGH_SEVERITY_TYPES.has(t);
      });

      if (hasHigh) {
        allowed = false;
        decision = 'DENY';
      }
    }

    // Log allow/deny (don't ever throw from control plane)
    try {
      const payload = {
        action,
        decision,
        allowed,
        violationCount: violations.length,
        violationTypes,
        audience: context?.audience,
        mode: context?.mode,
        sessionId: context?.sessionId
      };
      (this.logger?.info ? this.logger.info.bind(this.logger) : console.log)('[PermissionController] decision', payload);
    } catch (_) {}

    if (!returnDecision) return allowed;

    return {
      allowed,
      decision,
      policyBlocked: !allowed,
      violationTypes,
      violations,
      violationCount: violations.length
    };
  }

  canProcessEvent(event) {
    if (POLICY_LOG_ENABLED) {
      logger.info('[PermissionController] canProcessEvent:', event);
    }
    return true;
  }

  canWriteCode(context) {
    if (POLICY_LOG_ENABLED) {
      logger.info('[PermissionController] canWriteCode:', context);
    }
    return true;
  }
}
module.exports = new PermissionController();
