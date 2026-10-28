#!/usr/bin/env bash
# Regenerates the golden fixtures from a Learning-routes checkout and fails if v1's
# output differs from what the fixtures were recorded from. The fixtures carry the
# ADR 0003 fixes, so the comparison is against the v1 digests pinned in
# packages/core/test/golden/divergences.json; the core test suite proves the
# fixtures are those v1 files plus the listed changes. Needs that checkout's Ruby,
# its gems and its development database: see packages/core/test/golden/README.md.
#
#   pnpm golden:check                      (the Rails app around platform/)
#   scripts/check-golden.sh <path to Learning-routes>
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
v1="${1:-$root/..}"
if [ ! -x "$v1/bin/rails" ]; then
  echo "golden:check needs a Learning-routes checkout with its database, and found none at $v1." >&2
  echo "Run it from platform/ inside Learning-routes, or run scripts/check-golden.sh <a Learning-routes path>." >&2
  exit 2
fi

golden="$root/packages/core/test/golden"
fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT

(cd "$v1" && OUT="$fresh" bin/rails characterize:all >/dev/null)

node - "$golden/divergences.json" "$fresh" <<'JS'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const [manifest, fresh] = process.argv.slice(2);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const pinned = JSON.parse(fs.readFileSync(manifest, "utf8")).v1;
let failed = false;
for (const [file, digest] of Object.entries(pinned)) {
  const text = fs.readFileSync(path.join(fresh, file), "utf8");
  const actual = crypto.createHash("sha256").update(canonical(JSON.parse(text))).digest("hex");
  if (actual !== digest) {
    console.error(`${file}: v1 now produces something else than the fixtures were recorded from`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("golden fixtures match a fresh v1 run");
JS
