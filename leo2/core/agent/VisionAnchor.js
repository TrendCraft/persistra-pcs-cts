const actResult = await this.actPhase(observeResult, null, planResult, agentState);

// Update VisionAnchor conversation history with both input and output.
// This enables the continue command to include assistant response context.
if (this.visionAnchor && actResult && (actResult.llmResponse || actResult.response)) {
  try {
    const _vaOut = String(actResult.llmResponse || actResult.response || '').trim();
    if (_vaOut) {
      this.visionAnchor.updateConversationHistory(userInput, _vaOut);
      if (typeof _ALE_DEBUG_ON !== 'undefined' && _ALE_DEBUG_ON) {
        console.log('[VISION] Updated conversation history with assistant output');
      }
    }
  } catch (err) {
    if (typeof _ALE_DEBUG_ON !== 'undefined' && _ALE_DEBUG_ON) {
      console.warn('[VISION] Failed to update conversation history:', err && err.message ? err.message : err);
    }
  }
}
