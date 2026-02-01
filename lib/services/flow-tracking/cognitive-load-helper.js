/**
 * Cognitive Load Helper
 * 
 * This helper module is responsible for estimating cognitive load based on
 * multiple factors including file access patterns, context switches,
 * conversation complexity, and code complexity.
 * 
 * It works closely with the Flow Tracking Service Layer to provide
 * cognitive load estimates for flow states.
 */

const path = require('path');
const fs = require('fs');

/**
 * Cognitive Load Helper
 */
class CognitiveLoadHelper {
  /**
   * Create a new Cognitive Load Helper instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    // Technical terms dictionary for complexity estimation
    this.technicalTerms = new Set([
      'algorithm', 'api', 'async', 'await', 'backend', 'bug', 'cache', 'callback', 'class', 'component',
      'database', 'debug', 'dependency', 'deploy', 'endpoint', 'error', 'exception', 'framework', 'frontend',
      'function', 'git', 'http', 'interface', 'json', 'library', 'memory', 'method', 'module', 'object',
      'parameter', 'promise', 'protocol', 'query', 'recursion', 'refactor', 'regex', 'repository', 'request',
      'response', 'rest', 'runtime', 'schema', 'scope', 'server', 'service', 'socket', 'state', 'syntax',
      'thread', 'token', 'transaction', 'type', 'variable', 'websocket', 'workflow'
    ]);
    
    // Cognitive load history for smoothing
    this.cognitiveLoadHistory = [];
  }
  
  /**
   * Update configuration
   * @param {Object} newConfig - New configuration object
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Estimate cognitive load based on multiple factors with time-weighted averaging
   * @param {Object} params - Parameters for estimation
   * @returns {Promise<Object>} Estimated cognitive load details
   */
  async estimateCognitiveLoad(params = {}) {
    try {
      const {
        recentFileAccesses = [],
        recentContextSwitches = [],
        currentFlowState = {},
        currentFlowSession = {}
      } = params;
      
      // Default thresholds from config
      const highThreshold = this.config.COGNITIVE_LOAD_THRESHOLD_HIGH || 0.7;
      const mediumThreshold = this.config.COGNITIVE_LOAD_THRESHOLD_MEDIUM || 0.4;
      const smoothingFactor = this.config.COGNITIVE_LOAD_SMOOTHING_FACTOR || 0.8;
      
      // Calculate individual cognitive load factors
      const fileSaveFrequencyLoad = this.calculateFileSaveFrequencyLoad(recentFileAccesses);
      const contextSwitchingLoad = this.calculateContextSwitchingLoad(recentContextSwitches);
      const conversationComplexityLoad = await this.calculateConversationComplexityLoad(currentFlowSession);
      const codeComplexityLoad = await this.calculateCodeComplexityLoad(recentFileAccesses);
      
      // Calculate weighted average based on config weights
      const weights = this.config.COGNITIVE_LOAD_INDICATORS || {
        FILE_SAVE_FREQUENCY: { weight: 0.3 },
        CONTEXT_SWITCHING: { weight: 0.25 },
        CONVERSATION_COMPLEXITY: { weight: 0.25 },
        CODE_COMPLEXITY: { weight: 0.2 }
      };
      
      // Calculate raw cognitive load
      const rawLoad = (
        (fileSaveFrequencyLoad * (weights.FILE_SAVE_FREQUENCY?.weight || 0.3)) +
        (contextSwitchingLoad * (weights.CONTEXT_SWITCHING?.weight || 0.25)) +
        (conversationComplexityLoad * (weights.CONVERSATION_COMPLEXITY?.weight || 0.25)) +
        (codeComplexityLoad * (weights.CODE_COMPLEXITY?.weight || 0.2))
      );
      
      // Apply exponential smoothing if we have history
      let smoothedLoad = rawLoad;
      if (this.cognitiveLoadHistory.length > 0) {
        const lastLoad = this.cognitiveLoadHistory[this.cognitiveLoadHistory.length - 1].load;
        smoothedLoad = (smoothingFactor * lastLoad) + ((1 - smoothingFactor) * rawLoad);
      }
      
      // Add to history
      this.cognitiveLoadHistory.push({
        timestamp: Date.now(),
        raw: rawLoad,
        load: smoothedLoad,
        details: {
          fileSaveFrequency: fileSaveFrequencyLoad,
          contextSwitching: contextSwitchingLoad,
          conversationComplexity: conversationComplexityLoad,
          codeComplexity: codeComplexityLoad
        }
      });
      
      // Limit history size
      if (this.cognitiveLoadHistory.length > 100) {
        this.cognitiveLoadHistory = this.cognitiveLoadHistory.slice(-100);
      }
      
      // Determine load level
      let loadLevel = 'medium';
      if (smoothedLoad >= highThreshold) {
        loadLevel = 'high';
      } else if (smoothedLoad < mediumThreshold) {
        loadLevel = 'low';
      }
      
      return {
        loadLevel,
        rawLoad,
        smoothedLoad,
        details: {
          fileSaveFrequency: fileSaveFrequencyLoad,
          contextSwitching: contextSwitchingLoad,
          conversationComplexity: conversationComplexityLoad,
          codeComplexity: codeComplexityLoad
        }
      };
    } catch (error) {
      this.logger.error(`Error estimating cognitive load: ${error.message}`);
      return {
        loadLevel: 'medium', // Default to medium on error
        error: error.message
      };
    }
  }
  
