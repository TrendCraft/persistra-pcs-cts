/**
 * Semantic Chunker
 * 
 * Provides enhanced chunking that respects semantic boundaries in code,
 * such as function/class definitions, import blocks, and comment sections.
 * Also implements overlapping chunks to avoid breaking related concepts.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const pathUtils = require('../utils/path-utils');
const eventBus = require('../utils/event-bus');
const path = require('path');
const markdownChunker = require('./semantic-chunker-markdown');

// Component name for event and config subscriptions
const COMPONENT_NAME = 'semantic-chunker';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration object
let CONFIG = {};

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  CONFIG = {
    // Chunking settings
    maxChunkSize: configService.getValue('chunking.maxChunkSize', 1000),
    minChunkSize: configService.getValue('chunking.minChunkSize', 100),
    overlapSize: configService.getValue('chunking.chunkOverlap', 50),
    respectBoundaries: configService.getValue('chunking.respectBoundaries', true),
    useSemanticChunker: configService.getValue('chunking.useSemanticChunker', true),
    
    // Language settings
    languageExtensions: configService.getValue('chunking.languageExtensions', {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      java: 'java',
      go: 'go',
      rs: 'rust',
      php: 'php',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      sql: 'sql'
    }),
    
    // Boundary types
    boundaryTypes: {
      FUNCTION: 'function',
      METHOD: 'method',
      CLASS: 'class',
      IMPORT: 'import',
      COMMENT: 'comment',
      DOCBLOCK: 'docblock',
      DECORATOR: 'decorator',
      OBJECT_METHOD: 'object_method',
      ARROW_FUNCTION: 'arrow_function',
      EXPORT: 'export',
      INTERFACE: 'interface',
      TYPE: 'type',
      ENUM: 'enum',
      NAMESPACE: 'namespace',
      DOCSTRING: 'docstring'
    }
  };
  
  logger.info('Configuration initialized', { 
    maxChunkSize: CONFIG.maxChunkSize,
    minChunkSize: CONFIG.minChunkSize,
    overlapSize: CONFIG.overlapSize
  });
}

// Boundary patterns for different languages
const LANGUAGE_PATTERNS = {
  markdown: {
    heading1: /^\s*# (.+)$/,
    heading2: /^\s*## (.+)$/,
    heading3: /^\s*### (.+)$/,
    heading4: /^\s*#### (.+)$/,
    heading5: /^\s*##### (.+)$/,
    heading6: /^\s*###### (.+)$/,
    codeBlock: /^\s*```(\w*)\s*$/,
    listItem: /^\s*[-*+] (.+)$/,
    tableHeader: /^\s*\|(.+)\|\s*$/,
    horizontalRule: /^\s*[-*_]{3,}\s*$/
  },
  javascript: {
    function: /^\s*(async\s+)?function\s+(\w+)/,
    method: /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*{/,
    class: /^\s*class\s+(\w+)/,
    import: /^\s*import\s+.+\s+from\s+/,
    export: /^\s*export\s+(default\s+)?(function|class|const|let|var|interface|type|enum)/,
    comment: /^\s*\/\/\s*(.+)/,
    docblock: /^\s*\/\*\*[\s\S]*?\*\//,
    decorator: /^\s*@(\w+)/,
    objectMethod: /^\s*(\w+)\s*:\s*(async\s+)?function/,
    arrowFunction: /^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/,
    interface: /^\s*(export\s+)?(interface|type)\s+(\w+)/,
    enum: /^\s*(export\s+)?enum\s+(\w+)/,
    namespace: /^\s*namespace\s+(\w+)/
  },
  typescript: {
    function: /^\s*(async\s+)?function\s+(\w+)/,
    method: /^\s*(private|protected|public|async\s+)?(\w+)\s*\([^)]*\)\s*(:[\s\w<>[\]|,]+)?\s*{/,
    class: /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/,
    import: /^\s*import\s+.+\s+from\s+/,
    export: /^\s*export\s+(default\s+)?(function|class|const|let|var|interface|type|enum)/,
    comment: /^\s*\/\/\s*(.+)/,
    docblock: /^\s*\/\*\*[\s\S]*?\*\//,
    decorator: /^\s*@(\w+)/,
    objectMethod: /^\s*(\w+)\s*:\s*(async\s+)?function/,
    arrowFunction: /^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/,
    interface: /^\s*(export\s+)?(interface|type)\s+(\w+)/,
    enum: /^\s*(export\s+)?enum\s+(\w+)/,
    namespace: /^\s*namespace\s+(\w+)/
  },
  python: {
    function: /^\s*def\s+(\w+)\s*\(/,
    method: /^\s*def\s+(\w+)\s*\(self/,
    class: /^\s*class\s+(\w+)/,
    import: /^\s*(import|from)\s+/,
    comment: /^\s*#\s*(.+)/,
    docstring: /^\s*(?:"""|\'\'\')[\s\S]*?(?:"""|\'\'\')$/,
    decorator: /^\s*@(\w+)/
  },
  default: {
    function: /^\s*function\s+(\w+)/,
    method: /^\s*(\w+)\s*\([^)]*\)\s*{/,
    class: /^\s*class\s+(\w+)/,
    import: /^\s*import\s+/,
    comment: /^\s*(?:\/\/|#)\s*(.+)/
  }
};

/**
 * Initialize the semantic chunker
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  try {
    logger.info('Initializing semantic chunker...');
    
    // Update central configuration if options provided
    if (Object.keys(options).length > 0) {
      configService.updateConfig(options);
    }
    
    // Initialize configuration using standardized access patterns
    initializeConfig();
    
    // Subscribe to configuration changes
    configService.subscribe(COMPONENT_NAME, handleConfigChange);
    
    // Emit initialization event
    eventBus.emit('component:initialized', {
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    logger.info('Semantic chunker initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize semantic chunker: ${error.message}`);
    return false;
  }
}

/**
 * Handle configuration changes
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @private
 */
