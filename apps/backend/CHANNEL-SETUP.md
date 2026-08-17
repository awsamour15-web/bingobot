# Channel Membership Gate Setup

## Overview
The bot has built-in channel membership verification that requires all users to join a specific Telegram channel before they can use the bot features.

## How It Works
1. When enabled, users who haven't joined the required channel will see a "Join Channel" button
2. All bot features (except /start and Register) are blocked until they join
3. The bot checks membership status before allowing access to guarded features

## Setup Steps

### Step 1: Get Your Channel ID

**For Public Channels:**
- Format: `@YourChannelUsername`
- Example: `@FidelBingo`
- Just use the @ symbol followed by your channel username

**For Private Channels:**
- You need the numeric channel ID (starts with `-100`)
- Use @getmyid_bot to get it:
  1. Add @getmyid_bot to your channel as admin
  2. Forward any message from your channel to @getmyid_bot
  3. The bot will reply with the channel ID (e.g., `-1001234567890`)

### Step 2: Make Bot an Admin

**CRITICAL:** The bot MUST be an administrator in your channel to check membership!

1. Go to your channel settings
2. Add your bot (@f_bingobot) as an administrator
3. Give it at least these permissions:
   - ✅ View messages
   - ✅ View members (optional but recommended)

### Step 3: Enable the Gate

**Option A: Using the setup script**

1. Edit `apps/backend/enable-channel-gate.js`
2. Change line 13 from `'@YourChannel'` to your actual channel ID
3. Run: `node enable-channel-gate.js`

**Option B: Manual database update**

Run this SQL in your database:

```sql
-- For public channel
INSERT INTO "Config" (key, value) 
VALUES ('required_channel', '@YourChannelUsername')
ON CONFLICT (key) DO UPDATE SET value = '@YourChannelUsername';

-- For private channel
INSERT INTO "Config" (key, value) 
VALUES ('required_channel', '-1001234567890')
ON CONFLICT (key) DO UPDATE SET value = '-1001234567890';
```

### Step 4: Verify It Works

1. Open your bot in Telegram with a fresh account (or clear your bot history)
2. Try clicking any button except "Register 📝"
3. You should see: "⚠️ To use this bot you must first join our channel"
4. Click "📢 Join Channel" button to join
5. After joining, try the button again - it should work now!

### Step 5: Restart Bot (if running)

If your bot is already running, restart it to apply changes:

```bash
# On your server
pm2 restart fidel-bingo-bot
# or
npm run bot:restart
```

## Disable the Gate

To disable and allow all users without joining:

```sql
DELETE FROM "Config" WHERE key = 'required_channel';
```

Or update with empty value:

```sql
UPDATE "Config" SET value = '' WHERE key = 'required_channel';
```

## Troubleshooting

### Users getting blocked even after joining
- **Cause:** Bot is not an admin in the channel
- **Fix:** Add bot as admin with proper permissions

### "Join Channel" button not working
- **Cause:** Invalid channel ID format
- **Fix:** 
  - Public channels must start with `@`
  - Private channels must be numeric with `-100` prefix
  - No spaces or extra characters

### Bot not checking membership
- **Cause:** Config value is empty or whitespace
- **Fix:** Verify database value is exactly your channel ID

## Testing

Use `check-channel.js` to verify configuration:

```bash
node check-channel.js
```

Output should show:
```
=== Channel Integration Check ===
Config: { key: 'required_channel', value: '@YourChannel' }
Status: ✅ ENABLED
```

## Code Reference

The channel gate is implemented in `src/bot/index.ts`:
- `getRequiredChannel()` - Fetches the channel ID from config
- `isChannelMember()` - Verifies user membership
- `buildJoinChannelMarkup()` - Creates the join button
- Middleware around line 666 - Enforces the gate
