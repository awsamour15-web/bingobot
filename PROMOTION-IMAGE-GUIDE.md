# How to Send Promotion Images with Text

## Overview
Your system already supports sending promotional images with text captions! You can send:
- **Text only** - Plain text messages
- **Image with caption** - Photo with text overlay
- **Video with caption** - Video with text
- **GIF with caption** - Animated GIF with text

## Method 1: Using Admin API (Recommended)

### Step 1: Upload Image to Telegram
First, send the image to your bot to get the `file_id`:

```bash
# Send image to your bot manually via Telegram
# Then use this script to get the file_id:
```

**Quick way to get file_id:**
1. Send image to your bot in Telegram
2. Bot logs will show the file_id, OR
3. Use this temporary handler (add to bot/index.ts):

```typescript
// Temporary: Add this to get file_id from images
bot.on('message:photo', async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // largest size
  await ctx.reply(`File ID: ${photo.file_id}`);
  console.log('Photo file_id:', photo.file_id);
});
```

### Step 2: Create Promotion via API

**POST** `/api/admin/promotions`

```json
{
  "title": "Weekly Bonus Promotion",
  "content_type": "image",
  "media_file_id": "AgACAgIAAxkBAAIC...", 
  "caption": "🎉 Special Bonus Alert!\n\n💰 Deposit 100 ETB and get 50% bonus!\n\n⏰ Valid until Sunday\n\n👉 Tap Play 🎮 to get started!",
  "bonus_amount": 50,
  "bonus_wallet": "play"
}
```

**Field Explanations:**
- `title` - Internal name for the promotion (admin reference)
- `content_type` - Must be: `"text"`, `"image"`, `"video"`, or `"gif"`
- `media_file_id` - Telegram file_id (obtained from Step 1)
- `caption` - Text that appears with the image (max 1024 characters)
- `bonus_amount` (optional) - Automatic bonus to credit
- `bonus_wallet` (optional) - `"main"` or `"play"`

### Step 3: Send Immediately or Schedule

**Option A: Send Now**
```bash
POST /api/admin/promotions/{promotionId}/send-now
```

```json
{
  "targets": [
    {
      "id": "channel_1",
      "name": "Main Channel",
      "type": "channel",
      "channel_id": "@YourChannel"
    },
    {
      "id": "broadcast_1",
      "name": "All Users",
      "type": "bot_broadcast"
    }
  ]
}
```

**Option B: Schedule for Later**
```bash
POST /api/admin/promotions/{promotionId}/schedules
```

```json
{
  "channel_ids": ["@YourChannel", "-1001234567890"],
  "frequency": "daily",
  "send_at": "2026-08-20T10:00:00Z"
}
```

## Method 2: Direct Bot Integration

You can also add a bot command for admins to send promotions directly:

```typescript
// Add to apps/backend/src/bot/index.ts

bot.command('sendpromo', async (ctx) => {
  // Only allow admins (add admin check here)
  const adminTelegramIds = [123456789]; // Your admin IDs
  if (!adminTelegramIds.includes(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  // Check if replying to a photo
  if (!ctx.message.reply_to_message?.photo) {
    await ctx.reply('❌ Please reply to a photo with /sendpromo <caption>');
    return;
  }

  const photo = ctx.message.reply_to_message.photo;
  const fileId = photo[photo.length - 1].file_id; // Get largest size
  const caption = ctx.match || '🎉 New Promotion!';

  // Create promotion in database
  const promotion = await prisma.promotion.create({
    data: {
      title: `Quick Promo ${new Date().toISOString()}`,
      content_type: 'image',
      media_file_id: fileId,
      caption: caption as string,
      status: 'active',
    },
  });

  await ctx.reply(
    `✅ Promotion created!\n\nID: ${promotion.id}\n\nUse /broadcast ${promotion.id} to send it.`
  );
});

bot.command('broadcast', async (ctx) => {
  // Only allow admins
  const adminTelegramIds = [123456789];
  if (!adminTelegramIds.includes(ctx.from.id)) {
    await ctx.reply('⛔ Admin only command');
    return;
  }

  const promotionId = ctx.match as string;
  if (!promotionId) {
    await ctx.reply('❌ Usage: /broadcast <promotionId>');
    return;
  }

  await ctx.reply('📤 Broadcasting to all users...');

  const result = await sendPromotionNow(promotionId, [
    {
      id: 'broadcast_all',
      name: 'All Users',
      type: 'bot_broadcast',
    },
  ]);

  await ctx.reply(
    `✅ Broadcast complete!\n\n✓ Sent: ${result.sent}\n✗ Failed: ${result.failed}`
  );
});
```

## Method 3: Using Curl (Quick Testing)

```bash
# 1. Get auth token
curl -X POST https://your-api.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'

# 2. Create image promotion
curl -X POST https://your-api.com/api/admin/promotions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Weekend Special",
    "content_type": "image",
    "media_file_id": "AgACAgIAAxkBAAIC...",
    "caption": "🎊 Weekend Bonus!\n\nPlay now and win big! 🏆"
  }'

# 3. Send to all users
curl -X POST https://your-api.com/api/admin/promotions/PROMO_ID/send-now \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "targets": [
      {
        "id": "all",
        "name": "All Users",
        "type": "bot_broadcast"
      }
    ]
  }'
```

