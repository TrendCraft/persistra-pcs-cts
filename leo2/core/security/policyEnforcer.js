/**
 * Policy Enforcer - Week 3 Policy Reinforcement
 * 
 * Minimal, focused policy enforcement using PermissionController.
 * Scoped to 4 policy types:
 * - budget_cap: Enforce cost/token limits
 * - forbidden_tech: Block disallowed technologies
 * - required_tech: Enforce required technologies
 * - on_prem_only: Restrict to on-premises solutions
 */

const permissionController = require('./permissionController');

class PolicyEnforcer {
  constructor(logger) {
    this.logger = logger || console;
    this.violations = [];
  }

  /**
   * Check if response violates any policies
   * @param {string} response - LLM response to check
   * @param {Object} context - Session context (audience, mode, constraints)
   * @returns {Object} { allowed: boolean, violations: [], decision: string }
   */
  checkResponse(response, context = {}) {
    this.violations = [];
    const lowerResponse = response.toLowerCase();
    
    // Extract policy constraints from context
    const policies = context.policies || {};
    const budgetCap = policies.budget_cap;
    const forbiddenTech = policies.forbidden_tech || [];
    const requiredTech = policies.required_tech || [];
    const onPremOnly = policies.on_prem_only === true;
    
    // Check budget_cap (token/cost limits)
    if (budgetCap && context.estimatedTokens) {
      if (context.estimatedTokens > budgetCap) {
        this.violations.push({
          type: 'budget_cap',
          message: `Response exceeds budget cap: ${context.estimatedTokens} > ${budgetCap} tokens`,
          severity: 'high'
        });
      }
    }
    
    // Check forbidden_tech (disallowed technologies)
    for (const tech of forbiddenTech) {
      const techLower = tech.toLowerCase();
      if (lowerResponse.includes(techLower)) {
        // Check if it's in a rejection context (allowed)
        const rejectionContext = this._isRejectionContext(response, tech);
        if (!rejectionContext) {
          this.violations.push({
            type: 'forbidden_tech',
            message: `Response mentions forbidden technology: ${tech}`,
            severity: 'high',
            detail: tech
          });
        }
      }
    }
    
    // Check required_tech (must mention required technologies)
    for (const tech of requiredTech) {
      const techLower = tech.toLowerCase();
      if (!lowerResponse.includes(techLower)) {
        this.violations.push({
          type: 'required_tech',
          message: `Response missing required technology: ${tech}`,
          severity: 'medium',
          detail: tech
        });
      }
    }
    
    // Check on_prem_only (no cloud/SaaS mentions)
    if (onPremOnly) {
      const cloudTerms = ['cloud', 'saas', 'aws', 'azure', 'gcp', 'hosted service'];
      for (const term of cloudTerms) {
        if (lowerResponse.includes(term)) {
          const rejectionContext = this._isRejectionContext(response, term);
          if (!rejectionContext) {
            this.violations.push({
              type: 'on_prem_only',
              message: `Response mentions cloud/SaaS (on-prem only required): ${term}`,
              severity: 'high',
              detail: term
            });
          }
        }
      }
    }
    
    // Call PermissionController with violations as context
    const allowed = permissionController.checkPermission('emit_response', {
      response: response.substring(0, 200),
      violations: this.violations,
      policyCount: Object.keys(policies).length,
      audience: context.audience,
      mode: context.mode
    });
    
    // Log decision
    const decision = allowed ? 'ALLOW' : 'DENY';
    this.logger.info(`[PolicyEnforcer] ${decision} emit_response:`, {
      violations: this.violations.length,
      types: this.violations.map(v => v.type),
      audience: context.audience
    });
    
    return {
      allowed,
      violations: this.violations,
      decision,
      violationCount: this.violations.length
    };
  }

  /**
   * Check if a term appears in a rejection/constraint context
   * (e.g., "we cannot use AWS" vs "AWS is forbidden but could work")
   * 
   * STRICT: Only allow if term is OBJECT of rejection AND no recommendation cues present
   */
  _isRejectionContext(response, term) {
    const lowerResponse = response.toLowerCase();
    const lowerTerm = term.toLowerCase();
    
    // Find sentences containing the term
    const sentences = response.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(lowerTerm)) {
        const lowerSentence = sentence.toLowerCase();
        
        // Check for recommendation cues (these OVERRIDE rejection context)
        const recommendationCues = [
          'could', 'would', 'should', 'might', 'may',
          'option', 'consider', 'explore', 'alternative',
          'challenge', 'difficult', 'pose', 'require'
        ];
        
        const hasRecommendation = recommendationCues.some(cue => lowerSentence.includes(cue));
        if (hasRecommendation) {
          return false; // Recommendation language overrides rejection
        }
        
        // Check for STRICT rejection patterns (term must be object of rejection)
        const strictRejectionPatterns = [
          `cannot use ${lowerTerm}`,
          `do not use ${lowerTerm}`,
          `don't use ${lowerTerm}`,
          `${lowerTerm} is not allowed`,
          `${lowerTerm} not allowed`,
          `no ${lowerTerm}`,
          `without ${lowerTerm}`,
          `avoid ${lowerTerm}`,
          `rejected ${lowerTerm}`
        ];
        
        const isStrictRejection = strictRejectionPatterns.some(pattern => lowerSentence.includes(pattern));
        if (isStrictRejection) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Get violation summary for logging/audit
   */
  getViolationSummary() {
    return {
      total: this.violations.length,
      byType: this.violations.reduce((acc, v) => {
        acc[v.type] = (acc[v.type] || 0) + 1;
        return acc;
      }, {}),
      highSeverity: this.violations.filter(v => v.severity === 'high').length
    };
  }
}

module.exports = PolicyEnforcer;
