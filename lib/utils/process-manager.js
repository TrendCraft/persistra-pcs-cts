/**
 * Process Manager for Leo
 * 
 * Provides robust process management capabilities for the Leo ecosystem,
 * ensuring only one instance of critical processes runs at a time.
 * 
 * Features:
 * - Enhanced lock file mechanism with atomic operations
 * - Process health verification beyond simple PID checks
 * - Process heartbeat mechanism
 * - Proper signal handling and cleanup
 * - Cross-platform process detection
 * 
 * @author Leo Development Team
 * @created May 30, 2025
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class ProcessManager {
  constructor(options = {}) {
    this.options = {
      processName: options.processName || 'leo-mvl',
      lockFileName: options.lockFileName || '.leo-mvl.lock',
      lockFilePath: options.lockFilePath || process.cwd(),
      heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
      staleTimeout: options.staleTimeout || 3600000, // 1 hour
      logger: options.logger || console
    };

    this.lockFile = path.join(this.options.lockFilePath, this.options.lockFileName);
    this.heartbeatTimer = null;
    this.isRunning = false;
    this.processInfo = null;
    
    // Bind methods to ensure proper 'this' context
    this.acquireLock = this.acquireLock.bind(this);
    this.releaseLock = this.releaseLock.bind(this);
    this.checkLock = this.checkLock.bind(this);
    this.updateHeartbeat = this.updateHeartbeat.bind(this);
    this.setupCleanupHandlers = this.setupCleanupHandlers.bind(this);
  }

  /**
   * Acquire a lock for the process
   * @param {Object} processMetadata Additional metadata to store in lock file
   * @returns {Promise<boolean>} True if lock was acquired successfully
   */
  async acquireLock(processMetadata = {}) {
    try {
      // Check if another process already has the lock
      const lockStatus = await this.checkLock();
      
      if (lockStatus.isLocked && lockStatus.isValid) {
        this.options.logger.warn(`Cannot acquire lock: Process ${lockStatus.pid} is already running`);
        return false;
      }
      
      // If there's a stale lock, try to remove it
      if (lockStatus.isLocked && !lockStatus.isValid) {
        try {
          await this.forceClearLock();
          this.options.logger.info('Cleared stale lock file');
        } catch (err) {
          this.options.logger.error(`Failed to clear stale lock: ${err.message}`);
          return false;
        }
      }
      
      // Create lock file with detailed process information
      this.processInfo = {
        pid: process.pid,
        name: this.options.processName,
        startTime: Date.now(),
        lastHeartbeat: Date.now(),
        hostname: os.hostname(),
        username: os.userInfo().username,
        platform: process.platform,
        nodeVersion: process.version,
        entryPoint: process.argv[1],
        ...processMetadata
      };
      
      // Write lock file atomically by writing to temp file first
      const tempLockFile = `${this.lockFile}.tmp`;
      await fs.writeFile(tempLockFile, JSON.stringify(this.processInfo, null, 2), 'utf8');
      
      // Rename is atomic on most filesystems
      try {
        if (fsSync.existsSync(this.lockFile)) {
          // Double-check no other process grabbed the lock while we were preparing
          const currentLock = await this.checkLock();
          if (currentLock.isLocked && currentLock.isValid) {
            // Another process got the lock before us
            await fs.unlink(tempLockFile);
            return false;
          }
          await fs.unlink(this.lockFile);
        }
        await fs.rename(tempLockFile, this.lockFile);
      } catch (err) {
        // Clean up temp file if rename failed
        try {
          await fs.unlink(tempLockFile);
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        throw err;
      }
      
      // Start heartbeat updates
      this.startHeartbeat();
      
      // Set up cleanup handlers for process exit
      this.setupCleanupHandlers();
      
      this.isRunning = true;
      return true;
    } catch (err) {
      this.options.logger.error(`Error acquiring lock: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Release the lock held by this process
   * @returns {Promise<boolean>} True if lock was released successfully
   */
  async releaseLock() {
    try {
      // Stop heartbeat updates
      this.stopHeartbeat();
      
      // Only remove lock file if it belongs to this process
      const lockStatus = await this.checkLock();
      
      if (lockStatus.isLocked && lockStatus.pid === process.pid) {
        await fs.unlink(this.lockFile);
        this.isRunning = false;
        return true;
      } else if (!lockStatus.isLocked) {
        // Lock file doesn't exist
        this.isRunning = false;
        return true;
      } else {
        // Lock file exists but belongs to another process
        this.options.logger.warn(`Cannot release lock owned by another process (PID: ${lockStatus.pid})`);
        return false;
      }
    } catch (err) {
      this.options.logger.error(`Error releasing lock: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Force clear any lock file
   * @returns {Promise<boolean>} True if operation was successful
   */
  async forceClearLock() {
    try {
      if (fsSync.existsSync(this.lockFile)) {
        await fs.unlink(this.lockFile);
      }
      return true;
    } catch (err) {
      this.options.logger.error(`Error clearing lock: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Check if a lock exists and if it's valid
   * @returns {Promise<Object>} Lock status information
   */
  async checkLock() {
    try {
      // Default response
      const result = {
        isLocked: false,
        isValid: false,
        pid: null,
        info: null
      };
      
      // Check if lock file exists
      if (!fsSync.existsSync(this.lockFile)) {
        return result;
      }
      
      // Read and parse lock file
      const lockData = await fs.readFile(this.lockFile, 'utf8');
      const lockInfo = JSON.parse(lockData);
      
      result.isLocked = true;
      result.pid = lockInfo.pid;
      result.info = lockInfo;
      
      // Check if the process is still running
      if (await this.isProcessRunning(lockInfo.pid)) {
        // Check for stale lock (no heartbeat updates)
        const heartbeatAge = Date.now() - lockInfo.lastHeartbeat;
        if (heartbeatAge <= this.options.staleTimeout) {
          result.isValid = true;
        }
      }
      
      return result;
    } catch (err) {
      this.options.logger.warn(`Error checking lock: ${err.message}`);
      return { isLocked: false, isValid: false, pid: null, info: null };
    }
  }
  
  /**
   * Check if a process with the given PID is running
   * @param {number} pid Process ID to check
   * @returns {Promise<boolean>} True if process is running
   */
  async isProcessRunning(pid) {
    try {
      if (process.platform === 'win32') {
        // Windows
        execSync(`tasklist /FI "PID eq ${pid}" /NH`, { stdio: 'ignore' });
        return true;
      } else {
        // Unix-like (Linux, macOS)
        execSync(`ps -p ${pid} > /dev/null`, { stdio: 'ignore' });
        return true;
      }
    } catch (err) {
      return false;
    }
  }
  
  /**
   * Start the heartbeat update timer
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(this.updateHeartbeat, this.options.heartbeatInterval);
    
    // Ensure the interval doesn't keep the process alive
    this.heartbeatTimer.unref();
  }
  
  /**
   * Stop the heartbeat update timer
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  /**
   * Update the heartbeat timestamp in the lock file
   */
  async updateHeartbeat() {
    try {
      if (!this.isRunning) {
        this.stopHeartbeat();
        return;
      }
      
      // Check if the lock file still exists
      if (!fsSync.existsSync(this.lockFile)) {
        this.options.logger.warn('Lock file no longer exists, cannot update heartbeat');
        this.isRunning = false;
        this.stopHeartbeat();
        return;
      }
      
      // Read existing lock data
      const lockData = await fs.readFile(this.lockFile, 'utf8');
      let lockInfo;
      
      try {
        lockInfo = JSON.parse(lockData);
      } catch (err) {
        this.options.logger.error(`Error parsing lock file: ${err.message}`);
        return;
      }
      
      // Verify this process owns the lock
      if (lockInfo.pid !== process.pid) {
        this.options.logger.warn(`Lock file is owned by another process (PID: ${lockInfo.pid})`);
        this.isRunning = false;
        this.stopHeartbeat();
        return;
      }
      
      // Update heartbeat timestamp
      lockInfo.lastHeartbeat = Date.now();
      
      // Write updated lock data
      await fs.writeFile(this.lockFile, JSON.stringify(lockInfo, null, 2), 'utf8');
    } catch (err) {
      this.options.logger.error(`Error updating heartbeat: ${err.message}`);
    }
  }
  
  /**
   * Set up signal handlers to clean up lock file on process exit
   */
  setupCleanupHandlers() {
    // Only set up handlers once
    if (this._handlersSetup) return;
    
    const cleanup = async () => {
      await this.releaseLock();
      process.exit(0);
    };
    
    // Handle normal exit
    process.on('exit', () => {
      this.stopHeartbeat();
      // Sync version since we're in exit handler
      try {
        if (fsSync.existsSync(this.lockFile)) {
          const lockData = fsSync.readFileSync(this.lockFile, 'utf8');
          const lockInfo = JSON.parse(lockData);
          
          if (lockInfo.pid === process.pid) {
            fsSync.unlinkSync(this.lockFile);
          }
        }
      } catch (err) {
        // Can't do much in exit handler
      }
    });
    
    // Handle signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGHUP', cleanup);
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (err) => {
      this.options.logger.error(`Uncaught exception: ${err.message}`);
      await this.releaseLock();
      process.exit(1);
    });
    
    this._handlersSetup = true;
  }
}

module.exports = ProcessManager;
