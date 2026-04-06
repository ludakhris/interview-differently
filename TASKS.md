# InterviewDifferently — Task Backlog

Tasks that are identified but not yet scheduled. Ordered roughly by dependency / logical sequence.

---

## Builder (Phase 2) — Polish and gaps

- [x] **Builder: node position auto-layout** — BFS tree layout runs on import; nodes are spaced by depth layer, centred on canvas.
- [x] **Builder: built-in scenarios in admin list** — Static scenarios from `scenarios.ts` are visible in the builder list and can be imported to localStorage for viewing and editing. Deleting the import reverts to the original.
- [x] **Builder: published scenarios on student dashboard** — `fetchScenarios()` merges static and published localStorage scenarios; builder version takes priority if same ID exists in both.
- [x] **Builder: mobile warning** — Dismissible toast on mobile with 10s countdown; uses `navigator.userAgent` so it only fires on real mobile devices.
- [ ] **Builder: briefing editor** — The scenario briefing (situation, role, organisation, reportsTo, timeInRole) is defined in the type but the builder has no UI to fill it in. Add a briefing section to the setup or canvas page.
- [ ] **Builder: preview wired to simulation** — Preview button currently navigates to the live play route. Need a proper preview mode that uses a test session and shows a watermark, without writing to the database.
- [ ] **Builder: export / import JSON** — Allow admins to download a scenario as a portable JSON file and re-import it. Useful for sharing templates between institutions.
- [ ] **Builder: context panels UI** — The `contextPanels` and `display` fields on a scenario are not editable from the builder. Add an optional panel editor per node for monitor/table/finding display config.
- [ ] **Builder: protect admin routes** — `/builder` and sub-routes should require an admin role. Currently any URL visitor can access them. Blocked on Phase 3 (auth).

---

## Phase 3 — Real auth (Clerk)

- [ ] Replace hardcoded demo user (`JD` avatar) with real Clerk authentication
- [ ] Email + password sign-in for students
- [ ] Institutional email domain detection → auto-assign institution
- [ ] Admin role in Clerk metadata → gates builder access
- [ ] Session persistence across devices
- [ ] Completed simulation results tied to authenticated user ID
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

- [ ] PostgreSQL schema: `competency_scores` table
- [ ] Write dimension scores on every simulation completion
- [ ] Student dashboard: competency profile showing average per dimension across all completions
- [ ] Simulation history list (date, track, overall score)
- [ ] Retrying a scenario creates a new record — prior attempts preserved
- [ ] Profile visualization updates immediately after completing a new simulation
- [ ] Blocked on Phase 3 and 4

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

- [ ] Set `FRONTEND_URL` env var in Railway to `https://interview-differently.vercel.app`
- [ ] PostgreSQL on Railway (required for Phases 4–6)
- [ ] Redis session state on Railway (optional, for Phase 4 performance)
- [ ] Swap `builderService.ts` localStorage CRUD for real API calls once backend is ready
- [ ] Swap `scenariosService.ts` static import for API fetch once backend serves scenarios

---

## Out of scope for POC

- Native mobile app
- Employer-facing portal
- Marketplace for community-built scenarios
- Video or audio scenario content
- ATS or job application platform integrations
- Payment processing and subscription management
