const configService = require('../utils/config-service');
const logger = require('../utils/logger');
const eventBus = require('./event-bus');
const initializeLeo = require('./leo-unified-runtime').initializeLeo;
const runLeoPrompt = require('./leo-unified-runtime').runLeoPrompt;

async function main() {
  try {
    logger.info('[startup] Booting Leo unified runtime...');

    // 1. Initialize configuration first to avoid warnings
    await configService.initialize();
    logger.info('[startup] Configuration service initialized.');

    // 2. Emit startup event
    eventBus.emit('leo:start');

    // 3. Initialize core Leo runtime
    await initializeLeo();

    // 4. Test prompt after all subsystems are ready
    await runLeoPrompt();

  } catch (error) {
    logger.error('[startup] Fatal error during Leo startup:', error);
    process.exit(1);
  }
}

main();
