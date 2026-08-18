# Bot Commands for Sending Promotions

Add these commands to your bot to easily send promotional images with text.

## Setup

Add this to `apps/backend/src/bot/index.ts` after the bot is initialized:

```typescript
import { sendPromotionNow } from '../services/promotion-scheduler.service.js';

// Admin user IDs - replace with your actual admin Telegram IDs
const ADMIN_IDS = [
  123456789, // Replace with your Telegram user ID
  // Add more admin IDs here
];

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

// Command: Get file_id from photos
bot.on('message:photo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Largest size
  await ctx.reply(
    `📸 Photo received!\n\n` +
    `File ID: \`${photo.file_id}\`\n\n` +
    `Use this ID to create promotions.`,
    { parse_mode: 'Markdown' }
  );
});

// Command: Get file_id from videos
bot.on('message:video', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const video = ctx.message.video;
  await ctx.reply(
    `🎥 Video received!\n\n` +
    `File ID: \`${video.file_id}\`\n\n` +
    `Use this ID to create promotions.`,
    { parse_mode: 'Markdown' }
  );
});

// Command: Get file_id from GIFs
bot.on('message:animation', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const animation = ctx.message.animation;
  await ctx.reply(
    `🎬 GIF received!\n\n` +
    `File ID: \`${animation.file_id}\`\n\n` +
    `Use this ID to create promotions.`,
    { parse_mode: 'Markdown' }
  );
});

