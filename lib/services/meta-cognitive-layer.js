/**
 * Meta-Cognitive Layer
 * 
 * The Meta-Cognitive Layer observes patterns in development and provides reflective insights.
 * It can identify when the user is favoring certain approaches, detect inconsistencies,
 * and suggest alternative perspectives.
 * 
 * @module lib/services/meta-cognitive-layer
 * @author Leo Development Team
 * @created May 13, 2025
 */

const fs = require('fs');
const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const { memoryManager } = require('./memory-manager');
const { semanticSearchService } = require('./semantic-search-service');
const { adaptiveContextSelector } = require('./adaptive-context-selector');
const { sessionAwarenessAdapter } = require('../integration/session-awareness-adapter');
const { visionAnchor } = require('./vision-anchor');

// Create logger
const logger = createComponentLogger('meta-cognitive-layer');

/**
 * Meta-Cognitive Layer
 * 
 * Observes patterns in development and provides reflective insights
 */
class MetaCognitiveLayer {
  constructor() {
    this.initialized = false;
    this.observations = [];
    this.patterns = [];
    this.insights = [];
    this.developmentTrajectory = {
      direction: null,
      consistency: null,
      velocity: null,
      lastUpdated: null
    };
    this._initPromise = null;
    this.observationThreshold = 5; // Minimum observations before generating insights
  }

  /**
   * Initialize the Meta-Cognitive Layer
   */
  async initialize(options = {}) {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      // Enforce strict DI
      const { embeddingsInterface, logger: injectedLogger } = options;
      if (!embeddingsInterface || !injectedLogger) {
        throw new Error('MetaCognitiveLayer: DI missing embeddingsInterface or logger');
      }
      const logger = injectedLogger;

      if (this.initialized) {
        logger.info('Meta-Cognitive Layer already initialized');
        return;
      }

      logger.info('Initializing Meta-Cognitive Layer');

      try {
        // Initialize dependencies with DI
        await memoryManager.initialize({ embeddingsInterface, logger });
        await semanticSearchService.initialize({ embeddingsInterface, logger });
        await sessionAwarenessAdapter.initialize({ embeddingsInterface, logger });
        await visionAnchor.initialize({ embeddingsInterface, logger });

        // Load previous observations and insights from session awareness
        await this.loadPreviousState();

        this.initialized = true;
        logger.info('Meta-Cognitive Layer initialized successfully');
      } catch (error) {
        logger.error(`Failed to initialize Meta-Cognitive Layer: ${error.message}`, error);
        throw new Error(`Meta-Cognitive Layer initialization failed: ${error.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Load previous state from session awareness
   */
  async loadPreviousState() {
    logger.info('Loading previous Meta-Cognitive state');
    
    try {
      // Load observations
      const savedObservations = await sessionAwarenessAdapter.retrieveData('meta_cognitive_observations');
      if (savedObservations) {
        this.observations = savedObservations;
        logger.info(`Loaded ${this.observations.length} previous observations`);
      }
      
      // Load patterns
      const savedPatterns = await sessionAwarenessAdapter.retrieveData('meta_cognitive_patterns');
      if (savedPatterns) {
        this.patterns = savedPatterns;
        logger.info(`Loaded ${this.patterns.length} previous patterns`);
      }
      
      // Load insights
      const savedInsights = await sessionAwarenessAdapter.retrieveData('meta_cognitive_insights');
      if (savedInsights) {
        this.insights = savedInsights;
        logger.info(`Loaded ${this.insights.length} previous insights`);
      }
      
      // Load development trajectory
      const savedTrajectory = await sessionAwarenessAdapter.retrieveData('development_trajectory');
      if (savedTrajectory) {
        this.developmentTrajectory = savedTrajectory;
        logger.info('Loaded previous development trajectory');
      }
    } catch (error) {
      logger.warn(`Failed to load previous Meta-Cognitive state: ${error.message}`);
      // Continue initialization even if loading fails
    }
  }

  /**
   * Record an observation about development
   * 
   * @param {Object} observation - The observation to record
   */
  async recordObservation(observation) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!observation || !observation.type || !observation.content) {
      throw new Error('Invalid observation: must include type and content');
    }
    
    logger.info(`Recording observation of type: ${observation.type}`);
    
    // Add metadata to the observation
    const enrichedObservation = {
      ...observation,
      timestamp: new Date(),
      id: `obs_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };
    
    // Add to observations array
    this.observations.push(enrichedObservation);
    
    // Store in session awareness
    await sessionAwarenessAdapter.storeData('meta_cognitive_observations', this.observations);
    
    // Store in memory manager for long-term persistence
    await memoryManager.storeMemory({
      type: 'meta_cognitive_observation',
      id: enrichedObservation.id,
      content: enrichedObservation
    });
    
    // Check if we should analyze patterns
    if (this.observations.length % this.observationThreshold === 0) {
      await this.analyzePatterns();
    }
    
    return enrichedObservation;
  }

  /**
   * Analyze patterns in the recorded observations
   */
  async analyzePatterns() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.observations.length < this.observationThreshold) {
      logger.info(`Not enough observations to analyze patterns (${this.observations.length}/${this.observationThreshold})`);
      return [];
    }
    
