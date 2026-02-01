# IdentityManager Module Contract (v1.0)

**Description:** Loads, persists, and summarizes Leo’s identity state.

## Interface

```typescript
interface IdentityManager {
  load(): Promise<void>;
  save(): Promise<void>;
  getContext(): any; // Returns the current identity context object
  summarize(): string; // Short summary for prompts/UI
}
```

## Usage Example

```js
const identity = new IdentityManager();
await identity.load();
const summary = identity.summarize();
```

## Notes
- All methods throw on error unless otherwise specified.
