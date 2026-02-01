const assert = require('assert');
const EventEmitter = require('events');
const CacheService = require('./cacheService');

describe('CacheService', () => {
  let logger, eventBus, cacheService, events;

  beforeEach(() => {
    events = [];
    logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
    eventBus = new EventEmitter();
    eventBus.emit = ((origEmit) => function (...args) {
      events.push(args);
      return origEmit.apply(this, args);
    })(eventBus.emit);
    cacheService = new CacheService({ logger, eventBus, config: {}});
  });

  it('should set, get, has, delete, and clear cache entries', () => {
    cacheService.set('foo', 123);
    assert.strictEqual(cacheService.has('foo'), true);
    assert.strictEqual(cacheService.get('foo'), 123);
    cacheService.delete('foo');
    assert.strictEqual(cacheService.has('foo'), false);
    cacheService.set('bar', 456);
    cacheService.set('baz', 789);
    cacheService.clear();
    assert.strictEqual(cacheService.has('bar'), false);
    assert.strictEqual(cacheService.has('baz'), false);
  });

  it('should emit events on invalidateCache', () => {
    cacheService.set('a', 1);
    const result = cacheService.invalidateCache({ reason: 'test' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.metadata.entriesCleared, 1);
    const emitted = events.find(e => e[0] === 'context:cache:invalidated');
    assert.ok(emitted, 'context:cache:invalidated event emitted');
    assert.strictEqual(cacheService.getCacheStats().size, 0);
  });

  it('should return cache stats', () => {
    cacheService.set('x', 1);
    cacheService.set('y', 2);
    const stats = cacheService.getCacheStats();
    assert.strictEqual(stats.size, 2);
    assert.deepStrictEqual(stats.keys.sort(), ['x','y']);
    assert.ok(Array.isArray(stats.valuesSample));
  });
});
