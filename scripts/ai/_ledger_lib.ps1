# Shared helpers for the AI session ledger scripts (ai_start / ai_checkpoint / ai_end).
# Dot-source, do not run directly. Ledger path defaults to <repo>/AI_SESSIONS.md; override with $env:AI_LEDGER.
# Kept ASCII-only so Windows PowerShell 5.1 parses it correctly without a BOM.
$ErrorActionPreference = 'Stop'

$script:Ledger = if ($env:AI_LEDGER) { $env:AI_LEDGER } else { Join-Path $PSScriptRoot '..\..\AI_SESSIONS.md' }
if (-not (Test-Path -LiteralPath $script:Ledger)) { throw "Ledger not found: $script:Ledger" }
$script:Ledger = (Resolve-Path -LiteralPath $script:Ledger).Path
$script:RepoRoot = Split-Path -Parent $script:Ledger
$script:Utf8 = New-Object System.Text.UTF8Encoding($false)
$script:Eol = "`n"

$script:MaxLogSessions = 10
$script:TakeoverGuardMinutes = 10

function Get-UtcNow   { (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm') }
function Get-UtcStamp { (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm') }
function Get-UtcHm    { (Get-Date).ToUniversalTime().ToString('HH:mm') }
function ConvertTo-OneLine([string]$Text) { ($Text -replace '[\r\n]+', ' ').Trim() }

# Returns the ledger as a mutable List[string]; remembers the file's line ending for Write-Ledger.
function Read-Ledger {
    $raw = [IO.File]::ReadAllText($script:Ledger, $script:Utf8)
    $script:Eol = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
    $list = New-Object 'System.Collections.Generic.List[string]'
    $list.AddRange([string[]]($raw.TrimEnd([char[]]"`r`n") -split "`r?`n"))
    return , $list
}

function Write-Ledger($Lines) {
    [IO.File]::WriteAllText($script:Ledger, (($Lines -join $script:Eol) + $script:Eol), $script:Utf8)
}

# Index range of a "## <Section>" block: Start = heading line, End = next "## " heading (exclusive).
function Get-SectionRange($Lines, [string]$Section) {
    $start = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($start -lt 0) {
            if ($Lines[$i].StartsWith("## $Section")) { $start = $i }
        } elseif ($Lines[$i].StartsWith('## ')) {
            return @{ Start = $start; End = $i }
        }
    }
    if ($start -lt 0) { throw "Section '## $Section' not found in $script:Ledger" }
    return @{ Start = $start; End = $Lines.Count }
}

function Get-Field($Lines, [string]$Name) {
    $r = Get-SectionRange $Lines 'ACTIVE STATE'
    for ($i = $r.Start; $i -lt $r.End; $i++) {
        if ($Lines[$i].StartsWith("- ${Name}:")) { return $Lines[$i].Substring($Name.Length + 3).Trim() }
    }
    return ''
}

function Set-Field($Lines, [string]$Name, [string]$Value) {
    $r = Get-SectionRange $Lines 'ACTIVE STATE'
    for ($i = $r.Start; $i -lt $r.End; $i++) {
        if ($Lines[$i].StartsWith("- ${Name}:")) {
            $Lines[$i] = "- ${Name}: $(ConvertTo-OneLine $Value)"
            return
        }
    }
    throw "Field '$Name' not found in ACTIVE STATE"
}

# Inserts $Block at the end of a section, collapsing trailing blank lines before the next heading.
function Add-ToSectionEnd($Lines, [string]$Section, [string[]]$Block) {
    $r = Get-SectionRange $Lines $Section
    $at = $r.End
    while ($at -gt $r.Start + 1 -and $Lines[$at - 1].Trim() -eq '') {
        $Lines.RemoveAt($at - 1)
        $at--
    }
    $insert = @($Block)
    if ($at -lt $Lines.Count) { $insert += '' }
    $Lines.InsertRange($at, [string[]]$insert)
}

# Edits the first TASK QUEUE line containing $Match. Returns $true when a line was edited.
function Edit-QueueLine($Lines, [string]$Match, [string]$Suffix = '', [switch]$MarkDone) {
    $r = Get-SectionRange $Lines 'TASK QUEUE'
    for ($i = $r.Start + 1; $i -lt $r.End; $i++) {
        if ($Lines[$i].Contains($Match)) {
            $Lines[$i] = if ($MarkDone) { $Lines[$i] -replace '^- \[ \]', '- [x]' } else { $Lines[$i] + $Suffix }
            return $true
        }
    }
    return $false
}

# "a, b" + "b, c" -> "a, b, c" (dedup, drops "none").
function Merge-List([string]$A, [string]$B) {
    $seen = @{}
    $out = @()
    foreach ($p in ("$A,$B" -split ',')) {
        $p = $p.Trim()
        if (-not $p -or $p -eq 'none' -or $seen.ContainsKey($p)) { continue }
        $seen[$p] = $true
        $out += $p
    }
    if ($out.Count) { $out -join ', ' } else { 'none' }
}

# Comma list of paths changed in the working tree (max 20), excluding the ledger itself.
function Get-GitChanges {
    try {
        $out = & git -C $script:RepoRoot status --porcelain 2>$null
    } catch {
        return ''
    }
    if (-not $out) { return '' }
    $paths = @($out | ForEach-Object { $_.Substring(3) } | Where-Object { $_ -notmatch 'AI_SESSIONS\.md$' } | Select-Object -First 20)
    return ($paths -join ', ')
}

# Minutes elapsed since a "yyyy-MM-dd HH:mm" UTC stamp; $null if unparseable.
function Get-MinutesSince([string]$Stamp) {
    $t = [datetime]::MinValue
    $styles = [Globalization.DateTimeStyles]'AssumeUniversal, AdjustToUniversal'
    if (-not [datetime]::TryParseExact($Stamp, 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture, $styles, [ref]$t)) {
        return $null
    }
    return [int][math]::Floor(((Get-Date).ToUniversalTime() - $t).TotalMinutes)
}

function Get-LogSessionCount($Lines) {
    $r = Get-SectionRange $Lines 'SESSION LOG'
    $count = 0
    for ($i = $r.Start; $i -lt $r.End; $i++) { if ($Lines[$i] -match '^### \[SESSION-') { $count++ } }
    return $count
}
