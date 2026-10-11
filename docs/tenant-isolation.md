# Tenant isolation: one agency never sees another's data

Learn Differently serves many agencies from one platform. Each agency's learners, outcomes, notes and
gradebooks belong to that agency alone. Two layers enforce it, and they do different jobs. Tracked in GitHub
issue #84.

| Layer                             | Responsibility                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Database** (row-level security) | The agency boundary. Whatever the application asks for, Postgres returns only rows from agencies the caller is authorized for.      |
| **Application** (roles, guards)   | What a person may do **inside** an agency: agency admin, provider admin, organization admin, case manager (and, later, instructor). |

A mistake in the application's access logic can then expose data only inside one agency, never across agencies.

## What this protects against, and what it does not

Row-level security is a second wall behind the application's own checks. It protects against **logic mistakes**: a
query that forgets its filter, a route that looks something up by id without checking whose it is, a role check that
is wrong. Each of those still cannot cross an agency.

It does not protect against **SQL injection**. The caller's context is a pair of settings the API sets on its own
connection, so SQL an attacker controls could set them too. The rule that keeps this safe is the one that keeps any
SQL safe: every query is parameterized, and raw SQL never interpolates a request value. Treat a raw query that builds
SQL from input as a defect.

It also cannot check things only the application knows. A person who knows an open cohort's id and has a session could
enrol themselves in it at the database level; the join code that proves they were invited is checked by the API. (The
database does refuse a self-enrolment into an approval-only or full cohort.)

## The model

- **The tenant is the agency.** Every institution belongs to exactly one agency. An agency has no parent; every
  provider and organization has one (a database `CHECK` and a trigger enforce it for new and changed rows, and the
  parent must be an agency).
- **Standalone Interview Differently** institutions belong to the **Interview Differently Standalone** agency
  (`src/core/standalone-agency.ts`). It has no subdomain, so it never appears as a workspace.
- **Learner and course data carry `agencyId`.** A database trigger fills it in (a cohort takes its institution's
  agency unless its creator names one; everything under a cohort copies the cohort's; a course takes its provider's,
  and its modules, items and offers copy it), so application code cannot forget it or set it wrongly. A cohort never
  changes agency. A row whose parent has no agency yet simply gets none, which never blocks a write; a later migration
  requires it.
- **Grants are memberships with a role.** A person's agencies are the agencies of their workspace-level memberships
  (`cohortId` null) that carry a `role`. A learner's own memberships have no role, so they never grant an agency, and
  a policy stops anyone writing a role-bearing membership unless they are already in that agency. A system
  administrator and the Interview Differently platform `admin` get every agency. An Interview Differently
  institution-admin works in the standalone agency only.
- **People see their own records**, in any agency, and may change the ones that are theirs, within limits: they enrol
  only where no approval is needed and there is room, ask to join only where approval is needed, log activity only
  against their own enrolment, and can never delete or re-point a record or write a role. Staff-only tables have no
  such clause.
- **Courses are private to their agency.** A course, with its modules and items, is visible to its agency's staff, to
  an organization it has been offered to, and to anyone who can see a cohort that runs it. A cohort may only run a
  course of its own agency or one offered to its institution. Only the agency's staff change a course or its offers.
  The public catalog shows published course cards (never content) through a narrow system read.
- **What a row belongs to cannot change** (an enrollment's cohort, a membership's institution, and so on).

## How a request works

1. `TenantMiddleware` opens an empty context (`src/core/tenant-context.ts`) for the request.
2. The guard that verifies the caller calls `identifyCaller` before anything else touches the database.
3. `PrismaService` (`src/prisma/prisma.service.ts`) sets two transaction-local settings on every query that can reach
   a tenant table: who the caller is, and their agencies, which the database works out from their grants. Inside
   `$transaction` the queries join the caller's transaction, so atomicity is unchanged.
4. Policies (`prisma/migrations/20261014110000_tenant_rls`) compare the row's `agencyId` and owner with those
   settings. With no settings the caller sees nothing. Reading, inserting, updating and deleting have separate
   policies: being able to see a row never means being able to change it.

**Trusted paths** (`runAsSystem`) act for every agency: the lookup that finds a cohort by its join code (made before
the learner belongs to it), the few lookups inside the LTI launch handshake (the tool authenticates by a signed token, not a session), the public catalog, and
background loaders. A score posted back by an LTI tool is not system: its URL carries the cohort's agency under the platform's signature, and the score is recorded limited to that agency. Keep the system list short and reviewed. In an interactive `$transaction(async (tx) => ...)` use `tx`
for every query inside the callback.

## Switching it on

Row-level security applies whenever the API connects as a restricted role, in every environment, local development
included.

