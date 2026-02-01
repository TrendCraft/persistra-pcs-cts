const embeddings = require('./true-semantic-embeddings');

(async () => {
  try {
    await embeddings.initialize();
    const vec = await embeddings.generateEmbedding('hello world');
    console.log('Embedding:', vec);
    console.log('Length:', Array.isArray(vec) ? vec.length : typeof vec);
    console.log('All zero:', Array.isArray(vec) ? vec.every(x => x === 0) : 'n/a');
    console.log('Some nonzero:', Array.isArray(vec) ? vec.some(x => x !== 0) : 'n/a');
  } catch (err) {
    console.error('Error during universal embedding test:', err);
  }
})();
