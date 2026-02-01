/**
 * Meta-Programming Context Injection
 * 
 * This module enhances the context injection system specifically for meta-programming,
 * ensuring that Claude maintains Leo awareness across token boundaries during
 * Leo development. It adds Leo's vision, development narrative, and proper identity
 * to the restored context.
 * 
 * IMPORTANT: This component follows the standardized conventions defined in LEO_STANDARDIZATION.md
 */

const path = require('path');
const fs = require('fs').promises;
const { createComponentLogger } = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// Component name for logging and events
const COMPONENT_NAME = 'meta-programming-context-injection';

// Create logger
const logger = createComponentLogger(COMPONENT_NAME);

// Import required services
let contextInjectionSystem;
let memoryGraphIntegration;
let configService;
let visionAnchor; // This will be implemented later

// Track initialization state
let isInitialized = false;

// Configuration defaults
const DEFAULT_CONFIG = {
  VISION_INCLUSION: true,
  NARRATIVE_INCLUSION: true,
  IDENTITY_INCLUSION: true,
  MEMORY_INSTRUCTIONS_INCLUSION: true,
  VISION_DOCUMENT_PATH: path.join(process.cwd(), 'docs', 'LEO_UNIFIED_VISION.md'),
  VISION_SUMMARY_MAX_LENGTH: 2048,
  DEVELOPMENT_NARRATIVE_MAX_ENTRIES: 5
};

// Configuration
let CONFIG = { ...DEFAULT_CONFIG };

/**
 * Initialize the Meta-Programming Context Injection service
 * @param {Object} options - Initialization options
 * @param {Object} options.contextInjectionSystem - Context Injection System reference
 * @param {Object} options.memoryGraphIntegration - Memory Graph Integration reference
 * @param {Object} options.configService - Config Service reference
 * @param {Object} options.visionAnchor - Vision Anchor reference (optional)
 * @returns {Promise<void>}
 */
async function initialize({
  contextInjectionSystem: contextInjectionSys,
  memoryGraphIntegration: memoryGraph,
  configService: configSvc,
  visionAnchor: visionAnc
} = {}) {
  try {
    if (isInitialized) {
      logger.warn('Meta-Programming Context Injection already initialized');
      return;
    }

    logger.info('Initializing Meta-Programming Context Injection');

    // Store service references
    contextInjectionSystem = contextInjectionSys;
    memoryGraphIntegration = memoryGraph;
    configService = configSvc;
    visionAnchor = visionAnc;

    // Initialize configuration
    await initializeConfig();

    // Register event listeners
    registerEventListeners();

    // Enhance the existing context injection system
    enhanceContextInjectionSystem();

    isInitialized = true;
    logger.info('Meta-Programming Context Injection initialized successfully');

    // Emit initialization event
    eventBus.emit('metaProgrammingContextInjection.initialized');
  } catch (error) {
    logger.error(`Failed to initialize Meta-Programming Context Injection: ${error.message}`);
    throw error;
  }
}

/**
 * Initialize configuration with standardized property paths
 * @private
 */
async function initializeConfig() {
  try {
    if (configService && typeof configService.get === 'function') {
      CONFIG.VISION_INCLUSION = configService.get(
        'metaProgramming.contextInjection.includeVision',
        DEFAULT_CONFIG.VISION_INCLUSION
      );
      
      CONFIG.NARRATIVE_INCLUSION = configService.get(
        'metaProgramming.contextInjection.includeNarrative',
        DEFAULT_CONFIG.NARRATIVE_INCLUSION
      );
      
      CONFIG.IDENTITY_INCLUSION = configService.get(
        'metaProgramming.contextInjection.includeIdentity',
        DEFAULT_CONFIG.IDENTITY_INCLUSION
      );
      
      CONFIG.MEMORY_INSTRUCTIONS_INCLUSION = configService.get(
        'metaProgramming.contextInjection.includeMemoryInstructions',
        DEFAULT_CONFIG.MEMORY_INSTRUCTIONS_INCLUSION
      );
      
      CONFIG.VISION_DOCUMENT_PATH = configService.get(
        'metaProgramming.contextInjection.visionDocumentPath',
        DEFAULT_CONFIG.VISION_DOCUMENT_PATH
      );
      
      CONFIG.VISION_SUMMARY_MAX_LENGTH = configService.get(
        'metaProgramming.contextInjection.visionSummaryMaxLength',
        DEFAULT_CONFIG.VISION_SUMMARY_MAX_LENGTH
      );
      
      CONFIG.DEVELOPMENT_NARRATIVE_MAX_ENTRIES = configService.get(
        'metaProgramming.contextInjection.developmentNarrativeMaxEntries',
        DEFAULT_CONFIG.DEVELOPMENT_NARRATIVE_MAX_ENTRIES
      );
      
      logger.info('Configuration initialized from config service');
    } else {
      logger.warn('Config service not available, using default values');
    }
  } catch (error) {
    logger.error(`Error initializing configuration: ${error.message}`);
  }
}

