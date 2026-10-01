# Security, privacy and operations runbook

Tracks [#43](https://github.com/ludakhris/interview-differently/issues/43). This is the operational companion to the code: what the controls are, what to configure, and how to re-verify.

> **Not legal advice.** `/terms` and `/privacy` are drafts written to match what the code actually does. They show a "Draft — pending legal review" banner until `LEGAL_REVIEW_PENDING` is set to `false` in `apps/web/src/legal/legalConfig.ts`. Have counsel review (arbitration, data ownership, NYC Local Law 144 / EU AI Act positioning) before launch.

## Configuration checklist (production)

| Where   | Variable                                              | Purpose                                                                                                                                                                      |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `CLERK_WEBHOOK_SIGNING_SECRET`                        | Verifies Clerk → `POST /api/webhooks/clerk`. In Clerk: add endpoint `<API_URL>/api/webhooks/clerk`, subscribe to `user.deleted`. Without it the endpoint rejects everything. |
| API     | `RECORDING_RETENTION_DAYS`                            | Recording auto-delete window (default 90). Must match `LEGAL.recordingRetentionDays` on the web.                                                                             |
| API     | `SENTRY_DSN` (+ optional `SENTRY_TRACES_SAMPLE_RATE`) | Error monitoring; no-op when unset. Bodies/headers are stripped.                                                                                                             |
| API     | `NODE_ENV=production`                                 | Disables the dev-only local-disk media route.                                                                                                                                |
| API     | `FRONTEND_URL`                                        | CORS allow-origin.                                                                                                                                                           |
| Web     | `apps/web/src/legal/legalConfig.ts`                   | Company name, address, contact email, governing law.                                                                                                                         |
| Vendors | Spend caps / alerts                                   | Set hard monthly caps at Anthropic, OpenAI, D-ID. App-level quotas below limit abuse but are not a billing backstop.                                                         |

## Consent

- Terms + Privacy: `ConsentGate` (wraps `ProtectedRoute`) blocks the app until the current version is accepted; a sign-up notice links both pages.
- Recording: `ResponseRecorder` refuses to record until `recording` consent is stored, and the API rejects recorded uploads without it (403).
- Versions live in `apps/api/src/consent/consent.versions.ts` (+ `legalConfig.versions` on the web). **Bump the version when a document changes materially** — every user is re-prompted.
- Records are in `ConsentRecord` (user, kind, version, timestamp).

## Data lifecycle

- `GET /api/me/export` — JSON of everything held about the caller (recordings as 15-minute signed links).
- `DELETE /api/me/account` (body `{"confirm":"DELETE"}`) — deletes recordings from R2 first (aborts on failure so it can be retried), then every user row, then the Clerk account. Refuses for `admin` role.
- Clerk `user.deleted` webhook runs the same erasure.
- Retention: recordings after `RECORDING_RETENTION_DAYS` (sweep every 6h); SQL query log and page views 90 days.
- **When adding a table with a `userId`, add it to `AccountService.eraseUserData` and `exportUserData`** (`apps/api/src/account/account.service.ts`).

## Abuse and cost controls

- Global per-IP throttle (600/min; classrooms share NAT) via `@nestjs/throttler`; tighter `@Throttle` on public routes (scenario requests 5/h, invites 30–60/min, scenario reads 120/min, export/delete 5/h).
- Per-user quotas (`common/user-quota.ts`) on D-ID streams/speech, response uploads (Whisper), AI feedback and summaries (Claude), join-key attempts. **In-memory: per API instance.** If the API scales past one replica, move to Redis-backed throttler storage.
- `trust proxy` is set to 1 hop (Railway) so limits key on the real client IP.
- D-ID: `sourceUrl` must be a curated presenter image; streams are bound to the creating user; upstream error bodies are never echoed.
- Uploads: allow-listed audio/video MIME types, 25 MB cap.

## Security audit — findings and status

Performed 2026-09-30 by reading every controller/guard/service, scanning git history, and `npm audit`.

| #   | Finding                                                                                                                                      | Status                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SQL grading ran student/admin SQL (PGlite/WASM) on the API's event loop: one `WITH RECURSIVE` query could freeze the whole API               | **Fixed** — runs in a worker thread with a 10 s per-query timeout; hung queries are terminated and graded as failed                                                               |
| 2   | D-ID stream endpoints: any signed-in user could point D-ID at an arbitrary image URL, send arbitrary text/voice, and control anyone's stream | **Fixed**                                                                                                                                                                         |
| 3   | No security headers on API or web                                                                                                            | **Fixed** — `helmet` on API; HSTS, nosniff, frame denial, Referrer/Permissions-Policy on web. CSP ships **Report-Only** (see below)                                               |
| 4   | `GET /scenario-media/:id` listed media for private/draft scenarios to anonymous callers                                                      | **Fixed** — same visibility rules as scenarios                                                                                                                                    |
| 5   | Local-disk storage path-traversal guard was a prefix check; `delete` had none; `/files/*` served in production                               | **Fixed**                                                                                                                                                                         |
| 6   | No rate limits on paid endpoints, join keys (admin-chosen, guessable), invite codes                                                          | **Fixed** (quotas above)                                                                                                                                                          |
| 7   | Request bodies unvalidated on paid/state-changing endpoints                                                                                  | **Fixed** for DID, immersive, results, memberships, consent (global `ValidationPipe` + DTOs). Other admin endpoints still use ad-hoc checks                                       |
| 8   | Global 5 MB JSON limit on every route                                                                                                        | **Fixed** — 1 MB default, 5 MB only for dataset/assessment admin routes                                                                                                           |
| 9   | Every admin check made a live Clerk API call (latency and Clerk rate-limit cliff under load)                                                 | **Fixed** — 60 s role cache, invalidated on role change                                                                                                                           |
| 10  | `npm audit`: 20 advisories (6 high)                                                                                                          | **Mostly fixed** — 11 remain (2 high: `multer`/`@nestjs/platform-express`), which need a NestJS 10→11 major upgrade. Follow-up issue. CI now blocks on critical and warns on high |
| 11  | Secret scan of git history (pattern-based)                                                                                                   | Clean. CI now runs gitleaks on full history                                                                                                                                       |
| 12  | Clerk `getUser` failure in `getRole` returns `null` (fail-closed)                                                                            | OK, no change                                                                                                                                                                     |
| —   | Known accepted risk: `results` scores are computed client-side and posted, so a user can forge their own practice scores                     | Documented; matters only if institutions treat practice scores as evidence                                                                                                        |

### Promoting the CSP

`vercel.json` ships `Content-Security-Policy-Report-Only`. Browse the deployed preview with DevTools open (sign-in, a simulation, the SQL sandbox, an immersive session with avatar + recording); fix any violations by extending the allow-list; then rename the header to `Content-Security-Policy`. Doing this blind risks breaking Clerk or WebRTC, which is why it isn't enforced yet.

## Load test

`apps/api/scripts/load-test.ts` drives the real `ToolsService`, `UsageEventsService` and `UsageService` against Postgres — one hot path, not the whole app. See results below. **Never run against production.**

```bash
export DATABASE_URL='postgresql://…/loadtest?connection_limit=10'
npx prisma migrate deploy
npm run load-test -w @id/api -- seed --users 5000 --logs 2000000 --events 1000000
npm run load-test -w @id/api -- run  --seconds 30 --writers 48 --readers 4 --heavy 1
npm run load-test -w @id/api -- clean
```

### Results (2026-09-30)

Local Postgres 16 and the API process sharing a 4-core / 16 GB machine, Prisma pool of 10, seeded with **5,000 users, 2M `SqlQueryLog` rows, 1M `UsageEvent` rows** (≈90 days of a very busy platform). Absolute numbers on Railway will differ; the _shape_ — what saturates first — is what matters.

**The hot object.** Every signed-in action writes `UsageEvent`; every sandbox query writes `SqlQueryLog`; both grow without bound between purges, and the admin dashboards read them. Those two tables plus the dashboards that read them are the load-bearing path.

**What broke first: the admin usage dashboard, not the write path.**

|                                          | Before                                                                | After                                     |
| ---------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| Usage report, 7d / 30d / 90d, at 3M rows | 59 s / 52 s / 65 s                                                    | 7 s / 16 s / 26 s                         |
| Peak memory during report                | 4.8 GB (would OOM a small container)                                  | worker thread, heap capped at 2 GB        |
| Write p95 while the dashboard loads      | 11 s in an intermediate build (event loop blocked by the aggregation) | 215 ms (`sql-log`) / 119 ms (`page-view`) |
| Cohort sandbox activity (125 students)   | 1.2 s p50                                                             | 0.6 s p50 isolated, 1.1 s under load      |

Causes and fixes: the report read _every_ log row into memory and accumulated per-user arrays quadratically. It now loads only the range plus the previous period, and each user's first and last row (output verified identical to the old implementation at 7d/30d/90d with a pinned clock). It accumulates in O(n), runs on a worker thread with its own DB pool and heap cap, and is cached and single-flight for 30 s.

**Write ceiling** (pure writes, pool = 10): plateaus at **≈1,300 sandbox-query writes/s plus ≈1,300 page-view writes/s**. Latency stays flat (~10 ms) up to about the pool size, then rises linearly with concurrency (p95 ≈ 43 ms at 64 concurrent, 137 ms at 200) — that is queueing on the pool, not database saturation. First lever: raise `connection_limit` (and Postgres `max_connections`); the next is batching `UsageEvent` inserts.

**Still the ceiling, in order:**

1. **Usage report cost is linear in rows in range.** Now seconds rather than a minute at 3M rows, and isolated from request handling, but at 90d/all-time on a much bigger platform it needs SQL-side rollups (a daily aggregate table) instead of in-process aggregation. Follow-up.
2. `sandboxActivity` fetches up to 5,000 newest rows for the cohort in one query; fine at classroom scale, watch it for cohorts of several hundred active students.
3. In-memory per-instance quotas/throttles (see above) — a second API replica doubles every limit.
4. Indexes added from this exercise: `SqlQueryLog(userId, createdAt)` (deletion, export and dashboard lookups previously scanned the table) and `ImmersiveResponse(createdAt)` (retention sweep).
