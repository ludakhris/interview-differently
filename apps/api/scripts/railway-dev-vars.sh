#!/usr/bin/env bash
# Sets the variables of the `api-dev` service in Railway's `dev` environment from your LOCAL development files, so
# the dev API runs with dev keys only. You run it; it never reads production. It prints variable NAMES, never values.
#
#   apps/api/scripts/railway-dev-vars.sh            # show what it would set
#   apps/api/scripts/railway-dev-vars.sh --apply    # set them
#   add --with-storage-and-email to also copy the storage (R2) and email (Resend) keys. Off by default: your local
#   .env may point at the real media buckets, and a dev API should not hold keys that can write there or send mail.
#
# Reads apps/api/.env for your dev keys. The two database URLs are not read from it (your local database is your own
# Docker Postgres) and use Railway's private network, since the dev database has no public address:
#   DATABASE_URL         the restricted role `ld_app` on the private host (the API connects with it, so row-level
#                        security applies). Kept as it is, unless you pass the dev role's password:
#                        DEV_APP_ROLE_PASSWORD=... apps/api/scripts/railway-dev-vars.sh --apply
#   SCHEMA_DATABASE_URL  a reference to the dev Postgres service (the owner; Prisma's migrations and the seed use it)
# Variables that are not in your .env are skipped and listed at the end.
set -euo pipefail
cd "$(dirname "$0")/../../.."
[ -f apps/api/.env ] || { echo "apps/api/.env not found: this script copies your dev keys from it. Stopping." >&2; exit 1; }

ENVIRONMENT=dev
SERVICE=api-dev
APPLY=0
WITH_STORAGE=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --with-storage-and-email) WITH_STORAGE=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# Dev keys and settings copied by name from apps/api/.env.
COPY=(ANTHROPIC_API_KEY OPENAI_API_KEY DID_API_KEY CLERK_SECRET_KEY LEARN_CLERK_SECRET_KEY ADMIN_EMAIL
  LTI_HINT_SECRET LTI_PLATFORM_PRIVATE_KEY LTI_TOOL_PRIVATE_KEY LTI_TOOL_SECRET)
if [ "$WITH_STORAGE" = 1 ]; then
  COPY+=(RESEND_API_KEY R2_ACCESS_KEY_ID R2_ACCOUNT_ID R2_BUCKET R2_PUBLIC_URL R2_RESPONSES_BUCKET R2_SECRET_ACCESS_KEY)
fi

# The Clerk keys must be the dev instances' (sk_test_...). Never put a live key on the dev service.
for k in CLERK_SECRET_KEY LEARN_CLERK_SECRET_KEY; do
  if grep -qE "^$k=\"?sk_live" apps/api/.env; then echo "$k in apps/api/.env is a live key. Stopping." >&2; exit 1; fi
done

get() { # value of NAME in a dotenv file, without quotes
  python3 - "$1" "$2" <<'PY'
import sys,re
name,path=sys.argv[1],sys.argv[2]
for line in open(path):
    m=re.match(r'^\s*'+re.escape(name)+r'\s*=\s*(.*)\s*$',line)
    if m:
        print(m.group(1).strip('"\''))
        break
PY
}

# API_DOMAIN=<host> overrides the lookup (some CLI versions list no Railway-provided domains).
API_DOMAIN="${API_DOMAIN:-$(railway domain list -s "$SERVICE" -e "$ENVIRONMENT" 2>/dev/null | grep -oE '[a-z0-9-]+\.up\.railway\.app' | head -1 || true)}"
[ -n "$API_DOMAIN" ] || { echo "No domain on $SERVICE. Run: railway domain -s $SERVICE -e $ENVIRONMENT" >&2; exit 1; }

set_var() { # NAME VALUE
  if [ "$APPLY" = 1 ]; then
    railway variables -s "$SERVICE" -e "$ENVIRONMENT" --set "$1=$2" --skip-deploys >/dev/null
  fi
  echo "  set $1"
}

echo "Service $SERVICE in environment $ENVIRONMENT ($([ "$APPLY" = 1 ] && echo applying || echo dry run))"
missing=()
for name in "${COPY[@]}"; do
  value="$(get "$name" apps/api/.env || true)"
  if [ -n "$value" ]; then set_var "$name" "$value"; else missing+=("$name"); fi
done

