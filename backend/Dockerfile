FROM node:22-slim

WORKDIR /app

# Install OpenSSL — required by Prisma's schema engine at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies first (layer-cached separately from source)
COPY package*.json ./
RUN npm ci

# Generate Prisma client against the schema
COPY prisma ./prisma
RUN npx prisma generate

# Copy application source and seed script
COPY src ./src
COPY scripts ./scripts
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3001

# entrypoint.sh: migrate → seed → start
ENTRYPOINT ["sh", "entrypoint.sh"]
