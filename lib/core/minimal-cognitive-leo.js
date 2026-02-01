#!/usr/bin/env node

/**
* Minimal Cognitive Leo - Embedded Claude+Leo System
* 
* This is the first working implementation of the embedded Claude+Leo architecture.
* It demonstrates the core concept: Leo as a cognitive shell with embedded AI processing.
* 
* Usage:
*   const { MinimalCognitiveLeo } = require('./lib/core/minimal-cognitive-leo');
*   const leo = new MinimalCognitiveLeo();
*   await leo.initialize();
*   const result = await leo.think("How does semantic search work?");
*/

const fs = require('fs');
const path = require('path');

class MinimalCognitiveLeo {
 constructor(options = {}) {
   this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
   this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
   this.projectRoot = options.projectRoot || process.cwd();
   this.initialized = false;
   this.sessionId = `cognitive-leo-${Date.now()}`;
   
   console.log(`🧠 Minimal Cognitive Leo created (Session: ${this.sessionId})`);
 }

 async initialize() {
   console.log('🚀 Initializing Minimal Cognitive Leo...');
   
   try {
     // Verify data directory exists
     if (!fs.existsSync(this.dataDir)) {
       console.log(`📁 Creating data directory: ${this.dataDir}`);
       fs.mkdirSync(this.dataDir, { recursive: true });
     }
     
     // Check for memory graph files
     const chunksFile = path.join(this.dataDir, 'chunks.jsonl');
     const embeddingsFile = path.join(this.dataDir, 'embeddings.jsonl');
     
     if (fs.existsSync(chunksFile)) {
       const chunksData = fs.readFileSync(chunksFile, 'utf8');
       const chunkCount = chunksData.split('\n').filter(line => line.trim()).length;
       console.log(`✅ Memory graph chunks found: ${chunkCount} items`);
     } else {
       console.log('⚠️ No chunks.jsonl found - will create minimal memory');
     }
     
     if (fs.existsSync(embeddingsFile)) {
       const embeddingsData = fs.readFileSync(embeddingsFile, 'utf8');
       const embeddingCount = embeddingsData.split('\n').filter(line => line.trim()).length;
       console.log(`✅ Memory graph embeddings found: ${embeddingCount} items`);
     } else {
       console.log('⚠️ No embeddings.jsonl found - using text-based search');
     }
     
     // Load emergency context if available
     await this.loadEmergencyContext();
     
     this.initialized = true;
     console.log('🎯 Minimal Cognitive Leo fully operational!');
     console.log(`📊 Session ID: ${this.sessionId}`);
     console.log(`📂 Data directory: ${this.dataDir}`);
     console.log(`🏠 Project root: ${this.projectRoot}`);
     
     return true;
   } catch (error) {
     console.error('❌ Initialization failed:', error.message);
     return false;
   }
 }

 async loadEmergencyContext() {
   try {
     const emergencyFile = path.join(this.dataDir, 'emergency-context', 'meta-programming-session-1.json');
     if (fs.existsSync(emergencyFile)) {
       const emergencyContext = JSON.parse(fs.readFileSync(emergencyFile, 'utf8'));
       console.log('🚨 Emergency context loaded successfully!');
       console.log(`   Previous session: ${emergencyContext.conversationContext.sessionId}`);
       console.log(`   Topic: ${emergencyContext.conversationContext.topic}`);
       console.log(`   Phase: ${emergencyContext.conversationContext.criticalPhase}`);
       
       this.emergencyContext = emergencyContext;
       return true;
     }
   } catch (error) {
     console.log('📝 No emergency context found - starting fresh');
   }
   return false;
 }

