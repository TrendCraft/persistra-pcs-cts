/**
 * Research Workspace - Container for staged research pipeline
 * 
 * Manages state and artifacts for complex research queries through
 * the multi-pass research orchestration pipeline.
 * 
 * @created 2025-08-11
 * @phase CSE Governance Implementation
 */

const { createComponentLogger } = require('../../../lib/utils/logger');

// Component name for logging
const COMPONENT_NAME = 'research-workspace';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Research Workspace Class
 * 
 * Tracks research pipeline state and artifacts
 */
class ResearchWorkspace {
  /**
   * Constructor
   * @param {string} query - Original research query
   */
  constructor(query) {
    this.id = this.generateId();
    this.query = query;
    this.status = 'planning'; // planning, gathering, summarizing, connecting, synthesizing, completed, failed
    
    // Pipeline artifacts
    this.aspects = [];
    this.sources = [];
    this.summaries = [];
    this.connections = [];
    this.contradictions = [];
    this.contradictionClusters = [];
    this.synthesis = null;
    
    // Metadata
    this.createdAt = Date.now();
    this.completedAt = null;
    this.mustCover = [];
    this.gaps = [];
    
    // Progress tracking
    this.progress = {
      aspectsPlanned: 0,
      sourcesGathered: 0,
      summariesGenerated: 0,
      connectionsFound: 0,
      synthesisCompleted: false
    };
    
    // Quality metrics
    this.quality = {
      averageCoverage: 0,
      contradictionsResolved: 0,
      citationAccuracy: 0,
      completenessScore: 0
    };
    
    logger.info('Research workspace created', {
      id: this.id,
      query: query.substring(0, 100),
      status: this.status
    });
  }

