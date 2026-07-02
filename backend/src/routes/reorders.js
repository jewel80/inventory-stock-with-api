const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { computeStatus } = require('../lib/status');

const router = express.Router();

// requested → approved → ordered; ordered → received via /receive
const STATUS_TRANSITIONS = {
  requested: 'approved',
  approved: 'ordered',
};

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { product_id, quantity_requested, requested_by } = req.body;

    if (!product_id || !quantity_requested || !requested_by) {
      return res.status(400).json({ error: 'product_id, quantity_requested, and requested_by are required' });
    }
    if (parseInt(quantity_requested) < 1) {
      return res.status(400).json({ error: 'quantity_requested must be at least 1' });
    }

    const product = await prisma.product.findUnique({ where: { id: parseInt(product_id) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const reorder = await prisma.reorder.create({
      data: {
        product_id: parseInt(product_id),
        quantity_requested: parseInt(quantity_requested),
        requested_by,
        status: 'requested',
      },
      include: { product: true },
    });

    res.status(201).json(reorder);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;

    const reorders = await prisma.reorder.findMany({
      where,
      include: {
        product: {
          select: { id: true, title: true, brand: true, category: true, internal_stock: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json(reorders);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const reorder = await prisma.reorder.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!reorder) return res.status(404).json({ error: 'Reorder not found' });

    const nextStatus = STATUS_TRANSITIONS[reorder.status];
    if (!nextStatus) {
      return res.status(400).json({
        error: `Cannot advance status from '${reorder.status}'. Use the /receive endpoint for ordered reorders.`,
      });
    }

    const updated = await prisma.reorder.update({
      where: { id: parseInt(req.params.id) },
      data: { status: nextStatus },
      include: { product: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/receive', requireAuth, async (req, res, next) => {
  try {
    const reorder = await prisma.reorder.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { product: true },
    });

    if (!reorder) return res.status(404).json({ error: 'Reorder not found' });
    if (reorder.status === 'received') {
      return res.status(400).json({ error: 'Reorder already received' });
    }

    const newInternalStock = reorder.product.internal_stock + reorder.quantity_requested;
    const newStatus = computeStatus(newInternalStock, reorder.product.threshold);

    const [updatedReorder] = await prisma.$transaction([
      prisma.reorder.update({
        where: { id: parseInt(req.params.id) },
        data: { status: 'received', received_at: new Date() },
        include: { product: true },
      }),
      prisma.product.update({
        where: { id: reorder.product_id },
        data: { internal_stock: newInternalStock, status: newStatus },
      }),
    ]);

    res.json(updatedReorder);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
