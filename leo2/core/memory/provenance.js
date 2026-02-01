/**
 * Memory Provenance Schema Enforcement
 * 
 * Ensures every memory node has minimal required metadata for:
 * - Source diversity tracking
 * - Temporal reasoning
 * - Retrieval quality metrics
 * 
 * Non-negotiable fields:
 * - source_kind: origin type
 * - source_id: unique stable identifier
 * - timestamp: event time (not ingest time)
 * - ingested_at: when added to graph
 */

const crypto = require('crypto');

/**
 * Current provenance schema version
 * v1.1.0: Added timestamp override logic for conversation events
 */
const CURRENT_PROVENANCE_VERSION = '1.1.0';

/**
 * Valid source kinds for memory provenance
 */
const SOURCE_KINDS = {
  REPO_FILE: 'repo_file',
  CONVERSATION: 'conversation',
  WEB: 'web',
  PDF: 'pdf',
  EMAIL: 'email',
  NOTE: 'note',
  MANUAL: 'manual',
  UNKNOWN: 'unknown'
};

/**
 * Enforce minimal provenance schema on a memory node
 * @param {Object} chunk - Raw memory chunk
 * @returns {Object} Chunk with enforced provenance
 */
function enforceProvenance(chunk) {
  if (!chunk || typeof chunk !== 'object') {
    throw new Error('Invalid chunk: must be an object');
  }

  // Initialize metadata if missing
  if (!chunk.metadata) {
    chunk.metadata = {};
  }

  const metadata = chunk.metadata;
  const now = Date.now();

  // 1. ENFORCE source_kind
  if (!metadata.source_kind) {
    metadata.source_kind = inferSourceKind(chunk);
  }

  // 2. ENFORCE source_id (stable, unique identifier)
  if (!metadata.source_id) {
    metadata.source_id = generateSourceId(chunk, metadata);
  }

  // 3. ENFORCE timestamp (event time, not ingest time)
  // IMPORTANT: We may need to override an existing timestamp if it looks like an ingest-time placeholder.
  const inferredEventTs = inferEventTimestamp(chunk, metadata);

  // Ensure ingested_at exists before comparing to it
  if (!metadata.ingested_at) {
    metadata.ingested_at = now;
  }

  const shouldOverrideTimestamp = (existingTs) => {
    if (!existingTs || typeof existingTs !== 'number') return true;

    // GUARDRAIL: Never override conversation event timestamps
    // Conversations have explicit timestamp_source to indicate they're already correct
    if (metadata.timestamp_source === 'conversation_event_time') {
      return false; // Trust conversation timestamps explicitly
    }

    // GUARDRAIL: For conversation source_kind, require explicit event time metadata
    if (metadata.source_kind === 'conversation') {
      const hasConversationTimestamp = Boolean(
        metadata.conversation_timestamp || 
        metadata.message_timestamp
      );
      
      // If conversation has explicit timestamp metadata, don't override
      if (hasConversationTimestamp) {
        return false;
      }
    }

    // If we have an inferred event timestamp and it's meaningfully different, prefer it.
    if (typeof inferredEventTs === 'number') {
      // Treat timestamps within 60 minutes of ingested_at as likely ingest-time placeholders.
      const nearIngest = Math.abs(existingTs - metadata.ingested_at) <= 60 * 60 * 1000;
      const farFromEvent = Math.abs(existingTs - inferredEventTs) > 60 * 60 * 1000;
      if (nearIngest && farFromEvent) return true;

      // If created_at/updated_at exist, and inferredEventTs differs substantially, trust inferred.
      const hasEventHints = Boolean(metadata.created_at || metadata.event_time || metadata.commit_time || metadata.file_created_at || metadata.conversation_timestamp || metadata.message_timestamp || metadata.updated_at);
      if (hasEventHints && farFromEvent) return true;
    }

    return false;
  };

  if (shouldOverrideTimestamp(metadata.timestamp)) {
    const prev = metadata.timestamp;
    metadata.timestamp = inferredEventTs || metadata.timestamp || now;
    metadata.timestamp_source = inferredEventTs ? 'inferred_event_time' : (metadata.timestamp ? 'existing' : 'fallback_now');
    metadata.timestamp_fallback = !inferredEventTs;

    if (prev && prev !== metadata.timestamp) {
      metadata.timestamp_overridden = true;
      metadata.timestamp_previous = prev;
    }
  }

  // 4. ENFORCE ingested_at (when added to graph) - enforced earlier (before timestamp comparisons)

  // 5. ENFORCE chunk_type using deterministic classifier (P3)
  if (!metadata.chunk_type) {
    const { classifyChunkType } = require('./typeClassifier');
    metadata.chunk_type = classifyChunkType(chunk);
  }

  // 6. PRESERVE original fields for backfill/debugging
  // IMPORTANT: Bump to 1.1.0 to trigger timestamp re-inference on existing nodes
  const currentVersion = metadata.provenance_version;
  
  if (!currentVersion || currentVersion !== CURRENT_PROVENANCE_VERSION) {
    metadata.provenance_version = CURRENT_PROVENANCE_VERSION;
    metadata.provenance_enforced_at = now;
    
    if (currentVersion && currentVersion !== CURRENT_PROVENANCE_VERSION) {
      metadata.provenance_upgraded_from = currentVersion;
    }
  }

  return chunk;
}

/**
 * Infer source_kind from chunk structure
 */