  /**
   * Generate unique workspace ID
   * @returns {string} Unique identifier
   */
  generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `workspace_${timestamp}_${random}`;
  }

  /**
   * Update workspace status
   * @param {string} status - New status
   * @param {Object} metadata - Optional metadata
   */
  updateStatus(status, metadata = {}) {
    const previousStatus = this.status;
    this.status = status;
    
    if (status === 'completed') {
      this.completedAt = Date.now();
    }
    
    logger.debug('Workspace status updated', {
      id: this.id,
      previousStatus,
      newStatus: status,
      metadata
    });
  }

  /**
   * Add research aspects
   * @param {Array} aspects - Research aspects
   * @param {Array} gaps - Identified gaps
   * @param {Array} mustCover - Must-cover items
   */
  setAspects(aspects, gaps = [], mustCover = []) {
    this.aspects = aspects;
    this.gaps = gaps;
    this.mustCover = mustCover;
    this.progress.aspectsPlanned = aspects.length;
    
    logger.debug('Aspects set for workspace', {
      id: this.id,
      aspectCount: aspects.length,
      gapCount: gaps.length,
      mustCoverCount: mustCover.length
    });
  }

  /**
   * Add sources for an aspect
   * @param {string} aspectId - Aspect identifier
   * @param {Array} sources - Source documents
   */
  addSources(aspectId, sources) {
    // Tag sources with aspect
    const taggedSources = sources.map(source => ({
      ...source,
      aspectId,
      addedAt: Date.now()
    }));
    
    this.sources.push(...taggedSources);
    this.progress.sourcesGathered = this.sources.length;
    
    logger.debug('Sources added to workspace', {
      id: this.id,
      aspectId,
      sourceCount: sources.length,
      totalSources: this.sources.length
    });
  }

  /**
   * Add summary with quality metrics
   * @param {Object} summary - Generated summary
   */
  addSummary(summary) {
    // Enhance summary with workspace metadata
    const enhancedSummary = {
      ...summary,
      workspaceId: this.id,
      addedAt: Date.now()
    };
    
    this.summaries.push(enhancedSummary);
    this.progress.summariesGenerated = this.summaries.length;
    
    // Update quality metrics
    if (summary.coverage) {
      this.updateCoverageMetrics(summary.coverage);
    }
    
    logger.debug('Summary added to workspace', {
      id: this.id,
      summaryId: summary.id,
      coverage: summary.coverage?.confidence || 'unknown',
      totalSummaries: this.summaries.length
    });
  }

  /**
   * Set connections and contradictions
   * @param {Array} connections - Typed connections
   * @param {Array} contradictions - Contradiction list
   * @param {Array} contradictionClusters - Clustered contradictions
   */
  setConnections(connections, contradictions = [], contradictionClusters = []) {
    this.connections = connections;
    this.contradictions = contradictions;
    this.contradictionClusters = contradictionClusters;
    this.progress.connectionsFound = connections.length;
    
    logger.debug('Connections set for workspace', {
      id: this.id,
      connectionCount: connections.length,
      contradictionCount: contradictions.length,
      clusterCount: contradictionClusters.length
    });
  }

  /**
   * Set final synthesis
   * @param {string} synthesis - Generated synthesis
   * @param {Object} metadata - Synthesis metadata
   */
  setSynthesis(synthesis, metadata = {}) {
    this.synthesis = synthesis;
    this.progress.synthesisCompleted = true;
    this.updateStatus('completed', metadata);
    
    // Calculate final quality score
    this.calculateFinalQuality();
    
    logger.info('Synthesis completed for workspace', {
      id: this.id,
      synthesisLength: synthesis.length,
      finalQuality: this.quality.completenessScore,
      duration: this.completedAt - this.createdAt
    });
  }

  /**
   * Update coverage metrics from summary
   * @param {Object} coverage - Coverage assessment
   */
  updateCoverageMetrics(coverage) {
    const currentSummaries = this.summaries.length;
    const newAverage = (
      (this.quality.averageCoverage * currentSummaries) + 
      coverage.confidence
    ) / (currentSummaries + 1);
    
    this.quality.averageCoverage = newAverage;
  }

  /**
   * Calculate final quality score
   */
  calculateFinalQuality() {
    let score = 0;
    let factors = 0;
    
    // Coverage factor (0-0.3)
    if (this.quality.averageCoverage > 0) {
      score += this.quality.averageCoverage * 0.3;
      factors++;
    }
    
    // Completeness factor (0-0.3)
    const aspectsCovered = this.aspects.length > 0 ? 
      this.summaries.length / this.aspects.length : 0;
    score += Math.min(aspectsCovered, 1.0) * 0.3;
    factors++;
    
    // Connection factor (0-0.2)
    if (this.summaries.length > 1) {
      const expectedConnections = (this.summaries.length * (this.summaries.length - 1)) / 2;
      const connectionRatio = Math.min(this.connections.length / expectedConnections, 1.0);
      score += connectionRatio * 0.2;
      factors++;
    }
    
    // Synthesis factor (0-0.2)
    if (this.synthesis) {
      const synthesisQuality = Math.min(this.synthesis.length / 1000, 1.0); // Rough estimate
      score += synthesisQuality * 0.2;
      factors++;
    }
    
    this.quality.completenessScore = factors > 0 ? score : 0;
  }

  /**
   * Get workspace progress summary
   * @returns {Object} Progress summary
   */
  getProgress() {
    const totalSteps = 5; // aspects, sources, summaries, connections, synthesis
    let completedSteps = 0;
    
    if (this.progress.aspectsPlanned > 0) completedSteps++;
    if (this.progress.sourcesGathered > 0) completedSteps++;
    if (this.progress.summariesGenerated > 0) completedSteps++;
    if (this.progress.connectionsFound > 0) completedSteps++;
    if (this.progress.synthesisCompleted) completedSteps++;
    
    return {
      ...this.progress,
      completedSteps,
      totalSteps,
      percentComplete: (completedSteps / totalSteps) * 100,
      status: this.status
    };
  }

  /**
   * Get workspace summary for logging/debugging
   * @returns {Object} Workspace summary
   */
  getSummary() {
    return {
      id: this.id,
      query: this.query.substring(0, 100),
      status: this.status,
      progress: this.getProgress(),
      quality: this.quality,
      artifacts: {
        aspects: this.aspects.length,
        sources: this.sources.length,
        summaries: this.summaries.length,
        connections: this.connections.length,
        contradictions: this.contradictions.length,
        synthesis: !!this.synthesis
      },
      timing: {
        createdAt: this.createdAt,
        completedAt: this.completedAt,
        duration: this.completedAt ? this.completedAt - this.createdAt : null
      }
    };
  }

  /**
   * Export workspace data for persistence
   * @returns {Object} Serializable workspace data
   */
  export() {
    return {
      id: this.id,
      query: this.query,
      status: this.status,
      aspects: this.aspects,
      sources: this.sources,
      summaries: this.summaries,
      connections: this.connections,
      contradictions: this.contradictions,
      contradictionClusters: this.contradictionClusters,
      synthesis: this.synthesis,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      mustCover: this.mustCover,
      gaps: this.gaps,
      progress: this.progress,
      quality: this.quality
    };
  }

  /**
   * Import workspace data from persistence
   * @param {Object} data - Serialized workspace data
   * @returns {ResearchWorkspace} Restored workspace
   */
  static import(data) {
    const workspace = new ResearchWorkspace(data.query);
    
    // Restore all properties
    Object.assign(workspace, data);
    
    logger.info('Research workspace imported', {
      id: workspace.id,
      status: workspace.status,
      artifacts: workspace.getSummary().artifacts
    });
    
    return workspace;
  }
}

module.exports = { ResearchWorkspace };
