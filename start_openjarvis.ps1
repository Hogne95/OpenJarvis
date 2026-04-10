$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "OpenJarvis Launcher" -ForegroundColor Cyan
Write-Host ""
Write-Host "[1] Start desktop app"
Write-Host "[2] Start web HUD in Ubuntu"
Write-Host "[3] Check Windows desktop readiness"
Write-Host "[4] Collect desktop report"
Write-Host ""

$choice = Read-Host "Choose an option"

switch ($choice) {
  '2' { & (Join-Path $scriptDir "start_openjarvis_web.ps1") }
  '3' { & (Join-Path $scriptDir "check_openjarvis_desktop.ps1") }
  '4' { & (Join-Path $scriptDir "collect_openjarvis_desktop_report.ps1") }
  default { & (Join-Path $scriptDir "start_openjarvis_desktop.ps1") }
}
