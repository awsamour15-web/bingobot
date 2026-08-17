import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function initChannelConfig() {
  try {
    console.log('Initializing channel config...');
    
    const config = await prisma.config.upsert({
      where: { key: 'required_channel' },
      create: { key: 'required_channel', value: '' },
      update: {} // Don't overwrite existing value
    });
    
    console.log('✅ Config initialized:', config);
    console.log('\nYou can now configure the channel from the admin panel:');
    console.log('Settings → Channel Membership Gate');
    
    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

initChannelConfig();
