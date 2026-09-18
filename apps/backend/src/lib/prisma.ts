// Singleton Prisma client instance
import { PrismaClient } from '@prisma/client';

// Cap connection pool to 5 — Render free tier has 512MB RAM.
// Supabase pgbouncer handles the real pooling; Prisma just needs a small slice.
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env['DATABASE_URL'],
    },
  },
  log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
});

export default prisma;
