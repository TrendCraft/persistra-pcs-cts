const { expect } = require('chai');
const metrics = require('./contextMetrics');

describe('contextMetrics', () => {
  it('should export scoring functions', () => {
    expect(metrics).to.have.all.keys([
      'computeCoverageScore',
      'computeRelevanceScore',
      'computeRecencyScore',
      'computeDiversityScore',
    ]);
    Object.values(metrics).forEach(fn => expect(fn).to.be.a('function'));
  });

  it('should compute scores and return numbers', () => {
    const dummy = {};
    expect(metrics.computeCoverageScore(dummy)).to.be.a('number');
    expect(metrics.computeRelevanceScore(dummy)).to.be.a('number');
    expect(metrics.computeRecencyScore(dummy)).to.be.a('number');
    expect(metrics.computeDiversityScore(dummy)).to.be.a('number');
  });
});
