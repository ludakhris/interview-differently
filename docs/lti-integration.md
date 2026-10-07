# LTI 1.3 integration: LearnDifferently (platform) and tools (#63)

Reference for how LearnDifferently launches a tool and gets a score back using LTI 1.3 message shapes,
with the two sides sharing only `apps/api/src/lti/lti-spec.ts` (standing in for an LTI library). Platform code
lives in `apps/api/src/lti/platform/`, tool code in `apps/api/src/lti/tool/`. Neither may import the
other (enforced by `apps/api/src/lti/lti-boundary.spec.ts`). They talk only over HTTP URLs.

Base URL: `LTI_API_BASE` (default `http://localhost:3000/api`). Platform issuer: `LTI_PLATFORM_ISSUER`
(default: the origin of `LTI_API_BASE`). The platform's own registration is static config. The tools it can launch are
in code (the two built-ins) plus the `LtiTool` table (see "Registration"); the other database state is the
`LtiSingleUse` table (see "Shared store").

## Environment variables

| Variable                            | Production         | Purpose                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LTI_PLATFORM_PRIVATE_KEY`          | required           | Platform RS256 signing key (PEM; `\n` escapes allowed)                                                                                                                                                                                                                                                                                            |
| `LTI_TOOL_PRIVATE_KEY`              | required           | Tool RS256 signing key (PEM)                                                                                                                                                                                                                                                                                                                      |
| `LTI_TOOL_SECRET`                   | required           | Tool's HMAC secret for submission tokens                                                                                                                                                                                                                                                                                                          |
| `LTI_HINT_SECRET`                   | required           | Platform's HMAC secret for `lti_message_hint`                                                                                                                                                                                                                                                                                                     |
| `LTI_API_BASE`                      | required           | Public base URL of this API (default `http://localhost:3000/api`; drives every issuer, auth, token, JWKS and launch URL, so a production boot without it would publish localhost URLs)                                                                                                                                                            |
| `LTI_LEARN_URL`                     | required           | Public URL of the LearnDifferently web app (default `http://localhost:5174`, trailing slash trimmed); the platform sends `${origin}/lms/learning/${cohortId}/${itemId}` as the launch `return_url`, where `origin` is the host the learner launched from when it is an accepted LearnDifferently origin (see "Return host"), else `LTI_LEARN_URL` |
| `LTI_ID_WEB_URL`                    | required           | Public URL of the Interview Differently web app (default `http://localhost:5173`, trailing slash trimmed); text scenarios are played at `${LTI_ID_WEB_URL}/lti/play/${ref}`                                                                                                                                                                       |
| `LTI_RETURN_URL`                    | optional           | Tool's fallback return link (default `http://localhost:5174`) when a launch carries no usable `return_url`                                                                                                                                                                                                                                        |
| `LTI_PLATFORM_PREVIOUS_PRIVATE_KEY` | optional           | Key being rotated out; published in the platform JWKS, never used to sign                                                                                                                                                                                                                                                                         |
| `LTI_TOOL_PREVIOUS_PRIVATE_KEY`     | optional           | Same, for the tool                                                                                                                                                                                                                                                                                                                                |
| `TRUST_PROXY`                       | set behind a proxy | Express `trust proxy` (a hop count such as `1`, or `true`), so `req.ip`, which the rate limits use, is the client and not the proxy                                                                                                                                                                                                               |

With `NODE_ENV=production` the services refuse to boot (the constructors throw, naming every missing
variable) unless all seven required variables (every row marked required) are set. Outside production a missing key or secret is
generated at boot, which is only safe for one instance and loses state on restart.

## Shared store

Single-use state and rate-limit counters live in one `LtiStore` (`lti-store.ts`), backed in production by the
Postgres table `LtiSingleUse` (`lti-store.prisma.ts`; unique on `scope` + `key`, `expiresAt` indexed). Each
operation is one SQL statement, so it is atomic: `put`, `peek`, `take` (DELETE ... RETURNING), `claim`
(INSERT ... ON CONFLICT, won only if no live row), `release`, `count` (upsert that increments, restarting
after the window). Expired rows are ignored on read and deleted in batches of 500 at start and on about 2% of
writes. `MemoryLtiStore` is for unit tests and a single local process. Uses:

