# Windows Desktop Unblock Guide

## Root cause

If OpenJarvis fails to build or launch the native Tauri desktop app with `os error 4551`, the usual cause is not missing frontend code. On this machine, the blocker is Windows code-execution policy:

- Smart App Control is present
- WDAC policy files are active
- Code Integrity events show `cargo.exe` being blocked from loading generated Rust build helpers inside `frontend/src-tauri/target/debug/build`

That means the web HUD can be fully healthy while the `.exe` path still fails.

## What to run

From Windows PowerShell in the repo root:

```powershell
.\check_openjarvis_desktop.ps1
.\check_openjarvis_desktop_policy.ps1
.\collect_openjarvis_desktop_report.ps1
```

## What the scripts do

`check_openjarvis_desktop.ps1`
- checks Node, npm, cargo, rustc
- checks WebView2
- checks frontend dependency shims
- checks whether `src-tauri/target` already contains generated Rust build helpers

`check_openjarvis_desktop_policy.ps1`
- checks Smart App Control state
- checks WDAC policy files
- checks AppLocker-related services
- checks recent Code Integrity and AppLocker events

`collect_openjarvis_desktop_report.ps1`
- runs both checks
- writes a combined report to `desktop-readiness-report.txt`

## Current interpretation

If readiness looks good but Tauri still fails, and policy diagnostics show WDAC / Code Integrity events for files under:

`frontend/src-tauri/target/debug/build/.../build-script-build.exe`

then the remaining blocker is Windows policy, not OpenJarvis.

## Most likely ways to unblock

1. Ask the device administrator to allow local Rust/Tauri development outputs
2. Relax Smart App Control / WDAC policy for this machine
3. Add an allow rule or exclusion for the OpenJarvis repo build outputs
4. Retry Tauri after policy is relaxed:

```powershell
cd C:\Users\hogne\OpenJarvis\frontend
npm run tauri dev
```

## Working fallback

Until policy is relaxed, use the web HUD:

```bash
cd /mnt/c/Users/hogne/OpenJarvis
uv run jarvis serve --port 8000
```

```bash
cd /mnt/c/Users/hogne/OpenJarvis/frontend
npm run dev
```

Then open `http://localhost:5173` and install it as a browser app if needed.
