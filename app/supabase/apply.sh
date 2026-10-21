#!/usr/bin/env bash
# =====================================================================
# apply.sh — apply NEWBIZZ database to the Supabase project.
#
# The migration chain is the only source of truth. This script applies, in
# filename order:
#
#   migrations/*.sql   the numbered chain, minus the sentinel *_smoke.sql
#                      tests (they end in `raise exception 'SMOKE_OK'` on
#                      purpose, so they cannot be applied — run them with
#                      psql, where a P0001 SMOKE_OK is a PASS)
#   seed/*.sql         reference data, interleaved at the three points the
#                      chain depends on it (see seed_after() below)
#   tests/0960, 0965   the two identity-free checks: tenant isolation and
#                      the opening-stock gate. They create their own
#                      principals and roll back.
#
# It used to send the consolidated apply_all.sql, a snapshot frozen at 0009
# that built a schema years behind the chain. That file is gone and cannot be
# regenerated: 0039 adds the enum values 'fulfilled' / 'partially_fulfilled'
# and 0060 uses them, and Postgres refuses to use an enum value added in the
# same transaction. One file per transaction is therefore the only order that
# works — which is what this script does, and why a single-request bootstrap
# could never work past 0060.
#
# Usage:
#   SUPABASE_PROJECT_REF=xxx SUPABASE_ACCESS_TOKEN=yyy bash apply.sh
#   bash apply.sh --dry-run           # show the ordered plan, apply nothing
#   bash apply.sh --from 0128 --to 0135  # incremental deploy of a range
#   bash apply.sh --list              # bare paths, one per line (replay.sh)
#
# `bash` rather than `./`: the repo stores this file as 100644, so a fresh
# clone has no exec bit (the mode is not tracked from a Windows checkout).
#
# The personal-access token needs access to the project; it is intentionally
# never stored in this repository.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="${HERE}/migrations"
SEED_DIR="${HERE}/seed"
TESTS_DIR="${HERE}/tests"

MODE="apply"
FROM_VER=""
TO_VER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE="dry" ;;
    --list)    MODE="list" ;;   # bare paths, for replay.sh
    --from)    FROM_VER="${2:?--from needs a version, e.g. 0128}"; shift ;;
    --to)      TO_VER="${2:?--to needs a version, e.g. 0135}"; shift ;;
    -h|--help) awk 'NR>1 && /^# =+$/ {next} NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)         echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# The migration files are historical records, not a self-contained bootstrap:
# 0019 calls set_cost_account_class('5110', …), which needs the chart of
# accounts, and 0007 onwards inserts item rows. Production was built with the
# seed interleaved, so the chain below is schema → seed at these points.
# Appending the seed at the end instead fails at 0019 and cannot work afterwards
# either (0057 moves customers.kind, so the seed is not re-runnable).
seed_after() {
  case "$1" in
    0001_foundation.sql)      printf '%s\n' "${SEED_DIR}/0100_seed_foundation.sql" ;;
    0002_accounting_core.sql) printf '%s\n' "${SEED_DIR}/0110_seed_chart_of_accounts.sql" ;;
    0006_customers.sql)       printf '%s\n' "${SEED_DIR}/0120_seed_catalog.sql" ;;
  esac
}

# The ordered chain: migrations in C-locale filename order (0110_… before
# 0110b_…), each followed by its seed hook.
chain_files() {
  local f n
  for f in "${MIG_DIR}"/*.sql; do
    [ -e "$f" ] || continue
    n="${f##*/}"                 # no $(basename): a subshell per file costs
    case "$n" in                 # ~200ms each under Git Bash on Windows
      *_smoke.sql) continue ;;
    esac
    printf '%s\n' "$f"
  done | LC_ALL=C sort | while IFS= read -r f; do
    printf '%s\n' "$f"
    seed_after "${f##*/}"
  done
}

# Materialise the chain once. A consumer that exits early (`grep -q`, `head`)
# closes the pipe, and under `pipefail` the producer's SIGPIPE would then be
# reported as a failure — so nothing downstream streams straight into one.
CHAIN=()
while IFS= read -r f; do CHAIN+=("$f"); done < <(chain_files)

if [ "${#CHAIN[@]}" -eq 0 ]; then
  echo "✗ no migrations found under ${MIG_DIR}" >&2
  exit 1
fi
for f in "${CHAIN[@]}"; do
  if [ ! -f "$f" ]; then
    echo "✗ chain references a missing file: ${f#"${HERE}/"}" >&2
    exit 1
  fi
done

# Optional range for incremental deploys: --from 0128 --to 0135 applies just
# those migration files. Seeds are excluded — all of them sit before 0100.
if [ -n "$FROM_VER$TO_VER" ]; then
  RANGED=()
  for f in "${CHAIN[@]}"; do
    case "$f" in "${MIG_DIR}"/*) ;; *) continue ;; esac
    n="${f##*/}"; v="${n%%_*}"
    if [ -n "$FROM_VER" ] && [ "$v" \< "$FROM_VER" ]; then continue; fi
    if [ -n "$TO_VER" ]   && [ "$v" \> "$TO_VER" ];   then continue; fi
    RANGED+=("$f")
  done
  if [ "${#RANGED[@]}" -eq 0 ]; then
    echo "✗ no migrations between ${FROM_VER:-start} and ${TO_VER:-end}" >&2
    exit 1
  fi
  CHAIN=("${RANGED[@]}")
fi

if [ "${MODE}" = "list" ]; then
  printf '%s\n' "${CHAIN[@]}"
  exit 0
fi

if [ "${MODE}" = "dry" ]; then
  echo "NEWBIZZ chain (${MIG_DIR} + ${SEED_DIR})${FROM_VER:+ from $FROM_VER}${TO_VER:+ to $TO_VER}, in order:"
  for f in "${CHAIN[@]}"; do printf '  %s\n' "${f#"${HERE}/"}"; done
  if [ -n "$FROM_VER$TO_VER" ]; then
    echo "── ${#CHAIN[@]} files (range mode: tests/0960+0965 skipped)."
  else
    echo "── ${#CHAIN[@]} files, then tests/0960 and tests/0965."
  fi
  exit 0
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"
TOKEN="${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

run_sql_file() {
  local label="$1" file="$2"
  echo "── applying: ${label}"
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
for f in "${CHAIN[@]}"; do
  run_sql_file "${f#"${HERE}/"}" "$f"
done

# A ranged deploy is incremental on a database that already has data; the two
# checks below assume an empty users table (the first auth user becomes the
# bootstrap admin), so they would report failure on a live project.
if [ -n "$FROM_VER$TO_VER" ]; then
  echo "── done. ${#CHAIN[@]} migrations applied (range mode: tests/0960+0965 skipped — they need a fresh database)."
  exit 0
fi

# The 0900-0950 smokes exercise permission-gated RPCs, so they need a signed-in
# admin principal (`request.jwt.claims` with a `sub`); the Management API runs
# as the project owner with no JWT, and has_permission() returns false for an
# identity-less caller, so those calls can only ever be refused here. The two
# below provision their own principals and assert the security surface.
run_sql_file "tests/0960_rls_tenant_isolation.sql"      "${TESTS_DIR}/0960_rls_tenant_isolation.sql"
run_sql_file "tests/0965_opening_stock_authorization.sql" "${TESTS_DIR}/0965_opening_stock_authorization.sql"
echo "── done. Schema + seed applied; tenant isolation and the opening-stock gate verified (both roll back)."
echo "   Signed-in smoke tests (0900-0950) need an admin JWT: run them in staging against a real user."
