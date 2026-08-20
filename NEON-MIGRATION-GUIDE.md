# 🚀 Migrate to Neon Database - Complete Guide

This guide walks you through migrating your Fidel Bingo database from Render to Neon.

## Why Neon?
- ✅ Better free tier (0.5 GB storage + generous compute)
- ✅ Autoscaling (scales to zero when idle)
- ✅ Faster connection pooling
- ✅ Better for serverless deployments
- ✅ No credit card required

---

## Step 1: Backup Current Database (CRITICAL!)

Before anything, backup your current data:

```bash
cd apps/backend
npm run db:backup
```

This creates a backup file in `apps/backend/backups/` with timestamp.

**Keep this backup safe!** You'll need it if anything goes wrong.

---

## Step 2: Create Neon Account & Database

1. **Sign up at Neon**
   - Go to: https://neon.tech
   - Click "Sign up" (use GitHub/Google/Email)
   - No credit card required!

2. **Create a new project**
   - Click "Create Project"
   - Project name: `fidel-bingo` (or any name)
   - Region: Choose closest to your users (e.g., US East, EU West)
   - PostgreSQL version: 16 (latest)
   - Click "Create Project"

3. **Get your connection strings**
   
   After creation, you'll see a page with connection details. You need TWO URLs:

   ### Connection String (Pooled) - for app queries
   ```
   postgres://[username]:[password]@[host]/[database]?sslmode=require
   ```
   
   ### Direct Connection - for migrations
   Look for "Direct connection" or toggle the connection string view.
   ```
   postgres://[username]:[password]@[host]/[database]?sslmode=require&connect_timeout=10
   ```

   **Save both URLs!** You'll need them in the next step.

---

## Step 3: Update Environment Variables

### For Local Development

Edit `apps/backend/.env`:

```env
# OLD - Render Database (keep as backup reference)
# DATABASE_URL="postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo"
# DIRECT_URL="postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo"

# NEW - Neon Database
DATABASE_URL="YOUR_NEON_POOLED_CONNECTION_STRING_HERE"
DIRECT_URL="YOUR_NEON_DIRECT_CONNECTION_STRING_HERE"

# Keep these unchanged
JWT_SECRET="fidel-bingo-dev-secret"
BOT_TOKEN="8643757251:AAEp5dRCld3yQTCpND8h5xV78M7M_vhauEU"
BOT_USERNAME="f_bingobot"
MINI_APP_URL="https://bingobot-mini-app.vercel.app/"
PORT=3000
CORS_ORIGIN="https://fidelbingo-admin.pages.dev,https://bingobot.pages.dev,http://localhost:5173,https://bingobot-mini-app.vercel.app"
```

### For Production (Render.com)

Update environment variables in your Render dashboard:

1. Go to your backend service on Render
2. Click "Environment" tab
3. Update these variables:
   - `DATABASE_URL` → Your Neon pooled connection string
   - `DIRECT_URL` → Your Neon direct connection string
4. Click "Save Changes"

---

## Step 4: Run Migrations on Neon

This creates all tables in your new Neon database:

```bash
cd apps/backend
npx prisma migrate deploy
```

This will:
- Connect to Neon using `DIRECT_URL`
- Run all migrations from `prisma/migrations/`
- Create all tables, indexes, and constraints

---

## Step 5: Restore Your Data

Now restore your backup to the new Neon database:

### Option A: Using pg_restore (Recommended)

If your backup is a `.dump` file:

```bash
# Install psql tools if not already installed (Windows with Git Bash)
# You may need to install PostgreSQL client tools

# Restore the backup
psql "YOUR_NEON_DIRECT_CONNECTION_STRING_HERE" -f backups/backup-YYYY-MM-DD-HHMMSS.sql
```

### Option B: Using Neon Console

1. Go to your Neon project dashboard
2. Click "SQL Editor"
3. Open your backup `.sql` file
4. Copy and paste the SQL content
5. Click "Run"

### Option C: Manual Data Migration (if backup restore fails)

If you need to copy data table by table:

```bash
# Export from old database
pg_dump "YOUR_OLD_RENDER_DATABASE_URL" --data-only --table=players > players.sql
pg_dump "YOUR_OLD_RENDER_DATABASE_URL" --data-only --table=wallets > wallets.sql
# ... repeat for other tables

# Import to new database
psql "YOUR_NEON_DIRECT_CONNECTION_STRING_HERE" < players.sql
psql "YOUR_NEON_DIRECT_CONNECTION_STRING_HERE" < wallets.sql
# ... repeat for other tables
```

---

## Step 6: Test the Connection

Test that everything works:

