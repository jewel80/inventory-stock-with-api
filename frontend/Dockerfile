# syntax=docker/dockerfile:1

# =====================================================================
# Stage 1 — build the Vite React SPA
# =====================================================================
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =====================================================================
# Stage 2 — serve static assets with non-root nginx
# nginxinc/nginx-unprivileged runs as UID 101 and listens on 8080
# (binding ports <1024 requires root, which we deliberately avoid).
# =====================================================================
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

LABEL org.opencontainers.image.title="inventory-frontend" \
      org.opencontainers.image.description="Inventory management React SPA (nginx)"

# Replace the default vhost with our hardened config (listens on 8080).
COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf

# Ship the built assets.
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

USER 101

CMD ["nginx", "-g", "daemon off;"]
