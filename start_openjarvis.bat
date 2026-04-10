@echo off
setlocal

echo OpenJarvis Launcher
echo.
echo [1] Start desktop app
echo [2] Start web HUD in Ubuntu
echo [3] Check Windows desktop readiness
echo [4] Collect desktop report
echo.
choice /c 1234 /n /m "Choose an option: "

if errorlevel 4 goto report
if errorlevel 3 goto diagnose
if errorlevel 2 goto web
if errorlevel 1 goto desktop

:desktop
call "%~dp0start_openjarvis_desktop.bat"
goto end

:web
call "%~dp0start_openjarvis_web.bat"
goto end

:diagnose
call "%~dp0check_openjarvis_desktop.bat"
goto end

:report
call "%~dp0collect_openjarvis_desktop_report.bat"
goto end

:end
