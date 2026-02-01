// Minimal config-service stub for semantic context manager modularization

const config = {};

function getConfig(key, defaultValue) {
  // For now, always return the default value (stub)
  return defaultValue;
}

function setConfig(key, value) {
  config[key] = value;
}

module.exports = {
  getConfig,
  setConfig
};
