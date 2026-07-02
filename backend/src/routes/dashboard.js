const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const [totalProducts, lowStockCount, outOfStockCount, openReordersCount, lastSync] =
      await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { status: 'low_stock' } }),
        prisma.product.count({ where: { status: 'out_of_stock' } }),
        prisma.reorder.count({ where: { status: { not: 'received' } } }),
        prisma.syncLog.findFirst({
          where: { finished_at: { not: null } },
          orderBy: { finished_at: 'desc' },
          select: { finished_at: true, products_created: true, products_updated: true },
        }),
      ]);

    res.json({ totalProducts, lowStockCount, outOfStockCount, openReordersCount, lastSync });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
