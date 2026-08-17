import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkChannel() {
  try {
    const config = await prisma.config.findUnique({ 
      where: { key: 'required_channel' } 
    });
    
    console.log('=== Channel Integration Check ===');
    console.log('Config:', config);
    console.log('Value:', config?.value || '(empty/disabled)');
    console.log('Trimmed:', config?.value?.trim() || '(empty)');
    console.log('Status:', config?.value?.trim() ? '✅ ENABLED' : '❌ DISABLED');
    
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkChannel();