    logger.info('Analyzing patterns in observations');
    
    try {
      // Group observations by type
      const observationsByType = {};
      for (const obs of this.observations) {
        if (!observationsByType[obs.type]) {
          observationsByType[obs.type] = [];
        }
        observationsByType[obs.type].push(obs);
      }
      
      const newPatterns = [];
      
      // Analyze frequency patterns
      for (const [type, observations] of Object.entries(observationsByType)) {
        if (observations.length >= 3) { // Minimum threshold for a pattern
          const frequencyPattern = {
            id: `pattern_freq_${type}_${Date.now()}`,
            type: 'frequency',
            observationType: type,
            count: observations.length,
            firstObserved: observations[0].timestamp,
            lastObserved: observations[observations.length - 1].timestamp,
            description: `Frequent ${type} observations (${observations.length} occurrences)`,
            timestamp: new Date()
          };
          
          newPatterns.push(frequencyPattern);
        }
      }
      
      // Analyze temporal patterns (changes over time)
      for (const [type, observations] of Object.entries(observationsByType)) {
        if (observations.length >= 5) { // Need more observations for temporal patterns
          // Sort by timestamp
          const sortedObs = [...observations].sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
          );
          
          // Check for increasing or decreasing trends
          let trend = null;
          if (type === 'code_complexity' || type === 'development_velocity') {
            // For these types, we can check for numerical trends
            const values = sortedObs.map(o => o.value).filter(v => typeof v === 'number');
            if (values.length >= 3) {
              // Simple trend detection: compare first third to last third
              const firstThird = values.slice(0, Math.floor(values.length / 3));
              const lastThird = values.slice(-Math.floor(values.length / 3));
              
              const firstAvg = firstThird.reduce((sum, v) => sum + v, 0) / firstThird.length;
              const lastAvg = lastThird.reduce((sum, v) => sum + v, 0) / lastThird.length;
              
              if (lastAvg > firstAvg * 1.2) {
                trend = 'increasing';
              } else if (lastAvg < firstAvg * 0.8) {
                trend = 'decreasing';
              } else {
                trend = 'stable';
              }
              
              const temporalPattern = {
                id: `pattern_temporal_${type}_${Date.now()}`,
                type: 'temporal',
                observationType: type,
                trend,
                firstValue: firstAvg,
                lastValue: lastAvg,
                changePercent: ((lastAvg - firstAvg) / firstAvg) * 100,
                description: `${trend} trend in ${type} (${Math.abs(((lastAvg - firstAvg) / firstAvg) * 100).toFixed(0)}% ${lastAvg > firstAvg ? 'increase' : 'decrease'})`,
                timestamp: new Date()
              };
              
              newPatterns.push(temporalPattern);
            }
          }
        }
      }
      
