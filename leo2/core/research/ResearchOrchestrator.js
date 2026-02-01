/**
 * Research Orchestrator - Staged Multi-Pass Research Pipeline
 * 
 * Implements CSE-governed research pipeline that transforms complex queries
 * into comprehensive synthesis through staged processing:
 * 1. Scoping & Aspect Planning (CSE-driven)
 * 2. Local Summaries (Map phase with quality gates)
 * 3. Connection Mining (Typed edges & contradiction detection)
 * 4. Synthesis (Reduce phase with token budgeting)
 * 5. Memory Updates (Living memory evolution)
 * 
 * @created 2025-08-11
 * @phase CSE Governance Implementation
 */

const { createComponentLogger } = require('../../../lib/utils/logger');
const { ResearchWorkspace } = require('./ResearchWorkspace');

// Component name for logging
const COMPONENT_NAME = 'research-orchestrator';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Research Orchestrator Class
 * 
 * Orchestrates complex research queries through staged processing
 */
class ResearchOrchestrator {
  /**
   * Constructor
   * @param {Object} dependencies - Core dependencies
   */
  constructor({ cse, memoryGraph, llm }) {
    this.cse = cse; // EmergentCSE with governance methods
    this.memoryGraph = memoryGraph;
    this.llm = llm;
    
    // Research configuration
    this.config = {
      maxAspects: 6,
      sourcesPerAspect: 40,
      batchSize: 8,
      summaryTokenTarget: 500,
      synthesisTokenBudget: 3500,
      coverageThreshold: 0.7,
      connectionConfidenceThreshold: 0.6
    };
    
    // Active workspaces
    this.workspaces = new Map();
    
    // Metrics tracking
    this.metrics = {
      workspacesCreated: 0,
      aspectsProcessed: 0,
      summariesGenerated: 0,
      connectionsFound: 0,
      synthesisCompleted: 0
    };
    
    logger.info('ResearchOrchestrator initialized', {
      config: this.config,
      dependencies: {
        cse: !!cse,
        memoryGraph: !!memoryGraph,
        llm: !!llm
      }
    });
  }

  /**
   * Detect if query is research-oriented
   * @param {string} userInput - User query
   * @returns {boolean} Whether query requires research pipeline
   */
  isResearchQuery(userInput) {
    const researchIndicators = [
      // Analysis and investigation
      /analyze|survey|review|examine|investigate|study/i,
      /synthesize|combine|integrate|merge|unify/i,
      /compare|contrast|versus|vs|differences|similarities/i,
      /evaluate|assess|judge|critique|pros|cons/i,
      
      // Research-specific terms
      /research|papers|literature|findings|studies/i,
      /\d+\s+(papers|studies|articles|sources)/i, // "20 papers"
      
      // Knowledge queries
      /what\s+are\s+the\s+(latest|recent|current|key|main|primary)/i,
      /how\s+do\s+.+\s+(work|function|operate|enable|achieve)/i,
      /explain\s+the\s+(concept|theory|approach|method)/i,
      /overview\s+of|introduction\s+to|guide\s+to/i,
      
      // Complex question patterns
      /developments?\s+in|advances?\s+in|progress\s+in/i,
      /state\s+of\s+the\s+art|cutting\s+edge|frontier/i,
      /comprehensive|thorough|detailed|in-depth/i,
      
      // Multi-aspect queries
      /principles|fundamentals|foundations|aspects|factors/i,
      /approaches|methods|techniques|strategies|mechanisms/i,
      /architectures?|systems?|frameworks?|models?/i
    ];
    
    // Additional heuristics
    const hasQuestionWords = /what|how|why|when|where|which/i.test(userInput);
    const isLongQuery = userInput.length > 50;
    const hasComplexTerms = /cognitive|emergent|architecture|behavior|system/i.test(userInput);
    
    const matchesPattern = researchIndicators.some(pattern => pattern.test(userInput));
    const isLikelyResearch = hasQuestionWords && isLongQuery && hasComplexTerms;
    
    return matchesPattern || isLikelyResearch;
  }

