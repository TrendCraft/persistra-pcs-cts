# Embeddings Module Contract (v1.0)

**Description:** Generates dense vector representations for text.

## Interface

```typescript
interface Embeddings {
  initialize(config: EmbeddingsInitConfig): Promise<void>;
  generate(input: string | string[]): Promise<number[] | number[][]>;
  getDimensions(): number;
}

interface EmbeddingsInitConfig {
  model?: string;
  dimensions?: number;
  cacheDir?: string;
}
```

## Usage Example

```js
const embeddings = new Embeddings();
await embeddings.initialize({ model: 'all-MiniLM', dimensions: 384 });
const vector = await embeddings.generate('Hello world');
```

## Notes
- All methods throw on error unless otherwise specified.
- `initialize` must be called before other methods.