| Scope            | Key                           | What                                                                                                                                                |
| ---------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lti-hint`       | hint jti                      | `lti_message_hint` is single use (claimed after the item checks pass)                                                                               |
| `lti-assertion`  | `clientId:jti`                | client-assertion `jti` replay (claimed after the signature verifies)                                                                                |
| `lti-login`      | state                         | tool login `{nonce}`, 10 minutes, taken at launch                                                                                                   |
| `lti-submission` | submission jti                | in-flight lock (5 minutes), replaced by a "consumed" entry for the token's remaining life after a successful score post, released if the post fails |
| `lti-delivery`   | `assessmentId:cohortId:label` | short lock around find-or-create of an assessment delivery                                                                                          |
| `lti-complete`   | session jti                   | same lock/consumed pattern for `POST /complete`, one score post per session                                                                         |
| `rl:*`           | IP, client id or learner      | rate-limit counters                                                                                                                                 |

**Multiple instances are safe** provided they share the database and the required production variables
(every instance must use the same keys and secrets, so any instance can finish what another started).
A restart loses nothing. Operational notes: a crash while a submission is being scored leaves its lock until
it expires (5 minutes); apply the `20261006120000_lti_single_use` migration before deploying.

## Key rotation

1. Set `LTI_PLATFORM_PREVIOUS_PRIVATE_KEY` (or `LTI_TOOL_PREVIOUS_PRIVATE_KEY`) to the current key and
   `LTI_PLATFORM_PRIVATE_KEY` (or `LTI_TOOL_PRIVATE_KEY`) to the new key. Deploy all instances.
2. The JWKS now lists the new key first and the old one second; every new token is signed with the new `kid`,
   while tokens already issued with the old key still verify (the platform also accepts its own previous key on
   score posts).
3. After the longest token lifetime has passed (the platform access token, 1 hour), remove the PREVIOUS variable.
   Counterparties cache a JWKS for 5 minutes and refetch on an unknown `kid`, so no coordination is needed.

## Rate limits

Counted in the shared store, fixed one-minute window from the first hit; over the limit answers 429.
| Endpoint | Limit | Key | 429 body |
| --- | --- | --- | --- |
| tool `GET|POST /login` | 30 / minute | client IP (`req.ip`) | HTML error page |
| tool `POST /submit` | 10 / minute | learner `sub` from the verified submission token | HTML error page |
| tool `POST /complete` | 10 / minute | learner `sub` from the LTI session | JSON |
| platform `GET|POST /auth` | 30 / minute | client IP (`req.ip`) | JSON |
| platform `POST /token` | 60 / minute | client id, counted only after the assertion signature verifies | JSON `{error:'rate_limited'}` |

## Registration

What a course item may launch lives in two tables, managed by a system administrator at `/lms/admin/tools`
(part of the Admin toolbox; API `/api/learn/tools`, `/api/learn/tools/connections`, `/api/learn/tools/history`):

- A **connection** (`LtiConnection`) is one registration with a tool vendor: the client id the platform knows
  it by (unique), the deployment id, and the login, launch and key-set URLs. It holds no secret; the vendor's
  keys are fetched from the key-set URL.
- A **tool** (`LtiTool`) is something a course item opens: its name, kind (practice lab or graded assessment),
  whether it can be retried, whether it can stand in for the pre/post assessment, whether it is on, who may use
  it, and the connection it launches through. Several tools can use one connection: Interview Differently has a
  practice-lab tool and a graded-assessment tool over one server, one client id and one set of keys. Changing a
  connection changes where all its tools launch. A connection with tools cannot be removed.

Rules:

- **Setting up an environment:** the registry tables start empty, and nothing can be launched until they hold a
  tool. Run `npm run seed:lti-tools` (from `apps/api`) once per database, after its migrations have applied: it
  adds the Interview Differently connection and its two tools below, from `LTI_API_BASE` and the optional
  `LTI_TOOL_*` variables of the environment it runs against (so each environment points at its own host). It only
  adds what is missing, never changes a row an admin has edited, matches an existing connection by id or client id,
  and logs what it added as "System (seed script)". `--dry-run` shows what it would add. It refuses a database that
  is not local or the Railway dev database unless you pass `--allow-host <host>`; do that for production only with
  the owner's OK, and with production's `LTI_API_BASE` set. The running API never reads those variables or any
  defaults in code: the tables are the only source.
- Only the LearnDifferently Clerk role `system-admin` can list, add, change or remove anything here (it is a
  superset of `agency-admin`). A tool receives each launching learner's name and ID, so registering one is a
  security decision. Authors see only the tools their course's provider may use, with nothing about who else may
  use them and no connection settings (`GET /api/learn/courses/:id/tools`).
- **Reference wording:** each tool can say what its items' reference is called (for example "Assessment slug") and how an author finds it. The course editor shows that label and help text for the selected tool, and a generic "Reference" with generic help where a tool has none. Set on the tool form; visible to authors and recorded in the history.
- **History:** every change writes a row to `LtiRegistryChange` in the same transaction: who (their name or
  email when they did it), when, what, and each changed field's old and new value. Rows are kept after the tool
  or connection is removed. The admin page shows them, filterable to one tool or connection. Saving without
  changing anything writes nothing.
- URLs must be https and point at a public address (IPv4 and IPv6 private, loopback, link-local and mapped
  forms are refused); `http://localhost` is allowed only outside production. The platform never follows a
  redirect when it fetches a tool's key set.
