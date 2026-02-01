// leo2/core/io/fileWriteController.js
const fs = require('fs');
const path = require('path');
const permissionController = require('../security/permissionController');
const operationLogger = require('../logging/operationLogger');
// Optional capability registry registration
try {
  const capabilityRegistry = require('../registry/capabilityRegistry');
  if (capabilityRegistry && typeof capabilityRegistry.registerCapability === 'function') {
    capabilityRegistry.registerCapability('File Write Controller', { file: 'core/io/fileWriteController.js' });
  }
} catch (error) {
  // Capability registry is optional
}

// Global backup manager instance - will be set by orchestrator
let backupManager = null;

/**
 * Set the backup manager instance for file protection
 * @param {BackupManager} manager The backup manager instance
 */
function setBackupManager(manager) {
  backupManager = manager;
}

/**
 * Request a file write with backup protection
 * @param {string} filePath Path to file to write
 * @param {string} content Content to write
 * @param {Object} options Write options
 * @returns {Object} Write result with backup info
 */
async function requestWrite(filePath, content, options = {}) {
  // Permission check
  if (!permissionController.checkPermission('file_write', { filePath })) {
    operationLogger.logOperation('file_write_denied', { filePath });
    throw new Error('Permission denied for file write');
  }
  
  let backupResult = null;
  
  // Create backup if file exists and backup manager is available
  if (backupManager && fs.existsSync(filePath)) {
    try {
      backupResult = await backupManager.createBackup(filePath, {
        reason: options.reason || 'pre-write',
        operation: 'file_write'
      });
      
      if (!backupResult.success && !backupResult.skipped) {
        operationLogger.logOperation('backup_failed', { filePath, error: backupResult.error });
        if (!options.skipBackupOnFailure) {
          throw new Error(`Backup failed: ${backupResult.error}`);
        }
      }
    } catch (backupError) {
      operationLogger.logOperation('backup_error', { filePath, error: backupError.message });
      if (!options.skipBackupOnFailure) {
        throw new Error(`Backup error: ${backupError.message}`);
      }
    }
  }
  
  // Perform the file write
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    operationLogger.logOperation('file_write', { 
      filePath, 
      backupId: backupResult?.backupId,
      backupCreated: !!backupResult?.success 
    });
    
    return {
      success: true,
      filePath,
      backup: backupResult
    };
  } catch (writeError) {
    operationLogger.logOperation('file_write_failed', { filePath, error: writeError.message });
    throw writeError;
  }
}

/**
 * Synchronous file write (legacy compatibility) - will be deprecated
 * @param {string} filePath Path to file to write
 * @param {string} content Content to write
 * @returns {boolean} Success status
 */
function requestWriteSync(filePath, content) {
  if (!permissionController.checkPermission('file_write', { filePath })) {
    operationLogger.logOperation('file_write_denied', { filePath });
    throw new Error('Permission denied for file write');
  }
  fs.writeFileSync(filePath, content, 'utf8');
  operationLogger.logOperation('file_write', { filePath, legacy: true });
  return true;
}

module.exports = {
  requestWrite,
  requestWriteSync,
  setBackupManager
};
