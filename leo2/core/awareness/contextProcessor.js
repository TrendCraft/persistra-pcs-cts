// leo2/core/awareness/contextProcessor.js
class ContextProcessor {
  constructor({ memoryGraph, embeddingsService }) {
    this.memoryGraph = memoryGraph;
    this.embeddingsService = embeddingsService;
  }

  async processFileChange(filePath, changeType) {
    // Update memory graph, and optionally cache file diff/embedding
    await this.memoryGraph.updateFile(filePath, changeType);
    // Optionally: tag or flag as salient
  }

  /**
   * Generate awareness context for conversation flow
   * @param {Object} params - Context generation parameters
   * @param {string} params.userInput - Current user input
   * @param {string} params.sessionId - Session identifier
   * @param {Array} params.interactionHistory - Previous interactions
   * @param {number} params.timestamp - Current timestamp
   * @returns {Promise<string>} Generated awareness context
   */
  async generateContext({ userInput, sessionId, interactionHistory = [], timestamp }) {
    try {
      // Generate contextual awareness information
      const contextElements = [];
      
      // Add session continuity context
      if (sessionId) {
        contextElements.push(`Session: ${sessionId}`);
      }
      
      // Add interaction flow context
      if (interactionHistory.length > 0) {
        const recentInteractions = interactionHistory.slice(-3); // Last 3 interactions
        contextElements.push(`Recent interaction count: ${recentInteractions.length}`);
        
        // Analyze interaction patterns
        const { createComponentLogger } = require('../../../lib/utils/logger');
        const { SESSION_ID_KEY } = require('../constants/session');
        const avgResponseTime = recentInteractions.reduce((sum, interaction) => {
          return sum + (interaction.responseTime || 0);
        }, 0) / recentInteractions.length;
        
        if (avgResponseTime > 0) {
          contextElements.push(`Avg response time: ${avgResponseTime.toFixed(2)}ms`);
        }
      }
      
      // Add temporal context
      const timeContext = new Date(timestamp).toISOString();
      contextElements.push(`Timestamp: ${timeContext}`);
      
      // Add input analysis context
      if (userInput) {
        const inputLength = userInput.length;
        const inputType = this.analyzeInputType(userInput);
        contextElements.push(`Input: ${inputLength} chars, type: ${inputType}`);
      }
      
      return contextElements.join(' | ');
      
    } catch (error) {
      console.warn('[ContextProcessor] Error generating context:', error);
      return `Context generation failed: ${error.message}`;
    }
  }
  
  /**
   * Analyze the type of user input
   * @param {string} input - User input to analyze
   * @returns {string} Input type classification
   */
  analyzeInputType(input) {
    if (!input) return 'empty';
    
    // Simple heuristic-based classification
    if (input.includes('?')) return 'question';
    if (input.toLowerCase().includes('remember') || input.toLowerCase().includes('memorize')) return 'memory_command';
    if (input.toLowerCase().includes('file') || /\.(js|py|md|txt|json)/.test(input)) return 'file_request';
    if (input.length < 20) return 'short_command';
    if (input.length > 200) return 'long_input';
    
    return 'statement';
  }
}

module.exports = ContextProcessor;
