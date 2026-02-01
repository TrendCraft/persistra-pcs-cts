/**
 * Integration Test Suite
 * 
 * Provides comprehensive tests for validating Leo's integration
 * and cross-session awareness capabilities.
 * 
 * @module lib/integration/integration-test-suite
 * @author Leo Development Team
 * @created May 13, 2025
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { CrossSessionAwarenessTest } = require('../testing/cross-session-awareness-testing');
const { leoQueryInterface } = require('./leo-query-interface');
const { contextInjectionSystem } = require('./context-injection-system');
const { metaPromptLayer } = require('./meta-prompt-layer');
const { llmPlatformAdapter } = require('./llm-platform-adapter');
const { realTimeAwarenessConnector } = require('./real-time-awareness-connector');
const { visionAnchor } = require('../services/vision-anchor');
const { metaCognitiveLayer } = require('../services/meta-cognitive-layer');

/**
 * Integration Test Suite
 * 
 * Provides comprehensive tests for Leo's integration capabilities
 */
class IntegrationTestSuite {
  constructor(options = {}) {
    this.testId = options.testId || uuidv4();
    this.testName = options.testName || 'Integration Test Suite';
    this.description = options.description || 'Comprehensive tests for Leo integration';
    this.testDirectory = options.testDirectory || path.join(process.cwd(), 'test-results', 'integration');
    this.platform = options.platform || 'windsurf';
    this.initialized = false;
    this.testResults = [];
    
    // Ensure test directory exists
    if (!fs.existsSync(this.testDirectory)) {
      fs.mkdirSync(this.testDirectory, { recursive: true });
    }
  }

