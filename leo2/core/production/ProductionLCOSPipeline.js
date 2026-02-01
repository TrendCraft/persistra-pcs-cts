/**
 * Production LCOS Pipeline
 * 
 * Streamlined hot path implementation with:
 * - No heuristic overrides (trust embeddings + salience)
 * - Stored embeddings (no per-chunk generation)
 * - Adaptive context cards with token budgets
 * - Simple memory hygiene gates
 * - Fast win sanity checks
 * 
 * @created 2025-09-02
 * @phase Production Hardening
 */

const crypto = require('crypto');
const { createComponentLogger } = require('../../../lib/utils/logger');

const COMPONENT_NAME = 'production-lcos-pipeline';
const logger = createComponentLogger(COMPONENT_NAME);

class ContextCardCache {
  constructor() {
    this.tokenCounts = new Map();
  }
  
  addCard(cardId, content) {
    // Precompute and cache token count (rough estimation: 4 chars = 1 token)
    const tokenCount = Math.ceil(content.length / 4);
    this.tokenCounts.set(cardId, tokenCount);
    return { cardId, content, tokens: tokenCount };
  }
  
  greedyFitCards(cards, budget) {
    let remaining = budget;
    const selected = [];
    
    for (const card of cards) {
      const tokens = this.tokenCounts.get(card.cardId) || 0;
      if (remaining >= tokens) {
        selected.push(card);
        remaining -= tokens;
      }
    }
    
    return selected;
  }
}

class SanityChecks {
  static async expandSearchIfNeeded(annResults, memoryGraph, queryEmbedding) {
    if (annResults.length < 5) {
      logger.info('[SANITY CHECK] Low ANN results, expanding search');
      return await memoryGraph.searchMemories({ 
        embedding: queryEmbedding, 
        limit: 500 
      });
    }
    return annResults;
  }
  
  static detectIncompleteResponse(response) {
    return !response.match(/[.!?]$/) && response.length > 50;
  }
  
  static stripMetaCommentary(response) {
    const patterns = [
      /based on the context provided/gi,
      /according to the information/gi,
      /from what I can see in the/gi,
      /based on the provided context/gi,
      /from the memory context/gi
    ];
    
    let cleaned = response;
    patterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    return cleaned.trim();
  }
}

class ProductionLCOSPipeline {
  constructor(config = {}) {
    // Drop-in guardrails config
    this.config = {
      K_INITIAL: config.K_INITIAL || 200,
      N_CARDS_MAX: config.N_CARDS_MAX || 10,
      SIMILARITY_WEIGHT: config.SIMILARITY_WEIGHT || 0.75,
      RECENCY_BOOST_MAX: config.RECENCY_BOOST_MAX || 0.15,
      AUTHORITY_BOOST_MAX: config.AUTHORITY_BOOST_MAX || 0.10,
      SYSTEM_BUDGET: config.SYSTEM_BUDGET || 600,
      CONTEXT_BUDGET: config.CONTEXT_BUDGET || 2200,
      USER_BUDGET: config.USER_BUDGET || 800,
      // Simple memory gates
      MIN_CONFIDENCE: config.MIN_CONFIDENCE || 0.6,
      MIN_CONTENT_LEN: config.MIN_CONTENT_LEN || 40,
      ...config
    };
    
    this.contextCardCache = new ContextCardCache();
    this.recentHashes = new Set();
    
    // Initialize components
    this.memoryGraph = config.memoryGraph;
    this.embeddings = config.embeddings;
    this.llmInterface = config.llmInterface;
    
    logger.info('ProductionLCOSPipeline initialized', {
      config: this.config
    });
  }
  
