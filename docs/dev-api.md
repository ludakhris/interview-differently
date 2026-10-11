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
   `apps/api/.env` (its `DATABASE_URL` must be the restricted role). It prints names, never values, and refuses a live Clerk key or a non-dev database.
   Add `--with-storage-and-email` only if you accept dev writing to those services.
2. Deploy: `apps/api/scripts/deploy-dev.sh`.
3. Check: `curl https://<domain>/api/health`.

The shared dev database means branches share migrations, as they do for local work today.

## Vercel previews

Preview deployments (every branch except `main`) get their API from the Vercel project's Preview-scope variables.

- **Learn Differently** (`learn-differently`): Preview `VITE_API_URL` is the dev API. Its Preview Clerk key was already the
  test key.
- **Interview Differently web** (`interview-differently-web`): until changed, one value of `VITE_API_URL` and of the Clerk
  key is shared by Production, Preview and Development, so previews would otherwise use the production values.
  `apps/api/scripts/vercel-preview-dev.sh` (dry run by default, `--apply` to change) takes Preview out of those two
  variables and adds Preview-only ones, leaving Production and Development untouched.

## LTI on dev and local

The local API and `api-dev` share one database, so they share the stored tool connections, and a stored address can only
point at one of them. To avoid breaking one for the other, outside production the API ignores the stored login, launch and
key addresses of Interview Differently's own connection (the one whose client id is the platform's own) and uses its own
address (`LTI_API_BASE`) instead. Third-party connections, and every connection in production, use what is stored. The
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
