jest.mock('../lib/prisma', () => ({
  syncLog: { create: jest.fn(), update: jest.fn() },
  product: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

jest.mock('axios');

const axios = require('axios');
const prisma = require('../lib/prisma');
const { runSync } = require('../services/syncService');

const supplierProducts = [
  { id: 1, title: 'Product A', brand: 'BrandX', category: 'beauty', price: 9.99, stock: 50, thumbnail: 'http://img/a.jpg' },
  { id: 2, title: 'Product B', brand: 'BrandY', category: 'electronics', price: 199.99, stock: 10, thumbnail: 'http://img/b.jpg' },
];

beforeEach(() => {
  jest.clearAllMocks();
  prisma.syncLog.create.mockResolvedValue({ id: 1 });
  prisma.syncLog.update.mockResolvedValue({});
  prisma.product.create.mockResolvedValue({});
  prisma.product.update.mockResolvedValue({});
});

describe('runSync — new products (empty database)', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({ data: { products: supplierProducts } });
    prisma.product.findMany.mockResolvedValue([]);
  });

  it('creates all supplier products on first sync', async () => {
    const result = await runSync();
    expect(prisma.product.create).toHaveBeenCalledTimes(2);
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
  });

  it('sets internal_stock equal to supplier_stock on insert', async () => {
    await runSync();
    const firstCreate = prisma.product.create.mock.calls[0][0].data;
    expect(firstCreate.internal_stock).toBe(50);
    expect(firstCreate.supplier_stock).toBe(50);
    expect(firstCreate.supplier_id).toBe(1);
  });

  it('does not call update for new products', async () => {
    await runSync();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

describe('runSync — existing products (resync)', () => {
  const existingProducts = [
    { supplier_id: 1, internal_stock: 30, supplier_stock: 50, threshold: null },
    { supplier_id: 2, internal_stock: 10, supplier_stock: 10, threshold: null },
  ];

  beforeEach(() => {
    axios.get.mockResolvedValue({ data: { products: supplierProducts } });
    prisma.product.findMany.mockResolvedValue(existingProducts);
  });

  it('does not overwrite internal_stock on resync', async () => {
    await runSync();
    const updateCall = prisma.product.update.mock.calls[0][0];
    expect(updateCall.data.internal_stock).toBeUndefined();
  });

  it('updates supplier_stock with the latest value from supplier', async () => {
    await runSync();
    const updateCall = prisma.product.update.mock.calls[0][0];
    expect(updateCall.data.supplier_stock).toBe(50);
  });

  it('is idempotent — running twice does not create duplicate products', async () => {
    await runSync();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.update).toHaveBeenCalledTimes(2);
  });
});

describe('runSync — supplier API failure', () => {
  it('logs the error and rethrows', async () => {
    axios.get.mockRejectedValue(new Error('Network timeout'));
    prisma.product.findMany.mockResolvedValue([]);

    await expect(runSync()).rejects.toThrow('Network timeout');
    expect(prisma.syncLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errors: 'Network timeout' }),
      })
    );
  });
});
