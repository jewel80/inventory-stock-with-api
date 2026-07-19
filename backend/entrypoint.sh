#!/bin/sh
# Container startup: migrate → seed (non-fatal) → exec the app.
# Runs as the non-root `node` user. Invoked under tini (PID 1).
set -eu

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Seeding initial data (idempotent)..."
# Seeding is best-effort: it may already be done, or the supplier API may be
# briefly unreachable. Either way the app should still start.
node scripts/seed.js || echo "[entrypoint] Seed step warned (non-fatal); continuing."

echo "[entrypoint] Starting application..."
# Hand off to the image CMD / compose command so it becomes PID 1's child.
exec "$@"
