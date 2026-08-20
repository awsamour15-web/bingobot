# 🚀 Neon Migration - Quick Start Checklist

Follow these steps in order. Each step takes ~2-5 minutes.

---

## Before You Start
- [ ] **Time needed:** ~30 minutes total
- [ ] **Risk level:** Low (we backup first, old database stays online)
- [ ] **Recommended time:** During low-traffic hours

---

## Step 1: Backup Current Database ⏱️ ~2 min

```bash
cd apps/backend
npm run db:backup
```

**What this does:**
- Creates `backups/fidelbingo_backup_[timestamp].sql.gz`
- This is your safety net!

**✅ Success check:** You see "Backup completed successfully!"

---

## Step 2: Create Neon Account ⏱️ ~3 min

1. Go to: **https://neon.tech**
2. Click **"Sign up"** (GitHub/Google recommended)
3. Click **"Create Project"**
4. Settings:
   - Name: `fidel-bingo`
   - Region: Choose closest to your users
   - PostgreSQL: 16 (latest)
5. Click **"Create Project"**

**✅ Success check:** You see a connection string on screen

---

## Step 3: Copy Connection Strings ⏱️ ~1 min

On the Neon project page, you'll see connection details.

### Find the Pooled Connection String
Look for: `postgres://[user]:[pass]@[host]/[db]?sslmode=require`

Copy this → You'll use it as `DATABASE_URL`

### Find the Direct Connection String
- Click the dropdown that says "Pooled connection"
- Select "Direct connection"
- Copy this → You'll use it as `DIRECT_URL`

**💾 Save both strings in a notepad for now!**

---

## Step 4: Update Environment Variables ⏱️ ~2 min

### Local Environment
Edit `apps/backend/.env`:

```env
# Comment out old Render database (keep as backup)
# DATABASE_URL="postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo"
# DIRECT_URL="postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo"

# Paste your Neon strings here
DATABASE_URL="YOUR_NEON_POOLED_STRING_HERE"
DIRECT_URL="YOUR_NEON_DIRECT_STRING_HERE"

# Keep everything else the same
JWT_SECRET="fidel-bingo-dev-secret"
BOT_TOKEN="8643757251:AAEp5dRCld3yQTCpND8h5xV78M7M_vhauEU"
BOT_USERNAME="f_bingobot"
MINI_APP_URL="https://bingobot-mini-app.vercel.app/"
PORT=3000
CORS_ORIGIN="https://fidelbingo-admin.pages.dev,https://bingobot.pages.dev,http://localhost:5173,https://bingobot-mini-app.vercel.app"
```

**✅ Success check:** File saved with new URLs

---

## Step 5: Run Migrations ⏱️ ~1 min

This creates all tables in your Neon database:

```bash
cd apps/backend
npx prisma migrate deploy
```

**What you'll see:**
```
✓ Migration 20250101000000_add_round_winners applied
✓ Migration 20260804221200_add_round_winners applied
...
✓ All migrations applied successfully
```

**✅ Success check:** No errors, all migrations applied

---

## Step 6: Restore Data ⏱️ ~5 min

Find your backup file in `apps/backend/backups/`

### Method 1: Using psql (Windows Git Bash)

```bash
# First, uncompress the backup
cd apps/backend/backups
gunzip fidelbingo_backup_[timestamp].sql.gz

# Then restore (replace [timestamp] with your actual file)
cd ..
psql "YOUR_NEON_DIRECT_URL_HERE" < backups/fidelbingo_backup_[timestamp].sql
```

### Method 2: Using Neon SQL Editor (if psql not available)

1. Go to Neon dashboard
2. Click "SQL Editor" tab
3. Open your `.sql` backup file in notepad
4. Copy entire content
5. Paste into SQL Editor
6. Click "Run"

**⚠️ Note:** This might take a few minutes for large databases

**✅ Success check:** No errors, you see INSERT statements executed

---

