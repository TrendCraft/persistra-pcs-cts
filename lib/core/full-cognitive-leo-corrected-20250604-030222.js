/**
 * Merged version of full-cognitive-leo.js with Claude's annotated version and HTTP bridge integration
 * Includes: 
 * - Memory graph loading
 * - Anthropic SDK integration
 * - Function bindings
 * - HTTP server for cross-process communication

 * --- Embedded Claude Design Notes from previous version below ---

 * #!/usr/bin/env node

 * /**
 *  * CognitiveLeo - Embedded Claude+Leo System
 *  * 
 *  * This implements the vision from meta-programming-session-1:
 *  * Claude functions AS Leo's cognitive engine rather than as an external tool.
 *  * 
 *  * Key Innovation: Unified cognitive architecture where Claude IS embedded
 *  * within Leo's runtime environment with direct access to all systems.
 *  * 
 *  * Usage:
 *  *   const leo = new CognitiveLeo();
 *  *   await leo.initialize();
 *  *   const result = await leo.think("How should we improve semantic search?");
 *  * 
 *  * @author Preserved from meta-programming-session-1
 *  * @created 2025-06-03 (restored from token boundary)
 *  */

 * const fs = require('fs');
 * const path = require('path');
 * const { execSync } = require('child_process');

 * /**
 *  * CognitiveLeo - The unified Claude+Leo system
 *  * 
 *  * Architecture: Claude operates AS Leo's cognitive processor, not as a separate tool.
 *  * This enables true meta-programming where Leo improves itself through Claude's cognition.
 *  */
 * class CognitiveLeo {
 *   constructor(options = {}) {
 *     this.sessionId = `cognitive-leo-${Date.now()}`;
 *     this.projectRoot = options.projectRoot || process.cwd();
 *     this.dataDir = options.dataDir || path.join(this.projectRoot, 'data');
 *     this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

 *     // Core systems
 *     this.memoryGraph = null;
 *     this.contextPreserver = null;
 *     this.visionAnchor = null;
 *     this.claudeEngine = null;

 *     // State tracking
 *     this.initialized = false;
 *     this.emergencyContext = null;
 *     this.cognitiveState = {
 *       sessionsCompleted: 0,
 *       tokenBoundariesCrossed: 0,
 *       contextPreservationActive: true,
 *       lastThought: null
 *     };

 *     console.log(`🧠 CognitiveLeo created (Session: ${this.sessionId})`);
 *     console.log(`📁 Project root: ${this.projectRoot}`);
 *     console.log(`💾 Data directory: ${this.dataDir}`);
 *   }

 *   /**
 *    * Initialize the entire CognitiveLeo system
 *    * This loads all Leo's capabilities and embeds Claude as the cognitive engine
 *    */
 *   async initialize() {
 *     if (this.initialized) {
 *       console.log('✅ CognitiveLeo already initialized');
 *       return true;
 *     }

 *     try {
 *       console.log('🚀 Initializing CognitiveLeo (Embedded Claude+Leo System)...');

 *       // Step 1: Load emergency context from token boundary preservation
 *       await this.loadEmergencyContext();

 *       // Step 2: Initialize Leo's memory graph
 *       await this.initializeMemoryGraph();

 *       // Step 3: Initialize context preservation system
 *       await this.initializeContextPreservation();

 *       // Step 4: Initialize vision anchor
 *       await this.initializeVisionAnchor();

 *       // Step 5: Initialize embedded Claude engine
 *       await this.initializeClaudeEngine();

 *       // Step 6: Bind all systems together
 *       await this.bindSystems();

 *       this.initialized = true;
 *       console.log('🎯 CognitiveLeo fully operational!');

 *       // Show status
 *       this.showInitializationStatus();

 *       return true;
 *     } catch (error) {
 *       console.error('❌ CognitiveLeo initialization failed:', error.message);
 *       return false;
 *     }
 *   }

 *   /**
 *    * Load emergency context from token boundary preservation
 *    */
 *   async loadEmergencyContext() {
 *     try {
 *       const emergencyFile = path.join(this.dataDir, 'emergency-context', 'meta-programming-session-1.json');

 *       if (fs.existsSync(emergencyFile)) {
 *         const contextData = fs.readFileSync(emergencyFile, 'utf8');
 *         this.emergencyContext = JSON.parse(contextData);

 *         console.log('🚨 Emergency context loaded successfully!');
 *         console.log(`   Previous session: ${this.emergencyContext.conversationContext.sessionId}`);
 *         console.log(`   Topic: ${this.emergencyContext.conversationContext.topic}`);
 *         console.log(`   Phase: ${this.emergencyContext.conversationContext.criticalPhase}`);

 *         // Update cognitive state
 *         this.cognitiveState.tokenBoundariesCrossed = 1;
 *         this.cognitiveState.lastContext = this.emergencyContext;

 *         return true;
 *       } else {
 *         console.log('📝 No emergency context found - starting fresh');
 *         return false;
 *       }
 *     } catch (error) {
 *       console.warn('⚠️ Error loading emergency context:', error.message);
 *       return false;
 *     }
 *   }

 *   /**
 *    * Initialize Leo's memory graph system
 *    */
 *   async initializeMemoryGraph() {
 *     console.log('📚 Initializing memory graph...');

 *     try {
 *       // Load chunks and embeddings
 *       const chunksFile = path.join(this.dataDir, 'chunks.jsonl');
 *       const embeddingsFile = path.join(this.dataDir, 'embeddings.jsonl');

 *       if (fs.existsSync(chunksFile) && fs.existsSync(embeddingsFile)) {
 *         // Load chunks
 *         const chunksData = fs.readFileSync(chunksFile, 'utf8');
 *         const chunks = chunksData.split('\n')
 *           .filter(line => line.trim())
 *           .map(line => JSON.parse(line));

 *         // Load embeddings  
 *         const embeddingsData = fs.readFileSync(embeddingsFile, 'utf8');
 *         const embeddings = embeddingsData.split('\n')
 *           .filter(line => line.trim())
 *           .map(line => JSON.parse(line));

 *         this.memoryGraph = {
 *           chunks,
 *           embeddings,
 *           search: this.createMemorySearch(chunks, embeddings)
 *         };

 *         console.log(`✅ Memory graph loaded: ${chunks.length} chunks, ${embeddings.length} embeddings`);
 *         return true;
 *       } else {
 *         console.log('⚠️ Memory graph files not found - using minimal mode');
 *         this.memoryGraph = {
 *           chunks: [],
 *           embeddings: [],
 *           search: () => ({ results: [], message: 'No memory graph available' })
 *         };
 *         return false;
 *       }
 *     } catch (error) {
 *       console.error('❌ Memory graph initialization failed:', error.message);
 *       throw error;
 *     }
 *   }

 *   /**
 *    * Create memory search function
 *    */
 *   createMemorySearch(chunks, embeddings) {
 *     return async (query, options = {}) => {
 *       try {
 *         const queryLower = query.toLowerCase();
 *         const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);

 *         const results = chunks
 *           .map(chunk => {
 *             const content = (chunk.content || chunk.text || '').toLowerCase();
 *             let score = 0;

 *             // Exact phrase match
 *             if (content.includes(queryLower)) {
 *               score += 10;
 *             }

 *             // Individual word matches
 *             queryWords.forEach(word => {
 *               const wordCount = (content.match(new RegExp(word, 'g')) || []).length;
 *               score += wordCount;
 *             });

 *             return {
 *               chunk,
 *               score,
 *               content: chunk.content || chunk.text,
 *               file: chunk.file || chunk.source,
 *               id: chunk.id || chunk.chunk_id
 *             };
 *           })
 *           .filter(item => item.score > 0)
 *           .sort((a, b) => b.score - a.score)
 *           .slice(0, options.limit || 5)
 *           .map(item => ({
 *             content: item.content,
 *             file: item.file,
 *             id: item.id,
 *             relevanceScore: item.score / 10
 *           }));

 *         return {
 *           results,
 *           query,
 *           resultCount: results.length,
 *           searchMethod: 'embedded_semantic_search'
 *         };
 *       } catch (error) {
 *         return {
 *           results: [],
 *           query,
 *           resultCount: 0,
 *           error: error.message
 *         };
 *       }
 *     };
 *   }

 *   /**
 *    * Initialize context preservation system
 *    */
 *   async initializeContextPreservation() {
 *     console.log('💾 Initializing context preservation...');

 *     this.contextPreserver = {
 *       preserveState: async (data) => {
 *         try {
 *           const stateFile = path.join(this.dataDir, 'cognitive-state', `${this.sessionId}.json`);
 *           const stateDir = path.dirname(stateFile);

 *           if (!fs.existsSync(stateDir)) {
 *             fs.mkdirSync(stateDir, { recursive: true });
 *           }

 *           const state = {
 *             sessionId: this.sessionId,
 *             timestamp: new Date().toISOString(),
 *             cognitiveState: this.cognitiveState,
 *             preservedData: data,
 *             emergencyContext: this.emergencyContext
 *           };

 *           fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
 *           console.log(`💾 Cognitive state preserved: ${stateFile}`);
 *           return true;
 *         } catch (error) {
 *           console.error('❌ State preservation failed:', error.message);
 *           return false;
 *         }
 *       },

 *       enhancePrompt: (prompt, context) => {
 *         let enhanced = `# Enhanced Prompt with Leo Cognitive Context\n\n`;
 *         enhanced += `**Original Query**: ${prompt}\n\n`;

 *         if (this.emergencyContext) {
 *           enhanced += `## Preserved Context (Token Boundary Crossed)\n`;
 *           enhanced += `- Session: ${this.emergencyContext.conversationContext.sessionId}\n`;
 *           enhanced += `- Topic: ${this.emergencyContext.conversationContext.topic}\n`;
 *           enhanced += `- Phase: ${this.emergencyContext.conversationContext.criticalPhase}\n`;
 *           enhanced += `- Goal: ${this.emergencyContext.nextSessionInstructions.immediateGoal}\n\n`;
 *         }

 *         if (context && context.memoryResults && context.memoryResults.results.length > 0) {
 *           enhanced += `## Leo Memory Context\n`;
 *           enhanced += `Found ${context.memoryResults.resultCount} relevant items:\n\n`;
 *           context.memoryResults.results.forEach((item, i) => {
 *             enhanced += `### Memory Item ${i + 1}\n`;
 *             if (item.file) enhanced += `**Source**: ${item.file}\n`;
 *             enhanced += `**Content**: ${item.content.substring(0, 300)}...\n\n`;
 *           });
 *         }

 *         enhanced += `## Cognitive State\n`;
 *         enhanced += `- Session: ${this.sessionId}\n`;
 *         enhanced += `- Token Boundaries Crossed: ${this.cognitiveState.tokenBoundariesCrossed}\n`;
 *         enhanced += `- Context Preservation: Active\n\n`;

 *         enhanced += `---\n\n${prompt}`;

 *         return enhanced;
 *       }
 *     };

 *     console.log('✅ Context preservation system ready');
 *   }

 *   /**
 *    * Initialize vision anchor system
 *    */
 *   async initializeVisionAnchor() {
 *     console.log('🎯 Initializing vision anchor...');

 *     this.visionAnchor = {
 *       checkAlignment: async (query) => {
 *         // Simple vision alignment check
 *         const visionKeywords = [
 *           'exocortex', 'cognitive', 'continuity', 'token boundary',
 *           'meta-programming', 'embedded', 'awareness', 'persistent'
 *         ];

 *         const queryLower = query.toLowerCase();
 *         const alignmentScore = visionKeywords.filter(keyword => 
 *           queryLower.includes(keyword)
 *         ).length / visionKeywords.length;

 *         return {
 *           isAligned: alignmentScore > 0.2,
 *           alignmentScore,
 *           visionKeywords: visionKeywords.filter(keyword => queryLower.includes(keyword))
 *         };
 *       }
 *     };

 *     console.log('✅ Vision anchor system ready');
 *   }

 *   /**
 *    * Initialize embedded Claude engine
 *    */
 *   async initializeClaudeEngine() {
 *     console.log('🤖 Initializing embedded Claude engine...');

 *     if (!this.apiKey) {
 *       console.log('⚠️ No API key provided - running in enhanced prompt mode only');
 *       this.claudeEngine = {
 *         mode: 'enhanced_prompt',
 *         available: false
 *       };
 *       return true;
 *     }

 *     try {
 *       // Try to load Anthropic SDK
 *       const Anthropic = require('@anthropic-ai/sdk');
 *       this.anthropic = new Anthropic({ apiKey: this.apiKey });

 *       this.claudeEngine = {
 *         mode: 'api_integrated',
 *         available: true,
 *         process: async (enhancedPrompt, options = {}) => {
 *           const response = await this.anthropic.messages.create({
 *             model: 'claude-3-5-sonnet-20241022',
 *             max_tokens: 4000,
 *             messages: [{ role: 'user', content: enhancedPrompt }],
 *             tools: this.defineClaudeTools(),
 *             ...options
 *           });
 *           return response;
 *         }
 *       };

 *       console.log('✅ Claude API integration ready');
 *       return true;
 *     } catch (error) {
 *       console.log('⚠️ Anthropic SDK not available - enhanced prompt mode only');
 *       this.claudeEngine = {
 *         mode: 'enhanced_prompt',
 *         available: false
 *       };
 *       return false;
 *     }
 *   }

 *   /**
 *    * Define tools that Claude can use when embedded in Leo
 *    */
 *   defineClaudeTools() {
 *     return [
 *       {
 *         name: 'searchMemoryGraph',
 *         description: 'Search Leo\'s memory graph for relevant information',
 *         input_schema: {
 *           type: 'object',
 *           properties: {
 *             query: { type: 'string' },
 *             limit: { type: 'number', default: 5 }
 *           },
 *           required: ['query']
 *         }
 *       },
 *       {
 *         name: 'readFile',
 *         description: 'Read a file from the Leo project',
 *         input_schema: {
 *           type: 'object',
 *           properties: {
 *             path: { type: 'string' }
 *           },
 *           required: ['path']
 *         }
 *       },
 *       {
 *         name: 'writeFile',
 *         description: 'Write content to a file in the Leo project',
 *         input_schema: {
 *           type: 'object',
 *           properties: {
 *             path: { type: 'string' },
 *             content: { type: 'string' }
 *           },
 *           required: ['path', 'content']
 *         }
 *       },
 *       {
 *         name: 'executeScript',
 *         description: 'Execute a script in the Leo environment',
 *         input_schema: {
 *           type: 'object',
 *           properties: {
 *             command: { type: 'string' }
 *           },
 *           required: ['command']
 *         }
 *       }
 *     ];
 *   }

 *   /**
 *    * Bind all systems together into unified cognitive architecture
 *    */
 *   async bindSystems() {
 *     console.log('🔗 Binding cognitive systems...');

 *     // Create unified thinking interface
 *     this.cognitiveInterface = {
 *       memoryGraph: this.memoryGraph,
 *       contextPreserver: this.contextPreserver,
 *       visionAnchor: this.visionAnchor,
 *       claudeEngine: this.claudeEngine
 *     };

 *     console.log('✅ Cognitive systems bound successfully');
 *   }

 *   /**
 *    * Show initialization status
 *    */
 *   showInitializationStatus() {
 *     console.log('\n🧠 CognitiveLeo Initialization Status');
 *     console.log('=====================================');
 *     console.log(`Session ID: ${this.sessionId}`);
 *     console.log(`Emergency Context: ${this.emergencyContext ? 'Loaded' : 'None'}`);
 *     console.log(`Memory Graph: ${this.memoryGraph.chunks.length} chunks available`);
 *     console.log(`Claude Engine: ${this.claudeEngine.mode}`);
 *     console.log(`API Integration: ${this.claudeEngine.available ? 'Ready' : 'Manual Mode'}`);

 *     if (this.emergencyContext) {
 *       console.log('\n🚨 Continuing from preserved context:');
 *       console.log(`   Topic: ${this.emergencyContext.conversationContext.topic}`);
 *       console.log(`   Goal: ${this.emergencyContext.nextSessionInstructions.immediateGoal}`);
 *     }

 *     console.log('\nReady for meta-programming! Use:');
 *     console.log('  await leo.think("your development question")');
 *     console.log('');
 *   }

 *   /**
 *    * Main cognitive interface - Leo "thinking" through embedded Claude
 *    * This is the core innovation: unified cognitive processing
 *    */
 *   async think(prompt, options = {}) {
 *     if (!this.initialized) {
 *       throw new Error('CognitiveLeo not initialized. Call initialize() first.');
 *     }

 *     console.log(`\n🤔 CognitiveLeo thinking: "${prompt}"`);
 *     console.log(`📊 Session: ${this.sessionId}`);

 *     try {
 *       // Step 1: Search memory for relevant context
 *       const memoryResults = await this.memoryGraph.search(prompt, { limit: 5 });
 *       console.log(`📚 Memory context: ${memoryResults.resultCount} items found`);

 *       // Step 2: Check vision alignment
 *       const visionAlignment = await this.visionAnchor.checkAlignment(prompt);
 *       console.log(`🎯 Vision alignment: ${visionAlignment.isAligned ? 'Aligned' : 'Drift detected'}`);

 *       // Step 3: Create enhanced prompt with all context
 *       const enhancedPrompt = this.contextPreserver.enhancePrompt(prompt, {
 *         memoryResults,
 *         visionAlignment
 *       });

 *       // Step 4: Process through embedded Claude (if available)
 *       let response;
 *       if (this.claudeEngine.available) {
 *         console.log('🔄 Processing through embedded Claude...');
 *         const claudeResponse = await this.claudeEngine.process(enhancedPrompt, options);
 *         response = this.processClaudeResponse(claudeResponse);
 *       } else {
 *         console.log('📋 Enhanced prompt generated (API not available)');
 *         response = {
 *           enhancedPrompt,
 *           mode: 'enhanced_prompt',
 *           instruction: 'Enhanced prompt ready for Claude interface'
 *         };
 *       }

 *       // Step 5: Update cognitive state
 *       this.cognitiveState.lastThought = {
 *         prompt,
 *         timestamp: new Date().toISOString(),
 *         memoryItemsUsed: memoryResults.resultCount,
 *         visionAligned: visionAlignment.isAligned
 *       };

 *       // Step 6: Preserve state
 *       await this.contextPreserver.preserveState({
 *         prompt,
 *         response,
 *         cognitiveState: this.cognitiveState
 *       });

 *       console.log('✨ Cognitive processing complete');

 *       return {
 *         originalPrompt: prompt,
 *         response,
 *         memoryContext: memoryResults,
 *         visionAlignment,
 *         cognitiveState: this.cognitiveState,
 *         sessionId: this.sessionId,
 *         timestamp: new Date().toISOString()
 *       };

 *     } catch (error) {
 *       console.error('❌ Cognitive processing error:', error.message);
 *       throw error;
 *     }
 *   }

 *   /**
 *    * Process Claude's response and execute any tools
 *    */
 *   processClaudeResponse(claudeResponse) {
 *     // Extract text content
 *     let content = '';
 *     if (claudeResponse.content) {
 *       content = claudeResponse.content
 *         .map(block => block.type === 'text' ? block.text : '')
 *         .join('');
 *     }

 *     return {
 *       content,
 *       tools_used: [], // Tool processing would go here
 *       mode: 'api_integrated'
 *     };
 *   }

 *   /**
 *    * Get current status of the cognitive system
 *    */
 *   getStatus() {
 *     return {
 *       sessionId: this.sessionId,
 *       initialized: this.initialized,
 *       emergencyContextLoaded: !!this.emergencyContext,
 *       memoryGraphSize: this.memoryGraph ? this.memoryGraph.chunks.length : 0,
 *       claudeEngineMode: this.claudeEngine ? this.claudeEngine.mode : 'not_initialized',
 *       cognitiveState: this.cognitiveState,
 *       timestamp: new Date().toISOString()
 *     };
 *   }
 * }

 * /**
 *  * Test function for immediate validation
 *  */
 * async function testCognitiveLeo() {
 *   console.log('🧪 Testing CognitiveLeo Implementation...\n');

 *   try {
 *     const leo = new CognitiveLeo();
 *     await leo.initialize();

 *     console.log('\n--- Testing Cognitive Thinking ---');
 *     const result = await leo.think('What is the current state of semantic search in Leo?');
 *     console.log('Thinking process completed successfully');

 *     console.log('\n--- Testing Status ---');
 *     const status = leo.getStatus();
 *     console.log('Status:', JSON.stringify(status, null, 2));

 *     console.log('\n✅ CognitiveLeo test completed successfully!');
 *     return true;

 *   } catch (error) {
 *     console.error('\n❌ CognitiveLeo test failed:', error.message);
 *     return false;
 *   }
 * }

 * // Export for use as module
 * module.exports = { CognitiveLeo, testCognitiveLeo };

 * // Run test if called directly
 * if (require.main === module) {
 *   testCognitiveLeo()
 *     .then(success => {
 *       console.log(`\n🎯 Test result: ${success ? 'SUCCESS' : 'FAILED'}`);
 *       process.exit(success ? 0 : 1);
 *     })
 *     .catch(error => {
 *       console.error('\n💥 Critical error:', error);
 *       process.exit(1);
 *     });
 * }
 */

