// Quick smoke test for contextMetrics and prioritization modules
const {
  computeCoverageScore,
  computeRelevanceScore,
  computeRecencyScore,
  computeDiversityScore
} = require('./contextMetrics');
const { prioritizeContextElements } = require('./prioritization');

const now = Date.now();
const context = {
  semanticMemory: [
    { priority: 'high', relevanceScore: 0.8, type: 'code', timestamp: now - 1000 * 60 * 10 },
    { priority: 'medium', relevanceScore: 0.6, type: 'doc', timestamp: now - 1000 * 60 * 60 },
    { priority: 'low', relevanceScore: 0.4, type: 'test', timestamp: now - 1000 * 60 * 120 }
  ],
  developmentHistory: [{}, {}],
  recentQueries: ['foo', 'bar'],
  activeEmbeddings: 2,
  activityFocus: 1,
  history: [
    { priority: 'high', relevanceScore: 0.9, timestamp: now - 1000 * 60 * 5 },
    { priority: 'low', relevanceScore: 0.3, timestamp: now - 1000 * 60 * 120 }
  ],
  activity: [
    { priority: 'medium', relevanceScore: 0.7, timestamp: now - 1000 * 60 * 30 }
  ]
};

console.log('Coverage:', computeCoverageScore(context));
console.log('Relevance:', computeRelevanceScore(context));
console.log('Recency:', computeRecencyScore(context));
console.log('Diversity:', computeDiversityScore(context));

const elements = [
  { priority: 'medium', relevanceScore: 0.6, timestamp: now - 1000 * 60 * 60 },
  { priority: 'high', relevanceScore: 0.8, timestamp: now - 1000 * 60 * 10 },
  { priority: 'low', relevanceScore: 0.4, timestamp: now - 1000 * 60 * 120 }
];
console.log('Prioritized:', prioritizeContextElements(elements));
