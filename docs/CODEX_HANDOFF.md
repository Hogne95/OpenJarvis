# Codex Handoff

## Current state

The JARVIS branch is no longer in the original "HUD attempt" state.

Working now:
- custom JARVIS HUD replaces the default dashboard UI
- command core, approval gate, direct control, and core matrix are live
- Norwegian + English voice input is supported
- English-only reply path is preserved
- approval-based actions are wired for inbox, calendar, tasks, and workbench flows
- daily brief, reminders, automation log, alert center, and commander queue are active
- coding/workbench flows now include repo state, review queue, and project memory

## Root cause history

The first dashboard issue was not a missing HUD component. The main causes were:
- the stock app `Layout` was still wrapping the dashboard route
- a legacy backend `/dashboard` route conflicted with the React HUD route
- the user was often looking at a different runtime path (`localhost:5173` dev server vs built desktop bundle)

Those routing and wrapping issues are already fixed.

## Current remaining blocker

The main unresolved item is native Windows desktop packaging.

Root cause:
- Tauri build helpers generated under `frontend/src-tauri/target/debug/build/...`
  are being blocked by Windows code-execution policy
- diagnostics show WDAC policy files are active
- Smart App Control is present
- Code Integrity events explicitly recorded blocked Rust build helper execution

This is now an environment / policy blocker, not a missing frontend or backend feature.

## Working paths today

Recommended daily-use path:
- run the web HUD through WSL/Ubuntu
- use `start_openjarvis.bat` or `start_openjarvis.ps1`
- choose option `1` to launch the working HUD

Desktop diagnostics:
- `check_openjarvis_desktop.ps1`
- `check_openjarvis_desktop_policy.ps1`
- `collect_openjarvis_desktop_report.ps1`

Combined report output:
- `desktop-readiness-report.txt`

## Goal from here

Treat the in-app JARVIS work as functionally advanced.

Priorities now:
1. preserve working voice behavior
2. preserve the HUD operator workflow
3. keep approval-based actions safe
4. only revisit native `.exe` packaging after Windows policy is relaxed