  async processQuery(userInput, context = {}) {
    const startTime = Date.now();
    
    try {
      // 1. Embed query
      const queryEmbedding = await this.embeddings.generate(userInput);
      
      // 2. ANN search → top-K
      let candidates = await this.memoryGraph.searchMemories({ 
        embedding: queryEmbedding, 
        limit: this.config.K_INITIAL 
      });
      
      // Sanity check: If ANN returns < 5 items, expand K once
      candidates = await SanityChecks.expandSearchIfNeeded(
        candidates, 
        this.memoryGraph, 
        queryEmbedding
      );
      
      // 3. Compute salience (fast, from stored fields)
      const withSalience = candidates.map(chunk => ({
        ...chunk,
        salience: this.computeFastSalience(chunk, queryEmbedding)
      }));
      
      // 4. Diversify by type (small quotas)
      const diversified = this.diversifyByType(withSalience);
      
      // 5. Build ≤10 context cards; greedy-fit into budget
      const contextCards = this.buildContextCards(diversified);
      
      // 6. Prompt → LLM
      const response = await this.generateResponse(userInput, contextCards, context);
      
      // 7. Write memory only if passes simple gates
      await this.conditionalMemoryWrite(userInput, response, withSalience, context);
      
      const processedResponse = this.postProcessResponse(response);
      
      return {
        response: processedResponse,
        metadata: {
          processingTime: Date.now() - startTime,
          candidatesFound: candidates.length,
          contextCardsUsed: contextCards.length,
          salienceRange: this.getSalienceRange(withSalience)
        }
      };
      
    } catch (error) {
      logger.error('Query processing failed', { error: error.message });
      throw error;
    }
  }
  
  computeFastSalience(chunk, queryEmbedding) {
    // Fast salience: a·similarity + b·recency + c·authority (from stored fields)
    const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding || []);
    
    // Recency boost from stored timestamp
    let recencyBoost = 0;
    if (chunk.timestamp) {
      const ageDays = (Date.now() - chunk.timestamp) / (24 * 60 * 60 * 1000);
      if (ageDays < 7) recencyBoost = 0.10;
      else if (ageDays < 30) recencyBoost = 0.05;
    }
    
    // Authority boost from stored importance
    let authorityBoost = 0;
    const importance = chunk.metadata?.importance || chunk.importance || 0.5;
    if (importance > 0.8) authorityBoost = this.config.AUTHORITY_BOOST_MAX;
    