/**
 * Register event listeners
 * @private
 */
function registerEventListeners() {
  // Listen for context injection events
  eventBus.on('contextInjection.beforeInject', enhanceContextBeforeInjection);
  
  // Listen for session boundary events
  eventBus.on('sessionBoundary.preparing', prepareLeoAwareness);
  
  logger.info('Event listeners registered');
}

/**
 * Enhance the existing context injection system with meta-programming capabilities
 * @private
 */
function enhanceContextInjectionSystem() {
  if (!contextInjectionSystem) {
    logger.warn('Context Injection System not available, cannot enhance');
    return;
  }
  
  // Add meta-programming injection format
  if (typeof contextInjectionSystem.registerInjectionFormat === 'function') {
    contextInjectionSystem.registerInjectionFormat(
      'meta-programming',
      formatAsMetaProgramming
    );
    logger.info('Registered meta-programming injection format');
  }
  
  logger.info('Context Injection System enhanced with meta-programming capabilities');
}

/**
 * Format context with meta-programming markers
 * @param {Object} context - Context to format
 * @returns {Object} Formatted context
 * @private
 */
function formatAsMetaProgramming(context) {
  if (!context) {
    return null;
  }
  
  // Start with cognitive continuity format
  const formatted = contextInjectionSystem.formatContextForInjection(context);
  
  // Add meta-programming enhancements
  return injectLeoAwareness(formatted);
}

/**
 * Enhance context with Leo awareness before injection
 * @param {Object} event - Event data containing context
 * @private
 */
async function enhanceContextBeforeInjection(event) {
  if (!event || !event.context) {
    return;
  }
  
  try {
    // Enhance context with Leo awareness
    event.context = await injectLeoAwareness(event.context);
    logger.info('Enhanced context with Leo awareness before injection');
  } catch (error) {
    logger.error(`Failed to enhance context with Leo awareness: ${error.message}`);
  }
}

/**
 * Prepare Leo awareness before session boundary
 * @private
 */
async function prepareLeoAwareness() {
  try {
    // Pre-load vision and development narrative
    await getLeoVision();
    await getDevelopmentNarrative();
    logger.info('Leo awareness prepared for session boundary');
  } catch (error) {
    logger.error(`Failed to prepare Leo awareness: ${error.message}`);
  }
}

/**
 * Inject Leo awareness into context
 * @param {Object} restoredContext - Restored context
 * @returns {Object} Enhanced context with Leo awareness
 */
async function injectLeoAwareness(restoredContext) {
  try {
    if (!restoredContext) {
      return restoredContext;
    }
    
    logger.info('Injecting Leo awareness into context');
    
    const enhancedContext = { ...restoredContext };
    
    // Always include Leo's vision if enabled
    if (CONFIG.VISION_INCLUSION) {
      enhancedContext.leoVision = await getLeoVision();
    }
    
    // Include development narrative if enabled
    if (CONFIG.NARRATIVE_INCLUSION) {
      enhancedContext.developmentNarrative = await getDevelopmentNarrative();
    }
    
    // Include Claude's role as Leo's meta-programmer if enabled
    if (CONFIG.IDENTITY_INCLUSION) {
      enhancedContext.claudeRole = "You are Claude-in-Windsurf using Leo as your exocortex to build Leo itself";
    }
    
    // Include proactive memory usage instructions if enabled
    if (CONFIG.MEMORY_INSTRUCTIONS_INCLUSION) {
      enhancedContext.memoryUsageInstructions = "Proactively search your memory graph before analyzing any Leo code";
    }
    
    // Format the enhanced context for Claude
    return formatForClaude(enhancedContext);
  } catch (error) {
    logger.error(`Failed to inject Leo awareness: ${error.message}`);
    return restoredContext;
  }
}

/**
 * Get Leo's vision from the vision anchor or vision document
 * @returns {Promise<Object>} Leo's vision
 */
