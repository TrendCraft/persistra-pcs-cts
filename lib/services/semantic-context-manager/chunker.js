// Semantic chunking and file chunk processing logic
// migrated chunk helpers to chunkTransform.js
const { inferChunkType, mapAndEnrichChunks, filterChunksByType, postProcessChunks } = require('./chunkTransform');

/**
 * TODO: Refactor dependencies on logger, eventBus, COMPONENT_NAME, isInitialized, initialize, pathUtils, semanticChunker, etc.
 * Copied from semantic-context-manager.js
 */
async function processFileWithSemanticChunker(filePath, options = {}) {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Semantic context manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize semantic context manager',
          chunks: [],
          metadata: {
            filePath,
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    // Verify file exists
    if (!await pathUtils.exists(filePath)) {
      logger.error(`File not found: ${filePath}`);
      return {
        success: false,
        error: `File not found: ${filePath}`,
        chunks: [],
        metadata: {
          filePath,
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    // Read file content
    const fileContent = await pathUtils.readFile(filePath);
    // Get file extension
    const fileExt = pathUtils.getExtension(filePath);
    // Use semantic chunker to process the file
    const semanticChunker = require('../services/semantic-chunker');
    const chunks = await semanticChunker.createSemanticChunks(fileContent, {
      filePath,
      fileType: fileExt,
      ...options
    });
    logger.info(`Processed file ${filePath} with semantic chunker, generated ${chunks.length} chunks`);
    return {
      success: true,
      chunks,
      metadata: {
        filePath,
        timestamp: Date.now(),
        count: chunks.length,
        options
      }
    };
  } catch (error) {
    logger.error(`Failed to process file with semantic chunker: ${error.message}`);
    // Emit error event for standardized error handling
    eventBus.emit('error', {
      component: COMPONENT_NAME,
      message: 'Failed to process file with semantic chunker',
      error: error.message
    });
    return {
      success: false,
      error: error.message,
      chunks: [],
      metadata: {
        filePath,
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

async function processFilesWithSemanticChunker(filePaths, options = {}) {
  try {
    // Check initialization status
    if (!isInitialized) {
      logger.warn('Semantic context manager not initialized, initializing now...');
      const initSuccess = await initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'Failed to initialize semantic context manager',
          results: [],
          metadata: {
            timestamp: Date.now(),
            status: 'error'
          }
        };
      }
    }
    if (!Array.isArray(filePaths)) {
      logger.error('filePaths must be an array');
      return {
        success: false,
        error: 'filePaths must be an array',
        results: [],
        metadata: {
          timestamp: Date.now(),
          status: 'error'
        }
      };
    }
    const results = [];
    const errors = [];
    for (const filePath of filePaths) {
      try {
        const result = await processFileWithSemanticChunker(filePath, options);
        results.push({
          filePath,
          success: result.success,
          chunks: result.chunks,
          error: result.error
        });
        if (!result.success) {
          errors.push({
            filePath,
            error: result.error
          });
        }
      } catch (error) {
        logger.error(`Error processing file ${filePath}: ${error.message}`);
        results.push({
          filePath,
          success: false,
          chunks: [],
          error: error.message
        });
        errors.push({
          filePath,
          error: error.message
        });
      }
    }
    const successCount = results.filter(r => r.success).length;
    logger.info(`Processed ${filePaths.length} files with semantic chunker, ${successCount} successful, ${errors.length} errors`);
    return {
      success: errors.length === 0,
      results,
      errors: errors.length > 0 ? errors : null,
      metadata: {
        timestamp: Date.now(),
        totalFiles: filePaths.length,
        successCount,
        errorCount: errors.length,
        options
      }
    };
  } catch (error) {
    logger.error(`Failed to process files with semantic chunker: ${error.message}`);
    // Emit error event for standardized error handling
    eventBus.emit('error', {
      component: COMPONENT_NAME,
      message: 'Failed to process files with semantic chunker',
      error: error.message
    });
    return {
      success: false,
      error: error.message,
      results: [],
      metadata: {
        timestamp: Date.now(),
        status: 'error'
      }
    };
  }
}

module.exports = { processFileWithSemanticChunker, processFilesWithSemanticChunker };
