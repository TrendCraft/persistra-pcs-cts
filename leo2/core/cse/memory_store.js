/**
 * CSE Memory Store
 * 
 * Persistent storage for identity affirmations, challenges, and contextual signals
 * tied to identity salience.
 * 
 * @created June 11, 2025
 * @phase CSE Phase 2
 */

const fs = require('fs').promises;
const path = require('path');
const Logger = require('../../services/logger');

const logger = new Logger();
const MEMORY_FILE_PATH = path.join(__dirname, '../../../data/cse_memory.jsonl');

/**
 * Initialize the memory store
 */
async function initialize() {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(MEMORY_FILE_PATH), { recursive: true });
    // Check if file exists, create if not
    try {
      await fs.access(MEMORY_FILE_PATH);
      logger.info('CSE memory store exists');
    } catch (err) {
      // Create empty file
      await fs.writeFile(MEMORY_FILE_PATH, '');
      logger.info('CSE memory store initialized');
    }
    return true;
  } catch (error) {
    logger.error(`Failed to initialize CSE memory store: ${error.message}`);
    return false;
  }
}

/**
 * Save a memory item to the store
 * @param {Object} item - Memory item to save
 */
async function saveMemory(item) {
  try {
    // Validate item
    if (!item.type || !item.content) {
      throw new Error('Invalid memory item: must have type and content');
    }
    // Add timestamp if not present
    if (!item.timestamp) {
      item.timestamp = Date.now();
    }
    // Add default confidence score if not present
    if (!item.confidenceScore) {
      item.confidenceScore = 0.7;
    }
    // Add source if not present
    if (!item.source) {
      item.source = 'system';
    }
    // Append to JSONL file
    const line = JSON.stringify(item) + '\n';
    await fs.appendFile(MEMORY_FILE_PATH, line);
    logger.debug(`Memory saved: ${item.type} - ${item.content.substring(0, 30)}...`);
    return true;
  } catch (error) {
    logger.error(`Failed to save memory: ${error.message}`);
    return false;
  }
}

/**
 * Load recent memories from the store
 * @param {Object} options - Options for loading memories
 * @param {string} options.type - Type of memories to load (optional)
 * @param {number} options.limit - Maximum number of memories to load (default: 100)
 * @returns {Array} - Array of memory items
 */
async function loadRecentMemories(options = {}) {
  const { type, limit = 100 } = options;
  try {
    // Read file
    let content;
    try {
      content = await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
    } catch (err) {
      logger.warn(`Failed to read memory file: ${err.message}`);
      return [];
    }
    // Parse JSONL
    const lines = content.trim().split('\n').filter(line => line.trim());
    const memories = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        logger.warn(`Failed to parse memory line: ${err.message}`);
        return null;
      }
    }).filter(item => item !== null);
    // Defensive: Warn on non-atomic memory blocks
    for (const m of memories) {
      if (m.content && ((m.content.match(/\n/g) || []).length > 3 || m.content.length > 512)) {
        logger.warn('[CSE] Non-atomic memory detected in loader:', (m.content || '').slice(0, 200));
        // Optionally, throw new Error('Non-atomic memory block found in memory store.');
      }
    }
    // Filter by type if specified
    let filteredMemories = memories;
    if (type) {
      filteredMemories = memories.filter(item => item.type === type);
    }
    // Sort by timestamp (newest first)
    filteredMemories.sort((a, b) => b.timestamp - a.timestamp);
    // Limit results
    return filteredMemories.slice(0, limit);
  } catch (error) {
    logger.error(`Failed to load memories: ${error.message}`);
    return [];
  }
}

module.exports = {
  initialize,
  saveMemory,
  loadRecentMemories
};