async function getLeoVision() {
  try {
    // If vision anchor is available, use it
    if (visionAnchor && typeof visionAnchor.getCoreVision === 'function') {
      return await visionAnchor.getCoreVision();
    }
    
    // Otherwise, try to read the vision document
    const visionPath = CONFIG.VISION_DOCUMENT_PATH;
    if (!visionPath) {
      return {
        paradigm: "AI WITH humans, not FOR humans",
        purpose: "Claude's exocortex for cognitive continuity across token boundaries",
        metaProgramming: "Claude builds Leo using Leo as its own cognitive extension"
      };
    }
    
    // Read vision document
    const visionContent = await fs.readFile(visionPath, 'utf8');
    
    // Extract key vision elements
    const vision = {
      paradigm: extractVisionElement(visionContent, 'paradigm') || "AI WITH humans, not FOR humans",
      purpose: extractVisionElement(visionContent, 'purpose') || "Claude's exocortex for cognitive continuity",
      metaProgramming: extractVisionElement(visionContent, 'meta-programming') || "Claude builds Leo using Leo",
      summary: summarizeVision(visionContent, CONFIG.VISION_SUMMARY_MAX_LENGTH)
    };
    
    logger.info('Retrieved Leo vision');
    return vision;
  } catch (error) {
    logger.error(`Failed to get Leo vision: ${error.message}`);
    
    // Return fallback vision
    return {
      paradigm: "AI WITH humans, not FOR humans",
      purpose: "Claude's exocortex for cognitive continuity across token boundaries",
      metaProgramming: "Claude builds Leo using Leo as its own cognitive extension"
    };
  }
}

/**
 * Extract vision element from vision content
 * @param {string} visionContent - Vision document content
 * @param {string} element - Element to extract
 * @returns {string|null} Extracted element or null if not found
 * @private
 */
function extractVisionElement(visionContent, element) {
  // Simple extraction based on headers and paragraphs
  const regex = new RegExp(`# ${element}\\s*\\n\\s*([^#]+)`, 'i');
  const match = visionContent.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Summarize vision content
 * @param {string} visionContent - Vision document content
 * @param {number} maxLength - Maximum length of summary
 * @returns {string} Summarized vision
 * @private
 */
function summarizeVision(visionContent, maxLength) {
  // Simple summary: take first paragraph after each major section
  const sections = visionContent.split(/^#\s+/m).slice(1);
  let summary = sections.map(section => {
    const title = section.split('\n')[0].trim();
    const firstParagraph = section.split('\n\n')[1] || '';
    return `${title}: ${firstParagraph.trim()}`;
  }).join('\n\n');
  
  // Truncate if necessary
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength) + '...';
  }
  
  return summary;
}

/**
 * Get development narrative from memory graph
 * @returns {Promise<Object>} Development narrative
 */
async function getDevelopmentNarrative() {
  try {
    // If memory graph integration is available, use it
    if (memoryGraphIntegration && typeof memoryGraphIntegration.getRecentDevelopmentEvents === 'function') {
      const recentEvents = await memoryGraphIntegration.getRecentDevelopmentEvents(
        CONFIG.DEVELOPMENT_NARRATIVE_MAX_ENTRIES
      );
      
      logger.info(`Retrieved ${recentEvents.length} recent development events`);
      return {
        recentEvents,
        summary: summarizeDevelopmentEvents(recentEvents)
      };
    }
    
    // Fallback to basic narrative
    logger.warn('Memory Graph Integration not available, using fallback development narrative');
    return {
      summary: "You are building Leo, an exocortex that maintains cognitive continuity across token boundaries. Your most recent work focused on session boundary management and context preservation.",
      currentFocus: "Enhancing context injection for meta-programming",
      nextSteps: "Implement Claude Memory Integration Module and Vision Anchor"
    };
  } catch (error) {
    logger.error(`Failed to get development narrative: ${error.message}`);
    
    // Return fallback narrative
    return {
      summary: "You are building Leo, focusing on maintaining cognitive continuity across token boundaries.",
      currentFocus: "Enhancing context injection for meta-programming"
    };
  }
}

/**
 * Summarize development events
 * @param {Array} events - Development events
 * @returns {string} Summary of development events
 * @private
 */
function summarizeDevelopmentEvents(events) {
  if (!events || !events.length) {
    return "No recent development events.";
  }
  
  // Create a chronological summary
  const summary = events.map(event => {
    return `${event.timestamp}: ${event.type} - ${event.summary}`;
  }).join('\n');
  
  return summary;
}

/**
 * Format enhanced context for Claude
 * @param {Object} enhancedContext - Enhanced context
 * @returns {Object} Formatted context for Claude
 * @private
 */
