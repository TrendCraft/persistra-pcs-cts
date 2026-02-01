/**
 * Metadata Extraction Adapter
 *
 * # DI MIGRATION: This module requires both embeddingsInterface and logger via DI. Do not require true-semantic-embeddings.js or create a logger inside this file.
 *
 * This adapter extracts metadata from conversations and summaries,
 * tagging them with relevant components and concepts. It's part of
 * Phase 3 of the Conversation-Aware Leo implementation, focusing on
 * conversation summarization.
 *
 * Enhanced with semantic similarity, diagnostics, and lifecycle management.
 */

const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const path = require('path');
const fs = require('fs').promises;
const { calculateCosineSimilarity } = require('../utils/vector-utils');
// Logger and embeddingsInterface will be set via DI
let embeddingsInterface = null;
let logger = null;

// Component name for logging and events
const COMPONENT_NAME = 'metadata-extraction-adapter';

// Logger will be injected, fallback to default if not provided

// Configuration with sensible defaults
let CONFIG = {
  COMPONENT_REGISTRY_PATH: process.env.LEO_COMPONENT_REGISTRY || path.join(process.cwd(), 'data', 'registry', 'components.json'),
  CONCEPT_REGISTRY_PATH: process.env.LEO_CONCEPT_REGISTRY || path.join(process.cwd(), 'data', 'registry', 'concepts.json'),
  MIN_MATCH_SCORE: 0.7,
  ENABLE_AUTO_TAGGING: true,
  MAX_TAGS_PER_CATEGORY: 5,
  ENABLE_SEMANTIC_SIMILARITY: true,
  SEMANTIC_WEIGHT: 0.7,         // Weight for semantic similarity (0-1)
  LEXICAL_WEIGHT: 0.3,          // Weight for lexical similarity (0-1)
  CACHE_EMBEDDINGS: true,       // Cache embeddings for better performance
  EMBEDDING_DIMENSION: 384,     // Dimension of embedding vectors
  SIMILARITY_ALGORITHM: 'hybrid' // 'semantic', 'lexical', or 'hybrid'
};

// Initialization state
let isInitialized = false;

// Registry data
let componentRegistry = [];
let conceptRegistry = [];

// Cache for embeddings to avoid redundant calculations
let embeddingsCache = new Map();

// Diagnostic information
let diagnosticInfo = {
  lastRun: null,
  processedCount: 0,
  successCount: 0,
  errorCount: 0,
  averageProcessingTime: 0
};

/**
 * Initialize the metadata extraction adapter
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  embeddingsInterface = options.embeddingsInterface;
  logger = options.logger || console;
  if (!embeddingsInterface) {
    logger.warn && logger.warn('[metadata-extraction-adapter] DI MIGRATION: embeddingsInterface not provided! Functionality will be limited.');
  }
  if (!options.logger) {
    console.warn('[metadata-extraction-adapter] DI MIGRATION: logger not provided! Falling back to console.');
  }
  try {
    // If already initialized, dispose first
    if (isInitialized) {
      await dispose();
    }
    
    logger.info('Initializing metadata extraction adapter');
    
    // Merge options with defaults
    Object.assign(CONFIG, options);
    
    // Try to get configuration from central config service
    try {
      const config = configService.getConfig();
      if (config.metadataExtraction) {
        Object.assign(CONFIG, config.metadataExtraction);
      }
    } catch (configError) {
      logger.warn(`Could not load configuration from config service: ${configError.message}`);
    }
    
    // Load registries
    await loadRegistries();
    
    // Initialize embedding cache if semantic similarity is enabled
    if (CONFIG.ENABLE_SEMANTIC_SIMILARITY) {
      logger.info('Semantic similarity enabled for metadata extraction');
      
      // Pre-compute embeddings for registry items
      if (CONFIG.CACHE_EMBEDDINGS) {
        await precomputeRegistryEmbeddings();
      }
    }
    
    // Subscribe to events if auto-tagging is enabled
    if (CONFIG.ENABLE_AUTO_TAGGING) {
      eventBus.on('conversation:summarized', handleSummarizedEvent, COMPONENT_NAME);
    }
    
    // Reset diagnostic info
    diagnosticInfo = {
      lastRun: null,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      averageProcessingTime: 0
    };
    
    isInitialized = true;
    logger.info('Metadata extraction adapter initialized successfully');
    
    // Emit initialization event
    eventBus.emit('component:initialized', { 
      component: COMPONENT_NAME,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Dispose of the metadata extraction adapter
 * @returns {Promise<boolean>} Success status
 */
