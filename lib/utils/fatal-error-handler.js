// lib/utils/fatal-error-handler.js - User-Friendly Fatal Error System for Leo

const { error: logError } = require('./logger');
const os = require('os');
const path = require('path');

/**
 * User-friendly fatal error messages that hide technical complexity
 * but provide clear next steps for users
 */
const FATAL_ERROR_MESSAGES = {
  NO_LLM_AVAILABLE: {
    title: '🤖 Leo needs a language model to run',
    message: `Leo requires a language model to function, but none were found.`,
    solutions: [
      '📥 Install Ollama from https://ollama.ai',
      '🚀 Start Ollama by running: ollama serve',
      '⬇️  Download a model: ollama pull llama3.2',
      '🎯 For your Leo model: ollama pull leo-llama3-8b-merged-q4k:latest',
      '✅ Verify installation: ollama list'
    ],
    advanced: [
      'If Ollama is already running, check if it\'s accessible at http://localhost:11434',
      'For custom Leo models, ensure the model name matches exactly'
    ]
  },

  OLLAMA_NOT_RUNNING: {
    title: '📡 Cannot connect to Ollama',
    message: 'Leo cannot connect to the Ollama service.',
    solutions: [
      '🚀 Start Ollama: ollama serve',
      '🔍 Check if Ollama is running: ps aux | grep ollama',
      '🌐 Verify Ollama is accessible: curl http://localhost:11434/api/tags',
      '🔧 If using a different port, set OLLAMA_HOST environment variable'
    ],
    advanced: [
      'Check Ollama logs for startup errors',
      'Ensure port 11434 is not blocked by firewall',
      'Try restarting Ollama if it appears to be hung'
    ]
  },

  NO_MODELS_INSTALLED: {
    title: '📦 No models installed',
    message: 'Ollama is running but no language models are installed.',
    solutions: [
      '⬇️  Install a recommended model: ollama pull llama3.2',
      '🎯 For best Leo experience: ollama pull leo-llama3-8b-merged-q4k:latest',
      '📋 See available models: ollama pull --help',
      '✅ Verify installation: ollama list'
    ],
    advanced: [
      'Models are stored in your Ollama model directory',
      'Large models may take time to download',
      'Check available disk space if downloads fail'
    ]
  },

  MODEL_HEALTH_CHECK_FAILED: {
    title: '⚠️  Model not responding',
    message: 'A language model was found but is not responding properly.',
    solutions: [
      '🔄 Restart Ollama: killall ollama && ollama serve',
      '🗑️  Remove and reinstall the model: ollama rm <model> && ollama pull <model>',
      '💾 Check available system memory and disk space',
      '⏰ Wait a moment - large models take time to load'
    ],
    advanced: [
      'Check Ollama server logs for model loading errors',
      'Verify model files are not corrupted',
      'Try a smaller model if system resources are limited'
    ]
  },

  UNKNOWN_ERROR: {
    title: '❌ Unexpected error',
    message: 'Leo encountered an unexpected error during startup.',
    solutions: [
      '🔄 Try restarting Leo',
      '🔧 Restart Ollama: ollama serve',
      '🧹 Clear Leo data cache if available',
      '📞 Report this issue if problem persists'
    ],
    advanced: [
      'Check system logs for related errors',
      'Verify system has sufficient resources',
      'Try running with DEBUG=true for more information'
    ]
  }
};

/**
 * System information collector for better error diagnostics
 */
function getSystemInfo() {
  try {
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      homeDir: os.homedir(),
      cwd: process.cwd(),
      env: {
        NODE_ENV: process.env.NODE_ENV,
        OLLAMA_HOST: process.env.OLLAMA_HOST,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
        LEO_DATA_DIR: process.env.LEO_DATA_DIR
      }
    };
  } catch (err) {
    return { error: 'Could not collect system info' };
  }
}

/**
 * Detect the most likely cause of the error for better user guidance
 */
async function detectErrorCause(error, context = {}) {
  const errorMessage = error.message.toLowerCase();
  
  // Check for specific error patterns
  if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
    return 'OLLAMA_NOT_RUNNING';
  }
  
  if (errorMessage.includes('no models') || errorMessage.includes('models found')) {
    return 'NO_MODELS_INSTALLED';
  }
  
  if (errorMessage.includes('health check') || errorMessage.includes('not responding')) {
    return 'MODEL_HEALTH_CHECK_FAILED';
  }
  
  if (errorMessage.includes('no chat model') || errorMessage.includes('no suitable model')) {
    // Try to determine if it's Ollama not running or no models
    try {
      const fetch = global.fetch || require('node-fetch').default || require('node-fetch');
      await fetch('http://localhost:11434/api/tags', { timeout: 3000 });
      return 'NO_MODELS_INSTALLED';
    } catch {
      return 'OLLAMA_NOT_RUNNING';
    }
  }
  
  return 'UNKNOWN_ERROR';
}

