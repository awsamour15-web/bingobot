# Use Node.js 22 with Alpine for smaller image size
FROM node:22-alpine AS base

# Install OpenSSL and other dependencies
RUN apk add --no-cache openssl bash

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm db:generate

# Build the application
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

RUN apk add --no-cache openssl bash
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy built files and dependencies
COPY --from=base /app ./

# Expose the port your app runs on
EXPOSE 3000

# Run migrations and start the app
CMD cd apps/backend && npx prisma migrate deploy && node dist/index.js
