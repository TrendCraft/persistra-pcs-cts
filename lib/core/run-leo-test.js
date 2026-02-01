// run-leo-test.js
// Test runner for Leo with Qwen2.5 and memory context

const path = require('path');
console.log('[RUN_LEO_TEST_DEBUG] About to require leo-unified-runtime-v2_20250607_1848_fixed.js');
const { initializeLeo, runLeoPrompt } = require('./leo-unified-runtime-v2_20250607_1848_fixed');
console.log('[RUN_LEO_TEST_DEBUG] Successfully required leo-unified-runtime-v2_20250607_1848_fixed.js');

(async function main() {
  console.log('[RUN_LEO_TEST_DEBUG] Entered main()');
  try {
    console.log('[RUN_LEO_TEST_DEBUG] About to call initializeLeo()');
    await initializeLeo();
    console.log('[RUN_LEO_TEST_DEBUG] Successfully called initializeLeo()');

    const testQuery = "What are the foundational architectural goals of Leo?";
    console.log("\n🧠 Sending test query to Leo (via Qwen2.5):\n", testQuery);

    console.log('[RUN_LEO_TEST_DEBUG] About to call runLeoPrompt()');
    const response = await runLeoPrompt(testQuery);
    console.log('[RUN_LEO_TEST_DEBUG] Successfully called runLeoPrompt()');
    console.log("\n💬 Qwen's Response:\n", response);
  } catch (err) {
    console.error("❌ Failed to run Leo test prompt:", err);
  }
})();