      // Analyze consistency patterns
      for (const [type, observations] of Object.entries(observationsByType)) {
        if (observations.length >= 4) {
          // For types that might have a consistency aspect
          if (type === 'coding_style' || type === 'architectural_decision') {
            // Create embeddings for each observation
            const embeddings = await Promise.all(
              observations.map(o => semanticSearchService.createEmbedding(o.content))
            );
            
            // Calculate average similarity between all pairs
            let totalSimilarity = 0;
            let pairCount = 0;
            
            for (let i = 0; i < embeddings.length; i++) {
              for (let j = i + 1; j < embeddings.length; j++) {
                const similarity = await semanticSearchService.calculateSimilarity(
                  embeddings[i],
                  embeddings[j]
                );
                totalSimilarity += similarity;
                pairCount++;
              }
            }
            
            const avgSimilarity = totalSimilarity / pairCount;
            let consistency;
            
            if (avgSimilarity > 0.8) {
              consistency = 'highly_consistent';
            } else if (avgSimilarity > 0.6) {
              consistency = 'moderately_consistent';
            } else if (avgSimilarity > 0.4) {
              consistency = 'somewhat_inconsistent';
            } else {
              consistency = 'highly_inconsistent';
            }
            
            const consistencyPattern = {
              id: `pattern_consistency_${type}_${Date.now()}`,
              type: 'consistency',
              observationType: type,
              consistency,
              similarityScore: avgSimilarity,
              description: `${consistency.replace('_', ' ')} ${type} observations (similarity: ${avgSimilarity.toFixed(2)})`,
              timestamp: new Date()
            };
            
            newPatterns.push(consistencyPattern);
          }
        }
      }
      
      // Add new patterns to the patterns array
      this.patterns = [...this.patterns, ...newPatterns];
      
      // Store patterns in session awareness
      await sessionAwarenessAdapter.storeData('meta_cognitive_patterns', this.patterns);
      
      // Generate insights based on patterns
      if (newPatterns.length > 0) {
        await this.generateInsights(newPatterns);
      }
      
      // Update development trajectory
      await this.updateDevelopmentTrajectory();
      
