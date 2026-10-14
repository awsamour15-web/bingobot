import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const count = await prisma.player.count();
console.log('Total players:', count);
await prisma.$disconnect();
