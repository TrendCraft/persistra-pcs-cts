/**
 * Normalize recall queries by stripping recall phrasing and extracting a topical payload.
 * Deterministic regex-only, safe to run on every query.
 *
 * Returns:
 *  - cleanedQuery: string (recall phrasing stripped, normalized whitespace)
 *  - topicQuery: string|null (best-effort extracted topic, used for retrieval focus)
 *  - removed: string[] (labels of removed recall segments for diagnostics)
 */
function normalizeRecallQuery(userInput, classified = {}) {
  const original = String(userInput || '').trim();
  if (!original) return { cleanedQuery: '', topicQuery: null, removed: [] };

  const intent = classified?.intent || 'knowledge_query';
  if (intent !== 'conversation_recall') {
    return { cleanedQuery: original, topicQuery: null, removed: [] };
  }

  let cleaned = original;
  const removed = [];

  const stripRules = [
    // Global recall preambles
    { label: 'across_all_past_sessions', re: /\bacross\s+all\s+past\s+sessions\b[:,\s]*/i },
    { label: 'across_all_sessions', re: /\bacross\s+all\s+(?:our\s+)?sessions\b[:,\s]*/i },
    { label: 'throughout_history', re: /\bthroughout\s+(?:our\s+)?conversation\s+history\b[:,\s]*/i },
    { label: 'in_any_past_conversations', re: /\bin\s+any\s+of\s+our\s+past\s+conversations\b[:,\s]*/i },
    { label: 'have_we_ever_discussed', re: /\bhave\s+we\s+ever\s+discussed\b[:,\s]*/i },
    { label: 'over_all_past_conversations', re: /\bover\s+all\s+past\s+conversations\b[:,\s]*/i },
    { label: 'across_history', re: /\bacross\s+our\s+conversation\s+history\b[:,\s]*/i },

    // Session recall preambles
    { label: 'what_did_we_discuss', re: /\bwhat\s+did\s+we\s+discuss\b[:,\s]*/i },
    { label: 'what_did_we_talk_about', re: /\bwhat\s+did\s+we\s+talk\s+about\b[:,\s]*/i },
    { label: 'in_our_last_conversation', re: /\bin\s+our\s+last\s+conversation\b[:,\s]*/i },
    { label: 'last_time_we_talked', re: /\blast\s+time\s+we\s+talked\b[:,\s]*/i },
    { label: 'where_did_we_leave_off', re: /\bwhere\s+did\s+we\s+leave\s+off\b[:,\s]*/i },
    { label: 'remind_me_what_you_said', re: /\bremind\s+me\s+what\s+you\s+said\b[:,\s]*/i },
    { label: 'you_told_me', re: /\byou\s+told\s+me\b[:,\s]*/i },
    { label: 'what_decisions_did_we_make', re: /\bwhat\s+decisions?\s+did\s+we\s+make\b[:,\s]*/i },
    { label: 'what_constraints_did_we_agree', re: /\bwhat\s+constraints?\s+did\s+we\s+agree\b[:,\s]*/i },
  ];

  for (const rule of stripRules) {
    if (rule.re.test(cleaned)) {
      cleaned = cleaned.replace(rule.re, '');
      removed.push(rule.label);
    }
  }

  cleaned = cleaned.replace(/^[,\s:;-]+/, '').replace(/\s+/g, ' ').trim();

  // Extract topic payload (prefer "about X", "regarding X", "on X", "discussed X")
  const topicPatterns = [
    /\babout\s+(.+?)[\?\.!]*$/i,
    /\bregarding\s+(.+?)[\?\.!]*$/i,
    /\bon\s+(.+?)[\?\.!]*$/i,
    /\bdiscuss(?:ed|ing)?\s+(.+?)[\?\.!]*$/i,
  ];

  let topicQuery = null;
  for (const re of topicPatterns) {
    const m = original.match(re) || cleaned.match(re);
    if (m && m[1]) {
      const candidate = String(m[1] || '').trim();
      if (!candidate) continue;

      // Reject meta-topics
      if (/\b(?:our\s+)?(?:last\s+conversation|previous\s+conversation|conversation\s+history|past\s+sessions)\b/i.test(candidate)) {
        continue;
      }

      // Keep first clause if user wrote a long sentence
      const chopped = candidate.split(/\s*(?:,|;|\.|\?|!|\bbut\b|\band\b)\s*/i)[0].trim();
      if (chopped.length >= 3) {
        topicQuery = chopped;
        break;
      }
    }
  }

  if (!cleaned) cleaned = original;

  return { cleanedQuery: cleaned, topicQuery, removed };
}

function classifyIntentAndScope(userInput) {
  const q = String(userInput || '').trim().toLowerCase();

  // Guard
  if (!q) {
    return { intent: 'knowledge_query', scope: 'session', confidence: 0.2, cleanedQuery: '', topicQuery: null, removed: [] };
  }

  // Global / cross-session recall requires explicit phrasing
  const globalPatterns = [
    /across\s+all\s+past\s+sessions/i,
    /across\s+all\s+(our\s+)?sessions/i,
    /throughout\s+(our\s+)?conversation\s+history/i,
    /in\s+any\s+of\s+our\s+past\s+conversations/i,
    /have\s+we\s+ever\s+discussed/i,
    /over\s+all\s+past\s+conversations/i,
    /across\s+our\s+conversation\s+history/i,
  ];

  // Session-scoped recall (default) — "what did we discuss / last time"
  const sessionRecallPatterns = [
    /what\s+did\s+we\s+discuss/i,
    /what\s+did\s+we\s+talk\s+about/i,
    /in\s+our\s+last\s+conversation/i,
    /last\s+time\s+we\s+talked/i,
    /where\s+did\s+we\s+leave\s+off/i,
    /remind\s+me\s+what\s+you\s+said/i,
    /you\s+told\s+me/i,
    /what\s+decisions?\s+did\s+we\s+make/i,
    /what\s+constraints?\s+did\s+we\s+agree/i,
  ];

  const isGlobal = globalPatterns.some((re) => re.test(q));
  const isSessionRecall = sessionRecallPatterns.some((re) => re.test(q));

  if (isGlobal) {
    const base = { intent: 'conversation_recall', scope: 'global', confidence: 0.9 };
    const norm = normalizeRecallQuery(userInput, base);
    return { ...base, ...norm };
  }

  if (isSessionRecall) {
    const base = { intent: 'conversation_recall', scope: 'session', confidence: 0.85 };
    const norm = normalizeRecallQuery(userInput, base);
    return { ...base, ...norm };
  }

  return { intent: 'knowledge_query', scope: 'session', confidence: 0.55, cleanedQuery: String(userInput || '').trim(), topicQuery: null, removed: [] };
}

module.exports = { classifyIntentAndScope, normalizeRecallQuery };
