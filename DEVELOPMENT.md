# Installation and Deployment

## Local development

**Prerequisites:** Node 20+, Docker

```bash
# 1. Clone
git clone https://github.com/YOUR_ORG/interview-differently.git
cd interview-differently

# 2. Install
npm install

# 3. Copy env files
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env

# 4. Start Postgres and Redis
docker compose up -d

# 5. Run everything
npm run dev
```

Frontend runs at http://localhost:5173  
API runs at http://localhost:3000/api/health

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

**apps/web/.env**
```
VITE_API_URL=http://localhost:3000
```

**apps/api/.env**
```
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://id_user:id_password@localhost:5432/interview_differently
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your_key_here
CLERK_SECRET_KEY=your_key_here
```
