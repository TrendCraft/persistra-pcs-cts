const assert = require('assert');
const EventEmitter = require('events');
const BoundaryService = require('./boundaryService');

describe('BoundaryService', () => {
  let logger, eventBus, state, events, service;

  beforeEach(() => {
    events = [];
    logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
    eventBus = new EventEmitter();
    eventBus.emit = ((origEmit) => function (...args) {
      events.push(args);
      return origEmit.apply(this, args);
    })(eventBus.emit);
    state = {
      boundaryAwarenessEnabled: true,
      contextPreservationState: { boundaryId: 'b1', preservationTimestamp: 1111 },
      sessionBoundaryManager: {
        isInitialized: true,
        getBoundaryProximity: () => ({ status: 'healthy', percentage: 42 })
      },
      lastBoundaryStatus: 'healthy'
    };
    service = new BoundaryService({
      logger,
      eventBus,
      state,
      preserveContextForBoundaryCrossing: async (force) => {
        state.contextPreservationState.boundaryId = force ? 'forced' : 'b1';
        state.contextPreservationState.preservationTimestamp = 2222;
        return true;
      },
      restoreContextAfterBoundaryCrossing: async (saved) => {
        state.contextPreservationState.boundaryId = saved?.boundaryId || 'b1';
        state.contextPreservationState.preservationTimestamp = 3333;
        return { success: true };
      }
    });
  });

  it('should preserve context and emit event', async () => {
    const result = await service.preserveContext(true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.boundaryId, 'forced');
    assert.strictEqual(result.data.timestamp, 2222);
    const emitted = events.find(e => e[0] === 'boundary:context:preserved');
    assert.ok(emitted, 'boundary:context:preserved event emitted');
  });

  it('should restore context and emit event', async () => {
    const result = await service.restoreContext({ boundaryId: 'restore' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.boundaryId, 'restore');
    assert.strictEqual(result.data.restorationTimestamp > 0, true);
    const emitted = events.find(e => e[0] === 'boundary:context:restored');
    assert.ok(emitted, 'boundary:context:restored event emitted');
  });

  it('should return boundary status', () => {
    const status = service.getBoundaryStatus();
    assert.deepStrictEqual(status, { status: 'healthy', percentage: 42, enabled: true });
  });

  it('should handle disabled awareness', async () => {
    state.boundaryAwarenessEnabled = false;
    let result = await service.preserveContext();
    assert.strictEqual(result.success, false);
    result = await service.restoreContext();
    assert.strictEqual(result.success, false);
    const status = service.getBoundaryStatus();
    assert.deepStrictEqual(status, { status: 'unknown', percentage: 0, enabled: false });
  });

  it('should emit error events on error', async () => {
    service.preserveContextForBoundaryCrossing = async () => { throw new Error('fail preserve'); };
    let result = await service.preserveContext();
    assert.strictEqual(result.success, false);
    const emitted = events.find(e => e[0] === 'boundary:context:error' && e[1].action === 'preserve');
    assert.ok(emitted, 'boundary:context:error event emitted on preserve');

    service.restoreContextAfterBoundaryCrossing = async () => { return { success: false, error: 'fail restore' }; };
    result = await service.restoreContext();
    assert.strictEqual(result.success, false);
    // Should emit error event on restore failure too
  });
});
