# InventoryStock

Internal web application for tracking product inventory sourced from a third-party supplier API (DummyJSON).

## Tech Stack

- **Backend** — Node.js · Express · Prisma ORM
- **Frontend** — React · Vite · React Router
- **Database** — PostgreSQL
- **Supplier API** — [dummyjson.com](https://dummyjson.com)

## Project Structure

```
inventoryStock/
├── backend/
│   ├── prisma/schema.prisma     # DB schema
│   ├── scripts/seed.js          # Creates admin user + runs first sync
│   └── src/
│       ├── index.js             # Express app entry point
│       ├── lib/
│       │   ├── prisma.js        # Shared Prisma client
│       │   └── status.js        # computeStatus() pure function
│       ├── middleware/auth.js   # JWT bearer auth middleware
│       ├── routes/              # Express routers
│       ├── services/
│       │   └── syncService.js  # Supplier sync logic
│       └── tests/               # Jest unit tests
└── frontend/
    └── src/
        ├── api/                 # Axios client + endpoint helpers
        ├── components/          # StatusBadge, ProductTable, ReorderModal, ...
        ├── context/             # AuthContext (JWT + localStorage)
        └── pages/               # Dashboard, Reorders, Login
```

## Quick Start — Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

That single command:
1. Starts PostgreSQL 16
2. Runs `prisma migrate deploy` (applies the initial migration)
3. Seeds the admin user and runs the first product sync from DummyJSON
4. Builds the React app and serves it via nginx

Open **http://localhost:9000** — login with `admin` / `password`.

### Useful Docker commands

```bash
# Run in background
docker compose up --build -d

# View logs
docker compose logs -f backend

# Stop everything (data is preserved in the pgdata volume)
docker compose down

# Reset everything including the database
docker compose down -v

# Re-run seed manually (e.g. after a reset)
docker compose exec backend node scripts/seed.js
```

### Changing secrets for production

Edit the `docker-compose.yml` environment blocks (or use a `docker-compose.override.yml`):

| Variable | Default | Change to |
|----------|---------|-----------|
| `POSTGRES_PASSWORD` | `inventory_secret` | strong random string |
| `JWT_SECRET` | `change-me-...` | long random string |

---

## Manual Setup (without Docker)

### Prerequisites

- Node.js ≥ 18
- PostgreSQL (local or hosted)

## Setup

### 1. Create the database

```bash
createdb inventorystock
```

### 2. Configure and migrate the backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET at minimum
npm install
npx prisma migrate dev --name init
npm run db:seed        # creates admin user and runs the first product sync
```

### 3. Install frontend dependencies

```bash
cd ../frontend
npm install
```

## Running

Start both servers (each in its own terminal):

```bash
# Terminal 1 — backend (port 8000)
cd backend
npm run dev

# Terminal 2 — frontend (port 9000)
cd frontend
npm run dev
```

Open **http://localhost:9000** and log in with:

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `password` |

Change the password after first login by updating the user record directly in the database or building a change-password endpoint.

## Environment Variables

All variables live in `backend/.env`. Copy from `.env.example`.

| Variable           | Default                   | Description                          |
|--------------------|---------------------------|--------------------------------------|
| `DATABASE_URL`     | *(required)*              | PostgreSQL connection string         |
| `JWT_SECRET`       | *(required)*              | Secret used to sign JWTs             |
| `SUPPLIER_API_URL` | `https://dummyjson.com`   | Base URL for supplier catalogue API  |
| `PORT`             | `8000`                    | Backend server port                  |
| `FRONTEND_URL`     | `http://localhost:9000`   | Allowed CORS origin                  |

## API Reference

All routes (except `POST /api/auth/login`) require a `Authorization: Bearer <token>` header.

### Auth
| Method | Path               | Body                          | Description          |
|--------|--------------------|-------------------------------|----------------------|
| POST   | `/api/auth/login`  | `{ username, password }`      | Returns JWT token    |

### Sync
| Method | Path        | Description                                      |
|--------|-------------|--------------------------------------------------|
| POST   | `/api/sync` | Fetches full catalogue and upserts to local DB   |

### Products
| Method | Path                           | Query / Body             | Description                     |
|--------|--------------------------------|--------------------------|---------------------------------|
| GET    | `/api/products`                | `status, category, search, page, limit` | Paginated product list |
| GET    | `/api/products/categories`     |                          | Distinct category list           |
| GET    | `/api/products/:id`            |                          | Product detail + reorder history |
| PATCH  | `/api/products/:id/threshold`  | `{ threshold }`          | Set low-stock threshold          |

### Reorders
| Method | Path                          | Body / Notes                                  | Description                          |
|--------|-------------------------------|-----------------------------------------------|--------------------------------------|
| POST   | `/api/reorders`               | `{ product_id, quantity_requested, requested_by }` | Create reorder            |
| GET    | `/api/reorders`               | `?status=`                                    | List reorders                        |
| PATCH  | `/api/reorders/:id/status`    |                                               | Advance: requested→approved→ordered  |
| POST   | `/api/reorders/:id/receive`   |                                               | Mark received, increment stock       |

### Dashboard
| Method | Path                    | Description                                            |
|--------|-------------------------|--------------------------------------------------------|
| GET    | `/api/dashboard/summary`| Counts + last sync timestamp                           |

## Running Tests

```bash
cd backend
npm test
```

Tests cover three units:

| File                       | What it tests                                                          |
|----------------------------|------------------------------------------------------------------------|
| `tests/status.test.js`     | `computeStatus()` — all stock/threshold combinations                   |
| `tests/sync.test.js`       | Upsert logic: new products get `internal_stock = supplier_stock`; existing products preserve it; idempotency; API failure handling |
| `tests/reorder.test.js`    | Stock increment after receive; status recomputation across scenarios    |

## Key Design Decisions

- **`internal_stock` is set once** at first sync and only changes when a reorder is received. Subsequent syncs update `supplier_stock` but never touch `internal_stock`.
- **Sync is idempotent** — running it twice in a row will produce zero new rows and update counts equal to the catalogue size.
- **Supplier API failures** are caught, logged to `sync_logs.errors`, and return a `502` to the caller. Partial failures (individual products) are also collected rather than aborting the entire sync.
- **Status is computed server-side** whenever `internal_stock` or `threshold` changes (sync, threshold patch, receive reorder).
- **JWT auth** with a 24 h expiry. The 401 interceptor in the frontend clears localStorage and redirects to `/login`.
