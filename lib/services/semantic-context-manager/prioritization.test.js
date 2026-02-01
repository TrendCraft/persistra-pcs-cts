const { expect } = require('chai');
const { prioritizeContextElements } = require('./prioritization');

describe('prioritization', () => {
  it('should export prioritizeContextElements as a function', () => {
    expect(prioritizeContextElements).to.be.a('function');
  });

  it('should return an array when called', () => {
    const result = prioritizeContextElements([]);
    expect(result).to.be.an('array');
  });
});
