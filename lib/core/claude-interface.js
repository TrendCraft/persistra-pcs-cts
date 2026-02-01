// claude-interface.js

const { Anthropic } = require('@anthropic-ai/sdk');
const { searchWithTrueSemanticEmbeddings } = require('./true-semantic-embeddings-adapter');

function initializeClaudeInterface(leo) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️ ANTHROPIC_API_KEY not set in environment.");
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  global.claudeFunctionBindings = {
    searchLeoMemoryGraph: async ({ query, limit = 5, threshold = 0.2 }) => {
      if (!query || typeof query !== 'string') {
        throw new Error("Invalid query provided to searchLeoMemoryGraph.");
      }

      const embedding = await leo.generateQueryEmbedding(query);

      const results = searchWithTrueSemanticEmbeddings({
        queryEmbedding: embedding,
        memoryGraph: leo.memoryGraph || [],
        embeddings: leo.embeddings || [],
        limit,
        threshold
      });

      return results;
    }
  };

  console.log("🔗 Claude function bindings registered");
  return anthropic;
}

module.exports = {
  initializeClaudeInterface
};