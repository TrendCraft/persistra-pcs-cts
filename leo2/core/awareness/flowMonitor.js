// leo2/core/awareness/flowMonitor.js
class FlowMonitor {
  constructor() {
    this.currentFlow = 'general';
    this.cognitiveLoad = 0.3;
    this.conversationMetrics = {
      totalInteractions: 0,
      averageResponseTime: 0,
      flowTransitions: [],
      sessionStartTime: Date.now()
    };
  }

  async detectFlow(activity) {
    // Basic: Change flow based on file/query/activity type
    // Placeholder: Just log for now
    console.log('[FlowMonitor] Detected activity:', activity);
    // In future: Update this.currentFlow, notify UnifiedAwarenessService
  }
  
  /**
   * Record conversation event for flow monitoring
   * @param {Object} event - Conversation event
   */
  recordConversationEvent(event) {
    try {
      this.conversationMetrics.totalInteractions++;
      
      // Update flow based on conversation type
      const previousFlow = this.currentFlow;
      this.updateFlowFromConversation(event);
      
      // Record flow transition if changed
      if (previousFlow !== this.currentFlow) {
        this.conversationMetrics.flowTransitions.push({
          from: previousFlow,
          to: this.currentFlow,
          timestamp: event.timestamp || Date.now(),
          trigger: event.type
        });
        console.log(`[FlowMonitor] Flow transition: ${previousFlow} → ${this.currentFlow}`);
      }
      
      // Update cognitive load based on conversation complexity
      this.updateCognitiveLoad(event);
      
    } catch (error) {
      console.warn('[FlowMonitor] Error recording conversation event:', error);
    }
  }
  
  /**
   * Update current flow based on conversation event
   * @param {Object} event - Conversation event
   */
  updateFlowFromConversation(event) {
    if (event.type === 'conversation_input' && event.userInput) {
      const input = event.userInput.toLowerCase();
      
      // Detect flow type from user input patterns
      if (input.includes('code') || input.includes('file') || /\.(js|py|md|txt)/.test(input)) {
        this.currentFlow = 'coding';
      } else if (input.includes('remember') || input.includes('memorize')) {
        this.currentFlow = 'memory_storage';
      } else if (input.includes('?') && input.length > 50) {
        this.currentFlow = 'deep_inquiry';
      } else if (input.length < 20) {
        this.currentFlow = 'quick_interaction';
      } else {
        this.currentFlow = 'general_conversation';
      }
    }
  }
  
  /**
   * Update cognitive load based on conversation complexity
   * @param {Object} event - Conversation event
   */
  updateCognitiveLoad(event) {
    let loadDelta = 0;
    
    if (event.type === 'conversation_input') {
      // Increase load based on input complexity
      const inputLength = event.userInput?.length || 0;
      loadDelta = Math.min(inputLength / 1000, 0.3); // Max 0.3 increase
    } else if (event.type === 'conversation_response') {
      // Decrease load after response (cognitive relief)
      loadDelta = -0.1;
    }
    
    // Update cognitive load with bounds
    this.cognitiveLoad = Math.max(0.1, Math.min(1.0, this.cognitiveLoad + loadDelta));
  }
  
  /**
   * Get current flow metrics summary
   * @returns {Object} Flow metrics
   */
  getFlowMetrics() {
    const sessionDuration = Date.now() - this.conversationMetrics.sessionStartTime;
    
    return {
      currentFlow: this.currentFlow,
      cognitiveLoad: this.cognitiveLoad,
      totalInteractions: this.conversationMetrics.totalInteractions,
      sessionDuration: Math.round(sessionDuration / 1000), // seconds
      flowTransitions: this.conversationMetrics.flowTransitions.length,
      averageInteractionRate: this.conversationMetrics.totalInteractions / (sessionDuration / 60000) // per minute
    };
  }
}

module.exports = FlowMonitor;
