/**
 * Meta-Prompt Layer Adapter
 * 
 * Provides a standardized interface to the Meta-Prompt Layer
 * regardless of its implementation details.
 */

const { createComponentLogger } = require('../utils/logger');

// Create logger
const logger = createComponentLogger('meta-prompt-layer-adapter');

/**
 * Create a standardized adapter for the Meta-Prompt Layer
 * 
 * @param {Object} metaPromptLayer - The Meta-Prompt Layer instance
 * @returns {Object} Standardized adapter
 */
function createMetaPromptLayerAdapter(metaPromptLayer) {
  if (!metaPromptLayer) {
    logger.error('Cannot create adapter: Meta-Prompt Layer is null or undefined');
    return null;
  }
  
  logger.info('Creating adapter for Meta-Prompt Layer');
  
  // Log available methods
  const methods = Object.keys(metaPromptLayer)
    .filter(key => typeof metaPromptLayer[key] === 'function');
  logger.debug(`Available methods: ${methods.join(', ')}`);
  
  // Handle the export pattern where the module exports an object with a metaPromptLayer property
  let mplInstance = metaPromptLayer;
  
  // Check if we have a nested structure (module.exports pattern)
  if (metaPromptLayer.metaPromptLayer) {
    logger.debug('Detected nested structure, using metaPromptLayer property');
    mplInstance = metaPromptLayer.metaPromptLayer;
  }
  
  // Log available methods on the instance
  const instanceMethods = Object.keys(mplInstance)
    .filter(key => typeof mplInstance[key] === 'function');
  logger.debug(`Available instance methods: ${instanceMethods.join(', ')}`);
  
  // Check if the instance is a class instance
  if (mplInstance instanceof Object && Object.getPrototypeOf(mplInstance) !== Object.prototype) {
    logger.debug('Detected class instance, accessing prototype methods');
    const prototypeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mplInstance))
      .filter(key => typeof mplInstance[key] === 'function' && key !== 'constructor');
    logger.debug(`Available prototype methods: ${prototypeMethods.join(', ')}`);
  }
  
  // Return a simplified adapter with consistent methods
  return {
    /**
     * Check if the Meta-Prompt Layer is initialized
     * 
     * @returns {boolean} Initialization status
     */
    isInitialized: () => {
      if (typeof mplInstance.isInitialized === 'function') {
        return mplInstance.isInitialized();
      }
      return !!mplInstance.isInitialized;
    },
    
    /**
     * Inject preserved context
     * 
     * @param {Object} context - Context to inject
     * @param {Object} options - Injection options
     * @returns {Promise<Object>} Injection result
     */
    injectPreservedContext: async (context, options = {}) => {
      logger.info('Injecting preserved context through adapter');
      
      try {
        // Try to access the method directly on the instance
        if (typeof mplInstance.injectPreservedContext === 'function') {
          logger.debug('Using injectPreservedContext method directly');
          return await mplInstance.injectPreservedContext(context, options);
        }
        
        // Try to access the method on the prototype
        if (mplInstance instanceof Object && 
            typeof Object.getPrototypeOf(mplInstance).injectPreservedContext === 'function') {
          logger.debug('Using injectPreservedContext method from prototype');
          return await mplInstance.injectPreservedContext(context, options);
        }
        
        // Try alternative methods
        if (typeof mplInstance.enhancePromptWithContext === 'function') {
          logger.debug('Using enhancePromptWithContext method as alternative');
          const enhancedPrompt = mplInstance.enhancePromptWithContext(options.prompt || '', context);
          return {
            success: true,
            message: 'Context injected successfully using enhancePromptWithContext',
            enhancedPrompt
          };
        }
        
        // Try enhancePrompt as another alternative
        if (typeof mplInstance.enhancePrompt === 'function') {
          logger.debug('Using enhancePrompt method as alternative');
          try {
            const result = await mplInstance.enhancePrompt(options.prompt || '', {
              preservedContext: context
            });
            
            if (result && result.enhancedPrompt) {
              return {
                success: true,
                message: 'Context injected successfully using enhancePrompt',
                enhancedPrompt: result.enhancedPrompt
              };
            }
          } catch (enhanceError) {
            logger.warn(`Error using enhancePrompt: ${enhanceError.message}`);
          }
        }
        
        // If we get here, none of the methods worked
        logger.error('No suitable method found for injecting preserved context');
        return {
          success: false,
          error: 'No suitable method found for injecting preserved context'
        };
      } catch (error) {
        logger.error(`Error injecting preserved context: ${error.message}`);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Enhance a prompt with preserved context
     * 
     * @param {string} prompt - Original prompt
     * @param {Object} context - Context to inject
     * @returns {string} Enhanced prompt
     */
    enhancePromptWithContext: (prompt, context) => {
      logger.info('Enhancing prompt with context through adapter');
      
      try {
        if (typeof mplInstance.enhancePromptWithContext === 'function') {
          return mplInstance.enhancePromptWithContext(prompt, context);
        } else if (typeof mplInstance.formatPromptWithContext === 'function') {
          return mplInstance.formatPromptWithContext(prompt, context);
        }
        
        // Default implementation if no method is available
        logger.warn('No enhance prompt method found, using default implementation');
        
        // Create a context preamble
        const contextPreamble = `
=== PRESERVED CONTEXT FROM PREVIOUS SESSION ===
The following is your own previous understanding and context from earlier in this conversation:

${JSON.stringify(context, null, 2)}

This is not new information, but a reminder of what you already understood.
=== END PRESERVED CONTEXT ===

`;
        
        // Add the context preamble to the prompt
        return contextPreamble + prompt;
      } catch (error) {
        logger.error(`Error enhancing prompt with context: ${error.message}`);
        return prompt; // Return original prompt on error
      }
    },
    
    /**
     * Get status of the Meta-Prompt Layer
     * 
     * @returns {Object} Status information
     */
    getStatus: () => {
      if (typeof metaPromptLayer.getStatus === 'function') {
        return metaPromptLayer.getStatus();
      }
      
      // Create a basic status if not available
      return {
        isInitialized: metaPromptLayer.isInitialized || false,
        hasPreservedContext: false
      };
    }
  };
}

/**
 * Factory function for the dependency container
 * 
 * @param {Object} metaPromptLayer - The Meta-Prompt Layer instance
 * @returns {Object} Adapter instance
 */
module.exports = function(metaPromptLayer) {
  return createMetaPromptLayerAdapter(metaPromptLayer);
};
