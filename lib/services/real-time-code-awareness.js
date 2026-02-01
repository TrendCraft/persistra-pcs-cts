/**
 * Real-Time Code Awareness Service
 * 
 * This service provides real-time tracking and analysis of code changes,
 * maintaining awareness of modifications across the codebase and their
 * potential impacts on related components.
 */

const { createComponentLogger } = require('../utils/logger');
const configService = require('../config/config');
const eventBus = require('../utils/event-bus');
const pathUtils = require('../utils/path-utils');
const fs = require('fs').promises;
const path = require('path');
const diff = require('diff');

// Component name for logging and events
const COMPONENT_NAME = 'real-time-code-awareness';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

// Configuration with sensible defaults
let CONFIG = {
  CHANGE_HISTORY_SIZE: 100,
  CHANGE_STORAGE_PATH: path.join(process.cwd(), 'data', 'changes'),
  DEPENDENCY_GRAPH_PATH: path.join(process.cwd(), 'data', 'dependency-graph.json'),
  ENABLE_IMPACT_ANALYSIS: true,
  ENABLE_BACKGROUND_TESTING: false,
  MIN_CHANGE_INTERVAL_MS: 500,
  MAX_DIFF_SIZE: 10000
};

// Initialization state
let isInitialized = false;

// Internal state
let changeHistory = [];
let dependencyGraph = {};
let fileVersions = {};
let lastChangeTimestamp = 0;

/**
 * Initialize configuration with standardized property paths
 * @private
 */
function initializeConfig() {
  try {
    // Get configuration from config service
    const config = configService.getConfig() || {};
    
    // Map configuration values with defaults
    CONFIG = {
      CHANGE_HISTORY_SIZE: config.realTimeCodeAwareness?.changeHistorySize || CONFIG.CHANGE_HISTORY_SIZE,
      CHANGE_STORAGE_PATH: config.realTimeCodeAwareness?.changeStoragePath || CONFIG.CHANGE_STORAGE_PATH,
      DEPENDENCY_GRAPH_PATH: config.realTimeCodeAwareness?.dependencyGraphPath || CONFIG.DEPENDENCY_GRAPH_PATH,
      ENABLE_IMPACT_ANALYSIS: config.realTimeCodeAwareness?.enableImpactAnalysis !== undefined ? 
        config.realTimeCodeAwareness.enableImpactAnalysis : CONFIG.ENABLE_IMPACT_ANALYSIS,
      ENABLE_BACKGROUND_TESTING: config.realTimeCodeAwareness?.enableBackgroundTesting !== undefined ?
        config.realTimeCodeAwareness.enableBackgroundTesting : CONFIG.ENABLE_BACKGROUND_TESTING,
      MIN_CHANGE_INTERVAL_MS: config.realTimeCodeAwareness?.minChangeIntervalMs || CONFIG.MIN_CHANGE_INTERVAL_MS,
      MAX_DIFF_SIZE: config.realTimeCodeAwareness?.maxDiffSize || CONFIG.MAX_DIFF_SIZE
    };
    
    logger.info('Configuration initialized', CONFIG);
  } catch (error) {
    logger.warn(`Error loading configuration, using defaults: ${error.message}`);
    // Keep using the default CONFIG values
  }
}

