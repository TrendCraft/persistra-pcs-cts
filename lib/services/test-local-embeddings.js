const { localSemanticEmbeddings } = require('./local-semantic-embeddings');

(async () => {
  try {
    await localSemanticEmbeddings.initialize();
    const embedding = await localSemanticEmbeddings.generate('hello world');
    console.log('Embedding shape:', Array.isArray(embedding) ? embedding.length : typeof embedding);
    console.log('First 10 values:', Array.isArray(embedding) ? embedding.slice(0, 10) : embedding);
    const isNonZero = Array.isArray(embedding) && embedding.some(x => x !== 0);
    console.log('Is nonzero:', isNonZero);
  } catch (err) {
    console.error('Error during local embedding test:', err);
  }
})();