- **Access:** a tool's `workspaceIds` limits it to chosen agencies and providers (empty: every workspace). A
  course's provider is allowed when it, or the agency it reports to, is listed. This covers every program that
  runs the provider's courses, whichever organization runs the cohort. Checked when an author saves a tool item,
  when a learner opens the item, and when the tool is launched.
- A tool item whose tool is switched off or not available to the course's provider cannot be launched. It stays
  required for completion (a brief switch-off must never complete a course early), so an author turns the tool back
  on or marks the item optional. An author can still edit such an item (rename, mark optional) while its tool is
  unchanged. A switched-off tool can still get a token and post a score for work a learner already did.
- The registry is cached in memory and refreshed every 15 seconds, so a change reaches another API instance within
  that time. The cache starts empty and is filled by the first successful read (three tries at start-up, then every
  15 seconds), so no tool can be launched before then: a restriction is never lost to a failed read.

### The connection and two tools the seed script adds

- Two tools, `id-interview` (name "Interview Differently") and `id-assessment` ("Interview Differently assessment"), share
  one client id `ld-platform`, deployment id `1` and the same login/launch/jwks URLs. The id_token's custom claim says which
  was launched: `{ ref, tool }` (plus `attempt` and `timeLimitMinutes?` for `id-assessment`, see "Attempts and time limits"), where `tool` is the LearnDifferently tool id and, for `id-assessment`, `ref` is the Assessment slug.
- Platform-only properties per tool (never on the wire): `kind` (`interview` | `assessment`), `retries` (registry default only; the learner view derives `retries` per item, see "Attempts and time limits") and `labelable` (assessment true). A `tool` course item may carry the `pre`/`post`
  label only when its tool is labelable; such an item stands in for LearnDifferently's own assessment (required for course
  completion, its best score feeds pre/post/gain, not counted as an interview). An unlabelled tool item is required for completion unless its config sets `optional: true` (not allowed with `countsAsInterview` or a label), and its score shows beside it in the course outline. A tool item may set `passScore` (1-100, never on a `pre` item): a score below it leaves the item to do and the learner retries. A course that has anything counting as an interview does not complete until the best such score reaches the course's readiness goal; staff can recompute one learner with `POST /api/learn/enrollments/:id/recompute`. It feeds interview readiness (`interviewBest`, `interviewAttempts`, "Ready to interview") only when its config has `countsAsInterview: true` (interview-kind tools only; dropped for assessments and labelled items). Native `interview` items always feed readiness.
- The seeded values (`ToolRegistration`): loginUrl `${BASE}/lti/tool/login`, launchUrl `${BASE}/lti/tool/launch`,
  jwksUrl `${BASE}/lti/tool/jwks`.
