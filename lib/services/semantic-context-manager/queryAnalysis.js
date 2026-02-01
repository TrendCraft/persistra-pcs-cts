/**
 * Query analysis and intent detection utilities
 * @module queryAnalysis
 * @todo Add more analyzers as needed
 */

/**
 * Analyze a query for intent and type.
 * Stateless—does not access global/module state.
 * @param {string} query
 * @returns {object}
 */
function analyzeQuery(query) {
  const lowerQuery = typeof query === 'string' ? query.toLowerCase() : '';
  const codeKeywords = [
    'function', 'class', 'method', 'variable', 'import', 'export',
    'parameter', 'return', 'code', 'implementation', 'syntax',
    'api', 'interface', 'module', 'component', 'algorithm'
  ];
  const isCodeQuery = codeKeywords.some(keyword => lowerQuery.includes(keyword)) ||
    /\bcode\b|\bfunction\b|\bclass\b|\bmethod\b|\bimplementation\b/.test(lowerQuery);
  const isExplanatoryQuery = lowerQuery.startsWith('how') || 
    lowerQuery.startsWith('explain') || 
    lowerQuery.startsWith('what is') ||
    lowerQuery.includes('describe') ||
    lowerQuery.includes('explain');
  const isFileSpecificQuery = lowerQuery.includes('.js') || 
    lowerQuery.includes('.py') || 
    lowerQuery.includes('.md') ||
    lowerQuery.includes('file') ||
    lowerQuery.includes('directory') ||
    lowerQuery.includes('path');
  const targetFile = isFileSpecificQuery ? lowerQuery.split(' ').pop() : null;
  return {
    type: isCodeQuery ? 'code' : isExplanatoryQuery ? 'explanatory' : 'unknown',
    isCodeQuery,
    isDocumentationQuery: isExplanatoryQuery,
    isStructuralQuery: isFileSpecificQuery,
    confidence: isCodeQuery || isExplanatoryQuery || isFileSpecificQuery ? 0.8 : 0.2,
    targetFile
  };
}

module.exports = {
  analyzeQuery
};
