# Deploy From CLI

This repository can be deployed with very little dashboard work:

- Frontend: Vercel from the repo root
- Backend: Railway from `server/`
- Frontend talks to Railway directly through `VITE_API_BASE_URL`
- Railway is the canonical JSON API. Vercel `/api/*` is only for the serverless functions that remain in this repo, such as sitemaps/export-registry.

## 1. Prerequisites

Install both CLIs:

```bash
npm install -g @railway/cli vercel
```

Log in once:

```bash
railway login
vercel login
```

## 2. Deploy the backend to Railway

Work from the `server/` directory so Railway does not need a dashboard root-directory override.

```bash
cd server
railway init
railway add --service api
railway variables set TZ=Asia/Ho_Chi_Minh
railway variables set SUPABASE_URL=...
railway variables set SUPABASE_PUBLISHABLE_KEY=...
railway variables set SUPABASE_SECRET_KEY=...
railway variables set CORS_ALLOWED_ORIGINS=https://your-project.vercel.app
railway variables set PUBLIC_SITE_URL=https://your-project.vercel.app
railway up
```

Recommended optional variables:

```bash
railway variables set REDIS_URL=...
railway variables set TELEGRAM_BOT_TOKEN=...
railway variables set TELEGRAM_CHAT_ID=...
```

Useful scheduler variables if you want explicit control:

```bash
railway variables set NEWS_CRAWL_ENABLED=true
railway variables set VN_PRICE_CRON="0 8,14 * * *"
railway variables set PRICE_CONTENT_ENABLED=true
railway variables set PRICE_CONTENT_CRON="10 8,14 * * *"
railway variables set WORLD_PRICE_CRAWL_ENABLED=true
railway variables set WORLD_PRICE_CRAWL_CRON="30 7,13 * * *"
railway variables set BHX_CRAWL_ENABLED=true
railway variables set COOP_CRAWL_ENABLED=true
railway variables set CUSTOMS_SCHEDULER_ENABLED=true
```

After deploy, generate or copy the Railway public domain and verify:

```bash
railway domain
```

Then open:

- `https://your-railway-domain/api/health`

Keep the Railway service at `1 replica` so internal schedulers do not run more than once.

## 3. Deploy the frontend to Vercel

Return to the repo root:

```bash
cd ..
vercel link --yes
'https://your-railway-domain.up.railway.app' | vercel env add VITE_API_BASE_URL production --force
'https://your-railway-domain.up.railway.app' | vercel env add BACKEND_API_BASE_URL production --force
'https://your-railway-domain.up.railway.app' | vercel env add PRICE_CONTENT_API_BASE_URL production --force
vercel deploy --prod
```

The piped value becomes the Vercel production environment variable without an extra prompt.

This repo already includes `vercel.json` for SPA deep-link handling. Routes like `/bang-gia` and `/tin-tuc/...` refresh through the SPA fallback.

Generated price pages are different: `/gia-nong-san/<commodity>` and `/gia-nong-san/<commodity>/<location>` are rewritten to Railway so the first response is SEO HTML with title, description, canonical, H1, and JSON-LD. Keep `PUBLIC_SITE_URL` on Railway set to the public Vercel/custom domain so canonical URLs do not point at the Railway hostname.

If you later want preview deployments to call the live Railway API too, add the same Vercel env to `preview` and then add each preview origin you care about into `CORS_ALLOWED_ORIGINS`. For a minimal production setup, keep this production-only.

## 4. What still needs manual attention

These steps are usually still easier in the dashboard:

- Authenticating the first CLI session if SSO or browser approval is required
- Generating the Railway public domain if it does not already exist
- Setting a custom domain on Railway or Vercel
- Verifying the final Vercel production domain and copying it into `CORS_ALLOWED_ORIGINS`
- Updating `PUBLIC_SITE_URL` to the final public domain after custom-domain verification

If your Vercel production URL changes later, update Railway:

```bash
cd server
railway variables set CORS_ALLOWED_ORIGINS=https://new-domain.vercel.app,https://www.your-domain.com
railway variables set PUBLIC_SITE_URL=https://www.your-domain.com
```

## 5. Verification checklist

From the deployed frontend domain, verify:

- `/`
- `/gia-nong-san/<commodity>/<location>`
- View source for `/gia-nong-san/<commodity>` and confirm it is not the Vite SPA shell
- `/bang-gia`
- `/chuoi-gia`
- `/thegioi`
- one article detail route such as `/tin-tuc/<slug>`

From the Railway API, verify:

- `/api/health`
- `crawlers.schedule`
- `crawlers.newsSchedule`
- `crawlers.appSchedule`
- `/gia-nong-san/<commodity>` if checking the Railway HTML renderer directly

If the frontend loads but API calls fail, the first thing to check is `CORS_ALLOWED_ORIGINS` on Railway.
