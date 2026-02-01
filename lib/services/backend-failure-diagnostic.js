/**
 * Backend Failure Diagnostic
 *
 * Since the dependency files exist but are failing, this will show us
 * EXACTLY where and why they're failing during initialization/testing.
 */

class BackendFailureDiagnostic {
  constructor() {
    this.results = {
      transformer: { exists: false, loadable: false, initializable: false, testable: false, error: null },
      localSemantic: { exists: false, loadable: false, initializable: false, testable: false, error: null },
      localSearch: { exists: false, loadable: false, initializable: false, testable: false, error: null }
    };
  }

  async runDiagnostic() {
    console.log('🔍 Backend Failure Diagnostic');
    console.log('=============================');
    console.log('The files exist but backends are failing. Let\'s find out exactly where...\n');

    // Test each backend in isolation
    await this.testTransformerBackend();
    await this.testLocalSemanticBackend();
    await this.testLocalSearchBackend();
    
    // Summary and recommendations
    this.provideSummary();
    
    // Test TSE initialization with detailed logging
    await this.testTSEInitialization();
  }

  async testTransformerBackend() {
    console.log('🧪 Testing transformer-semantic-embeddings.js');
    console.log('================================================');
    
    const result = this.results.transformer;
    
    // Step 1: File exists
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, './transformer-semantic-embeddings.js');
      result.exists = fs.existsSync(filePath);
      console.log(`   File exists: ${result.exists ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`   File check failed: ${error.message}`);
    }

    if (!result.exists) {
      console.log('   ❌ Skipping further tests - file does not exist\n');
      return;
    }

    // Step 2: Loadable (require works)
    try {
      const transformer = require('./transformer-semantic-embeddings');
      result.loadable = true;
      console.log('   Require works: ✅');
      
      // Check structure
      console.log(`   Has initialize method: ${typeof transformer.initialize === 'function' ? '✅' : '❌'}`);
      console.log(`   Has generate method: ${typeof transformer.generate === 'function' ? '✅' : '❌'}`);
      
    } catch (error) {
      result.error = error;
      console.log(`   Require failed: ❌ - ${error.message}`);
      console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      console.log('   ❌ Skipping further tests - module load failed\n');
      return;
    }

    // Step 3: Initialize
    try {
      const transformer = require('./transformer-semantic-embeddings');
      console.log('   Attempting initialization...');
      
      const initResult = await transformer.initialize();
      result.initializable = true;
      console.log(`   Initialize returned: ${JSON.stringify(initResult)}`);
      console.log('   Initialize succeeded: ✅');
      
    } catch (error) {
      result.error = error;
      console.log(`   Initialize failed: ❌ - ${error.message}`);
      console.log(`   Error type: ${error.constructor.name}`);
      console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }

    // Step 4: Test embedding generation
    if (result.initializable) {
      try {
        const transformer = require('./transformer-semantic-embeddings');
        console.log('   Attempting test embedding generation...');
        
        const testVec = await transformer.generate('test embedding for transformer backend');
        
        console.log(`   Generated vector type: ${typeof testVec}`);
        console.log(`   Is array: ${Array.isArray(testVec)}`);
        console.log(`   Length: ${testVec?.length || 'N/A'}`);
        console.log(`   Sample values: [${testVec?.slice(0, 5).map(x => x?.toFixed(4)).join(', ') || 'N/A'}]`);
        console.log(`   Has non-zero values: ${testVec?.some(x => x !== 0) || false}`);
        console.log(`   All same values: ${testVec?.every(x => x === testVec[0]) || false}`);
        
        // TSE validation criteria
        const expectedDim = 384; // Default from TSE
        const isValidForTSE = (
          Array.isArray(testVec) && 
          testVec.length === expectedDim && 
          testVec.some(x => x !== 0)
        );
        
        result.testable = isValidForTSE;
        console.log(`   Passes TSE validation: ${isValidForTSE ? '✅' : '❌'}`);
        
        if (!isValidForTSE) {
          console.log(`   ❌ TSE will reject this backend because:`);
          if (!Array.isArray(testVec)) console.log(`      - Not an array`);
          if (testVec?.length !== expectedDim) console.log(`      - Wrong dimensions (${testVec?.length} vs ${expectedDim})`);
          if (!testVec?.some(x => x !== 0)) console.log(`      - All zeros`);
        }
        
      } catch (error) {
        result.error = error;
        console.log(`   Test embedding failed: ❌ - ${error.message}`);
        console.log(`   Error type: ${error.constructor.name}`);
        console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
    
    console.log('');
  }

  async testLocalSemanticBackend() {
    console.log('🧪 Testing local-semantic-embeddings.js');
    console.log('========================================');
    
    const result = this.results.localSemantic;
    
    // Step 1: File exists
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, './local-semantic-embeddings.js');
      result.exists = fs.existsSync(filePath);
      console.log(`   File exists: ${result.exists ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`   File check failed: ${error.message}`);
    }

