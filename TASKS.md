# InterviewDifferently — Task Backlog

Tasks that are identified but not yet scheduled. Ordered roughly by dependency / logical sequence.

---

## Builder (Phase 2) — Polish and gaps

- [x] **Builder: node position auto-layout** — BFS tree layout runs on import; nodes are spaced by depth layer, centred on canvas.
- [x] **Builder: built-in scenarios in admin list** — Static scenarios from `scenarios.ts` are visible in the builder list and can be imported to localStorage for viewing and editing. Deleting the import reverts to the original.
- [x] **Builder: published scenarios on student dashboard** — `fetchScenarios()` merges static and published localStorage scenarios; builder version takes priority if same ID exists in both.
- [x] **Builder: mobile warning** — Dismissible toast on mobile with 10s countdown; uses `navigator.userAgent` so it only fires on real mobile devices.
- [x] **Builder: briefing editor** — Slide-over panel for situation, role, organisation, reportsTo, timeInRole, and estimatedMinutes. Opened by clicking the Start node on the canvas.
- [x] **Builder: node deletion** — Delete button in the node editor panel header; also wired to Delete and Backspace keyboard shortcuts.
- [x] **Builder: preview wired to simulation** — Preview button saves canvas state to sessionStorage and navigates with `?builderPreview=true`; SimulationPage loads from sessionStorage, shows a fixed amber "Preview Mode" banner, skips writing results, and returns to builder on completion.
- [x] **Builder: export / import JSON** — Allow admins to download a scenario as a portable JSON file and re-import it. Useful for sharing templates between institutions.
- [x] **Builder: context panels UI** — `contextPanels` editable per decision node (type/label/value inline editor). Scenario-level `display` editable via toolbar "Display" button: contextStyle selector, alert banner, incident metadata, and sidebar section/item editor.
- [x] **Builder: protect admin routes** — `/builder` and sub-routes require `role: 'admin'` in Clerk public metadata. Non-admins see an "Access restricted" screen.

---

## Phase 3 — Real auth (Clerk)

- [x] Replace hardcoded demo user (`JD` avatar) with real Clerk authentication
- [x] Email + password sign-in for students
- [ ] Institutional email domain detection → auto-assign institution
- [x] Admin role in Clerk metadata → gates builder access
- [ ] Session persistence across devices
- [x] Completed simulation results tied to authenticated user ID
- [ ] Institutional SSO via SAML/OIDC (post-pilot)

---

## Phase 4 — AI feedback (Anthropic)

- [x] Assemble session transcript on the backend after scenario completion
- [x] Call Claude API (`claude-haiku-4-5-20251001`) with transcript + scores + rubric dimensions
- [x] Parse structured JSON response (one feedback string per dimension)
- [x] Store AI feedback in `aiFeedback Json?` column on `SimulationResult` — cached after first generation
- [x] Fallback to template feedback if API call fails or times out
- [x] Per-dimension skeleton loading state while Claude generates
- [x] `✦ AI FEEDBACK` badge on each dimension card when AI feedback is active
- [x] Admin toggle (`/admin/settings`) to enable/disable AI feedback at runtime via `PlatformConfig` table
- [x] View past results with AI feedback from dashboard history via `GET /api/results/:id`

---

## Phase 5 — Score persistence and competency profile

- [x] PostgreSQL schema: `SimulationResult` + `DimensionScore` tables
- [x] Write dimension scores on every simulation completion
- [x] Student dashboard: competency profile showing average per dimension across all completions
- [x] Simulation history list (date, track, overall score)
- [x] Retrying a scenario creates a new record — prior attempts preserved
- [x] Profile visualization updates immediately after completing a new simulation

---

## Phase 6 — Institution analytics dashboard

