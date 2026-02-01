// leo2/core/cse/capability_selector.js

async function buildCapabilityPrompt(context) {
  const capabilities = await selectCapabilities(context);
  // Only use the most salient atomic capability
  if (capabilities && capabilities.length > 0) {
    // Use only the first non-empty line
    return capabilities[0].split('\n')[0].trim();
  }
  return "I am able to reason and assist as Leo.";
}

module.exports = { buildCapabilityPrompt };
