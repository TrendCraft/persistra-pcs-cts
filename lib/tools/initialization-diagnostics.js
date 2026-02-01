/**
 * Initialization Diagnostics Tool
 * 
 * This tool provides comprehensive diagnostics for Leo's initialization process,
 * helping to identify and resolve issues with component initialization,
 * dependency resolution, and configuration management.
 * 
 * It can detect:
 * - Circular dependencies
 * - Module caching issues
 * - Configuration immutability problems
 * - Initialization sequence errors
 * - Missing or improperly initialized components
 */

const { createComponentLogger } = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;

// Component name for logging
const COMPONENT_NAME = 'initialization-diagnostics';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Run comprehensive initialization diagnostics
 * @param {Object} options - Diagnostic options
 * @param {Object} options.orchestrator - Initialization orchestrator instance
 * @param {Object} options.configManager - Configuration manager instance
 * @param {Array<string>} options.componentPaths - Paths to component modules to analyze
 * @returns {Promise<Object>} Diagnostic results
 */
async function runDiagnostics(options = {}) {
  const results = {
    timestamp: Date.now(),
    issues: [],
    warnings: [],
    recommendations: []
  };
  
  logger.info('Running initialization diagnostics');
  
  // Check for required options
  if (!options.orchestrator) {
    results.issues.push({
      type: 'missing_dependency',
      message: 'Initialization orchestrator not provided'
    });
    return results;
  }
  
  // Get orchestrator diagnostics
  const orchestratorDiagnostics = options.orchestrator.getDiagnostics();
  results.orchestratorDiagnostics = orchestratorDiagnostics;
  
  // Check for initialization issues from orchestrator
  const initIssues = options.orchestrator.diagnoseInitializationIssues();
  if (initIssues.hasIssues) {
    results.issues.push(...initIssues.issues);
  }
  
  // Check for module caching issues
  await checkModuleCachingIssues(options.componentPaths || [], results);
  
  // Check for configuration immutability issues
  if (options.configManager) {
    checkConfigurationImmutabilityIssues(options.configManager, results);
  } else {
    results.warnings.push({
      type: 'missing_component',
      message: 'Configuration manager not provided, skipping configuration immutability checks'
    });
  }
  
  // Check for circular dependencies
  checkCircularDependencies(orchestratorDiagnostics.components, results);
  
  // Check for initialization sequence issues
  checkInitializationSequence(orchestratorDiagnostics.components, results);
  
  // Generate recommendations
  generateRecommendations(results);
  
  logger.info(`Diagnostics complete with ${results.issues.length} issues, ${results.warnings.length} warnings`);
  return results;
}

/**
 * Check for module caching issues
 * @param {Array<string>} componentPaths - Paths to component modules
 * @param {Object} results - Diagnostic results
 * @private
 */
async function checkModuleCachingIssues(componentPaths, results) {
  logger.info('Checking for module caching issues');
  
  const cachedModules = new Map();
  
  // Check if modules are cached multiple times
  for (const componentPath of componentPaths) {
    try {
      // Check if module is in require cache
      const resolvedPath = require.resolve(componentPath);
      const cachedModule = require.cache[resolvedPath];
      
      if (cachedModule) {
        // Check for multiple parent modules
        if (cachedModule.parents && cachedModule.parents.length > 1) {
          cachedModules.set(componentPath, {
            path: resolvedPath,
            parentCount: cachedModule.parents.length,
            parents: cachedModule.parents.map(p => p.filename)
          });
        }
      }
    } catch (error) {
      results.warnings.push({
        type: 'module_resolution_error',
        component: componentPath,
        message: `Error resolving module path: ${error.message}`
      });
    }
  }
  
  // Add issues for modules with multiple parents
  for (const [componentPath, info] of cachedModules.entries()) {
    results.warnings.push({
      type: 'module_caching_issue',
      component: componentPath,
      parentCount: info.parentCount,
      message: `Module is required by ${info.parentCount} different modules, which may cause initialization issues`
    });
  }
}

/**
 * Check for configuration immutability issues
 * @param {Object} configManager - Configuration manager
 * @param {Object} results - Diagnostic results
 * @private
 */
