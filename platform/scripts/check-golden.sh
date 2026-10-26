#!/usr/bin/env bash
# Regenerates the golden fixtures from a Learning-routes checkout and fails if any
# copied file differs from the fresh run. Needs that checkout's Ruby, its gems and
# its development database: see packages/core/test/golden/README.md.
#
#   scripts/check-golden.sh ../Learning-routes
set -euo pipefail

v1="${1:?usage: scripts/check-golden.sh <path to Learning-routes>}"
golden="$(cd "$(dirname "$0")/.." && pwd)/packages/core/test/golden"
fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT

(cd "$v1" && OUT="$fresh" bin/rails characterize:all >/dev/null)
diff -r -x README.md -x DIVERGENCES.md "$golden" "$fresh"
echo "golden fixtures match a fresh run"
