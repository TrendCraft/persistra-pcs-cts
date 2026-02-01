/**
 * Backup Manager Module
 * 
 * Manages file backups for Leo's file operations.
 * Creates timestamped backups before file modifications.
 * 
 * @module core/safety/backupManager
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Project root path
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Default backup directory
const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, 'data', 'backups');

class BackupManager {
  constructor(logger, options = {}) {
    this.logger = logger;
    this.config = {
      backupDir: DEFAULT_BACKUP_DIR,
      enabled: true,
      maxBackupsPerFile: 10,
      keepMetadata: true,
      useSubdirectories: true,
      ...options
    };
  }

  /**
   * Initialize the backup manager
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      this.logger.info('Initializing backup manager');
      
      // Ensure backup directory exists
      await fs.mkdir(this.config.backupDir, { recursive: true });
      
      this.logger.info(`Backup manager initialized (backupDir: ${this.config.backupDir})`);
      return { initialized: true };
    } catch (error) {
      this.logger.error(`Failed to initialize backup manager: ${error.message}`);
      return { initialized: false, error: error.message };
    }
  }

  /**
   * Create a backup of a file
   * @param {string} filePath Path to file to backup
   * @param {Object} options Backup options
   * @returns {Promise<Object>} Backup result
   */
  async createBackup(filePath, options = {}) {
    try {
      if (!this.config.enabled) {
        return { success: true, skipped: true, reason: 'Backups disabled' };
      }
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        return { success: false, error: 'File does not exist' };
      }
      
      // Generate backup ID and path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const randomId = crypto.randomBytes(4).toString('hex');
      const backupId = `${timestamp}-${randomId}`;
      
      // Determine backup file path
      let backupFilePath;
      if (this.config.useSubdirectories) {
        const relativePath = path.relative(PROJECT_ROOT, filePath);
        const backupSubDir = path.join(this.config.backupDir, path.dirname(relativePath));
        await fs.mkdir(backupSubDir, { recursive: true });
        
        const fileName = path.basename(filePath);
        backupFilePath = path.join(backupSubDir, `${fileName}.${backupId}`);
      } else {
        const fileName = filePath.replace(/[\/\\:]/g, '_');
        backupFilePath = path.join(this.config.backupDir, `${fileName}.${backupId}`);
      }
      
      // Copy file to backup location
      await fs.copyFile(filePath, backupFilePath);
      
      // Create metadata file if enabled
      if (this.config.keepMetadata) {
        const stats = await fs.stat(filePath);
        const metadata = {
          originalPath: filePath,
          backupId,
          timestamp: new Date().toISOString(),
          size: stats.size,
          mtime: stats.mtime,
          reason: options.reason || 'manual',
          backupPath: backupFilePath
        };
        
        const metadataPath = `${backupFilePath}.meta`;
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      }
      
      // Clean up old backups
      await this.cleanupOldBackups(filePath);
      
      this.logger.info(`Created backup for ${filePath} (ID: ${backupId})`);
      return { 
        success: true, 
        backupId, 
        backupPath: backupFilePath,
        originalPath: filePath 
      };
    } catch (error) {
      this.logger.error(`Failed to create backup for ${filePath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up old backups for a file
   * @param {string} filePath Path to original file
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupOldBackups(filePath) {
    try {
      const backups = await this.listBackups(filePath);
      
      if (backups.length <= this.config.maxBackupsPerFile) {
        return { success: true, cleaned: 0 };
      }
      
      // Sort by timestamp (newest first) and remove excess
      const sortedBackups = backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const toDelete = sortedBackups.slice(this.config.maxBackupsPerFile);
      
      let cleaned = 0;
      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.backupPath);
          if (backup.metadataPath) {
            await fs.unlink(backup.metadataPath);
          }
          cleaned++;
        } catch (error) {
          this.logger.warn(`Failed to delete backup ${backup.backupId}: ${error.message}`);
        }
      }
      
      this.logger.info(`Cleaned up ${cleaned} old backups for ${filePath}`);
      return { success: true, cleaned };
    } catch (error) {
      this.logger.error(`Failed to cleanup backups for ${filePath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * List backups for a file
   * @param {string} filePath Path to original file
   * @returns {Promise<Array>} List of backups
   */
  async listBackups(filePath) {
    try {
      const backups = [];
      
      // Determine backup directory for this file
      let searchDir;
      if (this.config.useSubdirectories) {
        const relativePath = path.relative(PROJECT_ROOT, filePath);
        searchDir = path.join(this.config.backupDir, path.dirname(relativePath));
      } else {
        searchDir = this.config.backupDir;
      }
      
      // Check if backup directory exists
      try {
        await fs.access(searchDir);
      } catch {
        return backups; // No backups exist
      }
      
      const fileName = path.basename(filePath);
      const files = await fs.readdir(searchDir);
      
      for (const file of files) {
        if (file.startsWith(fileName) && !file.endsWith('.meta')) {
          const backupPath = path.join(searchDir, file);
          const metadataPath = `${backupPath}.meta`;
          
          let metadata = null;
          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(metadataContent);
          } catch {
            // Extract basic info from filename if metadata is missing
            const backupId = file.substring(fileName.length + 1);
            metadata = {
              backupId,
              originalPath: filePath,
              backupPath,
              timestamp: new Date().toISOString(),
              reason: 'unknown'
            };
          }
          
          backups.push({
            ...metadata,
            backupPath,
            metadataPath: await fs.access(metadataPath).then(() => metadataPath).catch(() => null)
          });
        }
      }
      
      return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      this.logger.error(`Failed to list backups for ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Restore a file from backup
   * @param {string} backupId ID of backup to restore
   * @param {string} filePath Original file path
   * @param {Object} options Restore options
   * @returns {Promise<Object>} Restore result
   */
  async restoreFile(backupId, filePath, options = {}) {
    try {
      const backups = await this.listBackups(filePath);
      const backup = backups.find(b => b.backupId === backupId);
      
      if (!backup) {
        return { success: false, error: 'Backup not found' };
      }
      
      // Create backup of current file if it exists and option is enabled
      if (!options.skipCurrentBackup) {
        try {
          await fs.access(filePath);
          await this.createBackup(filePath, { reason: 'pre-restore' });
        } catch {}
      }
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Copy backup to original location
      await fs.copyFile(backup.backupPath, filePath);
      
      this.logger.info(`Restored ${filePath} from backup ${backupId}`);
      return { success: true, backupId, originalPath: filePath };
    } catch (error) {
      this.logger.error(`Failed to restore ${filePath} from backup ${backupId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a specific backup
   * @param {string} backupId ID of backup to delete
   * @param {string} filePath Original file path
   * @returns {Promise<Object>} Delete result
   */
  async deleteBackup(backupId, filePath) {
    try {
      const backups = await this.listBackups(filePath);
      const backup = backups.find(b => b.backupId === backupId);
      
      if (!backup) {
        return { success: false, error: 'Backup not found' };
      }
      
      // Delete backup file
      await fs.unlink(backup.backupPath);
      
      // Delete metadata file if it exists
      if (backup.metadataPath) {
        try {
          await fs.unlink(backup.metadataPath);
        } catch {}
      }
      
      this.logger.info(`Deleted backup ${backupId} for ${filePath}`);
      return { success: true, backupId };
    } catch (error) {
      this.logger.error(`Failed to delete backup ${backupId} for ${filePath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig New configuration values
   * @returns {Object} Updated configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Backup manager configuration updated');
    return this.getConfig();
  }
}

module.exports = { BackupManager };
