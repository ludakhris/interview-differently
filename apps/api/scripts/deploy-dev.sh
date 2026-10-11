#!/usr/bin/env bash
# Deploys the current working tree of apps/api to the shared dev API (Railway `dev`, service `api-dev`).
#
#   apps/api/scripts/deploy-dev.sh
#
# It uploads a clean copy rather than the folder itself, for two reasons: the Railway CLI applies the repo's
# .gitignore too loosely (the rule for the local `apps/api/storage/` upload folder also hid `src/storage`), and
# turning ignore handling off would upload your .env files. The copy leaves out node_modules, build output, every
# .env file and the local storage folder, and includes uncommitted changes, so you test exactly what you have.
set -euo pipefail
cd "$(dirname "$0")/../../.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a \
  --exclude 'node_modules/' --exclude 'dist/' --exclude '.env' --exclude '.env.*' \
  --exclude '/storage/' --exclude '/generated/' \
  apps/api/ "$TMP/api/"

echo "Uploading $(du -sh "$TMP/api" | cut -f1) to api-dev (dev)..."
railway up "$TMP/api" --path-as-root -e dev -s api-dev -c
