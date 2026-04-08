---
title: JARVIS Operator Guide
description: Run the local JARVIS HUD, voice workflow, and Windows desktop diagnostics
---

# JARVIS Operator Guide

This repo now includes a local JARVIS-style operator workflow on top of OpenJarvis:

- sci-fi HUD dashboard
- Norwegian + English voice input
- English-only replies
- approval-based actions
- inbox, calendar, task, and workbench flows

## Recommended daily workflow

The most reliable local setup today is the web HUD.

### Start from Windows

Use the repo launcher:

```powershell
cd C:\Users\hogne\OpenJarvis
.\start_openjarvis.ps1
```

Or double-click:

```text
C:\Users\hogne\OpenJarvis\start_openjarvis.bat
```

Choose:

- `1` Start web HUD in Ubuntu
- `2` Check Windows desktop readiness
- `3` Collect desktop report

### What the web launcher does

It opens Ubuntu / WSL windows and runs:

1. backend dependency sync with speech extras
2. `uv run jarvis serve --port 8000`
3. `npm install && npm run dev`

Then it opens:

```text
http://localhost:5173
```

## Voice workflow

The JARVIS voice path is built around:

- HUD reactor mic
- continuous listening loop
- Norwegian + English input hints
- English reply voice
- approval-safe actions

If the reactor mic looks disabled, first check:

1. `Speech-to-Text` is enabled in Settings
2. browser microphone permission is allowed
3. backend speech health is available

## Desktop app status

The native Windows `.exe` path is not blocked by missing JARVIS code.

Current root cause:
- Windows code-execution policy is blocking generated Rust/Tauri build helpers

Use these diagnostics from the repo root:

```powershell
.\check_openjarvis_desktop.ps1
.\check_openjarvis_desktop_policy.ps1
.\collect_openjarvis_desktop_report.ps1
```

The combined report is written to:

```text
C:\Users\hogne\OpenJarvis\desktop-readiness-report.txt
```

See [../deployment/windows-desktop-unblock.md](../deployment/windows-desktop-unblock.md) for the unblock workflow.

## What JARVIS can do now

- live command deck
- approval gate for staged actions
- inbox triage and reply drafting
- calendar planning and create path
- task creation path
- workbench command staging
- daily brief and reminders
- coding presets, repo state, review queue, and project memory

## Safety notes

- approval remains in front of side-effect actions
- voice improvements should not replace working speech behavior unless tested carefully
- desktop packaging work should be treated separately from the working web HUD path
