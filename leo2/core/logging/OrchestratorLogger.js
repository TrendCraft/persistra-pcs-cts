/**
 * Orchestrator Logger
 * 
 * Provides comprehensive logging for the Leo Cognitive Operating System.
 * Logs every step of the 5-phase agent loop in a structured, queryable format.
 * 
 * Event Types: observe, reflect, plan, act, update
 * Log Content: Timestamps, memory chunks used, salience scores, skill chosen, action results, errors
 * 
 * @created 2025-08-01
 * @phase COS Implementation
 */

const fs = require('fs').promises;
const path = require('path');
const { createComponentLogger } = require('../../../lib/utils/logger');

// Component name for logging
const COMPONENT_NAME = 'orchestrator-logger';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Orchestrator Logger Class
 * 
 * Handles structured logging for all agent loop phases and orchestrator events
 */
class OrchestratorLogger {
  /**
   * Constructor
   * @param {Object} config - Logger configuration
   */
  constructor(config = {}) {
    this.config = {
      logDirectory: config.logDirectory || path.join(process.cwd(), 'logs'),
      agentLoopLogFile: config.agentLoopLogFile || 'agentic_loop.jsonl',
      orchestratorLogFile: config.orchestratorLogFile || 'orchestrator.jsonl',
      enableConsoleLogging: config.enableConsoleLogging !== false,
      enableFileLogging: config.enableFileLogging !== false,
      enableBatching: config.enableBatching || false,
      batchSize: config.batchSize || 10,
      batchTimeout: config.batchTimeout || 5000,
      maxLogFileSize: config.maxLogFileSize || 10 * 1024 * 1024, // 10MB
      maxLogFiles: config.maxLogFiles || 5,
      ...config
    };
    
    this.initialized = false;
    this.logBatch = [];
    this.batchTimer = null;
    
    // Initialize logger
    this.initialize();
    
    logger.info('OrchestratorLogger created', { config: this.config });
  }
  
  /**
   * Initialize the logger
   */
  async initialize() {
    try {
      // Ensure log directory exists
      await fs.mkdir(this.config.logDirectory, { recursive: true });
      
      // Initialize log files
      this.agentLoopLogPath = path.join(this.config.logDirectory, this.config.agentLoopLogFile);
      this.orchestratorLogPath = path.join(this.config.logDirectory, this.config.orchestratorLogFile);
      
      this.initialized = true;
      logger.info('OrchestratorLogger initialized', {
        logDirectory: this.config.logDirectory,
        agentLoopLogPath: this.agentLoopLogPath,
        orchestratorLogPath: this.orchestratorLogPath
      });
      
    } catch (error) {
      logger.error('Failed to initialize OrchestratorLogger', error);
      throw error;
    }
  }
  
  /**
   * Log an agent loop event
   * @param {string} eventType - Type of event (observe, reflect, plan, act, update)
   * @param {Object} payload - Event payload
   * @param {Object} context - Additional context
   */
  logEvent(eventType, payload, context = {}) {
    try {
      const logEntry = this.createLogEntry(eventType, payload, context);
      
      // Console logging
      if (this.config.enableConsoleLogging) {
        this.logToConsole(logEntry);
      }
      
      // File logging
      if (this.config.enableFileLogging) {
        if (this.config.enableBatching) {
          this.addToBatch(logEntry);
        } else {
          this.logToFile(logEntry, this.agentLoopLogPath);
        }
      }
      
    } catch (error) {
      logger.error('Error logging event', { eventType, error });
    }
  }
  
  /**
   * Log an orchestrator event
   * @param {string} eventType - Type of orchestrator event
   * @param {Object} payload - Event payload
   * @param {Object} context - Additional context
   */
  logOrchestratorEvent(eventType, payload, context = {}) {
    try {
      const logEntry = this.createLogEntry(eventType, payload, context, 'orchestrator');
      
      // Console logging
      if (this.config.enableConsoleLogging) {
        this.logToConsole(logEntry);
      }
      
      // File logging
      if (this.config.enableFileLogging) {
        this.logToFile(logEntry, this.orchestratorLogPath);
      }
      
    } catch (error) {
      logger.error('Error logging orchestrator event', { eventType, error });
    }
  }
  