  /**
   * Start research pipeline for complex query
   * @param {string} userInput - User query
   * @returns {Promise<ResearchWorkspace>} Created workspace
   */
  async start(userInput) {
    try {
      logger.info('Starting research pipeline', { 
        query: userInput.substring(0, 100) 
      });
      
      // Create research workspace
      const workspace = new ResearchWorkspace(userInput);
      this.workspaces.set(workspace.id, workspace);
      
      // Update metrics
      this.metrics.workspacesCreated++;
      
      logger.info('Research workspace created', {
        workspaceId: workspace.id,
        query: workspace.query
      });
      
      return workspace;
      
    } catch (error) {
      logger.error('Failed to start research pipeline', { error: error.message });
      throw error;
    }
  }

  /**
   * PASS 1: Scoping & Aspect Planning (CSE-governed)
   * @param {string} userInput - User query
   * @returns {Promise<Array>} Extracted aspects with must-cover items
   */
  async planAspects(userInput) {
    try {
      logger.info('Planning research aspects', { 
        query: userInput.substring(0, 50) 
      });
      
      // Use CSE to extract aspects
      const aspects = await this.cse.extractAspects(userInput, this.memoryGraph);
      
      // Use CSE to detect gaps
      const gapAnalysis = await this.cse.detectSalienceGaps(aspects, this.memoryGraph);
      
      // Combine aspects with gap analysis
      const enrichedAspects = aspects.map(aspect => ({
        ...aspect,
        mustCover: [...aspect.mustCover, ...gapAnalysis.mustCover]
      }));
      
      this.metrics.aspectsProcessed += enrichedAspects.length;
      
      logger.info('Aspect planning completed', {
        aspectCount: enrichedAspects.length,
        gapCount: gapAnalysis.gaps.length,
        mustCoverItems: gapAnalysis.mustCover.length
      });
      
      return {
        aspects: enrichedAspects,
        gaps: gapAnalysis.gaps,
        mustCover: gapAnalysis.mustCover
      };
      
    } catch (error) {
      logger.error('Failed to plan aspects', { error: error.message });
      return {
        aspects: [{ aspect: 'General analysis', priority: 1, mustCover: [] }],
        gaps: [],
        mustCover: []
      };
    }
  }

