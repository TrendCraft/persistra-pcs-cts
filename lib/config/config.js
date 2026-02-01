/**
 * Leo Codex Configuration
 * 
 * This module provides a centralized configuration system for Leo Codex.
 * It supports loading configuration from:
 * 1. Default values
 * 2. Environment variables
 * 3. Configuration files (.leorc, .leorc.json, .leorc.js)
 * 4. Programmatic configuration
 * 
 * Configuration precedence (highest to lowest):
 * 1. Programmatic configuration (updateConfig)
 * 2. Environment variables
 * 3. Configuration files
 * 4. Default values
 *
 * IMPORTANT: All components should access configuration through this service
 * using the standardized property paths defined in LEO_STANDARDIZATION.md.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Simple logger to avoid circular dependencies
const simpleLogger = {
  info: (message, data) => console.log(`[INFO] [config] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] [config] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] [config] ${message}`, data || '')
};

// Configuration listeners
const listeners = new Map();

// Find configuration file
function findConfigFile() {
  const configFiles = [
    '.leorc',
    '.leorc.json',
    '.leorc.js',
    path.join(os.homedir(), '.leorc')
  ];
  
  for (const file of configFiles) {
    try {
      if (fs.existsSync(file)) {
        return file;
      }
    } catch (error) {
      // Ignore errors when checking for config files
    }
  }
  
  return null;
}

// Load configuration from file
function loadConfigFromFile(configFile) {
  try {
    if (configFile.endsWith('.js')) {
      return require(configFile);
    } else {
      const content = fs.readFileSync(configFile, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    simpleLogger.warn(`Failed to load configuration from ${configFile}: ${error.message}`);
    return {};
  }
}

// Base directory for Leo
const BASE_DIR = process.cwd();

// Default configuration - THE AUTHORITATIVE SOURCE OF DEFAULT VALUES
// All components should reference these properties using the exact paths shown here
const defaultConfig = {
  // Server configuration
  server: {
    port: 3000,
    host: 'localhost',
    enableCors: true,
  },
  
  // File paths
  paths: {
    // Data files
    embeddings: path.join(BASE_DIR, 'data', 'embeddings.jsonl'),
    chunks: path.join(BASE_DIR, 'data', 'chunks.jsonl'),
    
    // Log files
    logs: path.join(BASE_DIR, 'logs'),
    
    // Cache directory
    cache: path.join(BASE_DIR, 'data', 'cache'),
    
    // Test projects
    testProjects: path.join(BASE_DIR, 'test-projects'),
  },
  
  // File watching configuration
  watching: { // STANDARDIZED NAME: changed from fileWatcher to watching
    // Directories to watch
    directories: [path.join(BASE_DIR)], // STANDARDIZED NAME: changed from watchDirs to directories
    
    // File patterns to ignore
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/logs/**',
      '**/*.min.js',
      '**/*.bundle.js'
    ],
    
    // File extensions to watch
    fileExtensions: ['.js', '.jsx', '.ts', '.tsx', '.md', '.json', '.html', '.css', '.scss'],
    
    // Directories to ignore
    ignoreDirs: ['node_modules', 'dist', 'build', '.git', 'logs'],
    
    // Debounce time in milliseconds
    debounceMs: 1000,
  },
  
  // Chunking configuration
  chunking: {
    maxChunkSize: 1000,
    minChunkSize: 100,
    chunkOverlap: 20,
    useSemanticChunker: true,
  },
  
  // Embedding configuration
  embedding: {
    useTrueEmbeddings: true,
    model: 'local',
    dimensions: 384,
    batchSize: 10,
    maxConcurrent: 3,
    useSemanticEmbeddings: true,
  },
  
  // Graph building configuration
  graphBuilder: {
    threshold: 10,
    minSimilarity: 0.6,
    maxEdges: 5,
  },
  
  // Logging configuration
  logging: {
    level: 'info',
    console: true,
    file: true,
    maxSize: '10m',
    maxFiles: 5,
  },
  
  // Context manager configuration
  contextManager: {
    cacheExpiration: 3600,
    maxCacheItems: 100,
    defaultTopK: 5,
    maxContextItems: 10,
    minSimilarityThreshold: 0.6,
  }
};

