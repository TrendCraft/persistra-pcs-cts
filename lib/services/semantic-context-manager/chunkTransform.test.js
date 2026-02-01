const { expect } = require('chai');
const chunkTransform = require('./chunkTransform');

describe('chunkTransform', () => {
  it('should export all chunk transform utilities', () => {
    expect(chunkTransform).to.have.all.keys([
      'inferChunkType',
      'mapAndEnrichChunks',
      'filterChunksByType',
      'postProcessChunks',
    ]);
    Object.values(chunkTransform).forEach(fn => expect(fn).to.be.a('function'));
  });

  it('should call each utility and return expected types', () => {
    // Dummy data for type checks
    expect(chunkTransform.inferChunkType({})).to.be.a('string');
    expect(chunkTransform.mapAndEnrichChunks([], {})).to.be.an('array');
    expect(chunkTransform.filterChunksByType([], 'type')).to.be.an('array');
    expect(chunkTransform.postProcessChunks([])).to.be.an('array');
  });
});
