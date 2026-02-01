const path = require('path');
const Leo = require(path.join(__dirname, 'leo.js'));
const fs = require('fs');
const EventEmitter = require('events');

console.log("🧠 Leo is running with embedded Claude.");

// ... additional logic can be inserted here, retaining minimal viable script

// Exported for REPL or external binding
module.exports = {
    Leo,
    EventEmitter,
    fs
};
