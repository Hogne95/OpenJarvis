$rootWsl = "/mnt/c/Users/hogne/OpenJarvis"
$frontendWsl = "/mnt/c/Users/hogne/OpenJarvis/frontend"

Write-Host "Starting OpenJarvis web workflow..." -ForegroundColor Cyan
Write-Host "Backend:  uv run jarvis serve --port 8000"
Write-Host "Frontend: npm run dev"
Write-Host ""

Start-Process cmd.exe -ArgumentList '/k', "wsl.exe bash -lc ""cd '$rootWsl' && uv run jarvis serve --port 8000; exec bash"""
Start-Sleep -Seconds 3
Start-Process cmd.exe -ArgumentList '/k', "wsl.exe bash -lc ""cd '$frontendWsl' && npm run dev; exec bash"""
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "Two terminal windows were started and the HUD URL was opened." -ForegroundColor Green
Write-Host "If the page loads before Vite is ready, wait a moment and refresh." -ForegroundColor Yellow
