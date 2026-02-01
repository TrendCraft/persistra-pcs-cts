# ContextualSalienceEngine Module Contract (v1.0)

**Description:** Ranks and selects context for the LLM based on recency, importance, and goals.

## Interface

```typescript
interface ContextualSalienceEngine {
  inject(context: any): any; // returns context with salience applied
  analyzeContext(context: any): Promise<any>; // returns ranked/scored context
  manageContextWindow(context: any): any; // windowed/pruned context
}
```

## Usage Example

```js
const cse = new ContextualSalienceEngine();
const salientContext = cse.inject(context);
```

## Notes
- All methods throw on error unless otherwise specified.