- **`DATABASE_URL`** is the API's connection: the restricted role (`ld_app`), which the policies bind.
- **`SCHEMA_DATABASE_URL`** is the database owner, for anything that changes or reads the schema: Prisma's CLI
  (`directUrl` in `schema.prisma`), the seed and the scripts (`scripts/lib/owner-env.ts`).

At startup the API checks which role it connected as and turns the per-query context on only for the restricted role.
Connected as the owner or a superuser (tests, a fresh checkout) it is the plain client and says so in the log.
`REQUIRE_TENANT_RLS=on` makes startup fail instead of running without it; a deployment sets it once its
`DATABASE_URL` is the restricted role. The role may execute only the functions listed in
`src/core/app-role-grants.ts`; `scripts/create-app-role.ts` creates it, grants exactly that, and prints the URL.

## Rollout (per environment)

Do each step on development first. Every script that writes needs `--confirm-host <host>`.

1. Take a snapshot or backup.
2. **Before merging**, run `scripts/assign-standalone-agency.ts` (dry run, then `--apply`). The deploy applies the
   migrations on merge, and they refuse institutions that have no agency.
3. Deploy. The deployment needs `SCHEMA_DATABASE_URL` (the owner) set before this deploy: the schema's `directUrl`
   reads it.
4. Run `scripts/backfill-agency-id.ts` (dry run, then `--apply`). It fills `agencyId` on rows that predate the column
   and refuses to run as a role the policies bind.
5. Give new agency admins a grant with `scripts/grant-agency.ts`.
6. Create the restricted role, set `DATABASE_URL` to it and `REQUIRE_TENANT_RLS=on`. `SCHEMA_DATABASE_URL` stays the
   owner, so the start command does not change.
7. Verify with `scripts/tenant-e2e.ts` on development (plain against restricted must match, and cross-agency requests
   must be refused).
8. Later migration: validate the institution constraint, and require `agencyId` on the tenant tables.

**Rollback.** Code can be rolled back, but migrations stay applied and the triggers and policies do not bind the
owner. To stop enforcement, point `DATABASE_URL` at the owner and redeploy. To remove the schema changes, run the
files in `prisma/rollbacks/` in the order their headers give, each as one transaction; the second one drops the staff
grants, so export them first.

## Cost

With the restricted role, a query that can reach a tenant table runs in its own short transaction: begin, set the
context, query, commit, which is four round trips instead of one. A query that provably cannot reach one runs as
before (`src/core/tenant-tables.ts` lists the tables that have a policy, and a spec fails if it disagrees with the
database). The policy overhead inside the database is small, because the context functions are evaluated once per
statement; the cost that shows is the extra round trips, so it is large over a slow connection and small on the
platform's own network. `scripts/tenant-latency.ts` (read only) measures both parts from wherever it runs.

## Adding a table that holds learner data

1. Add `agencyId String?` and `@@index([agencyId])`.
2. In a hand-written migration, add a trigger that sets it and a `tenant_*` policy set; add the table to
   `src/core/tenant-tables.ts` and `scripts/backfill-agency-id.ts`, and cases to `src/core/tenant-agency.spec.ts` and
   `tenant-rls.spec.ts`.

## Tests

- `src/core/tenant-agency.spec.ts` and `tenant-rls.spec.ts` run the real migrations on Postgres (PGlite), as the
  restricted role with exactly its real privileges: triggers, isolation, fail-closed behavior, the writes people may
  and may not make, courses and offers, and writes to rows that predate the columns. They run with `npm test`, which
  sets the Node flag they need; in CI a run without it fails instead of skipping.
- `scripts/tenant-e2e.ts` boots the real API against a development database with only sign-in replaced, sweeps the
  routes as several kinds of user with and without row-level security, and compares full responses. It writes test
  users, so it must only ever run against the development database.

## Not covered yet

Some tables that hold personal data are still protected by the application alone; they are tracked in issue #84, and
each needs a stated rule before a policy can be written. Institution names and branding are readable by everyone on
purpose, because they load before anyone signs in.

## Not in scope

Isolation between schools inside the standalone agency (the application keeps that), instructor-level (single
cohort) access, which is a role inside an agency, and a provider running its courses in another agency, which needs
that agency to accept the course (#87). Until then a cohort is created in the agency its workspace reports to.

## Roles inside an agency

- A role is a membership: a person, the institution it applies to and, for an instructor, the cohort they teach.
  What each role may do is one table, `apps/api/src/learn/access/permissions.ts`.
- An agency admin covers whatever reports to their agency (its providers and organizations). Only the platform
  administrator stays on the person's account instead of a membership.
- The database treats any membership that carries a role as access to its whole agency. It does not know about
  cohorts, so an instructor's narrowing to one cohort is done by the application, not by row-level security.
- To give a role: the People page in the workspace, or `apps/api/scripts/grant-agency.ts` (`--role`, and `--cohort` for
  an instructor).
