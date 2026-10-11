<#
.SYNOPSIS
  Opens an AI session in AI_SESSIONS.md: appends a START entry, sets ACTIVE STATE to IN_PROGRESS,
  and adds (or extends) the TASK QUEUE item. Resumes automatically if the previous session was cut off.
.EXAMPLE
  ./scripts/ai/ai_start.ps1 codex "Add CSV export to member list" gpt-5
.NOTES
  -Force (or $env:AI_FORCE = '1') takes over a session another agent updated less than 10 minutes ago.
  Ask the user first.
#>
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Agent,
    [Parameter(Mandatory = $true, Position = 1)][string]$Prompt,
    [Parameter(Position = 2)][string]$Model = 'unknown',
    [Parameter(Position = 3)][string]$Plan = 'see CHECKPOINTS',
    [switch]$Force
)
. (Join-Path $PSScriptRoot '_ledger_lib.ps1')

$lines = Read-Ledger
$agentSlug = $Agent.ToLowerInvariant() -replace '[^a-z0-9]', ''
$promptText = ConvertTo-OneLine $Prompt
$status = Get-Field $lines 'Status'
$prevId = Get-Field $lines 'Current session ID'

if ($status -eq 'IN_PROGRESS') {
    $age = Get-MinutesSince (Get-Field $lines 'Last updated (UTC)')
    $forced = $Force -or ($env:AI_FORCE -eq '1')
    if ($null -ne $age -and $age -lt $script:TakeoverGuardMinutes -and -not $forced) {
        [Console]::Error.WriteLine("STOP: $prevId ($(Get-Field $lines 'Current agent')) is IN_PROGRESS and was updated $age min ago.")
        [Console]::Error.WriteLine('Ask the user before taking over; re-run with -Force to proceed.')
        exit 2
    }
    $status = 'INTERRUPTED'
}

$resumed = if ($status -eq 'INTERRUPTED') { $prevId } else { 'none' }
$id = "SESSION-$(Get-UtcStamp)-$agentSlug"
$now = Get-UtcNow

Add-ToSectionEnd $lines 'SESSION LOG' @(
    '',
    "### [$id] START",
    "- Agent: $agentSlug",
    "- Model: $(ConvertTo-OneLine $Model)",
    "- Started (UTC): $now",
    "- User prompt: $promptText",
    "- Resumed from: $resumed",
    "- Plan: $(ConvertTo-OneLine $Plan)",
    '#### CHECKPOINTS'
)

Set-Field $lines 'Status' 'IN_PROGRESS'
Set-Field $lines 'Current session ID' $id
Set-Field $lines 'Current agent' $agentSlug
Set-Field $lines 'Last updated (UTC)' $now

if ($resumed -eq 'none') {
    Set-Field $lines 'Current task / user prompt' $promptText
    Set-Field $lines 'Last completed step' 'none'
    Set-Field $lines 'NEXT step' 'Plan and begin the task above'
    Set-Field $lines 'Files touched so far' 'none'
    Set-Field $lines 'Uncommitted / half-finished work' 'none'
    Set-Field $lines 'Blockers / decisions pending' 'none'
    Add-ToSectionEnd $lines 'TASK QUEUE' @("- [ ] $promptText | sessions: ``$id``")
} else {
    if (-not (Edit-QueueLine $lines $resumed -Suffix ", ``$id``")) {
        Add-ToSectionEnd $lines 'TASK QUEUE' @("- [ ] $(Get-Field $lines 'Current task / user prompt') | sessions: ``$id``")
    }
    Write-Output "Resuming from $resumed. NEXT step: $(Get-Field $lines 'NEXT step')"
}

Write-Ledger $lines
Write-Output $id
