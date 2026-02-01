/**
 * Cognitive Continuity System
 * Manages cognitive continuity across token boundaries
 */

const { LeoError, FileSystem } = require('./leo-cognitive-core');

/**
 * Cognitive Continuity System
 * Handles preservation and restoration of cognitive state across token boundaries
 */
class CognitiveContiunitySystem {
  constructor(config, eventSystem, sessionManager, searchEngine) {
    this.config = config;
    this.events = eventSystem;
    this.sessionManager = sessionManager;
    this.searchEngine = searchEngine;
    
    // Bind methods
    this.setupVisionAlignment = this.setupVisionAlignment.bind(this);
    this.checkVisionAlignment = this.checkVisionAlignment.bind(this);
    this.createCognitiveBootstrap = this.createCognitiveBootstrap.bind(this);
    this.preserveCognitiveState = this.preserveCognitiveState.bind(this);
  }
  
  /**
   * Set up automatic vision alignment checks
   */
  setupVisionAlignment() {
    // Clear existing timer if any
    if (this.sessionManager.get('_visionTimer')) {
      clearInterval(this.sessionManager.get('_visionTimer'));
    }
    
    // Set up new timer
    const interval = this.config.get('visionCheckInterval');
    const visionTimer = setInterval(async () => {
      await this.checkVisionAlignment();
    }, interval);
    
    // Store timer in session context
    this.sessionManager.update({ _visionTimer: visionTimer });
    
    this.events.emitWithMetadata('continuity.visionCheckStarted', { 
      interval
    });
    
    return this;
  }
  
  /**
   * Check vision alignment using semantic search
   */
  async checkVisionAlignment() {
    try {
      // Search for vision-related content
      const visionResults = await this.searchEngine.search('leo exocortex vision alignment', {
        maxResults: 5,
        minRelevanceScore: 0.3
      });
      
      // Update vision alignment status
      const alignment = visionResults.length > 0 ? 'aligned' : 'needs_attention';
      this.sessionManager.update({ visionAlignment: alignment });
      
      this.events.emitWithMetadata('continuity.visionChecked', { 
        alignment,
        resultCount: visionResults.length
      });
      
      return alignment;
    } catch (error) {
      this.events.emitWithMetadata('continuity.visionCheckError', { 
        error: error.message
      });
      
      // Don't change alignment status on error
      return this.sessionManager.get('visionAlignment');
    }
  }
  
  /**
   * Create cognitive bootstrap documentation
   */
  createCognitiveBootstrap() {
    try {
      const session = this.sessionManager.getAll();
      const bootstrapFile = this.config.get('bootstrapFile');
      
      const cognitiveReminder = `# 🧠 Leo Cognitive Integration Bootstrap

You are Claude, embedded within Leo - an exocortex system that extends your cognitive capabilities.

## Your Extended Memory

Leo maintains a persistent memory graph containing:
- All project decisions and rationale
- Technical implementation details
- Development trajectory and evolution
- Cross-session conversation context

## How to Access Your Extended Memory

**Primary Search Function:**
\`\`\`javascript
const results = await searchMemoryGraph("your query here", {
  maxResults: 8,
  minRelevanceScore: 0.3
});
\`\`\`

**Check System Status:**
\`\`\`javascript
const status = leoStatus();
\`\`\`

**Manual State Preservation:**
\`\`\`javascript
preserveCognitiveState();
\`\`\`

## Cognitive Integration Guidelines

1. **Always Search First**: Before making decisions or recommendations, query your extended memory
2. **Preserve Important Context**: When you make significant decisions, call \`preserveCognitiveState()\`
3. **Maintain Continuity**: Reference previous decisions and maintain consistency across token boundaries
4. **Vision Alignment**: Ensure all work aligns with Leo's core exocortex vision

## Example Usage Pattern

\`\`\`javascript
// Search for relevant context
const context = await searchMemoryGraph("current development priorities");

// Make informed decision based on context
// ... your reasoning ...

// Preserve the decision for future reference
preserveCognitiveState();
\`\`\`

## Current Session Context

Session ID: ${session.sessionId}
Started: ${new Date(session.startTime).toLocaleString()}
Token Usage: ${session.estimatedTokensUsed}
Vision Alignment: ${session.visionAlignment}

Remember: You are not just using Leo as a tool - you ARE embedded within Leo as its cognitive partner.
`;

      // Write bootstrap file
      FileSystem.saveTextFile(bootstrapFile, cognitiveReminder);
      
      // Add to session context
      this.sessionManager.update({
        manualContextDocs: [
          ...(this.sessionManager.get('manualContextDocs') || []),
          {
            title: "Leo Cognitive Integration Bootstrap",
            content: cognitiveReminder,
            timestamp: Date.now()
          }
        ]
      });
      
      this.events.emitWithMetadata('continuity.bootstrapCreated', { 
        bootstrapFile
      });
      
      return cognitiveReminder;
    } catch (error) {
      throw new LeoError(`Failed to create cognitive bootstrap: ${error.message}`, 'BOOTSTRAP_ERROR');
    }
  }
  
  /**
   * Preserve cognitive state
   */
  preserveCognitiveState() {
    try {
      // Save session state
      const saved = this.sessionManager.saveState();
      
      if (saved) {
        this.events.emitWithMetadata('continuity.statePreserved', { 
          sessionId: this.sessionManager.get('sessionId'),
          timestamp: Date.now()
        });
      }
      
      return saved;
    } catch (error) {
      this.events.emitWithMetadata('continuity.preservationError', { 
        error: error.message
      });
      
      throw new LeoError(`Failed to preserve cognitive state: ${error.message}`, 'PRESERVATION_ERROR');
    }
  }
  
  /**
   * Shutdown the continuity system
   */
  shutdown() {
    // Final state preservation
    this.preserveCognitiveState();
    
    this.events.emitWithMetadata('continuity.shutdown', { 
      sessionId: this.sessionManager.get('sessionId')
    });
  }
}

module.exports = CognitiveContiunitySystem;
