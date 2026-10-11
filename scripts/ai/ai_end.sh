#!/usr/bin/env bash
# Closes the active session: appends the END entry, updates ACTIVE STATE and TASK QUEUE.
#
# Usage: scripts/ai/ai_end.sh <reason> "<summary>" "<remaining>" [notes]
#   reason: COMPLETED | LIMIT_REACHED | ERROR | USER_STOPPED | HANDOFF
#   COMPLETED sets Status = DONE; any other reason sets Status = INTERRUPTED so the next agent resumes.
source "$(dirname "$0")/_ledger_lib.sh"

[ $# -ge 3 ] || { echo 'Usage: ai_end.sh <reason> "<summary>" "<remaining>" [notes]' >&2; exit 64; }
reason="$1"
case "$reason" in
  COMPLETED|LIMIT_REACHED|ERROR|USER_STOPPED|HANDOFF) ;;
  *) echo "Invalid reason '$reason'. Use COMPLETED | LIMIT_REACHED | ERROR | USER_STOPPED | HANDOFF" >&2; exit 64 ;;
esac
summary="$(one_line "$2")"
remaining="$(one_line "$3")"
notes="$(one_line "${4:-none}")"

[ "$(get_field "Status")" = "IN_PROGRESS" ] \
  || { echo "No IN_PROGRESS session to end." >&2; exit 1; }

id="$(get_field "Current session ID")"
now="$(utc_now)"
files="$(merge_list "$(get_field "Files touched so far")" "$(git_changes)")"

append_to_section "SESSION LOG" "### END
- Ended (UTC): $now
- End reason: $reason
- Summary of work done: $summary
- Files created/modified/deleted: $files
- Remaining work (exact): $remaining
- Notes for the next agent: $notes"

if [ "$reason" = "COMPLETED" ]; then
  set_field "Status" "DONE"
  set_field "NEXT step" "none (awaiting next user prompt)"
  set_field "Uncommitted / half-finished work" "none"
  edit_queue_line "$id" done || echo "Note: no TASK QUEUE item references $id; mark it manually." >&2
else
  set_field "Status" "INTERRUPTED"
  set_field "NEXT step" "$remaining"
fi
set_field "Last updated (UTC)" "$(utc_now)"

sessions="$(count_log_sessions)"
if [ "$sessions" -gt "$MAX_LOG_SESSIONS" ]; then
  echo "SESSION LOG has $sessions sessions (> $MAX_LOG_SESSIONS): condense the oldest into ## ARCHIVE." >&2
fi

echo "Ended $id ($reason)"
