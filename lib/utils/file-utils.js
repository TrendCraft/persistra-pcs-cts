/**
 * Leo Codex File Utilities
 * 
 * This module provides utility functions for file operations.
 */

const fs = require('fs');
const path = require('path');
const { createComponentLogger } = require('./logger');

// Create component logger
const logger = createComponentLogger('file-utils');

/**
 * Ensure a directory exists
 * @param {string} dir - Directory path
 * @returns {boolean} True if directory exists or was created
 */
function ensureDirectoryExists(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created directory: ${dir}`);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to create directory: ${dir}`, { error: error.message });
    return false;
  }
}

/**
 * Read JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {Object} defaultValue - Default value if file doesn't exist or is invalid
 * @returns {Object} Parsed JSON or default value
 */
function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      logger.debug(`File not found, returning default value: ${filePath}`);
      return defaultValue;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(`Failed to read JSON file: ${filePath}`, { error: error.message });
    return defaultValue;
  }
}

/**
 * Write JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {Object} data - Data to write
 * @param {boolean} pretty - Whether to pretty-print JSON
 * @returns {boolean} True if file was written successfully
 */
function writeJsonFile(filePath, data, pretty = true) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    ensureDirectoryExists(dir);
    
    // Write to temporary file first
    const tempFile = `${filePath}.tmp`;
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    
    fs.writeFileSync(tempFile, content, 'utf8');
    
    // Rename to actual file (atomic operation)
    fs.renameSync(tempFile, filePath);
    
    logger.debug(`Wrote JSON file: ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to write JSON file: ${filePath}`, { error: error.message });
    return false;
  }
}

/**
 * Read JSONL file safely
 * @param {string} filePath - Path to JSONL file
 * @returns {Array} Array of parsed JSON objects
 */
function readJsonlFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      logger.debug(`JSONL file not found: ${filePath}`);
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    
    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        logger.warn(`Failed to parse line ${index + 1} in ${filePath}`, { error: error.message });
        return null;
      }
    }).filter(item => item !== null);
  } catch (error) {
    logger.error(`Failed to read JSONL file: ${filePath}`, { error: error.message });
    return [];
  }
}

/**
 * Write JSONL file safely
 * @param {string} filePath - Path to JSONL file
 * @param {Array} data - Array of objects to write
 * @returns {boolean} True if file was written successfully
 */
function writeJsonlFile(filePath, data) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    ensureDirectoryExists(dir);
    
    // Write to temporary file first
    const tempFile = `${filePath}.tmp`;
    const content = data.map(item => JSON.stringify(item)).join('\n');
    
    fs.writeFileSync(tempFile, content, 'utf8');
    
    // Rename to actual file (atomic operation)
    fs.renameSync(tempFile, filePath);
    
    logger.debug(`Wrote JSONL file: ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to write JSONL file: ${filePath}`, { error: error.message });
    return false;
  }
}

/**
 * Get file extension
 * @param {string} filePath - File path
 * @returns {string} File extension (with dot)
 */
function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

/**
 * Check if file has a specific extension
 * @param {string} filePath - File path
 * @param {Array} extensions - Array of extensions to check (with dot)
 * @returns {boolean} True if file has one of the extensions
 */
function hasExtension(filePath, extensions) {
  const ext = getFileExtension(filePath);
  return extensions.includes(ext);
}

/**
 * Get file size in bytes
 * @param {string} filePath - File path
 * @returns {number} File size in bytes, or -1 if file doesn't exist
 */
function getFileSize(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return -1;
    }
    
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    logger.error(`Failed to get file size: ${filePath}`, { error: error.message });
    return -1;
  }
}

/**
 * Get file modification time
 * @param {string} filePath - File path
 * @returns {Date} File modification time, or null if file doesn't exist
 */
function getFileModTime(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch (error) {
    logger.error(`Failed to get file modification time: ${filePath}`, { error: error.message });
    return null;
  }
}

// Export utilities
module.exports = {
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile,
  readJsonlFile,
  writeJsonlFile,
  getFileExtension,
  hasExtension,
  getFileSize,
  getFileModTime
};
