// fixed_leo_runtime.js - Simplified Initialization Without External Logger

// Minimal logger fallback\const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

const { initializeEventBus } = require('../utils/event-bus');
const { initializeConfig, getConfigSources, verifyFiles } = require('../services/config');
const { initializeConfigService, getConfiguration } = require('../services/config-service');
const { initializeSemanticContextManager } = require('../services/semantic-context-manager');

async function initializeLeo() {
  try {
    logger.info('[event-bus] Event bus initialized', initializeEventBus());

    logger.info('[config] Loading configuration');
    const config = initializeConfig();
    logger.info('[config] Configuration loaded successfully');
    logger.info('[config] Configuration sources:', getConfigSources());

    const verification = verifyFiles();
    logger.info('[config] File verification:', verification);

    logger.info('[config-service] Auto-initializing configuration service');
    initializeConfigService();
    logger.info('[config-service] Initializing configuration service');

    const runtimeConfig = getConfiguration();
    logger.info('[semantic-context-manager] Configuration initialized', runtimeConfig);

    initializeSemanticContextManager(runtimeConfig);

    logger.info('[leo] Initialization complete. Ready to serve requests.');
  } catch (err) {
    logger.error('[LEO_INIT_ERROR]', err);
    process.exit(1);
  }
}

initializeLeo();
