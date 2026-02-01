/**
 * Path Utilities Adapter
 * 
 * This adapter provides a consistent interface for path operations.
 * It addresses interface mismatches between the expected MVL interface and the
 * actual implementation in the path-utils.js module.
 * 
 * IMPORTANT: This adapter follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const pathUtils = require('../utils/path-utils');
const eventBus = require('../utils/event-bus');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Component name for logging and events
const COMPONENT_NAME = 'path-utils-adapter';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Promisify fs functions
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

/**
 * Resolve a path to its absolute form
 * @param {string} filePath - Path to resolve
 * @returns {string} Absolute path
 */
function absolute(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.absolute === 'function') {
      return pathUtils.absolute(filePath);
    }
    
    // Fallback implementation
    return path.resolve(filePath);
  } catch (error) {
    logger.error(`Error resolving absolute path: ${error.message}`);
    return filePath;
  }
}

/**
 * Normalize a path
 * @param {string} filePath - Path to normalize
 * @returns {string} Normalized path
 */
function normalize(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.normalize === 'function') {
      return pathUtils.normalize(filePath);
    }
    
    // Fallback implementation
    return path.normalize(filePath);
  } catch (error) {
    logger.error(`Error normalizing path: ${error.message}`);
    return filePath;
  }
}

/**
 * Get the extension of a file
 * @param {string} filePath - Path to the file
 * @returns {string} File extension
 */
function getExtension(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.getExtension === 'function') {
      return pathUtils.getExtension(filePath);
    }
    
    // Fallback implementation
    return path.extname(filePath).toLowerCase();
  } catch (error) {
    logger.error(`Error getting file extension: ${error.message}`);
    return '';
  }
}

/**
 * Read a file
 * @param {string} filePath - Path to the file
 * @param {string} encoding - File encoding (default: 'utf8')
 * @returns {Promise<string>} File content
 */
async function readFile(filePath, encoding = 'utf8') {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.readFile === 'function') {
      return await pathUtils.readFile(filePath, encoding);
    }
    
    // Fallback implementation
    const content = await readFileAsync(filePath, { encoding });
    
    logger.debug(`Read file: ${filePath} (${content.length} bytes)`);
    
    // Emit event for monitoring
    eventBus.emit('file:read', { 
      component: COMPONENT_NAME,
      path: filePath,
      size: content.length
    });
    
    return content;
  } catch (error) {
    logger.error(`Error reading file ${filePath}: ${error.message}`);
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to read file: ${filePath}`, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Write to a file
 * @param {string} filePath - Path to the file
 * @param {string} content - Content to write
 * @param {string} encoding - File encoding (default: 'utf8')
 * @returns {Promise<boolean>} Success status
 */
async function writeFile(filePath, content, encoding = 'utf8') {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.writeFile === 'function') {
      return await pathUtils.writeFile(filePath, content, encoding);
    }
    
    // Ensure directory exists
    const dirPath = path.dirname(filePath);
    await ensureDirectoryExists(dirPath);
    
    // Write file
    await writeFileAsync(filePath, content, { encoding });
    
    logger.debug(`Wrote file: ${filePath} (${content.length} bytes)`);
    
    // Emit event for monitoring
    eventBus.emit('file:written', { 
      component: COMPONENT_NAME,
      path: filePath,
      size: content.length
    });
    
    return true;
  } catch (error) {
    logger.error(`Error writing file ${filePath}: ${error.message}`);
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to write file: ${filePath}`, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Ensure a directory exists
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<boolean>} Success status
 */
async function ensureDirectoryExists(dirPath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.ensureDirectoryExists === 'function') {
      return await pathUtils.ensureDirectoryExists(dirPath);
    }
    
    // Fallback implementation
    if (!fs.existsSync(dirPath)) {
      await mkdirAsync(dirPath, { recursive: true });
      
      logger.debug(`Created directory: ${dirPath}`);
      
      // Emit event for monitoring
      eventBus.emit('directory:created', { 
        component: COMPONENT_NAME,
        path: dirPath
      });
    }
    
    return true;
  } catch (error) {
    logger.error(`Error ensuring directory exists ${dirPath}: ${error.message}`);
    // Emit error event
    eventBus.emit('error', { 
      component: COMPONENT_NAME, 
      message: `Failed to create directory: ${dirPath}`, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Check if a path exists
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the path exists
 */
function exists(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.exists === 'function') {
      return pathUtils.exists(filePath);
    }
    
    // Fallback implementation
    return fs.existsSync(filePath);
  } catch (error) {
    logger.error(`Error checking if path exists ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Get relative path from one path to another
 * @param {string} filePath - Path to get relative path for
 * @param {string} baseDir - Base directory to get relative path from
 * @returns {string} Relative path
 */
function relative(filePath, baseDir) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.relative === 'function') {
      return pathUtils.relative(filePath, baseDir);
    }
    
    // Fallback implementation
    return path.relative(baseDir, filePath);
  } catch (error) {
    logger.error(`Error getting relative path: ${error.message}`);
    return filePath;
  }
}

/**
 * Check if a path is a directory
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the path is a directory
 */
function isDirectory(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.isDirectory === 'function') {
      return pathUtils.isDirectory(filePath);
    }
    
    // Fallback implementation
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch (error) {
    logger.error(`Error checking if path is directory: ${error.message}`);
    return false;
  }
}

/**
 * Check if a path is a file
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the path is a file
 */
function isFile(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.isFile === 'function') {
      return pathUtils.isFile(filePath);
    }
    
    // Fallback implementation
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (error) {
    logger.error(`Error checking if path is file: ${error.message}`);
    return false;
  }
}

/**
 * Join path segments
 * @param {...string} paths - Path segments to join
 * @returns {string} Joined path
 */
function join(...paths) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.join === 'function') {
      return pathUtils.join(...paths);
    }
    
    // Fallback implementation
    return path.join(...paths);
  } catch (error) {
    logger.error(`Error joining paths: ${error.message}`);
    return paths[0] || '';
  }
}

/**
 * Get the directory name of a path
 * @param {string} filePath - Path to get directory name from
 * @returns {string} Directory name
 */
function dirname(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.dirname === 'function') {
      return pathUtils.dirname(filePath);
    }
    
    // Fallback implementation
    return path.dirname(filePath);
  } catch (error) {
    logger.error(`Error getting directory name: ${error.message}`);
    return filePath;
  }
}

/**
 * Get the base name of a path
 * @param {string} filePath - Path to get base name from
 * @returns {string} Base name
 */
function basename(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.basename === 'function') {
      return pathUtils.basename(filePath);
    }
    
    // Fallback implementation
    return path.basename(filePath);
  } catch (error) {
    logger.error(`Error getting base name: ${error.message}`);
    return filePath;
  }
}

/**
 * Get the extension of a file
 * @param {string} filePath - Path to get extension from
 * @returns {string} File extension
 */
function extname(filePath) {
  try {
    // Use the underlying implementation if available
    if (typeof pathUtils.extname === 'function') {
      return pathUtils.extname(filePath);
    }
    
    // Fallback implementation
    return path.extname(filePath);
  } catch (error) {
    logger.error(`Error getting file extension: ${error.message}`);
    return '';
  }
}

// Export the adapter API
module.exports = {
  absolute,
  normalize,
  relative,
  exists,
  isDirectory,
  isFile,
  join,
  dirname,
  basename,
  extname,
  getExtension,
  readFile,
  writeFile,
  ensureDirectoryExists
};
