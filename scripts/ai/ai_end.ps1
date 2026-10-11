<#
.SYNOPSIS
  Closes the active session: appends the END entry, updates ACTIVE STATE and TASK QUEUE.
.EXAMPLE
  ./scripts/ai/ai_end.ps1 HANDOFF "Export endpoint done" "Wire export button in member list page"
.NOTES
  COMPLETED sets Status = DONE; any other reason sets Status = INTERRUPTED so the next agent resumes.
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('COMPLETED', 'LIMIT_REACHED', 'ERROR', 'USER_STOPPED', 'HANDOFF')][string]$Reason,
    [Parameter(Mandatory = $true, Position = 1)][string]$Summary,
    [Parameter(Mandatory = $true, Position = 2)][string]$Remaining,
    [Parameter(Position = 3)][string]$Notes = 'none'
)
. (Join-Path $PSScriptRoot '_ledger_lib.ps1')

$lines = Read-Ledger
if ((Get-Field $lines 'Status') -ne 'IN_PROGRESS') {
    [Console]::Error.WriteLine('No IN_PROGRESS session to end.')
    exit 1
}

$id = Get-Field $lines 'Current session ID'
$now = Get-UtcNow
$remainingText = ConvertTo-OneLine $Remaining
$files = Merge-List (Get-Field $lines 'Files touched so far') (Get-GitChanges)

Add-ToSectionEnd $lines 'SESSION LOG' @(
    '### END',
    "- Ended (UTC): $now",
    "- End reason: $Reason",
    "- Summary of work done: $(ConvertTo-OneLine $Summary)",
    "- Files created/modified/deleted: $files",
    "- Remaining work (exact): $remainingText",
    "- Notes for the next agent: $(ConvertTo-OneLine $Notes)"
)

if ($Reason -eq 'COMPLETED') {
    Set-Field $lines 'Status' 'DONE'
    Set-Field $lines 'NEXT step' 'none (awaiting next user prompt)'
    Set-Field $lines 'Uncommitted / half-finished work' 'none'
    if (-not (Edit-QueueLine $lines $id -MarkDone)) {
        [Console]::Error.WriteLine("Note: no TASK QUEUE item references $id; mark it manually.")
    }
} else {
    Set-Field $lines 'Status' 'INTERRUPTED'
    Set-Field $lines 'NEXT step' $remainingText
}
Set-Field $lines 'Last updated (UTC)' $now

Write-Ledger $lines

$sessions = Get-LogSessionCount $lines
if ($sessions -gt $script:MaxLogSessions) {
    [Console]::Error.WriteLine("SESSION LOG has $sessions sessions (> $($script:MaxLogSessions)): condense the oldest into ## ARCHIVE.")
}
Write-Output "Ended $id ($Reason)"