async function dispose() {
  try {
    logger.info('Disposing metadata extraction adapter');
    
    // Remove event listeners
    eventBus.off('conversation:summarized', handleSummarizedEvent);
    
    // Clear caches
    embeddingsCache.clear();
    
    isInitialized = false;
    logger.info('Metadata extraction adapter disposed successfully');
    
    return true;
  } catch (error) {
    logger.error(`Disposal failed: ${error.message}`);
    return false;
  }
}

/**
 * Get diagnostic information about the adapter
 * @returns {Object} Diagnostic information
 */
function getDiagnostics() {
  return {
    initialized: isInitialized,
    componentCount: componentRegistry.length,
    conceptCount: conceptRegistry.length,
    embeddingsCacheSize: embeddingsCache.size,
    semanticSimilarityEnabled: CONFIG.ENABLE_SEMANTIC_SIMILARITY,
    similarityAlgorithm: CONFIG.SIMILARITY_ALGORITHM,
    ...diagnosticInfo
  };
}

/**
 * Precompute embeddings for registry items
 * @private
 */
async function precomputeRegistryEmbeddings() {
  try {
    logger.info('Precomputing embeddings for registry items');
    
    // Precompute component embeddings
    for (const component of componentRegistry) {
      const text = `${component.name} ${component.keywords.join(' ')}`;
      await getOrCreateEmbedding(text);
    }
    
    // Precompute concept embeddings
    for (const concept of conceptRegistry) {
      const text = `${concept.name} ${concept.description} ${concept.keywords.join(' ')}`;
      await getOrCreateEmbedding(text);
    }
    
    logger.info(`Precomputed embeddings for ${embeddingsCache.size} registry items`);
  } catch (error) {
    logger.error(`Error precomputing embeddings: ${error.message}`);
  }
}

/**
 * Get or create an embedding for text
 * @param {string} text - Text to get embedding for
 * @returns {Promise<Array<number>>} Embedding vector
 * @private
 */
async function getOrCreateEmbedding(text) {
  if (!text) return null;
  
  // Normalize text
  const normalizedText = text.toLowerCase().trim();
  
  // Use cache if enabled
  if (CONFIG.CACHE_EMBEDDINGS) {
    const cacheKey = normalizedText;
    
    if (embeddingsCache.has(cacheKey)) {
      return embeddingsCache.get(cacheKey);
    }
    
    try {
      const embedding = await embeddings.generate(normalizedText);
      embeddingsCache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      return null;
    }
  } else {
    try {
      return await embeddings.generate(normalizedText);
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      return null;
    }
  }
}

/**
 * Load component and concept registries
 * @private
 */