/**
 * Create a beautifully formatted, user-friendly error display
 */
function formatErrorDisplay(errorType, systemInfo, showAdvanced = false) {
  const config = FATAL_ERROR_MESSAGES[errorType];
  const lines = [];
  
  // Header
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push(`🦁 LEO STARTUP ERROR`);
  lines.push('═'.repeat(70));
  lines.push('');
  
  // Title and message
  lines.push(`${config.title}`);
  lines.push('');
  lines.push(`${config.message}`);
  lines.push('');
  
  // Solutions
  lines.push('🛠️  How to fix this:');
  lines.push('');
  config.solutions.forEach((solution, index) => {
    lines.push(`   ${index + 1}. ${solution}`);
  });
  lines.push('');
  
  // Advanced troubleshooting (if requested)
  if (showAdvanced && config.advanced) {
    lines.push('🔧 Advanced troubleshooting:');
    lines.push('');
    config.advanced.forEach(advice => {
      lines.push(`   • ${advice}`);
    });
    lines.push('');
  }
  
  // System info (only in debug mode)
  if (process.env.DEBUG || process.env.LEO_VERBOSE_ERRORS) {
    lines.push('📋 System Information:');
    lines.push(`   Platform: ${systemInfo.platform} ${systemInfo.arch}`);
    lines.push(`   Node.js: ${systemInfo.nodeVersion}`);
    lines.push(`   Working directory: ${systemInfo.cwd}`);
    if (systemInfo.env.OLLAMA_HOST) {
      lines.push(`   Ollama host: ${systemInfo.env.OLLAMA_HOST}`);
    }
    lines.push('');
  }
  
  // Footer
  lines.push('💡 Need help? Visit: https://docs.leo-ai.dev/troubleshooting');
  lines.push('🐛 Report issues: https://github.com/leo-ai/leo/issues');
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push('');
  
  return lines.join('\n');
}

/**
 * MAIN FATAL ERROR HANDLER
 * Call this instead of process.exit(1) for user-friendly error handling
 */
async function handleFatalError(error, context = {}) {
  try {
    // Log technical details for developers/logs
    logError('[FATAL] Leo startup failed:', {
      error: error.message,
      stack: error.stack,
      context
    });
    
    // Detect error cause and get system info
    const [errorType, systemInfo] = await Promise.all([
      detectErrorCause(error, context),
      Promise.resolve(getSystemInfo())
    ]);
    
    // Show user-friendly error
    const showAdvanced = process.env.LEO_SHOW_ADVANCED_ERRORS === 'true';
    const errorDisplay = formatErrorDisplay(errorType, systemInfo, showAdvanced);
    
    // Output to user (bypassing logger to ensure visibility)
    console.error(errorDisplay);
    
    // Log error type for analytics/debugging
    logError(`[FATAL] Error classified as: ${errorType}`);
    
  } catch (displayError) {
    // Fallback if error display fails
    console.error('\n❌ Leo encountered a fatal error and cannot start.');
    console.error('Please check that Ollama is installed and running.');
    console.error('For help, visit: https://docs.leo-ai.dev/troubleshooting\n');
    
    logError('[FATAL] Error display failed:', displayError);
  }
  
  // Always exit with error code
  process.exit(1);
}

/**
 * Convenience functions for common fatal errors
 */
const fatalErrors = {
  /**
   * No LLM available - most common startup error
   */
  noLLMAvailable: (additionalContext = {}) => {
    const error = new Error('No suitable language model found');
    return handleFatalError(error, { 
      ...additionalContext, 
      errorType: 'NO_LLM_AVAILABLE' 
    });
  },

  /**
   * Ollama not running
   */
  ollamaNotRunning: (additionalContext = {}) => {
    const error = new Error('Cannot connect to Ollama service');
    return handleFatalError(error, { 
      ...additionalContext, 
      errorType: 'OLLAMA_NOT_RUNNING' 
    });
  },

  /**
   * Model health check failed
   */
  modelNotResponding: (modelName, additionalContext = {}) => {
    const error = new Error(`Model ${modelName} is not responding`);
    return handleFatalError(error, { 
      ...additionalContext, 
      modelName,
      errorType: 'MODEL_HEALTH_CHECK_FAILED' 
    });
  },

  /**
   * Generic fatal error with automatic detection
   */
  generic: (error, additionalContext = {}) => {
    return handleFatalError(error, additionalContext);
  }
};

module.exports = {
  handleFatalError,
  fatalErrors,
  FATAL_ERROR_MESSAGES
};
