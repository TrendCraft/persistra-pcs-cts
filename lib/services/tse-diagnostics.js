// tse-diagnostics.js - Diagnose and fix True Semantic Embeddings
const path = require('path');
const fs = require('fs').promises;

async function diagnoseTSE() {
  console.log('🔍 Diagnosing True Semantic Embeddings (TSE) Service...\n');
  
  // 1. Check if TSE service file exists
  const tseServicePath = path.join(__dirname, 'true-semantic-embeddings.js');
  console.log(`Checking TSE service at: ${tseServicePath}`);
  
  try {
    await fs.access(tseServicePath);
    console.log('✅ TSE service file exists');
  } catch (error) {
    console.log('❌ TSE service file not found');
    return false;
  }
  
  // 2. Try to load and initialize TSE
  let tseService;
  try {
    tseService = require(tseServicePath);
    console.log('✅ TSE service loaded successfully');
    console.log('TSE methods available:', Object.keys(tseService));
  } catch (error) {
    console.log('❌ Failed to load TSE service:', error.message);
    return false;
  }
  
  // 3. Check if TSE is initialized
  try {
    await tseService.initialize();
    console.log('✅ TSE service initialized successfully');
  } catch (error) {
    console.log('❌ TSE service initialization failed:', error.message);
    return false;
  }
  
  // 4. Test embedding generation
  const testText = "Hello, this is a test embedding";
  console.log(`\nTesting embedding generation with: "${testText}"`);
  
  try {
    const embedding = await tseService.generateEmbedding(testText);
    console.log('✅ Embedding generated successfully');
    console.log(`Embedding type: ${typeof embedding}`);
    console.log(`Embedding is array: ${Array.isArray(embedding)}`);
    console.log(`Embedding length: ${embedding ? embedding.length : 'undefined'}`);
    
    if (Array.isArray(embedding) && embedding.length > 0) {
      console.log(`First 5 values: [${embedding.slice(0, 5).join(', ')}]`);
      console.log(`All zeros: ${embedding.every(v => v === 0)}`);
      console.log(`Any NaN: ${embedding.some(v => isNaN(v))}`);
      
      // Check if embedding looks valid
      const nonZeroCount = embedding.filter(v => v !== 0).length;
      const validRange = embedding.every(v => v >= -1 && v <= 1);
      
      console.log(`Non-zero values: ${nonZeroCount}/${embedding.length}`);
      console.log(`Values in [-1, 1] range: ${validRange}`);
      
      if (nonZeroCount === 0) {
        console.log('⚠️  WARNING: All embedding values are zero - TSE is not working properly');
        return false;
      }
      
      if (!validRange) {
        console.log('⚠️  WARNING: Embedding values outside expected range');
      }
      
      return true;
    } else {
      console.log('❌ Invalid embedding format');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Failed to generate test embedding:', error.message);
    console.log('Error details:', error);
    return false;
  }
}

if (require.main === module) {
  diagnoseTSE().catch(console.error);
}

module.exports = { diagnoseTSE };
