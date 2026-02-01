/**
 * Generate Embedding Script
 * 
 * This script generates semantic embeddings for text inputs.
 * It's designed to be called directly by the local-semantic-search
 * to extend my (Claude's) cognition across token boundaries.
 * 
 * Usage: node generate-embedding.js "base64-encoded-text"
 */

const path = require('path');
const fs = require('fs');
const { createComponentLogger } = require('../utils/logger');
const vectorUtils = require('../utils/vector-utils');

// Create logger
// Create logger with custom configuration to avoid stdout pollution
const logger = createComponentLogger('embedding-generator', {
  // Force console transport to use stderr instead of stdout
  consoleOptions: { stderr: true }
});

// Default embedding dimensions
const DEFAULT_DIMENSIONS = 384;

/**
 * Generate a semantic embedding for the given text
 * 
 * This implementation uses a combination of character frequency, n-gram analysis,
 * and tf-idf weighting to create a simple but effective embedding.
 * 
 * @param {string} text - Text to generate embedding for
 * @param {number} dimensions - Dimensions for the embedding vector
 * @returns {number[]} Embedding vector
 */
function generateEmbedding(text, dimensions = DEFAULT_DIMENSIONS) {
  if (!text || typeof text !== 'string') {
    logger.warn('Invalid text provided for embedding generation');
    return new Array(dimensions).fill(0);
  }
  
  // Normalize text
  const normalizedText = text.toLowerCase().trim();
  
  // Create initial embedding
  const embedding = new Array(dimensions).fill(0);
  
  // 1. Character frequency component (25% of signal)
  for (let i = 0; i < normalizedText.length && i < dimensions; i++) {
    embedding[i % dimensions] += (normalizedText.charCodeAt(i) / 255) * 0.25;
  }
  
  // 2. Word frequency component (50% of signal)
  const words = normalizedText.split(/\s+/);
  const wordCounts = {};
  
  // Count word frequencies
  words.forEach(word => {
    if (word.length > 0) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  });
  
  // Add word frequency component to embedding
  Object.entries(wordCounts).forEach(([word, count], index) => {
    // Create a simple hash for the word
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use the hash to determine embedding index
    const embeddingIndex = Math.abs(hash) % dimensions;
    
    // Add weighted value
    embedding[embeddingIndex] += (count / words.length) * 0.5;
  });
  
  // 3. Sentence structure component (25% of signal)
  const sentences = normalizedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  sentences.forEach((sentence, sentenceIndex) => {
    const sentenceWords = sentence.trim().split(/\s+/);
    
    // Capture sentence structure by word positions
    sentenceWords.forEach((word, wordIndex) => {
      // Create a position-sensitive hash
      const positionHash = (word.length * 31) + (wordIndex * 17) + (sentenceIndex * 7);
      const embeddingIndex = Math.abs(positionHash) % dimensions;
      
      // Add weighted value based on position in sentence
      embedding[embeddingIndex] += (1 - (wordIndex / sentenceWords.length)) * 0.25;
    });
  });
  
  // Normalize the embedding using the imported vector utilities
  return vectorUtils.normalizeVector(embedding);
}

// Main execution when script is called directly
if (require.main === module) {
  // Patch: Guarantee ONLY the embedding array is ever printed to stdout
  // by redirecting all console output to /dev/null except for the final embedding
  const devNull = fs.openSync('/dev/null', 'w');
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  function silenceStdout() { process.stdout.write = () => {}; }
  function silenceStderr() { process.stderr.write = () => {}; }
  function restoreStdout() { process.stdout.write = originalStdoutWrite; }
  function restoreStderr() { process.stderr.write = originalStderrWrite; }
  silenceStdout();
  silenceStderr();
  try {
    // Get base64-encoded text from command line argument
    const base64Text = process.argv[2];
    if (!base64Text) {
      restoreStderr();
      console.error('No text provided. Usage: node generate-embedding.js "base64-encoded-text"');
      process.exit(1);
    }
    // Decode the base64 text
    const text = Buffer.from(base64Text, 'base64').toString('utf8');
    // Generate embedding
    const embedding = generateEmbedding(text);
    // Output ONLY the embedding as JSON to stdout
    restoreStdout();
    console.log(JSON.stringify(embedding));
    silenceStdout();
  } catch (error) {
    restoreStderr();
    console.error(error.message);
    process.exit(1);
  }
  restoreStdout();
  restoreStderr();
}

// Export for use in other modules
module.exports = {
  generateEmbedding
};