// Command: Create promotion from photo
bot.command('sendpromo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  // Check if replying to a photo/video/gif
  const reply = ctx.message.reply_to_message;
  if (!reply) {
    await ctx.reply(
      '❌ Usage: Reply to a photo/video/gif with:\n' +
      '/sendpromo <caption>\n\n' +
      'Example:\n' +
      '/sendpromo 🎉 Weekend Bonus!\n\nDeposit now and get 50% extra!'
    );
    return;
  }

  let contentType: string;
  let fileId: string;

  if (reply.photo) {
    contentType = 'image';
    fileId = reply.photo[reply.photo.length - 1].file_id;
  } else if (reply.video) {
    contentType = 'video';
    fileId = reply.video.file_id;
  } else if (reply.animation) {
    contentType = 'gif';
    fileId = reply.animation.file_id;
  } else {
    await ctx.reply('❌ Please reply to a photo, video, or GIF');
    return;
  }

  const caption = ctx.match as string;
  if (!caption || caption.trim().length === 0) {
    await ctx.reply('❌ Please provide a caption after the command');
    return;
  }

  try {
    // Create promotion in database
    const promotion = await prisma.promotion.create({
      data: {
        title: `Quick Promo - ${new Date().toISOString().split('T')[0]}`,
        content_type: contentType,
        media_file_id: fileId,
        caption: caption.trim(),
        status: 'active',
      },
    });

    await ctx.reply(
      `✅ Promotion created!\n\n` +
      `ID: \`${promotion.id}\`\n` +
      `Type: ${contentType}\n\n` +
      `To send to all users:\n` +
      `/broadcast ${promotion.id}\n\n` +
      `To send to a channel:\n` +
      `/sendchannel ${promotion.id} @YourChannel`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[Bot] Failed to create promotion:', err);
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

// Command: Broadcast promotion to all users
bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  const promotionId = (ctx.match as string)?.trim();
  if (!promotionId) {
    await ctx.reply(
      '❌ Usage: /broadcast <promotionId>\n\n' +
      'Example: /broadcast promo_123abc'
    );
    return;
  }

  try {
    // Check if promotion exists
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      await ctx.reply('❌ Promotion not found');
      return;
    }

    await ctx.reply('📤 Broadcasting to all users... This may take a moment.');

    const result = await sendPromotionNow(promotionId, [
      {
        id: 'broadcast_all',
        name: 'All Users',
        type: 'bot_broadcast',
      },
    ]);

    await ctx.reply(
      `✅ Broadcast complete!\n\n` +
      `✓ Sent: ${result.sent}\n` +
      `✗ Failed: ${result.failed}` +
      (result.failed > 0 ? `\n\nTo retry: /retry ${promotionId}` : '')
    );
  } catch (err) {
    console.error('[Bot] Broadcast error:', err);
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

// Command: Send promotion to specific channel
bot.command('sendchannel', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  const args = (ctx.match as string)?.trim().split(/\s+/);
  if (!args || args.length < 2) {
    await ctx.reply(
      '❌ Usage: /sendchannel <promotionId> <channelId>\n\n' +
      'Example: /sendchannel promo_123 @YourChannel'
    );
    return;
  }

  const [promotionId, channelId] = args;

  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      await ctx.reply('❌ Promotion not found');
      return;
    }

    await ctx.reply(`📤 Sending to ${channelId}...`);

    const result = await sendPromotionNow(promotionId, [
      {
        id: channelId,
        name: channelId,
        type: 'channel',
        channel_id: channelId,
      },
    ]);

    await ctx.reply(
      `✅ Sent to channel!\n\n` +
      `✓ Sent: ${result.sent}\n` +
      `✗ Failed: ${result.failed}`
    );
  } catch (err) {
    console.error('[Bot] Send to channel error:', err);
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

// Command: Retry failed deliveries
bot.command('retry', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  const promotionId = (ctx.match as string)?.trim();
  if (!promotionId) {
    await ctx.reply('❌ Usage: /retry <promotionId>');
    return;
  }

  try {
    await ctx.reply('🔄 Retrying failed deliveries...');

    const { default: retryFailedDeliveries } = await import('../services/promotion-scheduler.service.js');
    const result = await retryFailedDeliveries(promotionId);

    await ctx.reply(
      `✅ Retry complete!\n\n` +
      `✓ Sent: ${result.sent}\n` +
      `✗ Still failed: ${result.failed}`
    );
  } catch (err) {
    console.error('[Bot] Retry error:', err);
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

// Command: List recent promotions
bot.command('promolist', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  try {
    const promotions = await prisma.promotion.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    if (promotions.length === 0) {
      await ctx.reply('📋 No promotions found');
      return;
    }

    const list = promotions.map((p, i) => 
      `${i + 1}. ${p.title}\n` +
      `   ID: \`${p.id}\`\n` +
      `   Type: ${p.content_type}\n` +
      `   Status: ${p.status}\n`
    ).join('\n');

    await ctx.reply(
      `📋 Recent Promotions:\n\n${list}\n\n` +
      `Use /broadcast <id> to send`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[Bot] Promo list error:', err);
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

// Command: Get promotion stats
bot.command('promostats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  const promotionId = (ctx.match as string)?.trim();
  if (!promotionId) {
    await ctx.reply('❌ Usage: /promostats <promotionId>');
    return;
  }

  try {
    const { PromotionService } = await import('../services/promotion.service.js');
    const stats = await PromotionService.getStats(promotionId);

    await ctx.reply(
      `📊 Promotion Stats\n\n` +
      `ID: \`${promotionId}\`\n\n` +
      `✓ Total Sent: ${stats.total_sent}\n` +
      `✗ Total Failed: ${stats.total_failed}\n` +
      `📢 Unique Channels: ${stats.unique_channels}\n` +
      `📅 Last Sent: ${stats.last_sent_at ? new Date(stats.last_sent_at).toLocaleString() : 'Never'}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[Bot] Stats error:', err);
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

// Command: Help for admin commands
bot.command('promhelp', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  await ctx.reply(
    `🤖 **Admin Promotion Commands**\n\n` +
    `📸 Send photo/video/gif → Get file_id automatically\n\n` +
    `**/sendpromo** <caption>\n` +
    `   Reply to media to create promotion\n\n` +
    `**/broadcast** <promoId>\n` +
    `   Send to all users\n\n` +
    `/sendchannel <promoId> @Channel\n` +
    `   Send to specific channel\n\n` +
    `**/promolist**\n` +
    `   List recent promotions\n\n` +
    `**/promostats** <promoId>\n` +
    `   View delivery statistics\n\n` +
    `**/retry** <promoId>\n` +
    `   Retry failed deliveries`,
    { parse_mode: 'Markdown' }
  );
});
```

## How to Find Your Telegram User ID

1. **Using @userinfobot:**
   - Search for `@userinfobot` in Telegram
   - Start a chat with it
   - It will show your user ID

2. **Using @getidsbot:**
   - Search for `@getidsbot` in Telegram
   - Start a chat with it
   - It will display your ID

3. **From Bot Logs:**
   - Send any message to your bot
   - Check bot logs for `ctx.from.id`

Add your admin IDs to the `ADMIN_IDS` array in the code above.

## Usage Examples

### Example 1: Quick Image Promotion

1. **Send image to bot:**
   - Send your promotional image to the bot
   - Bot replies with file_id

2. **Create promotion:**
   - Reply to that image with:
   ```
   /sendpromo 🎉 Weekend Special!
   
   Deposit 100 ETB and get 150 ETB!
   
   Valid until Sunday 11:59 PM
   
   👉 Tap Deposit 💰 now!
   ```

3. **Bot responds:**
   ```
   ✅ Promotion created!
   
   ID: `promo_abc123`
   Type: image
   
   To send to all users:
   /broadcast promo_abc123
   ```

4. **Broadcast:**
   ```
   /broadcast promo_abc123
   ```

5. **Confirmation:**
   ```
   ✅ Broadcast complete!
   
   ✓ Sent: 1,247
   ✗ Failed: 3
   ```

### Example 2: Send to Channel

```
/sendchannel promo_abc123 @YourChannel
```

### Example 3: View Stats

```
/promostats promo_abc123
```

Response:
```
📊 Promotion Stats

ID: `promo_abc123`

✓ Total Sent: 1,247
✗ Total Failed: 3
📢 Unique Channels: 1
📅 Last Sent: 8/18/2026, 10:30 AM
```

### Example 4: List Recent Promotions

```
/promolist
```

Response:
```
📋 Recent Promotions:

1. Weekend Special
   ID: `promo_abc123`
   Type: image
   Status: active

2. Bonus Alert
   ID: `promo_xyz789`
   Type: image
   Status: active

Use /broadcast <id> to send
```

## Best Practices

1. **Test First**
   - Send to yourself or a test channel first
   - Verify formatting and appearance
   - Then broadcast to all users

2. **Timing**
   - Send during peak hours (evening)
   - Avoid sending too frequently (max 2-3 per week)
   - Consider timezone of your users

3. **Content**
   - Use emojis to make messages engaging: 🎉💰🎁⏰👉
   - Keep captions concise (under 500 chars ideal)
   - Include clear call-to-action
   - Test readability on mobile

4. **Image Design**
   - Use high-quality images (but keep file size reasonable)
   - Include key information in the image
   - Make sure text in image is readable on mobile
   - Avoid cluttered designs

5. **Monitor Results**
   - Check stats after sending
   - Retry failed deliveries if needed
   - Track which promotions get best engagement

## Security Notes

⚠️ **Important:**
- Only add trusted admins to `ADMIN_IDS`
- These commands bypass normal authentication
- Admins can send messages to all users
- Keep admin user IDs confidential

## Integration with Existing System

These commands integrate seamlessly with your existing:
- Admin panel promotions
- Scheduled promotions
- Bonus distribution system
- Analytics and logging

All promotions created via bot commands appear in the admin dashboard and can be managed from there as well.