  /**
   * Create a structured log entry
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @param {Object} context - Additional context
   * @param {string} category - Log category
   * @returns {Object} Structured log entry
   */
  createLogEntry(eventType, payload, context = {}, category = 'agent_loop') {
    const timestamp = new Date().toISOString();
    
    const baseEntry = {
      timestamp,
      category,
      eventType,
      sessionId: context.sessionId || payload.sessionId || 'unknown',
      ...context
    };
    
    // Add event-specific data based on type
    switch (eventType) {
      case 'observe':
        return {
          ...baseEntry,
          input: {
            userInput: payload.userInput,
            inputLength: payload.userInput?.length || 0,
            inputAnalysis: payload.inputAnalysis,
            isSpecialCommand: payload.inputAnalysis?.isSpecialCommand || false,
            commandType: payload.inputAnalysis?.command
          },
          cseContext: {
            hasContext: !!payload.cseContext,
            memoryChunksCount: payload.cseContext?.memoryContext?.length || 0,
            identityItemsCount: payload.cseContext?.identity?.length || 0,
            capabilitiesCount: payload.cseContext?.capabilities?.length || 0,
            contextSummary: this.summarizeContext(payload.cseContext)
          },
          specialCommands: payload.specialCommands,
          duration: payload.duration || 0
        };
        
      case 'reflect':
        return {
          ...baseEntry,
          contextAnalysis: payload.contextAnalysis,
          responseStrategy: payload.responseStrategy,
          confidenceScore: payload.confidenceScore || 0,
          reflectionDepth: payload.depth || 0,
          reflectionChain: payload.reflectionChain || [],
          duration: payload.duration || 0
        };
        
      case 'plan':
        return {
          ...baseEntry,
          skillSelection: {
            selectedSkill: payload.selectedSkill?.name,
            skillType: payload.selectedSkill?.type,
            skillConfidence: payload.selectedSkill?.confidence,
            skillsConsidered: payload.skillsConsidered?.map(skill => ({
              name: skill.name,
              type: skill.type,
              confidence: skill.confidence
            })) || [],
            selectionReasoning: payload.selectionReasoning,
            fallbackToLLM: payload.fallbackToLLM
          },
          skillParameters: this.sanitizeParameters(payload.skillParameters),
          duration: payload.duration || 0
        };
        
      case 'act':
        return {
          ...baseEntry,
          skillExecution: {
            skillExecuted: payload.skillExecuted,
            skillType: payload.metadata?.skillType,
            executionSuccess: payload.skillResult?.success,
            responseLength: payload.response?.length || 0,
            skillMetadata: payload.skillResult?.metadata
          },
          response: {
            type: payload.type,
            length: payload.response?.length || 0,
            preview: payload.response?.substring(0, 200) || ''
          },
          errors: payload.skillResult?.error ? [payload.skillResult.error] : [],
          duration: payload.duration || 0
        };
        
      case 'update':
        return {
          ...baseEntry,
          memoryUpdates: payload.memoryUpdates?.map(update => ({
            type: update.type,
            success: update.success,
            itemsUpdated: update.itemsUpdated || 0
          })) || [],
          agentStateChanges: {
            changesCount: Object.keys(payload.agentStateChanges || {}).length,
            changeTypes: Object.keys(payload.agentStateChanges || [])
          },
          learningEvents: payload.learningEvents?.map(event => ({
            type: event.type,
            significance: event.significance,
            description: event.description
          })) || [],
          duration: payload.duration || 0
        };
        
      default:
        return {
          ...baseEntry,
          payload: this.sanitizePayload(payload),
          duration: payload.duration || 0
        };
    }
  }
  