# Database: the restricted role on the private host, and the owner by reference. Your local database is your own
# (Docker), so neither comes from your .env. DATABASE_URL is set only when you pass the dev role's password; otherwise
# api-dev keeps the value it has.
if [ -n "${DEV_APP_ROLE_PASSWORD:-}" ]; then
  PW="$(python3 -c "import sys; from urllib.parse import quote; print(quote(sys.argv[1], safe=''))" "$DEV_APP_ROLE_PASSWORD")"
  set_var DATABASE_URL "postgresql://ld_app:$PW@\${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/\${{Postgres.PGDATABASE}}"
elif railway variables -s "$SERVICE" -e "$ENVIRONMENT" --json 2>/dev/null | grep -q '"DATABASE_URL": *"postgresql://ld_app:'; then
  echo "  kept DATABASE_URL (api-dev already connects as ld_app)"
else
  echo "api-dev has no ld_app DATABASE_URL. Re-run with DEV_APP_ROLE_PASSWORD=<the dev role's password> (docs/dev-api.md)." >&2
  exit 1
fi
set_var SCHEMA_DATABASE_URL '${{Postgres.DATABASE_URL}}'
set_var REQUIRE_TENANT_RLS on

# Earlier versions of this script set these; the API no longer reads them.
for old in OWNER_DATABASE_URL APP_DATABASE_URL TENANT_RLS; do
  if [ "$APPLY" = 1 ] && railway variables -s "$SERVICE" -e "$ENVIRONMENT" --json 2>/dev/null | grep -q "\"$old\""; then
    railway variable delete "$old" --service "$SERVICE" --environment "$ENVIRONMENT" >/dev/null 2>&1 || true
    echo "  removed old $old"
  fi
done

# Which browser origins are Vercel previews of the two front ends. Built here from your own Vercel team, so no team name is
# written into the repo. A preview URL is <project>-git-<branch>-<team> or <project>-<9 characters>-<team>; the pattern
# cannot tell a branch name from a longer team name, so a team whose name ends with yours could match. That is
# tolerable only because this is the dev API (never set in production) and a matching origin gains nothing without a token.
ACCOUNT_ID="$(vercel api /v9/projects/learn-differently 2>/dev/null | python3 -c "import sys,json; t=sys.stdin.read(); print(json.loads(t[t.find('{'):]).get('accountId',''))" || true)"
TEAM_SLUG=""
if [ -n "$ACCOUNT_ID" ]; then
  TEAM_SLUG="$(vercel api "/v2/teams/$ACCOUNT_ID" 2>/dev/null | python3 -c "import sys,json,re; t=sys.stdin.read(); s=json.loads(t[t.find('{'):]).get('slug',''); print(s if re.fullmatch(r'[a-z0-9-]+', s) else '')" || true)"
fi
if [ -n "$TEAM_SLUG" ]; then
  set_var PREVIEW_ORIGIN_PATTERN "^https://(interview-differently-web|learn-differently)(-git-[a-z0-9-]+|-[a-z0-9]{9})-${TEAM_SLUG}\\.vercel\\.app\$"
else
  echo "  (could not read your Vercel team, so PREVIEW_ORIGIN_PATTERN is left unset: previews will not be accepted by the dev API)"
fi

# URLs of this API and of the front ends that call it (localhost for local work; previews are matched by pattern).
set_var LTI_API_BASE "https://$API_DOMAIN/api"
set_var FRONTEND_URL "http://localhost:5173"
# Where a launched Interview Differently scenario opens. The dev API cannot work this out from a Learn preview (the two
# front ends have unrelated preview hostnames), so it is one fixed address: your local web app by default (run it with
# VITE_API_URL set to this API), or a web preview you choose: ID_WEB_URL=https://<web preview> railway-dev-vars.sh --apply
set_var LTI_ID_WEB_URL "${ID_WEB_URL:-http://localhost:5173}"
set_var LTI_LEARN_URL "http://localhost:5174"
set_var LTI_RETURN_URL "http://localhost:5173"

echo
if [ ${#missing[@]} -gt 0 ]; then echo "Not in your local .env, so left unset: ${missing[*]}"; fi
if [ "$APPLY" = 1 ]; then echo "Done. Deploy with: apps/api/scripts/deploy-dev.sh"; else echo "Dry run only. Re-run with --apply."; fi