  /**
   * Calculate cognitive load based on file save frequency
   * @param {Array} recentFileAccesses - Recent file accesses
   * @returns {number} Load factor (0-1)
   * @private
   */
  calculateFileSaveFrequencyLoad(recentFileAccesses = []) {
    try {
      const config = this.config.COGNITIVE_LOAD_INDICATORS?.FILE_SAVE_FREQUENCY || {
        timeWindow: 5 * 60 * 1000, // 5 minutes
        highThreshold: 5, // saves in time window
        lowThreshold: 2
      };
      
      // Filter file accesses to only include saves within the time window
      const now = Date.now();
      const timeWindow = config.timeWindow;
      const saveEvents = recentFileAccesses.filter(access => 
        access.eventType === 'saved' && 
        (now - access.timestamp) <= timeWindow
      );
      
      // Count save events
      const saveCount = saveEvents.length;
      
      // Calculate load factor (0-1) based on thresholds
      let loadFactor = 0;
      if (saveCount >= config.highThreshold) {
        loadFactor = 1.0;
      } else if (saveCount <= config.lowThreshold) {
        loadFactor = 0.0;
      } else {
        // Linear interpolation between low and high thresholds
        loadFactor = (saveCount - config.lowThreshold) / 
          (config.highThreshold - config.lowThreshold);
      }
      
      return loadFactor;
    } catch (error) {
      this.logger.error(`Error calculating file save frequency load: ${error.message}`);
      return 0.5; // Default to medium load on error
    }
  }
  
  /**
   * Calculate cognitive load based on context switching
   * @param {Array} recentContextSwitches - Recent context switches
   * @returns {number} Load factor (0-1)
   * @private
   */
  calculateContextSwitchingLoad(recentContextSwitches = []) {
    try {
      const config = this.config.COGNITIVE_LOAD_INDICATORS?.CONTEXT_SWITCHING || {
        timeWindow: 15 * 60 * 1000, // 15 minutes
        highThreshold: 4, // switches in time window
        lowThreshold: 1
      };
      
      // Filter context switches within the time window
      const now = Date.now();
      const timeWindow = config.timeWindow;
      const recentSwitches = recentContextSwitches.filter(cs => 
        (now - cs.timestamp) <= timeWindow
      );
      
      // Count context switches
      const switchCount = recentSwitches.length;
      
      // Calculate load factor (0-1) based on thresholds
      let loadFactor = 0;
      if (switchCount >= config.highThreshold) {
        loadFactor = 1.0;
      } else if (switchCount <= config.lowThreshold) {
        loadFactor = 0.0;
      } else {
        // Linear interpolation between low and high thresholds
        loadFactor = (switchCount - config.lowThreshold) / 
          (config.highThreshold - config.lowThreshold);
      }
      
      return loadFactor;
    } catch (error) {
      this.logger.error(`Error calculating context switching load: ${error.message}`);
      return 0.5; // Default to medium load on error
    }
  }
  