    return (similarity * this.config.SIMILARITY_WEIGHT) + 
           Math.min(recencyBoost, this.config.RECENCY_BOOST_MAX) + 
           authorityBoost;
  }
  
  diversifyByType(sortedChunks) {
    const typeQuotas = {
      'documentation': 4,
      'architecture': 3,
      'code': 2,
      'conversation': 1
    };
    
    const selected = [];
    const typeCounts = {};
    
    // Sort by salience first
    const sorted = sortedChunks.sort((a, b) => b.salience - a.salience);
    
    for (const chunk of sorted) {
      const type = chunk.type || chunk.metadata?.type || 'unknown';
      const quota = typeQuotas[type] || 1;
      const count = typeCounts[type] || 0;
      
      if (count < quota && selected.length < this.config.N_CARDS_MAX) {
        selected.push(chunk);
        typeCounts[type] = count + 1;
      }
    }
    
    return selected;
  }
  
  buildContextCards(chunks) {
    const cards = chunks.map((chunk, index) => ({
      cardId: `card_${index}`,
      content: `Context: ${chunk.content || chunk.summary || 'No content'}`,
      priority: chunk.salience,
      originalChunk: chunk
    }));
    
    // Precompute tokens for new cards
    cards.forEach(card => {
      if (!this.contextCardCache.tokenCounts.has(card.cardId)) {
        this.contextCardCache.addCard(card.cardId, card.content);
      }
    });
    
    // Sort by priority and greedy fit into context budget
    const prioritized = cards.sort((a, b) => b.priority - a.priority);
    return this.contextCardCache.greedyFitCards(prioritized, this.config.CONTEXT_BUDGET);
  }
  
  async generateResponse(userInput, contextCards, context) {
    const messages = [];
    
    // System message with fixed budget
    let systemMessage = "You have access to LPAC (Leo Persistent AI Cognition), a system that provides project memory and context for this development project.";
    
    // Add context cards in priority order
    if (contextCards.length > 0) {
      const contextContent = contextCards.map(card => card.content).join('\n\n');
      systemMessage += `\n\nRelevant project context:\n${contextContent}`;
    }
    
    systemMessage += `

You should:
- Use the provided project context when it's relevant to the question
- Draw upon your general knowledge and training when the context doesn't contain sufficient information
- Combine both sources naturally to provide comprehensive, helpful responses
- Be honest about what information comes from the project vs your general knowledge when appropriate

Respond naturally as Leo, integrating project context with your broader knowledge base.`;
    
    messages.push({ role: 'system', content: systemMessage });
    messages.push({ role: 'user', content: userInput });
    
    // Generate response via LLM interface
    const response = await this.llmInterface.generateResponse(messages, {
      maxTokens: 2000,
      temperature: 0.7
    });
    
    return response;
  }
  
  async conditionalMemoryWrite(userInput, response, context, requestContext) {
    try {
      // Simple gates (not over-engineered)
      const confidence = this.estimateConfidence(response, context);
      
      if (confidence >= this.config.MIN_CONFIDENCE && 
          response.length >= this.config.MIN_CONTENT_LEN &&
          !this.isDuplicate(userInput, response)) {
        
        await this.memoryGraph.addMemory({
          type: 'interaction',
          content: `User: ${userInput}\nLeo: ${response}`,
          confidence,
          timestamp: Date.now(),
          sessionId: requestContext.sessionId || 'unknown',
          metadata: {
            processingPipeline: 'production_lcos_v1',
            contextCardsUsed: context.length
          }
        });
        
        logger.debug('Memory written', { confidence, responseLength: response.length });
      } else {
        logger.debug('Memory write blocked', { 
          confidence, 
          responseLength: response.length,
          isDuplicate: this.isDuplicate(userInput, response)
        });
      }
    } catch (error) {
      logger.warn('Memory write failed', { error: error.message });
    }
  }
  
  postProcessResponse(response) {
    // Strip LLM meta-commentary post-hoc (UI veneer)
    let cleaned = SanityChecks.stripMetaCommentary(response);
    
    // If answer ends mid-sentence, log for potential continuation
    if (SanityChecks.detectIncompleteResponse(cleaned)) {
      logger.warn('[SANITY CHECK] Incomplete response detected', {
        responseLength: cleaned.length,
        endsWithPunctuation: /[.!?]$/.test(cleaned)
      });
    }
    
    return cleaned;
  }
  
  // Helper methods
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
  }
  
  estimateConfidence(response, context) {
    // Simple confidence estimation
    let confidence = 0.5;
    
    // Boost confidence based on context quality
    if (context && context.length > 0) {
      const avgSalience = context.reduce((sum, c) => sum + (c.salience || 0), 0) / context.length;
      confidence += avgSalience * 0.3;
    }
    
    // Boost confidence based on response quality indicators
    if (response.length > 100) confidence += 0.1;
    if (response.includes('```')) confidence += 0.1; // Code examples
    if (response.match(/\d+/)) confidence += 0.05; // Specific details
    
    return Math.min(1.0, confidence);
  }
  
  isDuplicate(userInput, response) {
    // Simple hash-based dedup (not over-engineered)
    const hash = crypto
      .createHash('sha256')
      .update(userInput + response)
      .digest('hex');
    
    if (this.recentHashes.has(hash)) {
      return true;
    }
    
    this.recentHashes.add(hash);
    
    // Keep only recent hashes (memory management)
    if (this.recentHashes.size > 1000) {
      const hashes = Array.from(this.recentHashes);
      this.recentHashes.clear();
      hashes.slice(-500).forEach(h => this.recentHashes.add(h));
    }
    
    return false;
  }
  
  getSalienceRange(withSalience) {
    if (withSalience.length === 0) return { min: 0, max: 0, avg: 0 };
    
    const saliences = withSalience.map(c => c.salience);
    return {
      min: Math.min(...saliences),
      max: Math.max(...saliences),
      avg: saliences.reduce((sum, s) => sum + s, 0) / saliences.length
    };
  }
}

module.exports = ProductionLCOSPipeline;
