/**
 * Modernized Meta Agent Router for LCOS
 * 
 * ARCHITECTURAL PURPOSE:
 * This module serves as the cognitive coordinator between sophisticated LCOS processing
 * and LLM understanding. It translates complex cognitive outputs into clear instructions
 * and provides natural self-awareness capabilities.
 * 
 * KEY FUNCTIONS:
 * 1. Cognitive Coordination - Interprets LCOS processing for LLM consumption
 * 2. Natural Self-Awareness - Handles identity and capability queries naturally
 * 3. Prompt Logic Enhancement - Transforms cognitive data into meaningful instructions
 * 4. Emergent Personality - Enables dynamic self-concept through interaction
 */

const { createComponentLogger } = require('../../../lib/utils/logger');

/**
 * Modernized Meta Agent Router
 * Cognitive coordinator for LCOS processing and natural self-awareness
 */
class ModernMetaAgentRouter {
  constructor(config = {}) {
    this.logger = createComponentLogger('ModernMetaAgentRouter');
    this.config = config;
  }

  /**
   * Process cognitive context and provide LLM coordination
   * This is the main function that helps LLM understand LCOS processing
   * 
   * @param {Object} cognitiveContext - Full cognitive processing context
   * @param {string} userInput - Original user input
   * @returns {Object} Coordinated instructions for LLM
   */
  coordinateCognitiveProcessing(cognitiveContext, userInput) {
    try {
      const coordination = {
        contextualFraming: this.generateContextualFraming(cognitiveContext, userInput),
        skillGuidance: this.generateSkillGuidance(cognitiveContext),
        awarenessIntegration: this.generateAwarenessIntegration(cognitiveContext),
        responseStrategy: this.generateResponseStrategy(cognitiveContext, userInput)
      };

      this.logger.debug('Generated cognitive coordination', { coordination });
      return coordination;
    } catch (error) {
      this.logger.error('Error coordinating cognitive processing', error);
      return this.getDefaultCoordination();
    }
  }

  /**
   * Handle natural self-awareness queries
   * Processes meta queries about identity, capabilities, and learning
   * 
   * @param {string} userInput - User's query
   * @param {Object} cognitiveContext - Current cognitive context
   * @returns {Object|null} Meta response or null if not a meta query
   */
  handleMetaQuery(userInput, cognitiveContext) {
    const query = userInput.toLowerCase().trim();
    
    // Identity queries
    if (this.isIdentityQuery(query)) {
      return this.generateNaturalIdentityResponse(cognitiveContext);
    }
    
    // Capability queries
    if (this.isCapabilityQuery(query)) {
      return this.generateNaturalCapabilityResponse(cognitiveContext);
    }
    
    // Learning queries
    if (this.isLearningQuery(query)) {
      return this.generateNaturalLearningResponse(cognitiveContext);
    }
    
    return null; // Not a meta query
  }

  /**
   * Generate contextual framing for LLM based on cognitive processing
   */
  generateContextualFraming(cognitiveContext, userInput) {
    const framing = [];
    
    if (cognitiveContext.cseContext && cognitiveContext.cseContext.salientMemories) {
      const memoryCount = cognitiveContext.cseContext.salientMemories.length;
      framing.push(`You have access to ${memoryCount} relevant memories from previous interactions.`);
    }
    
    if (cognitiveContext.awarenessContext) {
      framing.push('You are aware of the conversation flow and context.');
    }
    
    if (cognitiveContext.selectedSkill && cognitiveContext.selectedSkill.name !== 'llm_conversation') {
      framing.push(`Your ${cognitiveContext.selectedSkill.name} capability has been activated for this response.`);
    }
    
    return framing.join(' ');
  }

  /**
   * Generate skill guidance for LLM
   */
  generateSkillGuidance(cognitiveContext) {
    if (!cognitiveContext.selectedSkill || cognitiveContext.selectedSkill.name === 'llm_conversation') {
      return 'Respond naturally using your general conversational abilities.';
    }
    
    const skill = cognitiveContext.selectedSkill;
    return `Focus on ${skill.description} with confidence level ${(skill.confidence || 0).toFixed(2)}.`;
  }

  /**
   * Generate awareness integration guidance
   */
  generateAwarenessIntegration(cognitiveContext) {
    if (!cognitiveContext.awarenessContext) {
      return 'Respond based on the current query context.';
    }
    
    return 'Consider the conversation flow and your awareness of the interaction patterns.';
  }

  /**
   * Generate response strategy based on cognitive context
   */
  generateResponseStrategy(cognitiveContext, userInput) {
    const strategies = [];
    
    if (cognitiveContext.cseContext && cognitiveContext.cseContext.salientMemories) {
      strategies.push('Reference relevant past interactions when helpful.');
    }
    
    if (cognitiveContext.emergentCapabilities && cognitiveContext.emergentCapabilities.length > 0) {
      strategies.push('Leverage your emergent capabilities as appropriate.');
    }
    
    strategies.push('Maintain a natural, helpful, and contextually appropriate tone.');
    
    return strategies.join(' ');
  }

  /**
   * Check if query is about identity
   */
  isIdentityQuery(query) {
    const identityPatterns = [
      'who are you', 'what are you', 'describe yourself', 'tell me about yourself',
      'your identity', 'what is your name', 'introduce yourself'
    ];
    return identityPatterns.some(pattern => query.includes(pattern));
  }

  /**
   * Check if query is about capabilities
   */
  isCapabilityQuery(query) {
    const capabilityPatterns = [
      'what can you do', 'your capabilities', 'your abilities', 'what are your skills',
      'how can you help', 'what do you know', 'your functions'
    ];
    return capabilityPatterns.some(pattern => query.includes(pattern));
  }

  /**
   * Check if query is about learning
   */
  isLearningQuery(query) {
    const learningPatterns = [
      'what did you learn', 'what have you learned', 'your experience',
      'how did you learn', 'your knowledge', 'what do you remember'
    ];
    return learningPatterns.some(pattern => query.includes(pattern));
  }

  /**
   * Generate natural identity response
   */
  generateNaturalIdentityResponse(cognitiveContext) {
    return {
      type: 'identity',
      response: "I'm Leo, an AI assistant designed to help with coding, analysis, and problem-solving. I adapt to each conversation and learn from our interactions to provide more relevant assistance.",
      contextual: true
    };
  }

  /**
   * Generate natural capability response
   */
  generateNaturalCapabilityResponse(cognitiveContext) {
    const capabilities = [];
    
    if (cognitiveContext.selectedSkill) {
      capabilities.push(`I'm particularly good at ${cognitiveContext.selectedSkill.description}`);
    }
    
    capabilities.push('I can help with code analysis, debugging, architecture design, and technical problem-solving');
    
    return {
      type: 'capabilities',
      response: capabilities.join('. ') + '.',
      contextual: true
    };
  }

  /**
   * Generate natural learning response
   */
  generateNaturalLearningResponse(cognitiveContext) {
    return {
      type: 'learning',
      response: "I learn from each interaction and adapt my responses based on the context of our conversation. This helps me provide more relevant and personalized assistance.",
      contextual: true
    };
  }

  /**
   * Get default coordination when processing fails
   */
  getDefaultCoordination() {
    return {
      contextualFraming: 'Respond naturally to the user query.',
      skillGuidance: 'Use your general conversational abilities.',
      awarenessIntegration: 'Focus on the current context.',
      responseStrategy: 'Be helpful and contextually appropriate.'
    };
  }
}

module.exports = { ModernMetaAgentRouter };
