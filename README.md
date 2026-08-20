# TesterSwap

Community for Android devs to trade closed-test signups and track Google Play's
12-testers / 14-days requirement. Real humans, mutual testing, zero fakes.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

Local runs use a SQLite file (`data.db`) automatically. Production runs use
Postgres as soon as `DATABASE_URL` is set — nothing else changes.

## Deploy to Vercel

Storage note: Vercel functions are serverless and stateless, so the app uses
Postgres there (`db.js` swaps SQLite → Postgres when `DATABASE_URL` exists).

1. Create a database:
   - Dashboard → Storage → Create → Neon Postgres / Vercel Postgres,
     copy the connection string.
2. Add env vars (answer `production` when asked which environments):
   ```bash
   npx vercel login
   npx vercel env add DATABASE_URL        # postgres://...
   npx vercel env add SESSION_SECRET       # openssl rand -hex 32
   npx vercel env add BASE_URL             # later: https://yourdomain.com
   ```
3. Deploy:
   ```bash
   npx vercel --prod
   ```

The whole app (API + static assets) runs as one function (`api/index.js`,
`vercel.json` routes everything to it). Add your domain in the Vercel dashboard
when ready, then set `BASE_URL` to it so OG images, canonical and sitemap point
at the real address.

## Launch checklist

- [x] Session secret persists (`.session-secret` or `SESSION_SECRET` env) — no logout on restart
- [x] Security headers: CSP, nosniff, frame-ancestors; login rate limited
- [x] Custom 404 page (server) + 404 route (client), robots.txt, sitemap.xml
- [x] Per-page meta titles/descriptions, OG image, favicons (PNG + SVG + apple-touch)
- [x] Cookie banner (one essential cookie, consent-gated analytics), privacy + terms + contact (with thank-you) pages
- [x] gzip for all responses, cache headers on images, mobile sticky CTA, form error states
- [x] Vercel-ready: `api/index.js` + `vercel.json`, SQLite→Postgres adapter (`DATABASE_URL`)
- [ ] Set `BASE_URL` env (used for canonical, OG image, sitemap — defaults to `https://testerswap.app`)
- [ ] Set `ANALYTICS_SRC` env to inject your Plausible/Umami script URL (loads only after cookie consent)
- [ ] Set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (register at reddit.com/prefs/apps)
- [ ] Set `REDDIT_REDIRECT_URI` to `${BASE_URL}/api/social/reddit/callback`
- [ ] Set `DISCORD_BOT_TOKEN` (from Discord Developer Portal)
- [ ] Set `CRON_SECRET` (random hex for cron endpoint auth)
- [ ] Set `ADMIN_EMAIL` (who can configure Discord bot)
- [ ] Replace `hello@testerswap.app` placeholder in privacy/terms with a real inbox you check
- [ ] Deploy on any host (Vercel works — see above; PM2/VPS, Render, Railway
      or Fly.io also work; Postgres in prod via `DATABASE_URL`)
- [ ] Put HTTPS in front (Vercel does this automatically; Caddy or Cloudflare
      elsewhere) — required for clipboard copy + real login security
- [ ] If behind a proxy, add `app.set('trust proxy', 1)` in `server.js`
- [ ] Set `PORT` env var on the host (defaults to 3000)
- [ ] Back up `data.db` daily (it is the whole community — users, apps, trades)
- [ ] Delete `data.db` on first deploy so the production DB starts clean
- [ ] Users bring their own AI API key (Settings) — no server key needed
- [ ] Moderation: watch for fake-opt-in abuse; remove bad actors or the
      community loses trust (the golden rule is the product)

## Stack

Express + built-in SQLite (`node:sqlite`, Node 22+), bcrypt passwords, signed
cookie sessions, vanilla JS SPA. No native build deps.

## Notes

- Sessions survive restarts via `.session-secret` (or `SESSION_SECRET` env).
- Rate limited login/register (20 per 10 min per IP).
- CSP + nosniff + frame-ancestors headers set; AI calls go server-side.