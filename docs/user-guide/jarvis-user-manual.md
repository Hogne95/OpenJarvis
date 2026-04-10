---
title: JARVIS User Manual
description: Practical guide for starting, using, and shutting down the local JARVIS assistant
---

# JARVIS User Manual

## 1. What JARVIS Is

JARVIS is a local assistant built on OpenJarvis with:

- a sci-fi HUD operator interface
- Norwegian and English voice input
- English-only replies
- approval-based actions
- desktop, coding, document, visual, and mission workflows

The current product has two main ways to run:

- Desktop app: the preferred app-like experience
- Web HUD: the fallback and development-friendly experience

## 2. Recommended Way To Start JARVIS

### Preferred local launch

From the repo root:

```powershell
.\start_openjarvis.ps1
```

Or:

```text
C:\Users\hogne\OpenJarvis\start_openjarvis.bat
```

The launcher now gives you these choices:

1. Start desktop app
2. Start web HUD in Ubuntu
3. Check Windows desktop readiness
4. Collect desktop report

### Best choice for normal use

Choose `1` to start the desktop app.

That launches the active Tauri shell in `frontend/src-tauri`, boots the local runtime, and opens the JARVIS HUD with desktop lifecycle controls.

## 3. Startup Procedure

Root cause of earlier startup pain was that JARVIS could launch processes without verifying that voice and runtime dependencies were actually ready. The current startup flow now checks:

- runtime readiness
- speech backend availability
- voice loop state
- core app dependencies

### What you should expect

On launch, JARVIS should:

1. open the setup/startup screen
2. check inference, model, and API readiness
3. arm the voice loop when possible
4. open the HUD once the system is usable

If something is blocked, JARVIS should surface that clearly instead of failing silently.

## 4. Main Pages

JARVIS is no longer supposed to keep everything on one dashboard. The main pages are:

### Dashboard

The command-center view for the most important live information.

Use it for:

- mission overview
- quick operator awareness
- command and approval flow
- high-priority assistant activity

### Workspace

Use this for:

- repo and coding work
- self-improve workflows
- FiveM and Lua coding lanes
- workbench-oriented tasks

### Briefings

Use this for:

- visual briefs
- document briefs
- design briefs
- saved and routed brief-style work

### Operations

Use this for:

- daily ops
- commercial ops
- sales, customer, and Shopify lanes
- queue-style operational follow-up

### Desktop

Use this for:

- start runtime
- restart runtime
- stop runtime
- show window
- hide to tray
- prepare shutdown
- quit desktop app

### System

Use this for:

- runtime readiness details
- speech and voice loop checks
- core agent checks
- startup health confirmation

## 5. Voice Workflow

JARVIS is designed for:

- Norwegian and English input
- English reply output
- continuous voice loop support
- barge-in and interruption-aware behavior

### If voice is not working

Check these in order:

1. Open `System`
2. Confirm speech backend is available
3. Confirm voice loop is active
4. If needed, use `Start Voice`
5. If the system feels stale, restart runtime from `Desktop`

### Important safety rule

Do not refactor or replace working voice behavior casually. Voice is one of the highest-risk parts of the product and should be treated carefully.

## 6. Daily Use Pattern

The best normal workflow is:

1. Start JARVIS from the launcher
2. Let startup complete
3. Open the page that matches your work
4. Use approval for side-effect actions
5. Use `Desktop` or `System` if runtime or voice needs attention

### Good page choices

- general assistant/operator use: `Dashboard`
- coding and repo work: `Workspace`
- saved analysis and briefs: `Briefings`
- business and queue work: `Operations`
- startup/restart/shutdown: `Desktop`
- diagnostics and readiness: `System`

## 7. Approval And Safety

JARVIS uses approval-based actions for important side effects.

That means it is meant to:

- prepare actions
- stage them clearly
- let you approve before execution when needed

This is especially important for:

- desktop control
- workbench commands
- coding changes
- communication-related actions

## 8. Desktop Runtime Controls

The desktop page is the native lifecycle surface.

### Start Runtime

Use when the shell is open but backend services are not fully ready.

### Restart Runtime

Use when:

- voice seems stale
- backend checks look inconsistent
- API behavior feels stuck

### Stop Runtime

Use when you want the local services to stand down without fully quitting the app window first.

### Show Window / Hide To Tray

Closing the window should hide JARVIS to the tray rather than killing the session. Use the page or tray menu when you want to bring it back.

### Prepare Shutdown

Use when you want a cleaner stand-down:

1. stop voice activity
2. stop runtime
3. then quit

### Quit Desktop App

Use this when you want JARVIS fully closed.

## 9. Web HUD Fallback

If the desktop build path is unavailable or Windows desktop packaging is blocked, use:

```powershell
.\start_openjarvis_web.ps1
```

This remains a valid fallback for:

- frontend work
- browser-based usage
- development
- situations where native packaging is blocked by policy

## 10. Coding Work

JARVIS includes a strong coding/operator workflow with:

- repo awareness
- review queue
- self-improve missions
- direct file editing flows
- validation loops
- FiveM and Lua coding intelligence

### For coding work

Go to `Workspace`.

That is the better place for:

- repo operations
- coding missions
- FiveM resource review
- logic and validation follow-up

## 11. Documents, Design, And Visual Work

JARVIS can also work with:

- PDF, DOCX, XLSX, PPTX, and TSV files
- visual/screenshot analysis
- design audits and HUD scorecards
- saved briefs and missions

### Best place for that work

Go to `Briefings`.

That keeps these flows out of the main dashboard and makes the app easier to use.

## 12. Operations And Commercial Work

JARVIS also supports operational business workflows such as:

- sales intelligence
- customer interaction intelligence
- Shopify/store intelligence
- commercial ops missions

### Best place for that work

Go to `Operations`.

## 13. Diagnostics

If native Windows packaging or runtime setup has problems, use:

```powershell
.\check_openjarvis_desktop.ps1
.\collect_openjarvis_desktop_report.ps1
```

If Windows policy is the blocker, also review:

```text
C:\Users\hogne\OpenJarvis\docs\deployment\windows-desktop-unblock.md
```

## 14. Shutdown Procedure

The best shutdown flow is:

1. finish active work
2. stand down voice if needed
3. open `Desktop`
4. use `Prepare Shutdown`
5. use `Quit Desktop App`

This gives JARVIS a cleaner lifecycle than just abruptly killing the window.

## 15. Best Practices

- Use the desktop app as the main local experience
- Use the web HUD as a fallback or dev path
- Keep the dashboard focused on high-value live information
- Use the dedicated pages instead of trying to do everything from the HUD
- Treat voice features carefully
- Use `System` and `Desktop` first when startup or runtime feels wrong

## 16. Quick Reference

### Start JARVIS

```powershell
.\start_openjarvis.ps1
```

### Start desktop app directly

```powershell
.\start_openjarvis_desktop.ps1
```

### Start web HUD directly

```powershell
.\start_openjarvis_web.ps1
```

### Check desktop readiness

```powershell
.\check_openjarvis_desktop.ps1
```

### Collect desktop report

```powershell
.\collect_openjarvis_desktop_report.ps1
```

## 17. Final Note

JARVIS is now strongest when used as a structured local operator system:

- Dashboard for live command center work
- Workspace for coding
- Briefings for saved analysis
- Operations for business flows
- Desktop for native lifecycle
- System for readiness and diagnostics

That separation is what makes the app cleaner, more user friendly, and easier to trust.
