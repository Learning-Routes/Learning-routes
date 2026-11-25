#!/usr/bin/env bash
# The owner's rule, for what a change adds to files: no file credits or names the tool that
# wrote it. A product may still name a client it supports, so this looks for credits and
# tool-specific markup, not for the names alone. STEP briefs quote assistants' names as prose.
set -euo pipefail

base="$1"
head="$2"
tools='claude|chatgpt|gpt-?[0-9]|openai|copilot|cursor|gemini|codex|anthropic|windsurf|devin'
credit="(generated|written|created|built|authored|made|drafted|assisted|powered)[ -]+(with|by|using)[ -]+(an? )?(ai|${tools})([^a-z]|$)"
markup='(claude|chatgpt|openai|anthropic|copilot):[a-z]+-[a-z-]+|noreply@anthropic|<meta[^>]+name="(claude|chatgpt|openai|anthropic|copilot)|^.?co-authored-by:'

found=$(git diff -U0 --no-renames --diff-filter=ACM "$base...$head" -- . \
  ':!.github/scripts/check-attribution.sh' ':!platform/docs/steps/' ':!*.lock' ':!*lock.yaml' \
  | awk '/^\+\+\+ b\//{file=substr($0,7);next} /^\+/{print file": "substr($0,2)}' \
  | grep -iE "${credit}|${markup}" || true)
if [ -n "$found" ]; then
  echo "::error::Added lines credit or name the tool that wrote them:"
  printf '%s\n' "$found" | cut -c1-200
  exit 1
fi
