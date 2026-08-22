FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

# ── Build stage ──────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Install all deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Build shared package then backend
RUN pnpm --filter @fidel/shared build
RUN pnpm --filter @fidel/backend exec prisma generate
RUN pnpm --filter @fidel/backend exec tsc

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Install production deps + prisma CLI (needed for migrate deploy)
RUN pnpm install --frozen-lockfile --prod
RUN npm install -g prisma@5.22.0

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

ENV NODE_ENV=production
WORKDIR /app/apps/backend

CMD ["sh", "-c", "prisma migrate deploy || echo 'Migrate failed, continuing...' && node dist/index.js"]
