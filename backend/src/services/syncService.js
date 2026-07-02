const axios = require('axios');
const prisma = require('../lib/prisma');
const { computeStatus } = require('../lib/status');

const SUPPLIER_API = process.env.SUPPLIER_API_URL || 'https://dummyjson.com';

async function runSync() {
  const log = await prisma.syncLog.create({ data: { started_at: new Date() } });

  try {
    const { data } = await axios.get(`${SUPPLIER_API}/products?limit=0`, {
      timeout: 30000,
    });
    const supplierProducts = data.products;

    const existingProducts = await prisma.product.findMany();
    const existingMap = new Map(existingProducts.map(p => [p.supplier_id, p]));

    let created = 0;
    let updated = 0;
    const errors = [];

    for (const sp of supplierProducts) {
      try {
        const existing = existingMap.get(sp.id);

        if (existing) {
          const status = computeStatus(existing.internal_stock, existing.threshold);
          await prisma.product.update({
            where: { supplier_id: sp.id },
            data: {
              title: sp.title,
              brand: sp.brand || null,
              category: sp.category,
              price: sp.price,
              supplier_stock: sp.stock,
              thumbnail_url: sp.thumbnail,
              status,
              last_synced_at: new Date(),
            },
          });
          updated++;
        } else {
          const status = computeStatus(sp.stock, null);
          await prisma.product.create({
            data: {
              supplier_id: sp.id,
              title: sp.title,
              brand: sp.brand || null,
              category: sp.category,
              price: sp.price,
              supplier_stock: sp.stock,
              internal_stock: sp.stock,
              thumbnail_url: sp.thumbnail,
              status,
              last_synced_at: new Date(),
            },
          });
          created++;
        }
      } catch (productError) {
        errors.push(`Product ${sp.id}: ${productError.message}`);
      }
    }

    const errorText = errors.length > 0 ? JSON.stringify(errors) : null;
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        finished_at: new Date(),
        products_created: created,
        products_updated: updated,
        errors: errorText,
      },
    });

    return { created, updated, errors };
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finished_at: new Date(), errors: error.message },
    });
    throw error;
  }
}

module.exports = { runSync };