async function loadRegistries() {
  try {
    // Ensure registry directory exists
    const registryDir = path.dirname(CONFIG.COMPONENT_REGISTRY_PATH);
    await fs.mkdir(registryDir, { recursive: true });
    
    // Load component registry
    try {
      await fs.access(CONFIG.COMPONENT_REGISTRY_PATH);
      const componentData = await fs.readFile(CONFIG.COMPONENT_REGISTRY_PATH, 'utf8');
      componentRegistry = JSON.parse(componentData);
      logger.info(`Loaded ${componentRegistry.length} components from registry`);
    } catch (error) {
      // Create empty registry if it doesn't exist
      componentRegistry = createDefaultComponentRegistry();
      await fs.writeFile(CONFIG.COMPONENT_REGISTRY_PATH, JSON.stringify(componentRegistry, null, 2), 'utf8');
      logger.info(`Created default component registry with ${componentRegistry.length} components`);
    }
    
    // Load concept registry
    try {
      await fs.access(CONFIG.CONCEPT_REGISTRY_PATH);
      const conceptData = await fs.readFile(CONFIG.CONCEPT_REGISTRY_PATH, 'utf8');
      conceptRegistry = JSON.parse(conceptData);
      logger.info(`Loaded ${conceptRegistry.length} concepts from registry`);
    } catch (error) {
      // Create empty registry if it doesn't exist
      conceptRegistry = createDefaultConceptRegistry();
      await fs.writeFile(CONFIG.CONCEPT_REGISTRY_PATH, JSON.stringify(conceptRegistry, null, 2), 'utf8');
      logger.info(`Created default concept registry with ${conceptRegistry.length} concepts`);
    }
  } catch (error) {
    logger.error(`Failed to load registries: ${error.message}`);
    // Initialize with empty registries
    componentRegistry = [];
    conceptRegistry = [];
  }
}

/**
 * Create default component registry
 * @returns {Array} Default component registry
 * @private
 */
function createDefaultComponentRegistry() {
  return [
    {
      id: 'semantic-context-manager',
      name: 'Semantic Context Manager',
      path: 'lib/services/semantic-context-manager.js',
      type: 'service',
      keywords: ['context', 'semantic', 'manager', 'retrieval']
    },
    {
      id: 'true-semantic-embeddings',
      name: 'True Semantic Embeddings',
      path: 'lib/services/true-semantic-embeddings.js',
      type: 'service',
      keywords: ['embeddings', 'vectors', 'semantic', 'similarity']
    },
    {
      id: 'semantic-chunker-adapter',
      name: 'Semantic Chunker Adapter',
      path: 'lib/adapters/semantic-chunker-adapter.js',
      type: 'adapter',
      keywords: ['chunker', 'semantic', 'text', 'processing']
    },
    {
      id: 'conversation-capture-service',
      name: 'Conversation Capture Service',
      path: 'lib/services/conversation-capture-service.js',
      type: 'service',
      keywords: ['conversation', 'capture', 'storage', 'memory']
    },
    {
      id: 'conversation-capture-adapter',
      name: 'Conversation Capture Adapter',
      path: 'lib/adapters/conversation-capture-adapter.js',
      type: 'adapter',
      keywords: ['conversation', 'capture', 'adapter', 'events']
    },
    {
      id: 'conversation-chunker-adapter',
      name: 'Conversation Chunker Adapter',
      path: 'lib/adapters/conversation-chunker-adapter.js',
      type: 'adapter',
      keywords: ['conversation', 'chunker', 'semantic', 'processing']
    },
    {
      id: 'conversation-embeddings-adapter',
      name: 'Conversation Embeddings Adapter',
      path: 'lib/adapters/conversation-embeddings-adapter.js',
      type: 'adapter',
      keywords: ['conversation', 'embeddings', 'vectors', 'semantic']
    },
    {
      id: 'conversation-semantic-search',
      name: 'Conversation Semantic Search',
      path: 'lib/services/conversation-semantic-search.js',
      type: 'service',
      keywords: ['conversation', 'search', 'semantic', 'retrieval']
    },
    {
      id: 'conversation-summarizer',
      name: 'Conversation Summarizer',
      path: 'lib/services/conversation-summarizer.js',
      type: 'service',
      keywords: ['conversation', 'summary', 'summarization', 'insights']
    },
    {
      id: 'metadata-extraction-adapter',
      name: 'Metadata Extraction Adapter',
      path: 'lib/adapters/metadata-extraction-adapter.js',
      type: 'adapter',
      keywords: ['metadata', 'extraction', 'tagging', 'concepts']
    }
  ];
}

/**
 * Create default concept registry
 * @returns {Array} Default concept registry
 * @private
 */