/**
 * Initialize the real-time code awareness service
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  if (isInitialized) {
    logger.info('Real-time code awareness service already initialized');
    return true;
  }
  
  try {
    logger.info('Initializing real-time code awareness service...');
    
    // Initialize configuration
    initializeConfig();
    
    // Try to subscribe to configuration changes, but don't fail if it doesn't work
    try {
      configService.subscribe(COMPONENT_NAME, handleConfigChange);
    } catch (configError) {
      logger.warn(`Could not subscribe to configuration changes: ${configError.message}`);
      // Continue initialization even if config subscription fails
    }
    
    // Ensure change storage directory exists
    try {
      await pathUtils.ensureDirectoryExists(CONFIG.CHANGE_STORAGE_PATH);
    } catch (dirError) {
      logger.warn(`Could not ensure directory exists: ${dirError.message}`);
      // Use a fallback directory in the current working directory
      CONFIG.CHANGE_STORAGE_PATH = path.join(process.cwd(), 'data', 'changes');
      try {
        // Create the directory synchronously as a fallback
        if (!require('fs').existsSync(CONFIG.CHANGE_STORAGE_PATH)) {
          require('fs').mkdirSync(CONFIG.CHANGE_STORAGE_PATH, { recursive: true });
        }
      } catch (fallbackError) {
        logger.warn(`Could not create fallback directory: ${fallbackError.message}`);
        // Continue anyway, we'll handle errors when trying to save files
      }
    }
    
    // Load dependency graph with error handling
    try {
      await loadDependencyGraph();
    } catch (graphError) {
      logger.warn(`Could not load dependency graph: ${graphError.message}`);
      // Initialize with an empty dependency graph
      dependencyGraph = {};
    }
    
    // Subscribe to file change events
    try {
      eventBus.on('file:changed', handleFileChanged, COMPONENT_NAME);
      eventBus.on('file:deleted', handleFileDeleted, COMPONENT_NAME);
    } catch (eventError) {
      logger.warn(`Could not subscribe to file events: ${eventError.message}`);
      // Continue without event subscriptions
    }
    
    // Load existing change history with error handling
    try {
      await loadChangeHistory();
    } catch (historyError) {
      logger.warn(`Could not load change history: ${historyError.message}`);
      // Initialize with an empty change history
      changeHistory = [];
    }
    
    isInitialized = true;
    logger.info('Real-time code awareness service initialized successfully');
    
    // Emit initialization event
    try {
      eventBus.emit('service:initialized', { 
        service: COMPONENT_NAME,
        timestamp: Date.now()
      });
    } catch (emitError) {
      logger.warn(`Could not emit initialization event: ${emitError.message}`);
      // Continue even if event emission fails
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize real-time code awareness service: ${error.message}`);
    try {
      eventBus.emit('service:error', {
        service: COMPONENT_NAME,
        error: error.message,
        timestamp: Date.now()
      });
    } catch (emitError) {
      logger.warn(`Could not emit error event: ${emitError.message}`);
    }
    
    // Set initialized to true anyway to prevent repeated initialization attempts
    // This allows the service to be partially functional even after initialization errors
    isInitialized = true;
    
    return false;
  }
}

/**
 * Handle configuration changes
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @private
 */
function handleConfigChange(event, data) {
  if (event === 'config:changed' && data.component === COMPONENT_NAME) {
    logger.info('Configuration changed, updating...');
    initializeConfig();
  }
}

/**
 * Load dependency graph from storage
 * @private
 */
async function loadDependencyGraph() {
  try {
    const graphExists = await pathUtils.fileExists(CONFIG.DEPENDENCY_GRAPH_PATH);
    
    if (graphExists) {
      const graphData = await fs.readFile(CONFIG.DEPENDENCY_GRAPH_PATH, 'utf8');
      dependencyGraph = JSON.parse(graphData);
      logger.info(`Loaded dependency graph with ${Object.keys(dependencyGraph).length} components`);
    } else {
      logger.info('No existing dependency graph found, creating empty graph');
      dependencyGraph = {};
      await saveDependencyGraph();
    }
  } catch (error) {
    logger.warn(`Failed to load dependency graph: ${error.message}`);
    dependencyGraph = {};
  }
}

/**
 * Save dependency graph to storage
 * @private
 */
async function saveDependencyGraph() {
  try {
    await fs.writeFile(CONFIG.DEPENDENCY_GRAPH_PATH, JSON.stringify(dependencyGraph, null, 2));
    logger.info(`Saved dependency graph with ${Object.keys(dependencyGraph).length} components`);
  } catch (error) {
    logger.error(`Failed to save dependency graph: ${error.message}`);
  }
}

/**
 * Load change history from storage
 * @private
 */
async function loadChangeHistory() {
  try {
    const changeHistoryPath = path.join(CONFIG.CHANGE_STORAGE_PATH, 'change-history.json');
    const historyExists = await pathUtils.fileExists(changeHistoryPath);
    
    if (historyExists) {
      const historyData = await fs.readFile(changeHistoryPath, 'utf8');
      changeHistory = JSON.parse(historyData);
      logger.info(`Loaded change history with ${changeHistory.length} entries`);
    } else {
      logger.info('No existing change history found, creating empty history');
      changeHistory = [];
      await saveChangeHistory();
    }
  } catch (error) {
    logger.warn(`Failed to load change history: ${error.message}`);
    changeHistory = [];
  }
}

/**
 * Save change history to storage
 * @private
 */
