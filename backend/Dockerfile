# syntax=docker/dockerfile:1

# =====================================================================
# Stage 1 — dependencies & Prisma client generation
# IMPORTANT: this stage MUST use the same base image (and libc) as the
# runner stage, because `prisma generate` emits a platform/libc-specific
# query engine. Building on Alpine (musl) and running on slim (glibc)
# would crash at runtime.
# =====================================================================
FROM node:22-slim AS deps

# OpenSSL + CA certs are required by Prisma's schema/query engine and TLS.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first → layer cache survives source-only changes.
COPY package*.json ./

# INSTALL_DEV=true installs devDependencies (nodemon, pino-pretty, jest).
# Passed by docker-compose.override.yml for local development only.
ARG INSTALL_DEV=false
RUN if [ "$INSTALL_DEV" = "true" ]; then \
      npm ci; \
    else \
      npm ci --omit=dev && npm cache clean --force; \
    fi

# Generate the Prisma client against the committed schema.
COPY prisma ./prisma
RUN npx --no-install prisma generate

# =====================================================================
# Stage 2 — minimal, non-root production runtime
# =====================================================================
FROM node:22-slim AS runner

# OpenSSL (Prisma engine), CA certs (TLS to supplier API), tini (PID 1).
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8000

WORKDIR /app

# node:slim ships a non-root `node` user (uid 1000). Run as it.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER node

EXPOSE 8000

# tini → PID 1: forwards SIGTERM/SIGINT for graceful shutdown, reaps zombies.
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "./entrypoint.sh"]
# Default command; overridden by docker-compose.override.yml in dev.
CMD ["node", "src/index.js"]
