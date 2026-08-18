# Using Admin Panel to Send Promotion Images with Text

## ✅ Your Admin Panel Already Supports This!

Your admin panel at `/promotions` has a fully functional promotion system with image support.

## 📋 Step-by-Step Guide

### Step 1: Get the Image File ID

You need the Telegram `file_id` for your image. Here are two ways:

#### Option A: Add File ID Helper to Bot (Recommended)

Add this to `apps/backend/src/bot/index.ts` after bot initialization:

```typescript
// Helper for admins to get file_id from images
bot.on('message:photo', async (ctx) => {
  // Only respond to admins (replace with your admin telegram IDs)
  const ADMIN_IDS = [123456789]; // Your Telegram user ID
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  
  const photos = ctx.message.photo;
  const largest = photos[photos.length - 1]; // Get highest resolution
  
  await ctx.reply(
    `📸 File ID received!\n\n` +
    `\`${largest.file_id}\`\n\n` +
    `Copy this ID and use it in the admin panel.`,
    { parse_mode: 'Markdown' }
  );
});

// Also support videos
bot.on('message:video', async (ctx) => {
  const ADMIN_IDS = [123456789];
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  
  const video = ctx.message.video;
  await ctx.reply(
    `🎥 Video File ID:\n\n` +
    `\`${video.file_id}\``,
    { parse_mode: 'Markdown' }
  );
});

// Also support GIFs
bot.on('message:animation', async (ctx) => {
  const ADMIN_IDS = [123456789];
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  
  const animation = ctx.message.animation;
  await ctx.reply(
    `🎬 GIF File ID:\n\n` +
    `\`${animation.file_id}\``,
    { parse_mode: 'Markdown' }
  );
});
```

**How to use:**
1. Send your promotional image to the bot in Telegram
2. Bot replies with the file_id
3. Copy the file_id

#### Option B: Use Existing File Uploader

Your bot already handles photos. Just send any photo to the bot and check the logs for the file_id.

### Step 2: Access Admin Panel

1. Go to your admin panel URL (e.g., `https://your-admin.vercel.app`)
2. Login with admin credentials
3. Navigate to **Promotions** page

### Step 3: Create Promotion

1. Click **"+ New Promotion"** button

2. Fill in the form:

   **Basic Info:**
   - **Title**: Internal name (e.g., "Weekend Bonus Aug 2026")
   - **Type**: Select "🖼 Image" from dropdown

   **Image Content:**
   - **Telegram File ID**: Paste the file_id you got from Step 1
   - **Caption**: Your promotional text (max 1024 chars)
     ```
     🎉 WEEKEND SPECIAL!
     
     💰 Deposit 100 ETB → Get 150 ETB
     💰 Deposit 200 ETB → Get 300 ETB
     💰 Deposit 500 ETB → Get 750 ETB
     
     ⏰ Valid until Sunday 11:59 PM
     
     👉 Tap "Deposit 💰" to claim your bonus!
     ```

   **Optional - Auto Bonus:**
   - Check "🎁 Attach Bonus to this Promotion"
   - **Bonus Amount**: e.g., 50 ETB
   - **Wallet**: Play or Main
   - **Eligibility Criteria**: Set conditions (optional)

3. Click **"Create Promotion"**

### Step 4: Configure Broadcast Targets (First Time Only)

Before sending, you need to set up broadcast targets:

1. In the **Broadcast Targets** section, click **"+ Add Target"**

2. **For All Users:**
   - Name: "All Users"
   - Type: "🤖 Bot — All Users"
   - Click "Save"

3. **For Specific Channel:**
   - Name: "Main Channel"
   - Type: "📢 Channel / Group"
   - Channel ID: Your channel ID (e.g., `@YourChannel` or `-1001234567890`)
   - Click "Save"

**Note:** To get your channel ID:
- Forward a message from the channel to `@userinfobot`
- Or use `@getidsbot` in the channel
- Format: `-1001234567890` for private channels, `@username` for public

### Step 5: Send Promotion

1. Find your promotion in the list
2. Make sure status is **"Active"** (toggle if needed)
3. Click **"🚀 Send Now"** button

4. **Select Destinations:**
   - Check the targets you want to send to
   - Preview the message
   - Click **"🚀 Send to X targets"**

5. **View Results:**
   - Shows count of sent/failed
   - Check **Delivery Logs** section for details

### Step 6: View Analytics

- **Inline Stats**: Each promotion shows sent/failed counts
- **Delivery Logs**: See detailed delivery history at bottom of page
- **Filter logs** by specific promotion using dropdown

## 🎨 Content Type Options

Your admin panel supports:

1. **📝 Text** - Plain text message (max 4096 chars)
2. **🖼 Image** - Photo + caption (max 1024 chars)
3. **🎬 Video** - Video + caption
4. **🎞 GIF** - Animated GIF + caption

## 🗓️ Schedule Promotions

Instead of sending immediately, you can schedule:

