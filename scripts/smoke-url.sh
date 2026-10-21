#!/usr/bin/env bash
# Post-deploy smoke test for the public surface of the app.
#
#   bash scripts/smoke-url.sh https://controle.vercel.app
#
# Optional environment:
#   VERCEL_BYPASS_TOKEN  bypass token for Vercel Deployment Protection
#
# Checks the login page, the public health endpoint and the session gate.
# The role-specific screens (admin/operator/member) are verified by hand in
# the cutover runbook, section A9.
set -uo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  echo "usage: scripts/smoke-url.sh <base-url>" >&2
  exit 2
fi
base="${base%/}"

headers=()
if [ -n "${VERCEL_BYPASS_TOKEN:-}" ]; then
  headers=(-H "x-vercel-protection-bypass: ${VERCEL_BYPASS_TOKEN}")
fi

failures=0
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

pass() {
  echo "PASS  $1"
}

fail() {
  echo "FAIL  $1 — $2" >&2
  failures=$((failures + 1))
}

status_of() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${headers[@]}" "$1"
}

# --- login page -------------------------------------------------------------
code="$(status_of "${base}/login")"
if [ "$code" != "200" ]; then
  fail "/login returns 200" "got ${code}"
else
  curl -s --max-time 20 "${headers[@]}" "${base}/login" -o "$body_file"
  if grep -q 'name="email"' "$body_file" && grep -q "Entrar" "$body_file"; then
    pass "/login renders the sign-in form"
  else
    fail "/login renders the sign-in form" "form markers not found"
  fi
fi

# --- health -----------------------------------------------------------------
code="$(status_of "${base}/api/health")"
if [ "$code" != "200" ]; then
  fail "/api/health returns 200" "got ${code}"
else
  curl -s --max-time 20 "${headers[@]}" "${base}/api/health" -o "$body_file"
  if grep -q '"status":"ok"' "$body_file"; then
    pass "/api/health reports the database and schema are ready"
  else
    fail "/api/health reports ok" "$(tr -d '\n' <"$body_file" | cut -c1-200)"
  fi
fi

# --- session gate -----------------------------------------------------------
for path in /painel /vendas /membro /reservas; do
  read -r code location <<<"$(
    curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 \
      "${headers[@]}" "${base}${path}"
  )"
  case "$code" in
    30[0-9])
      if [[ "$location" == *"/login"* ]]; then
        pass "${path} redirects anonymous users to /login"
      else
        fail "${path} redirects to /login" "redirected to ${location}"
      fi
      ;;
    *)
      fail "${path} redirects to /login" "got ${code}"
      ;;
  esac
done

echo
if [ "$failures" -ne 0 ]; then
  echo "Smoke test: ${failures} failure(s)." >&2
  exit 1
fi

echo "Smoke test: all checks passed."
