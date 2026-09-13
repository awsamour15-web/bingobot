import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config();
const p = new PrismaClient();
p.$queryRawUnsafe('SELECT 1')
  .then(() => console.log('✓ Connected — database is up'))
  .catch(e => console.log('✗ Failed:', e.message))
  .finally(() => p.$disconnect());
