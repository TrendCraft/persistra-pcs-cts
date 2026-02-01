const assert = require('assert');
const { EmbeddingsService } = require('./embeddingsService');

describe('EmbeddingsService (Leo Only)', () => {
  let logger, embeddings, service;

  beforeEach(() => {
    logger = { info: () => {}, error: () => {} };
    embeddings = {
      generate: async (text) => ({ vector: [1, 2, 3], text }),
      similarity: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
      normalize: (v) => {
        const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
        return norm ? v.map(x => x / norm) : v;
      }
    };
    service = new EmbeddingsService({ trueSemanticEmbeddingsInterface: embeddings, logger });
  });

  it('should throw if interface is missing or invalid', () => {
    assert.throws(() => new EmbeddingsService({ trueSemanticEmbeddingsInterface: null, logger }), /True Semantic Embeddings/);
    assert.throws(() => new EmbeddingsService({ trueSemanticEmbeddingsInterface: {}, logger }), /True Semantic Embeddings/);
    assert.throws(() => new EmbeddingsService({ trueSemanticEmbeddingsInterface: { generate: () => {} }, logger }), /True Semantic Embeddings/);
  });

  it('should generate embeddings via the correct backend', async () => {
    const result = await service.generateQueryEmbedding('test');
    assert.deepStrictEqual(result, { vector: [1, 2, 3], text: 'test' });
  });

  it('should compute cosine similarity using Leo backend', () => {
    const sim = service.cosineSimilarity([1, 2, 3], [4, 5, 6]);
    assert.strictEqual(sim, 1*4 + 2*5 + 3*6);
  });

  it('should normalize vectors using Leo backend', () => {
    const norm = service.normalizeVector([3, 4]);
    assert.ok(Math.abs(norm[0] - 0.6) < 1e-10);
    assert.ok(Math.abs(norm[1] - 0.8) < 1e-10);
  });

  it('should log embedding generation', async () => {
    let logged = false;
    service.logger = { info: () => { logged = true; } };
    await service.generateQueryEmbedding('hello');
    assert.ok(logged);
  });
});