  /**
   * Initialize the test suite
   */
  async initialize() {
    if (this.initialized) {
      logger.info('Integration Test Suite already initialized');
      return;
    }
    
    logger.info(`Initializing Integration Test Suite: ${this.testName}`);
    
    try {
      // Initialize all components
      await leoQueryInterface.initialize();
      await contextInjectionSystem.initialize();
      await metaPromptLayer.initialize();
      await llmPlatformAdapter.initialize();
      await realTimeAwarenessConnector.initialize();
      await visionAnchor.initialize();
      await metaCognitiveLayer.initialize();
      
      this.initialized = true;
      logger.info('Integration Test Suite initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize Integration Test Suite: ${error.message}`, error);
      throw new Error(`Integration Test Suite initialization failed: ${error.message}`);
    }
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info('Running all integration tests');
    
    const startTime = new Date();
    this.testResults = [];
    
    try {
      // Run end-to-end flow test
      const endToEndResult = await this.testEndToEndFlow();
      this.testResults.push(endToEndResult);
      
      // Run cross-session awareness test
      const crossSessionResult = await this.testCrossSessionAwareness();
      this.testResults.push(crossSessionResult);
      
      // Run vision alignment test
      const visionAlignmentResult = await this.testVisionAlignment();
      this.testResults.push(visionAlignmentResult);
      
      // Run drift detection test
      const driftDetectionResult = await this.testDriftDetection();
      this.testResults.push(driftDetectionResult);
      
      // Run platform integration test
      const platformIntegrationResult = await this.testPlatformIntegration();
      this.testResults.push(platformIntegrationResult);
      
      const endTime = new Date();
      const duration = endTime - startTime;
      
      // Generate summary report
      const summary = {
        testId: this.testId,
        testName: this.testName,
        description: this.description,
        startTime,
        endTime,
        duration,
        totalTests: this.testResults.length,
        passedTests: this.testResults.filter(r => r.passed).length,
        failedTests: this.testResults.filter(r => !r.passed).length,
        results: this.testResults
      };
      
      // Save summary report
      const reportPath = path.join(this.testDirectory, `${this.testId}-summary.json`);
      fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
      
      logger.info(`All integration tests completed. Passed: ${summary.passedTests}/${summary.totalTests}`);
      return summary;
    } catch (error) {
      logger.error(`Error running integration tests: ${error.message}`, error);
      throw new Error(`Integration tests failed: ${error.message}`);
    }
  }

  /**
   * Test the end-to-end flow from user input to LLM response
   */
  async testEndToEndFlow() {
    logger.info('Testing end-to-end flow');
    
    const testId = `end_to_end_${Date.now()}`;
    const testResult = {
      id: testId,
      name: 'End-to-End Flow Test',
      description: 'Tests the complete flow from user input to LLM response',
      timestamp: new Date(),
      assertions: [],
      passed: false
    };
    
    try {
      // 1. Start with a user query
      const userQuery = 'How do I implement cross-session awareness in Leo?';
      
      // 2. Generate context using the Context Injection System
      const context = await contextInjectionSystem.generateContext(userQuery, {
        strategy: 'standard'
      });
      
      // Assert context was generated
      const contextAssertion = {
        name: 'Context Generation',
        passed: !!context && Array.isArray(context.contextItems) && context.contextItems.length > 0,
        message: `Context generation ${context ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(contextAssertion);
      
      // 3. Enhance the prompt using the Meta-Prompt Layer
      const enhancedPrompt = await metaPromptLayer.enhancePrompt(userQuery, {
        template: 'standard',
        contextStrategy: 'standard'
      });
      
      // Assert prompt was enhanced
      const promptAssertion = {
        name: 'Prompt Enhancement',
        passed: !!enhancedPrompt && !!enhancedPrompt.enhancedPrompt,
        message: `Prompt enhancement ${enhancedPrompt ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(promptAssertion);
      
      // 4. Process through the LLM Platform Adapter
      const platformSpecificPrompt = await llmPlatformAdapter.enhancePrompt(userQuery, {
        platform: this.platform
      });
      
      // Assert platform-specific processing
      const platformAssertion = {
        name: 'Platform Adaptation',
        passed: !!platformSpecificPrompt,
        message: `Platform adaptation ${platformSpecificPrompt ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(platformAssertion);
      
      // 5. Simulate LLM response (since we can't actually call an LLM)
      const mockLlmResponse = 'To implement cross-session awareness in Leo, you need to use the session-awareness-adapter.';
      
      // 6. Process the response through the LLM Platform Adapter
      const processedResponse = await llmPlatformAdapter.processResponse(mockLlmResponse, {
        platform: this.platform
      });
      
      // Assert response processing
      const responseAssertion = {
        name: 'Response Processing',
        passed: !!processedResponse,
        message: `Response processing ${processedResponse ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(responseAssertion);
      
      // Check if all assertions passed
      testResult.passed = testResult.assertions.every(a => a.passed);
      
      // Save detailed test results
      const resultPath = path.join(this.testDirectory, `${testId}.json`);
      fs.writeFileSync(resultPath, JSON.stringify({
        ...testResult,
        context,
        enhancedPrompt,
        platformSpecificPrompt,
        mockLlmResponse,
        processedResponse
      }, null, 2));
      
      logger.info(`End-to-end flow test ${testResult.passed ? 'passed' : 'failed'}`);
      return testResult;
    } catch (error) {
      logger.error(`End-to-end flow test failed: ${error.message}`, error);
      
      testResult.passed = false;
      testResult.error = error.message;
      
      return testResult;
    }
  }

  /**
   * Test cross-session awareness
   */
  async testCrossSessionAwareness() {
    logger.info('Testing cross-session awareness');
    
    const testId = `cross_session_${Date.now()}`;
    const testResult = {
      id: testId,
      name: 'Cross-Session Awareness Test',
      description: 'Tests Leo\'s ability to maintain awareness across multiple token boundaries',
      timestamp: new Date(),
      assertions: [],
      passed: false
    };
    
    try {
      // Create a cross-session awareness test
      const crossSessionTest = new CrossSessionAwarenessTest({
        testId,
        testName: 'Integration Cross-Session Test',
        description: 'Testing cross-session awareness in integration suite',
        sessionBoundaries: 3,
        testDirectory: this.testDirectory
      });
      
      await crossSessionTest.initialize();
      
      // Session 1: Store information
      await crossSessionTest.startSession();
      
      // Store test data
      const testData = {
        projectName: 'Leo',
        taskDescription: 'Implement cross-session awareness',
        priority: 'High',
        timestamp: new Date()
      };
      
      await crossSessionTest.storeAwarenessData('test_data', testData);
      
      // Add assertion for session 1
      await crossSessionTest.assert(
        'Session 1 Data Storage',
        true,
        'Successfully stored test data in session 1'
      );
      
      await crossSessionTest.endSession();
      
      // Session 2: Retrieve and modify information
      await crossSessionTest.startSession();
      
      // Retrieve test data
      const retrievedData = await crossSessionTest.retrieveAwarenessData('test_data');
      
      // Assert data was retrieved correctly
      await crossSessionTest.assert(
        'Session 2 Data Retrieval',
        !!retrievedData && retrievedData.projectName === 'Leo',
        'Successfully retrieved test data in session 2'
      );
      
      // Modify the data
      const modifiedData = {
        ...retrievedData,
        status: 'In Progress',
        lastModified: new Date()
      };
      
      await crossSessionTest.storeAwarenessData('test_data', modifiedData);
      
      // Add assertion for session 2
      await crossSessionTest.assert(
        'Session 2 Data Modification',
        true,
        'Successfully modified test data in session 2'
      );
      
      await crossSessionTest.endSession();
      
      // Session 3: Verify modifications persisted
      await crossSessionTest.startSession();
      
      // Retrieve modified data
      const finalData = await crossSessionTest.retrieveAwarenessData('test_data');
      
      // Assert modifications persisted
      await crossSessionTest.assert(
        'Session 3 Data Persistence',
        !!finalData && finalData.status === 'In Progress',
        'Successfully verified data modifications persisted to session 3'
      );
      
      await crossSessionTest.endSession();
      
      // Complete the test
      const testSummary = await crossSessionTest.completeTest();
      
      // Check if all assertions passed
      const allAssertionsPassed = testSummary.passedAssertions === testSummary.totalAssertions;
      
      testResult.assertions.push({
        name: 'Cross-Session Data Persistence',
        passed: allAssertionsPassed,
        message: `Cross-session awareness test ${allAssertionsPassed ? 'passed' : 'failed'} with ${testSummary.passedAssertions}/${testSummary.totalAssertions} assertions passed`
      });
      
      testResult.passed = allAssertionsPassed;
      testResult.crossSessionSummary = testSummary;
      
      logger.info(`Cross-session awareness test ${testResult.passed ? 'passed' : 'failed'}`);
      return testResult;
    } catch (error) {
      logger.error(`Cross-session awareness test failed: ${error.message}`, error);
      
      testResult.passed = false;
      testResult.error = error.message;
      
      return testResult;
    }
  }

  /**
   * Test vision alignment
   */
  async testVisionAlignment() {
    logger.info('Testing vision alignment');
    
    const testId = `vision_alignment_${Date.now()}`;
    const testResult = {
      id: testId,
      name: 'Vision Alignment Test',
      description: 'Tests the Vision Anchor\'s ability to maintain project vision alignment',
      timestamp: new Date(),
      assertions: [],
      passed: false
    };
    
    try {
      // 1. Get the project vision
      const visionSummary = await visionAnchor.getVisionSummary();
      
      // Assert vision summary was retrieved
      const visionAssertion = {
        name: 'Vision Retrieval',
        passed: !!visionSummary && !!visionSummary.summary,
        message: `Vision retrieval ${visionSummary ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(visionAssertion);
      
      // 2. Test aligned content
      const alignedContent = {
        type: 'aligned_content',
        id: 'test_aligned',
        content: `Leo is designed to maintain cognitive continuity across token boundaries. 
        It provides persistent awareness that bridges LLM sessions and ensures the project 
        vision is maintained throughout development.`
      };
      
      const alignedCheck = await visionAnchor.checkVisionAlignment(alignedContent);
      
      // Assert aligned content check
      const alignedAssertion = {
        name: 'Aligned Content Check',
        passed: !!alignedCheck && alignedCheck.isAligned === true,
        message: `Aligned content check ${alignedCheck && alignedCheck.isAligned ? 'correctly identified alignment' : 'failed to identify alignment'}`
      };
      testResult.assertions.push(alignedAssertion);
      
      // 3. Test misaligned content
      const misalignedContent = {
        type: 'misaligned_content',
        id: 'test_misaligned',
        content: `Leo should focus on improving code generation capabilities and syntax highlighting.
        The most important feature is to generate code snippets quickly without errors.`
      };
      
      const misalignedCheck = await visionAnchor.checkVisionAlignment(misalignedContent);
      
      // Assert misaligned content check
      const misalignedAssertion = {
        name: 'Misaligned Content Check',
        passed: !!misalignedCheck && misalignedCheck.isAligned === false,
        message: `Misaligned content check ${misalignedCheck && !misalignedCheck.isAligned ? 'correctly identified misalignment' : 'failed to identify misalignment'}`
      };
      testResult.assertions.push(misalignedAssertion);
      
      // 4. Test code changes alignment
      const codeChanges = [
        {
          type: 'file_change',
          filePath: '/lib/services/session-awareness-adapter.js',
          changeType: 'modify',
          summary: 'Enhanced session boundary detection'
        },
        {
          type: 'code_change',
          filePath: '/lib/services/adaptive-context-selector.js',
          description: 'Improved context selection based on token boundaries'
        }
      ];
      
      const codeAlignment = await visionAnchor.analyzeCodeChanges(codeChanges);
      
      // Assert code changes alignment
      const codeAlignmentAssertion = {
        name: 'Code Changes Alignment',
        passed: !!codeAlignment && codeAlignment.isAligned === true,
        message: `Code changes alignment check ${codeAlignment && codeAlignment.isAligned ? 'correctly identified alignment' : 'failed to identify alignment'}`
      };
      testResult.assertions.push(codeAlignmentAssertion);
      
      // 5. Test drift prevention guidance
      const guidance = await visionAnchor.getDriftPreventionGuidance();
      
      // Assert drift prevention guidance
      const guidanceAssertion = {
        name: 'Drift Prevention Guidance',
        passed: !!guidance && !!guidance.principles && guidance.principles.length > 0,
        message: `Drift prevention guidance ${guidance && guidance.principles ? 'generated successfully' : 'failed to generate'}`
      };
      testResult.assertions.push(guidanceAssertion);
      
      // Check if all assertions passed
      testResult.passed = testResult.assertions.every(a => a.passed);
      
      // Save detailed test results
      const resultPath = path.join(this.testDirectory, `${testId}.json`);
      fs.writeFileSync(resultPath, JSON.stringify({
        ...testResult,
        visionSummary,
        alignedCheck,
        misalignedCheck,
        codeAlignment,
        guidance
      }, null, 2));
      
      logger.info(`Vision alignment test ${testResult.passed ? 'passed' : 'failed'}`);
      return testResult;
    } catch (error) {
      logger.error(`Vision alignment test failed: ${error.message}`, error);
      
      testResult.passed = false;
      testResult.error = error.message;
      
      return testResult;
    }
  }

  /**
   * Test drift detection
   */
  async testDriftDetection() {
    logger.info('Testing drift detection');
    
    const testId = `drift_detection_${Date.now()}`;
    const testResult = {
      id: testId,
      name: 'Drift Detection Test',
      description: 'Tests Leo\'s ability to detect and correct vision drift during development',
      timestamp: new Date(),
      assertions: [],
      passed: false
    };
    
    try {
      // 1. Initialize real-time awareness connector
      await realTimeAwarenessConnector.initialize();
      
      // Assert initialization
      const initAssertion = {
        name: 'Real-Time Awareness Initialization',
        passed: realTimeAwarenessConnector.initialized,
        message: `Real-time awareness connector ${realTimeAwarenessConnector.initialized ? 'initialized successfully' : 'failed to initialize'}`
      };
      testResult.assertions.push(initAssertion);
      
      // 2. Simulate aligned code changes
      const alignedChanges = [
        {
          type: 'file_change',
          filePath: '/lib/services/session-awareness-adapter.js',
          changeType: 'modify',
          description: 'Enhanced session boundary detection',
          timestamp: new Date()
        },
        {
          type: 'code_change',
          filePath: '/lib/services/adaptive-context-selector.js',
          description: 'Improved context selection based on token boundaries',
          timestamp: new Date(Date.now() - 60000) // 1 minute ago
        }
      ];
      
      // Simulate file change events
      for (const change of alignedChanges) {
        await realTimeAwarenessConnector.handleFileChange(change);
      }
      
      // Force analysis
      const alignedAnalysis = await realTimeAwarenessConnector.forceAnalysis();
      
      // Assert aligned changes analysis
      const alignedAnalysisAssertion = {
        name: 'Aligned Changes Analysis',
        passed: !!alignedAnalysis && alignedAnalysis.driftDetected === false,
        message: `Aligned changes analysis ${alignedAnalysis && !alignedAnalysis.driftDetected ? 'correctly identified no drift' : 'failed to analyze correctly'}`
      };
      testResult.assertions.push(alignedAnalysisAssertion);
      
      // 3. Simulate misaligned code changes
      const misalignedChanges = [
        {
          type: 'file_change',
          filePath: '/lib/services/code-generator.js',
          changeType: 'add',
          description: 'Added new code generator service',
          timestamp: new Date()
        },
        {
          type: 'code_change',
          filePath: '/lib/services/syntax-highlighter.js',
          description: 'Implemented syntax highlighting for code snippets',
          timestamp: new Date(Date.now() - 30000) // 30 seconds ago
        },
        {
          type: 'code_change',
          filePath: '/lib/services/code-completion.js',
          description: 'Added code completion suggestions',
          timestamp: new Date(Date.now() - 90000) // 90 seconds ago
        }
      ];
      
      // Clear previous observations
      metaCognitiveLayer.observations = [];
      
      // Simulate file change events
      for (const change of misalignedChanges) {
        await realTimeAwarenessConnector.handleFileChange(change);
      }
      
      // Force analysis
      const misalignedAnalysis = await realTimeAwarenessConnector.forceAnalysis();
      
      // Assert misaligned changes analysis
      const misalignedAnalysisAssertion = {
        name: 'Misaligned Changes Analysis',
        passed: !!misalignedAnalysis && misalignedAnalysis.driftDetected === true,
        message: `Misaligned changes analysis ${misalignedAnalysis && misalignedAnalysis.driftDetected ? 'correctly identified drift' : 'failed to detect drift'}`
      };
      testResult.assertions.push(misalignedAnalysisAssertion);
      
      // 4. Test context injection with drift warning
      if (misalignedAnalysis && misalignedAnalysis.driftDetected) {
        const context = await contextInjectionSystem.generateContext('How do I implement code generation?', {
          strategy: 'development-flow'
        });
        
        // Check if drift warning is included
        const hasDriftWarning = context.contextItems.some(item => 
          item.type === 'drift_awareness' || item.title === 'Drift Detection Warning'
        );
        
        // Assert drift warning in context
        const driftWarningAssertion = {
          name: 'Drift Warning in Context',
          passed: hasDriftWarning,
          message: `Drift warning ${hasDriftWarning ? 'correctly included in context' : 'missing from context'}`
        };
        testResult.assertions.push(driftWarningAssertion);
      }
      
      // Check if all assertions passed
      testResult.passed = testResult.assertions.every(a => a.passed);
      
      // Save detailed test results
      const resultPath = path.join(this.testDirectory, `${testId}.json`);
      fs.writeFileSync(resultPath, JSON.stringify({
        ...testResult,
        alignedChanges,
        alignedAnalysis,
        misalignedChanges,
        misalignedAnalysis
      }, null, 2));
      
      logger.info(`Drift detection test ${testResult.passed ? 'passed' : 'failed'}`);
      return testResult;
    } catch (error) {
      logger.error(`Drift detection test failed: ${error.message}`, error);
      
      testResult.passed = false;
      testResult.error = error.message;
      
      return testResult;
    }
  }

  /**
   * Test platform integration
   */
  async testPlatformIntegration() {
    logger.info(`Testing platform integration for ${this.platform}`);
    
    const testId = `platform_integration_${Date.now()}`;
    const testResult = {
      id: testId,
      name: 'Platform Integration Test',
      description: `Tests Leo's integration with the ${this.platform} platform`,
      timestamp: new Date(),
      assertions: [],
      passed: false
    };
    
    try {
      // 1. Check available platforms
      const availablePlatforms = llmPlatformAdapter.getAvailablePlatforms();
      
      // Assert platform availability
      const platformAvailableAssertion = {
        name: 'Platform Availability',
        passed: availablePlatforms.includes(this.platform),
        message: `Platform ${this.platform} ${availablePlatforms.includes(this.platform) ? 'is available' : 'is not available'}`
      };
      testResult.assertions.push(platformAvailableAssertion);
      
      // 2. Test platform-specific prompt enhancement
      const userQuery = 'How do I implement cross-session awareness?';
      const enhancedPrompt = await llmPlatformAdapter.enhancePrompt(userQuery, {
        platform: this.platform
      });
      
      // Assert prompt enhancement
      const promptEnhancementAssertion = {
        name: 'Platform-Specific Prompt Enhancement',
        passed: !!enhancedPrompt,
        message: `Platform-specific prompt enhancement ${enhancedPrompt ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(promptEnhancementAssertion);
      
      // 3. Test platform-specific response processing
      const mockResponse = 'To implement cross-session awareness, use the session-awareness-adapter.';
      const processedResponse = await llmPlatformAdapter.processResponse(mockResponse, {
        platform: this.platform
      });
      
      // Assert response processing
      const responseProcessingAssertion = {
        name: 'Platform-Specific Response Processing',
        passed: !!processedResponse,
        message: `Platform-specific response processing ${processedResponse ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(responseProcessingAssertion);
      
      // 4. Test platform-specific query handling
      const query = {
        type: 'system.getCapabilities'
      };
      
      const queryResult = await llmPlatformAdapter.handleQuery(query, {
        platform: this.platform
      });
      
      // Assert query handling
      const queryHandlingAssertion = {
        name: 'Platform-Specific Query Handling',
        passed: !!queryResult && queryResult.success === true,
        message: `Platform-specific query handling ${queryResult && queryResult.success ? 'succeeded' : 'failed'}`
      };
      testResult.assertions.push(queryHandlingAssertion);
      
      // Check if all assertions passed
      testResult.passed = testResult.assertions.every(a => a.passed);
      
      // Save detailed test results
      const resultPath = path.join(this.testDirectory, `${testId}.json`);
      fs.writeFileSync(resultPath, JSON.stringify({
        ...testResult,
        availablePlatforms,
        enhancedPrompt,
        processedResponse,
        queryResult
      }, null, 2));
      
      logger.info(`Platform integration test ${testResult.passed ? 'passed' : 'failed'}`);
      return testResult;
    } catch (error) {
      logger.error(`Platform integration test failed: ${error.message}`, error);
      
      testResult.passed = false;
      testResult.error = error.message;
      
      return testResult;
    }
  }
}

module.exports = {
  IntegrationTestSuite
};
