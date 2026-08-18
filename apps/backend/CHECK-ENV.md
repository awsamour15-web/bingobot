# Environment Variable Issue Diagnosed

## Problem

The agent dashboard shows `[BOT_USERNAME_NOT_CONFIGURED]` which means:

**The backend server cannot read `process.env.BOT_USERNAME`**

## Root Cause

Your `.env` file has:
```env
BOT_USERNAME="f_bingobot"
```

BUT the backend server was started **before** this variable was set, or the server hasn't been restarted since it was modified.

## Solution

### For Development (Local):

1. **Stop the backend server** (if running)
   - Press `Ctrl+C` in the terminal running the backend

2. **Start it again:**
   ```bash
   cd apps/backend
   pnpm dev
   ```

3. **Test the agent dashboard** - the invite link should now show correctly

### For Production (Render/Railway/etc.):

1. **Update environment variables in your hosting dashboard:**
   - Go to your hosting service (Render, Railway, Vercel, etc.)
   - Find Environment Variables settings
   - Add or update:
     ```
     BOT_USERNAME=f_bingobot
     ```
   - Make sure there are NO quotes around the value in production dashboards

2. **Redeploy or restart the service:**
   - Some platforms auto-restart when env vars change
   - Others require manual redeploy

3. **Verify** by checking the agent dashboard

## How to Verify It's Fixed

### Method 1: Check Backend Health
Visit your backend URL:
```
http://localhost:3000/          (local)
https://your-backend.com/      (production)
```

Look for `bot_username` in the JSON response - it should show your bot's username.

### Method 2: Check Agent Dashboard
1. Log in as an agent
2. Go to agent dashboard
3. Look at "Your Invite Link"
4. Should show: `https://t.me/f_bingobot?start=ref_agent_xxxxx`
5. NOT: `[BOT_USERNAME_NOT_CONFIGURED]`

### Method 3: Check Server Logs
After restart, you should see in logs (if there was an issue):
```
[Agent Service] BOT_USERNAME not configured - cannot generate player invite link
```

If BOT_USERNAME is correctly loaded, this error won't appear.

## Why This Happened

1. Environment variables are read when the server **starts**
2. They are cached in `process.env` for the life of the process
3. Changing `.env` doesn't update running processes
4. You must **restart** the server to reload environment variables

## Testing After Fix

```bash
# Start backend
cd apps/backend
pnpm dev

# In another terminal, check if it's working
curl http://localhost:3000/

# Should see bot_username in the response
```

Then open agent dashboard and verify the invite link shows correctly.

## Still Showing [BOT_USERNAME_NOT_CONFIGURED]?

If restart doesn't fix it, check:

1. **.env file location:**
   - Must be at `apps/backend/.env`
   - NOT at project root

2. **.env file format:**
   ```env
   BOT_USERNAME="f_bingobot"
   ```
   OR without quotes:
   ```env
   BOT_USERNAME=f_bingobot
   ```

3. **No typos:**
   - Variable name must be exactly `BOT_USERNAME`
   - Not `BOT_USER_NAME` or `BOTUSERNAME`

4. **File is saved:**
   - Make sure you saved the .env file
   - Check file modification timestamp

5. **File encoding:**
   - Should be UTF-8
   - No BOM (byte order mark)

## Production Deployment Checklist

- [ ] Environment variable set in hosting dashboard
- [ ] Value is `f_bingobot` (or your actual bot username)
- [ ] No quotes around value in hosting dashboard
- [ ] Service restarted/redeployed
- [ ] Health endpoint shows bot_username
- [ ] Agent dashboard shows correct invite link

## Quick Test Command

After restarting backend, run this:

```bash
# Test if backend can read BOT_USERNAME
curl http://localhost:3000/ | grep bot_username
```

Should output something like:
```json
"bot_username":"f_bingobot"
```

If it shows `null` or is missing, the env var isn't being loaded.