// Load configuration from environment variables
function loadConfigFromEnv() {
  const envConfig = {};
  
  // Server configuration
  if (process.env.LEO_PORT) {
    envConfig.server = envConfig.server || {};
    const port = parseInt(process.env.LEO_PORT, 10);
    if (isNaN(port) || port < 0 || port > 65535) {
      simpleLogger.warn(`Invalid port number: ${process.env.LEO_PORT}, using default`); 
    } else {
      envConfig.server.port = port;
    }
  }
  
  if (process.env.LEO_HOST) {
    envConfig.server = envConfig.server || {};
    envConfig.server.host = process.env.LEO_HOST;
  }
  
  if (process.env.LEO_ENABLE_CORS) {
    envConfig.server = envConfig.server || {};
    envConfig.server.enableCors = process.env.LEO_ENABLE_CORS === 'true';
  }
  
  // File paths
  if (process.env.LEO_EMBEDDINGS_FILE) {
    envConfig.paths = envConfig.paths || {};
    envConfig.paths.embeddings = process.env.LEO_EMBEDDINGS_FILE;
  }
  
  if (process.env.LEO_CHUNKS_FILE) {
    envConfig.paths = envConfig.paths || {};
    envConfig.paths.chunks = process.env.LEO_CHUNKS_FILE;
  }
  
  if (process.env.LEO_LOGS_DIR) {
    envConfig.paths = envConfig.paths || {};
    envConfig.paths.logs = process.env.LEO_LOGS_DIR;
  }
  
  if (process.env.LEO_CACHE_DIR) {
    envConfig.paths = envConfig.paths || {};
    envConfig.paths.cache = process.env.LEO_CACHE_DIR;
  }
  
  // File watching configuration
  if (process.env.LEO_WATCH_DIRS) {
    envConfig.fileWatcher = envConfig.fileWatcher || {};
    envConfig.fileWatcher.watchDirs = process.env.LEO_WATCH_DIRS.split(',');
  }
  
  if (process.env.LEO_DEBOUNCE_MS) {
    envConfig.fileWatcher = envConfig.fileWatcher || {};
    envConfig.fileWatcher.debounceMs = parseInt(process.env.LEO_DEBOUNCE_MS, 10);
  }
  
  // Chunking configuration
  if (process.env.LEO_MAX_CHUNK_SIZE) {
    envConfig.chunking = envConfig.chunking || {};
    envConfig.chunking.maxChunkSize = parseInt(process.env.LEO_MAX_CHUNK_SIZE, 10);
  }
  
  if (process.env.LEO_MIN_CHUNK_SIZE) {
    envConfig.chunking = envConfig.chunking || {};
    envConfig.chunking.minChunkSize = parseInt(process.env.LEO_MIN_CHUNK_SIZE, 10);
  }
  
  if (process.env.LEO_CHUNK_OVERLAP) {
    envConfig.chunking = envConfig.chunking || {};
    envConfig.chunking.chunkOverlap = parseInt(process.env.LEO_CHUNK_OVERLAP, 10);
  }
  
  if (process.env.LEO_USE_SEMANTIC_CHUNKER) {
    envConfig.chunking = envConfig.chunking || {};
    envConfig.chunking.useSemanticChunker = process.env.LEO_USE_SEMANTIC_CHUNKER === 'true';
  }
  
  // Embedding configuration
  if (process.env.LEO_USE_TRUE_EMBEDDINGS) {
    envConfig.embedding = envConfig.embedding || {};
    envConfig.embedding.useTrueEmbeddings = process.env.LEO_USE_TRUE_EMBEDDINGS === 'true';
  }
  
  if (process.env.LEO_EMBEDDING_MODEL) {
    envConfig.embedding = envConfig.embedding || {};
    envConfig.embedding.model = process.env.LEO_EMBEDDING_MODEL;
  }
  
  if (process.env.LEO_EMBEDDING_DIMENSIONS) {
    envConfig.embedding = envConfig.embedding || {};
    envConfig.embedding.dimensions = parseInt(process.env.LEO_EMBEDDING_DIMENSIONS, 10);
  }
  
  if (process.env.LEO_BATCH_SIZE) {
    envConfig.embedding = envConfig.embedding || {};
    envConfig.embedding.batchSize = parseInt(process.env.LEO_BATCH_SIZE, 10);
  }
  
  if (process.env.LEO_MAX_CONCURRENT) {
    envConfig.embedding = envConfig.embedding || {};
    envConfig.embedding.maxConcurrent = parseInt(process.env.LEO_MAX_CONCURRENT, 10);
  }
  
  if (process.env.LEO_USE_SEMANTIC_EMBEDDINGS) {
    envConfig.embedding = envConfig.embedding || {};
    envConfig.embedding.useSemanticEmbeddings = process.env.LEO_USE_SEMANTIC_EMBEDDINGS === 'true';
  }
  
  // Logging configuration
  if (process.env.LEO_LOG_LEVEL) {
    envConfig.logging = envConfig.logging || {};
    envConfig.logging.level = process.env.LEO_LOG_LEVEL;
  }
  
  // Context manager configuration
  if (process.env.LEO_CACHE_EXPIRATION) {
    envConfig.contextManager = envConfig.contextManager || {};
    envConfig.contextManager.cacheExpiration = parseInt(process.env.LEO_CACHE_EXPIRATION, 10);
  }
  
  if (process.env.LEO_MAX_CACHE_ITEMS) {
    envConfig.contextManager = envConfig.contextManager || {};
    envConfig.contextManager.maxCacheItems = parseInt(process.env.LEO_MAX_CACHE_ITEMS, 10);
  }
  
  if (process.env.LEO_DEFAULT_TOP_K) {
    envConfig.contextManager = envConfig.contextManager || {};
    envConfig.contextManager.defaultTopK = parseInt(process.env.LEO_DEFAULT_TOP_K, 10);
  }
  
  if (process.env.LEO_MIN_SIMILARITY_THRESHOLD) {
    envConfig.contextManager = envConfig.contextManager || {};
    envConfig.contextManager.minSimilarityThreshold = parseFloat(process.env.LEO_MIN_SIMILARITY_THRESHOLD);
  }
  
  return envConfig;
}