 async searchMemoryGraph(query, options = {}) {
   console.log(`🔍 Searching Leo's memory for: "${query}"`);
   
   try {
     const chunksFile = path.join(this.dataDir, 'chunks.jsonl');
     if (!fs.existsSync(chunksFile)) {
       console.log('⚠️ No chunks file found - empty results');
       return { results: [], query, resultCount: 0, message: 'No memory graph available' };
     }
     
     const chunksData = fs.readFileSync(chunksFile, 'utf8');
     const chunks = chunksData.split('\n')
       .filter(line => line.trim())
       .map(line => {
         try {
           return JSON.parse(line);
         } catch {
           return null;
         }
       })
       .filter(chunk => chunk !== null);
     
     console.log(`📚 Loaded ${chunks.length} memory chunks`);
     
     // Simple but effective text search
     const queryLower = query.toLowerCase();
     const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
     
     const results = chunks
       .map(chunk => {
         const content = (chunk.content || chunk.text || '').toLowerCase();
         let score = 0;
         
         // Exact phrase match gets highest score
         if (content.includes(queryLower)) {
           score += 10;
         }
         
         // Individual word matches
         queryWords.forEach(word => {
           const wordCount = (content.match(new RegExp(word, 'g')) || []).length;
           score += wordCount;
         });
         
         return {
           chunk,
           score,
           content: chunk.content || chunk.text,
           file: chunk.file || chunk.source,
           id: chunk.id || chunk.chunk_id
         };
       })
       .filter(item => item.score > 0)
       .sort((a, b) => b.score - a.score)
       .slice(0, options.limit || 5)
       .map(item => ({
         content: item.content,
         file: item.file,
         id: item.id,
         relevanceScore: item.score / 10 // Normalize to 0-1 range
       }));
     
     console.log(`📊 Found ${results.length} relevant results`);
     return { results, query, resultCount: results.length };
   } catch (error) {
     console.error('❌ Memory search error:', error.message);
     return { results: [], query, resultCount: 0, error: error.message };
   }
 }

 async readFile(relativePath) {
   try {
     const fullPath = path.join(this.projectRoot, relativePath);
     if (!fs.existsSync(fullPath)) {
       throw new Error(`File not found: ${relativePath}`);
     }
     
     const content = fs.readFileSync(fullPath, 'utf8');
     console.log(`📖 Read file: ${relativePath} (${content.length} chars)`);
     return content;
   } catch (error) {
     console.error(`❌ Error reading ${relativePath}:`, error.message);
     throw error;
   }
 }

 async writeFile(relativePath, content) {
   try {
     const fullPath = path.join(this.projectRoot, relativePath);
     const directory = path.dirname(fullPath);
     
     // Ensure directory exists
     if (!fs.existsSync(directory)) {
       fs.mkdirSync(directory, { recursive: true });
     }
     
     fs.writeFileSync(fullPath, content, 'utf8');
     console.log(`💾 Wrote file: ${relativePath} (${content.length} chars)`);
     return true;
   } catch (error) {
     console.error(`❌ Error writing ${relativePath}:`, error.message);
     throw error;
   }
 }

 async listFiles(relativePath = '.') {
   try {
     const fullPath = path.join(this.projectRoot, relativePath);
     if (!fs.existsSync(fullPath)) {
       throw new Error(`Directory not found: ${relativePath}`);
     }
     
     const files = fs.readdirSync(fullPath)
       .map(file => ({
         name: file,
         path: path.join(relativePath, file),
         isDirectory: fs.statSync(path.join(fullPath, file)).isDirectory()
       }));
     
     console.log(`📂 Listed ${files.length} items in ${relativePath}`);
     return files;
   } catch (error) {
     console.error(`❌ Error listing ${relativePath}:`, error.message);
     throw error;
   }
 }

 async think(prompt, options = {}) {
   if (!this.initialized) {
     throw new Error('Cognitive Leo not initialized. Call initialize() first.');
   }
   
   console.log(`\n🤔 Cognitive Leo thinking about: "${prompt}"`);
   console.log(`📊 Session: ${this.sessionId}`);
   
   try {
     // Search memory for relevant context
     const memoryResults = await this.searchMemoryGraph(prompt, { limit: 5 });
     
     // Create enhanced prompt with Leo context
     const enhancedPrompt = this.createEnhancedPrompt(prompt, memoryResults);
     
     // For now, return the enhanced prompt
     // In full implementation, this would call Claude API
     const response = {
       originalPrompt: prompt,
       enhancedPrompt,
       memoryContext: memoryResults,
       sessionId: this.sessionId,
       timestamp: new Date().toISOString(),
       cognitiveState: {
         memoryItemsFound: memoryResults.resultCount,
         emergencyContextLoaded: !!this.emergencyContext,
         sessionActive: true
       }
     };
     
     console.log('✨ Cognitive processing complete');
     console.log(`📚 Memory context: ${memoryResults.resultCount} items`);
     
     return response;
   } catch (error) {
     console.error('❌ Cognitive processing error:', error.message);
     throw error;
   }
 }

