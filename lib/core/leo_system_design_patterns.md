# Leo System Design Patterns

## Intent Routing Flow
1. User issues a natural language intent.
2. SemanticRouter:
   - Logs the intent.
   - Uses semantic search to find matching capabilities.
   - If confidence is high, executes directly.
   - If ambiguous, invokes ClarificationGenerator.
   - Updates routing graph and feedback store.

3. Execution results are sent back to user and stored for learning.

## Key Modules
- `semantic_router`: Main orchestrator of routing logic.
- `capability_registry`: Holds available executable capabilities.
- `semantic_matcher`: Uses embeddings to semantically match intents.
- `routing_graph`: Tracks past routing attempts and results.

## Core Design Principles
- Modularization: Each function lives in its own file or class.
- Stateless Execution: Capabilities should not depend on mutable shared state.
- Observability: All routing and execution events must be logged.
- Learnability: Systems like feedback loop and routing graph must evolve over time.

## Priority Heuristics
- Intent clarity > capability popularity
- Context relevance > string similarity
- Feedback history > static confidence scores