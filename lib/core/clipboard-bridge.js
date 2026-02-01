/**
 * Clipboard Bridge
 * 
 * Provides functionality to copy enhanced prompts to the system clipboard.
 * This is a critical component for the Leo MVL as it enables the transfer
 * of enhanced prompts from the Leo terminal to Windsurf/Claude.
 */

const { exec } = require('child_process');
const os = require('os');
const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('clipboard-bridge');

/**
 * Clipboard Bridge class
 * Handles cross-platform clipboard operations
 */
class ClipboardBridge {
  constructor() {
    this.platform = os.platform();
    logger.info(`Initializing clipboard bridge for platform: ${this.platform}`);
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy to clipboard
   * @returns {Promise<boolean>} - Success status
   */
  async copyToClipboard(text) {
    if (!text) {
      logger.warn('Attempted to copy empty text to clipboard');
      return false;
    }

    try {
      logger.info(`Copying ${text.length} characters to clipboard`);
      
      // Use platform-specific commands
      if (this.platform === 'darwin') {
        // macOS
        return await this._macOSCopy(text);
      } else if (this.platform === 'win32') {
        // Windows
        return await this._windowsCopy(text);
      } else if (this.platform === 'linux') {
        // Linux
        return await this._linuxCopy(text);
      } else {
        logger.error(`Unsupported platform: ${this.platform}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to copy to clipboard: ${error.message}`);
      return false;
    }
  }

  /**
   * Copy text to clipboard on macOS
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Success status
   * @private
   */
  _macOSCopy(text) {
    return new Promise((resolve) => {
      const process = exec('pbcopy', (error) => {
        if (error) {
          logger.error(`macOS clipboard error: ${error.message}`);
          resolve(false);
        } else {
          logger.info('Successfully copied to macOS clipboard');
          resolve(true);
        }
      });
      
      process.stdin.write(text);
      process.stdin.end();
    });
  }

  /**
   * Copy text to clipboard on Windows
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Success status
   * @private
   */
  _windowsCopy(text) {
    return new Promise((resolve) => {
      // Create a temporary file and use clip
      const tempFile = os.tmpdir() + '/leo-clipboard-temp.txt';
      
      // Write to temp file then use clip
      require('fs').writeFile(tempFile, text, (err) => {
        if (err) {
          logger.error(`Windows clipboard error (file write): ${err.message}`);
          resolve(false);
          return;
        }
        
        exec(`type "${tempFile}" | clip`, (error) => {
          // Try to clean up temp file
          require('fs').unlink(tempFile, () => {});
          
          if (error) {
            logger.error(`Windows clipboard error: ${error.message}`);
            resolve(false);
          } else {
            logger.info('Successfully copied to Windows clipboard');
            resolve(true);
          }
        });
      });
    });
  }

  /**
   * Copy text to clipboard on Linux
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Success status
   * @private
   */
  _linuxCopy(text) {
    return new Promise((resolve) => {
      // Try xclip first, then xsel as fallback
      exec('which xclip', (error) => {
        if (!error) {
          // xclip is available
          const process = exec('xclip -selection clipboard', (error) => {
            if (error) {
              logger.error(`Linux clipboard error (xclip): ${error.message}`);
              resolve(false);
            } else {
              logger.info('Successfully copied to Linux clipboard using xclip');
              resolve(true);
            }
          });
          
          process.stdin.write(text);
          process.stdin.end();
        } else {
          // Try xsel
          exec('which xsel', (error) => {
            if (!error) {
              const process = exec('xsel --clipboard --input', (error) => {
                if (error) {
                  logger.error(`Linux clipboard error (xsel): ${error.message}`);
                  resolve(false);
                } else {
                  logger.info('Successfully copied to Linux clipboard using xsel');
                  resolve(true);
                }
              });
              
              process.stdin.write(text);
              process.stdin.end();
            } else {
              logger.error('No clipboard command found on Linux. Please install xclip or xsel.');
              resolve(false);
            }
          });
        }
      });
    });
  }
}

// Create singleton instance
const clipboardBridge = new ClipboardBridge();

module.exports = clipboardBridge;
