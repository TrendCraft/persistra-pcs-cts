// fixed_leo_runtime.js

const path = require('path');
const logger = require('./logger');
const { loadConfiguration, verifyFiles } = require('./config-service');
const eventBus = require('./event-bus');
const memoryGraph = require('./memory-graph-integration');
const semanticContextManager = require('./semantic-context-manager');

async function initializeLeo() {
  try {
    logger.info('[LEO_INIT] Starting initialization');

    // Load configuration
    const config = loadConfiguration();
    logger.info('[config] Configuration loaded successfully', config);

    // Verify critical files
    const verification = verifyFiles(config);
    logger.info('[config] File verification:', verification);

    // Initialize event bus
    eventBus.initialize();
    logger.info('[event-bus] Event bus initialized {}');

    // Initialize memory graph
    await memoryGraph.initialize();
    logger.info('[memory-graph] Memory graph initialized {}');

    // Initialize semantic context manager
    semanticContextManager.initialize(config);
    logger.info('[semantic-context-manager] Configuration initialized', config);

    logger.info('[LEO_INIT] Initialization complete');
  } catch (err) {
    logger.error('[LEO_INIT_ERROR]', err);
    process.exit(1);
  }
}

initializeLeo();
