# The shared dev API

A branch can be tried against the shared dev database on Railway before it reaches production, without a staging
environment or per-PR copies.

## What it is

- **`api-dev`**, a service in Railway's `dev` environment, declared in the `dev` branch of `.railway/railway.ts`. It
  runs beside the dev Postgres on Railway's private network, with a public domain (`railway domain list -s api-dev -e dev`).
- Nothing deploys it automatically (no GitHub source). You deploy the working tree you are on (uncommitted changes
  included) with a script that uploads a clean copy of `apps/api`; the Railway CLI's own upload applies the repo's
  `.gitignore` too loosely and would drop `src/storage`:
  `apps/api/scripts/deploy-dev.sh`
- It runs with row-level security on, like your local API: the API connects as the restricted role
  (`DATABASE_URL`), and migrations and the seed run as the database owner (`SCHEMA_DATABASE_URL`). See `docs/tenant-isolation.md`.
- It holds **dev keys only**: the dev Clerk instances (`sk_test_`) and no production secrets. Storage (R2) and email
  (Resend) keys are not copied by default; pass `--with-storage-and-email` to copy them.

## Set it up (once)

1. `apps/api/scripts/railway-dev-vars.sh` shows what it would set; `--apply` sets the variables from your local
   `apps/api/.env`. It prints names, never values, and refuses a live Clerk key. The database URLs do not come from your
   `.env` (your local database is your own Docker Postgres): `SCHEMA_DATABASE_URL` is a reference to the dev Postgres,
   and `DATABASE_URL` (the restricted role) is kept as it is on `api-dev`. To set it the first time, or after rotating
   the role's password, pass `DEV_APP_ROLE_PASSWORD=<password>` to the script.
   Add `--with-storage-and-email` only if you accept dev writing to those services.
2. Deploy: `apps/api/scripts/deploy-dev.sh`.
3. Check: `curl https://<domain>/api/health`.

The shared dev database means branches deployed to `api-dev` share migrations. It has no public address, so nothing
outside Railway connects to it: migrations reach it only through `api-dev`'s start command (`prisma migrate deploy`)
when you deploy, and local work uses its own Docker database (`DEVELOPMENT.md`).

## Running a script against the dev database

Hand-run scripts (the demo seeds, `create-app-role.ts`, and the like) run inside the `api-dev` container, which reaches
the dev database on Railway's private network. The container holds the code you last deployed with `deploy-dev.sh`,
so deploy the branch that has the script first (for example the DSU demo seed, which lives on its own branch).

```bash
railway ssh -s api-dev -e dev -- sh -c 'npm run seed:adaptive-demo -- --allow-host postgres.railway.internal' </dev/null
```

The command runs in `/app`. `railway ssh -s api-dev -e dev` on its own opens a shell there instead.

The scripts connect as the owner (`SCHEMA_DATABASE_URL`, already set on `api-dev`). Their host check sees
`postgres.railway.internal`, which is production's private host too, so the `-e dev` on `railway ssh` is what keeps
you on dev: never run these in a shell on the production service.

To create or refresh the restricted role on dev (after a migration adds a function the API calls, or after a reset):

```bash
APP_ROLE_PASSWORD=<dev role password> npx ts-node -r tsconfig-paths/register scripts/create-app-role.ts --confirm-host postgres.railway.internal:5432
```

## Vercel previews

Preview deployments (every branch except `main`) get their API from the Vercel project's Preview-scope variables.

- **Learn Differently** (`learn-differently`): Preview `VITE_API_URL` is the dev API. Its Preview Clerk key was already the
  test key.
- **Interview Differently web** (`interview-differently-web`): until changed, one value of `VITE_API_URL` and of the Clerk
  key is shared by Production, Preview and Development, so previews would otherwise use the production values.
  `apps/api/scripts/vercel-preview-dev.sh` (dry run by default, `--apply` to change) takes Preview out of those two
  variables and adds Preview-only ones, leaving Production and Development untouched.

## Spark lessons on dev

Spark's lesson player (`apps/spark`) is embedded in the LMS with a link the API signs. It has no Vercel project or
domain of its own: the Learn Differently build copies its build into the site at `/spark/` (`apps/learn/vite.config.ts`),
so every Learn deployment, previews included, serves it at `<learn address>/spark/lesson`. Two variables, set only on the
API service (Railway variables of `api-dev` and of the production API; nothing on Vercel):

- `SPARK_WEB_URL`: where the player runs, with no trailing slash; the API adds `/lesson`. Locally
  `http://localhost:5175` (the Spark dev server, `npm run dev -w @id/spark`, serves at the root). On `api-dev`,
  `https://<Learn preview address>/spark`. In production `https://learndifferently.tech/spark`.
- `SPARK_SESSION_SECRET`: the secret that signs lesson links, a random value made with `openssl rand -base64 48`, its
  own value per environment and never the placeholder from `apps/api/.env.example`. With `NODE_ENV=production` and no real
  secret, the API still starts but every lesson link request fails with "Lessons are not set up on this server", so
  set it wherever `NODE_ENV` is production. Elsewhere a random secret per process stands in, and links break on restart.

## LTI on dev and local

The local API once shared the dev database with `api-dev`, and a stored address can only point at one API. So outside
production the API ignores the stored login, launch and key addresses of Interview Differently's own connection (the
one whose client id is the platform's own) and uses its own address (`LTI_API_BASE`) instead. Third-party connections, and every connection in production, use what is stored. The
Tools page shows a warning on that connection when this applies, because editing its addresses there has no effect
outside production. The switch is the environment name that `GET /health` reports.

The dev API accepts the browser origins of those preview deployments through `PREVIEW_ORIGIN_PATTERN` (a regular
expression, set only on `api-dev`, ignored in production). CORS and the Learn Differently token check both use it.

### Testing an LTI launch from a Learn preview

**To test a Learn Differently LTI session (a connected tool such as an Interview Differently scenario), start the
Interview Differently web app locally, pointed at the dev API:**

```bash
VITE_API_URL=<dev API address, without /api> npm run dev -w @id/web
```

Then open the Learn preview and launch the item. The preview talks to the dev API, the dev API signs the session, and
the launch lands on `http://localhost:5173` (`LTI_ID_WEB_URL` on `api-dev`), where the web app now calls the same API
that signed it. Without the `VITE_API_URL` override the web app calls your local API, which cannot verify a session
signed by the dev API, and the page says "We could not load this scenario".

Why it is this way: the API cannot derive the web app's address from the Learn preview, because the two projects'
preview hostnames are unrelated (branch names are shortened with a different hash for each project). The browser is
sent to localhost, so this only works on the machine running the web app. To use a hosted web preview instead, the
`interview-differently-web` project must build previews (its Ignored Build Step must not skip them); then set
`ID_WEB_URL` to that branch's web preview address, rerun `railway-dev-vars.sh --apply` and redeploy `api-dev`.