- [ ] Institution overview: total students, completion rate, average score per track, active users last 30 days
- [ ] Institutions have a configured email root domain
- [ ] Cohort overview: same metrics filtered to a cohort, cohort comparison
- [ ] Competency heatmap: rows = students (anonymised), columns = dimensions, colour = Strong/Proficient/Developing
- [ ] Student detail view: all completions, per-dimension trend over time
- [ ] Scenario engagement: completions vs drops vs retries, avg completion time, drop-off by decision step
- [ ] Cohort management: create named cohorts, assign students manually or via CSV by Institution admins
- [ ] CSV export on every analytics view
- [ ] PDF export on heatmap (for sharing with department heads)
- [ ] Create a mechanism for Students when they sign up to join a cohort
- [ ] Create an Admin view that lets you see all cohort and cohort members and manually add users to cohorts
- [ ] Allow admins to add their own scenarious that are private to just their Institution. Full admins can see all scenarios including those that are public or owned by an Institution. We'll need to change the admin view so we can see the scenarios grouped by Institutions. 
- [ ] When students sign up and their email domain matches it auto suggests they join the existing institution and are offered to join a cohort if they know the configured cohort key. 
- [ ] Blocked on Phase 5

---

## Infrastructure and ops

- [x] Set `FRONTEND_URL` env var in Railway to `https://interview-differently.vercel.app`
- [x] PostgreSQL on Railway (required for Phases 4–6)
- [x] Redis session state on Railway (optional, for Phase 4 performance)
- [x] Swap `builderService.ts` localStorage CRUD for real API calls once backend is ready
- [x] Swap `scenariosService.ts` static import for API fetch once backend serves scenarios

---

## Prompt centralisation (prerequisite for Phase 7)

- [ ] Create `apps/api/src/config/prompts.config.ts` — single source of truth for every Claude prompt string; each entry is a named export with the template literal and inline JSDoc explaining intent and expected output format
- [ ] Move `buildPrompt()` content from `ai-feedback.service.ts` into `prompts.config.ts`; service imports and calls the exported builder function
- [ ] Add a matching `apps/web/src/config/prompts.config.ts` for any client-side prompt work (initially empty placeholder)
- [ ] CI lint rule (or ESLint custom rule) that flags any string literal longer than 120 chars passed directly to an Anthropic SDK call — prompts must come from the config module

---

## Phase 7 — Immersive Interview Mode (audio + video response)

The goal is a second simulation mode alongside the existing text-based one. The candidate is presented with scenario data (charts, tables, briefing) and an AI-narrated audio track plays to simulate a real interviewer speaking to them. They then respond verbally (audio, video, or both). Claude evaluates the spoken responses and provides feedback as a real interviewer would.

### 7a — Infrastructure

- [ ] **TTS narration service** — `apps/api/src/tts/tts.service.ts`; wraps a TTS provider (start with browser Web Speech API client-side for MVP; upgrade path to ElevenLabs or AWS Polly via env flag `TTS_PROVIDER`). Each scenario node can carry an optional `audioScript` string; if absent, narration is synthesised from the node text.
- [ ] **Media storage** — add `STORAGE_BUCKET` env var; wire a storage service (`apps/api/src/storage/storage.service.ts`) backed by S3-compatible object store (Cloudflare R2 recommended). Stores uploaded `.webm`/`.mp4` blobs keyed by `interviewSessionId/responseId`.
- [ ] **Transcription service** — `apps/api/src/transcription/transcription.service.ts`; calls OpenAI Whisper API (`whisper-1`). Falls back to empty string on timeout so the session is never blocked by a transcription failure.
- [ ] **Prisma schema additions**:
  - `ImmersiveSession` — links to `SimulationResult`, stores `scenarioId`, `userId`, `status`, `createdAt`
  - `ImmersiveResponse` — one row per interview question; stores `sessionId`, `questionText`, `mediaUrl`, `transcript`, `aiFeedback Json?`, `durationSeconds`
- [ ] Run Prisma migration + regenerate client

### 7b — Scenario model changes

