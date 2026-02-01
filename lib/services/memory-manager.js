/**
 * Memory Manager Service
 * 
 * Provides a unified interface for storing and retrieving memory items
 * across different memory systems in Leo.
 * 
 * @module lib/services/memory-manager
 * @author Leo Development Team
 * @created May 13, 2025
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');
const { sessionAwarenessAdapter } = require('../integration/session-awareness-adapter');

// Create logger
const logger = createComponentLogger('memory-manager');

/**
 * Memory Manager Service
 * 
 * Manages different types of memories in Leo:
 * - Short-term memory (current session)
 * - Long-term memory (persisted across sessions)
 * - Episodic memory (time-based events)
 * - Semantic memory (concepts and knowledge)
 */
class MemoryManager {
  constructor() {
    this.initialized = false;
    this.memoryDir = path.join(process.cwd(), 'data', 'memory');
    this.memories = {
      shortTerm: new Map(),
      longTerm: new Map(),
      episodic: new Map(),
      semantic: new Map()
    };
  }

  /**
   * Initialize the memory manager
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('Memory manager already initialized');
      return;
    }

    logger.info('Initializing memory manager...');

    // Create memory directory if it doesn't exist
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      logger.info(`Memory directory created: ${this.memoryDir}`);
    } catch (error) {
      logger.error(`Error creating memory directory: ${error.message}`);
      throw error;
    }

    // Load existing memories
    await this.loadMemories();

    this.initialized = true;
    logger.info('Memory manager initialized successfully');
    eventBus.emit('service:initialized', { service: 'memory-manager', timestamp: Date.now() });
  }

  /**
   * Load existing memories from storage
   */
  async loadMemories() {
    try {
      // Load long-term memories
      const longTermPath = path.join(this.memoryDir, 'long-term.json');
      try {
        const longTermData = await fs.readFile(longTermPath, 'utf8');
        const longTermMemories = JSON.parse(longTermData);
        for (const [key, value] of Object.entries(longTermMemories)) {
          this.memories.longTerm.set(key, value);
        }
        logger.info(`Loaded ${this.memories.longTerm.size} long-term memories`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error loading long-term memories: ${error.message}`);
        }
      }

      // Load semantic memories
      const semanticPath = path.join(this.memoryDir, 'semantic.json');
      try {
        const semanticData = await fs.readFile(semanticPath, 'utf8');
        const semanticMemories = JSON.parse(semanticData);
        for (const [key, value] of Object.entries(semanticMemories)) {
          this.memories.semantic.set(key, value);
        }
        logger.info(`Loaded ${this.memories.semantic.size} semantic memories`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error loading semantic memories: ${error.message}`);
        }
      }

      // Load episodic memories
      const episodicPath = path.join(this.memoryDir, 'episodic.json');
      try {
        const episodicData = await fs.readFile(episodicPath, 'utf8');
        const episodicMemories = JSON.parse(episodicData);
        for (const [key, value] of Object.entries(episodicMemories)) {
          this.memories.episodic.set(key, value);
        }
        logger.info(`Loaded ${this.memories.episodic.size} episodic memories`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Error loading episodic memories: ${error.message}`);
        }
      }

      // Load short-term memories from session awareness adapter
      try {
        const shortTermMemories = await sessionAwarenessAdapter.getData('short_term_memories');
        if (shortTermMemories) {
          for (const [key, value] of Object.entries(shortTermMemories)) {
            this.memories.shortTerm.set(key, value);
          }
          logger.info(`Loaded ${this.memories.shortTerm.size} short-term memories`);
        }
      } catch (error) {
        logger.warn(`Error loading short-term memories: ${error.message}`);
      }
    } catch (error) {
      logger.error(`Error loading memories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save memories to storage
   */
  async saveMemories() {
    try {
      // Save long-term memories
      const longTermPath = path.join(this.memoryDir, 'long-term.json');
      const longTermData = JSON.stringify(Object.fromEntries(this.memories.longTerm), null, 2);
      await fs.writeFile(longTermPath, longTermData);

      // Save semantic memories
      const semanticPath = path.join(this.memoryDir, 'semantic.json');
      const semanticData = JSON.stringify(Object.fromEntries(this.memories.semantic), null, 2);
      await fs.writeFile(semanticPath, semanticData);

      // Save episodic memories
      const episodicPath = path.join(this.memoryDir, 'episodic.json');
      const episodicData = JSON.stringify(Object.fromEntries(this.memories.episodic), null, 2);
      await fs.writeFile(episodicPath, episodicData);

      // Save short-term memories to session awareness adapter
      await sessionAwarenessAdapter.storeData('short_term_memories', Object.fromEntries(this.memories.shortTerm));

      logger.info('Memories saved successfully');
    } catch (error) {
      logger.error(`Error saving memories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store a memory item
   * @param {string} type - Type of memory (shortTerm, longTerm, episodic, semantic)
   * @param {string} key - Memory key
   * @param {any} value - Memory value
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status
   */
  async storeMemory(type, key, value, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.memories[type]) {
      throw new Error(`Invalid memory type: ${type}`);
    }

    try {
      // Add timestamp if not provided
      const memoryValue = {
        ...value,
        timestamp: value.timestamp || Date.now()
      };

      this.memories[type].set(key, memoryValue);
      
      // Save immediately for long-term, episodic, and semantic memories
      if (type !== 'shortTerm') {
        await this.saveMemories();
      } else {
        // For short-term memories, save to session awareness adapter
        await sessionAwarenessAdapter.storeData('short_term_memories', Object.fromEntries(this.memories.shortTerm));
      }

      logger.info(`Stored ${type} memory: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Error storing ${type} memory: ${error.message}`);
      return false;
    }
  }

  /**
   * Retrieve a memory item
   * @param {string} type - Type of memory (shortTerm, longTerm, episodic, semantic)
   * @param {string} key - Memory key
   * @returns {Promise<any>} Memory value
   */
  async retrieveMemory(type, key) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.memories[type]) {
      throw new Error(`Invalid memory type: ${type}`);
    }

    return this.memories[type].get(key);
  }

  /**
   * Retrieve all memories of a specific type
   * @param {string} type - Type of memory (shortTerm, longTerm, episodic, semantic)
   * @returns {Promise<Map>} Map of memories
   */
  async retrieveAllMemories(type) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.memories[type]) {
      throw new Error(`Invalid memory type: ${type}`);
    }

    return this.memories[type];
  }

  /**
   * Search for memories by content
   * @param {string} type - Type of memory (shortTerm, longTerm, episodic, semantic)
   * @param {Function} predicate - Function to filter memories
   * @returns {Promise<Array>} Array of matching memories
   */
  async searchMemories(type, predicate) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.memories[type]) {
      throw new Error(`Invalid memory type: ${type}`);
    }

    const results = [];
    for (const [key, value] of this.memories[type].entries()) {
      if (predicate(value, key)) {
        results.push({ key, value });
      }
    }

    return results;
  }

  /**
   * Delete a memory item
   * @param {string} type - Type of memory (shortTerm, longTerm, episodic, semantic)
   * @param {string} key - Memory key
   * @returns {Promise<boolean>} Success status
   */
  async deleteMemory(type, key) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.memories[type]) {
      throw new Error(`Invalid memory type: ${type}`);
    }

    try {
      const deleted = this.memories[type].delete(key);
      
      if (deleted) {
        // Save immediately for long-term, episodic, and semantic memories
        if (type !== 'shortTerm') {
          await this.saveMemories();
        } else {
          // For short-term memories, save to session awareness adapter
          await sessionAwarenessAdapter.storeData('short_term_memories', Object.fromEntries(this.memories.shortTerm));
        }
        
        logger.info(`Deleted ${type} memory: ${key}`);
      }
      
      return deleted;
    } catch (error) {
      logger.error(`Error deleting ${type} memory: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all memories of a specific type
   * @param {string} type - Type of memory (shortTerm, longTerm, episodic, semantic)
   * @returns {Promise<boolean>} Success status
   */
  async clearMemories(type) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.memories[type]) {
      throw new Error(`Invalid memory type: ${type}`);
    }

    try {
      this.memories[type].clear();
      
      // Save immediately for long-term, episodic, and semantic memories
      if (type !== 'shortTerm') {
        await this.saveMemories();
      } else {
        // For short-term memories, save to session awareness adapter
        await sessionAwarenessAdapter.storeData('short_term_memories', Object.fromEntries(this.memories.shortTerm));
      }
      
      logger.info(`Cleared all ${type} memories`);
      return true;
    } catch (error) {
      logger.error(`Error clearing ${type} memories: ${error.message}`);
      return false;
    }
  }
}

// Create singleton instance
const memoryManager = new MemoryManager();

module.exports = {
  memoryManager
};
