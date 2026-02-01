// tse-code-audit.js - Audit and fix true-semantic-embeddings.js
const fs = require('fs').promises;
const path = require('path');

async function auditTSECode() {
  console.log('🔍 Auditing TSE Code for Zero Vector Bug...\n');
  
  const tseFile = '/Users/stephenmansfield/Projects/Leo/lib/services/true-semantic-embeddings.js';
  
  try {
    const tseCode = await fs.readFile(tseFile, 'utf8');
    
    console.log('📊 TSE File Analysis:');
    console.log(`  File size: ${tseCode.length} characters`);
    console.log(`  Lines: ${tseCode.split('\n').length}`);
    
    // Look for common zero-vector patterns
    const patterns = {
      zeroArrays: /new Array\([\d]+\)\.fill\(0\)/g,
      zeroReturns: /return.*\[0,?\s*0/g,
      fallbackZeros: /fallback.*=.*\[.*0.*\]/gi,
      errorZeros: /catch.*{[^}]*return.*\[.*0/gs,
      emptyArrays: /return\s*\[\s*\]/g,
      undefinedReturns: /return\s+undefined/g,
      nullReturns: /return\s+null/g
    };
    
    console.log('\n🔍 Searching for zero-vector patterns:');
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      const matches = tseCode.match(regex);
      if (matches) {
        console.log(`  ⚠️  Found ${patternName}: ${matches.length} matches`);
        matches.forEach((match, i) => {
          console.log(`    ${i + 1}: ${match.substring(0, 60)}${match.length > 60 ? '...' : ''}`);
        });
      }
    }
    
    // Look for the actual generateEmbedding method
    const generateEmbeddingMatch = tseCode.match(/generateEmbedding[^{]*{([\s\S]*?)^  }/m);
    if (generateEmbeddingMatch) {
      console.log('\n📋 Found generateEmbedding method:');
      const methodBody = generateEmbeddingMatch[1];
      console.log('  Method length:', methodBody.length, 'characters');
      
      // Check for common issues
      if (methodBody.includes('return new Array(384).fill(0)')) {
        console.log('  ❌ FOUND: Direct zero array return');
      }
      
      if (methodBody.includes('catch') && methodBody.includes('return')) {
        console.log('  ⚠️  Has error handling that may return zeros');
      }
      
      if (!methodBody.includes('Math.') && !methodBody.includes('tensor') && !methodBody.includes('model')) {
        console.log('  ⚠️  No math operations or model calls detected');
      }
    }
    
    // Look for model loading patterns
    const hasModelLoading = /load.*[Mm]odel|[Mm]odel.*load|require.*transformers|require.*tensorflow/g.test(tseCode);
    console.log(`\n🤖 Model loading detected: ${hasModelLoading}`);
    
    if (!hasModelLoading) {
      console.log('  ⚠️  No obvious model loading patterns found');
    }
    
    // Check for external dependencies
    const dependencies = [];
    const requireMatches = tseCode.match(/require\(['"]([^'"]+)['"]\)/g);
    if (requireMatches) {
      requireMatches.forEach(match => {
        const dep = match.match(/require\(['"]([^'"]+)['"]\)/)[1];
        dependencies.push(dep);
      });
      console.log('\n📦 Dependencies found:', dependencies.join(', '));
    }
    
    // Look for initialization patterns
    const initMatch = tseCode.match(/initialize[^{]*{([\s\S]*?)^  }/m);
    if (initMatch) {
      console.log('\n🔧 Initialize method analysis:');
      const initBody = initMatch[1];
      
      if (initBody.includes('console.log') || initBody.includes('console.info')) {
        console.log('  ✅ Has logging in initialize');
      }
      
      if (initBody.includes('this.model') || initBody.includes('model')) {
        console.log('  🤖 References model in initialize');
      }
      
      if (initBody.includes('return true') || initBody.includes('return false')) {
        console.log('  ✅ Has explicit return values');
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to read TSE file:', error.message);
    return false;
  }
  
  return true;
}

// ... (rest of script omitted for brevity, as user only asked for audit and report)

if (require.main === module) {
  auditTSECode().catch(console.error);
}

module.exports = { auditTSECode };
