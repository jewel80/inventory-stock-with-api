const prisma = require('./prisma');

/**
 * Readiness probe — verifies the process can serve real traffic by confirming
 * the database is reachable. Used by GET /health/ready and (optionally) load
 * balancers. Returns a plain object so the caller can map `db` to an HTTP code.
 */
async function checkReadiness() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: true };
  } catch (err) {
    return { status: 'degraded', db: false, error: err.message };
  }
}

module.exports = { checkReadiness };
