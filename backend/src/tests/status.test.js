const { computeStatus } = require('../lib/status');

describe('computeStatus', () => {
  it('returns out_of_stock when internalStock is 0 regardless of threshold', () => {
    expect(computeStatus(0, null)).toBe('out_of_stock');
    expect(computeStatus(0, 10)).toBe('out_of_stock');
    expect(computeStatus(0, 0)).toBe('out_of_stock');
  });

  it('returns low_stock when internalStock <= threshold', () => {
    expect(computeStatus(5, 10)).toBe('low_stock');
    expect(computeStatus(10, 10)).toBe('low_stock');
    expect(computeStatus(1, 5)).toBe('low_stock');
  });

  it('returns in_stock when internalStock > threshold', () => {
    expect(computeStatus(11, 10)).toBe('in_stock');
    expect(computeStatus(100, 5)).toBe('in_stock');
  });

  it('returns in_stock when threshold is null and stock > 0', () => {
    expect(computeStatus(1, null)).toBe('in_stock');
    expect(computeStatus(100, null)).toBe('in_stock');
  });

  it('out_of_stock takes priority over threshold check', () => {
    // Stock is 0, threshold is 0 — still out_of_stock
    expect(computeStatus(0, 0)).toBe('out_of_stock');
  });
});
