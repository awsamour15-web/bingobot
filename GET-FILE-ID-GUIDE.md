# How to Get Telegram file_id for Promotions

## Quick Method: Add Temporary Handler to Bot

Add this code temporarily to `apps/backend/src/bot/index.ts`:

```typescript
// Temporary: Get file_id from images
bot.on('message:photo', async (ctx) => {
  const photos = ctx.message.photo;
  const largest = photos[photos.length - 1]; // Get highest resolution
  
  await ctx.reply(
    `📸 Image received!\n\n` +
    `File ID:\n\`${largest.file_id}\`\n\n` +
    `Copy this and use it in your promotion.`,
    { parse_mode: 'Markdown' }
  );
  
  console.log('Photo file_id:', largest.file_id);
});

bot.on('message:video', async (ctx) => {
  const video = ctx.message.video;
  await ctx.reply(
    `🎬 Video received!\n\n` +
    `File ID:\n\`${video.file_id}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.on('message:animation', async (ctx) => {
  const gif = ctx.message.animation;
  await ctx.reply(
    `🎞 GIF received!\n\n` +
    `File ID:\n\`${gif.file_id}\``,
    { parse_mode: 'Markdown' }
  );
});
```

## Steps:

1. **Add the code above** to your bot (in the bot initialization section)
2. **Restart the bot** server
3. **Send your promotional image** directly to the bot in Telegram
4. **Bot will reply** with the file_id
5. **Copy the file_id** and use it in your promotion
6. **Remove the handler** after you're done (optional)

## Example Workflow:

```
You: [Send image to bot]

Bot: 📸 Image received!

File ID:
`AgACAgIAAxkBAAICrl5J8qE_example_file_id_here`

Copy this and use it in your promotion.
```

Now use that file_id:

```bash
node send-promotion.mjs
# Choose "2. Image with caption"
# Paste: AgACAgIAAxkBAAICrl5J8qE_example_file_id_here
# Enter caption: "🎉 Weekend Bonus - 50% Extra!"
```

## Alternative: Check Bot Logs

If you don't want to add a handler, you can also check your bot's console logs when you send media - Telegram provides the file structure in the message object.

## File ID Notes:

- File IDs are **permanent** - save them for reuse
- File IDs are **unique per bot** - don't share between different bots
- Different image **sizes have different IDs** - always use the largest resolution
- You can **reuse the same file_id** for multiple promotions

## Supported Media Types:

- **image** - Photos (.jpg, .png, .webp)
- **video** - Video files (.mp4, .mov)
- **gif** - Animated GIFs (.gif)

Each has its own file_id structure.
