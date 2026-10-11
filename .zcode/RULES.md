<!-- BEGIN:ai-session-protocol -->
# MANDATORY PROTOCOL: AI SESSION LEDGER

Applies to every AI agent working in this repository (Claude, Codex, ZCode, z.ai, and any other agent).
The ledger is `AI_SESSIONS.md` in the project root.

BEFORE ANY WORK:
1. Read `AI_SESSIONS.md` completely.
2. If ACTIVE STATE Status is IN_PROGRESS and its last update is older than the current moment with no END entry, treat it as INTERRUPTED (the previous agent hit its limit or crashed). Set Status = INTERRUPTED, then write a new START entry with "Resumed from: <that session ID>".
3. If Status is INTERRUPTED: continue from "NEXT step" and "Uncommitted / half-finished work". Run `git status` and `git diff` to verify the real state of the code, and trust the code over the log if they disagree. Do NOT restart finished steps. Do NOT redo or revert previous agent work unless it is broken.
4. If Status is IDLE or DONE: start a new session for the user's new prompt.
5. Append a START entry and set ACTIVE STATE to IN_PROGRESS with your agent name and session ID.

DURING WORK:
- After every meaningful step (file created, feature done, bug fixed), append a CHECKPOINT and update "Last completed step", "NEXT step", and "Files touched" in ACTIVE STATE. Do this BEFORE starting the next step, so a sudden limit cut loses nothing.
- Keep "NEXT step" precise enough that a different AI with zero context can execute it.
- Follow the existing code conventions in the project. Do not alter unrelated logic.

WHEN FINISHING (or if you sense you are near a limit/context end):
- Append the END entry with an accurate End reason and the exact Remaining work.
- Update ACTIVE STATE: Status = DONE (all complete) or INTERRUPTED/HANDOFF (work remains), plus NEXT step.
- Mark completed items in TASK QUEUE.

RULES:
- Only one agent may hold Status = IN_PROGRESS. If another agent's session is IN_PROGRESS and was updated within the last 10 minutes, STOP and ask the user before taking over.
- SESSION LOG is append-only. Only ACTIVE STATE and TASK QUEUE are edited in place.
- Never store secrets, API keys, tokens, or passwords in the ledger.
- When SESSION LOG exceeds 10 sessions, condense the oldest into ARCHIVE.
- Session ID format: SESSION-YYYYMMDD-HHMM-<agent>.

## RESUME PHRASES

If the user's entire message is one of these phrases, do exactly this:
- "resume" / "continue" -> read `AI_SESSIONS.md` and continue from the interrupted session (follow BEFORE ANY WORK, then pick up at "NEXT step").
- "status" -> print ACTIVE STATE and the TASK QUEUE only, no code changes.
- "handoff" -> immediately write the END entry with LIMIT_REACHED/HANDOFF and stop.

## HELPER SCRIPTS (optional)

You can edit `AI_SESSIONS.md` by hand instead; both approaches are valid. The bash and PowerShell versions take the same arguments:

```sh
scripts/ai/ai_start.sh      <agent> "<prompt>" [model] [plan]          # START + ACTIVE STATE = IN_PROGRESS
scripts/ai/ai_checkpoint.sh "<step>" "<next>" [files] [uncommitted]    # CHECKPOINT + ACTIVE STATE update
scripts/ai/ai_end.sh        <reason> "<summary>" "<remaining>" [notes] # END + ACTIVE STATE + TASK QUEUE
```

```powershell
./scripts/ai/ai_start.ps1      <agent> "<prompt>" [model] [plan]
./scripts/ai/ai_checkpoint.ps1 "<step>" "<next>" [files] [uncommitted]
./scripts/ai/ai_end.ps1        <reason> "<summary>" "<remaining>" [notes]
```

`<reason>` is one of COMPLETED | LIMIT_REACHED | ERROR | USER_STOPPED | HANDOFF. `ai_start` refuses to take over a session that is IN_PROGRESS and was updated less than 10 minutes ago. To override after the user approves, set `AI_FORCE=1` (bash) or pass `-Force` (PowerShell).
<!-- END:ai-session-protocol -->
