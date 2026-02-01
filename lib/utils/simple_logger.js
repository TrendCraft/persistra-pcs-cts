// lib/utils/logger.js
// Simple logger implementation for Leo

function createLogger(component) {
  return {
    info: (msg) => console.log(`ℹ️  [${component}] ${msg}`),
    error: (msg) => console.error(`❌ [${component}] ${msg}`),
    warn: (msg) => console.warn(`⚠️  [${component}] ${msg}`),
    debug: (msg) => console.log(`🐛 [${component}] ${msg}`)
  };
}

function createComponentLogger(component) {
  return createLogger(component);
}

module.exports = createLogger;
module.exports.createComponentLogger = createComponentLogger;