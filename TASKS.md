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

- [ ] Move scoring engine from frontend hook to backend (NestJS)
- [ ] Assemble session transcript on the backend after scenario completion
- [ ] Call Claude API with transcript + pre-calculated scores + rubric dimensions
- [ ] Parse structured JSON response (one feedback string per dimension)
- [ ] Store scores and feedback in PostgreSQL
- [ ] Fallback to template feedback if API call fails
- [ ] Target: feedback generation completes in under 6 seconds
- [ ] Blocked on Phase 3 (needs authenticated user ID to store results against)

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
- [ ] Cohort overview: same metrics filtered to a cohort, cohort comparison
- [ ] Competency heatmap: rows = students (anonymised), columns = dimensions, colour = Strong/Proficient/Developing
- [ ] Student detail view: all completions, per-dimension trend over time
- [ ] Scenario engagement: completions vs drops vs retries, avg completion time, drop-off by decision step
- [ ] Cohort management: create named cohorts, assign students manually or via CSV
- [ ] CSV export on every analytics view
- [ ] PDF export on heatmap (for sharing with department heads)
- [ ] Blocked on Phase 5

---

## Infrastructure and ops

- [x] Set `FRONTEND_URL` env var in Railway to `https://interview-differently.vercel.app`
- [x] PostgreSQL on Railway (required for Phases 4–6)
- [x] Redis session state on Railway (optional, for Phase 4 performance)
- [x] Swap `builderService.ts` localStorage CRUD for real API calls once backend is ready
- [x] Swap `scenariosService.ts` static import for API fetch once backend serves scenarios

---

## Out of scope for POC

- Native mobile app
- Employer-facing portal
- Marketplace for community-built scenarios
- Video or audio scenario content
- ATS or job application platform integrations
- Payment processing and subscription management

