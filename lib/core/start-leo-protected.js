/**
 * Start Leo Runtime with Protected Memory Files
 * 
 * This script starts the Leo runtime with protection for embeddings and chunks files,
 * ensuring they won't be overwritten during initialization.
 */

const { startInteractivePrompt } = require('./lib/core/leo_unified_runtime_v_3_protected');

// Start the interactive Leo runtime
console.log('🚀 Starting Leo runtime with protected memory files...');
console.log('📝 Type your queries and press Enter. Type "exit" to quit.\n');

startInteractivePrompt();
