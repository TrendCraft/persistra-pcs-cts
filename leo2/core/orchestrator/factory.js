// Tripwire to block legacy factory usage
if (!process.env.ALLOW_LEGACY_FACTORY) {
  console.error('[TRIPWIRE] legacy orchestrator factory loaded:\n', (new Error()).stack);
  throw new Error('TRIPWIRE: legacy orchestrator factory must not be used.');
}

const { createDefaultLeoOrchestrator } = require('./orchestratorFactory');
const { loadLeoConfig } = require('../config/config-loader');

let _orchestratorInstance = null;

function getOrchestrator() {
  if (!_orchestratorInstance) {
    const config = loadLeoConfig();
    console.log('[CONFIG] loadedFrom:', config.__loadedFrom);

    // Create orchestrator instance if not already created
    if (!_orchestratorInstance) {
      // Use the updated orchestrator factory that includes LLM gateway
      console.log('[FACTORY] Using orchestrator factory with LLM gateway');
      _orchestratorInstance = createDefaultLeoOrchestrator();
      console.log('[FACTORY] Created new orchestrator instance with LLM gateway');
      
      // Validate memory graph on startup
      if (_orchestratorInstance.memoryGraph && typeof _orchestratorInstance.memoryGraph.validateMemoryGraph === 'function') {
        try {
          _orchestratorInstance.memoryGraph.validateMemoryGraph(false).then(validation => {
            if (!validation.valid) {
              console.warn('[FACTORY] Memory graph validation warning:', validation.message);
            } else {
              console.log('[FACTORY] Memory graph validation passed:', validation.message);
            }
          }).catch(err => {
            console.error('[FACTORY] Memory graph validation error:', err.message);
          });
        } catch (err) {
          console.error('[FACTORY] Memory graph validation setup error:', err.message);
        }
      }
    }

    return _orchestratorInstance;
  }
  return _orchestratorInstance;
}

// Keep backward compatibility
async function getOrCreateOrchestrator() {
  return getOrchestrator();
}

module.exports = { getOrCreateOrchestrator };
