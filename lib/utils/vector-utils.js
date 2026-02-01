/**
 * Vector Utilities
 * 
 * Provides utility functions for vector operations used in semantic similarity
 * calculations and other vector-based operations in Leo.
 * 
 * @module lib/utils/vector-utils
 * @author Leo Development Team
 * @created May 22, 2025
 */

const { createComponentLogger } = require('./logger');

// Create logger
const logger = createComponentLogger('vector-utils');

/**
 * Calculate cosine similarity between two vectors
 * 
 * @param {Array<number>} vectorA - First vector
 * @param {Array<number>} vectorB - Second vector
 * @returns {number} Cosine similarity (between -1 and 1)
 */
function calculateCosineSimilarity(vectorA, vectorB) {
  // Handle null or undefined vectors
  if (!vectorA || !vectorB) {
    logger.warn('Null or undefined vector provided to calculateCosineSimilarity');
    return 0;
  }
  
  // Handle empty vectors
  if (vectorA.length === 0 || vectorB.length === 0) {
    logger.warn('Empty vector provided to calculateCosineSimilarity');
    return 0;
  }
  
  // Handle different dimensions
  if (vectorA.length !== vectorB.length) {
    logger.warn(`Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`);
    return 0;
  }
  
  try {
    // Calculate dot product
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }
    
    // Calculate magnitudes
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vectorA.length; i++) {
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    // Handle zero magnitudes
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    // Calculate cosine similarity
    return dotProduct / (magnitudeA * magnitudeB);
  } catch (error) {
    logger.error(`Error calculating cosine similarity: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate Euclidean distance between two vectors
 * 
 * @param {Array<number>} vectorA - First vector
 * @param {Array<number>} vectorB - Second vector
 * @returns {number} Euclidean distance
 */
function calculateEuclideanDistance(vectorA, vectorB) {
  // Handle null or undefined vectors
  if (!vectorA || !vectorB) {
    logger.warn('Null or undefined vector provided to calculateEuclideanDistance');
    return Infinity;
  }
  
  // Handle empty vectors
  if (vectorA.length === 0 || vectorB.length === 0) {
    logger.warn('Empty vector provided to calculateEuclideanDistance');
    return Infinity;
  }
  
  // Handle different dimensions
  if (vectorA.length !== vectorB.length) {
    logger.warn(`Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`);
    return Infinity;
  }
  
  try {
    // Calculate squared differences
    let sumSquaredDifferences = 0;
    for (let i = 0; i < vectorA.length; i++) {
      const diff = vectorA[i] - vectorB[i];
      sumSquaredDifferences += diff * diff;
    }
    
    // Return square root of sum
    return Math.sqrt(sumSquaredDifferences);
  } catch (error) {
    logger.error(`Error calculating Euclidean distance: ${error.message}`);
    return Infinity;
  }
}

/**
 * Normalize a vector to unit length
 * 
 * @param {Array<number>} vector - Vector to normalize
 * @returns {Array<number>} Normalized vector
 */
function normalizeVector(vector) {
  // Handle null or undefined vectors
  if (!vector) {
    logger.warn('Null or undefined vector provided to normalizeVector');
    return [];
  }
  
  // Handle empty vectors
  if (vector.length === 0) {
    logger.warn('Empty vector provided to normalizeVector');
    return [];
  }
  
  try {
    // Calculate magnitude
    let magnitude = 0;
    for (let i = 0; i < vector.length; i++) {
      magnitude += vector[i] * vector[i];
    }
    
    magnitude = Math.sqrt(magnitude);
    
    // Handle zero magnitude
    if (magnitude === 0) {
      return Array(vector.length).fill(0);
    }
    
    // Normalize vector
    return vector.map(value => value / magnitude);
  } catch (error) {
    logger.error(`Error normalizing vector: ${error.message}`);
    return [];
  }
}

module.exports = {
  calculateCosineSimilarity,
  calculateEuclideanDistance,
  normalizeVector
};