```bash
cd apps/backend

# Test Prisma connection
npx prisma db pull

# Check your data
npx prisma studio
```

This opens Prisma Studio where you can verify:
- ✅ All tables exist
- ✅ Data is present
- ✅ Relationships are intact

---

## Step 7: Test Your Application

Start your backend locally:

```bash
cd apps/backend
npm run dev
```

Test critical features:
1. ✅ Bot responds to commands
2. ✅ Players can join games
3. ✅ Wallet transactions work
4. ✅ Admin panel loads data
5. ✅ Deposits/withdrawals function

---

## Step 8: Deploy to Production

### If using Render.com:

1. Your environment variables are already updated (Step 3)
2. Trigger a new deployment:
   - Go to your Render dashboard
   - Click "Manual Deploy" → "Deploy latest commit"
   - Or push a new commit to trigger auto-deploy

3. Monitor the deployment logs for any errors

### If using Vercel/other platform:

Update environment variables in your deployment platform and redeploy.

---

## Step 9: Monitor & Verify

After deployment, check:

1. **Backend Health**
   - Visit: `https://bingobot-vpif.onrender.com/health` (or your backend URL)
   - Should return status OK

2. **Bot Functionality**
   - Send `/start` to your bot
   - Try a test deposit
   - Join a game round

3. **Admin Panel**
   - Login to admin panel
   - Check if dashboard loads
   - Verify data displays correctly

4. **Neon Dashboard**
   - Go to your Neon project
   - Check "Monitoring" tab
   - Verify queries are running
   - Check connection pool usage

---

## Rollback Plan (If Something Goes Wrong)

If you encounter issues with Neon:

1. **Immediate rollback:**
   ```bash
   # In apps/backend/.env, uncomment the old Render URLs:
   DATABASE_URL="postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo"
   DIRECT_URL="postgresql://fidelbingo_user:Y3Lbz9YxkWZ4Ssmwvm4NPKGH89kyPs6V@dpg-d9l6hfrm8hqs739bm19g-a.oregon-postgres.render.com:5432/fidelbingo"
   ```

2. **Redeploy with old credentials**

3. **Your data is safe** - the Render database still has everything

---

## Common Issues & Solutions

### Issue: "SSL connection required"
**Solution:** Add `?sslmode=require` to your Neon connection strings

### Issue: "Connection timeout"
**Solution:** 
- Check Neon project is not suspended
- Verify connection strings are correct
- Ensure no firewall blocking connections

### Issue: "Migration failed"
**Solution:**
- Ensure database is empty before running migrations
- Or manually drop all tables and retry

### Issue: "Data not showing up"
**Solution:**
- Verify backup restore completed successfully
- Check Prisma Studio to inspect data
- Ensure you ran migrations before restoring data

---

## Neon-Specific Tips

### 1. Connection Pooling
Neon automatically pools connections. Your current code should work fine.

### 2. Compute Autoscaling
Neon scales to zero after inactivity. First query after idle might be slightly slower (cold start). This is normal and expected.

### 3. Free Tier Limits
- 0.5 GB storage
- 100 compute hours/month
- If you exceed, Neon will notify you (plenty for your use case)

### 4. Branch for Testing
Neon allows database branches (like Git). You can create test branches for experimenting without affecting production.

---

## Performance Optimization

After migration, consider these optimizations:

### 1. Add Connection Pool Config
In `apps/backend/src/lib/prisma.ts`, ensure you have:

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

### 2. Monitor Slow Queries
Check Neon dashboard for slow queries and add indexes if needed.

### 3. Enable Query Logging (temporarily)
```typescript
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});
```

---

## Next Steps After Migration

1. ✅ **Keep Render database for 1-2 weeks** as backup
2. ✅ **Set up automated backups** on Neon (they have built-in backups)
3. ✅ **Update your backup scripts** to use new connection string
4. ✅ **Monitor Neon dashboard** for usage/performance
5. ✅ **Delete Render database** after confirming everything works

---

## Support

- **Neon Docs:** https://neon.tech/docs
- **Neon Discord:** https://discord.gg/neon
- **Prisma Docs:** https://www.prisma.io/docs

---

## Checklist

- [ ] Backup current database
- [ ] Create Neon account & project
- [ ] Get both connection strings (pooled + direct)
- [ ] Update local `.env` file
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Restore backup data
- [ ] Test with Prisma Studio
- [ ] Test application locally
- [ ] Update production environment variables
- [ ] Deploy to production
- [ ] Verify bot & admin panel work
- [ ] Monitor for 24-48 hours
- [ ] Keep old database as backup for 1-2 weeks

---

**Good luck with your migration! 🚀**

If you encounter any issues, check the "Common Issues" section or feel free to ask for help.
