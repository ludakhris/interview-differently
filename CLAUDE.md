# Project memory — InterviewDifferently

## Workflow

**Backlog lives in [GitHub Issues](https://github.com/ludakhris/interview-differently/issues), not files.**
- Open a new issue for any non-trivial new work or follow-up. One issue per coherent feature; use a checklist inside for sub-tasks.
- Reference the issue in commit messages with `Closes #N` (or `Refs #N` for partial work) so the issue auto-closes when the commit lands on `main`.
- Don't reintroduce a sprawling `TASKS.md` — drift across edits is the failure mode that motivated the migration on 2026-05-03.

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
- ATS or job application platform integrations
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
