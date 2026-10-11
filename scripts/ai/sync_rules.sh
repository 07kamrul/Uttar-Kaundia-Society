#!/usr/bin/env bash
# Copies docs/AI_RULES.md into every AI tool's instruction file, between
# <!-- BEGIN:ai-rules --> / <!-- END:ai-rules --> markers. Content outside the markers is kept.
# Usage: scripts/ai/sync_rules.sh [--check]   (--check: exit 1 if any copy is stale, write nothing)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MASTER="$REPO_ROOT/docs/AI_RULES.md"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

# Instruction file read by each tool. CLAUDE.md is not listed: it imports AGENTS.md.
TARGETS=(
  "AGENTS.md"                          # Codex, OpenCode, generic agents
  ".zcode/RULES.md"                    # z.ai / ZCode
  ".github/copilot-instructions.md"    # GitHub Copilot
  ".cursor/rules/ai-rules.mdc"         # Cursor (fully generated)
  "GEMINI.md"                          # Gemini CLI
  ".windsurfrules"                     # Windsurf
  ".clinerules"                        # Cline
  "CONVENTIONS.md"                     # Aider (loaded via .aider.conf.yml)
)

[ -f "$MASTER" ] || { echo "Master rules not found: $MASTER" >&2; exit 1; }

render_block() {
  echo "<!-- BEGIN:ai-rules -->"
  echo "<!-- GENERATED from docs/AI_RULES.md by scripts/ai/sync_rules.sh. Do not edit here. -->"
  cat "$MASTER"
  echo "<!-- END:ai-rules -->"
}

# Prints the desired content of a target file to stdout.
render_target() {
  local rel="$1" path="$REPO_ROOT/$1" block
  block="$(render_block)"

  if [[ "$rel" == *.mdc ]]; then
    printf -- '---\ndescription: Mandatory project rules for every AI agent\nalwaysApply: true\n---\n\n%s\n' "$block"
    return
  fi

  if [ ! -f "$path" ] || ! grep -q '<!-- BEGIN:ai-rules -->' "$path"; then
    # Missing block: put it first, drop the legacy protocol block if present.
    printf '%s\n' "$block"
    [ -f "$path" ] || return 0
    local rest
    rest="$(awk '
      /<!-- BEGIN:ai-session-protocol -->/ { skip = 1; next }
      /<!-- END:ai-session-protocol -->/   { skip = 0; next }
      !skip' "$path" | sed '/./,$!d')"
    [ -n "$rest" ] && printf '\n%s\n' "$rest"
    return 0
  fi

  BLOCK="$block" awk '
    /<!-- BEGIN:ai-rules -->/ { print ENVIRON["BLOCK"]; skip = 1; next }
    /<!-- END:ai-rules -->/   { skip = 0; next }
    !skip' "$path"
}

stale=0
for rel in "${TARGETS[@]}"; do
  path="$REPO_ROOT/$rel"
  tmp="$(mktemp)"
  render_target "$rel" > "$tmp"
  if [ -f "$path" ] && cmp -s "$tmp" "$path"; then
    rm -f "$tmp"; continue
  fi
  stale=1
  if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "stale: $rel"; rm -f "$tmp"
  else
    mkdir -p "$(dirname "$path")"; mv "$tmp" "$path"; echo "synced: $rel"
  fi
done

if [ "$CHECK_ONLY" -eq 1 ] && [ "$stale" -eq 1 ]; then
  echo "AI rule copies are out of date. Run: scripts/ai/sync_rules.sh" >&2
  exit 1
fi
[ "$stale" -eq 0 ] && echo "All AI rule copies are up to date."
exit 0