function checkConfigurationImmutabilityIssues(configManager, results) {
  logger.info('Checking for configuration immutability issues');
  
  // Get current configuration
  const config = configManager.getAll();
  
  // Try to modify configuration directly (this should not affect the internal state)
  const testKey = 'diagnostic_test_key';
  const testValue = Date.now();
  
  try {
    config[testKey] = testValue;
    
    // Check if the modification affected the internal state
    const modifiedConfig = configManager.getAll();
    if (modifiedConfig[testKey] === testValue) {
      results.issues.push({
        type: 'config_immutability_issue',
        message: 'Configuration is not properly protected against direct modification'
      });
    }
  } catch (error) {
    // If an error occurs, the object might be frozen (which is good)
    if (error instanceof TypeError && error.message.includes('Cannot add property')) {
      // This is expected behavior for a frozen object
    } else {
      results.warnings.push({
        type: 'config_test_error',
        message: `Error testing configuration immutability: ${error.message}`
      });
    }
  }
}

/**
 * Check for circular dependencies
 * @param {Array<Object>} components - Component information
 * @param {Object} results - Diagnostic results
 * @private
 */
function checkCircularDependencies(components, results) {
  logger.info('Checking for circular dependencies');
  
  // Build dependency graph
  const graph = new Map();
  for (const component of components) {
    graph.set(component.name, component.dependencies || []);
  }
  
  // Check for cycles using DFS
  const visited = new Set();
  const recursionStack = new Set();
  
  function detectCycle(node, path = []) {
    if (!graph.has(node)) return false;
    
    if (recursionStack.has(node)) {
      const cycle = [...path, node];
      results.issues.push({
        type: 'circular_dependency',
        components: cycle,
        message: `Circular dependency detected: ${cycle.join(' -> ')}`
      });
      return true;
    }
    
    if (visited.has(node)) return false;
    
    visited.add(node);
    recursionStack.add(node);
    
    const dependencies = graph.get(node) || [];
    for (const dependency of dependencies) {
      if (detectCycle(dependency, [...path, node])) {
        return true;
      }
    }
    
    recursionStack.delete(node);
    return false;
  }
  
  // Check each component for cycles
  for (const component of components) {
    detectCycle(component.name);
  }
}

/**
 * Check for initialization sequence issues
 * @param {Array<Object>} components - Component information
 * @param {Object} results - Diagnostic results
 * @private
 */
function checkInitializationSequence(components, results) {
  logger.info('Checking for initialization sequence issues');
  
  // Check if any component was initialized before its dependencies
  for (const component of components) {
    if (!component.initialized) continue;
    
    for (const dependency of component.dependencies || []) {
      const dependencyComponent = components.find(c => c.name === dependency);
      
      if (!dependencyComponent) {
        results.issues.push({
          type: 'missing_dependency',
          component: component.name,
          dependency,
          message: `Component ${component.name} depends on ${dependency}, but it is not registered`
        });
        continue;
      }
      
      if (!dependencyComponent.initialized) {
        results.issues.push({
          type: 'initialization_sequence_issue',
          component: component.name,
          dependency,
          message: `Component ${component.name} was initialized, but its dependency ${dependency} was not`
        });
      }
    }
  }
}

/**
 * Generate recommendations based on detected issues
 * @param {Object} results - Diagnostic results
 * @private
 */
function generateRecommendations(results) {
  logger.info('Generating recommendations');
  
  // Recommendations for circular dependencies
  const circularDependencies = results.issues.filter(issue => issue.type === 'circular_dependency');
  if (circularDependencies.length > 0) {
    results.recommendations.push({
      type: 'circular_dependency',
      message: 'Resolve circular dependencies by introducing an intermediary component or refactoring the dependency structure',
      issues: circularDependencies
    });
  }
  
  // Recommendations for module caching issues
  const cachingIssues = results.warnings.filter(warning => warning.type === 'module_caching_issue');
  if (cachingIssues.length > 0) {
    results.recommendations.push({
      type: 'module_caching',
      message: 'Use a factory pattern or dependency injection to avoid module caching issues',
      issues: cachingIssues
    });
  }
  
  // Recommendations for configuration immutability issues
  const configIssues = results.issues.filter(issue => issue.type === 'config_immutability_issue');
  if (configIssues.length > 0) {
    results.recommendations.push({
      type: 'config_immutability',
      message: 'Use deep copy or Object.freeze to protect configuration objects from modification',
      issues: configIssues
    });
  }
  
  // Recommendations for initialization sequence issues
  const sequenceIssues = results.issues.filter(issue => issue.type === 'initialization_sequence_issue');
  if (sequenceIssues.length > 0) {
    results.recommendations.push({
      type: 'initialization_sequence',
      message: 'Use the initialization orchestrator to ensure components are initialized in the correct order',
      issues: sequenceIssues
    });
  }
}

