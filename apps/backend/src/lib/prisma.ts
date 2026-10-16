// Singleton Prisma client instance
import { PrismaClient } from '@prisma/client';

// Cap Prisma's internal connection pool for Supabase's transaction-mode pooler.
// Supabase uses pgBouncer in transaction mode — use a modest pool that can handle
// concurrent scheduler ticks, WebSocket auth, and HTTP requests simultaneously.
function buildDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'] ?? '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('connection_limit', '10');
    parsed.searchParams.set('pool_timeout', '15');
    return parsed.toString();
  } catch {
    return url;
  }
}

const prisma = new PrismaClient({
  log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: { url: buildDatabaseUrl() },
  },
});

export default prisma;
