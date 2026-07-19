#!/usr/bin/env bash
# =============================================================================
# Roll back to a previously CI-built image tag (a git SHA pushed to GHCR).
#
# Every push to development-dev tags images as:
#   ghcr.io/<owner>/inventory-backend:<git-sha>
#   ghcr.io/<owner>/inventory-frontend:<git-sha>
# This script pulls a prior tag and recreates the containers on it.
#
# Usage:
#   ./scripts/rollback.sh <github-owner-or-org> <git-sha-or-tag>
# Example:
#   ./scripts/rollback.sh myuser 4cc833c
# =============================================================================
set -euo pipefail

OWNER="${1:?usage: rollback.sh <ghcr-owner> <tag>}"
TAG="${2:?usage: rollback.sh <ghcr-owner> <tag>}"

cd "$(dirname "$0")/.."

echo "==> Rolling back to ghcr.io/${OWNER}/inventory-{backend,frontend}:${TAG}"
export IMAGE_OWNER="$OWNER"
export IMAGE_TAG="$TAG"

echo "==> Pulling rollback images..."
docker compose -f docker-compose.yml pull backend frontend

echo "==> Recreating containers on rollback images (pgdata preserved)..."
docker compose -f docker-compose.yml up -d --remove-orphans

echo "==> Waiting for the backend to become healthy..."
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
  echo "ERROR: backend did not become healthy after rollback. Logs:" >&2
  docker compose -f docker-compose.yml logs --tail=100 backend >&2 || true
  exit 1
fi

echo ""
echo "✅ Rolled back to ${TAG}"
echo "   (If this is wrong, re-run deploy.sh to return to the latest source build.)"
