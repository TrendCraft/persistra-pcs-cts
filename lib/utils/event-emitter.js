/**
 * Event Emitter
 * 
 * A simple event emitter for the Leo system that provides a standardized
 * way to emit and listen for events across components.
 * 
 * This complements the event-bus by providing a simpler interface for
 * direct component-to-component communication.
 */

const EventEmitter = require('events');
const { createComponentLogger } = require('./logger');

// Create logger
const logger = createComponentLogger('event-emitter');

// Create a singleton event emitter
const eventEmitter = new EventEmitter();

// Set maximum number of listeners to avoid memory leaks
eventEmitter.setMaxListeners(20);

// Add logging for debugging
const originalEmit = eventEmitter.emit;
eventEmitter.emit = function(event, ...args) {
  logger.debug(`Event emitted: ${event}`);
  return originalEmit.apply(this, [event, ...args]);
};

module.exports = { eventEmitter };
