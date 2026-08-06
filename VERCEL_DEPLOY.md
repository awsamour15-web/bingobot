# Vercel Deployment Guide

## mini-app

1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Configure:

| Setting | Value |
|---|---|
| Root Directory | `apps/mini-app` |
| Framework Preset | Vite |
| Build Command | `tsc && vite build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

3. Add environment variable:

```
VITE_API_URL = https://bingobot-vpif.onrender.com
```

4. Deploy → copy the URL → register it in BotFather as the Web App URL.

---

## admin

Same steps, different root:

| Setting | Value |
|---|---|
| Root Directory | `apps/admin` |
| Framework Preset | Vite |
| Build Command | `tsc && vite build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Add env vars from `apps/admin/.env`.

---

## Client-side routing

Both apps already have `vercel.json` at their roots:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This is required for React Router to work — without it, refreshing any page returns 404.

---

## pnpm workspace issues

If Vercel fails to resolve `@fidel/shared`, add this environment variable in Vercel project settings:

```
ENABLE_EXPERIMENTAL_COREPACK = 1
```

Then set the install command to:

```
pnpm install
```

---

## Notes

- The backend runs on Render — Vercel is frontend only.
- Keep `VITE_API_URL` pointing to your Render backend URL.
- Each app (mini-app, admin) is a separate Vercel project.
