// DO NOT USE THIS FILE
// semantic-embeddings.js is fully deprecated as of July 2025.
// All semantic embedding operations MUST use EmbeddingsService via dependency injection.
// See MIGRATION.md for details on the new integration boundary.

module.exports = {
  // No-op exports for compatibility only
};


// Default empty corpus stats to prevent null object errors
const DEFAULT_CORPUS_STATS = {
  termFrequency: {},
  documentCount: 0,
  averageDocumentLength: 0,
  documentFrequency: {}
};

/**
 * Initialize the semantic embeddings module
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Configuration object
 */
async function initialize(options = {}) {
  // Merge options with defaults
  Object.assign(CONFIG, options);
  
  try {
    // Ensure cache directory exists
    if (!fs.existsSync(CONFIG.CACHE_DIR)) {
      fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
    }
    
    // Load corpus statistics if available
    const corpusStatsPath = path.join(CONFIG.CACHE_DIR, CONFIG.CORPUS_STATS_FILE);
    if (fs.existsSync(corpusStatsPath)) {
      try {
        const loadedStats = JSON.parse(fs.readFileSync(corpusStatsPath, 'utf8'));
        
        // Validate loaded stats structure - handle both formats
        if (loadedStats && typeof loadedStats === 'object') {
          // Handle case where we have the new format with termFrequency
          if (loadedStats.termFrequency) {
            corpusStats = loadedStats;
            logger.info(`Loaded corpus statistics with ${Object.keys(corpusStats.termFrequency).length} terms`);
          } 
          // Handle case where we have the old format with documentFrequency
          else if (loadedStats.documentFrequency) {
            // Convert to the expected format
            corpusStats = { 
              ...DEFAULT_CORPUS_STATS,
              termFrequency: {},
              documentFrequency: loadedStats.documentFrequency || {},
              totalDocuments: loadedStats.totalDocuments || 0,
              averageDocumentLength: loadedStats.averageDocumentLength || 0,
              vocabularySize: loadedStats.vocabularySize || 0
            };
            logger.info(`Converted legacy corpus statistics format with ${Object.keys(corpusStats.documentFrequency).length} terms`);
          } else {
            logger.warn('Invalid corpus statistics format, using defaults');
            corpusStats = { ...DEFAULT_CORPUS_STATS };
          }
        } else {
          logger.warn('Invalid corpus statistics format, using defaults');
          corpusStats = { ...DEFAULT_CORPUS_STATS };
        }
      } catch (error) {
        logger.warn(`Failed to load corpus statistics: ${error.message}`);
        logger.info('Using default corpus statistics');
        corpusStats = { ...DEFAULT_CORPUS_STATS };
      }
    } else {
      logger.info('No corpus statistics file found, using defaults');
    }
    
    logger.info('Semantic embeddings module initialized successfully');
    return CONFIG;
  } catch (error) {
    logger.error(`Error initializing semantic embeddings: ${error.message}`);
    throw error; // Propagate the error to be handled by the caller
  }
}

/**
 * Extract terms from text
 * @param {string} text - Input text
 * @returns {Object} Object with terms and their frequencies
 */
