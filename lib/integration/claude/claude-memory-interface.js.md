#!/usr/bin/env node

/**
 * Claude Memory Interface Binding
 * 
 * This module creates the memory interface bindings for Claude's embedded
 * cognitive engine within the Leo Cognitive Shell.
 */

const { LocalSemanticSearch } = require('../services/local-semantic-search');
const fs = require('fs');
const path = require('path');

class ClaudeMemoryInterface {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.dataDir = options.dataDir || path.join(this.projectRoot, 'data');
    this.localSearch = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize local semantic search
      this.localSearch = new LocalSemanticSearch({
        embeddingsFile: path.join(this.dataDir, 'embeddings.jsonl'),
        chunksFile: path.join(this.dataDir, 'chunks.jsonl'),
        cacheDir: path.join(this.dataDir, 'cache'),
        maxResults: 8,
        minRelevanceScore: 0.25
      });

      await this.localSearch.initialize();
      this.initialized = true;
      console.log('🧠 Claude Memory Interface initialized');
      return true;
    } catch (error) {
      console.error('❌ Claude Memory Interface initialization failed:', error.message);
      return false;
    }
  }

  // Core memory binding functions
  async search(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const results = await this.localSearch.search(query, {
      maxResults: options.limit || 5,
      minRelevanceScore: options.threshold || 0.25,
      ...options
    });
    
    return results.results || [];
  }

  async getCode(filter = {}) {
    const codeQuery = filter.component ? 
      `${filter.component} implementation code` : 
      'code implementation';
      
    const results = await this.search(codeQuery, { limit: 10 });
    
    return results.filter(result => 
      result.file && (
        result.file.endsWith('.js') || 
        result.file.endsWith('.ts') ||
        result.file.includes('/lib/') ||
        result.file.includes('/src/')
      )
    );
  }

  async getConversationHistory(topic = null) {
    const query = topic ? 
      `conversation ${topic} development discussion` :
      'conversation development meta-programming';
      
    const results = await this.search(query, { limit: 8 });
    
    return results.filter(result =>
      result.file && (
        result.file.includes('conversation') ||
        result.file.includes('session') ||
        result.content.includes('conversation')
      )
    );
  }
}

module.exports = { ClaudeMemoryInterface };