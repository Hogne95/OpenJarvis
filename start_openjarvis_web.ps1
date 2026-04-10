$rootWsl = "/mnt/c/Users/hogne/OpenJarvis"
$frontendWsl = "/mnt/c/Users/hogne/OpenJarvis/frontend"
$backendUrl = "http://localhost:8000/v1/health"
$frontendUrl = "http://localhost:5173"

Write-Host "Starting OpenJarvis web workflow..." -ForegroundColor Cyan
Write-Host "WSL command 1: run shared backend startup with Python-aware voice extras"
Write-Host "WSL command 2: uv run jarvis serve --port 8000"
Write-Host "WSL command 3: npm install && npm run dev"
Write-Host ""

Start-Process cmd.exe -ArgumentList '/k', "wsl.exe bash -lc ""cd '$rootWsl' && bash scripts/start_openjarvis_backend.sh '$rootWsl'; exec bash"""

Write-Host "Waiting for backend health..." -ForegroundColor Yellow
for ($i = 0; $i -lt 60; $i++) {
  try {
    $response = Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}

Start-Process cmd.exe -ArgumentList '/k', "wsl.exe bash -lc ""cd '$frontendWsl' && npm install && npm run dev; exec bash"""

Write-Host "Waiting for frontend dev server..." -ForegroundColor Yellow
for ($i = 0; $i -lt 60; $i++) {
  try {
    $response = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}

Start-Process $frontendUrl

Write-Host ""
Write-Host "Two Ubuntu terminal windows were started and the HUD URL was opened after readiness checks." -ForegroundColor Green
Write-Host "If voice still shows a startup warning, open System inside JARVIS and re-run the startup procedure." -ForegroundColor Yellow