  /**
   * Log to console with formatting
   * @param {Object} logEntry - Log entry to output
   */
  logToConsole(logEntry) {
    const { timestamp, category, eventType, sessionId } = logEntry;
    const sessionShort = sessionId.substring(0, 8);
    
    // Color coding for different event types
    const colors = {
      observe: '\x1b[36m',    // Cyan
      reflect: '\x1b[33m',    // Yellow
      plan: '\x1b[35m',       // Magenta
      act: '\x1b[32m',        // Green
      update: '\x1b[34m',     // Blue
      orchestrator: '\x1b[31m' // Red
    };
    
    const color = colors[eventType] || colors[category] || '\x1b[37m'; // White default
    const reset = '\x1b[0m';
    
    console.log(`${color}[${timestamp}][${eventType.toUpperCase()}][${sessionShort}]${reset}`, 
      this.formatConsoleOutput(logEntry));
  }
  
  /**
   * Format console output for readability
   * @param {Object} logEntry - Log entry
   * @returns {string} Formatted output
   */
  formatConsoleOutput(logEntry) {
    const { eventType } = logEntry;
    
    switch (eventType) {
      case 'observe':
        return `Input: "${logEntry.input?.userInput?.substring(0, 50)}..." | ` +
               `Context: ${logEntry.cseContext?.memoryChunksCount || 0} chunks | ` +
               `Special: ${logEntry.input?.isSpecialCommand || false}`;
               
      case 'reflect':
        return `Strategy: ${logEntry.responseStrategy?.type || 'unknown'} | ` +
               `Confidence: ${logEntry.confidenceScore || 0} | ` +
               `Depth: ${logEntry.reflectionDepth || 0}`;
               
      case 'plan':
        return `Skill: ${logEntry.skillSelection?.selectedSkill || 'none'} | ` +
               `Type: ${logEntry.skillSelection?.skillType || 'unknown'} | ` +
               `Considered: ${logEntry.skillSelection?.skillsConsidered?.length || 0}`;
               
      case 'act':
        return `Executed: ${logEntry.skillExecution?.skillExecuted || 'unknown'} | ` +
               `Success: ${logEntry.skillExecution?.executionSuccess || false} | ` +
               `Response: ${logEntry.response?.length || 0} chars`;
               
      case 'update':
        return `Memory: ${logEntry.memoryUpdates?.length || 0} updates | ` +
               `State: ${logEntry.agentStateChanges?.changesCount || 0} changes | ` +
               `Learning: ${logEntry.learningEvents?.length || 0} events`;
               
      default:
        return JSON.stringify(logEntry, null, 2);
    }
  }
  
  /**
   * Log to file
   * @param {Object} logEntry - Log entry
   * @param {string} filePath - File path
   */
  async logToFile(logEntry, filePath) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(filePath, logLine);
      