## Step 7: Verify Data ⏱️ ~2 min

Open Prisma Studio to check your data:

```bash
cd apps/backend
npx prisma studio
```

This opens in browser (usually `http://localhost:5555`)

**Check these tables have data:**
- ✅ `Player` - Should show your users
- ✅ `Wallet` - Should show wallet records
- ✅ `GameRound` - Should show past games
- ✅ `Transaction` - Should show transactions

**✅ Success check:** All tables populated with data

---

## Step 8: Test Locally ⏱️ ~3 min

Start your backend:

```bash
cd apps/backend
npm run dev
```

**Test these:**
1. ✅ Server starts without errors
2. ✅ Open Telegram bot → Send `/start`
3. ✅ Bot responds correctly
4. ✅ Try `/balance` command
5. ✅ Check admin panel loads

**✅ Success check:** Everything works as before

---

## Step 9: Update Production ⏱️ ~5 min

### On Render.com

1. Go to: **https://dashboard.render.com**
2. Select your backend service
3. Click **"Environment"** tab
4. Update these variables:
   ```
   DATABASE_URL → YOUR_NEON_POOLED_URL
   DIRECT_URL → YOUR_NEON_DIRECT_URL
   ```
5. Click **"Save Changes"**
6. Render will auto-deploy

**✅ Success check:** Deployment successful in logs

---

## Step 10: Verify Production ⏱️ ~3 min

Wait 2-3 minutes for deployment, then:

1. **Check bot in Telegram:**
   - Send `/start`
   - Send `/balance`
   - Try joining a game

2. **Check admin panel:**
   - Go to `https://fidelbingo-admin.pages.dev`
   - Login
   - Verify dashboard loads
   - Check player list

3. **Check Neon dashboard:**
   - Go to your Neon project
   - Click "Monitoring" tab
   - You should see active connections

**✅ Success check:** Everything works in production!

---

## 🎉 Migration Complete!

### What Changed:
✅ Database moved from Render → Neon
✅ Better performance and scaling
✅ More generous free tier
✅ All data preserved

### What Stayed the Same:
✅ Bot works exactly the same
✅ Admin panel unchanged
✅ All user data intact
✅ No code changes needed

### Keep Old Database for 1-2 Weeks
Don't delete your Render database yet. Keep it as backup for 1-2 weeks while you monitor Neon.

---

## If Something Goes Wrong

### Quick Rollback (takes 1 minute)

1. Edit `apps/backend/.env`
2. Uncomment the old Render URLs
3. Comment out Neon URLs
4. Restart your app: `npm run dev`
5. Update Render environment variables back to old URLs

**Your old database is untouched - you can always go back!**

---

## Troubleshooting

### Error: "Connection timeout"
**Fix:** Check Neon project is active (not suspended)

### Error: "SSL required"
**Fix:** Ensure connection strings have `?sslmode=require`

### Error: "Migration failed"
**Fix:** Database must be empty before migrations. Drop all tables in Neon and retry.

### Error: "Data restore failed"
**Fix:** 
1. Make sure migrations ran first
2. Check backup file is not corrupted
3. Try restoring table by table

### Bot not responding
**Fix:**
1. Check Render deployment logs
2. Verify environment variables saved
3. Restart the service manually

---

## Need Help?

1. Check full guide: `NEON-MIGRATION-GUIDE.md`
2. Neon docs: https://neon.tech/docs
3. Neon Discord: https://discord.gg/neon

---

## After Migration Checklist

- [ ] ✅ Migration completed successfully
- [ ] ✅ Bot tested and working
- [ ] ✅ Admin panel tested and working
- [ ] ✅ Monitor for 24 hours
- [ ] ✅ Keep Render database for 1-2 weeks as backup
- [ ] ✅ Update backup scripts to use Neon (optional)
- [ ] ✅ Delete Render database after 2 weeks

**Congratulations! You're now on Neon! 🚀**