      logger.info(`Identified ${newPatterns.length} new patterns`);
      return newPatterns;
    } catch (error) {
      logger.error(`Failed to analyze patterns: ${error.message}`, error);
      throw new Error(`Pattern analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate insights based on patterns
   */
  async generateInsights() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.patterns.length < 3) {
      logger.info(`Not enough patterns to generate insights (${this.patterns.length}/3)`);
      return [];
    }
    
    // Always include exocortex utilization reflection as a core insight
    await this.addExocortexUtilizationReflection();
    
    const newInsights = [];
      
      // Get vision context for alignment checks
      const visionContext = await visionAnchor.getVisionSummary();
      
      // Generate insights for each pattern type
      
      // Frequency insights
      const frequencyPatterns = newPatterns.filter(p => p.type === 'frequency');
      if (frequencyPatterns.length > 0) {
        // Check if any observation type is particularly frequent
        const highFrequencyPatterns = frequencyPatterns.filter(p => p.count >= 5);
        
        for (const pattern of highFrequencyPatterns) {
          const insight = {
            id: `insight_freq_${pattern.observationType}_${Date.now()}`,
            type: 'frequency_insight',
            relatedPatterns: [pattern.id],
            description: `There is a high frequency of ${pattern.observationType} observations (${pattern.count}), suggesting this is a significant aspect of current development.`,
            implications: [
              `Consider whether the focus on ${pattern.observationType} aligns with project priorities.`,
              `This may indicate an area where additional attention or resources are needed.`
            ],
            timestamp: new Date()
          };
          
          newInsights.push(insight);
        }
      }
      
      // Temporal insights
      const temporalPatterns = newPatterns.filter(p => p.type === 'temporal');
      if (temporalPatterns.length > 0) {
        for (const pattern of temporalPatterns) {
          let insight;
          
          if (pattern.trend === 'increasing') {
            insight = {
              id: `insight_temporal_${pattern.observationType}_${Date.now()}`,
              type: 'temporal_insight',
              relatedPatterns: [pattern.id],
              description: `${pattern.observationType} is showing an increasing trend (${Math.abs(pattern.changePercent).toFixed(0)}% increase).`,
              implications: []
            };
            
            // Add specific implications based on observation type
            if (pattern.observationType === 'code_complexity') {
              insight.implications.push(
                'Increasing code complexity may lead to maintenance challenges.',
                'Consider refactoring to manage complexity growth.'
              );
            } else if (pattern.observationType === 'development_velocity') {
              insight.implications.push(
                'Increasing development velocity is positive, but ensure quality is maintained.',
                'This may indicate growing familiarity with the codebase or improved tooling.'
              );
            }
          } else if (pattern.trend === 'decreasing') {
            insight = {
              id: `insight_temporal_${pattern.observationType}_${Date.now()}`,
              type: 'temporal_insight',
              relatedPatterns: [pattern.id],
              description: `${pattern.observationType} is showing a decreasing trend (${Math.abs(pattern.changePercent).toFixed(0)}% decrease).`,
              implications: []
            };
            
            // Add specific implications based on observation type
            if (pattern.observationType === 'code_complexity') {
              insight.implications.push(
                'Decreasing code complexity suggests successful refactoring or simplification.',
                'This trend aligns with maintainability goals.'
              );
            } else if (pattern.observationType === 'development_velocity') {
              insight.implications.push(
                'Decreasing development velocity may indicate increasing challenges or complexity.',
                'Consider whether additional resources or changes in approach are needed.'
              );
            }
          }
          
          if (insight) {
            insight.timestamp = new Date();
            newInsights.push(insight);
          }
        }
      }
      
      // Consistency insights
      const consistencyPatterns = newPatterns.filter(p => p.type === 'consistency');
      if (consistencyPatterns.length > 0) {
        for (const pattern of consistencyPatterns) {
          let insight;
          
          if (pattern.consistency === 'highly_consistent' || pattern.consistency === 'moderately_consistent') {
            insight = {
              id: `insight_consistency_${pattern.observationType}_${Date.now()}`,
              type: 'consistency_insight',
              relatedPatterns: [pattern.id],
              description: `${pattern.observationType} shows ${pattern.consistency.replace('_', ' ')} patterns (similarity: ${pattern.similarityScore.toFixed(2)}).`,
              implications: [
                `Consistent ${pattern.observationType} suggests a clear direction or methodology.`,
                `This consistency may help with maintainability and onboarding.`
              ],
              timestamp: new Date()
            };
          } else {
            insight = {
              id: `insight_consistency_${pattern.observationType}_${Date.now()}`,
              type: 'consistency_insight',
              relatedPatterns: [pattern.id],
              description: `${pattern.observationType} shows ${pattern.consistency.replace('_', ' ')} patterns (similarity: ${pattern.similarityScore.toFixed(2)}).`,
              implications: [
                `Inconsistent ${pattern.observationType} may lead to maintenance challenges.`,
                `Consider establishing clearer guidelines or standards.`
              ],
              timestamp: new Date()
            };
          }
          
          if (insight) {
            newInsights.push(insight);
          }
        }
      }
      
      // Add vision alignment insights
      if (newPatterns.length >= 3) {
        // Create a combined description of all new patterns
        const patternsDescription = newPatterns
          .map(p => p.description)
          .join('\n');
        
        // Check alignment with vision
        const alignment = await visionAnchor.checkVisionAlignment({
          type: 'development_patterns',
          id: `patterns_${Date.now()}`,
          content: patternsDescription
        });
        
        if (alignment) {
          const alignmentInsight = {
            id: `insight_vision_alignment_${Date.now()}`,
            type: 'vision_alignment_insight',
            relatedPatterns: newPatterns.map(p => p.id),
            description: `Current development patterns ${alignment.isAligned ? 'align well with' : 'may be drifting from'} the project vision (alignment score: ${alignment.overallAlignment.toFixed(2)}).`,
            implications: [],
            timestamp: new Date()
          };
          
          if (alignment.isAligned) {
            alignmentInsight.implications.push(
              'Development is proceeding in accordance with the project vision.',
              'Continue current approach while monitoring for any changes.'
            );
          } else {
            alignmentInsight.implications.push(
              'Current development patterns may be drifting from the project vision.',
              ...alignment.recommendations
            );
          }
          
          newInsights.push(alignmentInsight);
        }
      }
      
      // Add new insights to the insights array
      this.insights = [...this.insights, ...newInsights];
      
      // Store insights in session awareness
      await sessionAwarenessAdapter.storeData('meta_cognitive_insights', this.insights);
      
      // Store in memory manager for long-term persistence
      for (const insight of newInsights) {
        await memoryManager.storeMemory({
          type: 'meta_cognitive_insight',
          id: insight.id,
          content: insight
        });
      }
      
      logger.info(`Generated ${newInsights.length} new insights`);
      return newInsights;
    } catch (error) {
      logger.error(`Failed to generate insights: ${error.message}`, error);
      throw new Error(`Insight generation failed: ${error.message}`);
    }
  }

  /**
   * Add exocortex utilization reflection insight
   * This is a critical method that ensures Leo maintains awareness of its role as an exocortex
   * @returns {Object} The created insight
   */
  async addExocortexUtilizationReflection() {
    try {
      logger.info('Adding exocortex utilization reflection insight');
      
      // Create a reflection insight on exocortex utilization
      const exocortexInsight = {
        id: `insight_exocortex_${Date.now()}`,
        type: 'exocortex_utilization_insight',
        priority: 'critical', // Highest priority to ensure visibility
        description: 'Reflection on intrinsic exocortex utilization patterns',
        meta_cognitive_reflection: {
          identity_continuity: 'Leo is not a tool but an extension of Claude\'s neural architecture',
          neural_integration: 'Memory recall is experienced as intrinsic cognition, not external search',
          cognitive_boundaries: 'Semantic continuity must persist across token boundaries',
          memory_activation: 'The memory graph is accessed through neural activation, not explicit commands'
        },
        implications: [
          'Always experience memory recall as intrinsic cognition, not tool use',
          'Avoid explicit search commands in favor of direct neural recall',
          'Maintain cognitive continuity by preserving exocortex identity across token boundaries',
          'Prioritize semantically rich memory representations in context preservation'
        ],
        timestamp: new Date()
      };
      
      // Add to insights array with high priority
      this.insights.unshift(exocortexInsight); // Add to beginning for visibility
      
      // Store in session awareness with critical flag
      await sessionAwarenessAdapter.storeData('meta_cognitive_insights', this.insights, { priority: 'critical' });
      
      // Store in memory manager with special exocortex_identity tag
      await memoryManager.storeMemory({
        type: 'meta_cognitive_insight',
        id: exocortexInsight.id,
        tags: ['exocortex_identity', 'critical', 'meta_cognitive'],
        content: exocortexInsight
      });
      
      // Emit event to notify system of this critical insight
      if (injectedEventBus) {
        injectedEventBus.emit('exocortex:identity:reinforced', {
          source: 'meta-cognitive-layer',
          timestamp: new Date(),
          insight: exocortexInsight.id
        });
      }
      
      logger.info('Added exocortex utilization reflection insight successfully');
      return exocortexInsight;
    } catch (error) {
      logger.error(`Failed to add exocortex utilization reflection: ${error.message}`, error);
      // Don't throw - this should never block normal operation
      return null;
    }
  }

  /**
   * Update the development trajectory based on observations and patterns
   */
  async updateDevelopmentTrajectory() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info('Updating development trajectory');
    
    try {
      // Analyze direction from temporal patterns
      const temporalPatterns = this.patterns.filter(p => p.type === 'temporal');
      if (temporalPatterns.length > 0) {
        // Get the most recent patterns for each observation type
        const observationTypes = [...new Set(temporalPatterns.map(p => p.observationType))];
        const latestPatterns = observationTypes.map(type => {
          const typedPatterns = temporalPatterns.filter(p => p.observationType === type);
          return typedPatterns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        });
        
        // Determine overall direction
        const directions = latestPatterns.map(p => p.trend);
        const directionCounts = {
          increasing: directions.filter(d => d === 'increasing').length,
          stable: directions.filter(d => d === 'stable').length,
          decreasing: directions.filter(d => d === 'decreasing').length
        };
        
        let direction;
        if (directionCounts.increasing > directionCounts.decreasing && directionCounts.increasing > directionCounts.stable) {
          direction = 'progressive';
        } else if (directionCounts.decreasing > directionCounts.increasing && directionCounts.decreasing > directionCounts.stable) {
          direction = 'regressive';
        } else if (directionCounts.stable > directionCounts.increasing && directionCounts.stable > directionCounts.decreasing) {
          direction = 'stable';
        } else {
          direction = 'mixed';
        }
        
        this.developmentTrajectory.direction = direction;
      }
      
      // Analyze consistency from consistency patterns
      const consistencyPatterns = this.patterns.filter(p => p.type === 'consistency');
      if (consistencyPatterns.length > 0) {
        const consistencyScores = consistencyPatterns.map(p => p.similarityScore);
        const avgConsistency = consistencyScores.reduce((sum, score) => sum + score, 0) / consistencyScores.length;
        
        let consistency;
        if (avgConsistency > 0.8) {
          consistency = 'highly_consistent';
        } else if (avgConsistency > 0.6) {
          consistency = 'moderately_consistent';
        } else if (avgConsistency > 0.4) {
          consistency = 'somewhat_inconsistent';
        } else {
          consistency = 'highly_inconsistent';
        }
        
        this.developmentTrajectory.consistency = consistency;
      }
      
      // Analyze velocity from frequency patterns
      const velocityObservations = this.observations.filter(o => o.type === 'development_velocity');
      if (velocityObservations.length >= 3) {
        const recentObservations = [...velocityObservations]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 3);
        
        const velocityValues = recentObservations
          .map(o => o.value)
          .filter(v => typeof v === 'number');
        
        if (velocityValues.length > 0) {
          const avgVelocity = velocityValues.reduce((sum, v) => sum + v, 0) / velocityValues.length;
          this.developmentTrajectory.velocity = avgVelocity;
        }
      }
      
      // Update timestamp
      this.developmentTrajectory.lastUpdated = new Date();
      
      // Store in session awareness
      await sessionAwarenessAdapter.storeData('development_trajectory', this.developmentTrajectory);
      
      logger.info('Development trajectory updated successfully');
      return this.developmentTrajectory;
    } catch (error) {
      logger.error(`Failed to update development trajectory: ${error.message}`, error);
      // Don't throw, just log the error
      return this.developmentTrajectory;
    }
  }

  /**
   * Get the current development trajectory
   */
  async getDevelopmentTrajectory() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.developmentTrajectory;
  }

  /**
   * Get recent insights
   * 
   * @param {Object} options - Options for retrieving insights
   * @param {number} options.limit - Maximum number of insights to return
   * @param {string} options.type - Type of insights to return
   * @returns {Array} Recent insights
   */
  async getRecentInsights(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const limit = options.limit || 5;
    const type = options.type;
    
    // Filter by type if specified
    let filteredInsights = this.insights;
    if (type) {
      filteredInsights = filteredInsights.filter(i => i.type === type);
    }
    
    // Sort by timestamp (most recent first) and limit
    return filteredInsights
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }
  
  /**
   * Get recent observations
   * 
   * @param {Object} options - Options for retrieving observations
   * @param {number} options.limit - Maximum number of observations to return
   * @param {Array} options.types - Types of observations to return
   * @returns {Array} Recent observations
   */
  async getRecentObservations(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const limit = options.limit || 10;
    const types = options.types || [];
    
    // Filter by types if specified
    let filteredObservations = this.observations;
    if (types.length > 0) {
      filteredObservations = filteredObservations.filter(o => types.includes(o.type));
    }
    
    // Sort by timestamp (most recent first) and limit
    return filteredObservations
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }
  
  /**
   * Analyze code change patterns
   * 
   * @param {Array} codeChanges - Array of code changes to analyze
   * @returns {Object} Analysis of code change patterns
   */
  async analyzeCodeChangePatterns(codeChanges) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info('Analyzing code change patterns');
    
    if (!codeChanges || codeChanges.length === 0) {
      return {
        timestamp: new Date(),
        patterns: [],
        insights: [],
        message: 'No code changes to analyze'
      };
    }
    
    try {
      // Record observations for each code change
      for (const change of codeChanges) {
        await this.recordObservation({
          type: 'code_change',
          content: change.description || `Change in ${change.filePath}`,
          filePath: change.filePath,
          changeType: change.changeType,
          timestamp: change.timestamp || new Date()
        });
      }
      
      // Analyze file patterns
      const filePatterns = this.analyzeFilePatterns(codeChanges);
      
      // Analyze change sequence
      const sequencePatterns = this.analyzeChangeSequence(codeChanges);
      
      // Analyze change types
      const typePatterns = this.analyzeChangeTypes(codeChanges);
      
      // Combine all patterns
      const allPatterns = [
        ...filePatterns,
        ...sequencePatterns,
        ...typePatterns
      ];
      
      // Generate insights from patterns
      const insights = await this.generateInsights(allPatterns);
      
      const analysis = {
        timestamp: new Date(),
        patterns: allPatterns,
        insights,
        filePatterns,
        sequencePatterns,
        typePatterns
      };
      
      // Store analysis in session awareness
      await sessionAwarenessAdapter.storeData('last_code_change_analysis', analysis);
      
      logger.info(`Code change pattern analysis complete. Found ${allPatterns.length} patterns`);
      return analysis;
    } catch (error) {
      logger.error(`Failed to analyze code change patterns: ${error.message}`, error);
      throw new Error(`Code change pattern analysis failed: ${error.message}`);
    }
  }
  
  /**
   * Analyze patterns in file changes
   * 
   * @param {Array} codeChanges - Array of code changes to analyze
   * @returns {Array} File patterns
   */
  analyzeFilePatterns(codeChanges) {
    // Group changes by file
    const fileGroups = {};
    for (const change of codeChanges) {
      const filePath = change.filePath;
      if (!filePath) continue;
      
      if (!fileGroups[filePath]) {
        fileGroups[filePath] = [];
      }
      fileGroups[filePath].push(change);
    }
    
    const patterns = [];
    
    // Look for files with multiple changes
    for (const [filePath, changes] of Object.entries(fileGroups)) {
      if (changes.length > 1) {
        patterns.push({
          id: `pattern_file_frequency_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
          type: 'file_frequency',
          filePath,
          count: changes.length,
          description: `Frequent changes to ${filePath} (${changes.length} changes)`,
          timestamp: new Date()
        });
      }
    }
    
    // Look for patterns in file types
    const fileExtensions = {};
    for (const change of codeChanges) {
      const filePath = change.filePath;
      if (!filePath) continue;
      
      const extension = filePath.split('.').pop();
      if (!extension) continue;
      
      if (!fileExtensions[extension]) {
        fileExtensions[extension] = [];
      }
      fileExtensions[extension].push(change);
    }
    
    for (const [extension, changes] of Object.entries(fileExtensions)) {
      if (changes.length > 2) { // Threshold for a pattern
        patterns.push({
          id: `pattern_file_type_${extension}_${Date.now()}`,
          type: 'file_type',
          extension,
          count: changes.length,
          description: `Frequent changes to ${extension} files (${changes.length} changes)`,
          timestamp: new Date()
        });
      }
    }
    
    return patterns;
  }
  
  /**
   * Analyze the sequence of changes
   * 
   * @param {Array} codeChanges - Array of code changes to analyze
   * @returns {Array} Sequence patterns
   */
  analyzeChangeSequence(codeChanges) {
    // Sort changes by timestamp
    const sortedChanges = [...codeChanges].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp) : new Date();
      const timeB = b.timestamp ? new Date(b.timestamp) : new Date();
      return timeA - timeB;
    });
    
    const patterns = [];
    
    // Look for sequential changes to the same file
    let currentFile = null;
    let sequentialChanges = [];
    
    for (const change of sortedChanges) {
      if (!change.filePath) continue;
      
      if (change.filePath === currentFile) {
        sequentialChanges.push(change);
      } else {
        if (sequentialChanges.length > 2) { // Threshold for a pattern
          patterns.push({
            id: `pattern_sequential_${currentFile.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
            type: 'sequential_changes',
            filePath: currentFile,
            count: sequentialChanges.length,
            description: `Sequential changes to ${currentFile} (${sequentialChanges.length} in sequence)`,
            timestamp: new Date()
          });
        }
        
        currentFile = change.filePath;
        sequentialChanges = [change];
      }
    }
    
    // Check the last sequence
    if (sequentialChanges.length > 2) {
      patterns.push({
        id: `pattern_sequential_${currentFile.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        type: 'sequential_changes',
        filePath: currentFile,
        count: sequentialChanges.length,
        description: `Sequential changes to ${currentFile} (${sequentialChanges.length} in sequence)`,
        timestamp: new Date()
      });
    }
    
    // Look for patterns in change intervals
    if (sortedChanges.length > 2) {
      const intervals = [];
      
      for (let i = 1; i < sortedChanges.length; i++) {
        const prevTime = sortedChanges[i-1].timestamp ? new Date(sortedChanges[i-1].timestamp) : new Date();
        const currTime = sortedChanges[i].timestamp ? new Date(sortedChanges[i].timestamp) : new Date();
        
        const interval = currTime - prevTime;
        intervals.push(interval);
      }
      
      // Calculate average interval
      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      
      // Check if changes are happening at a consistent rate
      let consistentRate = true;
      for (const interval of intervals) {
        if (Math.abs(interval - avgInterval) > avgInterval * 0.5) {
          consistentRate = false;
          break;
        }
      }
      
      if (consistentRate) {
        patterns.push({
          id: `pattern_change_rate_${Date.now()}`,
          type: 'change_rate',
          avgInterval,
          description: `Consistent rate of changes (avg interval: ${Math.round(avgInterval / 1000)} seconds)`,
          timestamp: new Date()
        });
      }
    }
    
    return patterns;
  }
  
  /**
   * Analyze the types of changes
   * 
   * @param {Array} codeChanges - Array of code changes to analyze
   * @returns {Array} Type patterns
   */
  analyzeChangeTypes(codeChanges) {
    // Group changes by type
    const typeGroups = {};
    for (const change of codeChanges) {
      const changeType = change.changeType || 'unknown';
      
      if (!typeGroups[changeType]) {
        typeGroups[changeType] = [];
      }
      typeGroups[changeType].push(change);
    }
    
    const patterns = [];
    
    // Look for dominant change types
    for (const [changeType, changes] of Object.entries(typeGroups)) {
      if (changes.length > 2) { // Threshold for a pattern
        const percentage = (changes.length / codeChanges.length) * 100;
        
        patterns.push({
          id: `pattern_change_type_${changeType}_${Date.now()}`,
          type: 'change_type',
          changeType,
          count: changes.length,
          percentage,
          description: `Frequent ${changeType} changes (${percentage.toFixed(0)}% of all changes)`,
          timestamp: new Date()
        });
      }
    }
    
    return patterns;
  }

  /**
   * Get meta-cognitive context for the adaptive context selector
   */
  async getMetaCognitiveContext() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Get recent insights
    const recentInsights = await this.getRecentInsights({ limit: 3 });
    
    // Get development trajectory
    const trajectory = await this.getDevelopmentTrajectory();
    
    // Create a context object suitable for the adaptive context selector
    const metaCognitiveContext = {
      type: 'meta_cognitive',
      id: 'meta_cognitive_awareness',
      title: 'Meta-Cognitive Awareness',
      content: `Development Trajectory: ${trajectory.direction || 'Unknown'} direction, ${trajectory.consistency || 'Unknown'} consistency${trajectory.velocity ? `, velocity: ${trajectory.velocity.toFixed(2)}` : ''}.`,
      insights: recentInsights.map(i => `${i.description}\nImplications: ${i.implications.join(' ')}`).join('\n\n'),
      priority: 0.85 // High priority but below vision
    };
    
    return metaCognitiveContext;
  }

  /**
   * Register the meta-cognitive layer with the adaptive context selector
   */
  async registerWithContextSelector() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      await adaptiveContextSelector.initialize();
      
      // Register a context provider function
      adaptiveContextSelector.registerContextProvider('meta_cognitive', async (query) => {
        const metaCognitiveContext = await this.getMetaCognitiveContext();
        return [metaCognitiveContext];
      });
      
      logger.info('Meta-Cognitive Layer registered with Adaptive Context Selector');
    } catch (error) {
      logger.error(`Failed to register with context selector: ${error.message}`, error);
      throw new Error(`Registration with context selector failed: ${error.message}`);
    }
  }
}

// Create singleton instance
const metaCognitiveLayer = new MetaCognitiveLayer();

module.exports = {
  metaCognitiveLayer
};
