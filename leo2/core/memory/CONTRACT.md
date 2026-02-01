# MemoryGraph Module Contract (v1.0)

**Description:** Persistent, semantically-searchable memory layer for Leo.

## Interface

```typescript
interface MemoryGraph {
  initialize(options: MemoryGraphInitOptions): Promise<void>;
  storeMemory(memory: LeoMemory): Promise<string>; // returns memory ID
  retrieveMemory(id: string): Promise<LeoMemory | null>;
  searchMemories(query: string | Embedding, options?: MemorySearchOptions): Promise<LeoMemory[]>;
  getRelatedNodes(id: string, opts?: RelationOptions): Promise<LeoMemory[]>;
  getMemoryCount(): Promise<number>;
  saveToDisk(): Promise<void>;
  loadFromDisk(): Promise<void>;
}

interface LeoMemory {
  id: string;
  content: string;
  type?: string;
  metadata?: Record<string, any>;
  timestamp?: string | number;
  embedding?: number[];
}

interface MemoryGraphInitOptions {
  persistPath?: string;
  maxNodes?: number;
  embeddings?: Embeddings;
}

interface MemorySearchOptions {
  limit?: number;
  minScore?: number;
  includeVectors?: boolean;
}
```

## Usage Example

```js
const memoryGraph = new MemoryGraph();
await memoryGraph.initialize({ persistPath: './data/mem', embeddings });
// ...
```

## Notes
- All methods throw on error unless otherwise specified.
- `initialize` must be called before other methods.
- Compatible with Embeddings v1.0 contract.
