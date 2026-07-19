require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const logger = require('./lib/logger');
const prisma = require('./lib/prisma');
const { checkReadiness } = require('./lib/health');

const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const productRoutes = require('./routes/products');
const reorderRoutes = require('./routes/reorders');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

// ── Security headers (OWASP basics: CSP, HSTS, no-sniff, frameguard, …) ───────
app.use(helmet());

// ── Request logging (Pino). Suppress noisy health-probe logs. ─────────────────
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health' || req.url === '/health/ready',
    },
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:9000')
  .split(',')
  .map((o) => o.trim());
app.use(
  cors({
    origin: (origin, cb) => {
      // allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());

// ── Health endpoints ──────────────────────────────────────────────────────────
// Liveness: process is up and serving. Intentionally cheap (no I/O) so Docker
// and CI can poll it frequently. Backward compatible with the old `{ ok: true }`.
app.get('/health', (req, res) => res.json({ status: 'ok', ok: true }));

// Readiness: the process can serve real traffic (database reachable).
app.get('/health/ready', async (req, res) => {
  const result = await checkReadiness();
  res.status(result.db ? 200 : 503).json(result);
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reorders', reorderRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler (4-arg signature required by Express) ───────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start & graceful shutdown ─────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, node_env: process.env.NODE_ENV }, 'Server running');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(() => logger.info('HTTP server closed'));
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (err) {
    logger.error({ err }, 'Error disconnecting database');
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
