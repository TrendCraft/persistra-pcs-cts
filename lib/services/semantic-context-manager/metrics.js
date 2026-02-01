// Context quality metrics/scoring logic

/**
 * TODO: Refactor dependencies on 'this' and external functions (e.g., getBoundaryStatus)
 * Copied from semantic-context-manager.js
 */
const getContextQualityMetrics = (options = {}) => {
    const {
      includeTrends = true,
      includeUserFeedback = true,
      includePredictions = true
    } = options;
    
    // Get base metrics from last calculation or defaults
    const baseMetrics = this && this.lastContextQualityMetrics || {
      overallQuality: 0.5, // Default to medium quality
      coverage: 0.5,
      relevance: 0.5,
      recency: 0.5,
      diversity: 0.5,
      coherence: 0.5,
      completeness: 0.5,
      boundaryResilience: 0.5,
      userAlignmentScore: 0.5
    };
    
    // Start with base metrics
    const metrics = { ...baseMetrics };
    
    // Add timestamp for tracking
    metrics.timestamp = Date.now();
    
    // Add trend analysis if requested and history available
    if (includeTrends && this && this.contextQualityHistory && this.contextQualityHistory.length > 0) {
      // Calculate trends based on historical data
      const historyWindow = this.contextQualityHistory.slice(-5); // Last 5 measurements
      // Calculate simple trend direction and magnitude
      const oldestQuality = historyWindow[0].overallQuality;
      const newestQuality = historyWindow[historyWindow.length - 1].overallQuality;
      const qualityDelta = newestQuality - oldestQuality;
      metrics.trends = {
        direction: qualityDelta > 0.05 ? 'improving' : (qualityDelta < -0.05 ? 'declining' : 'stable'),
        magnitude: Math.abs(qualityDelta),
        historyAvailable: true,
        dataPoints: historyWindow.length
      };
    } else {
      metrics.trends = {
        direction: 'stable',
        magnitude: 0,
        historyAvailable: false
      };
    }
    
    // Add user feedback metrics if available
    if (includeUserFeedback) {
      metrics.userFeedback = {
        // This would ideally come from actual user feedback data
        alignmentScore: 0.85,
        satisfactionScore: 0.7,
        explicitFeedbackAvailable: false,
        implicitFeedbackAvailable: true
      };
    }
    
    // Add predictive metrics if requested
    if (includePredictions) {
      // Calculate boundary crossing predictions
      // Use the getBoundaryStatus function directly
      // TODO: getBoundaryStatus must be imported or passed in
      const boundaryStatus = typeof getBoundaryStatus === 'function' ? getBoundaryStatus() : { percentage: 0 };
      metrics.predictions = {
        nextBoundaryQuality: metrics.boundaryResilience * metrics.overallQuality,
        confidenceScore: 0.8,
        preservationLikelihood: metrics.boundaryResilience,
        boundaryProximity: boundaryStatus.percentage || 0
      };
    }
    
    return metrics;
}

module.exports = { getContextQualityMetrics };