## Caption Formatting Tips

Telegram supports **Markdown** and **HTML** formatting in captions:

### Using Emoji
```
🎉 Special Offer!
💰 Bonus Amount: 100 ETB
⏰ Limited Time
👉 Play Now!
```

### Using Line Breaks
```
"caption": "Line 1\n\nLine 2 (double newline for spacing)\n\nLine 3"
```

### Character Limits
- **Caption**: Max 1024 characters
- **Text message**: Max 4096 characters

## Target Types

### 1. Channel Broadcast
Send to Telegram channels where your bot is admin:
```json
{
  "type": "channel",
  "channel_id": "@YourChannel"
}
```

### 2. Bot Broadcast (All Users)
Send to all registered players:
```json
{
  "type": "bot_broadcast"
}
```

## Content Types

### Text Only
```json
{
  "content_type": "text",
  "text_content": "Your message here (max 4096 chars)"
}
```

### Image with Caption
```json
{
  "content_type": "image",
  "media_file_id": "AgACAgIAAxkBAAIC...",
  "caption": "Your caption (max 1024 chars)"
}
```

### Video with Caption
```json
{
  "content_type": "video",
  "media_file_id": "BAACAgIAAxkBAAIC...",
  "caption": "Your caption"
}
```

### GIF with Caption
```json
{
  "content_type": "gif",
  "media_file_id": "CgACAgQAAxkBAAIC...",
  "caption": "Your caption"
}
```

## Complete Example Workflow

### Scenario: Send Weekly Bonus Announcement

**1. Prepare your image**
- Design promotional image with your offer
- Send it to your bot to get file_id
- Copy the file_id from bot response

**2. Create promotion**
```javascript
const response = await fetch('https://your-api.com/api/admin/promotions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    title: 'Weekly Bonus - August',
    content_type: 'image',
    media_file_id: 'AgACAgIAAxkBAAICrl234example',
    caption: 
      '🎉 WEEKLY BONUS IS HERE!\n\n' +
      '💰 Deposit 100 ETB → Get 150 ETB\n' +
      '💰 Deposit 200 ETB → Get 300 ETB\n' +
      '💰 Deposit 500 ETB → Get 750 ETB\n\n' +
      '⏰ Valid until Sunday 11:59 PM\n\n' +
      '👉 Tap "Deposit 💰" to claim your bonus!',
    bonus_amount: 50,
    bonus_wallet: 'play'
  })
});

const promotion = await response.json();
console.log('Created:', promotion.id);
```

**3. Send to all users**
```javascript
await fetch(`https://your-api.com/api/admin/promotions/${promotion.id}/send-now`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    targets: [
      {
        id: 'broadcast_all',
        name: 'All Users',
        type: 'bot_broadcast'
      }
    ]
  })
});
```

**4. Check delivery stats**
```javascript
const stats = await fetch(
  `https://your-api.com/api/admin/promotions/${promotion.id}/stats`,
  {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
  }
).then(r => r.json());

console.log('Sent:', stats.total_sent);
console.log('Failed:', stats.total_failed);
```

## Bonus Features

### Auto-Credit Bonus
When creating a promotion, add bonus fields to automatically credit eligible players:

```json
{
  "title": "VIP Bonus",
  "content_type": "image",
  "media_file_id": "AgACAgIAAxk...",
  "caption": "🎁 VIP Bonus credited to your account!",
  "bonus_amount": 100,
  "bonus_wallet": "play",
  "bonus_criteria": {
    "minBalance": 50,
    "minDeposits": 100,
    "hasPlayedRounds": true,
    "daysRegistered": 7
  }
}
```

Then apply it:
```bash
POST /api/admin/promotions/{promotionId}/bonus/apply
```

## Troubleshooting

### Issue: "File not found"
- The file_id is invalid or expired
- Get a fresh file_id by sending the image to the bot again

### Issue: "Bot is not a member of the chat"
- Add your bot as admin to the channel
- Make sure channel_id format is correct (@username or -100...)

### Issue: "Message too long"
- Caption max: 1024 characters
- Use shorter text or split into multiple messages

### Issue: "Failed deliveries"
- Check bot permissions in target channels
- Some users may have blocked the bot
- Use retry endpoint: `POST /promotions/{id}/retry-failed`

## Admin Dashboard Integration

If you want to add this to your admin frontend:

```typescript
// apps/admin/src/pages/PromotionsPage.tsx
const [imageFileId, setImageFileId] = useState('');
const [caption, setCaption] = useState('');

const createPromotion = async () => {
  const response = await fetch(`${API_URL}/api/admin/promotions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: document.getElementById('title').value,
      content_type: 'image',
      media_file_id: imageFileId,
      caption: caption
    })
  });
  
  const promo = await response.json();
  alert(`Created: ${promo.id}`);
};
```

---

## Summary

✅ Your system already supports image promotions with captions
✅ Use the admin API to create and send promotions
✅ Get file_id by sending images to your bot
✅ Send immediately or schedule for later
✅ Track delivery stats and retry failures
✅ Support for text, images, videos, and GIFs

Need help implementing any of these methods? Let me know!
