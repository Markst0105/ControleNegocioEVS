#!/usr/bin/env bash
# Verifies that no sensitive business files (seeds, spreadsheets, env files,
# scanner tokens or raw session dumps) are tracked in the working tree or in Git
# history, so the repository is safe even when publicly readable on GitHub.
#
#   npm run repo:visibility
set -euo pipefail

tracked="$(git ls-files -- \
  'supabase/seed.sql' \
  'supabase/seeds/*' \
  '*.xlsx' '*.xls' '*.xlsm' \
  '.env' '.env.local' '.env.production.local' \
  'sonarqube_scan.txt' 'sonarquebe_scan.txt' \
  'docs/session-*.md')"

if [ -n "$tracked" ]; then
  echo "SENSITIVE FILE(S) ARE TRACKED IN GIT:" >&2
  echo "$tracked" >&2
  echo "Remove them with 'git rm --cached <file>' and keep them in .gitignore." >&2
  exit 1
fi

history_hits="$(git log HEAD --full-history --oneline -- \
  'supabase/seed.sql' \
  'supabase/seeds/*' \
  '*.xlsx' '*.xls' '*.xlsm' \
  '.env' '.env.local' '.env.production.local' \
  'sonarqube_scan.txt' 'sonarquebe_scan.txt' | head -n 5)"

if [ -n "$history_hits" ]; then
  echo "SENSITIVE FILE(S) FOUND IN GIT HISTORY:" >&2
  echo "$history_hits" >&2
  echo "Purge them from history before pushing to a public repository." >&2
  exit 1
fi

echo "No sensitive seed, spreadsheet or secret files are tracked in Git or history."