- Tool side config (`PlatformRegistration`): issuer, authUrl `${BASE}/lti/platform/auth`,
  tokenUrl `${BASE}/lti/platform/token`, jwksUrl `${BASE}/lti/platform/jwks`.
- The tool side's own config (below) is static and overridable by env so it can point at another host; the platform's tool list comes from the registry.

## Platform endpoints (`/api/lti/platform`)

- `GET /jwks` public keys.
- `GET|POST /auth` OIDC authentication request from the tool. Query/form: `scope=openid`, `response_type=id_token`,
  `client_id`, `redirect_uri` (must equal the registered launchUrl), `login_hint`, `lti_message_hint`, `state`, `nonce`,
  `response_mode=form_post`, `prompt=none`. Validates `client_id`, `redirect_uri`, and the `lti_message_hint`
  (a 60 second, single-use, HMAC-signed token the platform minted at launch time that carries
  `{userId, cohortId, itemId, jti, exp}`; the HMAC secret is `LTI_HINT_SECRET`, required in production, else derived from the platform private key). Re-checks that the learner is still enrolled (not withdrawn) and the cohort still open, so a stale hint yields no id_token.
  Replies with an auto-submitting HTML form POSTing `id_token` and `state` to `redirect_uri`.
  The `id_token` is RS256, iss=platform issuer, aud=client id, sub=learner user id, `nonce` echoed, exp 5 minutes, with claims:
  message_type `LtiResourceLinkRequest`, version `1.3.0`, deployment_id, target_link_uri, resource_link `{id: itemId}`,
  context `{id: cohortId}`, roles `[LEARNER_ROLE]`, custom `{ref, tool}` (the tool-specific reference stored on the item, and the LearnDifferently tool id; for an assessment tool also `attempt` and `timeLimitMinutes?`),
  the `launch_presentation` claim `{document_target:'window', return_url}` (the LD item page, `${returnOrigin ?? LTI_LEARN_URL}/lms/learning/${cohortId}/${itemId}`; see "Return host"), and the AGS endpoint claim `{scope:[AGS_SCOPE_SCORE], lineitem: ${BASE}/lti/platform/ags/${cohortId}/lineitems/${itemId}}`, plus, when the cohort's tenant has one, the brand claim (see "Brand tokens").
- `POST /token` OAuth2 client_credentials with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`,
  `client_assertion` (RS256 JWT signed by the tool: iss=sub=clientId, aud=tokenUrl, jti unique, exp no more than 10 minutes away), `scope`. Verifies against the
  tool's jwksUrl, rejects replayed `jti`, answers failures with a generic `invalid_client`, returns `{access_token, token_type:'Bearer', expires_in:3600, scope}` where access_token is an
  RS256 JWT signed by the platform (aud=clientId, scope claim).
- `POST /ags/:cohortId/lineitems/:itemId/scores` Bearer access token with the score scope. Body is an LTI score
  (`userId`, `scoreGiven`, `scoreMaximum`, `activityProgress`, `gradingProgress`, `timestamp`, plus optional `DIMENSIONS_FIELD`).
  Content-Type must be `SCORE_CONTENT_TYPE` (nothing else is accepted; body at most 100 KB). `timestamp` is required: an ISO 8601
  date-time no more than 5 minutes in the future. Only accepts a score for a learner enrolled in that cohort and an item of type `tool` whose
  `toolId` belongs to the token's client (compared by client id, since both tools share one). Records it (best score kept) via `LearnerService.recordToolResult`.
- Launch start (called by the learner API, not public): `LtiPlatformService.startLaunch(userId, cohortId, itemId, returnOrigin?)` returns
  `{ action: <tool loginUrl>, fields: { iss, login_hint, target_link_uri, lti_message_hint, client_id, lti_deployment_id } }`.

## Brand tokens (white-labelling, look only)

The platform tells the tool which tenant brand to wear. The id_token carries the custom claim
`BRAND_CLAIM` = `https://learndifferently.tech/lti/brand` (lti-spec.ts); it is omitted when the tenant has no valid brand.
The platform takes the `brand` JSON of the cohort's institution, else of the nearest ancestor via `parentId` (at most 5 hops
up) whose brand is valid. Both sides validate with the one function `sanitizeBrand` in `lti-brand.ts` (imports nothing from
the project), which never throws and drops what it cannot trust. The tool re-validates the claim on launch (never trusts it).

