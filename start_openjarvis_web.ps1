$rootWsl = "/mnt/c/Users/hogne/OpenJarvis"
$frontendWsl = "/mnt/c/Users/hogne/OpenJarvis/frontend"

Write-Host "Starting OpenJarvis web workflow..." -ForegroundColor Cyan
Write-Host "WSL command 1: try full voice stack, then fall back if speech-wake is unsupported"
Write-Host "WSL command 2: uv run jarvis serve --port 8000"
Write-Host "WSL command 3: npm install && npm run dev"
Write-Host ""

Start-Process cmd.exe -ArgumentList '/k', "wsl.exe bash -lc ""cd '$rootWsl' && if ! uv sync --extra server --extra speech --extra speech-live --extra speech-wake --extra speech-tts-local; then echo 'speech-wake unavailable on this Python build, retrying without it...'; uv sync --extra server --extra speech --extra speech-live --extra speech-tts-local; fi && uv run jarvis serve --port 8000; exec bash"""
Start-Sleep -Seconds 6
Start-Process cmd.exe -ArgumentList '/k', "wsl.exe bash -lc ""cd '$frontendWsl' && npm install && npm run dev; exec bash"""
Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "Two Ubuntu terminal windows were started and the HUD URL was opened." -ForegroundColor Green
Write-Host "If the page loads before Vite is ready, wait a moment and refresh." -ForegroundColor Yellow