async function saveChangeHistory() {
  try {
    const changeHistoryPath = path.join(CONFIG.CHANGE_STORAGE_PATH, 'change-history.json');
    await fs.writeFile(changeHistoryPath, JSON.stringify(changeHistory, null, 2));
    logger.info(`Saved change history with ${changeHistory.length} entries`);
  } catch (error) {
    logger.error(`Failed to save change history: ${error.message}`);
  }
}

/**
 * Handle file changed event
 * @param {Object} data - Event data
 * @private
 */
async function handleFileChanged(data) {
  try {
    // Check if we should process this change
    if (!shouldProcessChange(data.path)) {
      return;
    }
    
    // Throttle changes to prevent excessive processing
    const now = Date.now();
    if (now - lastChangeTimestamp < CONFIG.MIN_CHANGE_INTERVAL_MS) {
      logger.debug(`Throttling change to ${data.path}, too soon after last change`);
      return;
    }
    lastChangeTimestamp = now;
    
    logger.info(`Processing change to file: ${data.path}`);
    
    // Read the current file content
    const content = await pathUtils.readFile(data.path);
    
    // Generate diff if we have a previous version
    let changeAnalysis = null;
    if (fileVersions[data.path]) {
      changeAnalysis = analyzeChange(data.path, fileVersions[data.path], content);
      
      // Add to change history
      addToChangeHistory({
        path: data.path,
        timestamp: now,
        type: 'modified',
        analysis: changeAnalysis
      });
      
      // Analyze impact if enabled
      if (CONFIG.ENABLE_IMPACT_ANALYSIS) {
        const impactAnalysis = analyzeImpact(data.path, changeAnalysis);
        
        // Emit impact analysis event
        eventBus.emit('code:impact:analyzed', {
          path: data.path,
          timestamp: now,
          impact: impactAnalysis
        });
      }
    } else {
      // First time seeing this file
      addToChangeHistory({
        path: data.path,
        timestamp: now,
        type: 'added',
        analysis: {
          type: 'new-file',
          size: content.length
        }
      });
    }
    
    // Update file version
    fileVersions[data.path] = content;
    
    // Emit change processed event
    eventBus.emit('code:change:processed', {
      path: data.path,
      timestamp: now,
      changeType: fileVersions[data.path] ? 'modified' : 'added',
      analysis: changeAnalysis
    });
    
    // Run background tests if enabled
    if (CONFIG.ENABLE_BACKGROUND_TESTING) {
      runBackgroundTests(data.path);
    }
  } catch (error) {
    logger.error(`Error processing file change: ${error.message}`);
  }
}

/**
 * Handle file deleted event
 * @param {Object} data - Event data
 * @private
 */
async function handleFileDeleted(data) {
  try {
    // Check if we should process this change
    if (!shouldProcessChange(data.path)) {
      return;
    }
    
    logger.info(`Processing deletion of file: ${data.path}`);
    
    // Add to change history
    addToChangeHistory({
      path: data.path,
      timestamp: Date.now(),
      type: 'deleted',
      analysis: {
        type: 'file-deleted'
      }
    });
    
    // Remove from file versions
    delete fileVersions[data.path];
    
    // Analyze impact if enabled
    if (CONFIG.ENABLE_IMPACT_ANALYSIS) {
      const impactAnalysis = analyzeImpact(data.path, { type: 'file-deleted' });
      
      // Emit impact analysis event
      eventBus.emit('code:impact:analyzed', {
        path: data.path,
        timestamp: Date.now(),
        impact: impactAnalysis
      });
    }
    
    // Emit change processed event
    eventBus.emit('code:change:processed', {
      path: data.path,
      timestamp: Date.now(),
      changeType: 'deleted'
    });
  } catch (error) {
    logger.error(`Error processing file deletion: ${error.message}`);
  }
}

/**
 * Check if a file change should be processed
 * @param {string} filePath - Path to the file
 * @returns {boolean} Whether the change should be processed
 * @private
 */
function shouldProcessChange(filePath) {
  // Skip node_modules, .git, and other common directories to ignore
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.cache'];
  for (const dir of ignoreDirs) {
    if (filePath.includes(`/${dir}/`)) {
      return false;
    }
  }
  
  // Skip temporary files and hidden files
  if (path.basename(filePath).startsWith('.') || path.basename(filePath).endsWith('~')) {
    return false;
  }
  
  // Skip large binary files
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4'];
  if (binaryExts.includes(ext)) {
    return false;
  }
  
  return true;
}

/**
 * Add a change to the change history
 * @param {Object} change - Change data
 * @private
 */
