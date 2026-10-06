# LTI 1.3 proof of concept: contract between LearnDifferently (platform) and a tool (#63)

Goal: prove LD can launch a tool and get a score back using LTI 1.3 message shapes, with the two
sides sharing only `apps/api/src/lti/lti-spec.ts` (standing in for an LTI library). Platform code
lives in `apps/api/src/lti/platform/`, tool code in `apps/api/src/lti/tool/`. Neither may import the
other (enforced by `apps/api/src/lti/lti-boundary.spec.ts`). They talk only over HTTP URLs.

Base URL: `LTI_API_BASE` (default `http://localhost:3000/api`). Platform issuer: `LTI_PLATFORM_ISSUER`
(default: the origin of `LTI_API_BASE`). No database changes in this POC: keys are generated at boot
(or loaded from `LTI_PLATFORM_PRIVATE_KEY` / `LTI_TOOL_PRIVATE_KEY` PEM env vars; `LTI_HINT_SECRET` optionally sets the platform's launch-hint HMAC secret), and registrations are
static config in each side.

## Registration (static)
- Tool id `id-interview`, client id `ld-platform`, deployment id `1`.
- Platform side config (`ToolRegistration`): loginUrl `${BASE}/lti/tool/login`, launchUrl `${BASE}/lti/tool/launch`,
  jwksUrl `${BASE}/lti/tool/jwks`.
- Tool side config (`PlatformRegistration`): issuer, authUrl `${BASE}/lti/platform/auth`,
  tokenUrl `${BASE}/lti/platform/token`, jwksUrl `${BASE}/lti/platform/jwks`.
- Each side's registration config is overridable by env so it can point at another host.

## Platform endpoints (`/api/lti/platform`)
- `GET /jwks` public keys.
- `GET|POST /auth` OIDC authentication request from the tool. Query/form: `scope=openid`, `response_type=id_token`,
  `client_id`, `redirect_uri` (must equal the registered launchUrl), `login_hint`, `lti_message_hint`, `state`, `nonce`,
  `response_mode=form_post`, `prompt=none`. Validates `client_id`, `redirect_uri`, and the `lti_message_hint`
  (a 60 second, single-use, HMAC-signed token the platform minted at launch time that carries
  `{userId, cohortId, itemId, jti, exp}`; the HMAC secret is `LTI_HINT_SECRET` when set, else derived from the platform private key). Re-checks that the learner is still enrolled (not withdrawn) and the cohort still open, so a stale hint yields no id_token.
  Replies with an auto-submitting HTML form POSTing `id_token` and `state` to `redirect_uri`.
  The `id_token` is RS256, iss=platform issuer, aud=client id, sub=learner user id, `nonce` echoed, exp 5 minutes, with claims:
  message_type `LtiResourceLinkRequest`, version `1.3.0`, deployment_id, target_link_uri, resource_link `{id: itemId}`,
  context `{id: cohortId}`, roles `[LEARNER_ROLE]`, custom `{ref}` (the tool-specific reference stored on the item),
  and the AGS endpoint claim `{scope:[AGS_SCOPE_SCORE], lineitem: ${BASE}/lti/platform/ags/${cohortId}/lineitems/${itemId}}`.
- `POST /token` OAuth2 client_credentials with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`,
  `client_assertion` (RS256 JWT signed by the tool: iss=sub=clientId, aud=tokenUrl, jti unique, exp no more than 10 minutes away), `scope`. Verifies against the
  tool's jwksUrl, rejects replayed `jti`, answers failures with a generic `invalid_client`, returns `{access_token, token_type:'Bearer', expires_in:3600, scope}` where access_token is an
  RS256 JWT signed by the platform (aud=clientId, scope claim).
- `POST /ags/:cohortId/lineitems/:itemId/scores` Bearer access token with the score scope. Body is an LTI score
  (`userId`, `scoreGiven`, `scoreMaximum`, `activityProgress`, `gradingProgress`, `timestamp`, plus optional `DIMENSIONS_FIELD`).
  Content-Type must be `SCORE_CONTENT_TYPE` (nothing else is accepted; body at most 100 KB). `timestamp` is required: an ISO 8601
  date-time no more than 5 minutes in the future. Only accepts a score for a learner enrolled in that cohort and an item of type `tool` whose
  `toolId` matches the token's client. Records it (best score kept) via `LearnerService.recordToolResult`.
- Launch start (called by the learner API, not public): `LtiPlatformService.startLaunch(userId, cohortId, itemId)` returns
  `{ action: <tool loginUrl>, fields: { iss, login_hint, target_link_uri, lti_message_hint, client_id, lti_deployment_id } }`.

## Key fetching
`jwksKeyResolver` (lti-spec) caches a JWKS for 5 minutes, remembers unknown `kid`s for 60 seconds (no refetch in that window), shares one
in-flight fetch between concurrent callers, times fetches out after 3 seconds and refuses bodies over 100 KB. Failures surface only as
`Could not load signing keys` (502); the URL is never put in an error.

## Tool endpoints (`/api/lti/tool`)
- `GET /jwks` public keys.
- `GET|POST /login` third-party initiated login: takes `iss, login_hint, target_link_uri, lti_message_hint, client_id`. Looks up the
  platform registration by `iss` + `client_id`, requires non-empty `login_hint` and `lti_message_hint`, creates `state` and `nonce` (stored server-side, single use, 10 min,
  at most 10,000 pending, oldest evicted), sets the cookie `lti_state=<state>; HttpOnly; Secure; SameSite=None; Path=/api/lti/tool; Max-Age=600`
  (the binding between the login and the browser that started it), redirects (302) to the platform `authUrl` with the OIDC params.
  Non-string parameters are treated as missing (400 page).
- `POST /launch` receives `id_token` and `state`. Requires the request cookie `lti_state` to equal the posted `state` (otherwise refused, so a valid id_token and state cannot be
  replayed from another browser), checks state is known and unused, verifies the id_token (signature via platform JWKS,
  iss, aud=clientId, exp, nonce), checks message_type, version and deployment_id, requires the AGS lineitem URL to be on the platform issuer's origin, clears the
  `lti_state` cookie, then renders an HTML page for the interview named by
  the custom claim `ref` (questions from the tool's own store, one textarea each). The page carries a signed, short-lived
  `submission` token (tool-signed HMAC, 30 minutes) holding what the tool needs to post back: sub, jti, lineitem URL, ref.
- `POST /submit` takes the `submission` token and answers, scores them with the tool's own scorer, obtains an access token from the
  platform `tokenUrl` (client-credentials with a signed assertion; the timestamp is always sent), POSTs the score to the lineitem scores URL, and renders a result page
  (overall score, per-dimension scores, feedback) with a link back to the course (`LTI_RETURN_URL`, default `http://localhost:5174`). A submission token is single use: its `jti` is
  consumed only once the score post succeeds (a failed post can be retried with the same token), and a reused token gets a 409 page.
  The consumed store holds at most 10,000 entries (oldest evicted) and expired entries are swept every minute.
- Scoring: `LTI_TOOL_SCORING=stub` uses a deterministic offline scorer (for tests and local runs without an Anthropic key);
  otherwise the existing `InterviewEngineService`.
- The tool's question store: for the POC, the tool reads ID `Scenario` rows through its own service. That is acceptable because this is
  the ID side (the tool). The platform never reads them.

## LearnDifferently learner API and UI
- New item type `tool`, config `{ toolId, ref, skill? }`.
- `POST /api/learn/me/cohorts/:cohortId/items/:itemId/tool-launch` (learner auth) returns `{ action, fields }`. The SPA submits those
  as a hidden `<form method=POST>` to `action` in a new tab. The learner item view for a `tool` item exposes `tool: { toolId, name, ref }`
  and its score/status like other items.
- `LearnerService.recordToolResult(userId, cohortId, itemId, { scorePct, dimensions? })` upserts `ItemProgress` (best score,
  attempts + 1, status completed), then runs the existing plan/completion updates.
