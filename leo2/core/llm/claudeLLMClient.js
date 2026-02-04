// leo2/core/llm/claudeLLMClient.js
// Claude LLM Client Adapter for Leo Orchestrator (primary LLM backend)
const fetch = require('node-fetch');
const path = require('path');
const { extractClaudeText } = require('../../utils/extractClaudeText');

const { getAnthropicApiKey } = require('./anthropicProvider');
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// PCS-CTS: Pin model and temperature for deterministic validation
// Model: claude-sonnet-4-20250514 (current valid snapshot ID)
// Temperature: 0 (deterministic responses)
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const CLAUDE_TEMPERATURE = 0;
const CLAUDE_MAX_TOKENS = 4096;

class ClaudeLLMClient {
  constructor(options = {}) {
    this.model = options.model || CLAUDE_MODEL;
    this.endpoint = options.endpoint || CLAUDE_API_URL;
    // Don't cache API key in constructor - get it fresh each time
    
    // PCS-CTS: Retry configuration for transient failures
    this.maxRetries = 3;
    this.baseRetryDelay = 1000; // 1 second
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
    console.log('[ClaudeLLMClient] generate() called');
    
    // Handle both old and new calling conventions
    let actualPrompt, max_tokens, temperature, context, systemPrompt;
    
    if (typeof prompt === 'object' && prompt.prompt) {
      // New style: generate({ prompt, max_tokens, temperature, system })
      actualPrompt = prompt.prompt;
      max_tokens = prompt.max_tokens || CLAUDE_MAX_TOKENS;
      temperature = CLAUDE_TEMPERATURE; // Always use deterministic temperature
      context = prompt.context || [];
      systemPrompt = prompt.system;
    } else {
      // Old style: generate(prompt, { max_tokens, temperature })
      actualPrompt = prompt;
      max_tokens = options.max_tokens || CLAUDE_MAX_TOKENS;
      temperature = CLAUDE_TEMPERATURE; // Always use deterministic temperature
      context = options.context || [];
      systemPrompt = options.system;
    }
    
    // PCS-CTS: Retry wrapper for transient failures
    return await this._executeWithRetry(async () => {
      return await this._generateInternal(actualPrompt, max_tokens, temperature, systemPrompt);
    });
  }

  /**
   * Execute API call with exponential backoff retry logic
   * Retries: 3 attempts with 1s, 2s, 4s delays (+ jitter)
   * Retry conditions: timeouts, network errors, 429, 500/502/503/504
   * Never retry: 400/401/403 (bad request/auth/perms)
   */
  async _executeWithRetry(apiCall) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this._isRetryableError(error);
        
        if (!isRetryable || attempt === this.maxRetries) {
          // Don't retry on final attempt or non-retryable errors
          throw error;
        }
        
        // Calculate delay with exponential backoff + jitter
        const baseDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 200; // 0-200ms jitter
        const delay = baseDelay + jitter;
        
        console.log(`[ClaudeLLMClient] ⚠️  API error (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
        console.log(`[ClaudeLLMClient]    Retrying in ${Math.round(delay)}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Determine if an error is retryable
   * Retry: timeouts, network errors, 429 (rate limit), 500/502/503/504 (server errors)
   * Never retry: 400 (bad request), 401 (bad API key), 403 (forbidden)
   */
  _isRetryableError(error) {
    // Network/timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    // Check HTTP status from error message or response
    const errorMsg = error.message || '';
    const status = error.status || error.statusCode;
    
    // Rate limiting (429)
    if (status === 429 || errorMsg.includes('rate limit')) {
      return true;
    }
    
    // Server errors (500, 502, 503, 504)
    if (status >= 500 && status < 600) {
      return true;
    }
    
    // Never retry client errors (400, 401, 403)
    if (status === 400 || status === 401 || status === 403) {
      return false;
    }
    
    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Internal generate method (called by retry wrapper)
   */
  async _generateInternal(actualPrompt, max_tokens, temperature, systemPrompt) {
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
      
      if (Array.isArray(actualPrompt)) {
        const filteredMessages = actualPrompt.filter(msg => 
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
        messages: validMessages,
        // PCS-CTS: Additional deterministic settings
        top_p: 1.0 // Disable nucleus sampling for determinism
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
        body: JSON.stringify(body),
        timeout: 60000 // 60 second timeout
      });
      
      // Check for HTTP errors and throw with status for retry logic
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.statusCode = response.status;
        throw error;
      }
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.error('[ClaudeLLMClient] Failed to parse JSON:', text);
        const error = new Error('Claude API returned non-JSON response');
        error.status = 500; // Treat as server error for retry
        throw error;
      }
      console.log('[ClaudeLLMClient] HTTP status:', response.status);
      
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
        // Throw error with proper status for retry logic
        const error = new Error(`Claude API error: ${data.error.message || JSON.stringify(data.error)}`);
        error.status = data.error.type === 'rate_limit_error' ? 429 : 500;
        throw error;
      }
      
      if (!rawText) {
        const error = new Error('No response from Claude API');
        error.status = 500;
        throw error;
      }
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
