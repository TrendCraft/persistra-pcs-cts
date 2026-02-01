/**
 * Context Preservation System Adapter
 * 
 * Provides a standardized interface to the Context Preservation System
 * regardless of its implementation details.
 */

const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('context-preservation-adapter');

/**
 * Create a standardized adapter for the Context Preservation System
 * 
 * @param {Object} contextPreservationSystem - The Context Preservation System instance
 * @returns {Object} Standardized adapter
 */
function createContextPreservationAdapter(contextPreservationSystem) {
  if (!contextPreservationSystem) {
    logger.error('Cannot create adapter: Context Preservation System is null or undefined');
    return null;
  }
  
  logger.info('Creating adapter for Context Preservation System');
  
  // Log available methods
  const methods = Object.keys(contextPreservationSystem)
    .filter(key => typeof contextPreservationSystem[key] === 'function');
  logger.debug(`Available methods: ${methods.join(', ')}`);
  
  // Check if we have a nested structure (module.exports pattern)
  let cpsInstance = contextPreservationSystem;
  if (contextPreservationSystem.contextPreservationSystem) {
    logger.debug('Detected nested structure, using contextPreservationSystem property');
    cpsInstance = contextPreservationSystem.contextPreservationSystem;
  }
  
  // Log available methods on the instance
  const instanceMethods = Object.keys(cpsInstance)
    .filter(key => typeof cpsInstance[key] === 'function');
  logger.debug(`Available instance methods: ${instanceMethods.join(', ')}`);
  
  // Check if the instance is a class instance
  if (cpsInstance instanceof Object && Object.getPrototypeOf(cpsInstance) !== Object.prototype) {
    logger.debug('Detected class instance, accessing prototype methods');
    const prototypeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(cpsInstance))
      .filter(key => typeof cpsInstance[key] === 'function' && key !== 'constructor');
    logger.debug(`Available prototype methods: ${prototypeMethods.join(', ')}`);
  }
  
  // Return a simplified adapter with consistent methods
  return {
    /**
     * Check if the Context Preservation System is initialized
     * 
     * @returns {boolean} Initialization status
     */
    isInitialized: () => {
      if (typeof cpsInstance.isInitialized === 'function') {
        return cpsInstance.isInitialized();
      }
      return !!cpsInstance.isInitialized;
    },
    
    /**
     * Preserve context
     * 
     * @param {Object} context - Context to preserve
     * @param {Object} options - Preservation options
     * @returns {Promise<Object>} Preservation result
     */
    preserveContext: async (context, options = {}) => {
      logger.info('Preserving context through adapter');
      
      try {
        // Try to access the method directly on the instance
        if (typeof cpsInstance.preserveContext === 'function') {
          logger.debug('Using preserveContext method directly');
          // Check the expected parameter format
          const parameterCount = cpsInstance.preserveContext.length;
          
          if (parameterCount === 1) {
            // Expects a single options object
            return await cpsInstance.preserveContext({
              context,
              source: options.source || 'context-preservation-adapter',
              isEmergency: options.isEmergency || false
            });
          } else {
            // Might expect separate parameters
            return await cpsInstance.preserveContext(context, {
              source: options.source || 'context-preservation-adapter',
              isEmergency: options.isEmergency || false
            });
          }
        }
        
        // Try alternative methods
        if (typeof cpsInstance.storeContext === 'function') {
          logger.debug('Using storeContext method as alternative');
          return await cpsInstance.storeContext(context, options.isEmergency || false);
        }
        
        logger.error('No compatible context preservation method found');
        throw new Error('No compatible context preservation method found');
      } catch (error) {
        logger.error(`Error preserving context: ${error.message}`);
        return {
          success: false,
          error: error.message
        };
      }
    },
    
    /**
     * Restore context
     * 
     * @param {Object} options - Restoration options
     * @returns {Promise<Object>} Restoration result
     */
    restoreContext: async (options = {}) => {
      logger.info('Restoring context through adapter');
      
      try {
        // Try to access the method directly on the instance
        if (typeof cpsInstance.restoreContext === 'function') {
          logger.debug('Using restoreContext method directly');
          return await cpsInstance.restoreContext(options);
        }
        
        // Try alternative methods
        if (typeof cpsInstance.retrieveLatestContext === 'function') {
          logger.debug('Using retrieveLatestContext method as alternative');
          return await cpsInstance.retrieveLatestContext({
            anySession: true,
            ...options
          });
        } else if (typeof cpsInstance.getLatestContext === 'function') {
          logger.debug('Using getLatestContext method as alternative');
          const context = await cpsInstance.getLatestContext(options);
          return {
            success: !!context,
            context,
            message: context ? 'Context retrieved successfully' : 'No context available'
          };
        }
        
        logger.error('No compatible context restoration method found');
        throw new Error('No compatible context restoration method found');
      } catch (error) {
        logger.error(`Error restoring context: ${error.message}`);
        return {
          success: false,
          error: error.message
        };
      }
    },
    
    /**
     * Get status of the Context Preservation System
     * 
     * @returns {Object} Status information
     */
    getStatus: () => {
      if (typeof contextPreservationSystem.getStatus === 'function') {
        return contextPreservationSystem.getStatus();
      }
      
      // Create a basic status if not available
      return {
        isInitialized: contextPreservationSystem.isInitialized || false,
        lastPreservationTime: null,
        preservationCount: 0
      };
    }
  };
}

/**
 * Factory function for the dependency container
 * 
 * @param {Object} contextPreservationSystem - The Context Preservation System instance
 * @returns {Object} Adapter instance
 */
module.exports = function(contextPreservationSystem) {
  return createContextPreservationAdapter(contextPreservationSystem);
};
