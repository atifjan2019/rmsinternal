# RMS Internal — Review Management System

Astro SSR app (deployed on Vercel) for managing customer review funnels and Google Business Profile reviews.

**Features**
- Review funnel pages: per-business landing pages that route happy customers to Google and collect private feedback from unhappy ones
- Google Business Profile integration: fetch all locations, view and reply to reviews from the dashboard
- Auto-reply: per-location, per-star-rating reply templates posted automatically to new reviews

## Stack

- Astro 5 (SSR, `@astrojs/vercel` adapter) + React + Tailwind
- Storage: Cloudflare D1 via HTTP API (see `schema.sql`)
- Auth: admin session JWT (`jose`) + bcrypt

## Environment variables (Vercel)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Admin session signing |
| `CF_ACCOUNT_ID` / `CF_DATABASE_ID` / `CF_API_TOKEN` | Cloudflare D1 HTTP API |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth web client (project `gmb-n8n-469019`) |
| `CRON_SECRET` | Protects `/api/cron/auto-reply` (Vercel Cron sends it as a Bearer token) |

## Google Business Profile setup

1. Google Cloud project needs these APIs enabled (already done on `gmb-n8n-469019`):
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API (v4 — reviews)
2. GBP API access must be approved by Google (quota > 0). Already approved on `gmb-n8n-469019`.
3. OAuth 2.0 Web client with redirect URIs:
   - `https://rms.webspires.co.uk/api/google/callback`
   - `http://localhost:4321/api/google/callback` (local dev)
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel and redeploy.
5. In the dashboard → **Google Reviews** tab → *Connect Google Account* (sign in with the Gmail that manages the Business Profiles).

**Note:** if the OAuth consent screen is in *Testing* mode, refresh tokens expire after 7 days — publish the app to Production to keep the connection alive.

## Auto-reply

- Configure per-location templates (star ratings 1–5) in **Google Reviews → Auto-Reply Settings**; `{name}` inserts the reviewer's first name; empty template = skip that rating.
- Runs daily via Vercel Cron (`vercel.json`, 09:00 UTC) and on demand via the **Run Auto-Reply Now** button.
- Only replies to reviews that have no owner reply yet; every reply is recorded in `replied_reviews` so nothing is double-posted.

## Development

```bash
npm install
vercel env pull .env.local
npm run dev
```