async function addToChangeHistory(change) {
  // Add to in-memory history
  changeHistory.unshift(change);
  
  // Trim history to configured size
  if (changeHistory.length > CONFIG.CHANGE_HISTORY_SIZE) {
    changeHistory = changeHistory.slice(0, CONFIG.CHANGE_HISTORY_SIZE);
  }
  
  // Save change history
  await saveChangeHistory();
  
  // Emit change history updated event
  eventBus.emit('code:history:updated', {
    historySize: changeHistory.length,
    latestChange: change,
    timestamp: Date.now()
  });
}

/**
 * Analyze a file change
 * @param {string} filePath - Path to the file
 * @param {string} oldContent - Previous file content
 * @param {string} newContent - Current file content
 * @returns {Object} Change analysis
 * @private
 */
function analyzeChange(filePath, oldContent, newContent) {
  // Skip if either content is too large
  if (oldContent.length > CONFIG.MAX_DIFF_SIZE || newContent.length > CONFIG.MAX_DIFF_SIZE) {
    return {
      type: 'large-file',
      oldSize: oldContent.length,
      newSize: newContent.length,
      sizeDelta: newContent.length - oldContent.length
    };
  }
  
  // Generate diff
  const changes = diff.diffLines(oldContent, newContent);
  
  // Analyze the type of change
  let addedLines = 0;
  let removedLines = 0;
  let changedLines = [];
  
  changes.forEach(change => {
    if (change.added) {
      addedLines += change.count;
      changedLines.push({
        type: 'added',
        content: change.value.substring(0, 100) + (change.value.length > 100 ? '...' : ''),
        lineCount: change.count
      });
    } else if (change.removed) {
      removedLines += change.count;
      changedLines.push({
        type: 'removed',
        content: change.value.substring(0, 100) + (change.value.length > 100 ? '...' : ''),
        lineCount: change.count
      });
    }
  });
  
  // Determine change type
  let changeType = 'unknown';
  
  // Check for structural changes (function/class definitions)
  const structuralPatterns = [
    /function\s+[\w$]+\s*\(/,  // Function definitions
    /class\s+[\w$]+/,          // Class definitions
    /export\s+(?:default\s+)?(?:function|class|const|let|var)/,  // Exports
    /import\s+.+\s+from/       // Imports
  ];
  
  let isStructural = false;
  for (const change of changedLines) {
    if (change.type === 'added' || change.type === 'removed') {
      for (const pattern of structuralPatterns) {
        if (pattern.test(change.content)) {
          isStructural = true;
          break;
        }
      }
      if (isStructural) break;
    }
  }
  
  if (isStructural) {
    changeType = 'structural';
  } else if (addedLines > 0 && removedLines > 0) {
    changeType = 'functional';
  } else if (addedLines > 0) {
    changeType = 'additive';
  } else if (removedLines > 0) {
    changeType = 'subtractive';
  } else {
    changeType = 'cosmetic';
  }
  
  return {
    type: changeType,
    addedLines,
    removedLines,
    changedLines: changedLines.slice(0, 5),  // Limit to 5 changes for brevity
    totalChanges: changes.length
  };
}

/**
 * Analyze the impact of a file change
 * @param {string} filePath - Path to the file
 * @param {Object} changeAnalysis - Change analysis
 * @returns {Object} Impact analysis
 * @private
 */
function analyzeImpact(filePath, changeAnalysis) {
  // Get components that depend on this file
  const impactedComponents = [];
  const fileKey = path.relative(process.cwd(), filePath);
  
  // Check direct dependencies
  for (const [component, dependencies] of Object.entries(dependencyGraph)) {
    if (dependencies.includes(fileKey)) {
      impactedComponents.push({
        name: component,
        confidence: 'high',
        reason: 'direct dependency'
      });
    }
  }
  
  // For structural changes, check for potential indirect impacts
  if (changeAnalysis.type === 'structural') {
    // This would involve more complex analysis in a real implementation
    // For now, we'll just identify components with similar patterns
    
    // Simplified example: if a file in a directory changes structurally,
    // other files in that directory might be impacted
    const directory = path.dirname(fileKey);
    
    for (const [component, dependencies] of Object.entries(dependencyGraph)) {
      // Skip components we've already identified
      if (impactedComponents.some(c => c.name === component)) {
        continue;
      }
      
      // Check if any dependencies are in the same directory
      for (const dep of dependencies) {
        if (path.dirname(dep) === directory) {
          impactedComponents.push({
            name: component,
            confidence: 'medium',
            reason: 'same directory as changed file'
          });
          break;
        }
      }
    }
  }
  
  return {
    impactedComponents,
    changeType: changeAnalysis.type,
    impactSeverity: changeAnalysis.type === 'structural' ? 'high' : 
                   changeAnalysis.type === 'functional' ? 'medium' : 'low',
    timestamp: Date.now()
  };
}

/**
 * Run background tests for a changed file
 * @param {string} filePath - Path to the file
 * @private
 */
async function runBackgroundTests(filePath) {
  // This would integrate with a test runner in a real implementation
  // For now, we'll just emit an event that tests would be run
  
  logger.info(`Would run background tests for: ${filePath}`);
  
  // Simulate test results
  setTimeout(() => {
    eventBus.emit('code:tests:completed', {
      path: filePath,
      timestamp: Date.now(),
      results: {
        passed: true,
        testCount: 5,
        duration: 120
      }
    });
  }, 1000);
}

/**
 * Get recent code changes
 * @param {number} limit - Maximum number of changes to return
 * @returns {Array} Recent changes
 */
function getRecentChanges(limit = 10) {
  return changeHistory.slice(0, limit);
}

/**
 * Get impact analysis for a file
 * @param {string} filePath - Path to the file
 * @returns {Object} Impact analysis
 */
function getImpactAnalysis(filePath) {
  // Find the most recent change for this file
  const recentChange = changeHistory.find(change => change.path === filePath);
  
  if (!recentChange || !recentChange.analysis) {
    return {
      impactedComponents: [],
      changeType: 'unknown',
      impactSeverity: 'unknown',
      timestamp: Date.now()
    };
  }
  
  return analyzeImpact(filePath, recentChange.analysis);
}

/**
 * Update dependency graph with a new relationship
 * @param {string} component - Component name
 * @param {string} dependency - Dependency path
 * @returns {Promise<boolean>} Success status
 */
async function addDependency(component, dependency) {
  try {
    // Initialize component if it doesn't exist
    if (!dependencyGraph[component]) {
      dependencyGraph[component] = [];
    }
    
    // Add dependency if it doesn't already exist
    if (!dependencyGraph[component].includes(dependency)) {
      dependencyGraph[component].push(dependency);
      
      // Save dependency graph
      await saveDependencyGraph();
      
      logger.info(`Added dependency: ${component} -> ${dependency}`);
      return true;
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed to add dependency: ${error.message}`);
    return false;
  }
}

/**
 * Get the dependency graph
 * @returns {Object} Dependency graph
 */
function getDependencyGraph() {
  return dependencyGraph;
}

/**
 * Get components impacted by changes in the last session
 * @returns {Array} Impacted components
 */
function getSessionImpacts() {
  // Get changes from the current session (last hour as a simple heuristic)
  const sessionStart = Date.now() - (60 * 60 * 1000);
  const sessionChanges = changeHistory.filter(change => change.timestamp >= sessionStart);
  
  // Aggregate impacts
  const impacts = {};
  
  for (const change of sessionChanges) {
    const impact = analyzeImpact(change.path, change.analysis || { type: 'unknown' });
    
    for (const component of impact.impactedComponents) {
      if (!impacts[component.name]) {
        impacts[component.name] = {
          name: component.name,
          changeCount: 1,
          highConfidenceImpacts: component.confidence === 'high' ? 1 : 0,
          mediumConfidenceImpacts: component.confidence === 'medium' ? 1 : 0,
          lowConfidenceImpacts: component.confidence === 'low' ? 1 : 0,
          reasons: [component.reason]
        };
      } else {
        impacts[component.name].changeCount++;
        if (component.confidence === 'high') impacts[component.name].highConfidenceImpacts++;
        if (component.confidence === 'medium') impacts[component.name].mediumConfidenceImpacts++;
        if (component.confidence === 'low') impacts[component.name].lowConfidenceImpacts++;
        
        if (!impacts[component.name].reasons.includes(component.reason)) {
          impacts[component.name].reasons.push(component.reason);
        }
      }
    }
  }
  
  return Object.values(impacts);
}

// Export public API
module.exports = {
  initialize,
  getRecentChanges,
  getImpactAnalysis,
  addDependency,
  getDependencyGraph,
  getSessionImpacts,
  // Expose initialization state
  get isInitialized() {
    return isInitialized;
  }
};