/**
 * Format diagnostic results as a readable report
 * @param {Object} results - Diagnostic results
 * @returns {string} Formatted report
 */
function formatDiagnosticReport(results) {
  let report = '=== Leo Initialization Diagnostics Report ===\n\n';
  
  report += `Timestamp: ${new Date(results.timestamp).toISOString()}\n\n`;
  
  // Add issues
  report += `Issues (${results.issues.length}):\n`;
  if (results.issues.length === 0) {
    report += '  No issues detected\n';
  } else {
    results.issues.forEach((issue, index) => {
      report += `  ${index + 1}. [${issue.type}] ${issue.message}\n`;
      if (issue.component) {
        report += `     Component: ${issue.component}\n`;
      }
      if (issue.dependency) {
        report += `     Dependency: ${issue.dependency}\n`;
      }
    });
  }
  
  report += '\n';
  
  // Add warnings
  report += `Warnings (${results.warnings.length}):\n`;
  if (results.warnings.length === 0) {
    report += '  No warnings detected\n';
  } else {
    results.warnings.forEach((warning, index) => {
      report += `  ${index + 1}. [${warning.type}] ${warning.message}\n`;
      if (warning.component) {
        report += `     Component: ${warning.component}\n`;
      }
    });
  }
  
  report += '\n';
  
  // Add recommendations
  report += `Recommendations (${results.recommendations.length}):\n`;
  if (results.recommendations.length === 0) {
    report += '  No recommendations\n';
  } else {
    results.recommendations.forEach((recommendation, index) => {
      report += `  ${index + 1}. [${recommendation.type}] ${recommendation.message}\n`;
    });
  }
  
  report += '\n';
  
  // Add orchestrator diagnostics if available
  if (results.orchestratorDiagnostics) {
    report += 'Orchestrator Diagnostics:\n';
    report += `  Initialized: ${results.orchestratorDiagnostics.initialized}\n`;
    report += `  Initializing: ${results.orchestratorDiagnostics.initializing}\n`;
    report += `  Component Count: ${results.orchestratorDiagnostics.componentCount}\n`;
    report += `  Initialization Order: ${results.orchestratorDiagnostics.initializationOrder.join(' -> ')}\n`;
    
    report += '\n  Component Status:\n';
    results.orchestratorDiagnostics.components.forEach(component => {
      report += `    ${component.name}:\n`;
      report += `      Initialized: ${component.initialized}\n`;
      report += `      Dependencies: ${component.dependencies.join(', ') || 'none'}\n`;
      if (component.initializationTime) {
        report += `      Initialization Time: ${component.initializationTime}ms\n`;
      }
      if (component.initializationError) {
        report += `      Initialization Error: ${component.initializationError}\n`;
      }
    });
  }
  
  report += '\n=== End of Report ===\n';
  
  return report;
}

/**
 * Save diagnostic results to a file
 * @param {Object} results - Diagnostic results
 * @param {string} filePath - Path to save the report
 * @returns {Promise<boolean>} Success status
 */
async function saveDiagnosticReport(results, filePath) {
  try {
    const report = formatDiagnosticReport(results);
    await fs.writeFile(filePath, report, 'utf8');
    logger.info(`Diagnostic report saved to ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Error saving diagnostic report: ${error.message}`);
    return false;
  }
}

// Export public API
module.exports = {
  runDiagnostics,
  formatDiagnosticReport,
  saveDiagnosticReport
};
