/**
 * Memory Graph Verification Script
 * 
 * This script verifies that the memory graph files (chunks, embeddings, memory index)
 * are accessible and valid at their correct locations.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('verify-memory-graph');

// Path constants - pointing to the correct location of the memory graph files
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CHUNKS_FILE = path.join(PROJECT_ROOT, 'data', 'chunks.jsonl');
const EMBEDDINGS_FILE = path.join(PROJECT_ROOT, 'data', 'embeddings.jsonl');
const MEMORY_INDEX_FILE = path.join(PROJECT_ROOT, 'data', 'memory-index.jsonl');

/**
 * Validates a JSONL file line by line
 * @param {string} filePath - Path to the JSONL file
 * @param {string} requiredField - Field that must exist in each JSON object
 * @returns {Promise<{isValid: boolean, lineCount: number, fileSize: string}>} Validation result
 */
async function validateJsonlFile(filePath, requiredField) {
  if (!fs.existsSync(filePath)) {
    return { isValid: false, lineCount: 0, fileSize: '0 bytes', error: 'File does not exist' };
  }

  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats.size;
  const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
  const fileSize = `${fileSizeInMB} MB (${fileSizeInBytes} bytes)`;

  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;
    let validLines = 0;
    let invalidLines = 0;
    let firstInvalidLine = null;
    let sampleContent = null;

    for await (const line of rl) {
      lineCount++;
      
      if (lineCount === 1) {
        // Store sample content from first line
        sampleContent = line.length > 100 ? line.substring(0, 100) + '...' : line;
      }

      try {
        const jsonObj = JSON.parse(line);
        if (jsonObj && requiredField in jsonObj) {
          validLines++;
        } else {
          invalidLines++;
          if (!firstInvalidLine) {
            firstInvalidLine = { line: lineCount, content: line.substring(0, 100) + '...' };
          }
        }
      } catch (err) {
        invalidLines++;
        if (!firstInvalidLine) {
          firstInvalidLine = { line: lineCount, content: line.substring(0, 100) + '...', error: err.message };
        }
      }
    }

    const isValid = lineCount > 0 && invalidLines === 0;
    
    return { 
      isValid, 
      lineCount, 
      validLines, 
      invalidLines, 
      fileSize,
      sampleContent,
      firstInvalidLine
    };
  } catch (err) {
    return { 
      isValid: false, 
      lineCount: 0, 
      fileSize, 
      error: err.message 
    };
  }
}

/**
 * Main verification function
 */
async function verifyMemoryGraph() {
  logger.info('🔍 Verifying memory graph files...');
  
  // Check chunks file
  logger.info(`Checking chunks file: ${CHUNKS_FILE}`);
  const chunksResult = await validateJsonlFile(CHUNKS_FILE, 'content');
  
  if (chunksResult.isValid) {
    logger.info(`✅ Chunks file is valid`);
    logger.info(`   - Lines: ${chunksResult.lineCount}`);
    logger.info(`   - Size: ${chunksResult.fileSize}`);
    logger.info(`   - Sample content: ${chunksResult.sampleContent}`);
  } else {
    logger.error(`❌ Chunks file is invalid`);
    if (chunksResult.error) {
      logger.error(`   - Error: ${chunksResult.error}`);
    }
    if (chunksResult.firstInvalidLine) {
      logger.error(`   - First invalid line: ${chunksResult.firstInvalidLine.line}`);
      logger.error(`   - Content: ${chunksResult.firstInvalidLine.content}`);
      if (chunksResult.firstInvalidLine.error) {
        logger.error(`   - Error: ${chunksResult.firstInvalidLine.error}`);
      }
    }
  }
  
  // Check embeddings file
  logger.info(`Checking embeddings file: ${EMBEDDINGS_FILE}`);
  const embeddingsResult = await validateJsonlFile(EMBEDDINGS_FILE, 'vector');
  
  if (embeddingsResult.isValid) {
    logger.info(`✅ Embeddings file is valid`);
    logger.info(`   - Lines: ${embeddingsResult.lineCount}`);
    logger.info(`   - Size: ${embeddingsResult.fileSize}`);
    logger.info(`   - Sample content: ${embeddingsResult.sampleContent}`);
  } else {
    logger.error(`❌ Embeddings file is invalid`);
    if (embeddingsResult.error) {
      logger.error(`   - Error: ${embeddingsResult.error}`);
    }
    if (embeddingsResult.firstInvalidLine) {
      logger.error(`   - First invalid line: ${embeddingsResult.firstInvalidLine.line}`);
      logger.error(`   - Content: ${embeddingsResult.firstInvalidLine.content}`);
      if (embeddingsResult.firstInvalidLine.error) {
        logger.error(`   - Error: ${embeddingsResult.firstInvalidLine.error}`);
      }
    }
  }
  
  // Check memory index file
  logger.info(`Checking memory index file: ${MEMORY_INDEX_FILE}`);
  const memoryIndexResult = await validateJsonlFile(MEMORY_INDEX_FILE, 'id');
  
  if (memoryIndexResult.isValid) {
    logger.info(`✅ Memory index file is valid`);
    logger.info(`   - Lines: ${memoryIndexResult.lineCount}`);
    logger.info(`   - Size: ${memoryIndexResult.fileSize}`);
    logger.info(`   - Sample content: ${memoryIndexResult.sampleContent}`);
  } else {
    logger.error(`❌ Memory index file is invalid`);
    if (memoryIndexResult.error) {
      logger.error(`   - Error: ${memoryIndexResult.error}`);
    }
    if (memoryIndexResult.firstInvalidLine) {
      logger.error(`   - First invalid line: ${memoryIndexResult.firstInvalidLine.line}`);
      logger.error(`   - Content: ${memoryIndexResult.firstInvalidLine.content}`);
      if (memoryIndexResult.firstInvalidLine.error) {
        logger.error(`   - Error: ${memoryIndexResult.firstInvalidLine.error}`);
      }
    }
  }
  
  // Summary
  logger.info('📊 Memory Graph Verification Summary:');
  logger.info(`Chunks: ${chunksResult.isValid ? '✅ Valid' : '❌ Invalid'} (${chunksResult.lineCount} lines)`);
  logger.info(`Embeddings: ${embeddingsResult.isValid ? '✅ Valid' : '❌ Invalid'} (${embeddingsResult.lineCount} lines)`);
  logger.info(`Memory Index: ${memoryIndexResult.isValid ? '✅ Valid' : '❌ Invalid'} (${memoryIndexResult.lineCount} lines)`);
  
  return {
    chunks: chunksResult,
    embeddings: embeddingsResult,
    memoryIndex: memoryIndexResult,
    allValid: chunksResult.isValid && embeddingsResult.isValid && memoryIndexResult.isValid
  };
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyMemoryGraph()
    .then(result => {
      if (result.allValid) {
        logger.info('✅ All memory graph files are valid');
        process.exit(0);
      } else {
        logger.error('❌ Some memory graph files are invalid');
        process.exit(1);
      }
    })
    .catch(err => {
      logger.error(`Error verifying memory graph: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { verifyMemoryGraph, validateJsonlFile };
