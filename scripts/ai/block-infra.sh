#!/bin/sh
# PreToolUse hook: blocks AI agents from touching the database or servers.
# Reads the tool call JSON on stdin; exit 2 blocks the call and shows the reason.

cmd=$(jq -r '.tool_input.command // empty')

BLOCKED='(^|[^a-z_])(psql|mysql|mongosh|redis-cli|sqlite3|pg_dump|pg_restore|ssh|scp|sftp|rsync|kubectl|dokploy)([^a-z_]|$)|alembic +(upgrade|downgrade|stamp)|docker( compose)? exec|db\.sqlite3|DATABASE_URL|\.env([^a-z]|$)|git +push +(-f|--force)|git +reset +--hard|git +clean +-[a-z]*f|core\.hooksPath|--no-verify'

if printf '%s' "$cmd" | grep -Eqi "$BLOCKED"; then
  echo "Blocked by project rule: AI agents may not access the database, secrets, or servers. Ask the user to run this command." >&2
  exit 2
fi
exit 0
