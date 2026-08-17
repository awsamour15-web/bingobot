import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function enableChannelGate() {
  try {
    console.log('=== Enabling Channel Membership Gate ===\n');
    
    // IMPORTANT: Replace this with your actual channel username or ID
    // Examples:
    // - Public channel: '@YourChannelUsername' (without the https://t.me/)
    // - Private channel: '-1001234567890' (the numeric chat ID)
    const CHANNEL_ID = '@YourChannel'; // ⚠️ CHANGE THIS!
    
    console.log('⚠️  IMPORTANT: Edit this script and set your channel ID/username first!');
    console.log(`Current value: ${CHANNEL_ID}\n`);
    
    if (CHANNEL_ID === '@YourChannel') {
      console.log('❌ Please edit enable-channel-gate.js and set the correct channel ID');
      console.log('\nExamples:');
      console.log('  Public channel: "@FidelBingo" (use @ prefix)');
      console.log('  Private channel: "-1001234567890" (numeric ID with -100 prefix)\n');
      console.log('To get your channel ID:');
      console.log('  1. Add @getmyid_bot to your channel');
      console.log('  2. Forward a message from the channel to the bot');
      console.log('  3. The bot will show you the channel ID\n');
      await prisma.$disconnect();
      process.exit(1);
    }
    
    // Upsert the required_channel config
    const config = await prisma.config.upsert({
      where: { key: 'required_channel' },
      create: { key: 'required_channel', value: CHANNEL_ID },
      update: { value: CHANNEL_ID }
    });
    
    console.log('✅ Channel gate enabled successfully!');
    console.log('Config:', config);
    console.log('\n📢 All bot users will now be required to join:', CHANNEL_ID);
    console.log('\nIMPORTANT: Make sure your bot is an admin in the channel!');
    console.log('Without admin access, the bot cannot verify membership.\n');
    
    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

enableChannelGate();
