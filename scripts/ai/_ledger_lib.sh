#!/usr/bin/env bash
# Shared helpers for the AI session ledger scripts (ai_start / ai_checkpoint / ai_end).
# Sourced, not executed. Ledger path defaults to <repo>/AI_SESSIONS.md; override with AI_LEDGER.
set -euo pipefail

AI_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEDGER="${AI_LEDGER:-$AI_SCRIPT_DIR/../../AI_SESSIONS.md}"
[ -f "$LEDGER" ] || { echo "Ledger not found: $LEDGER" >&2; exit 1; }
REPO_ROOT="$(cd "$(dirname "$LEDGER")" && pwd)"

MAX_LOG_SESSIONS=10
TAKEOVER_GUARD_MINUTES=10

utc_now()   { date -u +"%Y-%m-%d %H:%M"; }
utc_stamp() { date -u +"%Y%m%d-%H%M"; }
utc_hm()    { date -u +"%H:%M"; }
one_line()  { printf '%s' "$1" | tr '\r\n' '  '; }

# Rewrites the ledger through an awk program; leaves the file untouched if awk fails.
_rewrite() {
  local tmp="$LEDGER.tmp.$$"
  if awk "$1" "$LEDGER" > "$tmp"; then mv "$tmp" "$LEDGER"; else rm -f "$tmp"; return 1; fi
}

# get_field "Status" -> value of the "- Status:" line inside ## ACTIVE STATE.
get_field() {
  FIELD="$1" awk '
    /^## / { in_state = ($0 ~ /^## ACTIVE STATE/) }
    in_state && index($0, "- " ENVIRON["FIELD"] ":") == 1 {
      v = substr($0, length(ENVIRON["FIELD"]) + 4); sub(/\r$/, "", v); gsub(/^ +| +$/, "", v); print v; exit
    }' "$LEDGER"
}

# set_field "Status" "IN_PROGRESS" -> rewrites that line inside ## ACTIVE STATE.
set_field() {
  FIELD="$1" VALUE="$(one_line "$2")" _rewrite '
    /^## / { in_state = ($0 ~ /^## ACTIVE STATE/) }
    in_state && index($0, "- " ENVIRON["FIELD"] ":") == 1 {
      cr = ($0 ~ /\r$/) ? "\r" : ""; print "- " ENVIRON["FIELD"] ": " ENVIRON["VALUE"] cr; hit = 1; next
    }
    { print }
    END { if (!hit) { print "Field not found in ACTIVE STATE: " ENVIRON["FIELD"] > "/dev/stderr"; exit 1 } }' \
    || { echo "set_field failed for: $1" >&2; exit 1; }
}

# append_to_section "SESSION LOG" "<multi-line block>" -> inserts the block at the end of that section.
append_to_section() {
  SECTION="$1" BLOCK="$2" _rewrite '
    function emit(  i) { for (i = 1; i <= n; i++) print lines[i] cr; done = 1 }
    BEGIN { n = split(ENVIRON["BLOCK"], lines, "\n") }
    NR == 1 { cr = ($0 ~ /\r$/) ? "\r" : "" }
    /^## / {
      if (in_sec && !done) { blanks = 0; emit(); print cr }
      in_sec = (index($0, "## " ENVIRON["SECTION"]) == 1)
    }
    /^\r?$/ { blanks++; next }
    { while (blanks > 0) { print cr; blanks-- } print }
    END {
      if (in_sec && !done) { while (blanks > 0) { print cr; blanks-- } emit() }
      while (blanks > 0) { print cr; blanks-- }
    }'
}

# edit_queue_line <match> done|append [suffix] -> edits the first TASK QUEUE line containing <match>.
# Returns 1 when no line matches.
edit_queue_line() {
  MATCH="$1" MODE="$2" SUFFIX="${3:-}" _rewrite '
    /^## / { in_q = ($0 ~ /^## TASK QUEUE/) }
    in_q && !hit && index($0, ENVIRON["MATCH"]) {
      cr = ($0 ~ /\r$/) ? "\r" : ""; line = $0; sub(/\r$/, "", line)
      if (ENVIRON["MODE"] == "done") sub(/^- \[ \]/, "- [x]", line); else line = line ENVIRON["SUFFIX"]
      print line cr; hit = 1; next
    }
    { print }
    END { exit !hit }'
}

# merge_list "a, b" "b, c" -> "a, b, c" (dedup, drops "none").
merge_list() {
  A="$1" B="$2" awk 'BEGIN {
    n = split(ENVIRON["A"] "," ENVIRON["B"], parts, ",")
    for (i = 1; i <= n; i++) {
      p = parts[i]; gsub(/^ +| +$/, "", p)
      if (p == "" || p == "none" || seen[p]++) continue
      out = out (out == "" ? "" : ", ") p
    }
    print (out == "" ? "none" : out)
  }'
}

# Comma list of paths changed in the working tree (max 20), excluding the ledger itself.
git_changes() {
  { git -C "$REPO_ROOT" status --porcelain 2>/dev/null | cut -c4- | grep -v 'AI_SESSIONS\.md$' | head -n 20 | paste -sd, - | sed 's/,/, /g'; } || true
}

# Minutes elapsed since a "YYYY-MM-DD HH:MM" UTC stamp; prints nothing if unparseable.
minutes_since() {
  local then
  then=$(date -u -d "$1" +%s 2>/dev/null || date -u -j -f "%Y-%m-%d %H:%M" "$1" +%s 2>/dev/null || true)
  [ -n "$then" ] && echo $(( ($(date -u +%s) - then) / 60 ))
  return 0
}

count_log_sessions() {
  awk '/^## / { in_log = ($0 ~ /^## SESSION LOG/) } in_log && /^### \[SESSION-/ { c++ } END { print c + 0 }' "$LEDGER"
}
