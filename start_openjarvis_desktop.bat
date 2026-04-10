@echo off
setlocal

echo OpenJarvis Desktop
echo Launching the native Tauri shell with the current HUD...
echo.

if not exist "%~dp0frontend" (
  echo Could not find frontend directory.
  exit /b 1
)

pushd "%~dp0frontend"
call npm run tauri dev
popd
