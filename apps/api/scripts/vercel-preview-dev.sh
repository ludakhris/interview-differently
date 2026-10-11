#!/usr/bin/env bash
# Points the PREVIEW deployments (every branch except main) of the Interview Differently web app at the shared dev API
# and the dev Clerk instance, instead of production. Production and Development scopes are left exactly as they are.
#
#   apps/api/scripts/vercel-preview-dev.sh            # show the plan, change nothing
#   apps/api/scripts/vercel-preview-dev.sh --apply    # do it
#
# Today VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY each have ONE value shared by Production, Preview and Development,
# so every preview talks to the production API with the live Clerk key. This takes "Preview" out of those two
# variables and adds Preview-only ones: the URL of the dev API (Railway `api-dev`) and the dev publishable key from
# apps/web/.env.local (a pk_test_ key; the script refuses anything else). The Learn Differently project already has
# its Preview API URL set. Needs `vercel` to be signed in as the project's owner.
set -euo pipefail
cd "$(dirname "$0")/../../.."

PROJECT=interview-differently-web
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

API_DOMAIN="$(railway domain list -s api-dev -e dev 2>/dev/null | grep -oE '[a-z0-9-]+\.up\.railway\.app' | head -1)"
[ -n "$API_DOMAIN" ] || { echo "No domain on api-dev. Run: railway domain -s api-dev -e dev" >&2; exit 1; }
get() { # value of NAME in a dotenv file, without quotes
  python3 - "$1" "$2" <<'PYGET'
import sys,re
name,path=sys.argv[1],sys.argv[2]
for line in open(path):
    m=re.match(r'^\s*'+re.escape(name)+r'\s*=\s*(.*)\s*$',line)
    if m:
        print(m.group(1).strip('"\''))
        break
PYGET
}
DEV_PK="$(get VITE_CLERK_PUBLISHABLE_KEY apps/web/.env.local || true)"
case "$DEV_PK" in pk_test_*) ;; *) echo "apps/web/.env.local has no pk_test_ publishable key. Stopping." >&2; exit 1 ;; esac

# This app builds its URLs as ${VITE_API_URL}/api/..., so the value is the API's root, with no /api on the end
# (the Learn Differently app is the other way round).
APPLY="$APPLY" PROJECT="$PROJECT" API_URL="https://$API_DOMAIN" DEV_PK="$DEV_PK" python3 - <<'PY'
import json, os, subprocess, sys, tempfile

project, apply = os.environ['PROJECT'], os.environ['APPLY'] == '1'
wanted = {'VITE_API_URL': os.environ['API_URL'], 'VITE_CLERK_PUBLISHABLE_KEY': os.environ['DEV_PK']}

def api(path, method='GET', body=None):
    cmd = ['vercel', 'api', path, '-X', method]
    tmp = None
    if body is not None:
        tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        json.dump(body, tmp); tmp.close()
        cmd += ['--input', tmp.name]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if tmp: os.unlink(tmp.name)
    text = out.stdout[out.stdout.find('{'):] if '{' in out.stdout else out.stdout
    if out.returncode != 0 or '"error"' in text[:200]:
        sys.exit(f'vercel api {method} {path} failed: {(out.stdout + out.stderr)[:300]}')
    return json.loads(text) if text.strip() else {}

envs = api(f'/v9/projects/{project}/env')['envs']
print(f'Project {project} ({"applying" if apply else "dry run"})')
for key, value in wanted.items():
    shared = [e for e in envs if e['key'] == key and 'preview' in (e.get('target') or [])]
    already = [e for e in shared if e.get('target') == ['preview']]
    if already:
        current = already[0].get('value')
        if already[0].get('type') == 'plain' and current != value:
            print(f'  {key}: the Preview-only value is out of date; updating it')
            if apply: api(f'/v9/projects/{project}/env/{already[0]["id"]}', 'PATCH', {'value': value})
        else:
            print(f'  {key}: already has the right Preview-only value; nothing to do')
        continue
    taken = []
    for e in shared:
        rest = [t for t in e['target'] if t != 'preview']
        if 'production' not in rest:
            sys.exit(f'{key}: Preview shares a value with something other than Production ({e["target"]}); not touching it.')
        print(f'  {key}: take Preview out of {e["target"]} (it stays on {rest})')
        if apply:
            api(f'/v9/projects/{project}/env/{e["id"]}', 'PATCH', {'target': rest})
            taken.append(e)
    print(f'  {key}: add a Preview-only value ({"the dev API URL" if key == "VITE_API_URL" else "the dev publishable key"})')
    if apply:
        try:
            api(f'/v10/projects/{project}/env', 'POST', {'key': key, 'value': value, 'type': 'plain', 'target': ['preview']})
        except SystemExit as err:
            for e in taken:  # put Preview back, so a failed run never leaves previews without the variable
                api(f'/v9/projects/{project}/env/{e["id"]}', 'PATCH', {'target': e['target']})
            sys.exit(f'{err} (Preview was put back as it was)')
print('Done. Redeploy a preview to pick it up.' if apply else 'Dry run only. Re-run with --apply.')
PY