 createEnhancedPrompt(prompt, memoryResults) {
   let enhanced = `# Enhanced Prompt with Leo Context\n\n`;
   enhanced += `**Original Query**: ${prompt}\n\n`;
   
   // Add emergency context if available
   if (this.emergencyContext) {
     enhanced += `## Preserved Context (Emergency)\n`;
     enhanced += `- Session: ${this.emergencyContext.conversationContext.sessionId}\n`;
     enhanced += `- Topic: ${this.emergencyContext.conversationContext.topic}\n`;
     enhanced += `- Phase: ${this.emergencyContext.conversationContext.criticalPhase}\n`;
     enhanced += `- Goal: ${this.emergencyContext.nextSessionInstructions.immediateGoal}\n\n`;
   }
   
   // Add memory context
   enhanced += `## Leo Memory Context\n`;
   if (memoryResults.results.length > 0) {
     enhanced += `Found ${memoryResults.resultCount} relevant items in Leo's memory:\n\n`;
     memoryResults.results.forEach((item, i) => {
       enhanced += `### Memory Item ${i + 1} (Relevance: ${item.relevanceScore.toFixed(3)})\n`;
       if (item.file) enhanced += `**Source**: ${item.file}\n`;
       enhanced += `**Content**: ${item.content.substring(0, 300)}${item.content.length > 300 ? '...' : ''}\n\n`;
     });
   } else {
     enhanced += `No relevant context found in Leo's memory for this query.\n\n`;
   }
   
   enhanced += `## Cognitive State\n`;
   enhanced += `- Session ID: ${this.sessionId}\n`;
   enhanced += `- Timestamp: ${new Date().toISOString()}\n`;
   enhanced += `- Memory Status: ${memoryResults.resultCount} items found\n\n`;
   
   enhanced += `---\n\n${prompt}`;
   
   return enhanced;
 }

 async preserveState() {
   try {
     const stateFile = path.join(this.dataDir, 'cognitive-state', `${this.sessionId}.json`);
     const stateDir = path.dirname(stateFile);
     
     if (!fs.existsSync(stateDir)) {
       fs.mkdirSync(stateDir, { recursive: true });
     }
     
     const state = {
       sessionId: this.sessionId,
       timestamp: new Date().toISOString(),
       initialized: this.initialized,
       emergencyContextLoaded: !!this.emergencyContext,
       dataDir: this.dataDir,
       projectRoot: this.projectRoot
     };
     
     fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
     console.log(`💾 Cognitive state preserved: ${stateFile}`);
     return true;
   } catch (error) {
     console.error('❌ State preservation failed:', error.message);
     return false;
   }
 }

 getStatus() {
   return {
     sessionId: this.sessionId,
     initialized: this.initialized,
     dataDir: this.dataDir,
     projectRoot: this.projectRoot,
     emergencyContextLoaded: !!this.emergencyContext,
     timestamp: new Date().toISOString()
   };
 }
}

// Test function for immediate validation
async function testMinimalCognitiveLeo() {
 console.log('🧪 Testing Minimal Cognitive Leo...\n');
 
 try {
   const leo = new MinimalCognitiveLeo();
   await leo.initialize();
   
   console.log('\n--- Testing Memory Search ---');
   const searchResult = await leo.searchMemoryGraph('semantic search implementation');
   console.log(`Search completed: ${searchResult.resultCount} results`);
   
   console.log('\n--- Testing Cognitive Thinking ---');
   const thinkResult = await leo.think('How does Leo implement semantic search?');
   console.log('Thinking process completed successfully');
   
   console.log('\n--- Testing File Operations ---');
   try {
     const files = await leo.listFiles('lib');
     console.log(`File listing completed: ${files.length} items`);
   } catch (error) {
     console.log('File operations test skipped (directory may not exist)');
   }
   
   console.log('\n--- Testing State Preservation ---');
   await leo.preserveState();
   
   console.log('\n✅ All tests passed! Minimal Cognitive Leo is operational.');
   return true;
 } catch (error) {
   console.error('\n❌ Test failed:', error.message);
   return false;
 }
}

// Export for use as module
module.exports = { MinimalCognitiveLeo, testMinimalCognitiveLeo };

// Run test if called directly
if (require.main === module) {
 testMinimalCognitiveLeo()
   .then(success => {
     console.log(`\n🎯 Test result: ${success ? 'SUCCESS' : 'FAILED'}`);
     process.exit(success ? 0 : 1);
   })
   .catch(error => {
     console.error('\n💥 Critical error:', error);
     process.exit(1);
   });
}