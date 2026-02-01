/**
 * BoundaryService - Handles boundary awareness and context preservation logic.
 *
 * API:
 *   - preserveContext(force = false)
 *   - restoreContext(savedContext = null)
 *   - getBoundaryStatus()
 *
 * Dependencies (injected):
 *   - logger
 *   - eventBus (optional, for event hooks)
 *   - state: {
 *       boundaryAwarenessEnabled,
 *       contextPreservationState,
 *       sessionBoundaryManager
 *     }
 *   - preserveContextForBoundaryCrossing (fn)
 *   - restoreContextAfterBoundaryCrossing (fn)
 *
 * Extensibility: Event hooks, error interception, and custom state can be injected.
 */

class BoundaryService {
  constructor({ logger, eventBus, state = {}, preserveContextForBoundaryCrossing, restoreContextAfterBoundaryCrossing }) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.state = state;
    this.preserveContextForBoundaryCrossing = preserveContextForBoundaryCrossing;
    this.restoreContextAfterBoundaryCrossing = restoreContextAfterBoundaryCrossing;
  }

  async preserveContext(force = false) {
    if (!this.state.boundaryAwarenessEnabled) {
      this.logger && this.logger.warn('Token boundary awareness is disabled');
      return { success: false, error: 'Token boundary awareness is disabled' };
    }
    try {
      const preserved = await this.preserveContextForBoundaryCrossing(force);
      if (this.eventBus) {
        this.eventBus.emit('boundary:context:preserved', {
          force,
          boundaryId: this.state.contextPreservationState?.boundaryId,
          timestamp: Date.now()
        });
      }
      return {
        success: preserved,
        data: preserved ? {
          boundaryId: this.state.contextPreservationState?.boundaryId,
          timestamp: this.state.contextPreservationState?.preservationTimestamp
        } : null,
        error: preserved ? null : 'Failed to preserve context'
      };
    } catch (error) {
      if (this.eventBus) {
        this.eventBus.emit('boundary:context:error', { action: 'preserve', error: error.message });
      }
      if (this.logger) this.logger.error('BoundaryService.preserveContext error', error);
      return { success: false, error: error.message };
    }
  }

  async restoreContext(savedContext = null) {
    if (!this.state.boundaryAwarenessEnabled) {
      this.logger && this.logger.warn('Token boundary awareness is disabled');
      return { success: false, error: 'Token boundary awareness is disabled' };
    }
    try {
      const restored = await this.restoreContextAfterBoundaryCrossing(savedContext);
      if (this.eventBus) {
        this.eventBus.emit('boundary:context:restored', {
          boundaryId: this.state.contextPreservationState?.boundaryId,
          restorationTimestamp: Date.now()
        });
      }
      return {
        success: restored.success,
        data: restored.success ? {
          boundaryId: this.state.contextPreservationState?.boundaryId,
          originalTimestamp: this.state.contextPreservationState?.preservationTimestamp,
          restorationTimestamp: Date.now()
        } : null,
        error: restored.success ? null : restored.error
      };
    } catch (error) {
      if (this.eventBus) {
        this.eventBus.emit('boundary:context:error', { action: 'restore', error: error.message });
      }
      if (this.logger) this.logger.error('BoundaryService.restoreContext error', error);
      return { success: false, error: error.message };
    }
  }

  getBoundaryStatus() {
    if (!this.state.boundaryAwarenessEnabled) {
      return { status: 'unknown', percentage: 0, enabled: false };
    }
    try {
      if (this.state.sessionBoundaryManager && this.state.sessionBoundaryManager.isInitialized) {
        const boundaryStatus = this.state.sessionBoundaryManager.getBoundaryProximity();
        return {
          ...boundaryStatus,
          enabled: true
        };
      }
      // Fallback: use last known status
      return {
        status: this.state.lastBoundaryStatus || 'unknown',
        percentage: 0,
        enabled: true
      };
    } catch (error) {
      if (this.logger) this.logger.error('BoundaryService.getBoundaryStatus error', error);
      return { status: 'error', error: error.message, enabled: false };
    }
  }
}

module.exports = BoundaryService;
