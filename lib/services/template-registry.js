/**
 * Template Registry
 * 
 * Provides a centralized registry for prompt templates with standardized
 * interfaces and integration with Leo's event system.
 * 
 * @module lib/services/template-registry
 * @author Leo Development Team
 * @created May 22, 2025
 */

const fs = require('fs').promises;
const path = require('path');
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'template-registry';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Template Registry
 * 
 * Manages built-in and custom prompt templates
 */
class TemplateRegistry {
  /**
   * Create a new TemplateRegistry instance
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    // Initialization state
    this.initialized = false;
    this.initializing = false;
    this._initPromise = null;
    this.lastError = null;
    
    // Templates storage
    this.templates = new Map();
    this.customTemplates = new Map();
    
    // Configuration with defaults
    this.config = {
      templatesDir: path.join(process.cwd(), 'data', 'templates'),
      customTemplatesDir: path.join(process.cwd(), 'data', 'custom-templates'),
      autoReload: true,
      reloadInterval: 60000, // 1 minute
      ...config
    };
    
    // Reload timer
    this.reloadTimer = null;
  }

  /**
   * Initialize the template registry
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(options = {}) {
    // If already initialized, return immediately
    if (this.initialized) {
      logger.debug(`${COMPONENT_NAME} already initialized`);
      return { success: true, alreadyInitialized: true };
    }
    
    // If initialization is in progress, return the existing promise
    if (this._initPromise) {
      logger.debug(`${COMPONENT_NAME} initialization already in progress`);
      return this._initPromise;
    }
    
    // Set initializing flag and create initialization promise
    this.initializing = true;
    this._initPromise = this._doInitialize(options);
    return this._initPromise;
  }
  
  /**
   * Internal initialization implementation
   * @private
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} Initialization result
   */
  async _doInitialize(options = {}) {
    logger.info(`Initializing ${COMPONENT_NAME}`);
    
    try {
      // Apply configuration
      this.config = { ...this.config, ...options };
      
      // Ensure template directories exist
      await fs.mkdir(this.config.templatesDir, { recursive: true });
      await fs.mkdir(this.config.customTemplatesDir, { recursive: true });
      
      // Register built-in templates
      this.registerBuiltInTemplates();
      
      // Load templates from disk
      await this.loadTemplates();
      
      // Set up auto-reload if enabled
      if (this.config.autoReload) {
        this.setupAutoReload();
      }
      
      // Set initialization flags
      this.initialized = true;
      this.initializing = false;
      
      // Emit initialization event
      eventBus.emit('service:initialized', { 
        service: COMPONENT_NAME, 
        timestamp: Date.now(),
        templateCount: this.templates.size + this.customTemplates.size
      });
      
      return { 
        success: true, 
        templateCount: this.templates.size + this.customTemplates.size,
        timestamp: Date.now()
      };
    } catch (error) {
      this.lastError = error;
      this.initializing = false;
      
      logger.error(`Failed to initialize ${COMPONENT_NAME}: ${error.message}`, error);
      
      // Emit error event
      eventBus.emit('service:initialization_failed', { 
        service: COMPONENT_NAME, 
        error: error.message,
        timestamp: Date.now()
      });
      
      // Clear the init promise so we can try again
      this._initPromise = null;
      
      return { 
        success: false, 
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Register built-in templates
   * @private
   */
  registerBuiltInTemplates() {
    // Standard prompt template
    this.registerTemplate('standard', {
      description: 'Standard prompt template with context',
      format: (content, context = '') => {
        return `${context ? `# Context\n${context}\n\n` : ''}# Prompt\n${content}`;
      }
    });
    
    // Code-focused template
    this.registerTemplate('code', {
      description: 'Code-focused prompt template',
      format: (content, context = '') => {
        return `${context ? `# Context\n\`\`\`\n${context}\n\`\`\`\n\n` : ''}# Code Task\n${content}`;
      }
    });
    
    // Conversation continuation template
    this.registerTemplate('conversation', {
      description: 'Conversation continuation template',
      format: (content, context = '') => {
        return `${context ? `# Previous Conversation\n${context}\n\n` : ''}# Continue Conversation\n${content}`;
      }
    });
    
    // Vision-focused template
    this.registerTemplate('vision', {
      description: 'Vision-focused prompt template',
      format: (content, context = '') => {
        return `${context ? `# Project Vision\n${context}\n\n` : ''}# Align With Vision\n${content}`;
      }
    });
    
    logger.info(`Registered ${this.templates.size} built-in templates`);
  }
  
  /**
   * Load templates from disk
   * @private
   * @returns {Promise<void>}
   */
  async loadTemplates() {
    try {
      // Load custom templates
      const files = await fs.readdir(this.config.customTemplatesDir);
      const templateFiles = files.filter(file => file.endsWith('.js') || file.endsWith('.json'));
      
      for (const file of templateFiles) {
        try {
          const filePath = path.join(this.config.customTemplatesDir, file);
          
          if (file.endsWith('.js')) {
            // Clear require cache to ensure fresh load
            delete require.cache[require.resolve(filePath)];
            const template = require(filePath);
            
            if (template && typeof template.format === 'function') {
              const name = file.replace('.js', '');
              this.registerCustomTemplate(name, template);
            }
          } else if (file.endsWith('.json')) {
            const content = await fs.readFile(filePath, 'utf8');
            const template = JSON.parse(content);
            
            if (template && template.format) {
              // Convert string format function to actual function
              if (typeof template.format === 'string') {
                // eslint-disable-next-line no-new-func
                template.format = new Function('content', 'context', template.format);
              }
              
              const name = file.replace('.json', '');
              this.registerCustomTemplate(name, template);
            }
          }
        } catch (error) {
          logger.error(`Failed to load template file ${file}: ${error.message}`);
        }
      }
      
      logger.info(`Loaded ${this.customTemplates.size} custom templates`);
    } catch (error) {
      logger.error(`Failed to load templates: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set up auto-reload for templates
   * @private
   */
  setupAutoReload() {
    // Clear existing timer if any
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
    }
    
    // Set up new timer
    this.reloadTimer = setInterval(async () => {
      try {
        await this.loadTemplates();
        logger.debug('Auto-reloaded templates');
      } catch (error) {
        logger.error(`Failed to auto-reload templates: ${error.message}`);
      }
    }, this.config.reloadInterval);
    
    logger.debug(`Set up auto-reload with interval ${this.config.reloadInterval}ms`);
  }
  
  /**
   * Register a template
   * @param {string} name - Template name
   * @param {Object} template - Template object
   * @returns {Object} Registration result
   */
  registerTemplate(name, template) {
    try {
      // Validate template
      if (!template.format || typeof template.format !== 'function') {
        throw new Error(`Template ${name} must have a format function`);
      }
      
      // Add to registry
      this.templates.set(name, {
        ...template,
        builtIn: true,
        registered: Date.now()
      });
      
      logger.debug(`Registered template: ${name}`);
      
      // Emit event
      eventBus.emit('template:registered', {
        name,
        builtIn: true,
        timestamp: Date.now()
      });
      
      return { 
        success: true, 
        name,
        builtIn: true,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to register template ${name}: ${error.message}`);
      
      return { 
        success: false, 
        name,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Register a custom template
   * @param {string} name - Template name
   * @param {Object} template - Template object
   * @returns {Object} Registration result
   */
  registerCustomTemplate(name, template) {
    try {
      // Validate template
      if (!template.format || typeof template.format !== 'function') {
        throw new Error(`Template ${name} must have a format function`);
      }
      
      // Add to registry
      this.customTemplates.set(name, {
        ...template,
        builtIn: false,
        registered: Date.now()
      });
      
      logger.debug(`Registered custom template: ${name}`);
      
      // Emit event
      eventBus.emit('template:registered', {
        name,
        builtIn: false,
        timestamp: Date.now()
      });
      
      return { 
        success: true, 
        name,
        builtIn: false,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to register custom template ${name}: ${error.message}`);
      
      return { 
        success: false, 
        name,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Format content using a template
   * @param {string} templateName - Template name
   * @param {string} content - Content to format
   * @param {string} [context=''] - Optional context
   * @returns {Promise<Object>} Formatted result
   */
  async formatWithTemplate(templateName, content, context = '') {
    // Ensure initialization
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        logger.error(`Cannot format with template: initialization failed - ${initResult.error}`);
        return { 
          success: false, 
          error: `Initialization failed: ${initResult.error}`,
          timestamp: Date.now()
        };
      }
    }
    
    try {
      // Find template (check custom first, then built-in)
      const template = this.customTemplates.get(templateName) || this.templates.get(templateName);
      
      if (!template) {
        // Try to use default template
        const defaultTemplate = this.templates.get('standard');
        
        if (!defaultTemplate) {
          throw new Error(`Template ${templateName} not found and no default template available`);
        }
        
        logger.warn(`Template ${templateName} not found, using standard template`);
        
        const formatted = defaultTemplate.format(content, context);
        
        return {
          success: true,
          formatted,
          templateUsed: 'standard',
          fallback: true,
          timestamp: Date.now()
        };
      }
      
      // Format content using template
      const formatted = template.format(content, context);
      
      // Emit event
      eventBus.emit('template:used', {
        name: templateName,
        builtIn: template.builtIn,
        timestamp: Date.now()
      });
      
      return {
        success: true,
        formatted,
        templateUsed: templateName,
        builtIn: template.builtIn,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to format with template ${templateName}: ${error.message}`);
      
      return { 
        success: false, 
        error: error.message,
        templateName,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Get all available templates
   * @returns {Object} Templates object
   */
  getTemplates() {
    const builtIn = Array.from(this.templates.entries()).map(([name, template]) => ({
      name,
      description: template.description || '',
      builtIn: true
    }));
    
    const custom = Array.from(this.customTemplates.entries()).map(([name, template]) => ({
      name,
      description: template.description || '',
      builtIn: false
    }));
    
    return {
      builtIn,
      custom,
      timestamp: Date.now()
    };
  }
  
  /**
   * Save a custom template to disk
   * @param {string} name - Template name
   * @param {Object} template - Template object
   * @returns {Promise<Object>} Save result
   */
  async saveCustomTemplate(name, template) {
    try {
      // Validate template
      if (!template.format) {
        throw new Error(`Template ${name} must have a format function`);
      }
      
      // Prepare template for serialization
      const templateToSave = {
        ...template,
        // Convert function to string if needed
        format: typeof template.format === 'function' 
          ? template.format.toString()
          : template.format
      };
      
      // Save to disk
      const filePath = path.join(this.config.customTemplatesDir, `${name}.json`);
      await fs.writeFile(filePath, JSON.stringify(templateToSave, null, 2), 'utf8');
      
      // Register the template
      const registerResult = this.registerCustomTemplate(name, {
        ...template,
        // Ensure format is a function
        format: typeof template.format === 'function'
          ? template.format
          : new Function('content', 'context', template.format)
      });
      
      if (!registerResult.success) {
        throw new Error(`Failed to register template: ${registerResult.error}`);
      }
      
      logger.info(`Saved custom template to disk: ${name}`);
      
      return { 
        success: true, 
        name,
        filePath,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`Failed to save custom template ${name}: ${error.message}`);
      
      return { 
        success: false, 
        name,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      builtInTemplateCount: this.templates.size,
      customTemplateCount: this.customTemplates.size,
      autoReload: this.config.autoReload,
      lastError: this.lastError ? this.lastError.message : null,
      timestamp: Date.now()
    };
  }
}

// Create singleton instance
const templateRegistry = new TemplateRegistry();

module.exports = {
  templateRegistry
};
