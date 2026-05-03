# Installation and Deployment

## Local development

**Prerequisites:** Node 20+

```bash
# 1. Clone
git clone https://github.com/ludakhris/interview-differently.git
cd interview-differently

# 2. Install
npm install

# 3. Set up env files (see Environment variables below)
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
# Then fill in the values — DATABASE_URL and VITE_CLERK_PUBLISHABLE_KEY are required to run locally
```

### Database setup (required before first run)

The project uses **Railway Postgres** — no local Postgres or Docker needed.

**Get your DATABASE_URL:**
1. Open [railway.app](https://railway.app) → your project → **PostgreSQL** service
2. Click the **Connect** tab
3. Copy the **DATABASE_URL** and paste it into `apps/api/.env`

**Run migrations and seed:**
```bash
cd apps/api
npx prisma generate       # generates the Prisma client
npm run db:migrate        # creates tables in Railway Postgres
npm run db:seed           # populates built-in scenarios from YAML files
cd ../..
```

> **Note:** Run these from inside `apps/api/`, not the monorepo root.

**Start everything:**
```bash
npm run dev               # from monorepo root — starts both API and frontend
```

Frontend runs at http://localhost:5173  
API runs at http://localhost:3000/api/health

**Resetting the database** (if scenarios get corrupted or you want a clean slate):
```bash
cd apps/api && npm run db:reset
```

This wipes all data and re-seeds from the static YAML files in `apps/web/src/lib/scenarios/`. The YAML files are the source of truth for built-in scenarios.

### Demo data — fake institution, cohort, students, simulations

`apps/api/scripts/seed-fake-cohort.ts` is a CLI for spinning up (and tearing down) a complete demo institution so the analytics views (`/admin/institutions/:id/analytics`) have real numbers to render. It creates **real Clerk users** with verified emails so they could in theory sign in too.

> **⚠️ Production caveat.** The `remove` command nukes whatever institution name you pass — including any real users in it and their simulation history. Pick demo institution names that are obviously fake (e.g. *"Demo U"*, *"QA Test School"*) so you don't accidentally type a live one.
>
> **Domain caveat.** Clerk rejects reserved TLDs (`.test`, `.local`, `.invalid`) as invalid email format. Use a real-looking TLD like `.com`, `.dev`, or `.io` even if the domain isn't registered — Clerk doesn't verify deliverability on admin createUser, just the format.

Requires `CLERK_SECRET_KEY` and `DATABASE_URL` in `apps/api/.env`. Defaults to whichever Clerk instance + Postgres your env points at.

**Add a 10-student cohort** (creates institution if missing, cohort if missing, 10 fresh Clerk users with `@demo-u.test` emails, 1–6 attempts per user with random scores spread over 60 days):

```bash
cd apps/api
npm run seed:fake -- add \
  --institution "Demo U" \
  --domain demo-u.com \
  --cohort "Spring 2026" \
  --users 10 \
  --join-key spring2026-demo
```

**List existing institutions** (sanity-check before nuking):

```bash
npm run seed:fake -- list
```

**Remove an institution and ALL its data** (cohorts, memberships, Clerk users, SimulationResult, SimulationAttempt). Prompts for confirmation unless `--yes`:

```bash
npm run seed:fake -- remove --institution "Demo U" --yes
```

**Tips:**
- Pick a domain you don't actually own (e.g. `demouniversity.com`). Clerk only validates format, not deliverability — but never use a domain you'd later want real users to sign up under.
- The `--join-key` is optional — without it students would have to be admin-added or matched by email domain.
- Re-running `add` against the same institution name reuses the institution + cohort and just adds more users.

### Production database (Railway)

On every deploy, Railway automatically runs:
```
npx prisma migrate deploy && npm run db:seed && node dist/main.js
```

- `prisma migrate deploy` — applies any pending migrations (safe to run repeatedly)
- `npm run db:seed` — seeds built-in scenarios only if the database is empty, skips otherwise

So the first production deploy seeds the database automatically. No manual steps needed.

**If Railway skips your deploy** (path-based triggers only fire when `apps/api` or `packages/types` change), force a redeploy by touching any file in `apps/api`:

```bash
echo "" >> apps/api/README.md
git add apps/api/README.md
git commit -m "chore: trigger Railway deploy"
git push
```

## Accounts you need

Before deploying, create accounts at:

- [vercel.com](https://vercel.com) — frontend hosting
- [railway.app](https://railway.app) — backend, Postgres, Redis
- [clerk.com](https://clerk.com) — auth and SSO
- [anthropic.com](https://anthropic.com) — AI evaluation API

## First-time deploy setup

**Vercel (frontend)**
1. Go to vercel.com and import this repo
2. Set the root directory to `apps/web`
3. Copy the Project ID and Org ID from project settings

**Railway (backend + database)**
1. Go to railway.app and create a new project
2. Add a Node service pointed at `apps/api`
3. Add a PostgreSQL plugin and a Redis plugin
4. Copy the Railway token from account settings

**GitHub Secrets — add all four**

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | vercel.com → Account → Tokens |
| `VERCEL_ORG_ID` | vercel.com → Project Settings |
| `VERCEL_PROJECT_ID` | vercel.com → Project Settings |
| `RAILWAY_TOKEN` | railway.app → Account Settings |

## CI/CD behavior

Every pull request runs lint, typecheck, build, and test.

Merging to `main` triggers automatic deployment:
- Changes to `apps/web` or `packages/types` deploy to Vercel
- Changes to `apps/api` or `packages/types` deploy to Railway

No manual deploys needed after initial setup.

## Environment variables

**apps/web/.env.local**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...   # from dashboard.clerk.com
VITE_API_URL=http://localhost:3000
```

**apps/api/.env**
```
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://...            # from Railway → PostgreSQL → Connect
REDIS_URL=redis://...                    # from Railway → Redis → Connect (Phase 4+)
ANTHROPIC_API_KEY=your_key_here          # from console.anthropic.com (Phase 4+)
CLERK_SECRET_KEY=your_key_here           # from dashboard.clerk.com (Phase 4+)
```