  /**
   * PASS 2: Gather sources for specific aspect
   * @param {Object} aspect - Research aspect
   * @param {number} K - Number of sources to gather
   * @returns {Promise<Array>} Gathered and ranked sources
   */
  async gatherSources(aspect, K = 40) {
    try {
      logger.debug('Gathering sources for aspect', {
        aspect: aspect.aspect,
        targetCount: K
      });
      
      // Raw retrieval from memory graph
      const rawResults = await this.memoryGraph.searchNodes({
        query: aspect.aspect,
        limit: Math.floor(K * 1.5), // Get extra for filtering
        threshold: 0.1
      });
      
      // Use CSE multi-factor re-ranking
      const rankedSources = await this.cse.rerank(rawResults, {
        aspect: aspect,
        mustCover: aspect.mustCover || []
      });
      
      // Take top K after ranking
      const finalSources = rankedSources.slice(0, K);
      
      logger.info('Sources gathered and ranked', {
        aspect: aspect.aspect,
        rawCount: rawResults.length,
        rankedCount: rankedSources.length,
        finalCount: finalSources.length,
        avgComposite: finalSources.reduce((sum, s) => sum + (s.composite || 0), 0) / finalSources.length
      });
      
      return finalSources;
      
    } catch (error) {
      logger.error('Failed to gather sources', { 
        aspect: aspect.aspect, 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * PASS 3: Batch summarize sources with quality gates
   * @param {Array} sources - Source documents
   * @param {number} batchSize - Batch size for processing
   * @param {Object} aspect - Target aspect
   * @returns {Promise<Array>} Generated summaries with metadata
   */
  async batchSummarize(sources, batchSize = 8, aspect = null) {
    try {
      logger.info('Starting batch summarization', {
        sourceCount: sources.length,
        batchSize,
        aspect: aspect?.aspect || 'unknown'
      });
      
      const summaries = [];
      const batches = this.chunkArray(sources, batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        logger.debug(`Processing batch ${i + 1}/${batches.length}`, {
          batchSize: batch.length
        });
        
        // Generate summary for batch
        const summary = await this.generateBatchSummary(batch, aspect);
        
        // CSE quality gate: coverage check
        const coverageCheck = await this.cse.coverageCheck(
          summary.content,
          aspect,
          aspect?.mustCover || []
        );
        
        // If coverage fails, attempt to gather more evidence
        if (!coverageCheck.passes && coverageCheck.missing.length > 0) {
          logger.warn('Coverage check failed, gathering additional evidence', {
            missing: coverageCheck.missing,
            confidence: coverageCheck.confidence
          });
          
          // Attempt to gather more targeted sources
          const additionalSources = await this.gatherAdditionalEvidence(
            coverageCheck.missing,
            aspect
          );
          
          if (additionalSources.length > 0) {
            // Re-summarize with additional evidence
            const enhancedBatch = [...batch, ...additionalSources];
            const enhancedSummary = await this.generateBatchSummary(enhancedBatch, aspect);
            
            summary.content = enhancedSummary.content;
            summary.enhanced = true;
            summary.additionalSources = additionalSources.length;
          }
        }
        
        // Add coverage metadata
        summary.coverage = coverageCheck;
        summary.batchIndex = i;
        summary.id = `summary_${Date.now()}_${i}`;
        
        summaries.push(summary);
        this.metrics.summariesGenerated++;
      }
      
      logger.info('Batch summarization completed', {
        batchCount: batches.length,
        summaryCount: summaries.length,
        avgCoverage: summaries.reduce((sum, s) => sum + s.coverage.confidence, 0) / summaries.length,
        enhancedCount: summaries.filter(s => s.enhanced).length
      });
      
      return summaries;
      
    } catch (error) {
      logger.error('Failed to batch summarize', { error: error.message });
      return [];
    }
  }

  /**
   * PASS 4: Mine connections between summaries
   * @param {string} workspaceId - Workspace identifier
   * @returns {Promise<Object>} Connection analysis results
   */
  async mineConnections(workspaceId) {
    try {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      
      logger.info('Mining connections between summaries', {
        workspaceId,
        summaryCount: workspace.summaries.length
      });
      
      // Use CSE to mine typed connections
      const connectionResults = await this.cse.mineConnections(workspace.summaries);
      
      // Store results in workspace
      workspace.connections = connectionResults.connections;
      workspace.contradictions = connectionResults.contradictions;
      workspace.contradictionClusters = connectionResults.contradictionClusters;
      
      this.metrics.connectionsFound += connectionResults.connections.length;
      
      logger.info('Connection mining completed', {
        workspaceId,
        connectionCount: connectionResults.connections.length,
        contradictionCount: connectionResults.contradictions.length,
        clusterCount: connectionResults.contradictionClusters.length
      });
      
      return connectionResults;
      
    } catch (error) {
      logger.error('Failed to mine connections', { 
        workspaceId, 
        error: error.message 
      });
      return { connections: [], contradictions: [], contradictionClusters: [] };
    }
  }

  /**
   * PASS 5: Build synthesis context with token budgeting
   * @param {string} workspaceId - Workspace identifier
   * @param {number} tokenBudget - Target token budget
   * @returns {Promise<Object>} Synthesis context
   */
  async buildSynthesisContext(workspaceId, tokenBudget = 3500) {
    try {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      
      logger.info('Building synthesis context', {
        workspaceId,
        tokenBudget,
        summaryCount: workspace.summaries.length
      });
      
      // Ensure we have summaries to work with
      if (workspace.summaries.length === 0) {
        logger.warn('No summaries available for synthesis context', { workspaceId });
        return {
          system: "You are a research synthesis assistant.",
          user: `Please provide a synthesis for the query: ${workspace.query}`,
          summaries: [],
          tokenBudget,
          metadata: { tokenBudget, summariesIncluded: 0, error: 'No summaries available' }
        };
      }
      
      // Use CSE to create synthesis plan
      const plan = await this.cse.synthesisPlan(workspace);
      
      // Build token-budgeted context
      const context = {
        system: this.buildSystemPrompt(plan, tokenBudget),
        user: this.buildUserPrompt(workspace.query, plan),
        summaries: workspace.summaries,
        tokenBudget,
        metadata: {
          tokenBudget,
          summariesIncluded: plan.summariesIncluded || workspace.summaries.length,
          aspectsCovered: plan.requiredAspects?.length || 0,
          contradictionsHighlighted: plan.contradictionClusters?.length || 0
        }
      };
      
      logger.info('Synthesis context built', {
        workspaceId,
        systemTokens: this.estimateTokens(context.system),
        userTokens: this.estimateTokens(context.user),
        totalTokens: this.estimateTokens(context.system + context.user)
      });
      
      return context;
      
    } catch (error) {
      logger.error('Failed to build synthesis context', { 
        workspaceId, 
        error: error.message 
      });
      return {
        system: "You are a research synthesis assistant.",
        user: "Please provide a synthesis of the available information.",
        summaries: [],
        tokenBudget,
        metadata: { tokenBudget, error: error.message }
      };
    }
  }

  /**
   * PASS 6: Generate final synthesis
   * @param {Object} context - Synthesis context
   * @returns {Promise<string>} Generated synthesis
   */
  async synthesize(context) {
    try {
      logger.info('Generating synthesis', {
        systemTokens: this.estimateTokens(context.system),
        userTokens: this.estimateTokens(context.user)
      });
      
      // Generate synthesis using LLM
      const fullPrompt = `${context.system}\n\n${context.user}`;
      const synthesis = await this.llm.generateResponse(fullPrompt, {
        max_tokens: 1000,
        temperature: 0.7
      });
      
      this.metrics.synthesisCompleted++;
      
      logger.info('Synthesis generated', {
        synthesisLength: synthesis.length,
        estimatedTokens: this.estimateTokens(synthesis)
      });
      
      return synthesis;
      
    } catch (error) {
      logger.error('Failed to generate synthesis', { error: error.message });
      return "I apologize, but I encountered an error while generating the synthesis.";
    }
  }

  /**
   * PASS 7: Store synthesis and update memory
   * @param {string} workspaceId - Workspace identifier
   * @param {string} synthesis - Generated synthesis
   * @returns {Promise<Object>} Storage results
   */
  async storeSynthesis(workspaceId, synthesis) {
    try {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      
      logger.info('Storing synthesis and updating memory', {
        workspaceId,
        synthesisLength: synthesis.length
      });
      
      // Store synthesis in workspace
      workspace.synthesis = synthesis;
      workspace.status = 'completed';
      workspace.completedAt = Date.now();
      
      // Create memory entry for synthesis
      const memoryEntry = {
        type: 'research_synthesis',
        content: synthesis,
        metadata: {
          workspaceId,
          query: workspace.query,
          aspectCount: workspace.aspects?.length || 0,
          summaryCount: workspace.summaries?.length || 0,
          connectionCount: workspace.connections?.length || 0,
          synthesizedAt: Date.now()
        },
        salient: true
      };
      
      // Store in memory graph
      const memoryId = await this.memoryGraph.addMemory(memoryEntry);
      
      // Store connections as edges (if memory graph supports it)
      if (workspace.connections && this.memoryGraph.addEdge) {
        for (const connection of workspace.connections) {
          await this.memoryGraph.addEdge(
            connection.from,
            connection.to,
            connection.type,
            connection.confidence
          );
        }
      }
      
      logger.info('Synthesis stored successfully', {
        workspaceId,
        memoryId,
        edgesStored: workspace.connections?.length || 0
      });
      
      return {
        memoryId,
        workspace,
        edgesStored: workspace.connections?.length || 0
      };
      
    } catch (error) {
      logger.error('Failed to store synthesis', { 
        workspaceId, 
        error: error.message 
      });
      return { error: error.message };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Generate summary for a batch of sources
   */
  async generateBatchSummary(batch, aspect) {
    const batchContent = batch.map(source => 
      `Source: ${source.source || 'Unknown'}\nContent: ${source.content || source.summary || ''}`
    ).join('\n\n---\n\n');
    
    const prompt = `Analyze the following sources and provide a structured summary (400-600 tokens) focusing on ${aspect?.aspect || 'key insights'}:

${batchContent}

Please provide:
1. Key claims and findings
2. Methods and approaches used
3. Limitations and challenges noted
4. Relevant entities and concepts
5. Source references

Format as a coherent summary with clear citations.`;
    
    const summary = await this.llm.generateResponse(prompt, {
      max_tokens: 600,
      temperature: 0.3
    });
    
    return {
      content: summary,
      sources: batch.map(s => s.id || s.source),
      aspect: aspect?.aspect,
      generatedAt: Date.now()
    };
  }

  /**
   * Gather additional evidence for missing coverage items
   */
  async gatherAdditionalEvidence(missingItems, aspect) {
    const additionalSources = [];
    
    for (const item of missingItems.slice(0, 3)) { // Limit to avoid explosion
      try {
        const results = await this.memoryGraph.searchMemories({
          query: `${aspect?.aspect || ''} ${item}`,
          maxResults: 5,
          salienceThreshold: 0.2
        });
        
        additionalSources.push(...results);
      } catch (error) {
        logger.warn('Failed to gather additional evidence', { item, error: error.message });
      }
    }
    
    return additionalSources.slice(0, 10); // Limit total additional sources
  }

  /**
   * Build system prompt for synthesis
   */
  buildSystemPrompt(plan, tokenBudget) {
    const requiredAspects = plan.requiredAspects || [];
    const mustCoverItems = plan.coverage?.mustCoverItems || [];
    const contradictionClusters = plan.contradictionClusters || [];
    
    return `You are an expert research synthesizer. Your task is to create a comprehensive synthesis based on the provided summaries and connections.

SYNTHESIS REQUIREMENTS:
- Cover all required aspects: ${requiredAspects.map(a => a.aspect || a).join(', ') || 'General analysis'}
- Address must-cover items: ${mustCoverItems.join(', ') || 'None specified'}
- Highlight contradictions: ${contradictionClusters.length} clusters identified
- Maintain balanced representation across provenance sources
- Include proper citations using [Source: X] format
- Target length: ${Math.floor(tokenBudget * 0.6)} tokens

SYNTHESIS STRUCTURE:
1. Executive Summary
2. Key Findings by Aspect
3. Methodological Insights
4. Contradictions and Debates
5. Limitations and Future Directions
6. Conclusions

Ensure factual accuracy and cite all claims appropriately.`;
  }

  /**
   * Build user prompt for synthesis
   */
  buildUserPrompt(originalQuery, plan) {
    return `Original Research Query: "${originalQuery}"

Please synthesize the research findings to comprehensively address this query. Focus on providing actionable insights while acknowledging uncertainties and contradictions.`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    return Math.ceil((text || '').length / 4); // Rough estimate: 4 chars per token
  }

  /**
   * Chunk array into smaller batches
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get orchestrator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeWorkspaces: this.workspaces.size,
      cseMetrics: this.cse.governanceMetrics
    };
  }
}

module.exports = ResearchOrchestrator;