function createDefaultConceptRegistry() {
  return [
    {
      id: 'semantic-processing',
      name: 'Semantic Processing',
      description: 'Processing text to understand its meaning and context',
      keywords: ['semantic', 'meaning', 'context', 'understanding', 'nlp']
    },
    {
      id: 'vector-embeddings',
      name: 'Vector Embeddings',
      description: 'Converting text into numerical vectors that capture semantic meaning',
      keywords: ['embeddings', 'vectors', 'numerical', 'representation']
    },
    {
      id: 'conversation-awareness',
      name: 'Conversation Awareness',
      description: 'Capturing and utilizing conversations for context and memory',
      keywords: ['conversation', 'awareness', 'memory', 'context', 'dialogue']
    },
    {
      id: 'summarization',
      name: 'Summarization',
      description: 'Generating concise summaries of longer content',
      keywords: ['summary', 'summarization', 'concise', 'extract', 'key points']
    },
    {
      id: 'metadata-tagging',
      name: 'Metadata Tagging',
      description: 'Adding descriptive tags and metadata to content',
      keywords: ['metadata', 'tagging', 'tags', 'description', 'annotation']
    },
    {
      id: 'semantic-search',
      name: 'Semantic Search',
      description: 'Finding content based on meaning rather than exact keyword matches',
      keywords: ['search', 'semantic', 'meaning', 'retrieval', 'similarity']
    },
    {
      id: 'context-management',
      name: 'Context Management',
      description: 'Managing and utilizing context for improved understanding',
      keywords: ['context', 'management', 'relevance', 'understanding']
    },
    {
      id: 'decision-tracking',
      name: 'Decision Tracking',
      description: 'Tracking and recording decisions made during development',
      keywords: ['decision', 'tracking', 'rationale', 'choices', 'reasoning']
    },
    {
      id: 'code-linking',
      name: 'Code Linking',
      description: 'Connecting discussions and decisions to specific code changes',
      keywords: ['code', 'linking', 'connection', 'traceability', 'changes']
    },
    {
      id: 'knowledge-graph',
      name: 'Knowledge Graph',
      description: 'Representing knowledge as a graph of connected concepts',
      keywords: ['knowledge', 'graph', 'connections', 'relationships', 'network']
    }
  ];
}

/**
 * Handle summarized event
 * @param {Object} data - Event data
 * @private
 */
async function handleSummarizedEvent(data) {
  if (!isInitialized) {
    return;
  }
  
  try {
    const { summaryId } = data;
    
    if (!summaryId) {
      logger.warn('Received conversation:summarized event without summaryId');
      return;
    }
    
    logger.info(`Processing summarized event for summary: ${summaryId}`);
    
    // Get the summary data
    const summarizer = require('../services/conversation-summarizer');
    const summary = await summarizer.getSummary(summaryId);
    
    if (!summary) {
      logger.warn(`Could not find summary ${summaryId}`);
      return;
    }
    
    // Extract metadata
    const metadata = await extractMetadata(summary);
    
    // Update the summary with the extracted metadata
    summary.extractedMetadata = metadata;
    
    // Save the updated summary
    await summarizer.updateSummary(summary);
    
    logger.info(`Updated summary ${summaryId} with extracted metadata`);
    
    // Emit event
    eventBus.emit('metadata:extracted', {
      component: COMPONENT_NAME,
      summaryId,
      metadata
    });
  } catch (error) {
    logger.error(`Error handling summarized event: ${error.message}`);
  }
}

/**
 * Calculate match score between text and keywords
 * @param {string} text - Text to match against
 * @param {Array<string>} keywords - Keywords to match
 * @param {Object} options - Additional options
 * @param {string} options.algorithm - Similarity algorithm to use ('lexical', 'semantic', or 'hybrid')
 * @returns {Promise<number>} Match score (0-1)
 * @private
 */
