# Semantic Context Manager (Modular)

**Directory Structure:**

- `init.js` — Initialization logic (setup, config)
- `config.js` — Config utilities (defaults, parsing)
- `contextRetrieval.js` — Search, retrieval, extraction
- `contextInjection.js` — Prompt injection logic
- `embeddings.js` — Embedding generation/utilities
- `salience.js` — Salience computation/ranking
- `qualityMetrics.js` — Context quality scoring, metrics
- `boundaryAwareness.js` — Token boundary/context preservation
- `memoryInterface.js` — Graph access, chunk management
- `telemetry.js` — Telemetry/logging, statistics
- `index.js` — Single entry point (exports API)
- `semantic-context-manager.js` — DEPRECATED (calls index.js, phased out)

**Migration in progress:** See individual files for TODOs and migration notes. Legacy monolith is being replaced by modular API.
