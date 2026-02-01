/**
 * Component Registration Script
 * 
 * This script registers all components with the dependency container.
 * It ensures that components are registered in the correct order and
 * with their proper dependencies.
 */

const dependencyContainer = require('./dependency-container');
const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('register-components');

/**
 * Register all components with the dependency container
 */
function registerAllComponents() {
  logger.info('Registering all components with dependency container');
  
  // Register local semantic embeddings
  dependencyContainer.register('local-semantic-embeddings', () => {
    logger.info('Creating instance of component: local-semantic-embeddings');
    const { localSemanticEmbeddings } = require('../services/local-semantic-embeddings');
    return localSemanticEmbeddings;
  }, ['event-bus']);
  
  // Register cognitive loop orchestrator with local semantic embeddings as a dependency
  dependencyContainer.register('cognitive-loop-orchestrator', () => {
    logger.info('Creating instance of component: cognitive-loop-orchestrator');
    const { cognitiveLoopOrchestrator } = require('../services/cognitive-loop-orchestrator');
    return cognitiveLoopOrchestrator;
  }, [
    'meta-prompt-layer', 
    'context-preservation-system', 
    'semantic-context-manager', 
    'session-boundary-manager',
    'local-semantic-embeddings'
  ]);
  
  logger.info('All components registered successfully');
}

// Execute registration
registerAllComponents();

module.exports = {
  registerAllComponents
};
