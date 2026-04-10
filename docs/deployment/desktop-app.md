# OpenJarvis Desktop App

Root cause of the old desktop confusion was that the native shell, the browser HUD, and the launcher scripts all looked like separate products. The current desktop path is now centered on the active Tauri shell in `frontend/src-tauri`.

## Preferred local flow

For the most app-like local experience, use the desktop shell first:

```powershell
./start_openjarvis_desktop.ps1
```

That launches the Tauri app from `frontend/src-tauri`, boots the local runtime, opens the JARVIS HUD, and gives you tray-aware lifecycle controls.

## What the desktop shell owns

- native startup procedure
- runtime boot for Ollama + API server
- setup screen before the HUD opens
- tray behavior and hide-to-tray close handling
- desktop lifecycle controls
- clean shutdown path for voice + backend services

## When to use the web HUD instead

Use `./start_openjarvis_web.ps1` when you specifically want:

- browser-based development
- frontend-only UI work
- a fallback while native Windows packaging is blocked

## Diagnostics

If the desktop app cannot build or package on Windows, check:

- `./check_openjarvis_desktop.ps1`
- `./collect_openjarvis_desktop_report.ps1`
- [windows-desktop-unblock.md](C:/Users/hogne/OpenJarvis/docs/deployment/windows-desktop-unblock.md)

## Current source of truth

- active desktop shell: `frontend/src-tauri`
- legacy desktop shell reference: `desktop/src-tauri`

The legacy `desktop/src-tauri` path is kept only as reference material while the active desktop experience is consolidated around the frontend Tauri shell.