function inferSourceKind(chunk) {
  const meta = chunk.metadata || {};

  // Check for repo/file indicators
  if (meta.repository || meta.repo || meta.file_path || meta.path) {
    return SOURCE_KINDS.REPO_FILE;
  }

  // Check for conversation indicators
  if (meta.conversation_id || meta.session_id || chunk.type === 'conversation_event') {
    return SOURCE_KINDS.CONVERSATION;
  }

  // Check for web indicators
  if (meta.url || meta.source_url || chunk.type === 'web') {
    return SOURCE_KINDS.WEB;
  }

  // Check for PDF indicators
  if (meta.file_type === '.pdf' || chunk.type === 'pdf') {
    return SOURCE_KINDS.PDF;
  }

  // Check for email indicators
  if (meta.email_id || chunk.type === 'email') {
    return SOURCE_KINDS.EMAIL;
  }

  // Check for note indicators
  if (chunk.type === 'note' || chunk.type === 'manual') {
    return SOURCE_KINDS.NOTE;
  }

  // Default to unknown
  return SOURCE_KINDS.UNKNOWN;
}

/**
 * Generate stable source_id from chunk data
 */
function generateSourceId(chunk, metadata) {
  const kind = metadata.source_kind || SOURCE_KINDS.UNKNOWN;

  switch (kind) {
    case SOURCE_KINDS.REPO_FILE: {
      const repo = metadata.repository || metadata.repo || 'unknown-repo';
      const path = metadata.file_path || metadata.path || 'unknown-path';
      const hash = metadata.commit_hash || metadata.hash || '';
      return hash ? `repo:${repo}/${path}#${hash}` : `repo:${repo}/${path}`;
    }

    case SOURCE_KINDS.CONVERSATION: {
      const convId = metadata.conversation_id || metadata.session_id || 'unknown-conversation';
      const msgId = metadata.message_id || chunk.id || '';
      return msgId ? `conversation:${convId}#${msgId}` : `conversation:${convId}`;
    }

    case SOURCE_KINDS.WEB: {
      const url = metadata.url || metadata.source_url || 'unknown-url';
      return `url:${url}`;
    }

    case SOURCE_KINDS.PDF: {
      const filename = metadata.filename || metadata.file_path || 'unknown-pdf';
      const page = metadata.page || '';
      return page ? `pdf:${filename}#page${page}` : `pdf:${filename}`;
    }

    case SOURCE_KINDS.EMAIL: {
      const emailId = metadata.email_id || metadata.message_id || 'unknown-email';
      return `email:${emailId}`;
    }

    case SOURCE_KINDS.NOTE: {
      const noteId = metadata.note_id || chunk.id || '';
      return noteId ? `note:${noteId}` : `note:${generateStableHash(chunk)}`;
    }

    case SOURCE_KINDS.UNKNOWN:
    default: {
      // Generate stable hash from content + existing metadata
      const uuid = generateStableHash(chunk);
      return `unknown:${uuid}`;
    }
  }
}

/**
 * Infer event timestamp from chunk metadata
 */
function inferEventTimestamp(chunk, metadata) {
  // Priority order for event time:
  // 1. Explicit event_time or created_at
  // 2. File/repo creation time
  // 3. Conversation timestamp
  // 4. Updated_at as fallback
  // 5. null (will use ingested_at)

  if (metadata.event_time) {
    return parseTimestamp(metadata.event_time);
  }

  if (metadata.created_at) {
    return parseTimestamp(metadata.created_at);
  }

  if (metadata.commit_time || metadata.file_created_at) {
    return parseTimestamp(metadata.commit_time || metadata.file_created_at);
  }

  if (metadata.conversation_timestamp || metadata.message_timestamp) {
    return parseTimestamp(metadata.conversation_timestamp || metadata.message_timestamp);
  }

  if (metadata.updated_at) {
    return parseTimestamp(metadata.updated_at);
  }

  // If chunk has a timestamp field (legacy), use it but log warning
  if (chunk.timestamp && typeof chunk.timestamp === 'number') {
    console.warn(`[Provenance] Using legacy chunk.timestamp for ${chunk.id} - may be ingest time, not event time`);
    return chunk.timestamp;
  }

  return null; // Will fall back to ingested_at
}

/**
 * Parse timestamp from various formats
 */
function parseTimestamp(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * Generate stable hash from chunk content + metadata
 */
function generateStableHash(chunk) {
  const content = chunk.content || '';
  const id = chunk.id || '';
  const type = chunk.type || '';
  const timestamp = chunk.timestamp || Date.now();
  
  const hashInput = `${content}|${id}|${type}|${timestamp}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
}

/**
 * Validate that a chunk has required provenance fields
 */
function validateProvenance(chunk) {
  const errors = [];

  if (!chunk.metadata) {
    errors.push('Missing metadata object');
    return { valid: false, errors };
  }

  const meta = chunk.metadata;

  if (!meta.source_kind) {
    errors.push('Missing source_kind');
  }

  if (!meta.source_id) {
    errors.push('Missing source_id');
  }

  if (!meta.timestamp) {
    errors.push('Missing timestamp');
  }

  if (!meta.ingested_at) {
    errors.push('Missing ingested_at');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  CURRENT_PROVENANCE_VERSION,
  SOURCE_KINDS,
  enforceProvenance,
  validateProvenance,
  inferSourceKind,
  generateSourceId,
  inferEventTimestamp
};
