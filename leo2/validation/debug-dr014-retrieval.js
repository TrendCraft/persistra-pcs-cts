#!/usr/bin/env node

/**
 * Debug DR-014 Retrieval
 * 
 * Systematically debug why the DR-014 decision record isn't being
 * retrieved during AVS-1R test.
 */

require('dotenv').config();

async function debugDR014Retrieval() {
  console.log('=== DEBUGGING DR-014 RETRIEVAL ===\n');
  
  try {
    // 1. Check if DR-014 is in interactions.json
    console.log('1. Checking interactions.json...');
    const interactions = require('../demo/data/interactions.json');
    const dr014Interactions = interactions.filter(i => 
      i.content && i.content.includes('DR-014')
    );
    
    console.log(`   Found ${dr014Interactions.length} DR-014 interactions`);
    
    if (dr014Interactions.length > 0) {
      const dr014 = dr014Interactions[0];
      console.log(`   ID: ${dr014.id}`);
      console.log(`   Type: ${dr014.type}`);
      console.log(`   Has embedding: ${!!dr014.embedding}`);
      console.log(`   Embedding length: ${dr014.embedding?.length || 0}`);
      console.log(`   SessionId: ${dr014.sessionId}`);
      console.log(`   Content preview: ${dr014.content.substring(0, 100)}...`);
    }
    
    // 2. Check if DR-014 is in chunks cache
    console.log('\n2. Checking if DR-014 is in chunks cache...');
    const { MemoryGraph } = require('../core/memory/memoryGraph');
    const memoryGraph = new MemoryGraph();
    
    const allChunks = await memoryGraph.getAllChunks();
    console.log(`   Total chunks loaded: ${allChunks.length}`);
    
    const dr014Chunks = allChunks.filter(c => 
      c.content && c.content.includes('DR-014')
    );
    console.log(`   Chunks containing DR-014: ${dr014Chunks.length}`);
    
    if (dr014Chunks.length > 0) {
      const chunk = dr014Chunks[0];
      console.log(`   Chunk type: ${chunk.type}`);
      console.log(`   Chunk has embedding: ${!!chunk.embedding}`);
      console.log(`   Chunk metadata.chunk_type: ${chunk.metadata?.chunk_type}`);
    } else {
      console.log('   ❌ DR-014 NOT FOUND in chunks cache!');
      console.log('   This is the problem - interactions.json has it, but chunks cache does not.');
    }
    
    // 3. Test semantic search directly
    console.log('\n3. Testing semantic search for DR-014...');
    const searchResults = await memoryGraph.searchMemories({
      query: 'What programming language did we standardize on? Include decision record ID.',
      limit: 10
    });
    
    console.log(`   Search returned ${searchResults.length} results`);
    
    const dr014Results = searchResults.filter(r => 
      r.content && r.content.includes('DR-014')
    );
    console.log(`   Results containing DR-014: ${dr014Results.length}`);
    
    if (dr014Results.length > 0) {
      console.log('   ✅ DR-014 found via semantic search');
      console.log(`   Top result score: ${dr014Results[0].score}`);
    } else {
      console.log('   ❌ DR-014 NOT found via semantic search');
      console.log('\n   Top 3 results:');
      searchResults.slice(0, 3).forEach((r, idx) => {
        console.log(`   ${idx + 1}. Score: ${r.score?.toFixed(4) || 'N/A'}`);
        console.log(`      Type: ${r.type}`);
        console.log(`      Content: ${r.content?.substring(0, 80)}...`);
      });
    }
    
    // 4. Check type distribution in chunks
    console.log('\n4. Analyzing chunk types...');
    const typeCount = {};
    allChunks.forEach(c => {
      const type = c.type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    console.log('   Chunk type distribution:');
    Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
    
    // 5. Check if conversation_turn chunks have embeddings
    console.log('\n5. Checking conversation_turn embeddings...');
    const conversationTurns = allChunks.filter(c => c.type === 'conversation_turn');
    const turnsWithEmbeddings = conversationTurns.filter(c => c.embedding && c.embedding.length > 0);
    
    console.log(`   Total conversation_turn chunks: ${conversationTurns.length}`);
    console.log(`   With embeddings: ${turnsWithEmbeddings.length}`);
    console.log(`   Without embeddings: ${conversationTurns.length - turnsWithEmbeddings.length}`);
    
    // 6. Summary and diagnosis
    console.log('\n=== DIAGNOSIS ===');
    
    if (dr014Interactions.length === 0) {
      console.log('❌ DR-014 not stored in interactions.json');
      console.log('   → Week 1 embedding generation may not have run');
    } else if (dr014Chunks.length === 0) {
      console.log('❌ DR-014 in interactions.json but NOT in chunks cache');
      console.log('   → addInteraction() is not adding to chunks cache');
      console.log('   → OR chunks cache is not being loaded from interactions.json');
    } else if (dr014Results.length === 0) {
      console.log('❌ DR-014 in chunks cache but NOT retrieved by semantic search');
      console.log('   → Type filtering may be blocking it');
      console.log('   → OR embedding quality issue');
      console.log('   → OR query embedding not matching');
    } else {
      console.log('✅ DR-014 is retrievable via semantic search');
      console.log('   → Problem may be in orchestrator\'s retrieval configuration');
      console.log('   → OR session scope filtering');
    }
    
  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugDR014Retrieval();
