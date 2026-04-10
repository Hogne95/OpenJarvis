$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $scriptDir "frontend"

Write-Host "OpenJarvis Desktop" -ForegroundColor Cyan
Write-Host "Launching the native Tauri shell with the current HUD..." -ForegroundColor DarkCyan

if (-not (Test-Path $frontendDir)) {
  Write-Error "Could not find frontend directory at $frontendDir"
  exit 1
}

Push-Location $frontendDir
try {
  npm run tauri dev
} finally {
  Pop-Location
}
