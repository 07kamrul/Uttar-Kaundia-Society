#!/usr/bin/env bash
# Records a CHECKPOINT for the active session and refreshes ACTIVE STATE.
#
# Usage: scripts/ai/ai_checkpoint.sh "<step done>" "<next step>" [files] [uncommitted]
#   files:       comma list of changed files (default: paths from `git status --porcelain`)
#   uncommitted: description of half-finished work (default: leave ACTIVE STATE value unchanged)
source "$(dirname "$0")/_ledger_lib.sh"

[ $# -ge 2 ] || { echo 'Usage: ai_checkpoint.sh "<step>" "<next>" [files] [uncommitted]' >&2; exit 64; }
step="$(one_line "$1")"
next="$(one_line "$2")"
files="$(one_line "${3:-$(git_changes)}")"
[ -n "$files" ] || files="none"

[ "$(get_field "Status")" = "IN_PROGRESS" ] \
  || { echo "No IN_PROGRESS session. Run ai_start.sh first." >&2; exit 1; }

append_to_section "SESSION LOG" "- [$(utc_hm)] $step -> $files -> $next"

set_field "Last completed step" "$step"
set_field "NEXT step" "$next"
set_field "Files touched so far" "$(merge_list "$(get_field "Files touched so far")" "$files")"
[ -n "${4:-}" ] && set_field "Uncommitted / half-finished work" "$4"
set_field "Last updated (UTC)" "$(utc_now)"

echo "Checkpoint saved for $(get_field "Current session ID")"
