#!/usr/bin/env bash
# =====================================================================
# apply.sh — apply NEWBIZZ database to the Supabase project.
# Runs the consolidated apply_all.sql, then the smoke test, via the
# Supabase Management API (no psql / no local Postgres required).
#
# Usage:
#   ./apply.sh                       # uses the values baked in below
#   SUPABASE_PROJECT_REF=xxx SUPABASE_ACCESS_TOKEN=yyy ./apply.sh
#
# The account/personal-access token needs access to the project.
# =====================================================================
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-wmpxwpubfxpexybqnynz}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-sbp_c3d2b1f6ee41d5c5d3e7ef223f557f1d86947394}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_sql_file() {
  local label="$1" file="$2"
  echo "── applying: ${label} (${file})"
  # Send the file contents as a JSON string via jq (handles quoting/newlines).
  local body
  body="$(jq -Rs '{query: .}' < "$file")"
  local resp http
  resp="$(curl -sS -w $'\n%{http_code}' -X POST "$API" \
            -H "Authorization: Bearer ${TOKEN}" \
            -H "Content-Type: application/json" \
            --data-binary "$body")"
  http="$(printf '%s' "$resp" | tail -n1)"
  body="$(printf '%s' "$resp" | sed '$d')"
  if [[ "$http" =~ ^2 ]]; then
    echo "   ✓ ${label} OK (HTTP ${http})"
  else
    echo "   ✗ ${label} FAILED (HTTP ${http})"
    echo "$body" | jq . 2>/dev/null || echo "$body"
    exit 1
  fi
}

echo "NEWBIZZ → Supabase project ${PROJECT_REF}"
run_sql_file "schema + seed"          "${HERE}/apply_all.sql"
run_sql_file "smoke: post_journal"    "${HERE}/tests/0900_smoke_post_journal.sql"
run_sql_file "smoke: sales cycle"     "${HERE}/tests/0910_smoke_sales_cycle.sql"
echo "── done. Database is set up and both smoke tests passed (they roll themselves back)."
