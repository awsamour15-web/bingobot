// Singleton Prisma client instance
import { PrismaClient } from '@prisma/client';

// Using Neon pooler endpoint — set connection_limit=1 so Prisma doesn't open
// multiple connections against the pooler (the pooler manages the real pool).
const prisma = new PrismaClient();

export default prisma;
