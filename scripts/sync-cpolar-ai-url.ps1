# Sync Mintlify AI chat API base from the local cpolar tunnel.
# Free cpolar public URLs change daily; run this after restarting the tunnel, then push.
#
# Usage:
#   powershell -File scripts/sync-cpolar-ai-url.ps1
#   powershell -File scripts/sync-cpolar-ai-url.ps1 -Push
#   powershell -File scripts/sync-cpolar-ai-url.ps1 -PublicUrl https://xxxx.r7.cpolar.top -Push

param(
    [switch]$Push,
    [string]$PublicUrl = "",
    [string]$DashboardUrl = "http://127.0.0.1:4042/",
    [string]$LocalHint = "localhost:8088"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "snippets\ai-advisory-config.jsx"

function Get-CpolarPublicUrlFromDashboard {
    param([string]$Dashboard, [string]$Hint)

    $client = New-Object System.Net.WebClient
    $client.Encoding = [System.Text.Encoding]::UTF8
    $html = $client.DownloadString($Dashboard)

    $matches = [regex]::Matches(
        $html,
        'PublicUrl\\":\\"(https://[a-zA-Z0-9.-]+\.cpolar\.[a-z.]+)\\"[^\}]{0,400}?LocalAddr\\":\\"http://([^\\"]+)\\"'
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
    return ""
}

function Get-CpolarPublicUrlFromLogs {
    $candidates = @()
    $logRoots = @(
        (Join-Path $env:USERPROFILE ".cpolar\logs"),
        (Join-Path $env:USERPROFILE ".cursor\projects\d-project-ai-chat\terminals")
    )
    foreach ($root in $logRoots) {
        if (-not (Test-Path $root)) { continue }
        Get-ChildItem -Path $root -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-6) } |
            ForEach-Object {
                Select-String -Path $_.FullName -Pattern 'Tunnel established at (https://[a-zA-Z0-9.-]+\.cpolar\.[a-z.]+)' -ErrorAction SilentlyContinue |
                    ForEach-Object {
                        $candidates += [pscustomobject]@{
                            Url  = $_.Matches[0].Groups[1].Value
                            Time = $_.Filename
                            Line = $_.LineNumber
                            File = $_.Path
                            MTime = (Get-Item $_.Path).LastWriteTime
                        }
                    }
            }
    }
    if (-not $candidates) { return "" }
    return ($candidates | Sort-Object MTime, Line | Select-Object -Last 1).Url
}

function Test-AiApiBase {
    param([string]$Base)
    try {
        $probe = $Base.TrimEnd("/") + "/api/ai/sessions?userId=mintlify-debug"
        $resp = Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 12
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
    } catch {
        return $false
    }
}

function Get-CurrentApiBase {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return "" }
    $text = Get-Content -Path $Path -Raw -Encoding UTF8
    $m = [regex]::Match($text, 'AI_CHAT_API_BASE\s*=\s*"(https?://[^"]+)"')
    if ($m.Success) { return $m.Groups[1].Value }
    return ""
}

if ($PublicUrl) {
    $publicUrl = $PublicUrl.Trim().TrimEnd("/")
} else {
    $publicUrl = Get-CpolarPublicUrlFromDashboard -Dashboard $DashboardUrl -Hint $LocalHint
    if (-not $publicUrl) {
        # Older/newer clients may also expose inspect UI on 4040.
        try {
            $publicUrl = Get-CpolarPublicUrlFromDashboard -Dashboard "http://127.0.0.1:4040/" -Hint $LocalHint
        } catch {}
    }
    if (-not $publicUrl) {
        $publicUrl = Get-CpolarPublicUrlFromLogs
    }
}

if (-not $publicUrl) {
    throw "No cpolar public URL found. Pass -PublicUrl or start the ai-chat tunnel first."
}

$publicUrl = $publicUrl.TrimEnd("/")
if (-not (Test-AiApiBase -Base $publicUrl)) {
    throw "cpolar URL $publicUrl is not serving AI chat on /$LocalHint. Is Spring Boot up on 8088?"
}

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

# UTF8 no BOM — BOM can break Mintlify JSX snippets.
$content = @"
// Updated by scripts/sync-cpolar-ai-url.ps1 when the free cpolar URL changes.
export const AI_CHAT_API_BASE = "$publicUrl";
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($configPath, $content, $utf8NoBom)
Write-Host "Updated $configPath"

if (-not $Push) {
    Write-Host "Run with -Push to commit and push to origin/main for Mintlify."
    exit 0
}

Push-Location $repoRoot
try {
    git add -- "snippets/ai-advisory-config.jsx"
    $status = git status --porcelain -- "snippets/ai-advisory-config.jsx"
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
