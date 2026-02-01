/**
 * Path Utilities
 * 
 * Standardized utilities for path operations across Leo components.
 * This module ensures consistent path handling, validation, and normalization.
 */

const fs = require('fs');
const path = require('path');
const configService = require('../config/config');

/**
 * Path utilities class
 */
class PathUtils {
  /**
   * Initialize path utilities
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.config = options.config || configService.getConfig();
  }

  /**
   * Normalize a path to use consistent separators and format
   * @param {string} filePath - Path to normalize
   * @returns {string} Normalized path
   */
  normalize(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid path: path must be a non-empty string');
    }
    return path.normalize(filePath);
  }

  /**
   * Convert a path to an absolute path if it's not already
   * @param {string} filePath - Path to convert
   * @returns {string} Absolute path
   */
  absolute(filePath) {
    const normalizedPath = this.normalize(filePath);
    if (path.isAbsolute(normalizedPath)) {
      return normalizedPath;
    }
    return path.resolve(this.rootDir, normalizedPath);
  }

  /**
   * Get a path relative to a base directory
   * @param {string} filePath - Path to convert
   * @param {string} baseDir - Base directory (defaults to rootDir)
   * @returns {string} Relative path
   */
  relative(filePath, baseDir) {
    const absPath = this.absolute(filePath);
    const absBase = baseDir ? this.absolute(baseDir) : this.rootDir;
    return path.relative(absBase, absPath);
  }

  /**
   * Check if a path exists
   * @param {string} filePath - Path to check
   * @returns {boolean} True if path exists
   */
  exists(filePath) {
    try {
      const absPath = this.absolute(filePath);
      return fs.existsSync(absPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   * @param {string} filePath - Path to check
   * @returns {boolean} True if path is a directory
   */
  isDirectory(filePath) {
    try {
      const absPath = this.absolute(filePath);
      return fs.existsSync(absPath) && fs.statSync(absPath).isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a path is a file
   * @param {string} filePath - Path to check
   * @returns {boolean} True if path is a file
   */
  isFile(filePath) {
    try {
      const absPath = this.absolute(filePath);
      return fs.existsSync(absPath) && fs.statSync(absPath).isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * Join path segments
   * @param {...string} paths - Path segments to join
   * @returns {string} Joined path
   */
  join(...paths) {
    return path.join(...paths);
  }

  /**
   * Get directory name from path
   * @param {string} filePath - Path to process
   * @returns {string} Directory name
   */
  dirname(filePath) {
    return path.dirname(this.normalize(filePath));
  }

  /**
   * Get base name from path
   * @param {string} filePath - Path to process
   * @returns {string} Base name
   */
  basename(filePath) {
    return path.basename(this.normalize(filePath));
  }

  /**
   * Get extension from path
   * @param {string} filePath - Path to process
   * @returns {string} Extension (with leading dot)
   */
  extname(filePath) {
    return path.extname(this.normalize(filePath));
  }
  
  /**
   * Get extension from path (alias for extname for compatibility)
   * @param {string} filePath - Path to process
   * @returns {string} Extension (with leading dot)
   */
  getExtension(filePath) {
    return this.extname(filePath);
  }
  
  /**
   * Check if a file exists (alias for exists for compatibility)
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file exists
   */
  fileExists(filePath) {
    return this.exists(filePath);
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * @param {string} dirPath - Directory path
   * @returns {boolean} True if directory exists or was created
   */
  ensureDirectoryExists(dirPath) {
    try {
      const absPath = this.absolute(dirPath);
      if (!fs.existsSync(absPath)) {
        fs.mkdirSync(absPath, { recursive: true });
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get standard paths from configuration
   * @returns {Object} Standard paths
   */
  getStandardPaths() {
    const config = this.config;
    return {
      root: this.rootDir,
      data: config.paths.data || path.join(this.rootDir, 'data'),
      cache: config.paths.cache || path.join(this.rootDir, 'data', 'cache'),
      logs: config.paths.logs || path.join(this.rootDir, 'logs'),
      embeddings: config.paths.embeddings || path.join(this.rootDir, 'data', 'embeddings.jsonl'),
      chunks: config.paths.chunks || path.join(this.rootDir, 'data', 'chunks.jsonl')
    };
  }

  /**
   * Check if a file matches any of the provided patterns
   * @param {string} filePath - Path to check
   * @param {string[]} patterns - Array of glob patterns
   * @returns {boolean} True if file matches any pattern
   */
  matchesPattern(filePath, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      return false;
    }

    const relativePath = this.relative(filePath);
    
    for (const pattern of patterns) {
      if (this.minimatch(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Read a file asynchronously
   * @param {string} filePath - Path to the file
   * @param {string} encoding - File encoding (default: 'utf8')
   * @returns {Promise<string>} File content
   */
  async readFile(filePath, encoding = 'utf8') {
    try {
      const absPath = this.absolute(filePath);
      if (!this.exists(absPath)) {
        throw new Error(`File not found: ${absPath}`);
      }
      
      // Use promisified fs.readFile
      const { promisify } = require('util');
      const readFileAsync = promisify(fs.readFile);
      
      return await readFileAsync(absPath, { encoding });
    } catch (error) {
      throw new Error(`Error reading file ${filePath}: ${error.message}`);
    }
  }
  
  /**
   * Write to a file asynchronously
   * @param {string} filePath - Path to the file
   * @param {string} content - Content to write
   * @param {string} encoding - File encoding (default: 'utf8')
   * @returns {Promise<boolean>} Success status
   */
  async writeFile(filePath, content, encoding = 'utf8') {
    try {
      const absPath = this.absolute(filePath);
      
      // Ensure directory exists
      const dirPath = this.dirname(absPath);
      this.ensureDirectoryExists(dirPath);
      
      // Use promisified fs.writeFile
      const { promisify } = require('util');
      const writeFileAsync = promisify(fs.writeFile);
      
      await writeFileAsync(absPath, content, { encoding });
      return true;
    } catch (error) {
      throw new Error(`Error writing file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Simple minimatch-like pattern matching
   * @param {string} filePath - Path to check
   * @param {string} pattern - Glob pattern
   * @returns {boolean} True if path matches pattern
   */
  minimatch(filePath, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/{{GLOBSTAR}}/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
}

// Create singleton instance with default options
const pathUtils = new PathUtils();

// Export both the class and singleton instance
module.exports = pathUtils;
module.exports.PathUtils = PathUtils;