Schema v1, a JSON object, every field optional except `name`; unknown fields are dropped:

| Field                                                                      | Rule                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                     | string, trimmed, 1-60 chars, no control characters or `<` `>`. Missing or invalid: the whole brand is absent                        |
| `logoUrl`                                                                  | `https` URL, or `http` only for host `localhost` / `127.0.0.1`; at most 300 chars; no credentials; no whitespace or `" ' ( ) < > \` |
| `scheme`                                                                   | `"light"` or `"dark"`                                                                                                               |
| `primary`, `accent`, `surface`, `surfaceAlt`, `text`, `textSoft`, `border` | exactly `#rrggbb` (`/^#[0-9a-fA-F]{6}$/`), lowercased                                                                               |

An invalid optional field is dropped on its own; the rest of the brand survives.

The tool carries the sanitized brand inside the signed LTI session (optional `brand` claim; a session without it still
verifies, one whose brand is not already in sanitized form is refused with 401). `GET /api/lti/tool/session` (LTI session
required; allowlisted for GET only) answers `{ brand: <brand or null>, ref }` so the web app can theme the player.
Typed placeholder pages (immersive scenarios without an interviewer) ignore the brand.

## Key fetching

`jwksKeyResolver` (lti-spec) caches a JWKS for 5 minutes, remembers unknown `kid`s for 60 seconds (no refetch in that window), shares one
in-flight fetch between concurrent callers, times fetches out after 3 seconds and refuses bodies over 100 KB. Failures surface only as
`Could not load signing keys` (502); the URL is never put in an error.

## Tool endpoints (`/api/lti/tool`)

- `GET /jwks` public keys.
- `GET|POST /login` third-party initiated login: takes `iss, login_hint, target_link_uri, lti_message_hint, client_id`. Looks up the
  platform registration by `iss` + `client_id`, requires non-empty `login_hint` and `lti_message_hint`, creates `state` and `nonce` (stored in the shared store, single use, 10 min), sets the cookie `lti_state=<state>; HttpOnly; Secure; SameSite=None; Path=/api/lti/tool; Max-Age=600`
  (the binding between the login and the browser that started it), redirects (302) to the platform `authUrl` with the OIDC params.
  Non-string parameters are treated as missing (400 page).
- `POST /launch` receives `id_token` and `state`. Requires the request cookie `lti_state` to equal the posted `state` (otherwise refused, so a valid id_token and state cannot be
  replayed from another browser), checks state is known and unused, verifies the id_token (signature via platform JWKS,
  iss, aud=clientId, exp, nonce), checks message_type, version and deployment_id, requires the AGS lineitem URL to be on the platform issuer's origin, clears the
  `lti_state` cookie, then renders an HTML page for the interview named by
  the custom claim `ref` (questions from the tool's own store, one textarea each). The page carries a signed, short-lived
  `submission` token (tool-signed HMAC, 30 minutes) holding what the tool needs to post back: sub, jti, lineitem URL, ref, and the launch's `launch_presentation.return_url` (kept only if it is an http(s) URL on the platform's issuer origin, the `LTI_LEARN_URL` origin or a tenant subdomain of its host, see "Return host"; anything else, such as `javascript:` or another site, is dropped).
- Text scenarios (scenario data `mode` absent or `text`) are not played on a tool page. After the same verification, `POST /launch`
  answers `303` to `${LTI_ID_WEB_URL}/lti/play/${encodeURIComponent(ref)}#session=<token>`; the token is in the fragment so it is
  never sent to a server or logged. Immersive scenarios (`mode === 'immersive'`) that have an `interviewer` persona (`presenterId` and `voiceId`) are redirected the same way and played by voice in the web app; immersive scenarios without one keep the typed page below.
