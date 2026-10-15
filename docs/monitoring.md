# Uptime monitoring and the status page (Better Stack)

Better Stack Uptime checks the public health URLs and keeps a status page with a section per product. What it checks
lives in code, `ops/monitoring.ts`, and CI applies it (GitHub issue #92). The admin System status page
(`/lms/admin/status`) is separate: it is for staff and shows the reasons; Better Stack sees only the status codes.

## What is in the list

Each check has a name and a path on the production API, under its product's section. Every check is a "status code
2xx" monitor (the health URLs answer 503 when failing), every 5 minutes, alerting the team by email. The status page
(`chow-works`, the account's one status page) is shared by every product (Learn, Interview, Audit Differently, …): the sync creates it if it is missing but never renames it, and adds only its own section, "Learn Differently", with a row per check named "Learn Differently · <emoji> <product> · <check>" and a help-icon explanation of what it checks.
The account also holds other projects' monitors, so ours are named `Learn Differently · <emoji> <product> · <check>`, e.g. "Learn Differently · 🕹️ Simulator · Simulation scoring" (alert
emails and incidents use that name) and all sit in the monitor group "Learn Differently" (both set in
`ops/monitoring.ts`); "Videos" in the
URLs and names means Spark's lessons (the `lessons` service in the code). The API check sits in the LMS section but
covers the whole shared API.

To add a check: give it a public health URL (see "Status page and monitoring" in `CLAUDE.md`), add it to its product's
section in `ops/monitoring.ts`, and merge. The next push to main creates the monitor and its row.

## How the sync works

`scripts/betterstack-sync.ts` runs in CI (the `betterstack` job in `.github/workflows/ci.yml`) on every push to main,
after the API deploy job has passed. It reads the account and then:

- **The monitor group** is matched by name and created if missing.
- **Monitors** are matched by URL, or by name when only the URL changed. It creates missing ones and updates the
  name, URL, check type, email alerts, check frequency and group when they differ (so a change made by hand in Better Stack
  to those fields is put back; other settings, such as SMS or an escalation policy, are left alone).
- **The status page** is matched by its subdomain (`statusPage.subdomain`), which must be unique across all of Better
  Stack; changing it creates a new page. Its title is updated when it changes. Publishing it, a custom domain and its
  look are set in Better Stack by hand.
- **Sections** are matched by title; **rows** by the monitor they show. A row is moved or renamed when the list says so.
- **Nothing is deleted.** A monitor on our API or in our group, or a section or row on our status page, that is not in the list is
  printed as "not in ops/monitoring.ts"; remove it in Better Stack if it is unwanted.

Without a token it prints "Better Stack sync skipped: no token" and exits 0, so CI passes before the account exists.

## Setting it up (owner, once)

1. Create a Better Stack account (Uptime).
2. Create a team-scoped token: Better Stack → API tokens → Team-based tokens, choose the team, and create a token in
   "Uptime API tokens". A team token is enough; the script does not support a global token (that needs a team name on
   every request).
3. Add it to GitHub as the repository secret `BETTERSTACK_API_TOKEN` (Settings → Secrets and variables → Actions). Do
   not put it in the repo, in `.railway/railway.ts` or on Railway: only CI uses it.
4. Check that the subdomain in `ops/monitoring.ts` is free (the first sync fails with Better Stack's error if it is
   taken; change it and push again).
5. Run a dry run (below), then push to main, or re-run the latest main CI run.
6. In Better Stack, check that the team's alerts reach the right people, and publish the status page when it looks
   right.

## A dry run on your machine

Lists what the sync would create or update, and what is not in the list, without changing anything (it still reads the
account, so it needs the token):

```bash
read -rs BETTERSTACK_API_TOKEN && export BETTERSTACK_API_TOKEN   # paste the token; it is not echoed or kept in history
npm run betterstack:sync -- --dry-run
```

Never put the token in a file in the repo. Leave out `--dry-run` to apply. The planning
logic is tested with the API stubbed: `npm run test:scripts`.
