@echo off
setlocal

set "ROOT_WSL=/mnt/c/Users/hogne/OpenJarvis"
set "FRONTEND_WSL=/mnt/c/Users/hogne/OpenJarvis/frontend"
set "UBUNTU_CMD=wsl.exe bash -lc"

echo Starting OpenJarvis web workflow...
echo.
echo WSL command 1: uv sync --extra server --extra speech --extra speech-live --extra speech-wake --extra speech-tts-local
echo WSL command 2: uv run jarvis serve --port 8000
echo WSL command 3: npm run dev
echo.

start "OpenJarvis Backend" cmd /k %UBUNTU_CMD% "cd \"%ROOT_WSL%\" && uv sync --extra server --extra speech --extra speech-live --extra speech-wake --extra speech-tts-local && uv run jarvis serve --port 8000; exec bash"
timeout /t 6 /nobreak >nul
start "OpenJarvis Frontend" cmd /k %UBUNTU_CMD% "cd \"%FRONTEND_WSL%\" && npm install && npm run dev; exec bash"
timeout /t 4 /nobreak >nul

start "" http://localhost:5173

echo OpenJarvis backend and frontend launch commands were started in separate Ubuntu windows.
echo If this is the first run, dependency setup may take a little while before the page is ready.
echo If the browser opens before Vite is ready, wait a moment and refresh.
echo.
pause
