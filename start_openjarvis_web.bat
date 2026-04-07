@echo off
setlocal

set "ROOT_WIN=C:\Users\hogne\OpenJarvis"
set "ROOT_WSL=/mnt/c/Users/hogne/OpenJarvis"
set "FRONTEND_WSL=/mnt/c/Users/hogne/OpenJarvis/frontend"

echo Starting OpenJarvis web workflow...
echo.
echo Backend:  uv run jarvis serve --port 8000
echo Frontend: npm run dev
echo.

start "OpenJarvis Backend" cmd /k wsl.exe bash -lc "cd \"%ROOT_WSL%\" && uv run jarvis serve --port 8000; exec bash"
timeout /t 3 /nobreak >nul
start "OpenJarvis Frontend" cmd /k wsl.exe bash -lc "cd \"%FRONTEND_WSL%\" && npm run dev; exec bash"
timeout /t 3 /nobreak >nul

start "" http://localhost:5173

echo OpenJarvis backend and frontend launch commands were started in separate windows.
echo If the browser opens before Vite is ready, wait a moment and refresh.
echo.
pause
