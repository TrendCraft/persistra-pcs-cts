// Claude LLM API wrapper for snippet polishing
// Usage: await polishText(text)
const fetch = require('node-fetch');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!CLAUDE_API_KEY) {
  throw new Error('CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable required');
}
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';

async function polishText(text) {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 256,
    messages: [
      { role: 'user', content: `Polish and rewrite this memory snippet so it is clear, natural, and user-friendly. Be concise, but preserve all important details.\n\nSnippet:\n${text}` }
    ]
  };
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data && data.content && Array.isArray(data.content) && data.content.length > 0) {
      return data.content[0].text.trim();
    }
    return text; // fallback
  } catch (e) {
    console.error('[ClaudeLLM] Error polishing text:', e.message);
    return text;
  }
}

module.exports = { polishText };
