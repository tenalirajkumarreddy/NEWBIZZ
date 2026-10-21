#!/usr/bin/env bash
# =====================================================================
# replay.sh — build the database from the repository and run every test.
#
# Same order as apply.sh (the migration chain with the seed interleaved, one
# file per transaction), but against a database you can throw away:
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/replay bash replay.sh
#
# Needs psql on PATH and a role allowed to create roles and schemas (it installs
# the Supabase api roles and a stub auth/storage). CI runs it against a
# postgres:17 service container; locally any scratch cluster works.
#
# Deliberate differences from a real Supabase project:
#   * pg_cron / pg_net are platform extensions. Their `create extension` lines
#     are stripped and their entry points stubbed by tests/_bootstrap.sql.
#   * pgcrypto's `create extension` line is stripped when the server has no
#     contrib (a stock local build). gen_random_uuid() is core since PG13.
#
# Exit status is non-zero if any file or test fails, so it can gate CI.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="${DATABASE_URL:-}"
if [ -z "$URL" ]; then
  echo "✗ set DATABASE_URL to a disposable database, e.g." >&2
  echo "    DATABASE_URL=postgres://postgres:postgres@localhost:5432/replay bash $0" >&2
  exit 2
fi
command -v psql >/dev/null || { echo "✗ psql not found on PATH" >&2; exit 2; }

# Strip the platform extension DDL. pgcrypto only when the server lacks it, so
# CI (which has contrib) still runs the same statements as production.
HAVE_PGCRYPTO="$(psql -X -tA -d "$URL" -c \
  "select coalesce((select 1 from pg_available_extensions where name='pgcrypto'), 0)")"
if [ "$HAVE_PGCRYPTO" = "1" ]; then
  EXT_RE='(pg_cron|pg_net)'
else
  EXT_RE='(pgcrypto|pg_cron|pg_net)'
fi

stage() {       # stage <file> <out> → copy with platform extension DDL stripped
  awk -v re="$EXT_RE" '
    tolower($0) ~ ("create extension if not exists " re) {
      print "-- [replay] extension statement omitted"; next
    }
    { print }
  ' "$1" > "$2"
}

# run_psql <file> [claims] → sets OUT and RC. Runs the file exactly once.
run_psql() {
  local file="$1" claims="${2:-}"
  local tmp rc=0
  tmp="$(mktemp)"
  stage "$file" "$tmp"
  if [ -n "$claims" ]; then
    OUT="$( { printf '%s\n' "$claims"; cat "$tmp"; } \
            | psql -X -q -v ON_ERROR_STOP=1 -d "$URL" 2>&1 )" || rc=$?
  else
    OUT="$(psql -X -q -v ON_ERROR_STOP=1 -d "$URL" -f "$tmp" 2>&1)" || rc=$?
  fi
  rm -f "$tmp"
  RC=$rc
}

echo "── rebuilding $(psql -X -tA -d "$URL" -c 'select current_database()')"
psql -X -q -v ON_ERROR_STOP=1 -d "$URL" >/dev/null <<'SQL'
set client_min_messages = warning;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
drop schema if exists cron cascade;
drop schema if exists net cascade;
create schema public;
SQL

echo "── platform stubs"
run_psql "${HERE}/tests/_bootstrap.sql"
if [ "$RC" -ne 0 ]; then
  echo "   ✗ tests/_bootstrap.sql (exit $RC)"
  printf '%s\n' "$OUT" | tail -5 | sed 's/^/     /'
  exit 1
fi
echo "   ✓ tests/_bootstrap.sql"

echo "── migration chain"
count=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  run_psql "$f"
  if [ "$RC" -ne 0 ]; then
    echo "   ✗ ${f#"${HERE}/"} (exit $RC)"
    printf '%s\n' "$OUT" | grep -E 'ERROR|DETAIL|HINT' | tail -4 | sed 's/^/     /'
    echo "✗ chain stopped at ${f#"${HERE}/"} — $count files applied" >&2
    exit 1
  fi
  count=$((count + 1))
  printf '.'
done < <(bash "${HERE}/apply.sh" --list)   # not exec-bit dependent
echo ""
echo "   ${count} files applied"

FAILED=0

# Identity-free first: 0960/0965 build their own fixtures from an empty users
# table (the first auth user is expected to become the admin).
echo "── tests (identity-free, as apply.sh runs them)"
run_test() {
  local file="$1" expect="$2"
  run_psql "${HERE}/tests/$file" "${3:-}"
  local ok=0
  case "$expect" in
    sentinel) grep -q 'SMOKE_OK' <<<"$OUT" && ok=1 ;;
    asserted) [ "$RC" -eq 0 ] && grep -q 'PASSED' <<<"$OUT" && ok=1 ;;
    clean)    [ "$RC" -eq 0 ] && ok=1 ;;
  esac
  if [ "$ok" -eq 1 ]; then
    echo "   ✓ $file"
  else
    FAILED=1
    echo "   ✗ $file (exit $RC)"
    grep -E 'ERROR|FAIL' <<<"$OUT" | tail -3 | sed 's/^/     /'
  fi
}

run_test 0960_rls_tenant_isolation.sql        asserted
run_test 0965_opening_stock_authorization.sql asserted

# The permission-gated smokes need a principal: the Management API has no JWT,
# and has_permission() denies an identity-less caller. A throwaway admin is
# created here and its sub injected as the claim.
ADMIN_ID="00000000-0000-0000-0000-00000000ad01"
echo "── admin principal for the signed-in smokes"
psql -X -q -v ON_ERROR_STOP=1 -d "$URL" >/dev/null <<SQL
insert into auth.users (id, phone, email, raw_user_meta_data)
values ('${ADMIN_ID}', '9999900001', 'replay@example.test', '{"full_name":"Replay Admin"}')
on conflict (id) do nothing;
update users set status = 'active' where id = '${ADMIN_ID}';
insert into user_roles (user_id, role_id)
select u.id, r.id from users u, roles r
 where u.id = '${ADMIN_ID}' and r.code = 'admin'
on conflict do nothing;
SQL

CLAIMS="set request.jwt.claims = '{\"sub\":\"${ADMIN_ID}\",\"role\":\"authenticated\"}';"

# expect: "clean" = exit 0; "sentinel" = reached its own SMOKE_OK raise;
#         "asserted" = exit 0 and printed its PASSED banner.
echo "── tests (admin JWT)"
run_test 0900_smoke_post_journal.sql              clean    "$CLAIMS"
run_test 0910_smoke_sales_cycle.sql               clean    "$CLAIMS"
run_test 0920_smoke_purchase_cycle.sql            sentinel "$CLAIMS"
run_test 0930_smoke_production_cycle.sql          sentinel "$CLAIMS"
run_test 0950_smoke_reconcile_payment_intents.sql sentinel "$CLAIMS"

if [ "$FAILED" -ne 0 ]; then
  echo "✗ replay finished with failures" >&2
  exit 1
fi
echo "── done. Chain and all seven tests passed against $URL"
