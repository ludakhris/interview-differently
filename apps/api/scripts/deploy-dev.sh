#!/usr/bin/env bash
# Deploys the current working tree of apps/api to the shared dev API (Railway `dev`, service `api-dev`).
#
#   apps/api/scripts/deploy-dev.sh
#
# It uploads a clean copy rather than the folder itself, for two reasons: the Railway CLI applies the repo's
# .gitignore too loosely (the rule for the local `apps/api/storage/` upload folder also hid `src/storage`), and
# turning ignore handling off would upload your .env files. The copy leaves out node_modules, build output, every
# .env file and the local storage folder, and includes uncommitted changes, so you test exactly what you have.
#
# It refuses to run unless `railway status` shows the interview-differently project (by id) and environment dev:
# `railway up` from an unlinked folder creates a new Railway project, and a folder linked to production would deploy
# there. The project id is not a secret; it is useless without a Railway login or token.
set -euo pipefail
cd "$(dirname "$0")/../../.."

PROJECT_ID=31736977-0627-4dcf-88de-5c09f7b41e79 # interview-differently, checked by id (survives a rename)
STATUS="$(railway status 2>&1 || true)"
LINKED_PROJECT="$(awk '/^Project ID:/ { print $3 }' <<<"$STATUS")"
LINKED_ENV="$(awk '/^Environment:/ { print $2 }' <<<"$STATUS")"
if [[ "$LINKED_PROJECT" != "$PROJECT_ID" || "$LINKED_ENV" != dev ]]; then
  echo "This folder ($PWD) is not linked to Interview Differently's Railway project, environment dev. Stopping." >&2
  echo "railway status says:" >&2
  sed 's/^/  /' <<<"$STATUS" >&2
  echo "Link it with: railway link -p $PROJECT_ID -e dev" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a \
  --exclude 'node_modules/' --exclude 'dist/' --exclude '.env' --exclude '.env.*' \
  --exclude '/storage/' --exclude '/generated/' \
  apps/api/ "$TMP/api/"

echo "Uploading $(du -sh "$TMP/api" | cut -f1) to api-dev (dev)..."
railway up "$TMP/api" --path-as-root -p "$PROJECT_ID" -e dev -s api-dev -c
