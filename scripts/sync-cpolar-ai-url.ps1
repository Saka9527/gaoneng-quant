# Sync Mintlify AI chat API base from the local cpolar dashboard (port 4042).
# Free cpolar public URLs change daily; run this after restarting the tunnel, then push.
#
# Usage:
#   powershell -File scripts/sync-cpolar-ai-url.ps1
#   powershell -File scripts/sync-cpolar-ai-url.ps1 -Push

param(
    [switch]$Push,
    [string]$DashboardUrl = "http://127.0.0.1:4042/",
    [string]$LocalHint = "localhost:8088"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "snippets\ai-advisory-config.js"

function Get-CpolarPublicUrl {
    param([string]$Dashboard, [string]$Hint)

    $client = New-Object System.Net.WebClient
    $client.Encoding = [System.Text.Encoding]::UTF8
    $html = $client.DownloadString($Dashboard)

    $matches = [regex]::Matches(
        $html,
        'PublicUrl\\":\\"(https://[a-zA-Z0-9.-]+\.cpolar\.[a-z.]+)\\"[^\}]{0,240}?LocalAddr\\":\\"http://([^\\"]+)\\"'
    )
    foreach ($m in $matches) {
        $pub = $m.Groups[1].Value
        $local = $m.Groups[2].Value
        if ($local -like "*$Hint*") {
            return $pub
        }
    }

    $fallback = [regex]::Match($html, 'https://[a-zA-Z0-9.-]+\.cpolar\.[a-z.]+')
    if ($fallback.Success) {
        return $fallback.Value
    }
    throw "No cpolar public URL found at $Dashboard. Is cpolar running with an http tunnel?"
}

function Get-CurrentApiBase {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return "" }
    $text = Get-Content -Path $Path -Raw -Encoding UTF8
    $m = [regex]::Match($text, 'AI_CHAT_API_BASE\s*=\s*"(https?://[^"]+)"')
    if ($m.Success) { return $m.Groups[1].Value }
    return ""
}

$publicUrl = Get-CpolarPublicUrl -Dashboard $DashboardUrl -Hint $LocalHint
$publicUrl = $publicUrl.TrimEnd("/")
$current = Get-CurrentApiBase -Path $configPath

Write-Host "cpolar public URL : $publicUrl"
Write-Host "config current    : $(if ($current) { $current } else { '(missing)' })"

if ($current -eq $publicUrl) {
    Write-Host "No change needed."
    if ($Push) {
        Write-Host "Skip push."
    }
    exit 0
}

$content = @"
// Updated by scripts/sync-cpolar-ai-url.ps1 when the free cpolar URL changes.
export const AI_CHAT_API_BASE = "$publicUrl";
"@
Set-Content -Path $configPath -Value $content -Encoding UTF8
Write-Host "Updated $configPath"

if (-not $Push) {
    Write-Host "Run with -Push to commit and push to origin/main for Mintlify."
    exit 0
}

Push-Location $repoRoot
try {
    git add -- "snippets/ai-advisory-config.js"
    $status = git status --porcelain -- "snippets/ai-advisory-config.js"
    if (-not $status) {
        Write-Host "Nothing to commit."
        exit 0
    }

    if (-not $env:GIT_AUTHOR_NAME) { $env:GIT_AUTHOR_NAME = "saka9527" }
    if (-not $env:GIT_AUTHOR_EMAIL) { $env:GIT_AUTHOR_EMAIL = "justzhaosj@gmail.com" }
    if (-not $env:GIT_COMMITTER_NAME) { $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME }
    if (-not $env:GIT_COMMITTER_EMAIL) { $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL }

    git commit -m "Update AI chat cpolar API base to $publicUrl."
    git push origin HEAD
    Write-Host "Pushed. Mintlify will pick up the new API base after deploy."
}
finally {
    Pop-Location
}
