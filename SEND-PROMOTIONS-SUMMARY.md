# Send Promotion Images with Text - Quick Summary

## ✅ Your System Already Supports This!

You can send promotional images with text captions using your existing promotion system.

## 🚀 Three Ways to Send

### Method 1: Admin API (Full Control)
Best for: Scheduled campaigns, automated workflows

```bash
# 1. Create promotion
POST /api/admin/promotions
{
  "title": "Weekend Bonus",
  "content_type": "image",
  "media_file_id": "AgACAgIAAxkBAAIC...",
  "caption": "🎉 Weekend Bonus!\n\nDeposit now!"
}

# 2. Send immediately
POST /api/admin/promotions/{id}/send-now
{
  "targets": [{
    "type": "bot_broadcast" // or "channel"
  }]
}
```

### Method 2: Bot Commands (Easiest)
Best for: Quick promotions, daily use

```
1. Send image to bot → Get file_id
2. Reply with: /sendpromo Your caption here
3. Send: /broadcast promo_id
```

See: `PROMOTION-BOT-COMMANDS.md` for full implementation

### Method 3: Helper Script (Interactive)
Best for: Non-technical admins

```bash
node apps/backend/send-promotion.mjs
```

Prompts you step-by-step through the entire process.

## 📝 Quick Steps

1. **Get File ID**
   - Send image to your bot
   - Bot shows file_id (after adding handler)
   - Copy the file_id

2. **Create Promotion**
   ```json
   {
     "content_type": "image",
     "media_file_id": "YOUR_FILE_ID",
     "caption": "Your text here"
   }
   ```

3. **Send**
   - Broadcast to all users
   - Or send to specific channel
   - Or schedule for later

## 📚 Documentation Files

- **PROMOTION-IMAGE-GUIDE.md** - Complete guide with examples
- **PROMOTION-BOT-COMMANDS.md** - Bot commands implementation
- **send-promotion.mjs** - Interactive CLI script

## 🎯 Content Types Supported

- **text** - Plain text message (max 4096 chars)
- **image** - Photo with caption (max 1024 chars)
- **video** - Video with caption
- **gif** - Animated GIF with caption

## 💡 Example: Weekend Bonus Promotion

**Step 1:** Create promotion
```javascript
POST /api/admin/promotions
{
  "title": "Weekend Bonus",
  "content_type": "image",
  "media_file_id": "AgACAgIAAxkBAAICrl234example",
  "caption": 
    "🎉 WEEKEND BONUS!\n\n" +
    "💰 Deposit 100 → Get 150 ETB\n" +
    "💰 Deposit 200 → Get 300 ETB\n\n" +
    "⏰ Valid until Sunday!\n\n" +
    "👉 Tap Deposit 💰 now!",
  "bonus_amount": 50,
  "bonus_wallet": "play"
}
```

**Step 2:** Send to all users
```javascript
POST /api/admin/promotions/{id}/send-now
{
  "targets": [
    { "type": "bot_broadcast" }
  ]
}
```

**Done!** All users receive the image with your caption.

## 🎨 Caption Formatting Tips

```
🎉 Use emojis
💰 To highlight key points
⏰ And create visual hierarchy
👉 With clear call-to-action

Use double newlines

For spacing between sections
```

**Limits:**
- Caption: 1024 characters max
- Text message: 4096 characters max

## 📊 Track Results

```bash
GET /api/admin/promotions/{id}/stats
```

Returns:
- Total sent
- Total failed  
- Unique channels
- Last sent date

## 🔄 Retry Failed Deliveries

```bash
POST /api/admin/promotions/{id}/retry-failed
```

## 🗓️ Schedule Promotions

```bash
POST /api/admin/promotions/{id}/schedules
{
  "channel_ids": ["@YourChannel"],
  "frequency": "daily",
  "send_at": "2026-08-20T10:00:00Z"
}
```

## 🎁 Auto-Credit Bonuses

Add bonus fields to automatically credit eligible players:

```json
{
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

Then:
```bash
POST /api/admin/promotions/{id}/bonus/apply
```

## 🚦 Next Steps

1. **Quick Test:**
   - Send an image to your bot
   - Note the file_id (add handler from docs)
   - Use API or script to send promotion

2. **Add Bot Commands:**
   - Copy code from `PROMOTION-BOT-COMMANDS.md`
   - Add to `apps/backend/src/bot/index.ts`
   - Replace ADMIN_IDS with your Telegram ID

3. **Integrate Admin Panel:**
   - Add promotion UI to admin frontend
   - Use existing API endpoints
   - Preview before sending

## ❓ Need Help?

Check the detailed guides:
- Full API examples → `PROMOTION-IMAGE-GUIDE.md`
- Bot commands → `PROMOTION-BOT-COMMANDS.md`
- Interactive script → Run `node send-promotion.mjs`

Your promotion system is fully functional and ready to use! 🎉
