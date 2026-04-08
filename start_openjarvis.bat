@echo off
setlocal

echo OpenJarvis Launcher
echo.
echo [1] Start web HUD in Ubuntu
echo [2] Check Windows desktop readiness
echo [3] Collect desktop report
echo.
choice /c 123 /n /m "Choose an option: "

if errorlevel 3 goto report
if errorlevel 2 goto diagnose
if errorlevel 1 goto web

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