async function calculateMatchScore(text, keywords, options = {}) {
  if (!text || !keywords || keywords.length === 0) {
    return 0;
  }
  
  // Default to configured algorithm if not specified
  const algorithm = options.algorithm || CONFIG.SIMILARITY_ALGORITHM;
  
  // For lexical-only matching, use the simple approach
  if (algorithm === 'lexical' || !CONFIG.ENABLE_SEMANTIC_SIMILARITY) {
    return calculateLexicalMatchScore(text, keywords);
  }
  
  // For semantic-only matching, use embeddings
  if (algorithm === 'semantic') {
    return await calculateSemanticMatchScore(text, keywords);
  }
  
  // For hybrid matching, combine both approaches
  const lexicalScore = calculateLexicalMatchScore(text, keywords);
  const semanticScore = await calculateSemanticMatchScore(text, keywords);
  
  // Weighted average of both scores
  return (lexicalScore * CONFIG.LEXICAL_WEIGHT) + (semanticScore * CONFIG.SEMANTIC_WEIGHT);
}

/**
 * Calculate lexical match score between text and keywords
 * @param {string} text - Text to match against
 * @param {Array<string>} keywords - Keywords to match
 * @returns {number} Match score (0-1)
 * @private
 */
function calculateLexicalMatchScore(text, keywords) {
  const normalizedText = text.toLowerCase();
  let matchCount = 0;
  let totalWeight = 0;
  
  // Enhanced lexical matching with partial matching and weighting
  keywords.forEach(keyword => {
    const normalizedKeyword = keyword.toLowerCase();
    totalWeight += 1;
    
    // Exact match has highest weight
    if (normalizedText.includes(normalizedKeyword)) {
      matchCount += 1;
      return;
    }
    
    // Check for word boundary matches (e.g., "log" matching "logging" but not "dialog")
    const wordBoundaryRegex = new RegExp(`\\b${normalizedKeyword}\\b`, 'i');
    if (wordBoundaryRegex.test(normalizedText)) {
      matchCount += 0.8;
      return;
    }
    
    // Check for partial matches with longer keywords (at least 4 chars)
    if (normalizedKeyword.length >= 4 && normalizedText.includes(normalizedKeyword.substring(0, normalizedKeyword.length - 1))) {
      matchCount += 0.5;
      return;
    }
  });
  
  return totalWeight > 0 ? matchCount / totalWeight : 0;
}

/**
 * Calculate semantic match score between text and keywords
 * @param {string} text - Text to match against
 * @param {Array<string>} keywords - Keywords to match
 * @returns {Promise<number>} Match score (0-1)
 * @private
 */
async function calculateSemanticMatchScore(text, keywords) {
  try {
    // Get embedding for the text
    const textEmbedding = await getOrCreateEmbedding(text);
    if (!textEmbedding) return 0;
    
    // Combine keywords into a single string for better semantic representation
    const keywordText = keywords.join(' ');
    const keywordEmbedding = await getOrCreateEmbedding(keywordText);
    if (!keywordEmbedding) return 0;
    
    // Calculate cosine similarity between embeddings
    const similarity = calculateCosineSimilarity(textEmbedding, keywordEmbedding);
    
    // Normalize similarity to 0-1 range (cosine similarity is between -1 and 1)
    return (similarity + 1) / 2;
  } catch (error) {
    logger.error(`Error calculating semantic match score: ${error.message}`);
    return 0;
  }
}

/**
 * Extract component references from text
 * @param {string} text - Text to extract from
 * @param {Object} options - Extraction options
 * @param {boolean} options.dryRun - Whether to perform a dry run (no side effects)
 * @returns {Promise<Array<Object>>} Extracted component references
 * @private
 */
async function extractComponentReferences(text, options = {}) {
  if (!text || !componentRegistry || componentRegistry.length === 0) {
    return [];
  }
  
  const startTime = Date.now();
  const results = [];
  
  // Process each component in the registry
  for (const component of componentRegistry) {
    const score = await calculateMatchScore(text, [component.name, ...component.keywords], options);
    
    if (score >= CONFIG.MIN_MATCH_SCORE) {
      results.push({
        id: component.id,
        name: component.name,
        score,
        type: component.type,
        path: component.path,
        matchDetails: options.includeDetails ? {
          algorithm: CONFIG.SIMILARITY_ALGORITHM,
          keywords: [component.name, ...component.keywords],
          threshold: CONFIG.MIN_MATCH_SCORE
        } : undefined
      });
    }
  }
  
  // Update diagnostics if not in dry run mode
  if (!options.dryRun) {
    const processingTime = Date.now() - startTime;
    updateDiagnostics(processingTime, results.length > 0);
  }
  
  // Sort by score (descending) and limit to max tags
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.MAX_TAGS_PER_CATEGORY);
}

