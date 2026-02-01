/**
 * Cross-Session Awareness Testing Framework
 * 
 * This module provides tools to validate Leo's ability to maintain
 * cognitive continuity across token boundaries.
 * 
 * @module lib/testing/cross-session-awareness-testing
 * @author Leo Development Team
 * @created May 13, 2025
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { sessionAwarenessAdapter } = require('../integration/session-awareness-adapter');
const { memoryManager } = require('../services/memory-manager');
const { adaptiveContextSelector } = require('../services/adaptive-context-selector');

class CrossSessionAwarenessTest {
  constructor(options = {}) {
    this.testId = options.testId || uuidv4();
    this.testName = options.testName || 'Unnamed Test';
    this.description = options.description || '';
    this.sessionBoundaries = options.sessionBoundaries || 3; // Default test across 3 boundaries
    this.currentSession = 0;
    this.testScenario = options.testScenario || {};
    this.results = [];
    this.startTime = null;
    this.endTime = null;
    this.testDirectory = options.testDirectory || path.join(process.cwd(), 'test-results', 'cross-session');
    this.testState = {};
    this.initialized = false;
    
    // Ensure test directory exists
    if (!fs.existsSync(this.testDirectory)) {
      fs.mkdirSync(this.testDirectory, { recursive: true });
    }
  }

  /**
   * Initialize the test framework
   */
  async initialize() {
    if (this.initialized) {
      logger.info(`Test framework already initialized: ${this.testName}`);
      return;
    }

    logger.info(`Initializing cross-session awareness test: ${this.testName}`);
    
    try {
      // Initialize required components
      await sessionAwarenessAdapter.initialize();
      await memoryManager.initialize();
      await adaptiveContextSelector.initialize();
      
      this.startTime = new Date();
      this.initialized = true;
      
      // Create test state file
      this.saveTestState({
        testId: this.testId,
        testName: this.testName,
        description: this.description,
        sessionBoundaries: this.sessionBoundaries,
        currentSession: this.currentSession,
        startTime: this.startTime,
        scenario: this.testScenario,
        results: this.results
      });
      
      logger.info(`Test framework initialized successfully: ${this.testName}`);
    } catch (error) {
      logger.error(`Failed to initialize test framework: ${error.message}`, error);
      throw new Error(`Test framework initialization failed: ${error.message}`);
    }
  }

  /**
   * Start a new session within the test
   */
  async startSession() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.currentSession++;
    logger.info(`Starting test session ${this.currentSession} of ${this.sessionBoundaries}`);
    
    // Create session boundary marker
    await sessionAwarenessAdapter.createSessionBoundary({
      testId: this.testId,
      sessionNumber: this.currentSession,
      timestamp: new Date()
    });
    
    // Update test state
    this.testState.currentSession = this.currentSession;
    this.saveTestState(this.testState);
    
    return this.currentSession;
  }

  /**
   * End the current session
   */
  async endSession(sessionResults = {}) {
    logger.info(`Ending test session ${this.currentSession}`);
    
    // Record results for this session
    const sessionResult = {
      sessionNumber: this.currentSession,
      timestamp: new Date(),
      results: sessionResults
    };
    
    this.results.push(sessionResult);
    
    // Update test state
    this.testState.results = this.results;
    this.saveTestState(this.testState);
    
    // Create session boundary marker
    await sessionAwarenessAdapter.createSessionBoundary({
      testId: this.testId,
      sessionNumber: this.currentSession,
      endOfSession: true,
      timestamp: new Date()
    });
    
    return sessionResult;
  }

  /**
   * Add a test assertion to the current session
   */
  async assert(name, condition, message) {
    const assertion = {
      name,
      passed: !!condition,
      message: message || `Assertion ${condition ? 'passed' : 'failed'}: ${name}`,
      timestamp: new Date()
    };
    
    logger.info(`Test assertion: ${assertion.message}`);
    
    // Ensure we have a results array for the current session
    if (!this.results[this.currentSession - 1]) {
      this.results[this.currentSession - 1] = {
        sessionNumber: this.currentSession,
        timestamp: new Date(),
        results: { assertions: [] }
      };
    }
    
    // Add the assertion to the current session
    if (!this.results[this.currentSession - 1].results.assertions) {
      this.results[this.currentSession - 1].results.assertions = [];
    }
    
    this.results[this.currentSession - 1].results.assertions.push(assertion);
    
    // Update test state
    this.testState.results = this.results;
    this.saveTestState(this.testState);
    
    return assertion;
  }

  /**
   * Store a piece of information that should persist across sessions
   */
  async storeAwarenessData(key, data) {
    logger.info(`Storing awareness data: ${key}`);
    
    // Store in session awareness adapter
    await sessionAwarenessAdapter.storeData(this.testId, key, data);
    
    // Also store in memory manager for redundancy
    await memoryManager.storeMemory({
      type: 'test_awareness_data',
      testId: this.testId,
      key,
      data
    });
    
    return true;
  }

  /**
   * Retrieve data that should have persisted across sessions
   */
  async retrieveAwarenessData(key) {
    logger.info(`Retrieving awareness data: ${key}`);
    
    // Try to get from session awareness adapter first
    try {
      const data = await sessionAwarenessAdapter.retrieveData(this.testId, key);
      if (data) {
        return data;
      }
    } catch (error) {
      logger.warn(`Failed to retrieve data from session awareness adapter: ${error.message}`);
    }
    
    // Fall back to memory manager
    try {
      const memories = await memoryManager.retrieveMemories({
        type: 'test_awareness_data',
        testId: this.testId,
        key
      });
      
      if (memories && memories.length > 0) {
        // Return the most recent memory
        return memories[0].data;
      }
    } catch (error) {
      logger.warn(`Failed to retrieve data from memory manager: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Complete the test and generate a report
   */
  async completeTest() {
    logger.info(`Completing test: ${this.testName}`);
    
    this.endTime = new Date();
    
    // Calculate test results
    const totalAssertions = this.results.reduce((count, session) => {
      return count + (session.results.assertions ? session.results.assertions.length : 0);
    }, 0);
    
    const passedAssertions = this.results.reduce((count, session) => {
      return count + (session.results.assertions ? 
        session.results.assertions.filter(a => a.passed).length : 0);
    }, 0);
    
    const successRate = totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;
    
    const summary = {
      testId: this.testId,
      testName: this.testName,
      description: this.description,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime - this.startTime,
      sessionBoundaries: this.sessionBoundaries,
      sessionsCompleted: this.currentSession,
      totalAssertions,
      passedAssertions,
      successRate,
      results: this.results
    };
    
    // Save final report
    const reportPath = path.join(this.testDirectory, `${this.testId}-report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    
    logger.info(`Test completed. Success rate: ${successRate.toFixed(2)}%. Report saved to: ${reportPath}`);
    
    return summary;
  }

  /**
   * Save the current test state
   */
  saveTestState(state) {
    this.testState = state;
    const statePath = path.join(this.testDirectory, `${this.testId}-state.json`);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Load a test from a previous state
   */
  static async loadTest(testId, testDirectory) {
    const directory = testDirectory || path.join(process.cwd(), 'test-results', 'cross-session');
    const statePath = path.join(directory, `${testId}-state.json`);
    
    if (!fs.existsSync(statePath)) {
      throw new Error(`Test state not found: ${testId}`);
    }
    
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    
    const test = new CrossSessionAwarenessTest({
      testId: state.testId,
      testName: state.testName,
      description: state.description,
      sessionBoundaries: state.sessionBoundaries,
      testDirectory: directory,
      testScenario: state.scenario
    });
    
    test.currentSession = state.currentSession;
    test.results = state.results;
    test.startTime = new Date(state.startTime);
    test.testState = state;
    
    await test.initialize();
    
    return test;
  }
}

// Test scenario definitions
const TestScenarios = {
  CODE_MODIFICATION: {
    name: 'Code Modification Awareness',
    description: 'Tests Leo\'s ability to maintain awareness of code modifications across sessions',
    setup: async (test) => {
      // Setup code for this scenario
    }
  },
  
  PROJECT_VISION: {
    name: 'Project Vision Awareness',
    description: 'Tests Leo\'s ability to maintain awareness of project vision across sessions',
    setup: async (test) => {
      // Setup code for this scenario
    }
  },
  
  USER_PREFERENCES: {
    name: 'User Preferences Awareness',
    description: 'Tests Leo\'s ability to maintain awareness of user preferences across sessions',
    setup: async (test) => {
      // Setup code for this scenario
    }
  },
  
  DEVELOPMENT_TRAJECTORY: {
    name: 'Development Trajectory Awareness',
    description: 'Tests Leo\'s ability to maintain awareness of development trajectory across sessions',
    setup: async (test) => {
      // Setup code for this scenario
    }
  }
};

module.exports = {
  CrossSessionAwarenessTest,
  TestScenarios
};
