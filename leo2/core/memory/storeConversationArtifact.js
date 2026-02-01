/**
 * Store Conversation Artifact
 * 
 * Phase 2 Part C: Storage wrapper for conversation artifacts
 * 
 * This is the ONLY place that:
 * 1. Calls the conversation artifact classifier
 * 2. Adds cognitive artifact metadata (WITHOUT overwriting provenance chunk_type)
 * 3. Persists the node through the provided writeMemory function
 * 
 * Design principles:
 * - Single responsibility: classify + persist
 * - Writer-agnostic: accepts writeMemory function (works with both loops)
 * - Minimal API: one function, clear contract
 * - Provenance-safe: Does NOT overwrite metadata.chunk_type (preserves conversation_event, etc.)
 * - Invariant enforcement: "Memory does not disappear even when awareness components aren't active"
 * 
 * Metadata fields added:
 * - cognitive_artifact_type: Classification result (conversation_decision, etc.)
 * - cognitive_artifact_confidence: Classifier confidence [0, 1]
 * - cognitive_artifact_extracted: Bounded payload from classifier
 * - cognitive_artifact_type_hint: Non-invasive hint for retrieval/debugging (NOT used for provenance)
 */

const { classifyConversationArtifact } = require('./conversationArtifactClassifier');

/**
 * Store a conversation summary as a typed cognitive artifact
 * 
 * @param {Object} params - Storage parameters
 * @param {Function} params.writeMemory - Writer function: (text, obj) => Promise<void>
 * @param {string} params.summaryText - Conversation summary text
 * @param {Array} params.embedding - Embedding vector for the summary
 * @param {Object} params.baseObj - Base memory object (type, source, metadata, session_id, etc.)
 * @returns {Promise<Object>} Classification result { artifactType, confidence, extracted, tags }
 */
async function storeConversationArtifact({ writeMemory, summaryText, embedding, baseObj }) {
  // Validate inputs
  if (!writeMemory || typeof writeMemory !== 'function') {
    throw new Error('storeConversationArtifact: writeMemory function is required');
  }
  
  if (!summaryText || typeof summaryText !== 'string') {
    throw new Error('storeConversationArtifact: summaryText is required');
  }
  
  if (!baseObj || typeof baseObj !== 'object') {
    throw new Error('storeConversationArtifact: baseObj is required');
  }
  
  // STEP 1: Classify the conversation summary
  const classification = classifyConversationArtifact(summaryText);
  
  // STEP 2: Build enhanced memory object with artifact metadata
  const enhancedObj = {
    ...baseObj,
    embedding: embedding || baseObj.embedding,
    metadata: {
      // Preserve caller-provided provenance FIRST (do not overwrite)
      ...(baseObj?.metadata && typeof baseObj.metadata === 'object' ? baseObj.metadata : {}),
      
      // === Cognitive artifact annotations (namespaced; non-invasive) ===
      cognitive_artifact_type: classification.artifactType,
      cognitive_artifact_confidence: classification.confidence,
      cognitive_artifact_extracted: classification.extracted,

      // Optional hint field (preferred new name)
      cognitive_artifact_type_hint: classification.artifactType,

      // Backward-compat hint (optional). IMPORTANT: do NOT overwrite chunk_type.
      chunk_type_secondary: classification.artifactType,

      // Merge tags (deduplicate) - null-safe
      tags: Array.from(new Set([
        ...((baseObj.metadata && Array.isArray(baseObj.metadata.tags)) ? baseObj.metadata.tags : []),
        ...(Array.isArray(classification.tags) ? classification.tags : [])
      ]))
    }
  };
  
  // STEP 3: Persist through provided writer function
  await writeMemory(summaryText, enhancedObj);
  
  // STEP 4: Return classification for logging/diagnostics
  return {
    artifactType: classification.artifactType,
    confidence: classification.confidence,
    extracted: classification.extracted,
    tags: Array.isArray(classification.tags) ? classification.tags : []
  };
}

module.exports = {
  storeConversationArtifact
};
