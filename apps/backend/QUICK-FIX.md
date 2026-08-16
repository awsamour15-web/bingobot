# Quick Fix for Agent Invitation Links

## TL;DR

Run this command to check your bot configuration:

```bash
cd apps/backend
pnpm verify:bot
```

If it shows a mismatch, update your `.env` file with the correct BOT_USERNAME and restart.

## Most Likely Issue

Your `.env` has:
```
BOT_USERNAME="f_bingobot"
```

But your actual bot username from BotFather might be different.

## Quick Test

1. Open Telegram
2. Try this link format: `https://t.me/f_bingobot`
3. Does it open your bot? 
   - **Yes** → BOT_USERNAME is correct, issue is elsewhere
   - **No** → BOT_USERNAME is wrong, needs update

## How to Find Correct Username

### Method 1: Ask BotFather
1. Open Telegram
2. Message @BotFather
3. Send `/mybots`
4. Select your bot
5. Look for the username (without @)

### Method 2: Use Verification Script
```bash
cd apps/backend
pnpm verify:bot
```
It will show you the correct username.

### Method 3: Check Bot Link
Your bot link is: `t.me/YOUR_BOT_USERNAME`
Copy just the username part (after t.me/)

## Update and Test

1. Edit `apps/backend/.env`:
   ```env
   BOT_USERNAME="correct_username_here"
   ```

2. Restart backend:
   ```bash
   pnpm dev
   ```

3. Test in admin panel:
   - Create new agent
   - Copy activation link
   - Open in Telegram
   - Should open your bot correctly

## Still Not Working?

See full troubleshooting guide: `AGENT-INVITE-TROUBLESHOOTING.md`
