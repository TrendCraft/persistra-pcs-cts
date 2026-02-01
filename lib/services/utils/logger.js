// Minimal logger factory for semantic-context-manager and other services
const winston = require('winston');

function createComponentLogger(componentName) {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.label({ label: componentName }),
      winston.format.timestamp(),
      winston.format.printf(({ level, message, label, timestamp }) => {
        return `[${timestamp}] [${label}] [${level.toUpperCase()}] ${message}`;
      })
    ),
    transports: [
      new winston.transports.Console()
    ]
  });
}

module.exports = { createComponentLogger };