  /**
   * Calculate cognitive load based on conversation complexity
   * @param {Object} currentFlowSession - Current flow session
   * @returns {Promise<number>} Load factor (0-1)
   * @private
   */
  async calculateConversationComplexityLoad(currentFlowSession = {}) {
    try {
      const config = this.config.COGNITIVE_LOAD_INDICATORS?.CONVERSATION_COMPLEXITY || {
        timeWindow: 10 * 60 * 1000, // 10 minutes
        complexityFactors: {
          messageLength: 0.4, // weight for message length
          technicalTerms: 0.6  // weight for technical terms
        }
      };
      
      // If no conversations in session, return zero load
      if (!currentFlowSession.conversations || 
          !currentFlowSession.conversations.size) {
        return 0;
      }
      
      // For now, we'll use a simpler approach since we don't have direct access to messages
      // Return a moderate load if there are active conversations
      const conversationCount = currentFlowSession.conversations.size;
      
      // Scale based on number of active conversations (0-3+)
      let loadFactor = Math.min(conversationCount / 3, 1.0);
      
      return loadFactor;
    } catch (error) {
      this.logger.error(`Error calculating conversation complexity load: ${error.message}`);
      return 0.5; // Default to medium load on error
    }
  }
  
  /**
   * Calculate cognitive load based on code complexity
   * @param {Array} recentFileAccesses - Recent file accesses
   * @returns {Promise<number>} Load factor (0-1)
   * @private
   */
  async calculateCodeComplexityLoad(recentFileAccesses = []) {
    try {
      const config = this.config.COGNITIVE_LOAD_INDICATORS?.CODE_COMPLEXITY || {
        factors: {
          fileSize: 0.3, // weight for file size
          syntaxComplexity: 0.7 // weight for syntax complexity
        }
      };
      
      // Get unique files from recent accesses
      const uniqueFiles = new Set();
      recentFileAccesses.forEach(access => {
        if (access.filePath) {
          uniqueFiles.add(access.filePath);
        }
      });
      
      // If no files, return zero load
      if (uniqueFiles.size === 0) {
        return 0;
      }
      
      // Sample up to 3 recent files for complexity analysis
      const filesToAnalyze = Array.from(uniqueFiles).slice(0, 3);
      
      // Calculate complexity for each file
      let totalComplexity = 0;
      let analyzedFiles = 0;
      
      for (const filePath of filesToAnalyze) {
        try {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Calculate file size complexity (larger files are more complex)
            const sizeKB = content.length / 1024;
            const sizeComplexity = Math.min(sizeKB / 100, 1.0); // Files over 100KB are max complexity
            
            // Calculate syntax complexity based on technical terms
            let technicalTermCount = 0;
            const words = content.split(/[^a-zA-Z0-9_$]+/);
            
            for (const word of words) {
              if (this.technicalTerms.has(word.toLowerCase())) {
                technicalTermCount++;
              }
            }
            
            const syntaxComplexity = Math.min(technicalTermCount / 200, 1.0); // Over 200 terms is max complexity
            
            // Weighted complexity
            const fileComplexity = 
              (sizeComplexity * config.factors.fileSize) + 
              (syntaxComplexity * config.factors.syntaxComplexity);
            
            totalComplexity += fileComplexity;
            analyzedFiles++;
          }
        } catch (error) {
          this.logger.debug(`Error analyzing file complexity for ${filePath}: ${error.message}`);
          // Continue with next file
        }
      }
      
      // Calculate average complexity
      const avgComplexity = analyzedFiles > 0 ? totalComplexity / analyzedFiles : 0.5;
      
      return avgComplexity;
    } catch (error) {
      this.logger.error(`Error calculating code complexity load: ${error.message}`);
      return 0.5; // Default to medium load on error
    }
  }
  
  /**
   * Get cognitive load history
   * @param {number} timeWindowMs - Time window in milliseconds
   * @returns {Array} Cognitive load history entries
   */
  getCognitiveLoadHistory(timeWindowMs = 30 * 60 * 1000) {
    try {
      const now = Date.now();
      return this.cognitiveLoadHistory.filter(entry => 
        (now - entry.timestamp) <= timeWindowMs
      );
    } catch (error) {
      this.logger.error(`Error getting cognitive load history: ${error.message}`);
      return [];
    }
  }
}

module.exports = CognitiveLoadHelper;