function handleConfigChange(event, data) {
  if (event === 'updated') {
    logger.info('Configuration updated, reinitializing');
    initializeConfig();
  }
}

/**
 * Detect the programming language based on file extension
 * @param {string} filePath - Path to the file
 * @returns {string} Language name or 'default' if unknown
 */
function detectLanguage(filePath) {
  // Normalize the file path
  const normalizedPath = pathUtils.normalize(filePath);
  
  // Get the extension without the dot
  const ext = pathUtils.getExtension(normalizedPath).toLowerCase();
  
  // Look up the language in the configuration
  return CONFIG.languageExtensions[ext] || 'default';
}

/**
 * Get boundary patterns for a specific language
 * @param {string} language - Programming language
 * @returns {Object} Boundary patterns for the language
 */
function getBoundaryPatterns(language) {
  return LANGUAGE_PATTERNS[language] || LANGUAGE_PATTERNS.default;
}

/**
 * Identify semantic boundaries in code
 * @param {string[]} lines - Lines of code
 * @param {string} language - Programming language
 * @returns {Object[]} Array of boundary objects with type, start, and end indices
 */
function identifyBoundaries(lines, language) {
  try {
    const boundaries = [];
    const patterns = getBoundaryPatterns(language);
    
    if (!patterns) {
      return [];
    }
    
    // Special handling for markdown files
    if (language === 'markdown') {
      return markdownChunker.identifyMarkdownBoundaries(lines, patterns);
    }
    
    // Track indentation levels for scope detection
    const indentationStack = [];
    let currentIndentation = -1;
    
    // Track open boundaries that need to be closed
    const openBoundaries = [];
    
    // Find documentation blocks first (they can span multiple lines)
    const docBlocks = findDocumentationBlocks(lines, language);
    
    // Add doc blocks to boundaries
    for (const block of docBlocks) {
      boundaries.push({
        type: CONFIG.boundaryTypes.DOCBLOCK,
        start: block.start,
        end: block.end,
        content: lines.slice(block.start, block.end + 1).join('\n')
      });
    }
    
    // Log the number of doc blocks found
    if (docBlocks.length > 0) {
      logger.debug(`Found ${docBlocks.length} documentation blocks in ${language} code`);
    }
  
    // Process line by line
    for (let i = 0; i < lines.length; i++) {
      // Skip lines that are part of a doc block
      if (docBlocks.some(block => i >= block.start && i <= block.end)) {
        continue;
      }
      
      const line = lines[i];
      
      // Calculate indentation level
      const indentation = line.search(/\S|$/);
    
    // Check if we're exiting a scope
    if (indentation <= currentIndentation && indentationStack.length > 0) {
      while (indentationStack.length > 0 && indentation <= indentationStack[indentationStack.length - 1]) {
        indentationStack.pop();
        
        // Close the corresponding boundary if there's one open
        if (openBoundaries.length > 0) {
          const boundary = openBoundaries.pop();
          boundary.end = i - 1;
          boundary.content = lines.slice(boundary.start, boundary.end + 1).join('\n');
          boundaries.push(boundary);
        }
      }
    }
    
    // Update current indentation
    currentIndentation = indentation;
    
    // Check for different boundary types
    let boundaryType = null;
    let match = null;
    
    // Check for class definitions
    if (patterns.class && (match = line.match(patterns.class))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.CLASS;
    }
    // Check for function definitions
    else if (patterns.function && (match = line.match(patterns.function))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.FUNCTION;
    }
    // Check for method definitions
    else if (patterns.method && (match = line.match(patterns.method))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.METHOD;
    }
    // Check for import statements
    else if (patterns.import && (match = line.match(patterns.import))) {
      // For imports, we handle them differently - they're usually single line or grouped
      let importEnd = i;
      
      // Look ahead for continued import statements
      while (importEnd + 1 < lines.length && 
             (lines[importEnd + 1].trim() === '' || 
              lines[importEnd + 1].match(patterns.import) ||
              lines[importEnd + 1].trim().startsWith('* '))) {
        importEnd++;
      }
      
      boundaries.push({
        type: CONFIG.BOUNDARY_TYPES.IMPORT,
        start: i,
        end: importEnd,
        content: lines.slice(i, importEnd + 1).join('\n')
      });
      
      // Skip ahead
      i = importEnd;
      continue;
    }
    // Check for decorators
    else if (patterns.decorator && (match = line.match(patterns.decorator))) {
      // For decorators, we want to include the decorated function/class
      let decoratorStart = i;
      let decoratorEnd = i;
      
      // Look ahead for the decorated item
      while (decoratorEnd + 1 < lines.length && 
             (lines[decoratorEnd + 1].trim() === '' || 
              lines[decoratorEnd + 1].match(patterns.decorator) ||
              lines[decoratorEnd + 1].match(patterns.function) ||
              lines[decoratorEnd + 1].match(patterns.class) ||
              lines[decoratorEnd + 1].match(patterns.method))) {
        decoratorEnd++;
        
        // If we found the decorated item, we need to find its end
        if (lines[decoratorEnd].match(patterns.function) || 
            lines[decoratorEnd].match(patterns.class) ||
            lines[decoratorEnd].match(patterns.method)) {
          break;
        }
      }
      
      // Now we need to find the end of the decorated item
      if (decoratorEnd < lines.length) {
        const decoratedIndentation = lines[decoratorEnd].search(/\S|$/);
        let j = decoratorEnd + 1;
        
        while (j < lines.length) {
          const lineIndentation = lines[j].search(/\S|$/);
          
          // If we find a line with same or less indentation, we've exited the scope
          if (lineIndentation <= decoratedIndentation && lines[j].trim() !== '') {
            break;
          }
          
          j++;
        }
        
        decoratorEnd = j - 1;
      }
      
      boundaries.push({
        type: CONFIG.BOUNDARY_TYPES.DECORATOR,
        start: decoratorStart,
        end: decoratorEnd,
        content: lines.slice(decoratorStart, decoratorEnd + 1).join('\n')
      });
      
      // Skip ahead
      i = decoratorEnd;
      continue;
    }
    // Check for object methods
    else if (patterns.objectMethod && (match = line.match(patterns.objectMethod))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.OBJECT_METHOD;
    }
    // Check for arrow functions
    else if (patterns.arrowFunction && (match = line.match(patterns.arrowFunction))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.ARROW_FUNCTION;
    }
    // Check for exports
    else if (patterns.export && (match = line.match(patterns.export))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.EXPORT;
    }
    // Check for interfaces
    else if (patterns.interface && (match = line.match(patterns.interface))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.INTERFACE;
    }
    // Check for enums
    else if (patterns.enum && (match = line.match(patterns.enum))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.ENUM;
    }
    // Check for namespaces
    else if (patterns.namespace && (match = line.match(patterns.namespace))) {
      boundaryType = CONFIG.BOUNDARY_TYPES.NAMESPACE;
    }
    // Check for docstrings in Python
    else if (patterns.docstring && (match = line.match(patterns.docstring))) {
      // For docstrings, we need to find the end if it's a multi-line docstring
      let docstringEnd = i;
      const docstringStart = line.indexOf('"""') >= 0 ? '"""' : "'''";
      
      // If the docstring doesn't end on the same line
      if (line.indexOf(docstringStart, line.indexOf(docstringStart) + 3) === -1) {
        // Look ahead for the end of the docstring
        while (docstringEnd + 1 < lines.length && 
               lines[docstringEnd + 1].indexOf(docstringStart) === -1) {
          docstringEnd++;
        }
        
        // Include the closing line
        if (docstringEnd + 1 < lines.length) {
          docstringEnd++;
        }
      }
      
      boundaries.push({
        type: CONFIG.BOUNDARY_TYPES.DOCSTRING,
        start: i,
        end: docstringEnd,
        content: lines.slice(i, docstringEnd + 1).join('\n')
      });
      
      // Skip ahead
      i = docstringEnd;
      continue;
    }
    // Check for comments
    else if (patterns.comment && (match = line.match(patterns.comment))) {
      // For comments, we want to group consecutive comment lines
      let commentEnd = i;
      
      // Look ahead for continued comment lines
      while (commentEnd + 1 < lines.length && 
             (lines[commentEnd + 1].trim() === '' || 
              lines[commentEnd + 1].match(patterns.comment))) {
        commentEnd++;
      }
      
      // Only create a boundary if it's a substantial comment block (more than 2 lines)
      if (commentEnd - i >= 2) {
        boundaries.push({
          type: CONFIG.BOUNDARY_TYPES.COMMENT,
          start: i,
          end: commentEnd,
          content: lines.slice(i, commentEnd + 1).join('\n')
        });
      }
      
      // Skip ahead
      i = commentEnd;
      continue;
    }
    
    // If we found a boundary that needs scope tracking
    if (boundaryType) {
      // Push current indentation to stack
      indentationStack.push(indentation);
      
      // Create a new open boundary
      openBoundaries.push({
        type: boundaryType,
        start: i
      });
      
      // Update current indentation
      currentIndentation = indentation;
    }
  }
  
  // Close any remaining open boundaries
  while (openBoundaries.length > 0) {
    const boundary = openBoundaries.pop();
    boundary.end = lines.length - 1;
    boundary.content = lines.slice(boundary.start, boundary.end + 1).join('\n');
    boundaries.push(boundary);
  }
  
  // Sort boundaries by start index
  boundaries.sort((a, b) => a.start - b.start);
  
  // Merge overlapping boundaries of the same type
  const mergedBoundaries = [];
  let currentBoundary = null;
  
  for (const boundary of boundaries) {
    if (!currentBoundary) {
      currentBoundary = { ...boundary };
    } else if (boundary.start <= currentBoundary.end + 1 && boundary.type === currentBoundary.type) {
      // Extend current boundary
      currentBoundary.end = Math.max(currentBoundary.end, boundary.end);
      currentBoundary.content = lines.slice(currentBoundary.start, currentBoundary.end + 1).join('\n');
    } else {
      // Push current boundary and start a new one
      mergedBoundaries.push(currentBoundary);
      currentBoundary = { ...boundary };
    }
  }
  
  // Add the last boundary
  if (currentBoundary) {
    mergedBoundaries.push(currentBoundary);
  }
  
  return mergedBoundaries;
  } catch (error) {
    logger.error(`Error identifying boundaries: ${error.message}`);
    return [];
  }
}

