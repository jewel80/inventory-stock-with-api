# Inventory Stock Management — Full-Stack + Production CI/CD

Internal web application for tracking product inventory sourced from a
third-party supplier API ([DummyJSON](https://dummyjson.com)). Built as an
**Express + Prisma + PostgreSQL** API with a **React (Vite)** SPA front-end,
shipped through a hardened **Docker** setup and a complete **GitHub Actions**
CI/CD pipeline.

> Branch model: **`development-dev`** is the primary development branch. Pushing
> to it runs the full pipeline (lint → test → build → docker → security →
> compose validation → notify).

---

## Table of contents

1. [Architecture](#architecture)
2. [Tech stack](#tech-stack)
3. [Quick start (Docker — recommended)](#quick-start-docker--recommended)
4. [Local development (non-Docker)](#local-development-non-docker)
5. [Docker commands reference](#docker-commands-reference)
6. [Environment variables](#environment-variables)
7. [Health checks](#health-checks)
8. [Logging](#logging)
9. [CI/CD pipeline](#cicd-pipeline)
10. [Continuous deployment](#continuous-deployment)
11. [Deployment flow](#deployment-flow)
12. [Rollback strategy](#rollback-strategy)
13. [Security](#security)
14. [API reference](#api-reference)
15. [Key design decisions](#key-design-decisions)
16. [Running tests](#running-tests)
17. [Troubleshooting](#troubleshooting)
18. [Project structure](#project-structure)

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │                  Browser                     │
                    │            http://localhost:9000             │
                    └───────────────────────┬─────────────────────┘
                                            │
                          ┌─────────────────▼──────────────────┐
                          │  frontend  (nginx-unprivileged:8080)│
                          │  React SPA + reverse proxy /api/*   │
                          └─────────────────┬──────────────────┘
                            bridge network  │  (appnet)
                          ┌─────────────────▼──────────────────┐
                          │  backend  (node:22-slim, non-root) │
                          │  Express + Prisma + Helmet + Pino  │
                          │  GET /health   GET /health/ready    │
                          └─────┬───────────────────────┬───────┘
                                │                       │
                  ┌─────────────▼──────────┐   ┌────────▼─────────┐
                  │  postgres:16-alpine    │   │  dummyjson.com   │
                  │  volume: pgdata        │   │  supplier API    │
                  └────────────────────────┘   └──────────────────┘
```

- **backend** connects to **postgres** over the `appnet` bridge network using the
  service DNS name `postgres:5432`. It is **never** your local host Postgres.
- **frontend** (nginx) serves the built React bundle and proxies `/api/*` and
  `/health` to `backend:8000`.
- On first start, the backend **migrates**, **seeds** an admin user, and
  **syncs** the product catalog from the supplier API.

## Tech stack

| Layer      | Technology |
|------------|-----------|
| API        | Node.js 22 LTS, Express 4, Prisma 5 ORM |
| Database   | PostgreSQL 16 (Alpine) |
| Frontend   | React 18, Vite 5, React Router, served by nginx-unprivileged |
| Logging    | Pino + pino-http (JSON in prod, pretty in dev) |
| Security   | helmet, bcryptjs, JWT, non-root containers, read-only FS |
| Containers | Docker (multi-stage), Docker Compose v2 |
| CI/CD      | GitHub Actions, GHCR, Trivy, Dependabot |
| Supplier   | [dummyjson.com](https://dummyjson.com) |

---

## Quick start (Docker — recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker 24+, Compose v2).
**No local Postgres needed.**

```bash
# 1. (optional) defaults work without this thanks to interpolation
cp .env.example .env

# 2. Build & start everything (dev profile = auto-loads docker-compose.override.yml)
docker compose up -d --build

# 3. Verify health
curl http://localhost:8000/health          # {"status":"ok","ok":true}
curl http://localhost:9000/health          # via nginx -> backend
```

That single command:

1. Starts **PostgreSQL 16** (data persisted in the `pgdata` volume)
2. Runs **`prisma migrate deploy`** (applies migrations)
3. **Seeds** the admin user and runs the first product **sync** from DummyJSON
4. Builds the **React** app and serves it via **nginx**
5. Waits on healthchecks before reporting services ready

Open **http://localhost:9000** — log in with `admin` / `password`.

> First boot migrates + seeds + syncs ~194 products — allow **~90s**
> (`start_period`) before the backend healthcheck turns green.

### Production-style run (skips the dev override)

```bash
docker compose -f docker-compose.yml up -d --build
```

Builds the lean production images (`--omit=dev`, non-root, `NODE_ENV=production`),
with **no** source bind-mounts and **no** host-exposed DB port.

---

## Local development (non-Docker)

Run the API against your **own local Postgres** and the Vite dev server with HMR.

```bash
# --- Database (your local Postgres) ---
# backend/.env already targets your local instance; adjust DATABASE_URL if needed:
#   DATABASE_URL="postgresql://postgres:Admin@123@localhost:5432/inventorystock"

cd backend
npm install
npx prisma migrate dev        # create/apply migrations
npm run db:seed               # seed admin user + initial product sync
npm run dev                   # nodemon, API on :8000

# --- Frontend (HMR, proxies /api -> :8000) ---
cd ../frontend
npm install
npm run dev                   # Vite on :9000
```

Backend scripts:

| Script | Purpose |
|--------|---------|
| `npm run dev` | nodemon (hot reload) |
| `npm start` | `node src/index.js` (production-style) |
| `npm test` | Jest (`--runInBand`) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint `--fix` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (used by the container) |
| `npm run db:seed` | seed admin + sync |
| `npm run db:studio` | Prisma Studio GUI |

---

## Docker commands reference

```bash
# Build & start (dev)             docker compose up -d --build
# Build & start (prod-style)      docker compose -f docker-compose.yml up -d --build
# Tail logs                       docker compose logs -f backend
# List containers / health        docker compose ps
# Recreate one service            docker compose up -d --build backend
# Stop (keep data)                docker compose stop
# Stop & remove containers        docker compose down
# Stop & remove containers+data   docker compose down -v   # ⚠ deletes pgdata
# DB shell                        docker compose exec postgres psql -U inventory -d inventorystock
# Re-run seed                     docker compose exec backend node scripts/seed.js
```

---

## Environment variables

### Which file is used when?

| Scenario | Source of truth |
|----------|-----------------|
| Non-Docker local dev | `backend/.env` (loaded by `dotenv`) — **gitignored** |
| Docker **dev** (`docker compose up`) | `docker-compose.yml` + `docker-compose.override.yml`; values via `${VAR:-default}` interpolation (works out of the box) |
| Docker **prod-style** | `docker-compose.yml` only; override via root `.env` or real env vars |
| **CI** runner | GitHub secrets / built-in `GITHUB_TOKEN`; no `.env` committed |
| Rollback | `IMAGE_OWNER` / `IMAGE_TAG` env vars select a prior GHCR image |

### Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://inventory:inventory_secret@postgres:5432/inventorystock` | Postgres connection (service DNS `postgres` in Docker) |
| `JWT_SECRET` | `change-me-to-a-long-random-secret` | JWT signing secret — **change in prod (≥32 chars)** |
| `SUPPLIER_API_URL` | `https://dummyjson.com` | External product catalog API |
| `PORT` | `8000` | Express listen port |
| `FRONTEND_URL` | `http://localhost:9000` | Comma-separated allowed CORS origins |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Pino level: trace\|debug\|info\|warn\|error\|fatal |
| `NODE_ENV` | `production` (base) / `development` (override) | Node runtime env |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `inventorystock` / `inventory` / `inventory_secret` | Postgres container creds (also drive `DATABASE_URL`) |
| `IMAGE_OWNER` / `IMAGE_TAG` | `local` / `latest` | GHCR image namespace + tag (deploy/rollback) |

Committed placeholder files: `backend/.env.example`, `backend/.env.development`,
`backend/.env.production`, and root `.env.example`. Real `.env` files are
gitignored — **never commit secrets**.

---

## Health checks

| Endpoint | Purpose | Behavior |
|----------|---------|----------|
| `GET /health` | **Liveness** | `200 {"status":"ok","ok":true}` when the process is up. Cheap; no DB hit. Used by Docker/CI. |
| `GET /health/ready` | **Readiness** | `200 {"status":"ok","db":true}` when Postgres is reachable; `503 {"status":"degraded","db":false,...}` otherwise (pings `SELECT 1`). |

Docker healthchecks poll `/health`; the CI `compose-validate` job requires `200`
before the pipeline passes.

---

## Logging

Production logs use **Pino**:

- **Production** (`NODE_ENV=production`): newline-delimited **JSON** to stdout —
  ideal for `docker logs` and log shippers (Loki, Datadog, CloudWatch).
- **Development**: colorized human-readable output via `pino-pretty`.
- Every HTTP request is logged by `pino-http` (health-probe paths are suppressed).
- **Secrets are redacted** (`password`, `token`, `authorization`, `JWT_SECRET`,
  `DATABASE_URL`) so they never appear in logs.

---

## CI/CD pipeline

File: [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Triggers on push to
`development-dev` and on PRs. Fail-fast: every stage gates the next.

```
 push / PR to development-dev
            │
            ▼
 ┌──────────────────────────┐
 │ 1. lint-test-build        │  ESLint · Jest (18 tests) · prisma generate · vite build
 └─────────────┬─────────────┘
               ▼
 ┌──────────────────────────┐
 │ 2. docker                 │  Buildx build → push backend+frontend to GHCR (SHA + latest)
 └─────────────┬─────────────┘
               ▼
 ┌──────────────────────────┐
 │ 3. security               │  npm audit · Trivy fs + 2 image scans · SARIF → Security tab · SBOM
 └─────────────┬─────────────┘
               ▼
 ┌──────────────────────────┐
 │ 4. compose-validate       │  Boots the full stack; requires /health 200; then down -v
 └─────────────┬─────────────┘
               ▼
 ┌──────────────────────────┐
 │ 5. notify (always)        │  Job summary (+ optional email/Slack); fails if any stage failed
 └──────────────────────────┘
```

| Stage | Fails the pipeline if… |
|-------|------------------------|
| lint-test-build | ESLint error, test failure, Prisma schema error, or Vite build failure |
| docker | Image build or GHCR push fails |
| security | `npm audit` finds high+ vulns, or Trivy finds HIGH/CRITICAL issues |
| compose-validate | The stack fails to build or `/health` never returns 200 |
| notify | Any of the above failed |

Deep-dive (secrets, SARIF, adding stages): **[docs/CICD.md](docs/CICD.md)**.

---

## Continuous deployment

Per the project's learning scope, **CD runs locally via Docker Compose**. The CI
`compose-validate` job is the deploy proxy: it boots the exact same
`docker-compose.yml` on the GitHub runner and proves the deployment becomes
healthy before the run is considered successful.

CI also publishes immutable artifacts to **GHCR** on every successful run:

```
ghcr.io/<owner>/inventory-backend:<git-sha>   and   :latest
ghcr.io/<owner>/inventory-frontend:<git-sha>  and   :latest
```

---

## Deployment flow

```bash
# Windows (PowerShell)              # macOS/Linux (bash)
.\scripts\deploy.ps1                ./scripts/deploy.sh
```

The deploy script:

1. `docker compose up -d --build --remove-orphans` — **stops old containers**,
   **rebuilds** images, **recreates** changed containers.
2. Preserves the **`pgdata` volume** (no `-v`) — your data survives.
3. Polls `http://localhost:8000/health` until `200` (up to 5 min), printing logs
   on failure.
4. `restart: unless-stopped` in compose **auto-restarts crashed containers**.

To deploy prebuilt GHCR images instead of rebuilding from source:

```bash
# bash
IMAGE_OWNER=<your-github-user> ./scripts/deploy.sh
# PowerShell
$env:IMAGE_OWNER='<your-github-user>'; .\scripts\deploy.ps1
```

---

## Rollback strategy

Every push tags images by git SHA in GHCR, giving instant, immutable rollback
targets.

```bash
# bash
./scripts/rollback.sh <your-github-user> <git-sha>
# PowerShell
.\scripts\rollback.ps1 <your-github-user> <git-sha>
```

The rollback script sets `IMAGE_OWNER`/`IMAGE_TAG`, **pulls the prior images**,
and recreates the containers on them — the **database volume is preserved**.

Find prior SHAs from the GitHub Actions run history or:

```bash
docker images 'ghcr.io/<owner>/inventory-*' --format '{{.Repository}}:{{.Tag}}'
```

To return to the latest source build, re-run `deploy.sh` / `deploy.ps1`.

---

## Security

- **Non-root containers** — backend runs as `node` (uid 1000); frontend as nginx
  `unprivileged` (uid 101).
- **Multi-stage, minimal images** — `node:22-slim` + `nginx-unprivileged`; prod
  deps only (`npm ci --omit=dev`).
- **Read-only root filesystem** on the backend (`read_only: true` + `tmpfs /tmp`).
- **`tini` as PID 1** — proper signal forwarding for graceful shutdown.
- **Security headers** — `helmet` (backend) + X-Frame-Options, no-sniff,
  Referrer-Policy, Permissions-Policy (nginx).
- **Secret handling** — `.env` files gitignored; Pino redacts secrets; CI uses
  `GITHUB_TOKEN` + GitHub Secrets (no committed credentials).
- **DB not published** by default (only exposed on host in the dev override).
- **Scanned** — `npm audit` + Trivy (fs + images) gate the pipeline; SARIF lands
  in the GitHub **Security** tab.

---

## API reference

All routes (except `POST /api/auth/login`) require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | `{ username, password }` | Returns a JWT token |

### Sync
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync` | Fetches the full catalogue and upserts to the local DB |

### Products
| Method | Path | Query / Body | Description |
|--------|------|--------------|-------------|
| GET | `/api/products` | `status, category, search, page, limit` | Paginated product list |
| GET | `/api/products/categories` | | Distinct category list |
| GET | `/api/products/:id` | | Product detail + reorder history |
| PATCH | `/api/products/:id/threshold` | `{ threshold }` | Set low-stock threshold |

### Reorders
| Method | Path | Body / Notes | Description |
|--------|------|--------------|-------------|
| POST | `/api/reorders` | `{ product_id, quantity_requested, requested_by }` | Create reorder |
| GET | `/api/reorders` | `?status=` | List reorders |
| PATCH | `/api/reorders/:id/status` | | Advance: requested→approved→ordered |
| POST | `/api/reorders/:id/receive` | | Mark received, increment stock |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/summary` | Counts + last sync timestamp |

---

## Key design decisions

- **`internal_stock` is set once** at first sync and only changes when a reorder
  is received. Subsequent syncs update `supplier_stock` but never touch
  `internal_stock`.
- **Sync is idempotent** — running it twice produces zero new rows and update
  counts equal to the catalogue size.
- **Supplier API failures** are caught, logged to `sync_logs.errors`, and return
  a `502` to the caller. Partial (per-product) failures are collected rather than
  aborting the entire sync.
- **Status is computed server-side** whenever `internal_stock` or `threshold`
  changes (sync, threshold patch, receive reorder).
- **JWT auth** with a 24h expiry; the frontend 401-interceptor clears storage and
  redirects to `/login`.

---

## Running tests

```bash
cd backend
npm test        # Jest, --runInBand
npm run lint    # ESLint
```

| File | What it tests |
|------|---------------|
| `tests/status.test.js` | `computeStatus()` — all stock/threshold combinations |
| `tests/sync.test.js` | Upsert logic: new products get `internal_stock = supplier_stock`; existing products preserve it; idempotency; API failure handling |
| `tests/reorder.test.js` | Stock increment after receive; status recomputation across scenarios |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Backend healthcheck stays `unhealthy` >90s on first boot | First run migrates + syncs ~194 products. Wait. `docker compose logs backend`. |
| `prisma migrate deploy` can't reach DB | Ensure `postgres` is healthy (`docker compose ps`). `DATABASE_URL` must use host `postgres`, not `localhost`. |
| Port already in use (`8000`/`9000`/`5432`) | Stop the conflicting process or change the host mapping in compose. |
| Windows: host `node_modules` shadows container's | The dev override uses an anonymous `/app/node_modules` volume. Reset: `docker compose down` then `up --build`. |
| Login fails / no admin user | Seed didn't run: `docker compose exec backend node scripts/seed.js`. Default creds: `admin` / `password`. |
| Reset everything (⚠ deletes data) | `docker compose down -v` then `up -d --build`. |
| GHCR push `denied` in CI | Ensure the workflow has `packages: write`; on first push, accept the package prompt on GitHub. |
| Trivy fails the pipeline on a HIGH CVE | Upgrade the package, or temporarily narrow severity. See [docs/CICD.md](docs/CICD.md). |

---

## Project structure

```
.
├── .github/
│   ├── workflows/ci.yml          # 5-stage CI/CD pipeline (11 logical steps)
│   └── dependabot.yml            # automated dependency updates
├── backend/
│   ├── Dockerfile                # multi-stage, non-root, prod deps
│   ├── entrypoint.sh             # migrate → seed → exec app
│   ├── .dockerignore
│   ├── .eslintrc.json
│   ├── prisma/                   # schema + migrations
│   ├── scripts/seed.js
│   └── src/
│       ├── index.js              # Express app (helmet, pino-http, /health)
│       ├── lib/{logger,health,prisma,status}.js
│       ├── middleware/auth.js
│       ├── routes/{auth,sync,products,reorders,dashboard}.js
│       ├── services/syncService.js
│       └── tests/
├── frontend/
│   ├── Dockerfile                # vite build → nginx-unprivileged
│   ├── nginx.conf                # listen 8080, security headers, /api proxy
│   └── .dockerignore
├── scripts/
│   ├── deploy.{sh,ps1}           # rebuild + recreate + health wait
│   └── rollback.{sh,ps1}         # roll back to a prior GHCR SHA tag
├── docs/CICD.md                  # CI/CD deep-dive
├── docker-compose.yml            # production base (postgres + backend + frontend)
├── docker-compose.override.yml   # dev overrides (auto-loaded)
├── .env.example                  # compose interpolation defaults
└── .gitignore
```

---

## License

Provided as-is for learning/internal use.
