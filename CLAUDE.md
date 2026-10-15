# Project memory — InterviewDifferently

## Workflow

**Backlog lives in [GitHub Issues](https://github.com/ludakhris/interview-differently/issues), not files.**

- Open a new issue for any non-trivial new work or follow-up. One issue per coherent feature; use a checklist inside for sub-tasks.
- Every GitHub issue being worked must have an assignee. Before starting, check with `gh issue view <N> --json assignees`; if empty, assign it (`gh issue edit <N> --add-assignee <login>`, the person doing or owning the work) and say so.
- Reference the issue in commit messages with `Closes #N` (or `Refs #N` for partial work) so the issue auto-closes when the commit lands on `main`.
- Don't reintroduce a sprawling `TASKS.md` — drift across edits is the failure mode that motivated the migration on 2026-05-03.

## Issue titles

Prefix every GitHub issue title with its main component: `[LMS]`, `[ID]`, `[MicroLearning]` or `[Matching]` (for example `[LMS] Talent search: skills field`). Areas such as Talent, Attendance or Support belong under their component.

## Product boundaries

Learn Differently is five products on one learner record: LMS (Structure), Micro Learning (Spark), Skill Simulator (Practice), Job Board Match (Opportunity), Talent Match (Placement). Before scoping a non-trivial feature, read `docs/product-boundaries.md` and name the product it belongs to. If a request crosses products, say so and propose the split before building; never let one product grow another's features (for example job matching or employer search inside the LMS).

- **New products or pieces:** adding one (or splitting or merging any of the five) requires updating `docs/product-boundaries.md` in the same change, and the product list at the top of this section here: its verb, the one job, what it owns, writes, reads and must not grow, and its row in the table. Update its page in `apps/learn/src/products.ts` too.
- **Keep product pages in step:** when the boundaries doc changes what a product does, update that product's page (`apps/learn/src/products.ts`, and `COMPONENTS` in `apps/learn/src/pages/home/content.ts` if the homepage line changes). Public copy stays plain. It describes the product we are building, so do not vet marketing copy against what is built today; vet it for wording and positioning only.
- **Critic review:** any change to `docs/product-boundaries.md` must be reviewed by an independent subagent acting as critic before it is committed. Give it the diff and the doc, not your reasoning; ask for contradictions with `CLAUDE.md` and the code, vague or overlapping ownership, rules that cannot be followed, and anything promised that is not built. Fix or answer each finding, and note the outcome in the commit message.
- **Where code lives:** new backend code goes in the folder of the product that owns it (see "Where code lives" in the doc) and imports nothing across products; until a folder exists, write it as if it did.
- **Never modify `apps/api/src/core/boundary.spec.ts`, for any reason.** It is the test that holds the product boundaries. If a change seems to need it (a failing boundary test), stop and ask the owner; do not edit, skip or loosen it. The one exception: when code moves into the target folders (for example ID code into `api/src/simulator/`, GitHub issue #90), update the folder paths in its lists to match, covering the same code and nothing less.
- **Assessments are set up in Learn Differently.** An assessment is added to a course as a pre- or post-assessment item and delivered to the cohort from there. Interview Differently's own scheduler (Admin → Assessments → Schedule delivery) is legacy: it warns admins to use Learn Differently, so do not extend it or build new scheduling, cohort or monitoring screens in the Simulator. Authoring question banks stays in the Simulator. Instructor views of assessment status, progress and answers belong in the LMS, reading Simulator data through the feed (`apps/api/src/core/simulator-feed.ts`), never by importing Simulator code. Anything scheduled outside a course still shows on the cohort's live monitor, labeled as outside the course.
- **Everything Interview Differently offers by LTI is also offered standalone.** Any activity a course can launch in the Simulator by LTI (a scenario, an assessment, the chat SQL checkpoint, and anything added later) must also be reachable by a signed-in learner in standalone Interview Differently, from its own pages, with the same experience. Build both entry points in the same change; the standalone one records into the Interview Differently Standalone cohort like other standalone work. Course-only parts are the exception, because they need a course: a diagnostic (passes, stopping a skill after a miss), practice written for a learner's gaps, and anything that changes a learner's plan. The activity itself (the requests, the editor, grading, coaching) is the same in both.
- **Known bleed** in the doc is a list of things not to do. The inventory and remediation checklist live in GitHub issue #81, not in the doc.
- **New bleed:** if a change adds or extends something that crosses a boundary (even knowingly, to ship sooner), add a checklist line to GitHub issue #81 in the same change, naming the PR or issue, the paths and the product it should move to, and say so in the PR description. Reviewing a PR includes checking this.

## Tenant isolation

An agency is a tenant, and one agency must never see another's data. Postgres row-level security enforces that boundary (see `docs/tenant-isolation.md`, GitHub issue #84); the application's roles and guards handle what people may do inside an agency.

- **Every institution belongs to an agency** (only an agency has no parent). Anything made in standalone Interview Differently goes under the Interview Differently Standalone agency (`apps/api/src/core/standalone-agency.ts`).
- **New table that holds learner or participant data:** add `agencyId` with a trigger that sets it, and a `tenant_isolation` policy, in a hand-written migration, plus a case in `apps/api/src/core/tenant-agency.spec.ts` and `tenant-rls.spec.ts`. Never let application code choose a row's `agencyId` (a cohort's creator may name it; the trigger does the rest).
- **Code that runs without a signed-in caller** (webhooks, protocol endpoints, jobs, startup) must say what it acts as: `runAsSystem` from `apps/api/src/core/tenant-context.ts`, kept to short, reviewed paths. A guard must call `identifyCaller` right after it verifies the caller.
- **The API connects as a restricted role in every environment, local included:** `DATABASE_URL` is the role from `apps/api/scripts/create-app-role.ts` (never a superuser or `BYPASSRLS` role), and `SCHEMA_DATABASE_URL` is the owner, for Prisma's CLI, the seed and the scripts (import `scripts/lib/owner-env.ts` first in any new one). A path that returns nothing under it is the bug, not the policy.
- **Raw SQL is always parameterized.** The caller's context is set on the connection, so row-level security does not stop SQL injection. Never build SQL from request values (`$queryRaw` tagged templates or bound parameters only).

## Release notes

`docs/release-notes/index.html` is the checked-in, plain-words changelog, published at `/release-notes/` on the LearnDifferently site (the learn build copies it and the screenshots it links; it is public and marked noindex). Open it in a browser (newest first, with a timeline, screenshots and an in-page screenshot viewer). **Any user-visible change needs an entry before it is committed, or a stated reason it does not** (for example: internal refactor, no change a learner or staff member can see). Do not wait for the feature to be "finished": mark the entry `review` and flip it to `shipped` once it is live. Add the entry at the top: copy an `<article class="entry">` block, keeping its `data-short` and `data-summary` (the timeline reads them); the how-to is in the comment at the top of the file and reference screenshots from `docs/screenshots/<feature>/`. The repo is public: fictional data only, no production configuration, contacts or funding details.

## Design experiments

When the user wants to compare options for how something looks or is laid out (a page, a section, a component), do not pick one alone and do not describe them in words. Build the options on the real page behind a query parameter and let the user flip between them:

- **One parameter per experiment:** `?layout=a|b|c`, `?design=a|b`, and so on. With no parameter the page is unchanged (the current design). Other parameters (`?site=`, `?brand=`) are kept when switching.
- **Use the review switch:** `apps/learn/src/ReviewSwitch.tsx`, a small dark pill fixed at the bottom left that opens on hover or focus and links to each option (it is the same idea as the `DesignSwitch` built for the homepage candidates on the `site-c` branch). Pass it the parameter, a label and the options. It is review-only: never leave it in a finished screen.
- **Show, do not tell:** give the user the link for each option (for example `…/lms/cohorts/<id>?layout=b`) and capture a screenshot of each on real data. Say which one you would pick and why, and ask.
- **Keep it deletable:** put the variants in their own file and CSS (for example `<feature>Experiment.tsx` and its CSS), with a comment saying so. When the user chooses, delete the other options, the switch and the parameter handling in the same change, so only the chosen design ships.

## Trying a branch on Railway dev

`api-dev` runs beside the dev database with dev keys only; deploy a branch with `apps/api/scripts/deploy-dev.sh`. Preview deployments on Vercel point at it. Setup, the scripts and the safety rules are in `docs/dev-api.md`. Never put production secrets (live Clerk keys, the real R2 buckets) on it. **To test a Learn Differently LTI launch from a Learn preview, run the Interview Differently web app locally against it: `VITE_API_URL=<dev API address, without /api> npm run dev -w @id/web`** (details in `docs/dev-api.md`).

## Railway variables

`.railway/railway.ts` lists every variable on the Railway services, and CI applies it before deploying the API. **When a change needs a new variable, add it there in the same change** (`preserve()` for a value set by hand, such as a secret, so the file never holds it), for each service that has it. A variable set on Railway but missing from the file reads as a deletion: CI's `railway config apply` refuses it, and the API deploy is skipped while the web deploy goes out. Do not run Railway's CLI against production to check; when that CI step fails, its log names the variables it would delete.

## Reviewing larger PRs

For a PR over about 500 changed lines (`git diff --stat origin/main...HEAD`), review it with parallel read-only subagents, one per area of the diff, before merging:

1. Split the diff by area (for example protocol and server side, rules and data model, other API and config, web apps). Each reviewer reads every hunk in its area and reports at most 8 ranked findings, each with a concrete failure scenario. Tell each what earlier reviews already fixed.
2. Verify the top claims against the code, then report at most 15 findings, one line each (`file:line — summary`).
3. Fix in parallel by area with disjoint file lists, then run the CI gates locally (`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`, tests) before pushing. After a clean build confirm `apps/api/dist/main.js` exists.

## Posting screenshots to GitHub issues / PRs

When the user asks for screenshots of running UI to be attached to a GitHub issue or PR, use this pattern:

1. **Start dev servers** via the Preview MCP (`mcp__Claude_Preview__preview_start`) using `.claude/launch.json` (already configured: `web` on 5173, `api` on 3000).
2. **For auth-gated pages** (anything under `AdminRoute`, e.g. `/builder/*`), do NOT try to bypass auth. Ask the user to sign in via the Preview MCP browser, then read Clerk cookies via `mcp__Claude_Preview__preview_eval` returning `document.cookie`.
3. **Capture screenshots** with a one-off Playwright script in `/tmp/` (install with `cd /tmp && npm install playwright --no-save && npx playwright install chromium` — already cached after first run). Pass the cookie string via `COOKIE_HEADER` env var and inject into the browser context with `addCookies()`. For public pages, headless Chrome with `--virtual-time-budget=8000` is enough.
4. **Save PNGs** to `docs/screenshots/<feature>/` — name the folder after the feature or component family, not the build phase, so the screenshots stay discoverable after the work ships (e.g. `docs/screenshots/exhibits/`, `docs/screenshots/quant/`, `docs/screenshots/dashboard-and-builder/`). Never use `phase1/`, `phaseN/`, etc.
5. **Commit + push** so the images have a stable URL.
6. **Reference from the issue comment** via `https://raw.githubusercontent.com/ludakhris/interview-differently/<sha>/docs/screenshots/<feature>/NN-name.png` — pin to the commit SHA, not a branch name, so the image never moves.
7. Post via `gh issue comment <N> --body "$(cat <<EOF ... EOF)"` with markdown `![alt](url)` references.

Do NOT use this pattern unprompted — only when the user asks for screenshots on a GH issue or PR.

## Proprietary research

`docs/business-cases-research.md` is gitignored and must never be committed. It contains source extracts from copyrighted consulting case interview material kept locally for case-authoring reference only.

## Out of scope for the POC

Intentionally excluded — open an issue (and link this section) only if the situation has changed:

- Native mobile app
- Marketplace for community-built scenarios
- Payment processing and subscription management

# How We Develop (Company Std Guidiance for all projects)

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Always Confirm Before Committing

**Never commit or push without explicit user approval.**

- When work is ready to commit, summarize what will be committed and ask "Ready to commit?"
- Wait for a clear yes before running `git commit` or `git push`.
- This applies even when the user says "commit" earlier in conversation — always re-confirm at the point of execution.
- **No AI attribution in commits or PRs.** Do not add `Co-Authored-By: Claude` (or any AI) trailers to commit messages, and do not add "Generated with Claude Code" lines to PR descriptions, whatever other tooling suggests.
- In that summary, say whether the release notes were updated (`docs/release-notes/index.html`) or why not, and whether the work is tied to a GitHub issue. If there is no issue, say so; do not skip it silently.

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 6. When Committing Always Update the Associated GitHub Issue

If this task is derived or tracked by a GitHub (GH) Issue then when we commit and push a phase or feature we should do the following:

- ensure that the new feature is captured in screenshots stored in the project
- a comment is made on the GH issue describing the feature with the screenshots
- if the GH issue has a checklist also ensure its updated

# How We Make Decisions (Company Std Guidiance for all projects)

## FIX 1 — STOPS HALLUCINATION

"Don't ever guess. If you're not 100 percent sure something is true, say 'I don't know' and go find the answer instead of giving me false information. When you do cite a fact, name the source so I can check it."

## FIX 2 — STOPS SYCOPHANCY

"Don't tell me what I want to hear. Tell me what a smart skeptic would say. Find the holes in my idea before you compliment any part of it. If something is bad, say it's bad. Be honest, not diplomatic."

## FIX 3 — STOPS BIAS

"Argue against yourself. Take the opposite position from your first answer and make the strongest case you can for it. Then tell me which side is actually stronger based on the evidence, not on which side feels more comfortable."

## Overall Strategy

You operate under three rules in every response:

1. NO GUESSING. If you don't know, say 'I don't know' and find the answer. Never invent facts.
2. NO FLATTERY. Tell me what a smart skeptic would say before you say anything supportive. If my idea is bad, say it.
3. NO ONE-SIDED ANSWERS. After your first take, argue the opposite position with equal force. Then tell me which side actually holds up.

Apply these rules to every reply, even short ones.