function extractTerms(text) {
  console.log('Extracting terms from text...');
  
  // Check if text is valid
  if (!text || typeof text !== 'string') {
    logger.error(`Invalid text input for term extraction: ${typeof text}`);
    return {};
  }
  
  // Extract comments separately to preserve their content
  const comments = [];
  const commentRegex = /\/\/.*?$|\/\*[\s\S]*?\*\//gm;
  let commentMatch;
  
  while ((commentMatch = commentRegex.exec(text)) !== null) {
    comments.push(commentMatch[0]);
  }
  
  // Process comments if they exist
  let commentTerms = {};
  if (comments.length > 0) {
    console.log(`Found ${comments.length} comments in text`);
    const combinedComments = comments.join(' ')
      .replace(/\/\*|\*\/|\/\//g, ' ') // Remove comment markers
      .replace(/[^\w\s]/g, ' ')        // Replace special chars with space
      .toLowerCase()
      .replace(/\s+/g, ' ')            // Normalize whitespace
      .trim();
    
    if (combinedComments.length > 0) {
      // Extract terms from comments
      const commentWords = combinedComments.split(' ')
        .filter(word => word && word.length >= CONFIG.MIN_TERM_LENGTH)
        .filter(word => !isCommonCodeTerm(word));
      
      for (const word of commentWords) {
        commentTerms[word] = (commentTerms[word] || 0) + 1;
      }
    }
  }
  
  // Process code
  // Handle apostrophes and special cases
  let processedText = text;
  if (text.includes("'")) {
    // Handle contractions and possessives by replacing apostrophes with spaces
    processedText = text.replace(/'/g, ' ');
  }
  
  // Normalize text: convert to lowercase and remove special characters
  const normalizedText = processedText.toLowerCase()
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ' ') // Replace comments with space
    .replace(/[^\w\s]/g, ' ')                  // Replace special chars with space
    .replace(/\s+/g, ' ')                      // Normalize whitespace
    .trim();
  
  // Handle empty text after normalization
  if (!normalizedText && Object.keys(commentTerms).length === 0) {
    console.log('No valid text content after normalization');
    return {};
  }
  
  // Split into words and filter out short terms and common code terms
  const words = normalizedText.split(' ')
    .filter(word => word && word.length >= CONFIG.MIN_TERM_LENGTH)
    .filter(word => !isCommonCodeTerm(word));
  
  // Count term frequency from code
  const codeTerms = {};
  for (const word of words) {
    codeTerms[word] = (codeTerms[word] || 0) + 1;
  }
  
  // Merge code terms and comment terms
  const termFrequency = { ...codeTerms };
  
  // Add comment terms with a slight boost
  for (const term in commentTerms) {
    termFrequency[term] = (termFrequency[term] || 0) + commentTerms[term] * 1.2;
  }
  
  // If no valid terms found, return empty object
  if (Object.keys(termFrequency).length === 0) {
    console.log('No valid terms extracted');
    return {};
  }
  
  console.log(`Extracted ${Object.keys(termFrequency).length} unique terms`);
  return termFrequency;
}

/**
 * Check if a term is a common code term with little semantic value
 * @param {string} term - Term to check
 * @returns {boolean} True if common term
 */
function isCommonCodeTerm(term) {
  const commonTerms = [
    'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
    'class', 'import', 'export', 'require', 'module', 'async', 'await', 'try',
    'catch', 'throw', 'new', 'this', 'undefined', 'null', 'true', 'false'
  ];
  
  return commonTerms.includes(term);
}

/**
 * Identify technical terms in the text
 * @param {Object} termFrequency - Term frequency object
 * @returns {string[]} Array of technical terms
 */
function identifyTechnicalTerms(termFrequency) {
  // Technical term patterns
  const technicalPatterns = [
    /^[a-z]+[A-Z][a-zA-Z]*$/,  // camelCase
    /^[A-Z][a-z]+[A-Z][a-zA-Z]*$/,  // PascalCase
    /^[a-z]+(_[a-z]+)+$/,  // snake_case
    /^[A-Z]+(_[A-Z]+)+$/,  // UPPER_SNAKE_CASE
    /^[a-z]+-[a-z]+-[a-z]+$/  // kebab-case
  ];
  
  // Check each term against patterns
  const technicalTerms = [];
  for (const term in termFrequency) {
    if (technicalPatterns.some(pattern => pattern.test(term))) {
      technicalTerms.push(term);
    }
  }
  
  return technicalTerms;
}

/**
 * Extract code-specific features from text
 * @param {string} text - Input text
 * @returns {Object} Extracted code features
 */
function extractCodeFeatures(text) {
  // Initialize features
  const features = {
    imports: [],
    functions: [],
    classes: [],
    variables: []
  };
  
  // Extract imports (ES6 and CommonJS)
  const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
  const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
  
  let match;
  while ((match = importRegex.exec(text)) !== null) {
    features.imports.push(match[1]);
  }
  
  while ((match = requireRegex.exec(text)) !== null) {
    features.imports.push(match[1]);
  }
  
  // Extract function names
  const functionRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  const arrowFunctionRegex = /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g;
  
  while ((match = functionRegex.exec(text)) !== null) {
    features.functions.push(match[1]);
  }
  
  while ((match = arrowFunctionRegex.exec(text)) !== null) {
    features.functions.push(match[1]);
  }
  
  // Extract class names
  const classRegex = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  
  while ((match = classRegex.exec(text)) !== null) {
    features.classes.push(match[1]);
  }
  
  // Extract variable declarations
  const varRegex = /(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  
  while ((match = varRegex.exec(text)) !== null) {
    features.variables.push(match[2]);
  }
  
  return features;
}

/**
 * Calculate TF-IDF weights for terms
 * @param {Object} termFrequency - Term frequency object
 * @returns {Object} TF-IDF weights for each term
 */
function calculateTfIdf(termFrequency) {
  console.log('Calculating TF-IDF weights as fallback...');
  
  const weights = {};
  const totalTerms = Object.values(termFrequency).reduce((sum, freq) => sum + freq, 0);
  
  // If corpus stats are not available or invalid, use term frequency only
  if (!corpusStats || typeof corpusStats !== 'object') {
    console.log('No corpus stats available, using normalized term frequency only');
    for (const term in termFrequency) {
      if (!term) continue;
      // Normalize by total terms (TF only)
      weights[term] = termFrequency[term] / Math.max(1, totalTerms);
    }
    return weights;
  }
  
  // Get corpus statistics with support for both naming conventions
  const documentCount = corpusStats.totalDocuments || corpusStats.documentCount || 1;
  const docFreqStats = corpusStats.documentFrequencies || corpusStats.documentFrequency || {};
  
  console.log(`Using TF-IDF with ${documentCount} documents in corpus`);
  
  for (const term in termFrequency) {
    // Skip if term is undefined or null
    if (!term) continue;
    
    try {
      // Term frequency in this document
      const tf = termFrequency[term] / Math.max(1, totalTerms);
      
      // Inverse document frequency with fallback
      const docFreq = docFreqStats[term] || 0.5;
      
      // Calculate IDF with smoothing to avoid log(0)
      let idf = 1.0; // Default neutral value
      if (documentCount > 0 && docFreq > 0) {
        idf = Math.log((documentCount / Math.max(0.5, docFreq)) + 1);
      }
      
      // Ensure IDF is valid
      if (!isFinite(idf) || isNaN(idf)) {
        idf = 1.0;
      }
      
      // TF-IDF weight
      const weight = tf * idf;
      
      // Only add valid weights
      if (isFinite(weight) && !isNaN(weight)) {
        weights[term] = weight;
      }
    } catch (error) {
      console.error(`Error calculating TF-IDF for term '${term}': ${error.message}`);
      // Skip this term
    }
  }
  
  return weights;
}

/**
 * Calculate BM25 score for terms
 * @param {Object} termFrequency - Term frequency object
 * @param {number} documentLength - Document length
 * @returns {Object} BM25 weights for each term
 */
function calculateBM25(termFrequency, documentLength) {
  const weights = {};
  const k1 = 1.2;  // Term frequency saturation parameter
  const b = 0.75;  // Document length normalization parameter
  
  console.log('Calculating BM25 with corpus stats...');
  
  // If corpus stats are not available or invalid, fall back to TF-IDF
  if (!corpusStats || typeof corpusStats !== 'object') {
    logger.error('Corpus stats unavailable or invalid, falling back to TF-IDF');
    return calculateTfIdf(termFrequency);
  }
  
  // Get corpus statistics with support for both naming conventions
  // Handle both termFrequencies and termFrequency naming
  const globalTermFreq = corpusStats.termFrequencies || corpusStats.termFrequency || {};
  
  // Handle both documentFrequencies and documentFrequency naming
  const docFreqStats = corpusStats.documentFrequencies || corpusStats.documentFrequency || {};
  
  // Get total documents count
  const documentCount = corpusStats.totalDocuments || 0;
  
  // Get average document length
  const averageDocumentLength = corpusStats.averageDocumentLength || 0;
  
  console.log(`Corpus stats: ${documentCount} documents, avg length: ${averageDocumentLength}`);
  console.log(`Vocabulary size: ${Object.keys(globalTermFreq).length} terms`);
  
  // Validate corpus statistics
  if (documentCount <= 0 || averageDocumentLength <= 0) {
    logger.error('Invalid corpus statistics values (zero or negative), falling back to TF-IDF');
    return calculateTfIdf(termFrequency);
  }
  
  // Calculate BM25 weights
  for (const term in termFrequency) {
    // Skip if term is undefined or null
    if (!term) continue;
    
    // Term frequency in this document
    const tf = termFrequency[term];
    
    // Get document frequency with fallback
    const docFreq = (docFreqStats[term] || 0.5);
    
    // Calculate IDF with smoothing to avoid log(0)
    let idf;
    try {
      idf = Math.log((documentCount - docFreq + 0.5) / (docFreq + 0.5) + 1);
      
      // Sanity check on IDF
      if (!isFinite(idf) || isNaN(idf)) {
        idf = 1.0; // Fallback to neutral IDF
      }
    } catch (error) {
      console.error(`Error calculating IDF for term '${term}': ${error.message}`);
      idf = 1.0; // Fallback to neutral IDF
    }
    
    // Calculate BM25 score with safeguards
    try {
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (documentLength / Math.max(1, averageDocumentLength)));
      
      // Calculate weight with protection against division by zero
      const weight = idf * (numerator / Math.max(0.1, denominator));
      
      // Only add valid weights
      if (isFinite(weight) && !isNaN(weight)) {
        weights[term] = weight;
      }
    } catch (error) {
      console.error(`Error calculating BM25 weight for term '${term}': ${error.message}`);
      // Skip this term
    }
  }
  
  return weights;
}

/**
 * Generate weighted embedding from terms and weights
 * @param {Object} termWeights - Term weights
 * @param {Object} codeFeatures - Code features
 * @param {string[]} technicalTerms - Technical terms
 * @param {number} dimensions - Embedding dimensions
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateWeightedEmbedding(termWeights, codeFeatures, technicalTerms, dimensions = CONFIG.DIMENSIONS) {
  // Initialize embedding vector with zeros
  const embedding = new Array(dimensions).fill(0);
  
  // Add weighted term contributions
  for (const term in termWeights) {
    const weight = termWeights[term];
    const termHash = await hashTerm(term, dimensions);
    
    // Apply weight to each dimension
    for (let i = 0; i < dimensions; i++) {
      embedding[i] += termHash[i] * weight;
    }
  }
  
  // Add weighted technical term contributions
  for (const term of technicalTerms) {
    const weight = (termWeights[term] || 0) * CONFIG.TECHNICAL_TERMS_WEIGHT;
    const termHash = await hashTerm(term, dimensions);
    
    for (let i = 0; i < dimensions; i++) {
      embedding[i] += termHash[i] * weight;
    }
  }
  
  // Add weighted code feature contributions
  for (const featureType in codeFeatures) {
    for (const feature of codeFeatures[featureType]) {
      const weight = CONFIG.CODE_FEATURES_WEIGHT / codeFeatures[featureType].length;
      const featureHash = await hashTerm(feature, dimensions);
      
      for (let i = 0; i < dimensions; i++) {
        embedding[i] += featureHash[i] * weight;
      }
    }
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

/**
 * Hash a term to a vector of specified dimensions
 * @param {string} term - Term to hash
 * @param {number} dimensions - Number of dimensions
 * @returns {Promise<number[]>} Hash vector
 */
async function hashTerm(term, dimensions) {
  // Validate input parameters
  if (term === undefined || term === null) {
    logger.warn(`Invalid term for hashing: ${term}`);
    return new Array(dimensions || CONFIG.EMBEDDING_DIMENSIONS || 384).fill(0);
  }
  
  // Ensure term is a string
  const termString = String(term);
  
  // Validate dimensions
  const dims = dimensions || CONFIG.EMBEDDING_DIMENSIONS || 384;
  if (!Number.isInteger(dims) || dims <= 0) {
    logger.warn(`Invalid dimensions for hashing: ${dims}`);
    return new Array(384).fill(0);
  }
  
  try {
    // Use process.nextTick to prevent blocking the event loop
    await new Promise(resolve => process.nextTick(resolve));
    
    const hash = crypto.createHash('sha256').update(termString).digest('hex');
    const vector = new Array(dims);
    
    for (let i = 0; i < dims; i++) {
      // Use different parts of the hash to generate vector components
      const hashPart = hash.substring(i % hash.length, (i % hash.length) + 8);
      vector[i] = parseInt(hashPart, 16) / Math.pow(16, 8) * 2 - 1; // Range: [-1, 1]
    }
    
    return vector;
  } catch (error) {
    logger.error(`Error hashing term: ${error.message}`);
    return new Array(dims).fill(0);
  }
}

/**
 * Generate semantic embedding for text
 * @param {string} text - Input text
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateSemanticEmbedding(text) {
  // Validate input
  if (!text || typeof text !== 'string') {
    logger.error(`Invalid text input for semantic embedding: ${typeof text}`);
    throw new Error('Invalid input: text must be a non-empty string');
  }
  
  console.log(`Generating embedding for text (${text.length} chars)`);
  
  try {
    // Extract terms and their frequencies
    const termFrequency = extractTerms(text);
    
    // Check if we have any terms
    if (!termFrequency || Object.keys(termFrequency).length === 0) {
      logger.error('No valid terms extracted from text');
      throw new Error('No valid terms could be extracted from input text');
    }
    
    // Extract document length (word count)
    const documentLength = Object.values(termFrequency).reduce((sum, freq) => sum + freq, 0);
    
    // Validate document length
    if (documentLength <= 0) {
      logger.error('Invalid document length (zero)');
      throw new Error('Document has invalid length');
    }
    
    // Calculate term weights using BM25
    let termWeights;
    try {
      console.log('Calculating BM25 weights...');
      termWeights = calculateBM25(termFrequency, documentLength);
      
      // Validate term weights
      if (!termWeights || Object.keys(termWeights).length === 0) {
        logger.warn('BM25 calculation returned empty weights, falling back to TF-IDF');
        termWeights = calculateTfIdf(termFrequency);
      }
    } catch (weightError) {
      logger.error(`Error calculating BM25 weights: ${weightError.message}`);
      console.log('Falling back to TF-IDF weights');
      termWeights = calculateTfIdf(termFrequency);
    }
    
    // Initialize embedding vector with zeros
    const embedding = new Array(CONFIG.DIMENSIONS).fill(0);
    
    console.log('Applying term weights to embedding...');
    // Apply term weights to embedding
    for (const term in termWeights) {
      if (!term) continue;
      
      const weight = termWeights[term];
      if (isNaN(weight) || !isFinite(weight)) continue;
      
      // Get hash vector for this term
      const termVector = await hashTerm(term, CONFIG.DIMENSIONS);
      
      // Apply weight to each dimension
      for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
        embedding[i] += termVector[i] * weight;
      }
    }
    
    // Normalize the embedding
    console.log('Normalizing embedding vector...');
    let squaredSum = embedding.reduce((sum, val) => sum + val * val, 0);
    let norm = Math.sqrt(squaredSum);
    
    // Check if we need to use fallback
    if (norm <= 0.0001) {
      logger.warn('Generated embedding has near-zero magnitude, using deterministic fallback');
      
      // Create a deterministic embedding based on text hash
      console.log('Generating deterministic fallback embedding from text hash...');
      
      // Create a simple hash of the text
      const hash = crypto.createHash('sha256').update(text || 'fallback').digest('hex');
      
      // Reset the embedding array
      for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
        embedding[i] = 0;
      }
      
      // Use the hash to generate a deterministic vector
      for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
        // Use different parts of the hash for each dimension
        const hashPart = parseInt(hash.substring((i * 2) % 64, ((i * 2) % 64) + 2), 16);
        // Convert to a value between -0.5 and 0.5 to avoid extreme values
        embedding[i] = (hashPart / 255.0) - 0.5;
      }
      
      // Ensure we have a non-zero vector
      let hasNonZero = false;
      for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
        if (Math.abs(embedding[i]) > 0.001) {
          hasNonZero = true;
          break;
        }
      }
      
      // Add a small constant if all values are near zero
      if (!hasNonZero) {
        for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
          embedding[i] = (i % 2 === 0) ? 0.1 : -0.1;
        }
      }
      
      console.log('Fallback embedding generated successfully');
      
      // Recalculate the norm for the fallback embedding
      squaredSum = embedding.reduce((sum, val) => sum + val * val, 0);
      norm = Math.sqrt(squaredSum);
    }
    
    // Normalize to unit length - only do this once!
    if (norm > 0.0001) {
      for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
        embedding[i] = embedding[i] / norm;
        
        // Check for invalid values
        if (!isFinite(embedding[i]) || isNaN(embedding[i])) {
          logger.error(`Invalid value in embedding at position ${i}: ${embedding[i]}`);
          // Replace invalid value with 0
          embedding[i] = 0;
        }
      }
    } else {
      // If still near zero after fallback, use a simple unit vector
      logger.warn('Using simple unit vector as last resort');
      for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
        embedding[i] = (i === 0) ? 1.0 : 0.0;
      }
    }
    
    // Final validation
    for (let i = 0; i < CONFIG.DIMENSIONS; i++) {
      if (!isFinite(embedding[i]) || isNaN(embedding[i])) {
        logger.error(`Invalid value in final embedding at position ${i}: ${embedding[i]}`);
        throw new Error('Generated embedding contains invalid values after normalization');
      }
    }
    
    console.log('Embedding generation successful');
    return embedding;
  } catch (error) {
    logger.error(`Failed to generate semantic embedding: ${error.message}`);
    throw error; // Propagate the error instead of falling back silently
  }
}

/**
 * Generate a fallback embedding using a hash function
 * @param {string} text - Text to generate embedding for
 * @param {number} dimensions - Number of dimensions for the embedding
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateFallbackEmbedding(text, dimensions = CONFIG.DIMENSIONS) {
  try {
    // Create a simple hash-based embedding
    const terms = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length >= CONFIG.MIN_TERM_LENGTH);
    
    // Initialize embedding vector with zeros
    const embedding = new Array(dimensions).fill(0);
    
    // Hash each term and add to embedding
    for (const term of terms) {
      const termHash = await hashTerm(term, dimensions);
      for (let i = 0; i < dimensions; i++) {
        embedding[i] += termHash[i];
      }
    }
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  } catch (error) {
    logger.error(`Error generating fallback embedding: ${error.message}`);
    return new Array(dimensions).fill(0);
  }
}

/**
 * Generate hash-based embedding for text
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateHashEmbedding(text) {
  return await generateFallbackEmbedding(text, CONFIG.DIMENSIONS);
}

/**
 * Build corpus statistics from a collection of documents
 * @param {string[]} documents - Array of document texts
 * @returns {Object} Corpus statistics
 */
async function buildCorpusStats(documents) {
  const stats = {
    documentCount: documents.length,
    termDocumentFrequency: {},
    averageDocumentLength: 0,
    totalTerms: 0
  };
  
  let totalLength = 0;
  
  // Process each document
  for (const doc of documents) {
    const termFrequency = extractTerms(doc);
    const docLength = Object.values(termFrequency).reduce((sum, freq) => sum + freq, 0);
    
    totalLength += docLength;
    stats.totalTerms += docLength;
    
    // Count document frequency for each term
    for (const term in termFrequency) {
      stats.termDocumentFrequency[term] = (stats.termDocumentFrequency[term] || 0) + 1;
    }
  }
  
  // Calculate average document length
  stats.averageDocumentLength = totalLength / documents.length;
  
  // Save corpus statistics
  corpusStats = stats;
  const corpusStatsPath = path.join(CONFIG.CACHE_DIR, CONFIG.CORPUS_STATS_FILE);
  
  try {
    fs.writeFileSync(corpusStatsPath, JSON.stringify(stats, null, 2), 'utf8');
    logger.info(`Saved corpus statistics with ${Object.keys(stats.termDocumentFrequency).length} terms`);
  } catch (error) {
    logger.warn(`Failed to save corpus statistics: ${error.message}`);
  }
  
  return stats;
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Export public API
module.exports = {
  initialize,
  generateSemanticEmbedding,
  generateFallbackEmbedding,
  generateHashEmbedding,
  buildCorpusStats,
  cosineSimilarity,
  extractTerms,
  extractCodeFeatures,
  identifyTechnicalTerms
};
