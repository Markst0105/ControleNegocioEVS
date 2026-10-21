#!/usr/bin/env bash
# Fails when the GitHub repository is publicly readable while the business seed
# is tracked. The seed contains client names, sales, installments and expense
# history, so a public repository publishes real business data.
#
#   npm run repo:visibility
#
# Set GITHUB_REPO to check a different repository (owner/name).
set -euo pipefail

repo="${GITHUB_REPO:-Markst0105/ControleNegocioEVS}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is not installed; skipping the visibility check." >&2
  exit 0
fi

tracked="$(git ls-files -- 'supabase/seed.sql' 'supabase/seeds/*' | wc -l | tr -d ' ')"
if [ "$tracked" -eq 0 ]; then
  echo "No seed files are tracked. Nothing to expose."
  exit 0
fi

code="$(curl -s -o /dev/null -w '%{http_code}' -H 'User-Agent: bioavalia-check' \
  "https://api.github.com/repos/${repo}")"

if [ "$code" = "200" ]; then
  echo "REPOSITORY ${repo} IS PUBLIC and ${tracked} seed file(s) are tracked." >&2
  echo "The seed contains client names, sales, installments and expenses." >&2
  echo "Fix: GitHub → Settings → General → Danger Zone → Change visibility → Private." >&2
  echo "Then re-run this check." >&2
  exit 1
fi

echo "Repository ${repo} is not publicly readable (HTTP ${code})."