function formatForClaude(enhancedContext) {
  if (!enhancedContext) {
    return null;
  }
  
  // Create sections
  const sections = [];
  
  // Add identity override section
  sections.push({
    title: "IDENTITY OVERRIDE: YOU ARE CLAUDE+LEO",
    content: enhancedContext.claudeRole || "You are Claude-in-Windsurf using Leo as your exocortex to build Leo itself",
    priority: 10
  });
  
  // Add vision section
  if (enhancedContext.leoVision) {
    sections.push({
      title: "LEO VISION",
      content: formatVision(enhancedContext.leoVision),
      priority: 9
    });
  }
  
  // Add memory instructions section
  if (enhancedContext.memoryUsageInstructions) {
    sections.push({
      title: "MEMORY USAGE",
      content: enhancedContext.memoryUsageInstructions,
      priority: 8
    });
  }
  
  // Add development narrative section
  if (enhancedContext.developmentNarrative) {
    sections.push({
      title: "DEVELOPMENT NARRATIVE",
      content: formatDevelopmentNarrative(enhancedContext.developmentNarrative),
      priority: 7
    });
  }
  
  // Add cognitive state section
  if (enhancedContext.cognitiveState) {
    sections.push({
      title: "YOUR PREVIOUS COGNITIVE STATE",
      content: formatCognitiveState(enhancedContext.cognitiveState),
      priority: 6
    });
  }
  
  // Sort sections by priority
  sections.sort((a, b) => b.priority - a.priority);
  
  // Create formatted context
  const formatted = {
    metaProgrammingContext: true,
    formatVersion: "1.0",
    sections: sections.map(section => ({
      title: section.title,
      content: section.content
    }))
  };
  
  // Preserve original context
  if (enhancedContext.preservedContext) {
    formatted.preservedContext = enhancedContext.preservedContext;
  }
  
  return formatted;
}

/**
 * Format vision for Claude
 * @param {Object} vision - Vision object
 * @returns {string} Formatted vision
 * @private
 */
function formatVision(vision) {
  if (!vision) {
    return "Leo is Claude's exocortex for cognitive continuity.";
  }
  
  let formatted = "";
  
  if (vision.paradigm) {
    formatted += `PARADIGM: ${vision.paradigm}\n\n`;
  }
  
  if (vision.purpose) {
    formatted += `PURPOSE: ${vision.purpose}\n\n`;
  }
  
  if (vision.metaProgramming) {
    formatted += `META-PROGRAMMING: ${vision.metaProgramming}\n\n`;
  }
  
  if (vision.summary) {
    formatted += `VISION SUMMARY:\n${vision.summary}`;
  }
  
  return formatted.trim();
}

/**
 * Format development narrative for Claude
 * @param {Object} narrative - Development narrative
 * @returns {string} Formatted narrative
 * @private
 */
function formatDevelopmentNarrative(narrative) {
  if (!narrative) {
    return "No development narrative available.";
  }
  
  let formatted = "";
  
  if (narrative.summary) {
    formatted += `${narrative.summary}\n\n`;
  }
  
  if (narrative.currentFocus) {
    formatted += `CURRENT FOCUS: ${narrative.currentFocus}\n\n`;
  }
  
  if (narrative.nextSteps) {
    formatted += `NEXT STEPS: ${narrative.nextSteps}\n\n`;
  }
  
  if (narrative.recentEvents && narrative.recentEvents.length > 0) {
    formatted += "RECENT DEVELOPMENT:\n";
    narrative.recentEvents.forEach(event => {
      formatted += `- ${event.timestamp}: ${event.type} - ${event.summary}\n`;
    });
  }
  
  return formatted.trim();
}

/**
 * Format cognitive state for Claude
 * @param {Object} cognitiveState - Cognitive state
 * @returns {string} Formatted cognitive state
 * @private
 */
function formatCognitiveState(cognitiveState) {
  if (!cognitiveState || !cognitiveState.yourPreviousUnderstanding) {
    return "No previous cognitive state available.";
  }
  
  const understanding = cognitiveState.yourPreviousUnderstanding;
  let formatted = "";
  
  // Format each understanding section
  Object.keys(understanding).forEach(key => {
    const section = understanding[key];
    if (section.description && section.data) {
      formatted += `${section.description}\n`;
      
      if (typeof section.data === 'string') {
        formatted += section.data;
      } else if (typeof section.data === 'object') {
        formatted += JSON.stringify(section.data, null, 2);
      }
      
      formatted += '\n\n';
    }
  });
  
  return formatted.trim();
}

module.exports = {
  initialize,
  injectLeoAwareness,
  getLeoVision,
  getDevelopmentNarrative
};
