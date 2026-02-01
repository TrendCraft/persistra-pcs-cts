// leo2/core/llm/claudeLLMClient.js
// Claude LLM Client Adapter for Leo Orchestrator (primary LLM backend)
const fetch = require('node-fetch');
const path = require('path');
const { extractClaudeText } = require('../../utils/extractClaudeText');

const { getAnthropicApiKey } = require('./anthropicProvider');
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-haiku-20240307';

class ClaudeLLMClient {
  constructor(options = {}) {
    this.model = options.model || CLAUDE_MODEL;
    this.endpoint = options.endpoint || CLAUDE_API_URL;
    // Don't cache API key in constructor - get it fresh each time
  }

  get apiKey() {
    return getAnthropicApiKey();
  }

  /**
   * Generate a response from Claude LLM
   * @param {object} params
   *   - prompt: string (array of messages, OpenAI/Anthropic format)
   *   - context: object (optional, for compatibility)
   * @returns {Promise<string>} LLM response
   */
  async generate(prompt, options = {}) {
    console.log('[ClaudeLLMClient DEBUG] generate() called with prompt type:', typeof prompt, 'Array.isArray:', Array.isArray(prompt));
    console.log('[ClaudeLLMClient DEBUG] prompt value:', JSON.stringify(prompt, null, 2));
    
    // Handle both old and new calling conventions
    let actualPrompt, max_tokens, temperature, context, systemPrompt;
    
    if (typeof prompt === 'object' && prompt.prompt) {
      // New style: generate({ prompt, max_tokens, temperature, system })
      actualPrompt = prompt.prompt;
      max_tokens = prompt.max_tokens || 2000;
      temperature = prompt.temperature || 0.7;
      context = prompt.context || [];
      systemPrompt = prompt.system;
    } else {
      // Old style: generate(prompt, { max_tokens, temperature })
      actualPrompt = prompt;
      max_tokens = options.max_tokens || 2000;
      temperature = options.temperature || 0.7;
      context = options.context || [];
      systemPrompt = options.system;
    }
    
    console.log('[ClaudeLLMClient DEBUG] actualPrompt type:', typeof actualPrompt, 'Array.isArray:', Array.isArray(actualPrompt));
    console.log('[ClaudeLLMClient DEBUG] actualPrompt value:', JSON.stringify(actualPrompt, null, 2));
    // Add rate limiting delay to prevent API errors
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const SYSTEM_STYLE = `
Answer the user directly and conversationally using both project context and your general knowledge.
When project context is relevant, integrate it naturally with your broader knowledge.
When project context doesn't contain sufficient information, draw upon your training data and general knowledge.
Provide comprehensive, helpful responses that combine both sources seamlessly.
Do NOT mention "context", "memory", "project memory", retrieval, or where information came from.
No preambles like "Based on..." or "From the provided context...".
No apologies unless a hard error occurs.
`;

      // Handle both string and array prompts safely
      let messages;
      if (Array.isArray(actualPrompt)) {
        // Direct pass-through for properly formatted message arrays
        messages = actualPrompt.filter(msg => 
          msg && 
          typeof msg === 'object' && 
          msg.role && 
          msg.content &&
          typeof msg.content === 'string'
        );
        
        console.log('[ClaudeLLMClient DEBUG] Filtered messages count:', messages.length, 'from original:', actualPrompt.length);
        
        // If no valid messages found, try to transform
        if (messages.length === 0) {
          console.log('[ClaudeLLMClient DEBUG] No valid messages found, attempting transformation');
          messages = actualPrompt.map(msg => {
            if (typeof msg === 'string') {
              return { role: 'user', content: msg };
            } else if (msg && typeof msg === 'object') {
              return {
                role: msg.role || 'user',
                content: typeof msg.content === 'string' ? msg.content : 
                         typeof msg === 'string' ? msg : 
                         msg.content ? String(msg.content) : String(msg)
              };
            }
            return { role: 'user', content: String(msg) };
          });
        }
      } else if (typeof actualPrompt === 'string') {
        messages = [{ role: 'user', content: actualPrompt }];
      } else {
        throw new Error('Prompt must be string or array');
      }
      
      // Debug: log messages before filtering
      console.log('[ClaudeLLMClient DEBUG] Messages before filtering:', JSON.stringify(messages, null, 2));
      
      // Separate system messages from user/assistant messages
      let validMessages = [];
      let systemMessage = '';
      
      if (Array.isArray(prompt)) {
        const filteredMessages = prompt.filter(msg => 
          msg && 
          typeof msg === 'object' && 
          msg.role && 
          typeof msg.content === 'string' && 
          msg.content.trim().length > 0
        );
        
        // Extract system messages and regular messages
        for (const msg of filteredMessages) {
          if (msg.role === 'system') {
            systemMessage = msg.content;
          } else if (msg.role === 'user' || msg.role === 'assistant') {
            validMessages.push(msg);
          }
        }
      }
      
      // If no valid messages, create a fallback
      if (validMessages.length === 0) {
        console.log('[ClaudeLLMClient] No valid messages found, creating fallback');
        validMessages = [{ role: 'user', content: 'Hello' }];
      }
      
      console.log('[ClaudeLLMClient DEBUG] Separated system message length:', systemMessage.length);
      console.log('[ClaudeLLMClient DEBUG] Filtered messages:', JSON.stringify(validMessages, null, 2));
      
      // Ensure we have at least one message
      if (validMessages.length === 0) {
        console.log('[ClaudeLLMClient DEBUG] No valid messages, using fallback');
        validMessages = [{ role: 'user', content: 'Hello' }];
      }

      const body = {
        model: this.model,
        max_tokens: max_tokens,
        temperature: temperature,
        system: systemMessage || systemPrompt || SYSTEM_STYLE,
        messages: validMessages
      };
      // Debug: log outgoing payload
      console.log('[ClaudeLLMClient DEBUG] Outgoing Claude API payload:', JSON.stringify(body, null, 2));
      console.log('[ClaudeLLMClient DEBUG] API Key present:', !!this.apiKey);
      console.log('[ClaudeLLMClient DEBUG] API Key prefix:', this.apiKey?.slice(0,30) + '...');
      console.log('[ClaudeLLMClient DEBUG] Model:', this.model);
      console.log('[ClaudeLLMClient DEBUG] Max tokens:', max_tokens);
      console.log('[ClaudeLLMClient DEBUG] Temperature:', temperature);
      
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.error('[ClaudeLLMClient] Failed to parse JSON:', text);
        return '[ClaudeLLMClient] Claude API returned non-JSON response.';
      }
      console.log('[ClaudeLLMClient] HTTP status:', response.status);
      console.log('[ClaudeLLMClient] API response:', JSON.stringify(data, null, 2));
      
