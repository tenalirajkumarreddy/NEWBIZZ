#!/usr/bin/env bash
# =====================================================================
# function_drift.sh — compare the public functions of two databases.
#
#   bash function_drift.sh <url-a> <url-b>
#
# Prints only the functions that differ and exits 1 when any do, so it
# can gate CI or a deploy. Exit 0 means both databases expose the same
# signatures, the same security attributes and the same function bodies
# once formatting is normalised.
#
# One side is normally the live project and the other a database built
# from this repository (`replay.sh`), which is the check that would have
# caught production running code the repo cannot reproduce.
#
# Needs psql on PATH. Read-only: function_manifest.sql is all SELECTs.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${HERE}/function_manifest.sql"

if [ "$#" -ne 2 ]; then
  echo "usage: bash $0 <database-url-a> <database-url-b>" >&2
  echo "       compare a repo rebuild against the live project:" >&2
  echo "       bash $0 \"\$DATABASE_URL\" \"\$PRODUCTION_DATABASE_URL\"" >&2
  exit 2
fi

command -v psql >/dev/null || { echo "✗ psql not found on PATH" >&2; exit 2; }
[ -f "$MANIFEST" ] || { echo "✗ missing $MANIFEST" >&2; exit 2; }

A="$1"
B="$2"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

dump() {   # dump <url> <out>
  psql -X -tA -v ON_ERROR_STOP=1 -d "$1" -f "$MANIFEST" | LC_ALL=C sort > "$2"
}

echo "── a: $(psql -X -tA -d "$A" -c 'select current_database()')"
echo "── b: $(psql -X -tA -d "$B" -c 'select current_database()')"

dump "$A" "${TMP}/a.txt"
dump "$B" "${TMP}/b.txt"

A_ONLY="$(LC_ALL=C comm -23 "${TMP}/a.txt" "${TMP}/b.txt" | wc -l | tr -d ' ')"
B_ONLY="$(LC_ALL=C comm -13 "${TMP}/a.txt" "${TMP}/b.txt" | wc -l | tr -d ' ')"

echo "   a: $(wc -l < "${TMP}/a.txt" | tr -d ' ') functions, b: $(wc -l < "${TMP}/b.txt" | tr -d ' ') functions"

if [ "$A_ONLY" = "0" ] && [ "$B_ONLY" = "0" ]; then
  echo "   ✓ identical — same signatures, security attributes and bodies"
  exit 0
fi

echo "   ✗ $A_ONLY function(s) differ or are missing only in a; $B_ONLY only in b"
LC_ALL=C comm -3 "${TMP}/a.txt" "${TMP}/b.txt" | sed 's/^/     /' | head -60
if [ $((A_ONLY + B_ONLY)) -gt 60 ]; then
  echo "     … truncated; $((A_ONLY + B_ONLY)) differences in total"
fi
exit 1
