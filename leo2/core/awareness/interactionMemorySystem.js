// leo2/core/awareness/interactionMemorySystem.js
class InteractionMemorySystem {
  constructor({ memoryGraph }) {
    this.memoryGraph = memoryGraph;
    this.conversationBuffer = []; // Buffer for conversation events
    this.maxBufferSize = 10; // Keep last 10 interactions for context
  }

  async recordInteraction(userInput, llmResponse, context) {
    // WEEK 2 DEBUG: Log if recordInteraction is being called
    console.log('[InteractionMemorySystem] [WEEK 2 DEBUG] recordInteraction called');
    console.log('[InteractionMemorySystem] [WEEK 2 DEBUG] userInput:', userInput?.substring(0, 150));
    console.log('[InteractionMemorySystem] [WEEK 2 DEBUG] Has DR-014:', userInput?.includes('DR-014'));
    console.log('[InteractionMemorySystem] [WEEK 2 DEBUG] Has Q7F3:', userInput?.includes('Q7F3'));
    
    // Only store a flat summary of context to prevent recursive bloat
    const flatContextSummary = Array.isArray(context?.memories)
      ? context.memories.map(m => ({
          userInput: m.userInput,
          llmResponse: m.llmResponse,
          timestamp: m.timestamp,
          id: m.id
        }))
      : [];
    const interaction = {
      timestamp: Date.now(),
      userInput,
      llmResponse,
      contextSummary: flatContextSummary,
      flowState: context?.flowState,
      identity: context?.identity,
      sessionId: context?.sessionId // Pass sessionId for Phase 3 cross-session recall
    };
    
    console.log('[InteractionMemorySystem] [WEEK 2 DEBUG] Calling addInteraction...');
    await this.memoryGraph.addInteraction(interaction);
    console.log('[InteractionMemorySystem] [WEEK 2 DEBUG] addInteraction completed');
    
    // Add to conversation buffer for awareness processing
    this.addToConversationBuffer(interaction);
  }
  
  /**
   * Record conversation event with awareness context
   * @param {Object} event - Conversation event
   * @param {string} event.type - Event type (input, response, summary)
   * @param {string} event.content - Event content
   * @param {Object} event.metadata - Event metadata
   */
  async recordConversationEvent(event) {
    try {
      const conversationEvent = {
        type: event.type,
        content: event.content,
        metadata: event.metadata || {},
        timestamp: Date.now(),
        source: 'awareness_system'
      };
      
      // Store as memory with awareness tagging
      if (this.memoryGraph && this.memoryGraph.addMemory) {
        await this.memoryGraph.addMemory(event.content, {
          type: 'conversation_event',
          eventType: event.type,
          source: 'interaction_memory_system',
          timestamp: conversationEvent.timestamp,
          metadata: conversationEvent.metadata
        });
      }
      
      // Add to conversation buffer
      this.addToConversationBuffer(conversationEvent);
      
    } catch (error) {
      console.warn('[InteractionMemorySystem] Failed to record conversation event:', error);
    }
  }
  
  /**
   * Add interaction to conversation buffer for context tracking
   * @param {Object} interaction - Interaction to buffer
   */
  addToConversationBuffer(interaction) {
    this.conversationBuffer.push(interaction);
    
    // Maintain buffer size limit
    if (this.conversationBuffer.length > this.maxBufferSize) {
      this.conversationBuffer = this.conversationBuffer.slice(-this.maxBufferSize);
    }
  }
  
  /**
   * Get recent conversation context for awareness processing
   * @param {number} count - Number of recent interactions to return
   * @returns {Array} Recent conversation interactions
   */
  getRecentConversationContext(count = 5) {
    return this.conversationBuffer.slice(-count);
  }
  
  /**
   * Generate conversation flow summary from buffer
   * @returns {string} Flow summary
   */
  generateConversationFlowSummary() {
    if (this.conversationBuffer.length === 0) {
      return 'No recent conversation activity';
    }
    
    const recentCount = this.conversationBuffer.length;
    const timeSpan = this.conversationBuffer.length > 1 
      ? Date.now() - this.conversationBuffer[0].timestamp 
      : 0;
    
    const avgResponseLength = this.conversationBuffer.reduce((sum, interaction) => {
      return sum + (interaction.llmResponse?.length || 0);
    }, 0) / recentCount;
    
    return `Conversation flow: ${recentCount} interactions over ${Math.round(timeSpan / 1000)}s, avg response: ${Math.round(avgResponseLength)} chars`;
  }
}

module.exports = InteractionMemorySystem;
