/**
 * Semantic Chunker Markdown Extension
 * 
 * Provides specialized chunking for markdown files that respects semantic 
 * boundaries like headings, code blocks, and lists.
 */

const { createComponentLogger } = require('../utils/logger');

// Component name for logging
const COMPONENT_NAME = 'semantic-chunker-markdown';

// Create component logger
const logger = createComponentLogger(COMPONENT_NAME);

/**
 * Identify semantic boundaries in markdown content
 * @param {string[]} lines - Lines of markdown content
 * @param {Object} patterns - Regex patterns for markdown elements
 * @returns {Object[]} Array of boundary objects with type, start, and end indices
 */
function identifyMarkdownBoundaries(lines, patterns) {
  try {
    const boundaries = [];
    let inCodeBlock = false;
    let codeBlockStart = -1;
    let currentSection = null;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Handle code blocks
      if (patterns.codeBlock.test(line)) {
        if (!inCodeBlock) {
          // Start of code block
          inCodeBlock = true;
          codeBlockStart = i;
        } else {
          // End of code block
          inCodeBlock = false;
          boundaries.push({
            type: 'codeBlock',
            start: codeBlockStart,
            end: i,
            level: 0
          });
        }
        continue;
      }
      
      // Skip other pattern matching if we're in a code block
      if (inCodeBlock) {
        continue;
      }
      
      // Check for headings (h1 to h6)
      for (let level = 1; level <= 6; level++) {
        const headingPattern = patterns[`heading${level}`];
        if (headingPattern && headingPattern.test(line)) {
          const match = line.match(headingPattern);
          const headingText = match[1].trim();
          
          // If we have an open section, close it
          if (currentSection) {
            currentSection.end = i - 1;
            boundaries.push(currentSection);
          }
          
          // Start a new section
          currentSection = {
            type: `heading${level}`,
            start: i,
            end: lines.length - 1, // Will be updated when next heading is found
            level: level,
            text: headingText
          };
          
          break;
        }
      }
      
      // Check for horizontal rules (these can be section separators)
      if (patterns.horizontalRule && patterns.horizontalRule.test(line)) {
        if (currentSection) {
          currentSection.end = i - 1;
          boundaries.push(currentSection);
          currentSection = null;
        }
        
        boundaries.push({
          type: 'horizontalRule',
          start: i,
          end: i,
          level: 0
        });
      }
    }
    
    // Close the final section if needed
    if (currentSection) {
      boundaries.push(currentSection);
    }
    
    // Handle any unclosed code blocks
    if (inCodeBlock) {
      boundaries.push({
        type: 'codeBlock',
        start: codeBlockStart,
        end: lines.length - 1,
        level: 0
      });
    }
    
    // Create boundaries for lists and tables
    identifyListsAndTables(lines, patterns, boundaries);
    
    logger.info(`Identified ${boundaries.length} markdown boundaries`);
    return boundaries;
  } catch (error) {
    logger.error(`Error identifying markdown boundaries: ${error.message}`);
    return [];
  }
}

/**
 * Identify lists and tables in markdown content
 * @param {string[]} lines - Lines of markdown content
 * @param {Object} patterns - Regex patterns for markdown elements
 * @param {Object[]} boundaries - Array of boundary objects to update
 */
function identifyListsAndTables(lines, patterns, boundaries) {
  let inList = false;
  let listStart = -1;
  let inTable = false;
  let tableStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for list items
    if (patterns.listItem && patterns.listItem.test(line)) {
      if (!inList) {
        inList = true;
        listStart = i;
      }
    } else if (inList && line.trim() === '') {
      // Empty line ends a list
      inList = false;
      boundaries.push({
        type: 'list',
        start: listStart,
        end: i - 1,
        level: 0
      });
    }
    
    // Check for table headers and rows
    if (patterns.tableHeader && patterns.tableHeader.test(line)) {
      if (!inTable) {
        inTable = true;
        tableStart = i;
      }
    } else if (inTable && line.trim() === '') {
      // Empty line ends a table
      inTable = false;
      boundaries.push({
        type: 'table',
        start: tableStart,
        end: i - 1,
        level: 0
      });
    }
  }
  
  // Close any open list or table at the end of the file
  if (inList) {
    boundaries.push({
      type: 'list',
      start: listStart,
      end: lines.length - 1,
      level: 0
    });
  }
  
  if (inTable) {
    boundaries.push({
      type: 'table',
      start: tableStart,
      end: lines.length - 1,
      level: 0
    });
  }
}

module.exports = {
  identifyMarkdownBoundaries
};