    if (!result.exists) {
      console.log('   ❌ Skipping further tests - file does not exist\n');
      return;
    }

    // Step 2: Loadable (require works)
    let localSemanticEmbeddings = null;
    try {
      const module = require('./local-semantic-embeddings');
      localSemanticEmbeddings = module.localSemanticEmbeddings;
      result.loadable = true;
      console.log('   Require works: ✅');
      
      // Check structure
      console.log(`   localSemanticEmbeddings object exists: ${localSemanticEmbeddings ? '✅' : '❌'}`);
      if (localSemanticEmbeddings) {
        console.log(`   Has initialize method: ${typeof localSemanticEmbeddings.initialize === 'function' ? '✅' : '❌'}`);
        console.log(`   Has generate method: ${typeof localSemanticEmbeddings.generate === 'function' ? '✅' : '❌'}`);
        console.log(`   Has isInitialized method: ${typeof localSemanticEmbeddings.isInitialized === 'function' ? '✅' : '❌'}`);
      }
      
    } catch (error) {
      result.error = error;
      console.log(`   Require failed: ❌ - ${error.message}`);
      console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      console.log('   ❌ Skipping further tests - module load failed\n');
      return;
    }

    if (!localSemanticEmbeddings) {
      console.log('   ❌ localSemanticEmbeddings object is null/undefined\n');
      return;
    }

    // Step 3: Initialize
    try {
      console.log('   Attempting initialization...');
      
      const initResult = await localSemanticEmbeddings.initialize();
      console.log(`   Initialize returned: ${JSON.stringify(initResult)}`);
      
      const isInitialized = localSemanticEmbeddings.isInitialized();
      result.initializable = isInitialized;
      console.log(`   isInitialized() returns: ${isInitialized}`);
      console.log(`   Initialize succeeded: ${result.initializable ? '✅' : '❌'}`);
      
    } catch (error) {
      result.error = error;
      console.log(`   Initialize failed: ❌ - ${error.message}`);
      console.log(`   Error type: ${error.constructor.name}`);
      console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }

