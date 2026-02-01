#!/usr/bin/env node
/**
 * Quick TSE Diagnostic Script
 * Run this to see what's happening with your embeddings
 */

console.log('🔍 TSE Quick Diagnostic');
console.log('======================\n');

async function runDiagnostic() {
  try {
    // Load TSE
    console.log('1. Loading true-semantic-embeddings...');
    const tse = require('./true-semantic-embeddings');
    console.log('   ✅ Loaded successfully');
    
    // Check if initialized
    console.log('2. Checking initialization status...');
    const isInit = tse.isInitialized();
    console.log(`   Initialized: ${isInit}`);
    
    if (!isInit) {
      console.log('3. Initializing TSE...');
      await tse.initialize();
      console.log('   ✅ Initialization completed');
    }
    
    // Check backend
    console.log('4. Checking backend...');
    const backend = tse._getBackend();
    const backendType = tse._getBackendType();
    console.log(`   Backend Type: ${backendType || 'UNKNOWN'}`);
    console.log(`   Backend Object: ${backend ? 'Present' : 'NULL'}`);
    
    if (backendType === 'fallback-hash-only') {
      console.log('   ❌ PROBLEM: Using hash fallback only!');
    }
    
    // Test embedding generation
    console.log('5. Testing embedding generation...');
    const testText = 'contextual salience test';
    const embedding = await tse.generateEmbedding(testText);
    
    console.log(`   Embedding type: ${typeof embedding}`);
    console.log(`   Is array: ${Array.isArray(embedding)}`);
    console.log(`   Length: ${embedding?.length || 'N/A'}`);
    console.log(`   First 5 values: [${embedding?.slice(0, 5).map(x => x?.toFixed(4)).join(', ') || 'N/A'}]`);
    console.log(`   Has non-zero: ${embedding?.some(x => x !== 0) || false}`);
    console.log(`   All same: ${embedding?.every(x => x === embedding[0]) || false}`);
    
    // Quality assessment
    if (!embedding || !Array.isArray(embedding)) {
      console.log('   ❌ CRITICAL: Invalid embedding returned');
    } else if (embedding.every(x => x === 0)) {
      console.log('   ❌ CRITICAL: All-zero embedding (backend failed)');
    } else if (embedding.every(x => x === embedding[0])) {
      console.log('   ❌ CRITICAL: All values identical (likely fallback)');
    } else {
      const variance = calculateVariance(embedding);
      const magnitude = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
      console.log(`   Variance: ${variance.toFixed(6)}`);
      console.log(`   Magnitude: ${magnitude.toFixed(4)}`);
      
      if (variance < 0.001) {
        console.log('   ⚠️  WARNING: Very low variance - possibly hash-based');
      } else {
        console.log('   ✅ Embedding looks reasonable');
      }
    }
    
    // Test similarity
    console.log('6. Testing semantic similarity...');
    const text1 = 'cat sleeping peacefully';
    const text2 = 'feline resting quietly';
    const text3 = 'quantum physics equations';
    
    const emb1 = await tse.generateEmbedding(text1);
    const emb2 = await tse.generateEmbedding(text2);
    const emb3 = await tse.generateEmbedding(text3);
    
    const sim12 = tse.similarity(emb1, emb2);
    const sim13 = tse.similarity(emb1, emb3);
    
    console.log(`   Similar texts similarity: ${sim12.toFixed(4)}`);
    console.log(`   Different texts similarity: ${sim13.toFixed(4)}`);
    console.log(`   Difference: ${(sim12 - sim13).toFixed(4)}`);
    
    if (sim12 > sim13 + 0.1) {
      console.log('   ✅ Semantic understanding working');
    } else if (Math.abs(sim12 - sim13) < 0.05) {
      console.log('   ❌ No semantic understanding (random/hash embeddings)');
    } else {
      console.log('   ⚠️  Weak semantic understanding');
    }
    
    // Summary
    console.log('\n📊 SUMMARY');
    console.log('===========');
    if (backendType === 'fallback-hash-only') {
      console.log('❌ PROBLEM: Using hash-only fallback');
      console.log('   Your backends are failing to initialize');
      console.log('   This explains poor search results');
    } else if (embedding?.every(x => x === 0)) {
      console.log('❌ PROBLEM: Embeddings are all zeros');
      console.log('   Backend claims to work but returns invalid embeddings');
    } else if (Math.abs(sim12 - sim13) < 0.05) {
      console.log('❌ PROBLEM: No semantic differentiation');
      console.log('   Embeddings are not semantically meaningful');
    } else {
      console.log('✅ Embeddings appear to be working');
      console.log('   Problem may be in chunk indexing or search');
    }
    
  } catch (error) {
    console.error('❌ Error during diagnostic:', error.message);
    console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
  }
}

function calculateVariance(arr) {
  if (!arr || arr.length === 0) return 0;
  const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return variance;
}

// Run the diagnostic
runDiagnostic().catch(console.error);