// Deep merge objects
function deepMerge(target, source) {
  if (!source) {
    return target;
  }
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Validate configuration
function validateConfig(config) {
  // Ensure all required sections exist
  const requiredSections = ['paths', 'server', 'watching', 'chunking', 'embedding', 'graphBuilder', 'logging', 'contextManager'];
  
  for (const section of requiredSections) {
    if (!config[section]) {
      simpleLogger.warn(`Missing required configuration section: ${section}, using defaults`);
      config[section] = defaultConfig[section];
    }
  }
  
  // Validate paths
  validatePaths(config);
  
  // Validate numeric values
  validateNumericValues(config);
  
  // Validate boolean values
  validateBooleanValues(config);
  
  // Validate array values
  validateArrayValues(config);
  
  return config;
}

// Validate path configuration
function validatePaths(config) {
  const requiredPaths = ['logs', 'cache', 'embeddings', 'chunks'];
  
  for (const pathKey of requiredPaths) {
    if (!config.paths[pathKey]) {
      simpleLogger.warn(`Missing required path: ${pathKey}, using default`);
      config.paths[pathKey] = defaultConfig.paths[pathKey];
    }
  }
}

// Validate numeric configuration values
function validateNumericValues(config) {
  // Server
  if (config.server && (typeof config.server.port !== 'number' || isNaN(config.server.port) || config.server.port < 0 || config.server.port > 65535)) {
    simpleLogger.warn(`Invalid server port: ${config.server.port}, using default`);
    config.server.port = defaultConfig.server.port;
  }
  
  // Chunking
  if (config.chunking) {
    if (typeof config.chunking.maxChunkSize !== 'number' || config.chunking.maxChunkSize <= 0) {
      simpleLogger.warn(`Invalid maxChunkSize: ${config.chunking.maxChunkSize}, using default`);
      config.chunking.maxChunkSize = defaultConfig.chunking.maxChunkSize;
    }
    
    if (typeof config.chunking.minChunkSize !== 'number' || config.chunking.minChunkSize <= 0) {
      simpleLogger.warn(`Invalid minChunkSize: ${config.chunking.minChunkSize}, using default`);
      config.chunking.minChunkSize = defaultConfig.chunking.minChunkSize;
    }
    
    if (typeof config.chunking.chunkOverlap !== 'number' || config.chunking.chunkOverlap < 0) {
      simpleLogger.warn(`Invalid chunkOverlap: ${config.chunking.chunkOverlap}, using default`);
      config.chunking.chunkOverlap = defaultConfig.chunking.chunkOverlap;
    }
  }
  
  // Embedding
  if (config.embedding && (typeof config.embedding.dimensions !== 'number' || config.embedding.dimensions <= 0)) {
    simpleLogger.warn(`Invalid embedding dimensions: ${config.embedding.dimensions}, using default`);
    config.embedding.dimensions = defaultConfig.embedding.dimensions;
  }
}

// Validate boolean configuration values
function validateBooleanValues(config) {
  // Server
  if (config.server && typeof config.server.enableCors !== 'boolean') {
    simpleLogger.warn(`Invalid enableCors: ${config.server.enableCors}, using default`);
    config.server.enableCors = defaultConfig.server.enableCors;
  }
  
  // Chunking
  if (config.chunking && typeof config.chunking.useSemanticChunker !== 'boolean') {
    simpleLogger.warn(`Invalid useSemanticChunker: ${config.chunking.useSemanticChunker}, using default`);
    config.chunking.useSemanticChunker = defaultConfig.chunking.useSemanticChunker;
  }
  
  // Embedding
  if (config.embedding) {
    if (typeof config.embedding.useTrueEmbeddings !== 'boolean') {
      simpleLogger.warn(`Invalid useTrueEmbeddings: ${config.embedding.useTrueEmbeddings}, using default`);
      config.embedding.useTrueEmbeddings = defaultConfig.embedding.useTrueEmbeddings;
    }
    
    if (typeof config.embedding.useSemanticEmbeddings !== 'boolean') {
      simpleLogger.warn(`Invalid useSemanticEmbeddings: ${config.embedding.useSemanticEmbeddings}, using default`);
      config.embedding.useSemanticEmbeddings = defaultConfig.embedding.useSemanticEmbeddings;
    }
  }
}

// Validate array configuration values
function validateArrayValues(config) {
  // Watching
  if (config.watching) {
    if (!Array.isArray(config.watching.directories)) {
      simpleLogger.warn(`Invalid watching directories: ${config.watching.directories}, using default`);
      config.watching.directories = defaultConfig.watching.directories;
    }
    
    if (!Array.isArray(config.watching.ignorePatterns)) {
      simpleLogger.warn(`Invalid ignorePatterns: ${config.watching.ignorePatterns}, using default`);
      config.watching.ignorePatterns = defaultConfig.watching.ignorePatterns;
    }
    
    if (!Array.isArray(config.watching.fileExtensions)) {
      simpleLogger.warn(`Invalid fileExtensions: ${config.watching.fileExtensions}, using default`);
      config.watching.fileExtensions = defaultConfig.watching.fileExtensions;
    }
    
    if (!Array.isArray(config.watching.ignoreDirs)) {
      simpleLogger.warn(`Invalid ignoreDirs: ${config.watching.ignoreDirs}, using default`);
      config.watching.ignoreDirs = defaultConfig.watching.ignoreDirs;
    }
  }
}

/**
 * Load configuration from all sources and merge them
 * @returns {Object} Merged configuration
 */
function loadConfig() {
  // simpleLogger.info('Loading configuration'); // Commented out to prevent misleading logs when using deterministic config loader
  
  // Start with default configuration
  let config = { ...defaultConfig };
  
  try {
    // Find configuration file
    const configFile = findConfigFile();
    
    // Load configuration from file if it exists
    if (configFile) {
      // simpleLogger.info(`Loading configuration from ${configFile}`); // Commented out to prevent misleading logs
      const fileConfig = loadConfigFromFile(configFile);
      config = deepMerge(config, fileConfig);
    } else {
      // simpleLogger.info('No configuration file found, using defaults and environment variables'); // Commented out to prevent misleading logs
    }
    
    // Load configuration from environment variables
    const envConfig = loadConfigFromEnv();
    config = deepMerge(config, envConfig);
    
    // Validate configuration
    validateConfig(config);
    
    // simpleLogger.info('Configuration loaded successfully'); // Commented out to prevent misleading logs
    return config;
  } catch (error) {
    simpleLogger.error(`Error loading configuration: ${error.message}`, { error: error.stack });
    simpleLogger.warn('Using default configuration due to error');
    return defaultConfig;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 */
function ensureDirectoryExists(dirPath) {
  if (!dirPath) {
    simpleLogger.warn('Invalid directory path');
    return;
  }
  
  try {
    if (!fs.existsSync(dirPath)) {
      simpleLogger.info(`Creating directory: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    simpleLogger.error(`Error creating directory ${dirPath}: ${error.message}`, { error: error.stack });
  }
}

// Create configuration object
let currentConfig = loadConfig();
let isInitialized = true; // Set to true after loading configuration

// Ensure required directories exist
ensureDirectoryExists(currentConfig.paths.logs);
ensureDirectoryExists(currentConfig.paths.cache);
ensureDirectoryExists(path.dirname(currentConfig.paths.embeddings));
ensureDirectoryExists(path.dirname(currentConfig.paths.chunks));
ensureDirectoryExists(currentConfig.paths.cache);

// Log configuration sources
simpleLogger.info('Configuration sources:', {
  defaults: 'present',
  leorc: findConfigFile() ? 'present' : 'absent',
  environment: Object.keys(loadConfigFromEnv()).length > 0 ? 'present' : 'absent'
});

// Log critical file paths
simpleLogger.info('File verification:', {
  embeddingsFile: currentConfig.paths.embeddings,
  embeddingsExists: fs.existsSync(currentConfig.paths.embeddings),
  chunksFile: currentConfig.paths.chunks,
  chunksExists: fs.existsSync(currentConfig.paths.chunks)
});

// Update configuration
function updateConfig(newConfig) {
  if (!newConfig || typeof newConfig !== 'object') {
    return currentConfig;
  }
  
  // Deep merge with current configuration
  currentConfig = deepMerge(currentConfig, newConfig);
  
  // Validate the updated configuration
  currentConfig = validateConfig(currentConfig);
  
  // Ensure required directories exist
  ensureDirectoryExists(currentConfig.paths.logs);
  ensureDirectoryExists(currentConfig.paths.cache);
  ensureDirectoryExists(path.dirname(currentConfig.paths.embeddings));
  ensureDirectoryExists(path.dirname(currentConfig.paths.chunks));
  
  simpleLogger.info('Configuration updated');
  
  // Notify listeners
  notifyListeners('updated', currentConfig);
  
  return currentConfig;
}

// Get current configuration
function getConfig() {
  if (!isInitialized) {
    throw new Error('Configuration service not initialized');
  }
  return currentConfig;
}

// Get a specific configuration value with validation
function getValue(path, defaultValue) {
  if (!isInitialized) {
    throw new Error('Configuration service not initialized');
  }
  
  // Split the path into parts
  const parts = path.split('.');
  let current = currentConfig;
  
  // Navigate the path
  for (const part of parts) {
    if (current === undefined || current === null) {
      return defaultValue;
    }
    current = current[part];
  }
  
  // Return the value or default
  return current !== undefined ? current : defaultValue;
}

// Initialize with specific configuration
function initialize(options = {}) {
  // Prevent duplicate initialization
  if (isInitialized) {
    simpleLogger.warn('Config service already initialized, skipping duplicate initialization');
    return currentConfig;
  }
  
  isInitialized = true;
  return updateConfig(options);
}

// Subscribe to configuration changes
function subscribe(component, callback) {
  if (!component || typeof component !== 'string') {
    simpleLogger.warn('Invalid component name for subscription');
    return false;
  }
  
  if (typeof callback !== 'function') {
    simpleLogger.warn('Invalid callback function for subscription');
    return false;
  }
  
  listeners.set(component, callback);
  return true;
}

// Unsubscribe from configuration changes
function unsubscribe(component) {
  if (!component) {
    return false;
  }
  
  return listeners.delete(component);
}

// Notify listeners of configuration changes
function notifyListeners(event, data) {
  for (const [component, callback] of listeners.entries()) {
    try {
      callback(event, data);
    } catch (error) {
      simpleLogger.error(`Error notifying component ${component}: ${error.message}`);
    }
  }
}

// Export configuration API
module.exports = {
  getConfig,
  getValue,
  updateConfig,
  initialize,
  subscribe,
  unsubscribe,
  deepMerge,
  validateConfig,
  loadConfig
};
