# Beteseb Bingo — Deployment & Telegram Bot Setup Guide

## Overview

This project has 3 parts to deploy:
1. **Backend** (Express + Socket.IO) → Railway or Render
2. **Mini App** (React frontend) → Vercel
3. **Admin Panel** (React frontend) → Vercel

---

## Step 1: Create Your Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Enter a display name (e.g. `Beteseb Bingo`)
4. Enter a username (must end in `bot`, e.g. `beteseb_bingo_bot`)
5. BotFather will give you a token like:
   ```
   8643757251:AAEp5dRCld3yQTCpND8h5xV78M7M_vhauEU
   ```
6. **Save this token** — you will need it in Step 4

---

## Step 2: Create the Telegram Mini App

1. In BotFather, send `/newapp`
2. Select your bot
3. Enter an app name (e.g. `Beteseb Bingo`)
4. Enter a short description
5. Upload a photo (optional, can skip)
6. Set the Web App URL → you will get this URL after deploying the Mini App in Step 6
7. BotFather confirms your Mini App link will be:
   ```
   https://t.me/your_bot_username/app
   ```
8. **Save this link** — you will need it in Step 4

---

## Step 3: Set Up the Database

Your `.env` already has an Aiven PostgreSQL URL. If you want a new one:

1. Go to [aiven.io](https://aiven.io) (free tier available)
2. Create a PostgreSQL service
3. Copy the connection string

Run migrations before starting the backend:
```bash
cd apps/backend
pnpm db:generate
pnpm db:migrate
```

---

## Step 4: Configure Environment Variables

Edit `apps/backend/.env`:

```env
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="a-long-random-secret-string"
BOT_TOKEN="your-bot-token-from-botfather"
MINI_APP_URL="https://t.me/your_bot_username/app"
PORT=3000
```

---

## Step 5: Deploy the Backend

### Option A — Railway (Recommended)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repo
4. In project settings, set **Root Directory** to `apps/backend`
5. Set **Build Command**:
   ```
   pnpm install && pnpm db:generate && pnpm build
   ```
6. Set **Start Command**:
   ```
   pnpm start
   ```
7. Go to **Variables** tab and add all env vars from Step 4
8. Railway will give you a public URL like:
   ```
   https://your-app.up.railway.app
   ```
9. **Save this URL** — the frontend apps need it

### Option B — Render

1. Go to [render.com](https://render.com) and sign in
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `apps/backend`
5. Set **Build Command**:
   ```
   pnpm install && pnpm db:generate && pnpm build
   ```
6. Set **Start Command**:
   ```
   pnpm start
   ```
7. Add environment variables from Step 4
8. Deploy — Render gives you a URL like:
   ```
   https://your-app.onrender.com
   ```

---

## Step 6: Deploy the Mini App (Telegram Frontend)

### Using Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New** → **Project**
3. Import your repo
4. Set **Root Directory** to `apps/mini-app`
5. Set **Build Command**:
   ```
   pnpm build
   ```
6. Set **Output Directory**:
   ```
   dist
   ```
7. Add environment variable:
   ```
   VITE_API_URL=https://your-backend-url.up.railway.app
   ```
8. Click **Deploy**
9. Vercel gives you a URL like:
   ```
   https://your-mini-app.vercel.app
   ```
10. Go back to BotFather → `/myapps` → select your app → **Edit Web App URL**
11. Paste your Vercel URL

---

## Step 7: Deploy the Admin Panel

1. In Vercel, add another project from the same repo
2. Set **Root Directory** to `apps/admin`
3. Set **Build Command**: `pnpm build`
4. Set **Output Directory**: `dist`
5. Add environment variable:
   ```
   VITE_API_URL=https://your-backend-url.up.railway.app
   ```
6. Deploy — save the admin panel URL for your team

---

## Step 8: Connect Everything

Update `apps/backend/.env` with the final deployed URLs:

```env
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="your-secret"
BOT_TOKEN="your-bot-token"
MINI_APP_URL="https://your-mini-app.vercel.app"
PORT=3000
```

Redeploy the backend after updating env vars.

---

## Step 9: Test the Bot

1. Open Telegram
2. Search for your bot username (e.g. `@beteseb_bingo_bot`)
3. Send `/start`
4. You should see:
   - A welcome message
   - A **"🎮 Open Beteseb Bingo"** button
5. Tap the button — the Mini App should open inside Telegram

---

## Quick Reference — URLs to Save

| Service    | URL Example                              |
|------------|------------------------------------------|
| Backend    | `https://your-app.up.railway.app`        |
| Mini App   | `https://your-mini-app.vercel.app`       |
| Admin      | `https://your-admin.vercel.app`          |
| Bot Link   | `https://t.me/your_bot_username`         |
| Mini App   | `https://t.me/your_bot_username/app`     |

---

## Troubleshooting

**Bot not responding?**
- Check `BOT_TOKEN` is correct in backend env vars
- Make sure the backend is running (check Railway/Render logs)

**Mini App not opening?**
- Check the Web App URL in BotFather matches your Vercel URL exactly
- The URL must be HTTPS

**Database errors?**
- Run `pnpm db:migrate` to apply migrations
- Check `DATABASE_URL` is correct

**CORS errors in browser?**
- Add your frontend URLs to the CORS config in `apps/backend/src/index.ts`
