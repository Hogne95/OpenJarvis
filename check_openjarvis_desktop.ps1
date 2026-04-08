$ErrorActionPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $repoRoot "frontend"
$tauriRoot = Join-Path $frontendRoot "src-tauri"

function Write-Section($title) {
  Write-Host ""
  Write-Host "== $title ==" -ForegroundColor Cyan
}

function Test-Command($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) {
    $version = & $name --version 2>$null
    [PSCustomObject]@{
      Name = $name
      Found = $true
      Path = $cmd.Source
      Version = ($version | Select-Object -First 1)
    }
  } else {
    [PSCustomObject]@{
      Name = $name
      Found = $false
      Path = ""
      Version = ""
    }
  }
}

function Test-NodeTooling {
  $directNode = Get-Command node -ErrorAction SilentlyContinue
  $directNpm = Get-Command npm -ErrorAction SilentlyContinue
  $candidates = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files\nodejs\npm.cmd",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
  )

  $foundNode = if ($directNode) { $directNode.Source } else { $candidates | Where-Object { $_ -like "*node.exe" -and (Test-Path $_) } | Select-Object -First 1 }
  $foundNpm = if ($directNpm) { $directNpm.Source } else { $candidates | Where-Object { $_ -like "*npm.cmd" -and (Test-Path $_) } | Select-Object -First 1 }

  [PSCustomObject]@{
    NodeFound = [bool]$foundNode
    NodePath = $foundNode
    NpmFound = [bool]$foundNpm
    NpmPath = $foundNpm
  }
}

function Test-WebView2 {
  $keys = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )

  foreach ($key in $keys) {
    $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
    if ($props) {
      return [PSCustomObject]@{
        Installed = $true
        Name = $props.name
        Version = $props.pv
      }
    }
  }

  [PSCustomObject]@{
    Installed = $false
    Name = ""
    Version = ""
  }
}

function Test-RepoPaths {
  [PSCustomObject]@{
    RepoRoot = $repoRoot
    Frontend = Test-Path $frontendRoot
    TauriRoot = Test-Path $tauriRoot
    PackageJson = Test-Path (Join-Path $frontendRoot "package.json")
    TauriConfig = Test-Path (Join-Path $tauriRoot "tauri.conf.json")
  }
}

function Test-NodeModules {
  $binRoot = Join-Path $frontendRoot "node_modules\.bin"
  $tauriShim = @(
    (Join-Path $binRoot "tauri.cmd"),
    (Join-Path $binRoot "tauri"),
    (Join-Path $binRoot "tauri.ps1")
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  $tscShim = @(
    (Join-Path $binRoot "tsc.cmd"),
    (Join-Path $binRoot "tsc"),
    (Join-Path $binRoot "tsc.ps1")
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  [PSCustomObject]@{
    FrontendNodeModules = Test-Path (Join-Path $frontendRoot "node_modules")
    TauriCli = [bool]$tauriShim
    TauriCliPath = $tauriShim
    TypeScript = [bool]$tscShim
    TypeScriptPath = $tscShim
  }
}

function Test-RustBuildPolicy {
  $targetDir = Join-Path $tauriRoot "target"
  if (-not (Test-Path $targetDir)) {
    return [PSCustomObject]@{
      TargetExists = $false
      BlockedArtifacts = @()
      Summary = "No src-tauri\\target directory yet."
    }
  }

  $blocked = Get-ChildItem -Path $targetDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "build-script-build*" } |
    Select-Object -First 10 -ExpandProperty FullName

  [PSCustomObject]@{
    TargetExists = $true
    BlockedArtifacts = $blocked
    Summary = if ($blocked.Count -gt 0) {
      "Rust build helper artifacts exist. If Tauri still fails with os error 4551, Windows policy is likely blocking execution."
    } else {
      "No build helper artifacts found yet."
    }
  }
}

Write-Section "OpenJarvis Desktop Readiness"
Write-Host "Repo: $repoRoot"

Write-Section "Required Commands"
$commands = @("node", "npm", "cargo", "rustc") | ForEach-Object { Test-Command $_ }
$commands | Format-Table Name, Found, Version, Path -AutoSize

Write-Section "Node Tooling Fallback"
$nodeTooling = Test-NodeTooling
$nodeTooling | Format-List

Write-Section "Project Paths"
$paths = Test-RepoPaths
$paths | Format-List

Write-Section "Frontend Dependencies"
$deps = Test-NodeModules
$deps | Format-List

Write-Section "WebView2"
$webview = Test-WebView2
$webview | Format-List

Write-Section "Rust Build Policy Hint"
$policy = Test-RustBuildPolicy
$policy | Select-Object TargetExists, Summary | Format-List
if ($policy.BlockedArtifacts.Count -gt 0) {
  Write-Host "Example build helper artifacts:" -ForegroundColor Yellow
  $policy.BlockedArtifacts | ForEach-Object { Write-Host "  $_" }
}

Write-Section "Recommended Next Step"
if (-not $nodeTooling.NodeFound) {
  Write-Host "Install Windows Node.js and reopen PowerShell."
  Write-Host "Download: https://nodejs.org/en/download" -ForegroundColor Yellow
} elseif (-not $nodeTooling.NpmFound) {
  Write-Host "Node exists but npm.cmd was not found on PATH. Add the Node.js install folder to PATH or use the full npm.cmd path."
} elseif (-not $commands.Where({ $_.Name -eq "cargo" -and $_.Found }).Count) {
  Write-Host "Install Rust for Windows (rustup) and reopen PowerShell."
} elseif (-not $webview.Installed) {
  Write-Host "Install Microsoft Edge WebView2 Runtime."
  Write-Host "Download: https://developer.microsoft.com/en-us/microsoft-edge/webview2/" -ForegroundColor Yellow
} elseif (-not $deps.FrontendNodeModules) {
  Write-Host "Run: cd `"$frontendRoot`" ; npm install"
} elseif (-not $deps.TauriCli -or -not $deps.TypeScript) {
  Write-Host "Frontend dependencies look incomplete. Run: cd `"$frontendRoot`" ; npm install"
} else {
  Write-Host "Environment looks mostly ready. If Tauri still fails with os error 4551, Windows App Control is the remaining blocker."
  Write-Host "Run: `"$repoRoot\check_openjarvis_desktop_policy.bat`"" -ForegroundColor Yellow
}
