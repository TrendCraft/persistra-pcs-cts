// Direct test for universal True Semantic Embeddings
const tse = require('./true-semantic-embeddings');

(async () => {
  try {
    await tse.initialize();
    const emb = await tse.generateEmbedding("This is a test of the true semantic engine.");
    console.log('Embedding length:', emb.length);
    console.log('First 10 values:', emb.slice(0, 10));
    // Check for zero vector or wrong dimension
    if (!Array.isArray(emb) || emb.length !== 384 || emb.every(x => x === 0)) {
      console.error('❌ Embedding is invalid: likely initialization or internal TSE logic issue.');
      process.exit(1);
    } else {
      console.log('✅ Embedding appears valid.');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Error during TSE test:', err);
    process.exit(2);
  }
})();
