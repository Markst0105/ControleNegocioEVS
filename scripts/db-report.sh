#!/usr/bin/env bash
# Runs the read-only pre-cutover report against the database.
#
#   DATABASE_URL="postgresql://..." npm run db:report
#
# The report runs inside a read-only transaction, so it cannot change data.
# Save the output with the cutover record:
#
#   DATABASE_URL="postgresql://..." npm run db:report > cutover-report.log
set -euo pipefail

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

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$root/supabase/ops/pre_cutover_checks.sql"
