// lib/utils/logger.js

const createComponentLogger = (componentName) => {
  return {
    info: (message, data = {}) => {
      console.log(`[INFO] [${componentName}] ${message}`, data);
    },
    warn: (message, data = {}) => {
      console.warn(`[WARN] [${componentName}] ${message}`, data);
    },
    error: (message, data = {}) => {
      console.error(`[ERROR] [${componentName}] ${message}`, data);
    },
    debug: (message, data = {}) => {
      if (process.env.DEBUG === 'true') {
        console.debug(`[DEBUG] [${componentName}] ${message}`, data);
      }
    },
  };
};

module.exports = { createComponentLogger };