1. Create promotion
2. Click **"▼ Schedule"** to expand
3. **Select targets** for the schedule
4. **Set frequency**: Once, Daily, Weekly, or Monthly
5. **Set send time**: Choose date and time
6. Click **"Add Schedule"**

The system will automatically send at the scheduled time.

## 🎁 Bonus Distribution Features

If you added bonus configuration:

1. Click **"▼ Bonus"** to expand bonus section
2. **Preview Tab**: See eligible players
3. Click **"🎁 Apply to X players"** to credit bonus
4. **History Tab**: See who received the bonus

**Eligibility Criteria:**
- Min/Max balance
- Minimum deposits
- Account age (days registered)
- Must have played at least one round
- Filter by specific agent

## ⚙️ Advanced Features

### Duplicate Promotion
- Click **"Copy"** to clone existing promotion
- Edit title and content as needed
- Reuse configuration for similar campaigns

### Retry Failed Deliveries
- Click **"↺ Retry"** to resend to failed destinations
- Useful if some users had bot blocked temporarily

### Enable/Disable
- Toggle status between Active/Inactive
- Only active promotions can be sent

### Global Stats
Dashboard shows:
- Total promotions
- Active count
- Total delivered
- Active targets

## 📱 Example: Complete Workflow

**Scenario**: Send weekend bonus announcement to all users

1. **Prepare Image**
   - Design promotional banner in Canva/Photoshop
   - Keep file size reasonable (< 5MB)
   - Include key information in the image

2. **Get File ID**
   - Send image to your bot in Telegram
   - Bot replies with file_id
   - Copy: `AgACAgIAAxkBAAICrl234example...`

3. **Create in Admin Panel**
   - Login to admin panel
   - Go to Promotions
   - Click "+ New Promotion"
   - Fill form:
     ```
     Title: Weekend Bonus - August 2026
     Type: Image
     File ID: AgACAgIAAxkBAAICrl234example...
     Caption: 
       🎉 WEEKEND BONUS IS HERE!
       
       💰 Deposit 100 → Get 150 ETB
       💰 Deposit 200 → Get 300 ETB
       💰 Deposit 500 → Get 750 ETB
       
       ⏰ Valid until Sunday 11:59 PM
       
       👉 Tap "Deposit 💰" now!
     ```
   - Check "Attach Bonus": 50 ETB, Play Wallet
   - Create

4. **Configure Target (First Time)**
   - Add Target: "All Users", Bot Broadcast
   - Save

5. **Send**
   - Click "🚀 Send Now"
   - Select "All Users"
   - Preview
   - Send

6. **Monitor**
   - Check send results
   - View delivery logs
   - Apply bonus to eligible players

7. **Result**
   - All active users receive image with caption
   - Eligible users get 50 ETB bonus automatically
   - Analytics updated in real-time

## 🎯 Caption Formatting Tips

**Good Example:**
```
🎉 Heading with Emoji

💰 Bullet point 1
💰 Bullet point 2
💰 Bullet point 3

⏰ Time limit

👉 Clear call-to-action
```

**Tips:**
- Use emojis for visual hierarchy
- Double line breaks for spacing
- Keep under 1024 characters
- Test on mobile first
- Include clear CTA (call-to-action)

## 🔍 Troubleshooting

### "Promotion sent but users didn't receive"
- Check bot permissions in target channel
- Verify bot is admin in the channel
- Some users may have blocked the bot (shows in logs)

### "Invalid file_id"
- File_id might have expired (rare)
- Get a fresh file_id by resending image to bot
- Make sure to copy the entire ID

### "Caption too long"
- Maximum is 1024 characters
- Shorten text or move some to the image itself

### "Send failed to channel"
- Verify channel ID format
- Bot must be added as admin to the channel
- Check bot has "Post Messages" permission

### "No targets available"
- Create at least one broadcast target first
- Make sure target status is "Active"
- Toggle target on/off to refresh

## 🎓 Best Practices

1. **Test First**
   - Create a test channel
   - Send there first before broadcasting to all
   - Verify appearance on both mobile and desktop

2. **Timing**
   - Schedule for peak hours (evening)
   - Avoid sending too frequently
   - Weekend mornings work well for promos

3. **Content**
   - High-quality images (but reasonable file size)
   - Clear, concise text
   - Strong visual hierarchy
   - Mobile-first design

4. **Segmentation**
   - Use bonus criteria for targeted campaigns
   - Different messages for new vs old players
   - Agent-specific bonuses

5. **Analytics**
   - Monitor send success rate
   - Track bonus distribution
   - Review delivery logs regularly

## 📞 Need Help?

Your admin panel is ready to use! The interface is intuitive:
- Hover over buttons for tooltips
- Fields show character limits
- Validation prevents errors
- Preview before sending

**Quick links:**
- Documentation: See `PROMOTION-IMAGE-GUIDE.md` for API details
- Bot commands: See `PROMOTION-BOT-COMMANDS.md` for bot integration
- Summary: See `SEND-PROMOTIONS-SUMMARY.md` for overview

---

**Your admin panel is production-ready!** All features are working - just add the file_id helper to your bot and start sending promotions. 🎉
