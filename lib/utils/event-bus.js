/**
 * Event Bus
 * 
 * A simple event system for component communication in Leo.
 * This provides a standardized way for components to communicate
 * without direct dependencies.
 */

const { createComponentLogger } = require('./logger');

// Create component logger
const logger = createComponentLogger('event-bus');

/**
 * Event Bus class
 */
class EventBus {
  /**
   * Initialize event bus
   */
  constructor() {
    this.listeners = new Map();
    this.history = [];
    this.maxHistorySize = 100;
    this.debug = process.env.LEO_DEBUG_EVENTS === 'true';
    
    logger.info('Event bus initialized');
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @param {string} component - Component name for tracking (required)
   * @returns {boolean} Success status
   */
  on(event, callback, component) {
    if (!event || typeof event !== 'string') {
      logger.error('Invalid event name');
      return false;
    }

    if (typeof callback !== 'function') {
      logger.error('Invalid callback function');
      return false;
    }

    if (!component || typeof component !== 'string') {
      logger.error(`Component name is required for event subscription to '${event}'. Please provide a component name.`);
      // Still use 'unknown' as fallback to prevent crashes, but make it clear this is an error
      component = 'unknown';
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push({
      component,
      callback
    });

    if (this.debug) {
      logger.info(`Component "${component}" subscribed to event "${event}"`);
    }

    return true;
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {string} component - Component name
   * @returns {boolean} Success status
   */
  off(event, component) {
    if (!event || !component) {
      return false;
    }

    if (!this.listeners.has(event)) {
      return false;
    }

    const listeners = this.listeners.get(event);
    const filteredListeners = listeners.filter(l => l.component !== component);

    if (filteredListeners.length === listeners.length) {
      // No listeners were removed
      return false;
    }

    this.listeners.set(event, filteredListeners);

    if (this.debug) {
      logger.info(`Component "${component}" unsubscribed from event "${event}"`);
    }

    return true;
  }

  /**
   * Unsubscribe a component from all events
   * @param {string} component - Component name
   * @returns {boolean} Success status
   */
  offAll(component) {
    if (!component) {
      return false;
    }

    let removed = false;

    for (const [event, listeners] of this.listeners.entries()) {
      const filteredListeners = listeners.filter(l => l.component !== component);
      
      if (filteredListeners.length !== listeners.length) {
        this.listeners.set(event, filteredListeners);
        removed = true;
        
        if (this.debug) {
          logger.info(`Component "${component}" unsubscribed from event "${event}"`);
        }
      }
    }

    return removed;
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @param {Object} options - Emit options
   * @returns {boolean} Success status
   */
  emit(event, data, options = {}) {
    if (!event) {
      return false;
    }

    // Add to history
    this.addToHistory(event, data);

    // If no listeners, still return true as the event was emitted
    if (!this.listeners.has(event)) {
      return true;
    }

    const listeners = this.listeners.get(event);
    
    if (this.debug) {
      logger.info(`Emitting event "${event}" to ${listeners.length} listeners`, { 
        data: typeof data === 'object' ? JSON.stringify(data) : data 
      });
    }

    for (const listener of listeners) {
      try {
        listener.callback(data);
      } catch (error) {
        logger.error(`Error in event listener for "${event}" from component "${listener.component}": ${error.message}`, {
          stack: error.stack
        });
        
        // If stopOnError is true, stop emitting
        if (options.stopOnError) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Add event to history
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @private
   */
  addToHistory(event, data) {
    this.history.unshift({
      event,
      data,
      timestamp: Date.now()
    });

    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get event history
   * @param {string} event - Optional event name to filter by
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Event history
   */
  getHistory(event, limit = 10) {
    let history = this.history;

    if (event) {
      history = history.filter(item => item.event === event);
    }

    return history.slice(0, limit);
  }

  /**
   * Check if an event has subscribers
   * @param {string} event - Event name
   * @returns {boolean} True if event has subscribers
   */
  hasSubscribers(event) {
    return this.listeners.has(event) && this.listeners.get(event).length > 0;
  }

  /**
   * Get subscriber count for an event
   * @param {string} event - Event name
   * @returns {number} Number of subscribers
   */
  getSubscriberCount(event) {
    if (!this.listeners.has(event)) {
      return 0;
    }
    return this.listeners.get(event).length;
  }

  /**
   * Get all registered events
   * @returns {string[]} Array of event names
   */
  getEvents() {
    return Array.from(this.listeners.keys());
  }

  /**
   * Clear all event listeners
   */
  clear() {
    this.listeners.clear();
    logger.info('All event listeners cleared');
  }
}

// Create singleton instance
const eventBus = new EventBus();

// Export both the class and singleton instance
module.exports = eventBus;
module.exports.EventBus = EventBus;
