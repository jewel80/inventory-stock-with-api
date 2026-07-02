const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { runSync } = require('../services/syncService');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Sync failed', message: err.message });
  }
});

module.exports = router;