    // Step 4: Test embedding generation
    if (result.initializable) {
      try {
        console.log('   Attempting test embedding generation...');
        
        const testVec = await localSemanticEmbeddings.generate('test embedding for local semantic backend');
        
        console.log(`   Generated vector type: ${typeof testVec}`);
        console.log(`   Is array: ${Array.isArray(testVec)}`);
        console.log(`   Length: ${testVec?.length || 'N/A'}`);
        console.log(`   Sample values: [${testVec?.slice(0, 5).map(x => x?.toFixed(4)).join(', ') || 'N/A'}]`);
        console.log(`   Has non-zero values: ${testVec?.some(x => x !== 0) || false}`);
        console.log(`   All same values: ${testVec?.every(x => x === testVec[0]) || false}`);
        
        // TSE validation criteria
        const expectedDim = 384;
        const isValidForTSE = (
          localSemanticEmbeddings.isInitialized() &&
          Array.isArray(testVec) && 
          testVec.length === expectedDim && 
          testVec.some(x => x !== 0)
        );
        
        result.testable = isValidForTSE;
        console.log(`   Passes TSE validation: ${isValidForTSE ? '✅' : '❌'}`);
        
        if (!isValidForTSE) {
          console.log(`   ❌ TSE will reject this backend because:`);
          if (!localSemanticEmbeddings.isInitialized()) console.log(`      - isInitialized() is false`);
          if (!Array.isArray(testVec)) console.log(`      - Not an array`);
          if (testVec?.length !== expectedDim) console.log(`      - Wrong dimensions (${testVec?.length} vs ${expectedDim})`);
          if (!testVec?.some(x => x !== 0)) console.log(`      - All zeros`);
        }
        
      } catch (error) {
        result.error = error;
        console.log(`   Test embedding failed: ❌ - ${error.message}`);
        console.log(`   Error type: ${error.constructor.name}`);
        console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
    
    console.log('');
  }

  async testLocalSearchBackend() {
    console.log('🧪 Testing local-semantic-search.js');
    console.log('====================================');
    
    const result = this.results.localSearch;
    
    // Step 1: File exists
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, './local-semantic-search.js');
      result.exists = fs.existsSync(filePath);
      console.log(`   File exists: ${result.exists ? '✅' : '❌'}`);
    } catch (error) {
      console.log(`   File check failed: ${error.message}`);
    }

    if (!result.exists) {
      console.log('   ❌ Skipping further tests - file does not exist\n');
      return;
    }

    // Step 2: Loadable (require works)
    let localSemanticSearch = null;
    try {
      const module = require('./local-semantic-search');
      localSemanticSearch = module.localSemanticSearch;
      result.loadable = true;
      console.log('   Require works: ✅');
      
      // Check structure
      console.log(`   localSemanticSearch object exists: ${localSemanticSearch ? '✅' : '❌'}`);
      if (localSemanticSearch) {
        console.log(`   Has initialize method: ${typeof localSemanticSearch.initialize === 'function' ? '✅' : '❌'}`);
        console.log(`   Has generateEmbedding method: ${typeof localSemanticSearch.generateEmbedding === 'function' ? '✅' : '❌'}`);
      }
      
    } catch (error) {
      result.error = error;
      console.log(`   Require failed: ❌ - ${error.message}`);
      console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      console.log('   ❌ Skipping further tests - module load failed\n');
      return;
    }

    if (!localSemanticSearch) {
      console.log('   ❌ localSemanticSearch object is null/undefined\n');
      return;
    }

    // Step 3: Initialize
    try {
      console.log('   Attempting initialization...');
      
      const initResult = await localSemanticSearch.initialize();
      console.log(`   Initialize returned: ${JSON.stringify(initResult)}`);
      
      result.initializable = localSemanticSearch.initialized;
      console.log(`   initialized property: ${localSemanticSearch.initialized}`);
      console.log(`   Initialize succeeded: ${result.initializable ? '✅' : '❌'}`);
      
    } catch (error) {
      result.error = error;
      console.log(`   Initialize failed: ❌ - ${error.message}`);
      console.log(`   Error type: ${error.constructor.name}`);
      console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }

