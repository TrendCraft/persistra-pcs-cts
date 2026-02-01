// MIGRATED: All boundary logic now in BoundaryService (see boundaryService.js)
const BoundaryService = require('./boundaryService');

function createBoundaryService(deps) {
  return new BoundaryService(deps);
}

module.exports = { createBoundaryService };