/**
 * Find documentation blocks in the code
 * @param {string[]} lines - Lines of code
 * @param {string} language - Programming language
 * @returns {Object[]} Array of doc block objects with start and end indices
 */
function findDocumentationBlocks(lines, language) {
  const docBlocks = [];
  
  // Different documentation patterns by language
  const docPatterns = {
    javascript: {
      start: /^\/\*\*/, 
      end: /\*\/$/
    },
    python: {
      start: /^"""|^'''/,
      end: /"""$|'''$/
    },
    default: {
      start: /^\/\*|^"""|^'''|^--\[\[/,
      end: /\*\/|"""|'''|--\]\]/
    }
  };
  
  const pattern = docPatterns[language] || docPatterns.default;
  
  let inDocBlock = false;
  let blockStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!inDocBlock && pattern.start.test(line)) {
      inDocBlock = true;
      blockStart = i;
      
      // Check if start and end are on the same line
      if (pattern.end.test(line)) {
        docBlocks.push({
          start: blockStart,
          end: i
        });
        inDocBlock = false;
        blockStart = -1;
      }
    } else if (inDocBlock && pattern.end.test(line)) {
      docBlocks.push({
        start: blockStart,
        end: i
      });
      inDocBlock = false;
      blockStart = -1;
    }
  }
  
  // Handle unclosed doc blocks
  if (inDocBlock) {
    docBlocks.push({
      start: blockStart,
      end: lines.length - 1
    });
  }
  
  return docBlocks;
}

/**
 * Create chunks respecting semantic boundaries
 * @param {string} content - File content
 * @param {string} filePath - Path to the file
 * @param {Object} options - Chunking options
 * @returns {Object[]} Array of chunk objects
 */
function createSemanticChunks(content, filePath, options = {}) {
  try {
    logger.debug(`Creating semantic chunks for ${filePath}`);
    
    // Track metrics
    const startTime = Date.now();
    
    // Apply options with standardized configuration access
    const config = {
      maxChunkSize: options.maxChunkSize || CONFIG.maxChunkSize,
      minChunkSize: options.minChunkSize || CONFIG.minChunkSize,
      overlapSize: options.overlapSize || CONFIG.overlapSize,
      respectBoundaries: options.respectBoundaries !== undefined ? options.respectBoundaries : CONFIG.respectBoundaries
    };
    
    // Split content into lines
    const lines = content.split('\n');
    
    // Emit chunking started event
    eventBus.emit('chunking:started', {
      filePath: pathUtils.normalize(filePath),
      timestamp: Date.now(),
      lineCount: lines.length
    });
  
  // Detect language
  const language = options.language || detectLanguage(filePath);
  
  // Identify semantic boundaries
  const boundaries = config.respectBoundaries ? identifyBoundaries(lines, language) : [];
  
  // Create chunks based on boundaries
  const chunks = [];
  let currentPosition = 0;
  
  // Function to create a chunk
  const createChunk = (start, end, type = 'code') => {
    const chunkLines = lines.slice(start, end + 1);
    const content = chunkLines.join('\n');
    
    // Skip empty chunks
    if (!content.trim()) return;
    
    // If chunk is too large, split it
    if (content.length > config.maxChunkSize) {
      const smallerChunks = splitLargeChunk(content, config.maxChunkSize, config.overlapSize);
      
      for (let i = 0; i < smallerChunks.length; i++) {
        chunks.push({
          id: `${path.basename(filePath)}_${chunks.length + i}`,
          file: filePath,
          content: smallerChunks[i],
          type,
          start_line: start,
          end_line: end,
          is_partial: true,
          part: i + 1,
          total_parts: smallerChunks.length
        });
      }
    } else {
      chunks.push({
        id: `${path.basename(filePath)}_${chunks.length}`,
        file: filePath,
        content,
        type,
        start_line: start,
        end_line: end
      });
    }
  };
  
  // Process each boundary
  for (const boundary of boundaries) {
    // If there's a gap between the current position and this boundary, create a chunk for it
    if (boundary.start > currentPosition) {
      createChunk(currentPosition, boundary.start - 1);
    }
    
    // Create a chunk for this boundary
    createChunk(boundary.start, boundary.end, boundary.type);
    
    // Update current position
    currentPosition = boundary.end + 1;
  }
  
  // If there's content after the last boundary, create a chunk for it
  if (currentPosition < lines.length) {
    createChunk(currentPosition, lines.length - 1);
  }
  
  // If no chunks were created (no boundaries found), fall back to simple line-based chunking
  if (chunks.length === 0) {
    let chunkStart = 0;
    let chunkContent = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const newContent = chunkContent + (chunkContent ? '\n' : '') + line;
      
      if (newContent.length > config.maxChunkSize) {
        // Current chunk is full, create it
        if (chunkContent.length >= config.minChunkSize) {
          createChunk(chunkStart, i - 1);
        }
        
        // Start a new chunk
        chunkStart = i;
        chunkContent = line;
      } else {
        chunkContent = newContent;
      }
    }
    
    // Create the last chunk if it has content
    if (chunkContent.length > 0) {
      createChunk(chunkStart, lines.length - 1);
    }
  }
  
  // Add domain and metadata to chunks
  for (const chunk of chunks) {
    // Robustly infer and assign type field
    chunk.type = inferChunkType(chunk);
    // Detect domain based on file path and content
    chunk.domain = detectTrendCraftDomain(filePath, chunk.content);
    // Add metadata based on chunk type
    chunk.metadata = {
      type: chunk.type,
      language
    };
    // For backward compatibility, also set chunk_type
    chunk.chunk_type = chunk.type;
  }
  
  // Emit chunking completed event
  const processingTime = Date.now() - startTime;
  eventBus.emit('chunking:completed', {
    filePath: pathUtils.normalize(filePath),
    timestamp: Date.now(),
    chunkCount: chunks.length,
    processingTime
  });
  
  logger.debug(`Created ${chunks.length} chunks for ${filePath} in ${processingTime}ms`);
  return chunks;
  } catch (error) {
    logger.error(`Error creating semantic chunks for ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Infer chunk type based on content and file path
 * @param {Object} chunk - Chunk object
 * @returns {string} Inferred type (code, documentation, etc.)
 */
function inferChunkType(chunk) {
  try {
    // If type is already set, use it
    if (chunk.type && chunk.type !== 'code') {
      return chunk.type;
    }
    
    const content = chunk.content || '';
    const filePath = chunk.file || '';
    
    // Normalize the file path
    const normalizedPath = pathUtils.normalize(filePath);
    
    // Get the extension
    const extension = pathUtils.getExtension(normalizedPath);
    
    // Check file extension
    if (extension === 'md' || extension === 'txt') {
      return 'documentation';
    }
  
  // Check for JSDoc or similar documentation
  if (content.includes('/**') && content.includes('*/') && 
      (content.includes('@param') || content.includes('@returns') || 
       content.includes('@description'))) {
    return 'documentation';
  }
  
  // Check for Python docstrings
  if ((content.includes('"""') && content.includes('"""', content.indexOf('"""') + 3)) ||
      (content.includes("'''") && content.includes("'''", content.indexOf("'''") + 3))) {
    return 'documentation';
  }
  
  // Check for comment blocks
  if (content.split('\n').filter(line => line.trim().startsWith('//') || 
                                       line.trim().startsWith('#') || 
                                       line.trim().startsWith('*')).length > 3) {
    return 'documentation';
  }
  
  // Check for imports
  if (content.includes('import ') || content.includes('require(') || 
      content.includes('from ') && content.includes(' import ')) {
    return 'imports';
  }
  
  // Check for function/class definitions
  if (content.includes('function ') || content.includes('class ') || 
      content.includes('def ') || content.includes('interface ') || 
      content.includes('type ') || content.includes('enum ')) {
    return 'code';
  }
  
  // Default to code
  return 'code';
  } catch (error) {
    logger.error(`Error inferring chunk type: ${error.message}`);
    return 'code';
  }
}

/**
 * Detect TrendCraft domain based on file path and content
 * @param {string} filePath - Path to the file
 * @param {string} content - File content
 * @returns {string} Domain name or null
 */
function detectTrendCraftDomain(filePath, content = '') {
  // Extract domain from file path
  const pathParts = filePath.split('/');
  
  // Check for src/domains structure
  const domainIndex = pathParts.indexOf('domains');
  if (domainIndex !== -1 && domainIndex + 1 < pathParts.length) {
    return pathParts[domainIndex + 1];
  }
  
  // Check for src/components structure
  const componentsIndex = pathParts.indexOf('components');
  if (componentsIndex !== -1 && componentsIndex + 1 < pathParts.length) {
    return 'ui';
  }
  
  // Check for src/services structure
  const servicesIndex = pathParts.indexOf('services');
  if (servicesIndex !== -1) {
    return 'services';
  }
  
  // Check for src/utils structure
  const utilsIndex = pathParts.indexOf('utils');
  if (utilsIndex !== -1) {
    return 'utils';
  }
  
  // Check content for domain hints
  if (content.includes('trend') || content.includes('analytics')) {
    return 'analytics';
  }
  
  if (content.includes('user') || content.includes('auth') || content.includes('login')) {
    return 'auth';
  }
  
  return null;
}

/**
 * Split a large chunk into smaller overlapping chunks
 * @param {string} content - Chunk content
 * @param {number} maxSize - Maximum chunk size
 * @param {number} overlapSize - Overlap size between chunks
 * @returns {string[]} Array of smaller chunks
 */
function splitLargeChunk(content, maxSize, overlapSize) {
  const chunks = [];
  let start = 0;
  
  while (start < content.length) {
    // Calculate end position
    let end = start + maxSize;
    
    // Adjust end to avoid cutting in the middle of a line
    if (end < content.length) {
      // Find the last newline within the maxSize limit
      const lastNewline = content.lastIndexOf('\n', end);
      
      if (lastNewline > start) {
        end = lastNewline + 1; // Include the newline
      }
    } else {
      end = content.length;
    }
    
    // Add chunk
    chunks.push(content.substring(start, end));
    
    // Move start position for next chunk, considering overlap
    if (end >= content.length) break;
    
    // Find a good position to start the next chunk with overlap
    const overlapStart = Math.max(start, end - overlapSize);
    const nextNewline = content.indexOf('\n', overlapStart);
    
    if (nextNewline > overlapStart && nextNewline < end) {
      start = nextNewline + 1; // Start after a newline in the overlap region
    } else {
      start = Math.max(start + 1, end - overlapSize);
    }
  }
  
  return chunks;
}

/**
 * Process a file and create semantic chunks
 * @param {string} filePath - Path to the file
 * @param {Object} options - Chunking options
 * @returns {Promise<Object[]>} Array of chunk objects
 */
async function processFile(filePath, options = {}) {
  try {
    // Normalize the file path
    const normalizedPath = pathUtils.normalize(filePath);
    
    // Check if file exists
    if (!await pathUtils.exists(normalizedPath)) {
      logger.error(`File does not exist: ${normalizedPath}`);
      return [];
    }
    
    // Emit file processing started event
    eventBus.emit('chunking:file:started', {
      filePath: normalizedPath,
      timestamp: Date.now()
    });
    
    // Track metrics
    const startTime = Date.now();
    
    // Read file content
    const content = await pathUtils.readFile(normalizedPath);
    
    // Create chunks
    const chunks = await createSemanticChunks(content, normalizedPath, options);
    
    // Emit file processing completed event
    const processingTime = Date.now() - startTime;
    eventBus.emit('chunking:file:completed', {
      filePath: normalizedPath,
      timestamp: Date.now(),
      chunkCount: chunks.length,
      processingTime
    });
    
    return chunks;
  } catch (error) {
    logger.error(`Error processing file ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Process multiple files and create semantic chunks
 * @param {string[]} filePaths - Array of file paths
 * @param {Object} options - Chunking options
 * @returns {Promise<Object[]>} Array of chunk objects
 */
async function processFiles(filePaths, options = {}) {
  try {
    // Track metrics
    const startTime = Date.now();
    
    // Get concurrency limit from config
    const concurrencyLimit = configService.getValue('chunking.concurrencyLimit', 5);
    
    // Emit batch processing started event
    eventBus.emit('chunking:batch:started', {
      fileCount: filePaths.length,
      timestamp: Date.now()
    });
    
    logger.info(`Processing ${filePaths.length} files with concurrency limit ${concurrencyLimit}`);
    
    // Process files with concurrency limit
    const allChunks = [];
    const chunks = [];
    
    // Process files in batches to control concurrency
    for (let i = 0; i < filePaths.length; i += concurrencyLimit) {
      const batch = filePaths.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(filePath => processFile(filePath, options));
      
      // Wait for the current batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          chunks.push(...result.value);
        } else {
          logger.error(`Failed to process file ${batch[index]}: ${result.reason}`);
        }
      });
    }
    
    // Combine all chunks
    allChunks.push(...chunks);
    
    // Emit batch processing completed event
    const processingTime = Date.now() - startTime;
    eventBus.emit('chunking:batch:completed', {
      fileCount: filePaths.length,
      chunkCount: allChunks.length,
      timestamp: Date.now(),
      processingTime
    });
    
    logger.info(`Processed ${filePaths.length} files into ${allChunks.length} chunks in ${processingTime}ms`);
    return allChunks;
  } catch (error) {
    logger.error(`Error processing files batch: ${error.message}`);
    return [];
  }
}

/**
 * Convert chunks to the format expected by the embedding system
 * @param {Object[]} chunks - Array of chunk objects
 * @returns {Object[]} Formatted chunks
 */
function formatChunks(chunks) {
  try {
    logger.debug(`Formatting ${chunks.length} chunks`);
    
    return chunks.map((chunk, index) => ({
      id: chunk.id || `chunk_${index}`,
      text: chunk.content,
      path: pathUtils.normalize(chunk.file),
      start_line: chunk.start_line,
      end_line: chunk.end_line,
      type: chunk.type,
      metadata: chunk.metadata || {},
      domain: chunk.domain || 'code'
    }));
  } catch (error) {
    logger.error(`Error formatting chunks: ${error.message}`);
    return [];
  }
}

/**
 * Get metrics about the chunker service
 * @returns {Object} Metrics object
 */
function getMetrics() {
  return {
    component: COMPONENT_NAME,
    timestamp: Date.now(),
    config: {
      maxChunkSize: CONFIG.maxChunkSize,
      minChunkSize: CONFIG.minChunkSize,
      overlapSize: CONFIG.overlapSize,
      respectBoundaries: CONFIG.respectBoundaries
    }
  };
}

// Export public API with standardized naming
module.exports = {
  initialize,
  processFile,
  processFiles,
  createSemanticChunks,
  identifyBoundaries,
  detectLanguage,
  inferChunkType,
  formatChunks,
  getMetrics,
  // Export for testing
  _internal: {
    detectTrendCraftDomain,
    findDocumentationBlocks,
    getBoundaryPatterns,
    splitLargeChunk
  }
};