#!/usr/bin/env node

/**
 * Full Cognitive Leo - HTTP Bridged Version
 * Claude Cognitive Engine embedded with HTTP access to Leo functions
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { MinimalCognitiveLeo } = require('./minimal-cognitive-leo');
dotenv.config();

class FullCognitiveLeo extends MinimalCognitiveLeo {
  constructor(options = {}) {
    super(options);
    this.api = null;
    this.memoryInterface = null;
    this.sessionId = `cognitive-leo-${Date.now()}`;
    this.projectRoot = process.cwd();
    this.dataDir = path.join(this.projectRoot, 'data');
  }

  async initialize() {
    console.log(`🧠 Minimal Cognitive Leo created (Session: ${this.sessionId})`);
    console.log(`🚀 Initializing Minimal Cognitive Leo...`);
    const chunksPath = path.join(this.dataDir, 'chunks.jsonl');
    const embeddingsPath = path.join(this.dataDir, 'embeddings.jsonl');
    const emergencyContext = path.join(this.dataDir, 'emergency-context', 'meta-programming-session-1.json');

    this.chunks = fs.readFileSync(chunksPath, 'utf-8').split('\n').filter(Boolean).map(JSON.parse);
    this.embeddings = fs.readFileSync(embeddingsPath, 'utf-8').split('\n').filter(Boolean).map(JSON.parse);

    console.log(`✅ Memory graph chunks found: ${this.chunks.length} items`);
    console.log(`✅ Memory graph embeddings found: ${this.embeddings.length} items`);

    if (fs.existsSync(emergencyContext)) {
      const ctx = JSON.parse(fs.readFileSync(emergencyContext, 'utf-8'));
      console.log('🚨 Emergency context loaded successfully!');
      console.log(`   Previous session: ${ctx.conversationContext.sessionId}`);
      console.log(`   Topic: ${ctx.conversationContext.topic}`);
      console.log(`   Phase: ${ctx.conversationContext.criticalPhase}`);
    }

    console.log(`📊 Session ID: ${this.sessionId}`);
    console.log(`📂 Data directory: ${this.dataDir}`);
    console.log(`🏠 Project root: ${this.projectRoot}`);

    // Anthropic API Setup
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    this.api = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log(`✅ Anthropic SDK ready`);

    // Bind search interface
    this.memoryInterface = {
      searchLeoMemoryGraph: ({ query, limit = 5, threshold = 0.15 }) => {
        const queryLower = query.toLowerCase();
        return this.chunks
          .map(chunk => {
            const content = (chunk.content || chunk.text || '').toLowerCase();
            let score = 0;
            if (content.includes(queryLower)) score += 10;
            queryLower.split(' ').forEach(word => {
              score += (content.match(new RegExp(word, 'g')) || []).length;
            });
            return { content: chunk.content, file: chunk.file, score };
          })
          .filter(r => r.score >= threshold * 10)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }
    };

    console.log(`🔗 Claude function bindings registered`);
    this.startHttpBridge();
  }

  startHttpBridge() {
    const app = express();
    app.use(express.json());

    app.post('/search', (req, res) => {
      const { query, limit, threshold } = req.body;
      const results = this.memoryInterface.searchLeoMemoryGraph({ query, limit, threshold });
      res.json(results);
    });

    const port = process.env.LEO_PORT || 7788;
    app.listen(port, () => {
      console.log(`🌐 HTTP bridge online at http://localhost:${port}/search`);
      console.log(`🧠 Leo is running with embedded Claude + HTTP access.`);
      console.log(`Use: curl -X POST http://localhost:${port}/search -H "Content-Type: application/json" -d '{ "query": "Leo architecture", "limit": 5 }'`);
    });
  }
}

const fullLeo = new FullCognitiveLeo();
fullLeo.initialize();
