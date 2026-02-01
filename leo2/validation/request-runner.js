/**
 * Request Runner - AVS Harness Component
 * 
 * Executes requests through the ACTUAL orchestrator pipeline used by the UI.
 * This ensures pipeline fidelity - tests use the same code path as production.
 * 
 * Critical: NO MOCKS. This calls orchestrator.processUserInput() directly,
 * ensuring all middleware, context injection, and processing is identical
 * to what the UI experiences.
 */

class RequestRunner {
  constructor(orchestrator) {
    if (!orchestrator) {
      throw new Error('RequestRunner requires an orchestrator instance');
    }
    this.orchestrator = orchestrator;
  }

  /**
   * Execute a user request through the actual orchestrator pipeline
   * 
   * @param {string} userInput - User's input text
   * @param {Object} options - Request options
   * @param {string} options.sessionId - Session ID for conversation continuity
   * @param {Object} options.userContext - Additional user context
   * @returns {Promise<Object>} Response from orchestrator
   */
  async executeRequest(userInput, options = {}) {
    const {
      sessionId = `avs_session_${Date.now()}`,
      userContext = {}
    } = options;

    try {
      // Call the ACTUAL orchestrator method used by the UI
      // processUserInput signature: (text, opts)
      // CRITICAL: Pass userContext as nested object to preserve policies
      const result = await this.orchestrator.processUserInput(userInput, {
        sessionId,
        userContext
      });

      return {
        success: true,
        response: result.llmResponse || result.response || '',
        fullResult: result,
        sessionId
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        sessionId
      };
    }
  }

  /**
   * Execute multiple requests in sequence (simulating a conversation)
   * 
   * @param {Array<string>} inputs - Array of user inputs
   * @param {string} sessionId - Session ID to maintain conversation context
   * @returns {Promise<Array<Object>>} Array of responses
   */
  async executeSequence(inputs, sessionId = `avs_session_${Date.now()}`) {
    const results = [];

    for (const input of inputs) {
      const result = await this.executeRequest(input, { sessionId });
      results.push(result);

      // Stop sequence if any request fails
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Wait for a specified duration (for simulating time gaps between sessions)
   * 
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { RequestRunner };
