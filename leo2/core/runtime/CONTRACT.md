# UnifiedAwareness Module Contract (v1.0)

**Description:** High-level process() orchestrator; integrates Memory, Identity, Salience, LLM.

## Interface

```typescript
interface UnifiedAwareness {
  initialize(): Promise<void>;
  process(input: string, context?: any): Promise<string>;
}
```

## Usage Example

```js
const awareness = new UnifiedAwareness({ memoryGraph, llm, identity, logger });
await awareness.initialize();
const response = await awareness.process('What did I ask you yesterday?', { interactionMemory });
```

## Notes
- All methods throw on error unless otherwise specified.
