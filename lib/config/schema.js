/**
 * Leo Codex Configuration Schema
 * 
 * This module defines the schema for Leo Codex configuration.
 * It is used for validation and documentation purposes.
 */

const schema = {
  // Server configuration
  server: {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        description: 'Port number for the API server',
        default: 3000,
        minimum: 1,
        maximum: 65535
      },
      host: {
        type: 'string',
        description: 'Host for the API server',
        default: 'localhost'
      },
      enableCors: {
        type: 'boolean',
        description: 'Whether to enable CORS for the API server',
        default: true
      }
    }
  },
  
  // File paths
  paths: {
    type: 'object',
    properties: {
      embeddings: {
        type: 'string',
        description: 'Path to the embeddings file',
        default: './data/embeddings.jsonl'
      },
      chunks: {
        type: 'string',
        description: 'Path to the chunks file',
        default: './data/chunks.jsonl'
      },
      logs: {
        type: 'string',
        description: 'Path to the logs directory',
        default: './logs'
      },
      cache: {
        type: 'string',
        description: 'Path to the cache directory',
        default: './cache'
      },
      testProjects: {
        type: 'string',
        description: 'Path to the test projects directory',
        default: './test-projects'
      }
    }
  },
  
  // File watching configuration
  fileWatcher: {
    type: 'object',
    properties: {
      watchDirs: {
        type: 'array',
        description: 'Directories to watch for changes',
        items: {
          type: 'string'
        },
        default: ['.']
      },
      ignorePatterns: {
        type: 'array',
        description: 'File patterns to ignore',
        items: {
          type: 'string'
        },
        default: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**',
          '**/logs/**',
          '**/*.min.js',
          '**/*.bundle.js'
        ]
      },
      fileExtensions: {
        type: 'array',
        description: 'File extensions to watch',
        items: {
          type: 'string'
        },
        default: ['.js', '.jsx', '.ts', '.tsx', '.md', '.json', '.html', '.css', '.scss']
      },
      ignoreDirs: {
        type: 'array',
        description: 'Directories to ignore',
        items: {
          type: 'string'
        },
        default: ['node_modules', 'dist', 'build', '.git', 'logs']
      },
      debounceMs: {
        type: 'number',
        description: 'Debounce time in milliseconds',
        default: 1000,
        minimum: 0
      }
    }
  },
  
  // Chunking configuration
  chunking: {
    type: 'object',
    properties: {
      maxChunkSize: {
        type: 'number',
        description: 'Maximum chunk size in characters',
        default: 1000,
        minimum: 1
      },
      minChunkSize: {
        type: 'number',
        description: 'Minimum chunk size in characters',
        default: 100,
        minimum: 1
      },
      chunkOverlap: {
        type: 'number',
        description: 'Chunk overlap in characters',
        default: 20,
        minimum: 0
      }
    }
  },
  
  // Embedding configuration
  embedding: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Embedding model name',
        default: 'sentence-transformers/all-MiniLM-L6-v2'
      },
      dimensions: {
        type: 'number',
        description: 'Embedding dimensions',
        default: 384,
        minimum: 1
      },
      batchSize: {
        type: 'number',
        description: 'Batch size for embedding generation',
        default: 10,
        minimum: 1
      },
      maxConcurrent: {
        type: 'number',
        description: 'Maximum concurrent embedding generations',
        default: 3,
        minimum: 1
      }
    }
  },
  
  // Graph building configuration
  graphBuilder: {
    type: 'object',
    properties: {
      threshold: {
        type: 'number',
        description: 'Threshold for graph building',
        default: 10,
        minimum: 1
      },
      minSimilarity: {
        type: 'number',
        description: 'Minimum similarity for graph edges',
        default: 0.6,
        minimum: 0,
        maximum: 1
      },
      maxEdges: {
        type: 'number',
        description: 'Maximum edges per node',
        default: 5,
        minimum: 1
      }
    }
  },
  
  // Logging configuration
  logging: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        description: 'Log level',
        default: 'info',
        enum: ['error', 'warn', 'info', 'debug', 'silly']
      },
      console: {
        type: 'boolean',
        description: 'Whether to log to console',
        default: true
      },
      file: {
        type: 'boolean',
        description: 'Whether to log to file',
        default: true
      },
      maxSize: {
        type: 'string',
        description: 'Maximum log file size',
        default: '10m'
      },
      maxFiles: {
        type: 'number',
        description: 'Maximum number of log files',
        default: 5,
        minimum: 1
      }
    }
  },
  
  // Context manager configuration
  contextManager: {
    type: 'object',
    properties: {
      cacheExpiration: {
        type: 'number',
        description: 'Cache expiration time in seconds',
        default: 3600,
        minimum: 0
      },
      maxCacheItems: {
        type: 'number',
        description: 'Maximum number of cache items',
        default: 100,
        minimum: 1
      },
      defaultTopK: {
        type: 'number',
        description: 'Default number of context items to retrieve',
        default: 5,
        minimum: 1
      },
      maxContextItems: {
        type: 'number',
        description: 'Maximum number of context items',
        default: 10,
        minimum: 1
      },
      minSimilarityThreshold: {
        type: 'number',
        description: 'Minimum similarity threshold for context items',
        default: 0.6,
        minimum: 0,
        maximum: 1
      }
    }
  }
};

/**
 * Validate configuration against schema
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result with isValid and errors properties
 */
function validateConfig(config) {
  const errors = [];
  
  // Simple validation function
  function validate(schema, config, path = '') {
    if (!config) return;
    
    if (schema.type === 'object' && typeof config === 'object') {
      // Validate object properties
      for (const key in schema.properties) {
        const propSchema = schema.properties[key];
        const propPath = path ? `${path}.${key}` : key;
        
        if (config[key] !== undefined) {
          validate(propSchema, config[key], propPath);
        }
      }
    } else if (schema.type === 'array' && Array.isArray(config)) {
      // Validate array items
      if (schema.items) {
        for (let i = 0; i < config.length; i++) {
          validate(schema.items, config[i], `${path}[${i}]`);
        }
      }
    } else if (schema.type === 'number' && typeof config === 'number') {
      // Validate number
      if (schema.minimum !== undefined && config < schema.minimum) {
        errors.push(`${path} must be at least ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && config > schema.maximum) {
        errors.push(`${path} must be at most ${schema.maximum}`);
      }
    } else if (schema.type === 'string' && typeof config === 'string') {
      // Validate string
      if (schema.enum && !schema.enum.includes(config)) {
        errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
      }
    } else if (schema.type === 'boolean' && typeof config === 'boolean') {
      // Boolean is always valid
    } else {
      // Type mismatch
      errors.push(`${path} must be of type ${schema.type}`);
    }
  }
  
  // Validate each section
  for (const key in schema) {
    validate(schema[key], config[key], key);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Generate default configuration based on schema
 * @returns {Object} Default configuration
 */
function generateDefaultConfig() {
  const config = {};
  
  function generateDefaults(schema, target) {
    if (schema.type === 'object' && schema.properties) {
      for (const key in schema.properties) {
        const propSchema = schema.properties[key];
        
        if (propSchema.type === 'object') {
          target[key] = {};
          generateDefaults(propSchema, target[key]);
        } else if (propSchema.default !== undefined) {
          target[key] = propSchema.default;
        }
      }
    }
  }
  
  for (const key in schema) {
    config[key] = {};
    generateDefaults(schema[key], config[key]);
  }
  
  return config;
}

module.exports = {
  schema,
  validateConfig,
  generateDefaultConfig
};
