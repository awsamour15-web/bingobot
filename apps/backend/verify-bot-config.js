#!/usr/bin/env node

/**
 * Bot Configuration Verification Script
 * 
 * This script verifies that the bot is properly configured and
 * tests the agent invitation link generation.
 */

import 'dotenv/config';
import { Bot } from 'grammy';

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;

console.log('\n=== Bot Configuration Verification ===\n');

// Check environment variables
console.log('1. Environment Variables:');
console.log(`   BOT_TOKEN: ${BOT_TOKEN ? '✓ Set' : '✗ Missing'}`);
console.log(`   BOT_USERNAME: ${BOT_USERNAME ? `✓ ${BOT_USERNAME}` : '✗ Missing'}\n`);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not set in .env file');
  process.exit(1);
}

// Verify bot with Telegram API
console.log('2. Verifying bot with Telegram API...');
const bot = new Bot(BOT_TOKEN);

try {
  const me = await bot.api.getMe();
  console.log(`   ✓ Bot connected successfully`);
  console.log(`   Bot ID: ${me.id}`);
  console.log(`   Bot Username: @${me.username}`);
  console.log(`   Bot Name: ${me.first_name}\n`);

  // Check if BOT_USERNAME matches
  if (BOT_USERNAME !== me.username) {
    console.log('⚠️  WARNING: BOT_USERNAME mismatch!');
    console.log(`   .env file has: ${BOT_USERNAME}`);
    console.log(`   Telegram says: ${me.username}`);
    console.log(`\n   Please update your .env file to:`);
    console.log(`   BOT_USERNAME="${me.username}"\n`);
  } else {
    console.log('✓ BOT_USERNAME matches Telegram username\n');
  }

  // Test invitation link generation
  console.log('3. Testing Agent Invitation Links:');
  const testAgentId = 'test-agent-123';
  const agentActivationLink = `https://t.me/${me.username}?start=agent_${testAgentId}`;
  const playerInviteLink = `https://t.me/${me.username}?start=ref_agent_${testAgentId}`;

  console.log(`   Agent Activation: ${agentActivationLink}`);
  console.log(`   Player Invite: ${playerInviteLink}\n`);

  console.log('✅ Configuration looks good!\n');
  
} catch (error) {
  console.error('❌ Error connecting to Telegram:', error.message);
  process.exit(1);
}

process.exit(0);
