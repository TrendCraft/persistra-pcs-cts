// integration-test-semantic-context-manager.js

const scm = require('./index.js');

console.log('typeof scm.EmbeddingsService:', typeof scm.EmbeddingsService);
console.log('scm.EmbeddingsService:', scm.EmbeddingsService);
console.log('scm keys:', Object.keys(scm));

// EmbeddingsService class
const { EmbeddingsService } = scm;

// CacheService class
const CacheService = scm.CacheService;

// BoundaryService class
const BoundaryService = scm.BoundaryService;

// Context Metrics functions
const {
  computeCoverageScore,
  computeRelevanceScore,
  computeRecencyScore,
  computeDiversityScore,
} = scm;

// Prioritization
const { prioritizeContextElements } = scm;

// Chunk Transform utilities
const {
  inferChunkType,
  mapAndEnrichChunks,
  filterChunksByType,
  postProcessChunks,
} = scm;

// Minimal mocks for DI
const mockLogger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
const mockEventBus = { emit: () => {} };

// EmbeddingsService usage (requires an embeddings interface)
const mockEmbeddingsInterface = {
  generate: async (text) => [0.1, 0.2, 0.3],
  similarity: (a, b) => 0.99,
  normalize: (v) => v,
};
const embeddingsService = new EmbeddingsService({
  trueSemanticEmbeddingsInterface: mockEmbeddingsInterface,
  logger: mockLogger,
});

(async () => {
  // EmbeddingsService
  const embedding = await embeddingsService.generateQueryEmbedding('hello');
  console.log('EmbeddingsService.generateQueryEmbedding:', embedding);

  // CacheService
  const cache = new CacheService({
    logger: mockLogger,
    eventBus: mockEventBus,
    config: {}
  });
  cache.set('foo', 42);
  console.log('CacheService.get:', cache.get('foo'));

  // BoundaryService
  const boundaryService = new BoundaryService({
    logger: mockLogger,
    eventBus: mockEventBus,
    state: {},
    preserveContextForBoundaryCrossing: async () => true,
    restoreContextAfterBoundaryCrossing: async () => ({ success: true }),
  });
  const boundaryResult = await boundaryService.preserveContext();
  console.log('BoundaryService.preserveContext:', boundaryResult);

  // Context Metrics
  const dummy = {};
  console.log('computeCoverageScore:', computeCoverageScore(dummy));
  console.log('computeRelevanceScore:', computeRelevanceScore(dummy));
  console.log('computeRecencyScore:', computeRecencyScore(dummy));
  console.log('computeDiversityScore:', computeDiversityScore(dummy));

  // Prioritization
  const prioritized = prioritizeContextElements([{ id: 1 }, { id: 2 }]);
  console.log('prioritizeContextElements:', prioritized);

  // Chunk Transform utilities
  console.log('inferChunkType:', inferChunkType({}));
  console.log('mapAndEnrichChunks:', mapAndEnrichChunks([], {}));
  console.log('filterChunksByType:', filterChunksByType([], 'type'));
  console.log('postProcessChunks:', postProcessChunks([]));
})();
