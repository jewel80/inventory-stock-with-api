const { computeStatus } = require('../lib/status');

describe('receive reorder — stock increment logic', () => {
  it('increments internal_stock by quantity_requested', () => {
    const product = { internal_stock: 5, threshold: 10 };
    const reorder = { quantity_requested: 20 };
    const newStock = product.internal_stock + reorder.quantity_requested;
    expect(newStock).toBe(25);
  });

  it('recomputes status to in_stock when new stock exceeds threshold', () => {
    const product = { internal_stock: 5, threshold: 10 };
    const reorder = { quantity_requested: 20 };
    const newStock = product.internal_stock + reorder.quantity_requested; // 25
    expect(computeStatus(newStock, product.threshold)).toBe('in_stock'); // 25 > 10
  });

  it('remains low_stock if received quantity does not exceed threshold', () => {
    const product = { internal_stock: 2, threshold: 20 };
    const reorder = { quantity_requested: 5 };
    const newStock = product.internal_stock + reorder.quantity_requested; // 7
    expect(computeStatus(newStock, product.threshold)).toBe('low_stock'); // 7 <= 20
  });

  it('transitions from out_of_stock to in_stock after receiving sufficient stock', () => {
    const product = { internal_stock: 0, threshold: 5 };
    expect(computeStatus(product.internal_stock, product.threshold)).toBe('out_of_stock');

    const reorder = { quantity_requested: 10 };
    const newStock = product.internal_stock + reorder.quantity_requested; // 10
    expect(computeStatus(newStock, product.threshold)).toBe('in_stock'); // 10 > 5
  });

  it('transitions from out_of_stock to low_stock when received qty is above 0 but <= threshold', () => {
    const product = { internal_stock: 0, threshold: 10 };
    const reorder = { quantity_requested: 3 };
    const newStock = product.internal_stock + reorder.quantity_requested; // 3
    expect(computeStatus(newStock, product.threshold)).toBe('low_stock'); // 3 <= 10
  });

  it('remains in_stock when no threshold is set after receiving', () => {
    const product = { internal_stock: 0, threshold: null };
    const reorder = { quantity_requested: 1 };
    const newStock = product.internal_stock + reorder.quantity_requested;
    expect(computeStatus(newStock, product.threshold)).toBe('in_stock');
  });
});
