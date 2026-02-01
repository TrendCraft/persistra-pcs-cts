# InteractionMemory Module Contract (v1.0)

**Description:** Stores, retrieves, and trims conversation/interactions.

## Interface

```typescript
interface InteractionMemory {
  initialize(config?: any): Promise<void>;
  recordInteraction(input: string, output: string, meta?: any): Promise<string>;
  getRecentInteractions(limit?: number): Promise<InteractionRecord[]>;
}

interface InteractionRecord {
  id: string;
  input: string;
  output: string;
  timestamp: string;
  metadata?: Record<string, any>;
}
```

## Usage Example

```js
const memory = new InteractionMemory();
await memory.initialize();
await memory.recordInteraction('Hi', 'Hello!');
```

## Notes
- All methods throw on error unless otherwise specified.
