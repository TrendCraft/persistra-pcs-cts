/**
 * Simplified Session Awareness Testing Framework
 * 
 * This module provides a streamlined approach to validate Leo's ability 
 * to maintain cognitive continuity across token boundaries.
 * 
 * @module lib/testing/simplified-session-awareness-testing
 * @author Leo Development Team
 * @created May 13, 2025
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createComponentLogger } = require('../utils/logger');
const { sessionAwarenessAdapter } = require('../integration/session-awareness-adapter');

// Create logger
const logger = createComponentLogger('simplified-session-testing');

/**
 * Simplified Session Awareness Test
 * 
 * Provides a streamlined approach to test session awareness capabilities
 */
class SimplifiedSessionAwarenessTest {
  /**
   * Create a new simplified session awareness test
   * @param {Object} options - Test options
   * @param {string} options.testId - Test ID
   * @param {string} options.testName - Test name
   * @param {string} options.description - Test description
   * @param {number} options.sessionBoundaries - Number of session boundaries to test
   */
  constructor(options = {}) {
    this.testId = options.testId || `test_${Date.now()}_${uuidv4().substring(0, 8)}`;
    this.testName = options.testName || 'Unnamed Test';
    this.description = options.description || '';
    this.sessionBoundaries = options.sessionBoundaries || 3;
    this.currentSession = 0;
    this.assertions = [];
    this.startTime = null;
    this.initialized = false;
    
    logger.debug(`Created simplified session awareness test: ${this.testName}`);
  }
  
  /**
   * Initialize the test
   */
  async initialize() {
    if (this.initialized) {
      logger.info(`Test already initialized: ${this.testName}`);
      return;
    }
    
    logger.info(`Initializing test: ${this.testName}`);
    
    try {
      // Initialize the session awareness adapter
      await sessionAwarenessAdapter.initialize();
      
      // Store test metadata
      await sessionAwarenessAdapter.storeAwarenessData(this.testId, 'testName', this.testName);
      await sessionAwarenessAdapter.storeAwarenessData(this.testId, 'description', this.description);
      await sessionAwarenessAdapter.storeAwarenessData(this.testId, 'sessionBoundaries', this.sessionBoundaries);
      
      this.startTime = new Date();
      await sessionAwarenessAdapter.storeAwarenessData(this.testId, 'startTime', this.startTime);
      
      this.initialized = true;
      logger.info(`Test initialized successfully: ${this.testName}`);
    } catch (error) {
      logger.error(`Failed to initialize test: ${error.message}`, error);
      throw new Error(`Test initialization failed: ${error.message}`);
    }
  }
  
  /**
   * Start a new session
   */
  async startSession() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.currentSession++;
    logger.info(`Starting session ${this.currentSession} of ${this.sessionBoundaries}`);
    
    // Store current session number
    await sessionAwarenessAdapter.storeAwarenessData(this.testId, 'currentSession', this.currentSession);
    
    // Create session boundary
    await sessionAwarenessAdapter.createSessionBoundary({
      testId: this.testId,
      sessionNumber: this.currentSession,
      timestamp: new Date()
    });
    
    return this.currentSession;
  }
  
  /**
   * End the current session
   */
  async endSession() {
    logger.info(`Ending session ${this.currentSession}`);
    
    // Create session boundary
    await sessionAwarenessAdapter.createSessionBoundary({
      testId: this.testId,
      sessionNumber: this.currentSession,
      endOfSession: true,
      timestamp: new Date()
    });
  }
  
  /**
   * Store data that should persist across sessions
   * @param {string} key - Data key
   * @param {any} value - Data value
   */
  async storeData(key, value) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info(`Storing data: ${key}`);
    return await sessionAwarenessAdapter.storeAwarenessData(this.testId, key, value);
  }
  
  /**
   * Retrieve data that should have persisted across sessions
   * @param {string} key - Data key
   * @returns {Promise<any>} Retrieved data
   */
  async retrieveData(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info(`Retrieving data: ${key}`);
    return await sessionAwarenessAdapter.retrieveAwarenessData(this.testId, key);
  }
  
  /**
   * Add a test assertion
   * @param {string} name - Assertion name
   * @param {boolean} condition - Assertion condition
   * @param {string} message - Assertion message
   */
  async assert(name, condition, message) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const result = await sessionAwarenessAdapter.assert(name, condition, message);
    this.assertions.push(result);
    return result;
  }
  
  /**
   * Complete the test and generate a summary
   */
  async complete() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info(`Completing test: ${this.testName}`);
    
    const endTime = new Date();
    await sessionAwarenessAdapter.storeAwarenessData(this.testId, 'endTime', endTime);
    
    // Get all assertions
    const testSummary = await sessionAwarenessAdapter.completeTest();
    
    // Calculate success rate
    const totalAssertions = testSummary.totalAssertions || 0;
    const passedAssertions = testSummary.passedAssertions || 0;
    const successRate = totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;
    
    logger.info(`Test completed: ${this.testName}`);
    logger.info(`Success rate: ${successRate.toFixed(2)}% (${passedAssertions}/${totalAssertions})`);
    
    return {
      testId: this.testId,
      testName: this.testName,
      description: this.description,
      startTime: this.startTime,
      endTime,
      duration: endTime - this.startTime,
      sessions: this.currentSession,
      assertions: {
        total: totalAssertions,
        passed: passedAssertions,
        successRate
      },
      passed: successRate === 100
    };
  }
}

module.exports = {
  SimplifiedSessionAwarenessTest
};
