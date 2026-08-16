# Agent Invitation Link Troubleshooting Guide

This guide helps diagnose and fix issues with agent invitation links in the Fidel Bingo system.

## Quick Diagnosis

Run the verification script:

```bash
cd apps/backend
pnpm verify:bot
```

This will check your bot configuration and show you any mismatches.

## Common Issues

### 1. BOT_USERNAME Mismatch

**Symptoms:**
- Agent activation links don't open the bot
- Links look like: `https://t.me/wrong_username?start=agent_xxx`
- Error: "This bot doesn't exist"

**Solution:**
1. Get your actual bot username from BotFather or run `pnpm verify:bot`
2. Update `.env` file:
   ```
   BOT_USERNAME="your_actual_bot_username"
   ```
   (No @ symbol, just the username)
3. Restart the backend server

### 2. Missing BOT_USERNAME

**Symptoms:**
- Links show: `[BOT_USERNAME_NOT_CONFIGURED]`
- Server logs show: "BOT_USERNAME not configured"

**Solution:**
1. Add `BOT_USERNAME` to your `.env` file
2. Get the value from BotFather or by contacting your bot
3. Format: `BOT_USERNAME="your_bot_name"` (without @)

### 3. Agent Link Already Used

**Symptoms:**
- Error message: "This agent link has already been activated by another account"

**Explanation:**
- Each agent activation link can only be used once
- Once linked to a Telegram account, it cannot be transferred

**Solution:**
- Create a new agent account from the admin panel for the new person
- Each agent needs their own unique activation link

### 4. Invalid Agent ID

**Symptoms:**
- Link opens the bot but shows generic welcome message
- No agent activation occurs

**Possible Causes:**
- Agent record doesn't exist in database
- Agent was deleted
- Link was copied incorrectly

**Solution:**
- Verify the agent exists in the admin panel
- Generate a fresh link from the admin panel

## Understanding the Flow

### Agent Onboarding Process

1. **Admin creates agent account**
   - Admin panel → Agents → Create New Agent
   - Enter Telegram username (without @)
   - System generates: `https://t.me/{BOT_USERNAME}?start=agent_{agentId}`

2. **Agent activates account**
   - Agent clicks the activation link
   - Bot links their Telegram ID to the agent record
   - Bot shows: "Agent account activated! Share this link to invite players: ..."

3. **Agent gets player invite link**
   - Format: `https://t.me/{BOT_USERNAME}?start=ref_agent_{agentId}`
   - This link is what agents share with potential players

4. **Player signs up via agent link**
   - Player clicks agent's invite link
   - Player is automatically attributed to the agent
   - Agent earns 10% commission on player deposits

### Link Formats

- **Agent Activation:** `https://t.me/{BOT_USERNAME}?start=agent_{agentId}`
  - Used once by the agent to link their Telegram account
  
- **Player Invite:** `https://t.me/{BOT_USERNAME}?start=ref_agent_{agentId}`
  - Shared by agents with potential players
  - Can be used unlimited times

- **Regular Referral:** `https://t.me/{BOT_USERNAME}?start=ref_{telegramId}`
  - Player-to-player referrals (different from agent system)

## Debugging in Production

### Check Bot Status
```bash
curl https://your-backend-url.com/
```
Look for `bot_username` in the response.

### Verify Agent Record
In admin panel:
1. Go to Agents page
2. Find the agent
3. Check if `telegramId` is set (means activated)
4. Check if `isActive` is true
5. Check if `approvalStatus` is "approved"

### Database Queries

Connect to your database and run:

```sql
-- Check agent record
SELECT id, telegram_username, telegram_id, is_active, approval_status
FROM agents 
WHERE id = 'your-agent-id';

-- Check if agent has players
SELECT p.username, p.created_at 
FROM players p
WHERE p.agent_id = 'your-agent-id';
```

## Testing Links Locally

1. Update your local `.env`:
   ```
   BOT_USERNAME="your_bot_username"
   BOT_TOKEN="your_bot_token"
   ```

2. Start the backend:
   ```bash
   cd apps/backend
   pnpm dev
   ```

3. Create a test agent in admin panel

4. Try clicking the generated activation link on your phone (Telegram must be installed)

## Environment Variables Checklist

Required in `apps/backend/.env`:

```env
BOT_TOKEN="your-bot-token-from-botfather"
BOT_USERNAME="your_bot_username"  # NO @ symbol
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret"
MINI_APP_URL="https://your-mini-app-url.com/"
```

## Still Having Issues?

1. Run `pnpm verify:bot` and check output
2. Check server logs for errors
3. Verify the bot is running (check /api/health endpoint)
4. Test with a fresh agent account
5. Ensure you're using the latest code (agent system was added recently)

## Recent Changes

- Improved error handling for missing BOT_USERNAME
- Added validation in link generation functions
- Added this troubleshooting guide and verification script
