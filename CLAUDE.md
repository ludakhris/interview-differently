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
4. **Save PNGs** to `docs/screenshots/<topic>/` (e.g. `docs/screenshots/phase1/`).
5. **Commit + push** so the images have a stable URL.
6. **Reference from the issue comment** via `https://raw.githubusercontent.com/ludakhris/interview-differently/<sha>/docs/screenshots/<topic>/NN-name.png` — pin to the commit SHA, not a branch name, so the image never moves.
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
