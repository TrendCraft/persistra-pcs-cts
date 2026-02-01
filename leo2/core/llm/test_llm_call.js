process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'leo-llama3-8b-merged-q4k:latest';
const llmContextManager = require('./llmContextManager');

(async () => {
  const prompt = "Say hello!";
  // For minimal test, pass only the query and an empty context
  console.log('[test] About to call generateResponse...');
  const result = await llmContextManager.generateResponse({ query: prompt, context: {} });
  console.log('[test] Result:', result);
})();
