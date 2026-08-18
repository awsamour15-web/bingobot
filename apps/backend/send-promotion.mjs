#!/usr/bin/env node
/**
 * Quick script to send promotional images with text
 * Usage: node send-promotion.mjs
 */

import readline from 'readline';

const API_URL = process.env.API_URL || 'http://localhost:3000';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function main() {
  console.log('🎨 Fidel Bingo - Promotion Sender\n');

  // Step 1: Login
  console.log('📝 Step 1: Admin Login');
  const username = await question('Username: ');
  const password = await question('Password: ');

  let token;
  try {
    const loginRes = await fetch(`${API_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!loginRes.ok) {
      console.error('❌ Login failed');
      process.exit(1);
    }

    const loginData = await loginRes.json();
    token = loginData.token;
    console.log('✅ Login successful\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  // Step 2: Choose content type
  console.log('📋 Step 2: Choose Content Type');
  console.log('1. Text only');
  console.log('2. Image with caption');
  console.log('3. Video with caption');
  console.log('4. GIF with caption');
  const typeChoice = await question('Choose (1-4): ');

  const contentTypes = ['text', 'image', 'video', 'gif'];
  const contentType = contentTypes[parseInt(typeChoice) - 1];

  if (!contentType) {
    console.error('❌ Invalid choice');
    process.exit(1);
  }

  // Step 3: Get content
  console.log(`\n📝 Step 3: Enter Content`);
  const title = await question('Promotion Title (for admin reference): ');

  let textContent, mediaFileId, caption;

  if (contentType === 'text') {
    console.log('Enter text content (max 4096 characters):');
    textContent = await question('> ');
  } else {
    console.log('📸 Send the image/video/gif to your bot first, then copy the file_id');
    console.log('Tip: Add this to your bot to get file_id:');
    console.log('  bot.on("message:photo", (ctx) => ctx.reply(`ID: ${ctx.message.photo[0].file_id}`))');
    mediaFileId = await question('\nFile ID: ');
    caption = await question('Caption (max 1024 chars): ');
  }

  // Step 4: Optional bonus
  console.log('\n🎁 Step 4: Optional Bonus (press Enter to skip)');
  const bonusAmountStr = await question('Bonus amount (ETB): ');
  const bonusAmount = bonusAmountStr ? parseFloat(bonusAmountStr) : null;
  let bonusWallet = null;

  if (bonusAmount) {
    const walletChoice = await question('Bonus wallet (main/play): ');
    bonusWallet = walletChoice.toLowerCase() === 'main' ? 'main' : 'play';
  }

  // Step 5: Create promotion
  console.log('\n📤 Creating promotion...');
  
  const promotionData = {
    title,
    content_type: contentType,
    ...(textContent && { text_content: textContent }),
    ...(mediaFileId && { media_file_id: mediaFileId }),
    ...(caption && { caption }),
    ...(bonusAmount && { bonus_amount: bonusAmount, bonus_wallet: bonusWallet }),
  };

  let promotion;
  try {
    const createRes = await fetch(`${API_URL}/api/admin/promotions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(promotionData),
    });

    if (!createRes.ok) {
      const error = await createRes.json();
      console.error('❌ Failed to create promotion:', error.message);
      process.exit(1);
    }

    promotion = await createRes.json();
    console.log(`✅ Promotion created: ${promotion.id}\n`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  // Step 6: Send
  console.log('📨 Step 5: Send Promotion');
  console.log('1. Send to all users (bot broadcast)');
  console.log('2. Send to specific channel');
  console.log('3. Schedule for later');
  console.log('4. Skip (just create, don\'t send)');
  
  const sendChoice = await question('Choose (1-4): ');

  if (sendChoice === '4') {
    console.log(`\n✅ Promotion created but not sent. ID: ${promotion.id}`);
    console.log(`To send later, use: POST /api/admin/promotions/${promotion.id}/send-now`);
    rl.close();
    return;
  }

  if (sendChoice === '3') {
    // Schedule
    const channelIds = (await question('Channel IDs (comma-separated, e.g., @Channel1,-1001234): '))
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    
    console.log('Frequency: once, daily, weekly, monthly');
    const frequency = await question('Frequency: ');
    const sendAt = await question('Send at (ISO format, e.g., 2026-08-20T10:00:00Z): ');

    const scheduleRes = await fetch(`${API_URL}/api/admin/promotions/${promotion.id}/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel_ids: channelIds,
        frequency,
        send_at: sendAt,
      }),
    });

    if (!scheduleRes.ok) {
      const error = await scheduleRes.json();
      console.error('❌ Failed to schedule:', error.message);
      process.exit(1);
    }

    console.log('✅ Promotion scheduled successfully!');
    rl.close();
    return;
  }

  // Send now
  let targets;
  if (sendChoice === '1') {
    targets = [{ id: 'all', name: 'All Users', type: 'bot_broadcast' }];
  } else if (sendChoice === '2') {
    const channelId = await question('Channel ID (@username or -100...): ');
    targets = [{ id: channelId, name: channelId, type: 'channel', channel_id: channelId }];
  }

  console.log('\n📤 Sending...');
  
  try {
    const sendRes = await fetch(`${API_URL}/api/admin/promotions/${promotion.id}/send-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ targets }),
    });

    if (!sendRes.ok) {
      const error = await sendRes.json();
      console.error('❌ Failed to send:', error.message);
      process.exit(1);
    }

    const result = await sendRes.json();
    console.log('\n✅ Broadcast complete!');
    console.log(`   Sent: ${result.sent}`);
    console.log(`   Failed: ${result.failed}`);
    
    if (result.failed > 0) {
      console.log(`\nTo retry failed deliveries:`);
      console.log(`POST ${API_URL}/api/admin/promotions/${promotion.id}/retry-failed`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

  rl.close();
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
