#!/usr/bin/env bash
# Opens an AI session in AI_SESSIONS.md: appends a START entry, sets ACTIVE STATE to IN_PROGRESS,
# and adds (or extends) the TASK QUEUE item. Resumes automatically if the previous session was cut off.
#
# Usage: scripts/ai/ai_start.sh <agent> "<prompt>" [model] [plan]
#   agent: claude | codex | zcode | zai | other
#   AI_FORCE=1 takes over a session another agent updated less than 10 minutes ago (ask the user first).
source "$(dirname "$0")/_ledger_lib.sh"

[ $# -ge 2 ] || { echo 'Usage: ai_start.sh <agent> "<prompt>" [model] [plan]' >&2; exit 64; }
agent="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
prompt="$(one_line "$2")"
model="$(one_line "${3:-unknown}")"
plan="$(one_line "${4:-see CHECKPOINTS}")"

status="$(get_field "Status")"
prev_id="$(get_field "Current session ID")"

if [ "$status" = "IN_PROGRESS" ]; then
  age="$(minutes_since "$(get_field "Last updated (UTC)")")"
  if [ -n "$age" ] && [ "$age" -lt "$TAKEOVER_GUARD_MINUTES" ] && [ "${AI_FORCE:-0}" != "1" ]; then
    echo "STOP: $prev_id ($(get_field "Current agent")) is IN_PROGRESS and was updated $age min ago." >&2
    echo "Ask the user before taking over; re-run with AI_FORCE=1 to proceed." >&2
    exit 2
  fi
  status="INTERRUPTED"
fi

resumed="none"
[ "$status" = "INTERRUPTED" ] && resumed="$prev_id"

id="SESSION-$(utc_stamp)-$agent"
now="$(utc_now)"

append_to_section "SESSION LOG" "
### [$id] START
- Agent: $agent
- Model: $model
- Started (UTC): $now
- User prompt: $prompt
- Resumed from: $resumed
- Plan: $plan
#### CHECKPOINTS"

set_field "Status" "IN_PROGRESS"
set_field "Current session ID" "$id"
set_field "Current agent" "$agent"
set_field "Last updated (UTC)" "$now"

if [ "$resumed" = "none" ]; then
  set_field "Current task / user prompt" "$prompt"
  set_field "Last completed step" "none"
  set_field "NEXT step" "Plan and begin the task above"
  set_field "Files touched so far" "none"
  set_field "Uncommitted / half-finished work" "none"
  set_field "Blockers / decisions pending" "none"
  append_to_section "TASK QUEUE" "- [ ] $prompt | sessions: \`$id\`"
else
  edit_queue_line "$resumed" append ", \`$id\`" \
    || append_to_section "TASK QUEUE" "- [ ] $(get_field "Current task / user prompt") | sessions: \`$id\`"
  echo "Resuming from $resumed. NEXT step: $(get_field "NEXT step")"
fi

echo "$id"
