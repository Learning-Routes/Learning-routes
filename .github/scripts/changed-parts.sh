#!/usr/bin/env bash
# Reads changed paths on stdin, one per line, and prints which parts of the
# repository CI must check: rails=true|false and platform=true|false. With no
# paths (an unknown range), both run.
set -euo pipefail

rails=false
platform=false
seen=false
while IFS= read -r path; do
  [ -z "$path" ] && continue
  seen=true
  case "$path" in
    .github/scripts/changed-parts.sh) rails=true; platform=true ;;
    platform/* | .github/workflows/platform.yml) platform=true ;;
    *) rails=true ;;
  esac
done

if [ "$seen" = false ]; then
  rails=true
  platform=true
fi
echo "rails=$rails"
echo "platform=$platform"