- The session token is `base64url(JSON).base64url(HMAC-SHA256)` (secret `LTI_TOOL_SECRET`, MAC over `lti-session.` + body, so it
  cannot be used as a submission token), claims `{sub, ref, lineitem, returnUrl?, datasets?, brand?, deliveryId?, jti, iat, exp}`, valid 2 hours. The web app sends it as
  `Authorization: Bearer lti.<token>`. It is accepted only by `lti-session.guard.ts` and only for: `GET /api/scenarios/<ref>`
  (full scenario, any owner), `POST /api/results/attempts` and `POST /api/results` with `scenarioId === ref` (the user is always
  the token `sub`), `GET /api/results/:id` for the learner's own result of `ref`, `GET /api/me/datasets/<slug>` for a SQL dataset slug listed in the token's `datasets` claim (the slugs of the scenario's `sql` nodes, read at launch; the dataset service re-checks the slug against the launched scenario), `GET /api/lti/tool/session`, and `POST /api/lti/tool/complete`. Everything
  else answers 403 (401 for a bad or expired token). The allowlist is by method and path in the guard.
  For a voice interview it also allows `POST /api/immersive-sessions` (body `scenarioId === ref`, the user is the token `sub`), and, only for a session owned by `sub` whose `scenarioId === ref` (checked in the controller, no admin override), `POST /api/immersive-sessions/:id/responses`, `GET /api/immersive-sessions/:id`, `GET .../responses/:responseId` and `.../media-url`. `GET /api/scenario-media/<ref>` is public and needs no token.
- `POST /complete` also takes `{sessionId}` for a voice interview: the immersive session must be owned by `sub`, for `ref`, `active`, and created no earlier than the LTI session `iat` minus 60 s; every question node of the scenario needs a non-empty transcript (422 while transcription is pending, 400 if a question is unanswered). The tool scores the transcripts itself (questions are the scenario's own prompts for each response's `nodeId`; the latest response per node counts), posts the mean to the lineitem with the per-dimension means, marks the session `completed`, and answers `{score, returnUrl}`. Locks: `lti-complete` per LTI session and `lti-result` keyed `immersive:<sessionId>`; both are released if scoring (502) or the post (502) fails.
- Every call the tool makes to the platform's token and scores endpoints times out after 10 s and is treated as a failed post (generic 502), which releases the in-flight and result claims so the learner can retry at once.
- `POST /complete` (LTI session required) body `{resultId}`: the result must exist, belong to `sub` and be for `ref`. The score is
  `overallScore` (0-100) of the stored result, `scoreMaximum` 100, with its dimension scores under `DIMENSIONS_FIELD`; posted to the
  lineitem like `/submit`. Single use per session `jti` (409 on reuse, released if the post fails), answers JSON
  `{score, returnUrl}`, or 502 with a generic message if the platform rejects it.
- Assessments (`custom.tool === 'id-assessment'`; a missing `tool` means `id-interview`, any other value is refused with a 400 page). `ref` is the
  `Assessment.slug` (fallback: its `id`); unknown answers a 404 page "Assessment not found". The tool finds or creates the
  `AssessmentDelivery` for (assessment, cohort = the launch's context id if a `Cohort` row with that id exists, else null, label `lti:<resource link id>`
  for attempt 1, `lti:<resource link id>#<n>` for attempt n > 1; see "Retakes and time limits" below), with no open/close dates. There is no unique index on that triple, so creation runs under a short `lti-delivery` store lock
  (10 s, keyed on the exact label) with a re-find inside it; a launch that loses the lock polls for the winner's row (up to about 2 s, then a 503 page). The launch answers
  `303` to `${LTI_ID_WEB_URL}/lti/assessment/<deliveryId>#session=<token>`. The session has the extra claim `deliveryId` (and `datasets` = the bank's dataset slug, if any); a session
  with `deliveryId` can reach only the assessment routes below, `GET /me/datasets/<slug>`, `GET /lti/tool/session` (which then also answers `deliveryId`) and `POST /lti/tool/complete`; it is refused on every scenario route.
  A session without `deliveryId` can reach no assessment route. Allowed assessment routes (through `AuthenticatedOrLtiGuard`): `POST /me/deliveries/<deliveryId>/attempts`
  (the id must equal the session's), `GET /me/attempts/:id`, `PUT /me/attempts/:id/answers`, `POST /me/attempts/:id/submit`, `GET /me/attempts/:id/result`.
  The attempt must belong to `sub` and to the session's delivery (404 otherwise). For an LTI caller `startAttemptForLti` skips the cohort membership / tool-enabled
  check (LearnDifferently decides who may launch), keeps the open check, draws the paper once and resumes an existing attempt; answers are validated (object of at most 200 string values, ids at most 64 and values at most 20,000 characters).
  The Clerk path is unchanged. One attempt exists per (delivery, learner), so one attempt number is one delivery (see below).
- Retakes and time limits (assessments only). The custom claim is `{ref, tool, attempt?, timeLimitMinutes?}`, both extras validated strictly
  (any other value answers a 400 page and creates nothing):
  - `attempt`: integer 1 to 100, the 1-based attempt number for this launch; missing means 1.
  - `timeLimitMinutes`: integer 5 to 240, optional. It is written to the delivery **only when the delivery is created**; an existing delivery keeps its limit. An assessment session lasts `max(2 hours, the delivery's stored limit + 15 minutes)`, so a long limit cannot outlive the session that posts its score.
  - Each attempt number has its own delivery (label above), so each draws a fresh paper through `startAttemptForLti`, and the session's `deliveryId`
    is for that attempt only (the guard allowlist is unchanged). Relaunching an attempt number whose delivery already holds the learner's attempt
    resumes it, submitted or not. Deliveries made before retakes existed carry `lti:<link>` and are attempt 1.
  - Skip-ahead guard: for attempt n > 1 the tool counts the learner's submitted attempts on deliveries labelled `lti:<link>` or `lti:<link>#<k>` for the
    same assessment and cohort, and refuses (400 page) unless `n <= submitted + 1`. LD enforces the maximum number of attempts; this only stops a learner
    from jumping ahead to collect fresh papers.
  - The deadline is `startedAt + timeLimitMinutes` (`deadlineAt` on `GET /me/attempts/:id`; the web client auto-submits at zero). The server does not
    reject a late `submit`: it grades and stores it with `submittedLate = true` when it arrives more than 2 minutes after the deadline (grace for
    client timers), so `POST /complete` still posts that score. Saving answers is not blocked by the deadline either.
  - `POST /complete` is unchanged and single use per `attemptId`, so each attempt posts its own score and per-section dimensions from its own stored scores.
- `POST /complete` also takes `{attemptId}` for an assessment: the attempt must belong to `sub`, to the session's `deliveryId`, be submitted (graded on the server). It may have been
  started in an earlier session: a relaunch resumes it under a new session, so there is no check against the session `iat`. Score = the overall percent of its stored section scores (correct / total, rounded), with `DIMENSIONS_FIELD`
  = one entry per section `{dimension: section title, score: round(correct / total * 100)}`. Locks: `lti-complete` per LTI session and `lti-result` keyed `assessment:<attemptId>` (30 days); both are
  released if the post fails (502); reuse answers 409. Rate limit as the others (10 per minute per `sub`).
- `POST /submit` takes the `submission` token and answers, scores them with the tool's own scorer, obtains an access token from the
  platform `tokenUrl` (client-credentials with a signed assertion; the timestamp is always sent), POSTs the score to the lineitem scores URL, and renders a result page
  (overall score, per-dimension scores, feedback) with a primary "Back to your course" link to the launch's `return_url` (fallback `LTI_RETURN_URL`, default `http://localhost:5174`); error pages link there too. A submission token is single use: its `jti` is
  consumed only once the score post succeeds (a failed post can be retried with the same token), and a reused token gets a 409 page.
  A concurrent submit of the same token also gets the 409 (the in-flight lock).
- Scoring: `LTI_TOOL_SCORING=stub` uses a deterministic offline scorer (for tests and local runs without an Anthropic key);
  otherwise the existing `InterviewEngineService`.
- The tool's question store: for the POC, the tool reads ID `Scenario` rows through its own service. That is acceptable because this is
  the ID side (the tool). The platform never reads them.

## LearnDifferently learner API and UI

- New item type `tool`, config `{ toolId, ref, skill?, maxAttempts?, timeLimitMinutes? }` (the last two only for an assessment tool; see below).
- `POST /api/learn/me/cohorts/:cohortId/items/:itemId/tool-launch` (learner auth) returns `{ action, fields }`. The SPA submits those
  as a hidden `<form method=POST>` to `action` in the same window (`target=_self`; new tabs and named windows are unreliable: pop-up blockers, Safari and embedded browsers drop or downgrade them). The tool sends the learner back through the return link, and the item page then loads fresh data. The item page shows one primary action: "Start in <tool>" ("Start the assessment" for an assessment), or once completed "Continue" with a quiet "Try again" while attempts remain. The learner item view for a `tool` item exposes `tool: { toolId, name, ref, retries, attemptsAllowed, timeLimitMinutes }`
  and its score/status like other items.
- `LearnerService.recordToolResult(userId, cohortId, itemId, { scorePct, dimensions? })` upserts `ItemProgress` (best score,
  attempts + 1, status completed), then runs the existing plan/completion updates.

## Attempts and time limits (assessment tools)

Only for tools whose registry `kind` is `assessment` (`id-assessment`); interview tools are unlimited and get neither field.

- Item config: `maxAttempts` (integer 1-5, default 1) and `timeLimitMinutes` (optional integer 5-240). Out of range or non-integer values are refused with 400; for a non-assessment tool they are dropped on save.
- Attempts are counted by LearnDifferently: `ItemProgress.attempts` is the number of scores recorded. `startLaunch` refuses with 409 `You have used all N attempts.` when `attempts >= maxAttempts`.
- The launch custom claim for an assessment is `{ ref, tool, attempt, timeLimitMinutes? }`. `attempt` is the 1-based number this launch is for, `attempts + 1`; `timeLimitMinutes` is present only when the item sets one. An unfinished attempt (started in Interview Differently, never scored) is resumed by the next launch because `attempt` is unchanged until a score is recorded.
- `recordToolResult` keeps the best score for assessment items (a lower later score never lowers it) and increments `attempts` once per recorded score; a repeated report of the same moment is ignored. Completion and the pre/post record are unchanged.
- Learner view `tool`: `retries` is true for an interview always and for an assessment while `attempts < maxAttempts`; `attemptsAllowed` is `maxAttempts` (null = unlimited, an interview); `timeLimitMinutes` is the limit or null.
- Authoring UI: "Attempts allowed" and "Time limit (minutes, optional)" beside the Pre/Post select. Learner UI: "Attempt n of N" / "Attempts used: n of N", "Time limit: X minutes", "Start the assessment", "Try again" while attempts remain, and the best score.

## Return host

LearnDifferently runs on tenant hosts such as `delaware.learndifferently.tech`, so the return link must go back to the host the learner launched from, not always `LTI_LEARN_URL`.

- `POST .../tool-launch` reads the request `Origin` header (falling back to the `Referer`'s origin) and passes it to `startLaunch` as `returnOrigin`.
- The platform accepts it only if it is `https` and its hostname equals the `LTI_LEARN_URL` hostname or is a subdomain of it (one or more labels), with the same port as `LTI_LEARN_URL`, or (local development) its origin exactly equals the `LTI_LEARN_URL` origin (`http://localhost:5174`). Userinfo, other schemes and lookalikes (`evil-learndifferently.tech`, `learndifferently.tech.evil.com`) are rejected. Anything else is ignored silently and `LTI_LEARN_URL` is used.
- The accepted origin travels in the single-use signed `lti_message_hint` (claim `returnOrigin`, re-validated on read) and becomes the id_token's `launch_presentation.return_url` (`${returnOrigin}/lms/learning/${cohortId}/${itemId}`).
- The tool applies the same rule to the `return_url` it receives (in addition to the issuer origin), falling back to `LTI_RETURN_URL` otherwise.
- The rule is one pure function, `isLearnOrigin(value, learnUrl)` in `apps/api/src/lti/lti-env.ts`, shared by both sides.