- [ ] Add `mode: 'text' | 'immersive'` field to `Scenario` type in `packages/types/src/index.ts` (default `'text'` so all existing scenarios are unaffected)
- [ ] Add `audioScript?: string` to `ScenarioNode` type — the exact words the AI narrator reads for that node; falls back to node text if absent
- [ ] Add `responsePrompt?: string` to `ScenarioNode` — the open-ended question the candidate must answer verbally (only used in `immersive` mode)
- [ ] Update YAML parser (`yamlScenario.ts`) to read new fields
- [ ] Builder: add "Immersive mode" toggle in BriefingEditor (sets `mode`)
- [ ] Builder: NodeEditorPanel shows `audioScript` and `responsePrompt` text areas when scenario mode is `immersive`

### 7c — Backend API

- [ ] `POST /api/immersive-sessions` — create session for a given `scenarioId + userId`; returns `sessionId`
- [ ] `POST /api/immersive-sessions/:sessionId/responses` — accept multipart upload (`file` + `questionText` + `nodeId`); stores blob, enqueues transcription, returns `responseId`
- [ ] `GET /api/immersive-sessions/:sessionId/responses/:responseId` — returns transcript + `aiFeedback` (triggers generation if not yet cached)
- [ ] `GET /api/immersive-sessions/:sessionId/summary` — returns all responses with feedback + an overall performance summary generated by Claude
- [ ] All prompts for immersive feedback live in `prompts.config.ts`:
  - `buildInterviewerFeedbackPrompt(questionText, transcript)` — evaluates a single spoken response as a real interviewer would; 3–4 sentences; references specific things said or omitted
  - `buildInterviewSummaryPrompt(responses[])` — synthesises all responses into an overall interview assessment with strengths, development areas, and a hiring recommendation tier

### 7d — Frontend

- [ ] **`ImmersiveSimulationPage`** (`apps/web/src/pages/ImmersiveSimulationPage.tsx`) — new page for `mode === 'immersive'` scenarios; routing: `/scenario/:id/immersive`
  - Loads scenario + creates `ImmersiveSession` on mount
  - Renders `DataPanel` (charts/tables from `contextPanels`) alongside the active node
  - Auto-plays narration via `useNarration` hook (Web Speech API synthesis or fetched audio)
  - Shows "Ready to respond" button once narration ends; starts a countdown timer
  - Advances to next node after response is submitted
- [ ] **`useNarration` hook** — wraps `window.speechSynthesis`; exposes `play(text)`, `stop()`, `isPlaying` — upgradeable to fetched audio with no API change
- [ ] **`ResponseRecorder` component** — `apps/web/src/components/immersive/ResponseRecorder.tsx`
  - Mode toggle: audio-only / video+audio (video-only excluded — voice is always captured)
  - Uses `MediaRecorder` API; outputs `.webm` blob
  - Shows live waveform visualiser for audio confidence
  - Playback preview before final submit
  - On submit: `POST /api/immersive-sessions/:id/responses` multipart upload
- [ ] **`NarrationPlayer` component** — renders an animated "speaking" indicator while AI audio plays; mute button; replay button
- [ ] **`ImmersiveFeedbackPage`** (`apps/web/src/pages/ImmersiveFeedbackPage.tsx`) — `/scenario/:id/immersive/:sessionId/feedback`
  - Per-question accordion: question text → transcript (collapsible) → AI interviewer feedback
  - Overall summary card at top (generated by `buildInterviewSummaryPrompt`)
  - Option to redo the interview (creates a new session)
  - Scores are not dimension-based here; feedback is qualitative (mirrors real interview practice)
- [ ] Dashboard: immersive sessions appear in history list alongside text-based simulation results; labelled with a mic icon

### 7e — Scenario content

- [ ] Create an immersive variant of `ops-001` as a new scenario (`ops-001-immersive`) — same situation and data context, rewritten as open-ended verbal response nodes with `audioScript` and `responsePrompt` per node; the original `ops-001` text scenario is left unchanged
- [ ] Create one net-new immersive-only scenario purpose-built for the format (open-ended situational questions with data context)

---

## Out of scope for POC

- Native mobile app
- Marketplace for community-built scenarios
- ATS or job application platform integrations
- Payment processing and subscription management