      // Check file size and rotate if needed
      await this.rotateLogFileIfNeeded(filePath);
      
    } catch (error) {
      logger.error('Error writing to log file', { filePath, error });
    }
  }
  
  /**
   * Add entry to batch for batched logging
   * @param {Object} logEntry - Log entry
   */
  addToBatch(logEntry) {
    this.logBatch.push(logEntry);
    
    // Flush batch if it reaches the batch size
    if (this.logBatch.length >= this.config.batchSize) {
      this.flushBatch();
    }
    
    // Set timer to flush batch after timeout
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.config.batchTimeout);
    }
  }
  
  /**
   * Flush the log batch to file
   */
  async flushBatch() {
    if (this.logBatch.length === 0) return;
    
    try {
      const batchData = this.logBatch.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(this.agentLoopLogPath, batchData);
      
      this.logBatch = [];
      
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      
    } catch (error) {
      logger.error('Error flushing log batch', error);
    }
  }
  
  /**
   * Rotate log file if it exceeds size limit
   * @param {string} filePath - File path to check
   */
  async rotateLogFileIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > this.config.maxLogFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${filePath}.${timestamp}`;
        
        await fs.rename(filePath, rotatedPath);
        
        // Clean up old log files
        await this.cleanupOldLogFiles(path.dirname(filePath), path.basename(filePath));
        
        logger.info('Log file rotated', { originalPath: filePath, rotatedPath });
      }
      
    } catch (error) {
      // File might not exist yet, which is fine
      if (error.code !== 'ENOENT') {
        logger.error('Error checking log file size', { filePath, error });
      }
    }
  }
  
  /**
   * Clean up old log files
   * @param {string} logDir - Log directory
   * @param {string} baseFileName - Base file name
   */
  async cleanupOldLogFiles(logDir, baseFileName) {
    try {
      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter(file => file.startsWith(baseFileName) && file !== baseFileName)
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          stat: null
        }));
      
      // Get file stats
      for (const file of logFiles) {
        try {
          file.stat = await fs.stat(file.path);
        } catch (error) {
          // Skip files we can't stat
        }
      }
      
      // Sort by modification time (newest first)
      logFiles
        .filter(file => file.stat)
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(this.config.maxLogFiles) // Keep only the newest files
        .forEach(async (file) => {
          try {
            await fs.unlink(file.path);
            logger.info('Deleted old log file', { path: file.path });
          } catch (error) {
            logger.error('Error deleting old log file', { path: file.path, error });
          }
        });
        
    } catch (error) {
      logger.error('Error cleaning up old log files', { logDir, error });
    }
  }
  
  /**
   * Summarize CSE context for logging
   * @param {Object} cseContext - CSE context
   * @returns {Object} Context summary
   */
  summarizeContext(cseContext) {
    if (!cseContext) return null;
    
    return {
      hasMemory: !!(cseContext.memoryContext?.length),
      hasIdentity: !!(cseContext.identity?.length),
      hasCapabilities: !!(cseContext.capabilities?.length),
      memoryTypes: cseContext.memoryContext?.map(item => item.type).slice(0, 5) || [],
      identityPreview: cseContext.identity?.slice(0, 2) || [],
      capabilityPreview: cseContext.capabilities?.slice(0, 2) || []
    };
  }
  
  /**
   * Sanitize parameters for logging (remove sensitive data)
   * @param {Object} parameters - Parameters to sanitize
   * @returns {Object} Sanitized parameters
   */
  sanitizeParameters(parameters) {
    if (!parameters) return null;
    
    const sanitized = { ...parameters };
    
    // Remove potentially sensitive fields
    delete sanitized.agentState;
    delete sanitized.context;
    
    // Truncate long strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 200) {
        sanitized[key] = sanitized[key].substring(0, 200) + '...';
      }
    });
    
    return sanitized;
  }
  
  /**
   * Sanitize payload for logging
   * @param {Object} payload - Payload to sanitize
   * @returns {Object} Sanitized payload
   */
  sanitizePayload(payload) {
    if (!payload) return null;
    
    const sanitized = { ...payload };
    
    // Remove large objects
    delete sanitized.agentState;
    delete sanitized.orchestrator;
    
    return sanitized;
  }
  
  /**
   * Get log statistics
   * @returns {Promise<Object>} Log statistics
   */
  async getLogStatistics() {
    try {
      const stats = {
        agentLoopLog: await this.getFileStats(this.agentLoopLogPath),
        orchestratorLog: await this.getFileStats(this.orchestratorLogPath),
        logDirectory: this.config.logDirectory,
        batchSize: this.logBatch.length
      };
      
      return stats;
      
    } catch (error) {
      logger.error('Error getting log statistics', error);
      return null;
    }
  }
  
  /**
   * Get file statistics
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File stats
   */
  async getFileStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
        modified: stats.mtime,
        lines: await this.countLines(filePath)
      };
    } catch (error) {
      return {
        exists: false,
        size: 0,
        modified: null,
        lines: 0
      };
    }
  }
  
  /**
   * Count lines in a file
   * @param {string} filePath - File path
   * @returns {Promise<number>} Line count
   */
  async countLines(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.split('\n').length - 1; // Subtract 1 for the last empty line
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    try {
      // Flush any remaining batch
      if (this.logBatch.length > 0) {
        await this.flushBatch();
      }
      
      // Clear batch timer
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      
      logger.info('OrchestratorLogger shutdown complete');
      
    } catch (error) {
      logger.error('Error during OrchestratorLogger shutdown', error);
    }
  }
}

module.exports = OrchestratorLogger;
