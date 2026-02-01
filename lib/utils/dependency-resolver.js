/**
 * Dependency Resolver
 * 
 * This utility provides a standardized way to manage component dependencies,
 * ensuring proper initialization order and graceful degradation when dependencies
 * are unavailable or fail to initialize.
 * 
 * It supports the "AI cognition WITH humans" approach by ensuring system reliability
 * and maintaining trust through consistent behavior, even when components fail.
 */

const { createComponentLogger } = require('./logger');
const eventBus = require('./event-bus');

// Create logger
const logger = createComponentLogger('dependency-resolver');

// Registry of components and their dependencies
const componentRegistry = new Map();

// Registry of initialization promises
const initPromises = new Map();

// Registry of fallback implementations
const fallbackRegistry = new Map();

/**
 * Dependency Resolver
 * 
 * Manages component dependencies and initialization
 */
const dependencyResolver = {
  /**
   * Register a component and its dependencies
   * 
   * @param {string} componentName - Name of the component
   * @param {Array<string>} dependencies - Array of dependency component names
   * @param {Object} options - Registration options
   * @param {number} options.timeout - Initialization timeout in milliseconds
   * @param {boolean} options.required - Whether all dependencies are required
   * @returns {Object} Registration result
   */
  registerComponent(componentName, dependencies = [], options = {}) {
    logger.info(`Registering component: ${componentName}`);
    
    const componentOptions = {
      timeout: options.timeout || 30000, // Default 30 second timeout
      required: options.required !== undefined ? options.required : true,
      ...options
    };
    
    componentRegistry.set(componentName, {
      name: componentName,
      dependencies,
      options: componentOptions,
      initialized: false
    });
    
    logger.info(`Component registered: ${componentName} with dependencies: ${dependencies.join(', ')}`);
    
    return {
      success: true,
      componentName,
      dependencies
    };
  },
  
  /**
   * Register a fallback implementation for a component
   * 
   * @param {string} componentName - Name of the component
   * @param {Object} fallbackImpl - Fallback implementation
   * @returns {Object} Registration result
   */
  registerFallback(componentName, fallbackImpl) {
    logger.info(`Registering fallback for component: ${componentName}`);
    
    fallbackRegistry.set(componentName, fallbackImpl);
    
    return {
      success: true,
      componentName
    };
  },
  
  /**
   * Initialize a component and its dependencies
   * 
   * @param {string} componentName - Name of the component
   * @param {Object} component - Component instance
   * @param {Function} initFunction - Initialization function
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initializeComponent(componentName, component, initFunction, options = {}) {
    // If already initializing, return the existing promise
    if (initPromises.has(componentName)) {
      logger.info(`Component ${componentName} already initializing, returning existing promise`);
      return initPromises.get(componentName);
    }
    
    logger.info(`Initializing component: ${componentName}`);
    
    const initPromise = (async () => {
      try {
        // Get component registration
        const registration = componentRegistry.get(componentName);
        
        if (!registration) {
          logger.warn(`Component ${componentName} not registered, initializing without dependency resolution`);
        } else {
          // Initialize dependencies first
          await this.initializeDependencies(registration.dependencies, registration.options);
        }
        
        // Create timeout promise
        const timeoutMs = options.timeout || (registration?.options.timeout || 30000);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Initialization of ${componentName} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        });
        
        // Initialize component with timeout
        const result = await Promise.race([
          initFunction(options),
          timeoutPromise
        ]);
        
        // Mark as initialized
        if (registration) {
          registration.initialized = true;
          componentRegistry.set(componentName, registration);
        }
        
        // Emit initialization event
        eventBus.emit('component:initialized', {
          component: componentName,
          timestamp: Date.now()
        });
        
        logger.info(`Component initialized successfully: ${componentName}`);
        
        return {
          success: true,
          componentName,
          result
        };
      } catch (error) {
        logger.error(`Failed to initialize component ${componentName}: ${error.message}`, error);
        
        // Check if fallback is available
        if (fallbackRegistry.has(componentName)) {
          logger.info(`Using fallback implementation for ${componentName}`);
          
          // Emit fallback event
          eventBus.emit('component:fallback', {
            component: componentName,
            error: error.message,
            timestamp: Date.now()
          });
          
          return {
            success: false,
            componentName,
            error: error.message,
            fallback: true,
            fallbackImpl: fallbackRegistry.get(componentName)
          };
        }
        
        // Emit error event
        eventBus.emit('error', {
          component: componentName,
          message: `Failed to initialize component: ${error.message}`,
          error: error
        });
        
        // If the component is required, rethrow the error
        const registration = componentRegistry.get(componentName);
        if (registration && registration.options.required) {
          throw error;
        }
        
        // Otherwise return error result
        return {
          success: false,
          componentName,
          error: error.message
        };
      } finally {
        // Clean up initialization promise
        initPromises.delete(componentName);
      }
    })();
    
    // Store initialization promise
    initPromises.set(componentName, initPromise);
    
    return initPromise;
  },
  
  /**
   * Initialize dependencies for a component
   * 
   * @param {Array<string>} dependencies - Array of dependency component names
   * @param {Object} options - Initialization options
   * @returns {Promise<Array<Object>>} Initialization results
   * @private
   */
  async initializeDependencies(dependencies, options = {}) {
    if (!dependencies || dependencies.length === 0) {
      return [];
    }
    
    logger.info(`Initializing dependencies: ${dependencies.join(', ')}`);
    
    const initResults = [];
    
    for (const dependency of dependencies) {
      const registration = componentRegistry.get(dependency);
      
      if (!registration) {
        logger.warn(`Dependency ${dependency} not registered`);
        
        if (options.required) {
          throw new Error(`Required dependency ${dependency} not registered`);
        }
        
        continue;
      }
      
      if (registration.initialized) {
        logger.info(`Dependency ${dependency} already initialized`);
        continue;
      }
      
      if (initPromises.has(dependency)) {
        logger.info(`Dependency ${dependency} already initializing, waiting for completion`);
        const result = await initPromises.get(dependency);
        initResults.push(result);
        continue;
      }
      
      logger.warn(`Dependency ${dependency} not initializing, cannot proceed`);
      
      if (options.required) {
        throw new Error(`Required dependency ${dependency} not initializing`);
      }
    }
    
    return initResults;
  },
  
  /**
   * Get a component's initialization status
   * 
   * @param {string} componentName - Name of the component
   * @returns {Object} Initialization status
   */
  getComponentStatus(componentName) {
    const registration = componentRegistry.get(componentName);
    
    if (!registration) {
      return {
        registered: false,
        initialized: false,
        initializing: initPromises.has(componentName),
        hasFallback: fallbackRegistry.has(componentName)
      };
    }
    
    return {
      registered: true,
      initialized: registration.initialized,
      initializing: initPromises.has(componentName),
      dependencies: registration.dependencies,
      required: registration.options.required,
      hasFallback: fallbackRegistry.has(componentName)
    };
  },
  
  /**
   * Get all component statuses
   * 
   * @returns {Object} Component statuses
   */
  getAllComponentStatuses() {
    const statuses = {};
    
    for (const [componentName] of componentRegistry) {
      statuses[componentName] = this.getComponentStatus(componentName);
    }
    
    return statuses;
  },
  
  /**
   * Check if a component is initialized
   * 
   * @param {string} componentName - Name of the component
   * @returns {boolean} Whether the component is initialized
   */
  isComponentInitialized(componentName) {
    const registration = componentRegistry.get(componentName);
    return registration ? registration.initialized : false;
  },
  
  /**
   * Get a fallback implementation for a component
   * 
   * @param {string} componentName - Name of the component
   * @returns {Object|null} Fallback implementation or null if not available
   */
  getFallbackImplementation(componentName) {
    return fallbackRegistry.get(componentName) || null;
  },
  
  /**
   * Clear all registrations (mainly for testing)
   */
  clearAll() {
    componentRegistry.clear();
    initPromises.clear();
    fallbackRegistry.clear();
  }
};

module.exports = dependencyResolver;
