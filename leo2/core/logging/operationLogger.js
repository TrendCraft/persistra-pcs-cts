// leo2/core/logging/operationLogger.js
class OperationLogger {
  logOperation(action, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      ...details
    };
    const logger = require('../../../lib/utils/logger');
    logger.info('[OperationLogger]', JSON.stringify(entry));
    // Optionally: append to file or send to a log server
  }
}
module.exports = new OperationLogger();
