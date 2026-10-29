#!/usr/bin/env bash
# Runs the RLS smoke test against the production database and fails when a
# check fails or when the suite does not report the expected number of checks.
#
#   DATABASE_URL="postgresql://..." npm run db:rls
#
# The test wraps itself in a transaction and rolls back, so nothing is left
# behind in the database.
set -euo pipefail

expected=62

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  echo "Supabase → Project → Connect → Session pooler → URI." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed (postgresql-client)." >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mktemp)"
trap 'rm -f "$out"' EXIT

psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -t -A -F'|' \
  -f "$root/supabase/tests/rls_test.sql" >"$out"

passed="$(grep -c '|PASS$' "$out" || true)"
failed="$(grep -c '|FAIL$' "$out" || true)"
total=$((passed + failed))

cat "$out"
echo
echo "RLS: ${passed}/${total} PASS"

if [ "$failed" -ne 0 ]; then
  echo "RLS: ${failed} check(s) FAILED." >&2
  exit 1
fi

if [ "$total" -ne "$expected" ]; then
  echo "RLS: expected ${expected} checks, got ${total}." >&2
  exit 1
fi
