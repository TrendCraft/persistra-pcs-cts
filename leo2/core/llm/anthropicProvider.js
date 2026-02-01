// Lazy, hot-swappable Anthropic client provider
// Prevents API key caching issues by recreating client when key changes

let client = null;
let cachedTail = null;

function getAnthropicClient() {
  const k = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  console.log('[DEBUG] getAnthropicClient - ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY?.slice(0,20) + '...');
  console.log('[DEBUG] getAnthropicClient - CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY?.slice(0,20) + '...');
  console.log('[DEBUG] getAnthropicClient - Selected key k:', k?.slice(0,20) + '...');
  if (!k) throw new Error('ANTHROPIC_API_KEY missing');

  // Recreate client if no client yet or key changed
  if (!client || cachedTail !== k.slice(-6)) {
    // Use fetch-based client since we don't have @anthropic-ai/sdk installed
    client = {
      apiKey: k,
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-5-sonnet-20241022'
    };
    cachedTail = k.slice(-6);
    console.log(`[LLM] Anthropic client (re)created, key_tail=${cachedTail}`);
  }
  return client;
}

function getAnthropicApiKey() {
  const client = getAnthropicClient();
  return client.apiKey;
}

module.exports = { getAnthropicClient, getAnthropicApiKey };