      // ✅ Extract raw text and sanitize boilerplate
      const rawText = data?.content
        ?.map(p => p?.text || '')
        .filter(Boolean)
        .join('\n')
        .trim();
      
      if (rawText) {
        const sanitized = this.sanitizeLLMText(rawText);
        console.log('[ClaudeLLMClient] Extracted raw text length:', rawText.length);
        console.log('[ClaudeLLMClient] Sanitized text length:', sanitized.length);
        return sanitized;
      }
      
      if (data && data.error) {
        // Handle rate limiting gracefully with a fallback response
        if (data.error.message && data.error.message.includes('rate limit')) {
          return "I'm experiencing high demand right now. Please try your question again in a moment.";
        }
        return `[ClaudeLLMClient] Claude API error: ${data.error.message || JSON.stringify(data.error)}`;
      }
      return '[ClaudeLLMClient] No response from Claude API.';
    } catch (e) {
      console.error('[ClaudeLLMClient] LLM ERROR', { 
        message: e.message, 
        code: e.code, 
        data: e.response?.data,
        stack: e.stack 
      });
      throw e;
    }
  }

  // ✅ Sanitizer to remove boilerplate patterns
  sanitizeLLMText(text) {
    if (!text) return text;

    // DISABLED: Overly aggressive sanitization was stripping valid content
    // The "based on the provided" pattern removes decision record IDs and other critical info
    // For AVS validation, we need the full response including citations
    
    // Only collapse excessive newlines
    let out = text.trim();
    out = out.replace(/\n{3,}/g, '\n\n');
    return out;
  }
}

module.exports = ClaudeLLMClient;