/**
 * Update diagnostic information
 * @param {number} processingTime - Time taken to process
 * @param {boolean} success - Whether processing was successful
 * @private
 */
function updateDiagnostics(processingTime, success) {
  diagnosticInfo.lastRun = Date.now();
  diagnosticInfo.processedCount++;
  
  if (success) {
    diagnosticInfo.successCount++;
  } else {
    diagnosticInfo.errorCount++;
  }
  
  // Update average processing time
  if (diagnosticInfo.averageProcessingTime === 0) {
    diagnosticInfo.averageProcessingTime = processingTime;
  } else {
    diagnosticInfo.averageProcessingTime = 
      (diagnosticInfo.averageProcessingTime * (diagnosticInfo.processedCount - 1) + processingTime) / 
      diagnosticInfo.processedCount;
  }
}

/**
 * Extract concept references from text
 * @param {string} text - Text to extract from
 * @param {Object} options - Extraction options
 * @param {boolean} options.dryRun - Whether to perform a dry run (no side effects)
 * @param {boolean} options.includeDetails - Whether to include match details
 * @returns {Promise<Array<Object>>} Extracted concept references
 * @private
 */
async function extractConceptReferences(text, options = {}) {
  if (!text || !conceptRegistry || conceptRegistry.length === 0) {
    return [];
  }
  
  const startTime = Date.now();
  const results = [];
  
  // Process each concept in the registry
  for (const concept of conceptRegistry) {
    // Create a richer text for matching by combining name, description and keywords
    const conceptText = `${concept.name} ${concept.description || ''}`;
    const keywords = [...concept.keywords];
    
    // Calculate match score using our enhanced algorithm
    const score = await calculateMatchScore(text, keywords, {
      ...options,
      // For concepts, we might want to use a different algorithm
      algorithm: options.algorithm || CONFIG.SIMILARITY_ALGORITHM
    });
    
    if (score >= CONFIG.MIN_MATCH_SCORE) {
      results.push({
        id: concept.id,
        name: concept.name,
        score,
        category: concept.category,
        matchDetails: options.includeDetails ? {
          algorithm: CONFIG.SIMILARITY_ALGORITHM,
          keywords: keywords,
          threshold: CONFIG.MIN_MATCH_SCORE,
          description: concept.description
        } : undefined
      });
    }
  }
  
  // Update diagnostics if not in dry run mode
  if (!options.dryRun) {
    const processingTime = Date.now() - startTime;
    updateDiagnostics(processingTime, results.length > 0);
  }
  
  // Sort by score (descending) and limit to max tags
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.MAX_TAGS_PER_CATEGORY);
}

/**
 * Extract metadata from a summary
 * @param {Object} summary - Summary data
 * @param {Object} options - Extraction options
 * @param {boolean} options.dryRun - Whether to perform a dry run (no side effects)
 * @param {boolean} options.includeDetails - Whether to include match details
 * @returns {Promise<Object>} Extracted metadata
 */
