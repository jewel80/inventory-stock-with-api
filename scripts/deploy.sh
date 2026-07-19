#!/usr/bin/env bash
# =============================================================================
# Local deployment — rebuild images from source and (re)create containers.
#
# This rebuilds the backend & frontend images, stops the old containers,
# recreates them, and waits until the backend reports healthy.
# The Postgres `pgdata` volume is PRESERVED (no -v on down/up).
# `restart: unless-stopped` in docker-compose.yml auto-restarts crashed
# containers.
#
# Usage:
#   ./scripts/deploy.sh                 # rebuild from current source
#   IMAGE_OWNER=myname ./scripts/deploy.sh   # then pull prebuilt GHCR images
# =============================================================================
set -euo pipefail

# Always run from the repo root (where docker-compose.yml lives).
cd "$(dirname "$0")/.."

if [ "${IMAGE_OWNER:-}" != "" ]; then
  echo "==> Pulling prebuilt images for owner '${IMAGE_OWNER}' (tag=${IMAGE_TAG:-latest})..."
  docker compose -f docker-compose.yml pull backend frontend
  docker compose -f docker-compose.yml up -d --remove-orphans
else
  echo "==> Building images from source & (re)creating containers..."
  docker compose -f docker-compose.yml up -d --build --remove-orphans
fi

echo "==> Waiting for the backend to become healthy (up to 5 min)..."
healthy=""
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    echo "    Backend healthy after ~$((i * 5))s"
    healthy="1"
    break
  fi
  sleep 5
done

if [ -z "$healthy" ]; then
  echo "ERROR: backend did not become healthy in time. Recent logs:" >&2
  docker compose -f docker-compose.yml logs --tail=100 backend >&2 || true
  exit 1
fi

echo ""
echo "==> Stack status:"
docker compose -f docker-compose.yml ps

cat <<'EOF'

✅ Deployed.
   Frontend : http://localhost:9000
   API      : http://localhost:8000
   Health   : http://localhost:8000/health
EOF
