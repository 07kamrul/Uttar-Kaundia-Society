<#
.SYNOPSIS
  Records a CHECKPOINT for the active session and refreshes ACTIVE STATE.
.EXAMPLE
  ./scripts/ai/ai_checkpoint.ps1 "Added export endpoint" "Wire export button in member list page"
.NOTES
  Files defaults to paths from `git status --porcelain`.
  Uncommitted defaults to leaving the ACTIVE STATE value unchanged.
#>
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Step,
    [Parameter(Mandatory = $true, Position = 1)][string]$Next,
    [Parameter(Position = 2)][string]$Files = '',
    [Parameter(Position = 3)][string]$Uncommitted = ''
)
. (Join-Path $PSScriptRoot '_ledger_lib.ps1')

$lines = Read-Ledger
if ((Get-Field $lines 'Status') -ne 'IN_PROGRESS') {
    [Console]::Error.WriteLine('No IN_PROGRESS session. Run ai_start.ps1 first.')
    exit 1
}

$changed = if ($Files) { ConvertTo-OneLine $Files } else { Get-GitChanges }
if (-not $changed) { $changed = 'none' }
$stepText = ConvertTo-OneLine $Step
$nextText = ConvertTo-OneLine $Next

Add-ToSectionEnd $lines 'SESSION LOG' @("- [$(Get-UtcHm)] $stepText -> $changed -> $nextText")

Set-Field $lines 'Last completed step' $stepText
Set-Field $lines 'NEXT step' $nextText
Set-Field $lines 'Files touched so far' (Merge-List (Get-Field $lines 'Files touched so far') $changed)
if ($Uncommitted) { Set-Field $lines 'Uncommitted / half-finished work' $Uncommitted }
Set-Field $lines 'Last updated (UTC)' (Get-UtcNow)

Write-Ledger $lines
Write-Output "Checkpoint saved for $(Get-Field $lines 'Current session ID')"