async function extractMetadata(summary, options = {}) {
  if (!isInitialized) {
    logger.warn('Metadata extraction adapter not initialized');
    return { components: [], concepts: [] };
  }
  
  try {
    logger.info(`Extracting metadata from summary ${summary.id}`);
    
    // Combine all text for analysis
    const allText = [
      summary.summaries.concise,
      summary.summaries.detailed,
      summary.summaries.technical,
      summary.summaries.actionable,
      ...summary.topics,
      ...summary.decisions.map(d => d.text)
    ].join(' ');
    
    // Extract component and concept references
    const componentReferences = extractComponentReferences(allText);
    const conceptReferences = extractConceptReferences(allText);
    
    // Extract file references from code references
    const fileReferences = summary.codeReferences
    
    // Create metadata object
    const metadata = {
      components,
      concepts,
      extractedAt: Date.now(),
      extractionDetails: options.includeDetails ? {
        algorithm: CONFIG.SIMILARITY_ALGORITHM,
        semanticEnabled: CONFIG.ENABLE_SEMANTIC_SIMILARITY,
        threshold: CONFIG.MIN_MATCH_SCORE,
        processingTimeMs: Date.now() - startTime
      } : undefined
    };
    
    // Update summary with metadata if not in dry run mode
    if (!options.dryRun) {
      await updateSummaryMetadata(summary.id, metadata);
      logger.info(`Updated summary ${summary.id} with extracted metadata`);
    } else {
      logger.info(`Dry run: metadata extracted but not saved for summary ${summary.id}`);
    }
    
    logger.info(`Extracted metadata for summary ${summary.id}: ${components.length} components, ${concepts.length} concepts`);
    
    return metadata;
  } catch (error) {
    logger.error(`Error extracting metadata: ${error.message}`);
    diagnosticInfo.errorCount++;
    return { components: [], concepts: [] };
  }
}

/**
 * Add a component to the registry
 * @param {Object} component - Component data
 * @returns {Promise<boolean>} Success status
 */
async function addComponent(component) {
  if (!isInitialized) {
    logger.warn('Metadata extraction adapter not initialized');
    return false;
  }
  
  try {
    // Validate component data
    if (!component.id || !component.name || !component.path) {
      throw new Error('Invalid component data: id, name, and path are required');
    }
    
    // Check if component already exists
    const existingIndex = componentRegistry.findIndex(c => c.id === component.id);
    
    if (existingIndex >= 0) {
      // Update existing component
      componentRegistry[existingIndex] = {
        ...componentRegistry[existingIndex],
        ...component
      };
      logger.info(`Updated component in registry: ${component.id}`);
    } else {
      // Add new component
      componentRegistry.push(component);
      logger.info(`Added component to registry: ${component.id}`);
    }
    
    // Save registry
    await fs.writeFile(CONFIG.COMPONENT_REGISTRY_PATH, JSON.stringify(componentRegistry, null, 2), 'utf8');
    
    return true;
  } catch (error) {
    logger.error(`Error adding component to registry: ${error.message}`);
    return false;
  }
}

/**
 * Add a concept to the registry
 * @param {Object} concept - Concept data
 * @returns {Promise<boolean>} Success status
 */
async function addConcept(concept) {
  if (!isInitialized) {
    logger.warn('Metadata extraction adapter not initialized');
    return false;
  }
  
  try {
    // Validate concept data
    if (!concept.id || !concept.name || !concept.description) {
      throw new Error('Invalid concept data: id, name, and description are required');
    }
    
    // Check if concept already exists
    const existingIndex = conceptRegistry.findIndex(c => c.id === concept.id);
    
    if (existingIndex >= 0) {
      // Update existing concept
      conceptRegistry[existingIndex] = {
        ...conceptRegistry[existingIndex],
        ...concept
      };
      logger.info(`Updated concept in registry: ${concept.id}`);
    } else {
      // Add new concept
      conceptRegistry.push(concept);
      logger.info(`Added concept to registry: ${concept.id}`);
    }
    
    // Save registry
    await fs.writeFile(CONFIG.CONCEPT_REGISTRY_PATH, JSON.stringify(conceptRegistry, null, 2), 'utf8');
    
    return true;
  } catch (error) {
    logger.error(`Error adding concept to registry: ${error.message}`);
    return false;
  }
}

/**
 * Get all components from the registry
 * @returns {Array<Object>} Component registry
 */
function getComponents() {
  return [...componentRegistry];
}

/**
 * Get all concepts from the registry
 * @returns {Array<Object>} Concept registry
 */
function getConcepts() {
  return [...conceptRegistry];
}

// Export the adapter API
module.exports = {
  initialize,
  extractMetadata,
  addComponent,
  addConcept,
  getComponents,
  getConcepts
};
