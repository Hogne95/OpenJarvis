$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "OpenJarvis Launcher" -ForegroundColor Cyan
Write-Host ""
Write-Host "[1] Start web HUD in Ubuntu"
Write-Host "[2] Check Windows desktop readiness"
Write-Host "[3] Collect desktop report"
Write-Host ""

$choice = Read-Host "Choose an option"

switch ($choice) {
  '2' { & (Join-Path $scriptDir "check_openjarvis_desktop.ps1") }
  '3' { & (Join-Path $scriptDir "collect_openjarvis_desktop_report.ps1") }
  default { & (Join-Path $scriptDir "start_openjarvis_web.ps1") }
}