    // Step 4: Test embedding generation
    if (result.initializable && localSemanticSearch.generateEmbedding) {
      try {
        console.log('   Attempting test embedding generation...');
        
        const testVec = await localSemanticSearch.generateEmbedding('test embedding for local search backend');
        
        console.log(`   Generated vector type: ${typeof testVec}`);
        console.log(`   Is array: ${Array.isArray(testVec)}`);
        console.log(`   Length: ${testVec?.length || 'N/A'}`);
        console.log(`   Sample values: [${testVec?.slice(0, 5).map(x => x?.toFixed(4)).join(', ') || 'N/A'}]`);
        console.log(`   Has non-zero values: ${testVec?.some(x => x !== 0) || false}`);
        
        // TSE validation criteria
        const expectedDim = 384;
        const isValidForTSE = (
          localSemanticSearch.initialized &&
          Array.isArray(testVec) && 
          testVec.length === expectedDim && 
          testVec.some(x => x !== 0)
        );
        
        result.testable = isValidForTSE;
        console.log(`   Passes TSE validation: ${isValidForTSE ? '✅' : '❌'}`);
        
        if (!isValidForTSE) {
          console.log(`   ❌ TSE will reject this backend because:`);
          if (!localSemanticSearch.initialized) console.log(`      - initialized property is false`);
          if (!Array.isArray(testVec)) console.log(`      - Not an array`);
          if (testVec?.length !== expectedDim) console.log(`      - Wrong dimensions (${testVec?.length} vs ${expectedDim})`);
          if (!testVec?.some(x => x !== 0)) console.log(`      - All zeros`);
        }
        
      } catch (error) {
        result.error = error;
        console.log(`   Test embedding failed: ❌ - ${error.message}`);
        console.log(`   Error type: ${error.constructor.name}`);
        console.log(`   Stack trace: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
    
    console.log('');
  }

  provideSummary() {
    console.log('📊 Summary of Backend Test Results');
    console.log('==================================');
    
    const backends = [
      { name: 'Transformer', result: this.results.transformer },
      { name: 'Local Semantic', result: this.results.localSemantic },
      { name: 'Local Search', result: this.results.localSearch }
    ];
    
    backends.forEach(({ name, result }) => {
      console.log(`\n${name} Backend:`);
      console.log(`   Exists: ${result.exists ? '✅' : '❌'}`);
      console.log(`   Loadable: ${result.loadable ? '✅' : '❌'}`);
      console.log(`   Initializable: ${result.initializable ? '✅' : '❌'}`);
      console.log(`   Testable: ${result.testable ? '✅' : '❌'}`);
      if (result.error) {
        console.log(`   Error: ${result.error.message}`);
      }
    });
    
    // Determine why TSE is falling back to hash
    const workingBackends = backends.filter(b => b.result.testable);
    
    if (workingBackends.length === 0) {
      console.log('\n❌ PROBLEM IDENTIFIED: No backends pass all tests');
      console.log('   This is why TSE falls back to hash embeddings!');
      console.log('   Hash embeddings are semantically meaningless.');
    } else {
      console.log(`\n✅ ${workingBackends.length} backend(s) should work`);
      console.log('   If TSE is still using hash, there may be an initialization order issue.');
    }
  }

  async testTSEInitialization() {
    console.log('\n🔧 Testing TSE Initialization with Detailed Logging');
    console.log('===================================================');
    
    try {
      // Load TSE fresh
      delete require.cache[require.resolve('./true-semantic-embeddings')];
      const tse = require('./true-semantic-embeddings');
      
      console.log('   Loading TSE...');
      console.log('   Calling initialize...');
      
      await tse.initialize();
      
      const backend = tse._getBackend();
      const backendType = tse._getBackendType();
      
      console.log(`   Backend selected: ${backendType || 'NONE'}`);
      console.log(`   Backend object: ${backend ? 'Present' : 'NULL'}`);
      
      if (backendType === 'fallback-hash-only') {
        console.log('   ❌ TSE fell back to hash embeddings despite working backends!');
        console.log('   This suggests an initialization timing or order issue.');
      } else {
        console.log(`   ✅ TSE selected working backend: ${backendType}`);
      }
      
      // Test actual embedding generation
      console.log('   Testing TSE embedding generation...');
      const testEmbed = await tse.generateEmbedding('test tse embedding');
      console.log(`   TSE embedding length: ${testEmbed?.length}`);
      console.log(`   TSE has non-zero values: ${testEmbed?.some(x => x !== 0)}`);
      
    } catch (error) {
      console.log(`   ❌ TSE initialization failed: ${error.message}`);
      console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
  }
}

// Export and run
if (require.main === module) {
  const diagnostic = new BackendFailureDiagnostic();
  diagnostic.runDiagnostic().catch(console.error);
}

module.exports = BackendFailureDiagnostic;
