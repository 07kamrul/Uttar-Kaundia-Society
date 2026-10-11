# Copies docs/AI_RULES.md into every AI tool's instruction file, between
# <!-- BEGIN:ai-rules --> / <!-- END:ai-rules --> markers. Content outside the markers is kept.
# Usage: ./scripts/ai/sync_rules.ps1 [-Check]   (-Check: exit 1 if any copy is stale, write nothing)
param([switch]$Check)
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Master = Join-Path $RepoRoot 'docs/AI_RULES.md'
if (-not (Test-Path $Master)) { Write-Error "Master rules not found: $Master"; exit 1 }

# Keep in sync with TARGETS in sync_rules.sh. CLAUDE.md is not listed: it imports AGENTS.md.
$Targets = @(
  'AGENTS.md', '.zcode/RULES.md', '.github/copilot-instructions.md', '.cursor/rules/ai-rules.mdc',
  'GEMINI.md', '.windsurfrules', '.clinerules', 'CONVENTIONS.md'
)

$nl = "`n"
$masterText = (Get-Content -Raw $Master) -replace "`r`n", $nl
$block = '<!-- BEGIN:ai-rules -->' + $nl +
  '<!-- GENERATED from docs/AI_RULES.md by scripts/ai/sync_rules.sh. Do not edit here. -->' + $nl +
  $masterText.TrimEnd($nl) + $nl + '<!-- END:ai-rules -->'

function Get-Desired([string]$rel) {
  $path = Join-Path $RepoRoot $rel
  if ($rel.EndsWith('.mdc')) {
    return "---${nl}description: Mandatory project rules for every AI agent${nl}alwaysApply: true${nl}---${nl}${nl}$block$nl"
  }
  $current = if (Test-Path $path) { (Get-Content -Raw $path) -replace "`r`n", $nl } else { '' }
  if ($current -match '<!-- BEGIN:ai-rules -->') {
    $pattern = '(?s)<!-- BEGIN:ai-rules -->.*?<!-- END:ai-rules -->'
    return [regex]::Replace($current, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block })
  }
  $rest = [regex]::Replace($current, '(?s)<!-- BEGIN:ai-session-protocol -->.*?<!-- END:ai-session-protocol -->\n?', '').TrimStart($nl)
  if ($rest) { return "$block$nl$nl$rest" }
  return "$block$nl"
}

$stale = $false
foreach ($rel in $Targets) {
  $path = Join-Path $RepoRoot $rel
  $desired = Get-Desired $rel
  $current = if (Test-Path $path) { (Get-Content -Raw $path) -replace "`r`n", $nl } else { $null }
  if ($current -eq $desired) { continue }
  $stale = $true
  if ($Check) { Write-Output "stale: $rel"; continue }
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  [System.IO.File]::WriteAllText($path, $desired)
  Write-Output "synced: $rel"
}

if ($Check -and $stale) { Write-Error 'AI rule copies are out of date. Run: ./scripts/ai/sync_rules.ps1'; exit 1 }
if (-not $stale) { Write-Output 'All AI rule copies are up to date.' }
