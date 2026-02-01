
// logger.js — Fallback-safe logging for Leo local runtime

/**
 * Console-based fallback logger
 */
const createFallbackLogger = () => ({
  info: (...args) => console.error('[INFO]', ...args),
  warn: (...args) => console.error('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => {
    if (process.env.DEBUG === 'true') {
      console.error('[DEBUG]', ...args); // More reliable than console.debug
    }
  },
});

const path = require('path');
const logPath = path.resolve(__dirname, '../../leo-debug.log'); // Always project root

let advancedLogger = null;
try {
  try {
    const winston = require('winston');

    const createComponentLogger = (componentName = 'leo') => {
      const transports = [
        new winston.transports.File({ filename: logPath })
      ];
      // Only emit to console if LEO_DEBUG_CONTEXT=1
      if (process.env.LEO_DEBUG_CONTEXT === '1') {
        transports.push(new winston.transports.Console());
      }
      // One-time confirmation of log path
      if (!process.env.__LEO_LOGGER_PATH_CONFIRMED) {
        process.env.__LEO_LOGGER_PATH_CONFIRMED = '1';
        console.error('[Leo Logger] Writing logs to:', logPath);
      }
      return winston.createLogger({
        level: process.env.DEBUG === 'true' ? 'debug' : 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] [${componentName}] [${level.toUpperCase()}] ${message}`;
          })
        ),
        transports
      });
    };

    advancedLogger = createComponentLogger();
    // Write a test line to file (always .info, never .debug to ensure it's written)
    advancedLogger.info('--- LOGGER INIT TEST ---');
    // Now, verify the file exists and is writable
    const fs = require('fs');
    setTimeout(() => {
      fs.access(logPath, fs.constants.F_OK | fs.constants.W_OK, (err) => {
        if (err) {
          // This will always reach the user
          console.warn('[LOGGER] WARNING: leo-debug.log is NOT being written! Check permissions/path.');
        }
      });
    }, 100); // Wait briefly to allow Winston to flush
    // Force flush/close Winston transports on exit
    if (advancedLogger && advancedLogger.transports) {
      const flushTransports = () => {
        advancedLogger.transports.forEach(t => t.close && t.close());
      };
      process.on('beforeExit', flushTransports);
      process.on('exit', flushTransports);
      process.on('SIGINT', flushTransports);
      process.on('SIGTERM', flushTransports);
      process.on('uncaughtException', flushTransports);
    }
    // Only log initialization message if not being run as a script
    if (require.main !== module && !process.argv[1]?.includes('generate-embedding.js')) {
      console.error('Logger: Using Winston');
    }
  } catch {
    const pino = require('pino');
    advancedLogger = pino({
      level: process.env.DEBUG === 'true' ? 'debug' : 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    });
    // Only log initialization message if not being run as a script
    if (require.main !== module && !process.argv[1]?.includes('generate-embedding.js')) {
      console.error('Logger: Using Pino');
    }
  }
} catch {
  console.error('Logger: Falling back to console methods');
  advancedLogger = null;
}

const baseLogger = advancedLogger || createFallbackLogger();

/**
 * Component-specific logger with optional prefixing
 */
function createComponentLogger(component = '') {
  if (advancedLogger?.child) {
    return advancedLogger.child({ component });
  }

  const prefix = component ? `[${component}]` : '';
  return {
    info: (...args) => baseLogger.info(`${prefix}`, ...args),
    warn: (...args) => baseLogger.warn(`${prefix}`, ...args),
    error: (...args) => baseLogger.error(`${prefix}`, ...args),
    debug: (...args) => baseLogger.debug(`${prefix}`, ...args),
  };
}

/**
 * Safe logger wrapper
 */
const safeLog = (logFn, ...args) => {
  try {
    logFn(...args);
  } catch (err) {
    console.error('Logger failure:', err);
    try {
      console.log(...args);
    } catch (_) {}
  }
};

const safeLogger = {
  info: (...args) => safeLog(baseLogger.info, ...args),
  warn: (...args) => safeLog(baseLogger.warn, ...args),
  error: (...args) => safeLog(baseLogger.error, ...args),
  debug: (...args) => safeLog(baseLogger.debug, ...args),
  user: (...args) => {
    if (process.env.LEO_DEBUG_CONTEXT === '1') {
      // Print to stdout in debug/dev mode
      try {
        // Use process.stdout.write for strings, fallback to console.log for objects
        args.forEach(arg => {
          if (typeof arg === 'string') {
            process.stdout.write(arg + '\n');
          } else {
            process.stdout.write(JSON.stringify(arg, null, 2) + '\n');
          }
        });
      } catch (err) {
        // Fallback
        console.log(...args);
      }
    }
    // In production/user mode, do nothing (no log leak)
  }
};

module.exports = {
  ...safeLogger,
  createComponentLogger
};
