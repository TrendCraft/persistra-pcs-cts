/**
 * Vision Anchor - Agent Loop Integration
 * 
 * Re-exports the VisionAnchor class from lib/services for use in the agent loop.
 * This maintains backward compatibility while using the proper implementation.
 */

const VisionAnchorImpl = require('../../../lib/services/vision-anchor');

// Re-export the VisionAnchor class
module.exports = { VisionAnchor: VisionAnchorImpl };
