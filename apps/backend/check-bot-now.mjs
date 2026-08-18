#!/usr/bin/env node

import { Bot } from 'grammy';
import 'dotenv/config';

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('    BOT CONFIGURATION CHECK');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📋 Current .env Configuration:');
console.log(`   BOT_TOKEN: ${BOT_TOKEN ? '✓ Set (8643757251:...)' : '✗ Missing'}`);
console.log(`   BOT_USERNAME: ${BOT_USERNAME ? `"${BOT_USERNAME}"` : '✗ Missing'}\n`);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing!\n');
  process.exit(1);
}

console.log('🔍 Checking with Telegram API...\n');

const bot = new Bot(BOT_TOKEN);

try {
  const me = await bot.api.getMe();
  
  console.log('✅ Bot found on Telegram:');
  console.log(`   Bot ID: ${me.id}`);
  console.log(`   Bot Name: ${me.first_name}`);
  console.log(`   Bot Username: @${me.username}`);
  console.log(`   Bot Link: https://t.me/${me.username}\n`);

  // Check match
  if (BOT_USERNAME === me.username) {
    console.log('✅ CONFIGURATION IS CORRECT!\n');
    console.log(`   Your .env has: BOT_USERNAME="${BOT_USERNAME}"`);
    console.log(`   Telegram says: @${me.username}`);
    console.log(`   ✓ They match!\n`);
    
    // Test link generation
    const testAgentId = 'abc-123-xyz';
    console.log('📍 Agent Invitation Links:');
    console.log(`   Agent Activation: https://t.me/${me.username}?start=agent_${testAgentId}`);
    console.log(`   Player Invite: https://t.me/${me.username}?start=ref_agent_${testAgentId}\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All good! Agent links should work correctly.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } else {
    console.log('⚠️  CONFIGURATION MISMATCH FOUND!\n');
    console.log('   Your .env has:');
    console.log(`   BOT_USERNAME="${BOT_USERNAME}"`);
    console.log('');
    console.log('   But Telegram says the actual username is:');
    console.log(`   @${me.username}`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ ACTION REQUIRED:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('   Update your .env file to:');
    console.log(`   BOT_USERNAME="${me.username}"`);
    console.log('');
    console.log('   Then restart your backend server.\n');
    
    // Show current broken links
    const testAgentId = 'abc-123-xyz';
    console.log('⚠️  Current (broken) links:');
    console.log(`   https://t.me/${BOT_USERNAME}?start=agent_${testAgentId}`);
    console.log('');
    console.log('✓  Correct links should be:');
    console.log(`   https://t.me/${me.username}?start=agent_${testAgentId}\n`);
  }

} catch (error) {
  console.error('❌ Error connecting to Telegram:');
  console.error(`   ${error.message}\n`);
  
  if (error.message.includes('401')) {
    console.error('   This means BOT_TOKEN is invalid or expired.');
    console.error('   Get a new token from @BotFather on Telegram.\n');
  }
  
  process.exit(1);
}

process.exit(0);
