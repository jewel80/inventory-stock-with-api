#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Seeding initial data (idempotent)..."
node scripts/seed.js || echo "[entrypoint] Seed warning (non-fatal): continuing."

echo "[entrypoint] Starting API server on port ${PORT:-3001}..."
exec node src/index.js
