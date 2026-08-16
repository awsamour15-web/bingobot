# Agent Invitation Link Fix Summary

## Problem Identified

The agent invitation links may not be working due to BOT_USERNAME configuration issues.

## Current Configuration

In `apps/backend/.env`:
```
BOT_USERNAME="f_bingobot"
```

This generates links like:
```
https://t.me/f_bingobot?start=agent_xxxxx
```

## What Was Fixed

### 1. Improved Error Handling in `agent.service.ts`

**Before:**
- Empty string fallback created broken links: `https://t.me/?start=agent_xxx`
- No error logging

**After:**
- Clear error messages when BOT_USERNAME is missing
- Returns `[BOT_USERNAME_NOT_CONFIGURED]` to make issues visible
- Logs errors to console

### 2. Added Verification Tools

Created `apps/backend/verify-bot-config.js`:
- Verifies BOT_TOKEN is set
- Connects to Telegram API to get actual bot username
- Compares .env BOT_USERNAME with actual Telegram username
- Tests link generation
- Shows clear warnings if there's a mismatch

### 3. Added Package Script

In `apps/backend/package.json`:
```json
"verify:bot": "node verify-bot-config.js"
```

### 4. Created Troubleshooting Guide

Added comprehensive guide: `apps/backend/AGENT-INVITE-TROUBLESHOOTING.md`

## How to Fix

### Step 1: Verify Your Bot Configuration

```bash
cd apps/backend
pnpm verify:bot
```

This will show you:
- If BOT_USERNAME matches your actual bot username
- What the correct value should be
- Test links with the correct format

### Step 2: Update .env if Needed

If the script shows a mismatch, update your `.env` file:

```env
BOT_USERNAME="actual_bot_username_from_telegram"
```

**Important:** 
- Do NOT include the @ symbol
- Use the exact username from BotFather or from the verification script

### Step 3: Restart Backend

After updating .env:
```bash
pnpm dev
```

Or in production, restart your deployed service.

### Step 4: Test the Flow

1. Go to Admin Panel → Agents
2. Create a new agent
3. Copy the agent activation link
4. Open it in Telegram (on phone or web)
5. Verify it opens your bot correctly
6. Complete the activation
7. Check that you receive the player invite link

## Verification Checklist

- [ ] BOT_USERNAME in .env matches actual bot username
- [ ] BOT_TOKEN is valid and working
- [ ] Backend server restarted after .env changes
- [ ] Can create agent from admin panel
- [ ] Agent activation link opens the bot correctly
- [ ] Agent receives player invite link after activation
- [ ] Player invite link works for new players

## Common Issues

### "This bot doesn't exist"
- **Cause:** BOT_USERNAME doesn't match actual bot
- **Fix:** Run `pnpm verify:bot` and update .env

### Link shows `[BOT_USERNAME_NOT_CONFIGURED]`
- **Cause:** BOT_USERNAME missing from .env
- **Fix:** Add BOT_USERNAME to .env file

### "Agent link already activated"
- **Cause:** Link was already used by another Telegram account
- **Fix:** Create a new agent account for the new person

### Bot opens but doesn't activate agent
- **Cause:** Agent ID doesn't exist in database
- **Fix:** Verify agent exists in admin panel, generate fresh link

## Testing in Development

1. Set up local .env with your bot credentials
2. Start backend: `pnpm dev` (in apps/backend)
3. Start admin panel: `pnpm dev` (in apps/admin)
4. Create test agent via admin panel
5. Click activation link on phone/Telegram web
6. Verify complete flow works

## Production Deployment

After fixing .env:

1. Update environment variables in your hosting service:
   - Render / Railway / Vercel / etc.
   - Add/update BOT_USERNAME with correct value

2. Redeploy or restart service

3. Test with a new agent account

## Files Changed

- ✅ `apps/backend/src/services/agent.service.ts` - Improved error handling
- ✅ `apps/backend/verify-bot-config.js` - New verification script
- ✅ `apps/backend/package.json` - Added verify:bot script
- ✅ `apps/backend/AGENT-INVITE-TROUBLESHOOTING.md` - Comprehensive guide
- ✅ `AGENT-INVITE-FIX-SUMMARY.md` - This summary

## Next Steps

1. Run `pnpm verify:bot` in apps/backend
2. Check if BOT_USERNAME needs updating
3. Update .env if needed
4. Restart backend
5. Test agent creation and activation
6. Share the troubleshooting guide with your team

## Support

If issues persist after following these steps:
1. Check server logs for errors
2. Verify bot is running: `GET /` endpoint shows bot status
3. Check database for agent records
4. Review the troubleshooting guide for advanced debugging
