// leo2/core/analysis/codeDiffAnalyzer.js
const operationLogger = require('../logging/operationLogger');

function registerWithRegistry(registry) {
  registry.registerCapability('Code Diff Analyzer', { file: 'core/analysis/codeDiffAnalyzer.js' });
}

class CodeDiffAnalyzer {
  analyzeDiff(oldContent, newContent) {
    if (oldContent === newContent) return 'No changes';
    // Minimal: just diff by line count and changed lines
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    let changed = 0;
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) changed++;
    }
    const summary = `Changed lines: ${changed} (was ${oldLines.length} lines, now ${newLines.length} lines)`;
    operationLogger.logOperation('code_diff_analyzed', { changed, summary });
    return summary;
  }
}

module.exports = {
  CodeDiffAnalyzer,
  registerWithRegistry,
  instance: new CodeDiffAnalyzer()
};
