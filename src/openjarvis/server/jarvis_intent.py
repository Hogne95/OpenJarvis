"""Structured intent parsing and execution for the JARVIS HUD."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openjarvis.tools.web_search import WebSearchTool


class JarvisIntentRequest(BaseModel):
    text: str


class DesktopStateResponse(BaseModel):
    active_window_title: str
    active_process_name: str
    open_windows: list[dict[str, str]]
    active_desktop_target: str
    active_browser_target: str


@dataclass(slots=True)
class ParsedIntent:
    type: str
    action: str
    target: str = ""
    query: str = ""
    content: str = ""
    command: str = ""
    requires_approval: bool = False
    risk: str = "low"
    client_action: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "action": self.action,
            "target": self.target,
            "query": self.query,
            "content": self.content,
            "command": self.command,
            "requires_approval": self.requires_approval,
            "risk": self.risk,
            "client_action": self.client_action,
        }


_URL_TARGETS = {
    "youtube": "https://www.youtube.com",
    "github": "https://github.com",
    "gmail": "https://mail.google.com",
    "calendar": "https://calendar.google.com",
    "spotify": "spotify:",
    "slack": "slack:",
}

_APP_TARGETS = {
    "spotify": "Spotify",
    "chrome": "chrome",
    "edge": "msedge",
    "firefox": "firefox",
    "discord": "Discord",
    "slack": "slack",
    "teams": "Teams",
    "outlook": "outlook",
    "vscode": "code",
    "code": "code",
    "notepad": "notepad",
    "explorer": "explorer",
}

_APP_FOCUS_TARGETS = {
    "spotify": "Spotify",
    "chrome": "Google Chrome",
    "edge": "Microsoft Edge",
    "firefox": "Mozilla Firefox",
    "discord": "Discord",
    "slack": "Slack",
    "teams": "Microsoft Teams",
    "outlook": "Outlook",
    "vscode": "Visual Studio Code",
    "code": "Visual Studio Code",
    "notepad": "Notepad",
    "explorer": "File Explorer",
}


def _downloads_dir() -> Path:
    return Path.home() / "Downloads"


def _quote_ps(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _desktop_app_name(target: str) -> str:
    return _APP_FOCUS_TARGETS.get(target.strip().lower(), target.strip())


def _is_browser_target(target: str) -> bool:
    return target.strip().lower() in {"chrome", "edge", "firefox", "browser", "active browser"}


def _desktop_focus_command(target: str) -> str:
    app_name = _desktop_app_name(target)
    return (
        "powershell -NoProfile -Command "
        "$ws = New-Object -ComObject WScript.Shell; "
        f"if (-not $ws.AppActivate({_quote_ps(app_name)})) {{ throw 'Unable to focus target window.' }}; "
        "Start-Sleep -Milliseconds 250"
    )


def _desktop_copy_command(content: str) -> str:
    return (
        "powershell -NoProfile -Command "
        f"Set-Clipboard -Value {_quote_ps(content)}; "
        "Write-Output 'Clipboard updated.'"
    )


def _desktop_type_command(content: str, target: str = "") -> str:
    actions: list[str] = []
    if target.strip():
        actions.extend(
            [
                "$ws = New-Object -ComObject WScript.Shell",
                f"if (-not $ws.AppActivate({_quote_ps(_desktop_app_name(target))})) {{ throw 'Unable to focus target window.' }}",
                "Start-Sleep -Milliseconds 250",
            ]
        )
    else:
        actions.append("$ws = New-Object -ComObject WScript.Shell")
    actions.extend(
        [
            f"Set-Clipboard -Value {_quote_ps(content)}",
            "Start-Sleep -Milliseconds 120",
            "$ws.SendKeys('^v')",
            "Write-Output 'Text pasted into the active window.'",
        ]
    )
    return "powershell -NoProfile -Command " + "; ".join(actions)


def _desktop_window_state_command(state: str) -> str:
    state_map = {
        "minimize": 6,
        "maximize": 3,
        "restore": 9,
    }
    label_map = {
        "minimize": "Window minimized.",
        "maximize": "Window maximized.",
        "restore": "Window restored.",
    }
    command_id = state_map[state]
    return (
        "powershell -NoProfile -Command "
        "Add-Type @\""
        "using System; "
        "using System.Runtime.InteropServices; "
        "public static class Win32WindowState { "
        "[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); "
        "[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); "
        "} "
        "\"@; "
        "$hwnd = [Win32WindowState]::GetForegroundWindow(); "
        "if ($hwnd -eq [IntPtr]::Zero) { throw 'No active window available.' }; "
        f"[void][Win32WindowState]::ShowWindow($hwnd, {command_id}); "
        f"Write-Output {_quote_ps(label_map[state])}"
    )


def _desktop_show_desktop_command() -> str:
    return (
        "powershell -NoProfile -Command "
        "$shell = New-Object -ComObject Shell.Application; "
        "$shell.ToggleDesktop(); "
        "Write-Output 'Desktop toggled.'"
    )


def _desktop_send_keys_command(keys: str, target: str = "") -> str:
    actions: list[str] = []
    if target.strip():
        actions.extend(
            [
                "$ws = New-Object -ComObject WScript.Shell",
                f"if (-not $ws.AppActivate({_quote_ps(_desktop_app_name(target))})) {{ throw 'Unable to focus target window.' }}",
                "Start-Sleep -Milliseconds 250",
            ]
        )
    else:
        actions.append("$ws = New-Object -ComObject WScript.Shell")
    actions.extend(
        [
            f"$ws.SendKeys({_quote_ps(keys)})",
            "Write-Output 'Shortcut sent.'",
        ]
    )
    return "powershell -NoProfile -Command " + "; ".join(actions)


def _submit_shortcut_for_target(target: str) -> tuple[str, str]:
    cleaned = target.strip().lower()
    if cleaned in {"teams", "outlook", "gmail", "mail", "email"}:
        return "^{ENTER}", "ctrl+enter"
    return "{ENTER}", "enter"


def _desktop_submit_message_command(target: str = "") -> str:
    shortcut, _submit_mode = _submit_shortcut_for_target(target)
    return _desktop_send_keys_command(shortcut, target)


def _desktop_media_key_command(key_code: int, label: str) -> str:
    return (
        "powershell -NoProfile -Command "
        "Add-Type @\""
        "using System; "
        "using System.Runtime.InteropServices; "
        "public static class MediaKeySender { "
        "[DllImport(\"user32.dll\", SetLastError=true)] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo); "
        "} "
        "\"@; "
        f"[MediaKeySender]::keybd_event([byte]{key_code}, 0, 0, 0); "
        f"[MediaKeySender]::keybd_event([byte]{key_code}, 0, 2, 0); "
        f"Write-Output {_quote_ps(label)}"
    )


def _desktop_open_url_command(url: str, target: str = "") -> str:
    cleaned_url = url.strip()
    if cleaned_url and not re.match(r"^[a-z]+://", cleaned_url, re.IGNORECASE):
        cleaned_url = f"https://{cleaned_url}"
    browser_target = target.strip().lower()
    if browser_target in {"chrome", "edge", "firefox"}:
        process_name = _APP_TARGETS.get(browser_target, browser_target)
        return (
            "powershell -NoProfile -Command "
            f"Start-Process {_quote_ps(process_name)} -ArgumentList {_quote_ps(cleaned_url)}; "
            f"Write-Output {_quote_ps(f'Opened {cleaned_url} in {browser_target}.')}"
        )
    return (
        "powershell -NoProfile -Command "
        f"Start-Process {_quote_ps(cleaned_url)}; "
        f"Write-Output {_quote_ps(f'Opened {cleaned_url}.')}"
    )


def _desktop_open_path_command(path_value: str, target: str = "explorer") -> str:
    cleaned = path_value.strip()
    return (
        "powershell -NoProfile -Command "
        f"$path = {_quote_ps(cleaned)}; "
        "if (-not (Test-Path -LiteralPath $path)) { throw 'Path does not exist.' }; "
        + (
            f"Start-Process {_quote_ps(_APP_TARGETS.get(target, target))} -ArgumentList {_quote_ps(cleaned)}; "
            if target == "code"
            else f"Start-Process {_quote_ps(cleaned)}; "
        )
        + f"Write-Output {_quote_ps(f'Opened {cleaned}.')}"
    )


def _desktop_clipboard_read_command() -> str:
    return (
        "powershell -NoProfile -Command "
        "$text = Get-Clipboard -Raw -ErrorAction SilentlyContinue; "
        "if ($null -eq $text) { $text = '' }; "
        "Write-Output $text"
    )


def _read_clipboard_text() -> str:
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "$text = Get-Clipboard -Raw -ErrorAction SilentlyContinue; if ($null -eq $text) { $text = '' }; Write-Output $text",
        ],
        capture_output=True,
        text=True,
        timeout=8,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "Clipboard unavailable.").strip())
    return (result.stdout or "").strip()


def _read_selected_text() -> str:
    command = r"""
$ErrorActionPreference = 'Stop'
$ws = New-Object -ComObject WScript.Shell
$previous = Get-Clipboard -Raw -ErrorAction SilentlyContinue
if ($null -eq $previous) { $previous = '' }
Set-Clipboard -Value ''
Start-Sleep -Milliseconds 80
$ws.SendKeys('^c')
Start-Sleep -Milliseconds 180
$selected = Get-Clipboard -Raw -ErrorAction SilentlyContinue
if ($null -eq $selected) { $selected = '' }
Set-Clipboard -Value $previous
Write-Output $selected
"""
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "Selected text unavailable.").strip())
    return (result.stdout or "").strip()


def _read_active_browser_url(target: str = "") -> str:
    resolved = target.strip().lower()
    if resolved not in {"chrome", "edge", "firefox"}:
        resolved = "chrome"
    app_name = _desktop_app_name(resolved)
    escaped_app_name = app_name.replace("'", "''")
    command = (
        "$ErrorActionPreference = 'Stop'; "
        "$ws = New-Object -ComObject WScript.Shell; "
        f"if (-not $ws.AppActivate('{escaped_app_name}')) {{ throw 'Unable to focus browser window.' }}; "
        "Start-Sleep -Milliseconds 220; "
        "$previous = Get-Clipboard -Raw -ErrorAction SilentlyContinue; "
        "if ($null -eq $previous) { $previous = '' }; "
        "Set-Clipboard -Value ''; "
        "Start-Sleep -Milliseconds 60; "
        "$ws.SendKeys('^l'); "
        "Start-Sleep -Milliseconds 90; "
        "$ws.SendKeys('^c'); "
        "Start-Sleep -Milliseconds 180; "
        "$url = Get-Clipboard -Raw -ErrorAction SilentlyContinue; "
        "if ($null -eq $url) { $url = '' }; "
        "Set-Clipboard -Value $previous; "
        "Write-Output $url"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "Active browser URL unavailable.").strip())
    return (result.stdout or "").strip()


def _parse_shortcut_keys(value: str) -> str | None:
    tokens = [token.strip().lower() for token in re.split(r"[\s\-\+]+", value) if token.strip()]
    if not tokens:
        return None

    modifiers = ""
    key = ""
    modifier_map = {
        "ctrl": "^",
        "control": "^",
        "alt": "%",
        "shift": "+",
    }
    special_map = {
        "enter": "{ENTER}",
        "tab": "{TAB}",
        "esc": "{ESC}",
        "escape": "{ESC}",
        "delete": "{DEL}",
        "backspace": "{BACKSPACE}",
        "space": " ",
        "up": "{UP}",
        "down": "{DOWN}",
        "left": "{LEFT}",
        "right": "{RIGHT}",
        "f1": "{F1}",
        "f2": "{F2}",
        "f3": "{F3}",
        "f4": "{F4}",
        "f5": "{F5}",
        "f6": "{F6}",
        "f7": "{F7}",
        "f8": "{F8}",
        "f9": "{F9}",
        "f10": "{F10}",
        "f11": "{F11}",
        "f12": "{F12}",
    }

    for token in tokens:
        if token in modifier_map:
            modifiers += modifier_map[token]
            continue
        if token in special_map:
            key = special_map[token]
            continue
        if len(token) == 1 and re.match(r"[a-z0-9]", token):
            key = token.upper()
            continue
        return None

    if not key:
        return None
    return f"{modifiers}{key}"


def _desktop_state_snapshot(operator_memory=None) -> dict[str, Any]:
    command = r"""
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DesktopWindowInfo {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$handle = [DesktopWindowInfo]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 1024
[void][DesktopWindowInfo]::GetWindowText($handle, $builder, $builder.Capacity)
$pid = 0
[void][DesktopWindowInfo]::GetWindowThreadProcessId($handle, [ref]$pid)
$activeProcess = ''
if ($pid -gt 0) {
  try { $activeProcess = (Get-Process -Id $pid -ErrorAction Stop).ProcessName } catch {}
}
$openWindows = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 } |
  Sort-Object ProcessName |
  Select-Object -First 12 @{Name='title';Expression={$_.MainWindowTitle}}, @{Name='process';Expression={$_.ProcessName}}
[pscustomobject]@{
  active_window_title = $builder.ToString()
  active_process_name = $activeProcess
  open_windows = $openWindows
} | ConvertTo-Json -Depth 4 -Compress
"""
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        capture_output=True,
        text=True,
        timeout=12,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "Desktop state unavailable.").strip())
    raw = result.stdout.strip()
    if not raw:
        raise RuntimeError("Desktop state unavailable.")
    import json

    data = json.loads(raw)
    open_windows = data.get("open_windows") or []
    if isinstance(open_windows, dict):
        open_windows = [open_windows]
    return {
        "active_window_title": str(data.get("active_window_title", "")).strip(),
        "active_process_name": str(data.get("active_process_name", "")).strip(),
        "open_windows": [
            {
                "title": str(item.get("title", "")).strip(),
                "process": str(item.get("process", "")).strip(),
            }
            for item in open_windows
            if str(item.get("title", "")).strip()
        ],
        "active_desktop_target": operator_memory.active_desktop_target() if operator_memory is not None else "",
        "active_browser_target": operator_memory.active_browser_target() if operator_memory is not None else "",
    }


def _target_readiness(target: str, desktop_state: dict[str, Any] | None) -> dict[str, Any]:
    cleaned = target.strip().lower()
    if not cleaned or desktop_state is None:
        return {
            "target_ready": False,
            "target_reason": "No desktop target available.",
        }
    active_title = str(desktop_state.get("active_window_title", "")).lower()
    active_process = str(desktop_state.get("active_process_name", "")).lower()
    focus_name = _desktop_app_name(cleaned).lower()
    process_name = _APP_TARGETS.get(cleaned, cleaned).lower()
    matches = any(
        candidate and (candidate in active_title or candidate == active_process)
        for candidate in {cleaned, focus_name, process_name}
    )
    return {
        "target_ready": matches,
        "target_reason": "Target appears active." if matches else "Target does not appear to be the active window.",
    }


def _submit_message_metadata(target: str, desktop_state: dict[str, Any] | None) -> dict[str, Any]:
    readiness = _target_readiness(target, desktop_state)
    _shortcut, submit_mode = _submit_shortcut_for_target(target)
    cleaned = target.strip().lower() or "the active app"
    if readiness.get("target_ready"):
        readiness["target_reason"] = f"Target appears active. Submit will use {submit_mode} for {cleaned}."
    else:
        readiness["target_reason"] = (
            f"{readiness.get('target_reason', 'Target needs verification.')} "
            f"If approved, submit will use {submit_mode}."
        ).strip()
    readiness["submit_mode"] = submit_mode
    return readiness


def _extract_browser_page_info(desktop_state: dict[str, Any]) -> dict[str, str]:
    active_process = str(desktop_state.get("active_process_name", "")).strip().lower()
    active_title = str(desktop_state.get("active_window_title", "")).strip()
    browser_map = {
        "chrome": "chrome",
        "msedge": "edge",
        "firefox": "firefox",
    }
    browser = browser_map.get(active_process, "")
    page_title = active_title
    if browser and " - " in active_title:
        page_title = active_title.rsplit(" - ", 1)[0].strip()
    return {
        "browser": browser,
        "page_title": page_title,
        "window_title": active_title,
    }


def _extract_active_document_info(desktop_state: dict[str, Any]) -> dict[str, str]:
    active_process = str(desktop_state.get("active_process_name", "")).strip().lower()
    active_title = str(desktop_state.get("active_window_title", "")).strip()
    if not active_title:
        return {
            "app": active_process,
            "document_title": "",
            "window_title": "",
        }

    document_title = active_title
    separators = {
        "code": " - ",
        "notepad": " - ",
        "notepad++": " - ",
        "winword": " - ",
        "excel": " - ",
    }
    separator = separators.get(active_process)
    if separator and separator in active_title:
        document_title = active_title.split(separator, 1)[0].strip()

    return {
        "app": active_process,
        "document_title": document_title,
        "window_title": active_title,
    }


def _browser_shortcut_command(keys: str, target: str = "chrome") -> str:
    return _desktop_send_keys_command(keys, target)


def _browser_search_command(query: str, target: str = "chrome") -> str:
    escaped_query = query.replace('"', '').strip()
    actions = [
        "$ws = New-Object -ComObject WScript.Shell",
        f"if (-not $ws.AppActivate({_quote_ps(_desktop_app_name(target))})) {{ throw 'Unable to focus target window.' }}",
        "Start-Sleep -Milliseconds 250",
        "$ws.SendKeys('^l')",
        "Start-Sleep -Milliseconds 120",
        f"Set-Clipboard -Value {_quote_ps(escaped_query)}",
        "Start-Sleep -Milliseconds 120",
        "$ws.SendKeys('^v')",
        "Start-Sleep -Milliseconds 80",
        "$ws.SendKeys('{ENTER}')",
        f"Write-Output {_quote_ps(f'Searched browser for: {escaped_query}')}",
    ]
    return "powershell -NoProfile -Command " + "; ".join(actions)


def _vscode_search_command(query: str) -> str:
    escaped_query = query.replace('"', '').strip()
    actions = [
        "$ws = New-Object -ComObject WScript.Shell",
        f"if (-not $ws.AppActivate({_quote_ps(_desktop_app_name('vscode'))})) {{ throw 'Unable to focus target window.' }}",
        "Start-Sleep -Milliseconds 250",
        "$ws.SendKeys('^+f')",
        "Start-Sleep -Milliseconds 180",
        f"Set-Clipboard -Value {_quote_ps(escaped_query)}",
        "Start-Sleep -Milliseconds 120",
        "$ws.SendKeys('^v')",
        f"Write-Output {_quote_ps(f'Opened VS Code search for: {escaped_query}')}",
    ]
    return "powershell -NoProfile -Command " + "; ".join(actions)


def _vscode_palette_command(query: str = "") -> str:
    actions = [
        "$ws = New-Object -ComObject WScript.Shell",
        f"if (-not $ws.AppActivate({_quote_ps(_desktop_app_name('vscode'))})) {{ throw 'Unable to focus target window.' }}",
        "Start-Sleep -Milliseconds 250",
        "$ws.SendKeys('^+p')",
    ]
    cleaned = query.replace('"', '').strip()
    if cleaned:
        actions.extend(
            [
                "Start-Sleep -Milliseconds 180",
                f"Set-Clipboard -Value {_quote_ps(cleaned)}",
                "Start-Sleep -Milliseconds 120",
                "$ws.SendKeys('^v')",
            ]
        )
    actions.append(f"Write-Output {_quote_ps('Opened VS Code command palette.')}")
    return "powershell -NoProfile -Command " + "; ".join(actions)


def _resolve_desktop_target(intent: ParsedIntent, operator_memory) -> ParsedIntent:
    if operator_memory is None or intent.type != "desktop":
        return intent

    target = intent.target.strip()
    if intent.action.startswith("browser_"):
        resolved = target
        if not resolved or resolved.lower() == "active browser":
            resolved = operator_memory.active_browser_target() or "chrome"
        intent.target = resolved
        if intent.action == "browser_search":
            intent.command = _browser_search_command(intent.query or intent.content, resolved)
        elif intent.action == "browser_search_selection":
            query = _read_selected_text()
            if not query:
                raise HTTPException(status_code=400, detail="No selected text available.")
            intent.query = query
            intent.command = _browser_search_command(query, resolved)
        elif intent.action == "browser_search_clipboard":
            query = _read_clipboard_text()
            if not query:
                raise HTTPException(status_code=400, detail="Clipboard is empty.")
            intent.query = query
            intent.command = _browser_search_command(query, resolved)
        elif intent.action == "browser_open_url":
            intent.command = _desktop_open_url_command(intent.query or intent.content, resolved)
        elif intent.action == "browser_open_clipboard_url":
            url = _read_clipboard_text()
            if not url:
                raise HTTPException(status_code=400, detail="Clipboard is empty.")
            intent.query = url
            intent.command = _desktop_open_url_command(url, resolved)
        elif intent.action == "browser_open_selection_url":
            url = _read_selected_text()
            if not url:
                raise HTTPException(status_code=400, detail="No selected text available.")
            intent.query = url
            intent.command = _desktop_open_url_command(url, resolved)
        elif intent.action == "browser_copy_url":
            url = _read_active_browser_url(resolved)
            if not url:
                raise HTTPException(status_code=400, detail="No active browser URL available.")
            intent.query = url
            intent.content = url
            intent.command = _desktop_copy_command(url)
        else:
            intent.command = _browser_shortcut_command(_extract_sendkeys_payload(intent.command), resolved)
        return intent

    if intent.action in {
        "paste_text",
        "send_shortcut",
        "submit_message",
        "compose_message",
        "compose_clipboard_message",
        "compose_selection_message",
    } and not target:
        resolved = operator_memory.active_desktop_target()
        if resolved:
            intent.target = resolved
            if intent.action == "paste_text":
                intent.command = _desktop_type_command(intent.content, resolved)
            elif intent.action == "send_shortcut":
                shortcut = _parse_shortcut_keys(intent.content)
                if shortcut:
                    intent.command = _desktop_send_keys_command(shortcut, resolved)
            elif intent.action == "submit_message":
                intent.command = _desktop_submit_message_command(resolved)
            else:
                intent.command = _desktop_type_command(intent.content, resolved)
        elif intent.action == "submit_message":
            return intent
    if intent.action == "compose_clipboard_message":
        content = _read_clipboard_text()
        if not content:
            raise HTTPException(status_code=400, detail="Clipboard is empty.")
        intent.content = content
        resolved_target = intent.target.strip() or operator_memory.active_desktop_target()
        if resolved_target:
            intent.target = resolved_target
            intent.command = _desktop_type_command(content, resolved_target)
        else:
            intent.command = _desktop_type_command(content)
        return intent

    if intent.action == "compose_selection_message":
        content = _read_selected_text()
        if not content:
            raise HTTPException(status_code=400, detail="No selected text available.")
        intent.content = content
        resolved_target = intent.target.strip() or operator_memory.active_desktop_target()
        if resolved_target:
            intent.target = resolved_target
            intent.command = _desktop_type_command(content, resolved_target)
        else:
            intent.command = _desktop_type_command(content)
        return intent

    if intent.action == "editor_search_clipboard":
        query = _read_clipboard_text()
        if not query:
            raise HTTPException(status_code=400, detail="Clipboard is empty.")
        intent.query = query
        intent.command = _vscode_search_command(query)
        return intent

    if intent.action == "editor_search_selection":
        query = _read_selected_text()
        if not query:
            raise HTTPException(status_code=400, detail="No selected text available.")
        intent.query = query
        intent.command = _vscode_search_command(query)
        return intent

    return intent


def _extract_sendkeys_payload(command: str) -> str:
    match = re.search(r"\$ws\.SendKeys\('([^']*)'\)", command)
    if match:
        return match.group(1)
    match = re.search(r"\$ws\.SendKeys\(\"([^\"]*)\"\)", command)
    if match:
        return match.group(1)
    return ""


def _parse_intent(text: str) -> ParsedIntent:
    raw = text.strip()
    lowered = raw.lower()

    memory_store_match = re.match(r"^(remember(?:\s+this)?|note(?:\s+that)?)\s+(.+)$", raw, re.IGNORECASE)
    if memory_store_match:
        return ParsedIntent(
            type="memory",
            action="store",
            content=memory_store_match.group(2).strip(),
        )

    memory_recall_match = re.match(
        r"^(what do you know about|what do you remember about|recall)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if memory_recall_match:
        return ParsedIntent(
            type="memory",
            action="recall",
            query=memory_recall_match.group(2).strip(),
        )

    memory_forget_match = re.match(r"^(forget|remove memory about|delete memory about)\s+(.+)$", raw, re.IGNORECASE)
    if memory_forget_match:
        return ParsedIntent(
            type="memory",
            action="forget",
            query=memory_forget_match.group(2).strip(),
        )

    if re.match(r"^(show|list)(?: my)? memories$", lowered) or lowered in {"memory list", "show memory"}:
        return ParsedIntent(
            type="memory",
            action="list",
        )

    search_match = re.match(
        r"^(search(?: the)? web for|search for|look up|summarize latest(?: news)? about)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if search_match:
        return ParsedIntent(
            type="web",
            action="search",
            query=search_match.group(2).strip(),
        )

    if re.match(r"^(what app is active|what window is active|active window|desktop status)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="state",
            risk="low",
        )

    if re.match(r"^(what page is active|active page|active tab|what tab is active)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_page_state",
            risk="low",
        )

    if re.match(r"^(what file is active|what document is active|active file|active document)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="document_state",
            risk="low",
        )

    if re.match(r"^(what url is active|active url|current url|page url)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_url_state",
            risk="low",
        )

    if re.match(r"^(remember active page|remember this page|save active page)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_remember_page",
            risk="low",
        )

    if re.match(r"^(remember active document|remember this document|save active file|save active document)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="document_remember",
            risk="low",
        )

    if re.match(r"^(copy active url|copy page url|copy current url)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_copy_url",
            target="active browser",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(what is on my clipboard|show clipboard|clipboard status|clipboard)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="clipboard_read",
            risk="low",
        )

    if re.match(r"^(what text is selected|selected text|what is selected)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="selected_text_read",
            risk="low",
        )

    if re.match(r"^(remember clipboard|save clipboard)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="remember_clipboard",
            risk="low",
        )

    if re.match(r"^(remember selected text|save selected text)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="remember_selection",
            risk="low",
        )

    if re.match(r"^(search clipboard in browser|search browser for clipboard|look up clipboard)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_search_clipboard",
            target="active browser",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(search selected text in browser|look up selected text|search browser for selected text)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_search_selection",
            target="active browser",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(search project for selected text|find selected text in project)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="editor_search_selection",
            target="vscode",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(open clipboard as url|browse clipboard|go to clipboard url)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_open_clipboard_url",
            target="active browser",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(open selected text as url|browse selected text|go to selected text url)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="browser_open_selection_url",
            target="active browser",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(search project for clipboard|find clipboard in project)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="editor_search_clipboard",
            target="vscode",
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(use|lock) active window as target$", lowered):
        return ParsedIntent(
            type="desktop",
            action="lock_active_target",
            risk="low",
        )

    clear_target_match = re.match(r"^(clear|reset) (desktop )?target$", lowered)
    if clear_target_match:
        return ParsedIntent(
            type="desktop",
            action="clear_target",
            risk="low",
        )

    use_browser_match = re.match(r"^(use|set) (chrome|edge|firefox) as (?:the )?browser target$", lowered)
    if use_browser_match:
        target = use_browser_match.group(2).strip().lower()
        return ParsedIntent(
            type="desktop",
            action="set_browser_target",
            target=target,
            risk="low",
        )

    if re.match(r"^(list open apps|what apps are open|open windows|list windows)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="list_windows",
            risk="low",
        )

    browser_search_match = re.match(
        r"^(search (?:the )?(?:browser|web) for|search browser for|look for)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if browser_search_match:
        return ParsedIntent(
            type="desktop",
            action="browser_search",
            target="active browser",
            query=browser_search_match.group(2).strip(),
            command=_browser_search_command(browser_search_match.group(2).strip(), "chrome"),
            requires_approval=True,
            risk="medium",
        )

    go_to_match = re.match(r"^(go to|open url|browse to)\s+(.+)$", raw, re.IGNORECASE)
    if go_to_match:
        target_url = go_to_match.group(2).strip()
        return ParsedIntent(
            type="desktop",
            action="browser_open_url",
            target="active browser",
            query=target_url,
            command=_desktop_open_url_command(target_url),
            requires_approval=True,
            risk="medium",
        )

    open_in_code_match = re.match(r"^(open|launch) (.+?) in (vs code|vscode|code)$", raw, re.IGNORECASE)
    if open_in_code_match:
        path_value = open_in_code_match.group(2).strip().strip('"')
        return ParsedIntent(
            type="desktop",
            action="open_in_code",
            target="code",
            query=path_value,
            content=path_value,
            command=_desktop_open_path_command(path_value, "code"),
            requires_approval=True,
            risk="medium",
        )

    reveal_in_explorer_match = re.match(r"^(reveal|open) (.+?) in explorer$", raw, re.IGNORECASE)
    if reveal_in_explorer_match:
        path_value = reveal_in_explorer_match.group(2).strip().strip('"')
        return ParsedIntent(
            type="desktop",
            action="open_in_explorer",
            target="explorer",
            query=path_value,
            content=path_value,
            command=_desktop_open_path_command(path_value, "explorer"),
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(what'?s on my screen|describe my screen|screen summary|analyze my screen)$", lowered):
        return ParsedIntent(
            type="vision",
            action="capture_screen",
            client_action="capture_screen",
            risk="low",
        )

    if re.match(r"^(what'?s on my screens|describe my screens|screen overview|analyze my screens|all screens)$", lowered):
        return ParsedIntent(
            type="vision",
            action="capture_screens",
            client_action="capture_screens",
            risk="low",
        )

    if re.match(
        r"^(analyze|describe|inspect)(?: this)? (image|photo|picture|screenshot)$",
        lowered,
    ) or lowered in {"upload image", "analyze image", "describe image"}:
        return ParsedIntent(
            type="vision",
            action="upload_image",
            client_action="upload_image",
            risk="low",
        )

    focus_match = re.match(r"^(focus|switch to|activate)\s+(.+)$", raw, re.IGNORECASE)
    if focus_match:
        target = focus_match.group(2).strip()
        return ParsedIntent(
            type="desktop",
            action="focus_window",
            target=target,
            command=_desktop_focus_command(target),
            requires_approval=True,
            risk="medium",
        )

    copy_match = re.match(r"^(copy|copy this|copy text)\s+(.+)$", raw, re.IGNORECASE)
    if copy_match:
        content = copy_match.group(2).strip().strip('"')
        return ParsedIntent(
            type="desktop",
            action="copy_to_clipboard",
            content=content,
            command=_desktop_copy_command(content),
            requires_approval=True,
            risk="low",
        )

    type_into_match = re.match(
        r"^(type|paste)\s+(.+?)\s+(?:into|in|to)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if type_into_match:
        content = type_into_match.group(2).strip().strip('"')
        target = type_into_match.group(3).strip()
        return ParsedIntent(
            type="desktop",
            action="type_text",
            target=target,
            content=content,
            command=_desktop_type_command(content, target),
            requires_approval=True,
            risk="high",
        )

    draft_into_match = re.match(
        r"^(draft|compose)\s+(.+?)\s+(?:into|in|to)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if draft_into_match:
        content = draft_into_match.group(2).strip().strip('"')
        target = draft_into_match.group(3).strip()
        return ParsedIntent(
            type="desktop",
            action="compose_message",
            target=target,
            content=content,
            command=_desktop_type_command(content, target),
            requires_approval=True,
            risk="high",
        )

    draft_clipboard_match = re.match(
        r"^(draft|compose) clipboard(?: text)?\s+(?:into|in|to)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if draft_clipboard_match:
        target = draft_clipboard_match.group(2).strip()
        return ParsedIntent(
            type="desktop",
            action="compose_clipboard_message",
            target=target,
            requires_approval=True,
            risk="high",
        )

    draft_selection_match = re.match(
        r"^(draft|compose) selected text\s+(?:into|in|to)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if draft_selection_match:
        target = draft_selection_match.group(2).strip()
        return ParsedIntent(
            type="desktop",
            action="compose_selection_message",
            target=target,
            requires_approval=True,
            risk="high",
        )

    submit_message_match = re.match(r"^(submit|send) message(?: (?:in|into|to)\s+(.+))?$", raw, re.IGNORECASE)
    if submit_message_match:
        target = (submit_message_match.group(2) or "").strip()
        return ParsedIntent(
            type="desktop",
            action="submit_message",
            target=target,
            content="enter",
            command=_desktop_submit_message_command(target),
            requires_approval=True,
            risk="high",
        )

    type_match = re.match(r"^(type|paste)\s+(.+)$", raw, re.IGNORECASE)
    if type_match:
        content = type_match.group(2).strip().strip('"')
        return ParsedIntent(
            type="desktop",
            action="paste_text",
            content=content,
            command=_desktop_type_command(content),
            requires_approval=True,
            risk="high",
        )

    if re.match(r"^(show desktop|toggle desktop)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="show_desktop",
            command=_desktop_show_desktop_command(),
            requires_approval=True,
            risk="medium",
        )

    window_state_match = re.match(r"^(minimize|maximize|restore)(?: (?:the )?(?:current )?window)?$", lowered)
    if window_state_match:
        action = window_state_match.group(1)
        return ParsedIntent(
            type="desktop",
            action=f"{action}_window",
            command=_desktop_window_state_command(action),
            requires_approval=True,
            risk="medium",
        )

    shortcut_into_match = re.match(
        r"^(press|send shortcut)\s+(.+?)\s+(?:in|into|to)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if shortcut_into_match:
        shortcut = _parse_shortcut_keys(shortcut_into_match.group(2))
        target = shortcut_into_match.group(3).strip()
        if shortcut:
            return ParsedIntent(
                type="desktop",
                action="send_shortcut",
                target=target,
                content=shortcut_into_match.group(2).strip(),
                command=_desktop_send_keys_command(shortcut, target),
                requires_approval=True,
                risk="high",
            )

    shortcut_match = re.match(r"^(press|send shortcut)\s+(.+)$", raw, re.IGNORECASE)
    if shortcut_match:
        shortcut = _parse_shortcut_keys(shortcut_match.group(2))
        if shortcut:
            return ParsedIntent(
                type="desktop",
                action="send_shortcut",
                content=shortcut_match.group(2).strip(),
                command=_desktop_send_keys_command(shortcut),
                requires_approval=True,
                risk="high",
            )

    browser_shortcuts = [
        (r"^(refresh|reload)(?: page| tab| browser)?$", "browser_refresh", "{F5}", "active browser"),
        (r"^(new tab|open new tab)$", "browser_new_tab", "^T", "active browser"),
        (r"^(close tab|close current tab)$", "browser_close_tab", "^W", "active browser"),
        (r"^(reopen tab|reopen closed tab)$", "browser_reopen_tab", "^+T", "active browser"),
        (r"^(go back|browser back|back page)$", "browser_back", "%{LEFT}", "active browser"),
        (r"^(go forward|browser forward|forward page)$", "browser_forward", "%{RIGHT}", "active browser"),
        (r"^(focus address bar|address bar)$", "browser_address_bar", "^L", "active browser"),
        (r"^(open devtools|browser devtools|toggle devtools)$", "browser_devtools", "^+I", "active browser"),
    ]
    for pattern, action, keys, target in browser_shortcuts:
        if re.match(pattern, lowered):
            return ParsedIntent(
                type="desktop",
                action=action,
                target=target,
                command=_browser_shortcut_command(keys),
                requires_approval=True,
                risk="medium",
            )

    if lowered in {"play pause", "pause music", "resume music", "toggle media"}:
        return ParsedIntent(
            type="desktop",
            action="media_play_pause",
            command=_desktop_media_key_command(0xB3, "Play/pause toggled."),
            requires_approval=True,
            risk="low",
        )

    if lowered in {"next track", "skip track", "next song"}:
        return ParsedIntent(
            type="desktop",
            action="media_next_track",
            command=_desktop_media_key_command(0xB0, "Skipped to next track."),
            requires_approval=True,
            risk="low",
        )

    if lowered in {"previous track", "previous song", "last track"}:
        return ParsedIntent(
            type="desktop",
            action="media_previous_track",
            command=_desktop_media_key_command(0xB1, "Moved to previous track."),
            requires_approval=True,
            risk="low",
        )

    if lowered in {"mute", "mute volume", "toggle mute"}:
        return ParsedIntent(
            type="desktop",
            action="media_mute",
            command=_desktop_media_key_command(0xAD, "Mute toggled."),
            requires_approval=True,
            risk="low",
        )

    if lowered in {"volume up", "turn volume up"}:
        return ParsedIntent(
            type="desktop",
            action="media_volume_up",
            command=_desktop_media_key_command(0xAF, "Volume increased."),
            requires_approval=True,
            risk="low",
        )

    if lowered in {"volume down", "turn volume down"}:
        return ParsedIntent(
            type="desktop",
            action="media_volume_down",
            command=_desktop_media_key_command(0xAE, "Volume decreased."),
            requires_approval=True,
            risk="low",
        )

    editor_search_match = re.match(
        r"^(search (?:the )?(?:project|repo|workspace) for|find in project)\s+(.+)$",
        raw,
        re.IGNORECASE,
    )
    if editor_search_match:
        return ParsedIntent(
            type="desktop",
            action="editor_search",
            target="vscode",
            query=editor_search_match.group(2).strip(),
            command=_vscode_search_command(editor_search_match.group(2).strip()),
            requires_approval=True,
            risk="medium",
        )

    if re.match(r"^(open command palette|command palette)$", lowered):
        return ParsedIntent(
            type="desktop",
            action="editor_palette",
            target="vscode",
            command=_vscode_palette_command(),
            requires_approval=True,
            risk="medium",
        )

    palette_query_match = re.match(r"^(run|open) command palette for\s+(.+)$", raw, re.IGNORECASE)
    if palette_query_match:
        return ParsedIntent(
            type="desktop",
            action="editor_palette",
            target="vscode",
            query=palette_query_match.group(2).strip(),
            command=_vscode_palette_command(palette_query_match.group(2).strip()),
            requires_approval=True,
            risk="medium",
        )

    open_match = re.match(r"^(open|start|launch)\s+(.+)$", raw, re.IGNORECASE)
    if open_match:
        target = open_match.group(2).strip().lower()
        if target in _URL_TARGETS:
            command = f"powershell -NoProfile -Command Start-Process {_quote_ps(_URL_TARGETS[target])}"
        elif target in ("downloads", "documents", "desktop"):
            folder = Path.home() / target.capitalize()
            command = f"powershell -NoProfile -Command Start-Process {_quote_ps(str(folder))}"
        else:
            command = f"powershell -NoProfile -Command Start-Process {_quote_ps(_APP_TARGETS.get(target, target))}"
        return ParsedIntent(
            type="system",
            action="open",
            target=target,
            command=command,
            requires_approval=True,
            risk="medium",
        )

    close_match = re.match(r"^(close|quit|stop)\s+(.+)$", raw, re.IGNORECASE)
    if close_match:
        target = close_match.group(2).strip().lower()
        process_name = _APP_TARGETS.get(target, target)
        command = (
            "powershell -NoProfile -Command "
            f"Get-Process -Name {_quote_ps(process_name)} -ErrorAction SilentlyContinue | Stop-Process -Force"
        )
        return ParsedIntent(
            type="system",
            action="close",
            target=target,
            command=command,
            requires_approval=True,
            risk="high",
        )

    if "biggest files" in lowered or "largest files" in lowered:
        downloads = _downloads_dir()
        command = (
            "powershell -NoProfile -Command "
            f"Get-ChildItem -LiteralPath {_quote_ps(str(downloads))} -File -Recurse -ErrorAction SilentlyContinue | "
            "Sort-Object Length -Descending | "
            "Select-Object -First 20 FullName,@{Name='SizeMB';Expression={[math]::Round($_.Length / 1MB, 2)}}"
        )
        return ParsedIntent(
            type="filesystem",
            action="largest_files",
            target=str(downloads),
            command=command,
            requires_approval=True,
            risk="low",
        )

    if "find all pdf" in lowered or "find pdf" in lowered:
        downloads = _downloads_dir()
        command = (
            "powershell -NoProfile -Command "
            f"Get-ChildItem -LiteralPath {_quote_ps(str(downloads))} -Filter *.pdf -File -Recurse "
            "-ErrorAction SilentlyContinue | Select-Object FullName,LastWriteTime"
        )
        return ParsedIntent(
            type="filesystem",
            action="find_pdfs",
            target=str(downloads),
            command=command,
            requires_approval=True,
            risk="low",
        )

    if "organize my downloads" in lowered or "organize downloads" in lowered:
        downloads = _downloads_dir()
        command = (
            "powershell -NoProfile -Command "
            f"$root={_quote_ps(str(downloads))}; "
            "Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue | "
            "ForEach-Object { "
            "$ext = if ([string]::IsNullOrWhiteSpace($_.Extension)) { 'no_extension' } else { $_.Extension.TrimStart('.').ToLower() }; "
            "$dest = Join-Path $root $ext; "
            "New-Item -ItemType Directory -Path $dest -Force | Out-Null; "
            "Move-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $_.Name) -Force }"
        )
        return ParsedIntent(
            type="filesystem",
            action="organize_downloads",
            target=str(downloads),
            command=command,
            requires_approval=True,
            risk="medium",
        )

    if "clean temp" in lowered or "clean temporary" in lowered:
        command = (
            "powershell -NoProfile -Command "
            "$limit=(Get-Date).AddDays(-7); "
            "Get-ChildItem -LiteralPath $env:TEMP -File -Recurse -ErrorAction SilentlyContinue | "
            "Where-Object { $_.LastWriteTime -lt $limit } | "
            "Remove-Item -Force -ErrorAction SilentlyContinue"
        )
        return ParsedIntent(
            type="filesystem",
            action="clean_temp",
            target="TEMP",
            command=command,
            requires_approval=True,
            risk="high",
        )

    return ParsedIntent(type="unknown", action="inspect", query=raw, risk="low")


def _memory_backend():
    from openjarvis.tools.storage.sqlite import SQLiteMemory

    return SQLiteMemory()


def _extract_search_sources(content: str) -> list[dict[str, str]]:
    chunks = [chunk.strip() for chunk in content.split("\n\n") if chunk.strip()]
    items: list[dict[str, str]] = []
    index = 0
    while index + 2 < len(chunks):
      title = chunks[index]
      url = chunks[index + 1]
      snippet = chunks[index + 2]
      if title.startswith("**") and title.endswith("**") and url.startswith("http"):
          items.append(
              {
                  "title": title.strip("*"),
                  "url": url.strip(),
                  "snippet": snippet.strip(),
              }
          )
          index += 3
      else:
          index += 1
    return items[:6]


def create_jarvis_intent_router() -> APIRouter:
    router = APIRouter(prefix="/v1/jarvis", tags=["jarvis"])

    @router.post("/intent")
    async def parse_jarvis_intent(req: JarvisIntentRequest):
        intent = _parse_intent(req.text)
        return {"intent": intent.to_dict()}

    @router.get("/desktop/state", response_model=DesktopStateResponse)
    async def desktop_state(request: Request):
        operator_memory = getattr(request.app.state, "operator_memory", None)
        try:
            return _desktop_state_snapshot(operator_memory)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @router.post("/intent/execute")
    async def execute_jarvis_intent(req: JarvisIntentRequest, request: Request):
        intent = _parse_intent(req.text)
        operator_memory = getattr(request.app.state, "operator_memory", None)
        intent = _resolve_desktop_target(intent, operator_memory)
        payload = intent.to_dict()

        if intent.type == "memory" and intent.action == "store":
            created_at = datetime.now(timezone.utc).isoformat()
            if operator_memory is not None:
                operator_memory.add_explicit_memory(intent.content, created_at=created_at)
            backend = _memory_backend()
            backend.store(
                intent.content,
                metadata={
                    "kind": "explicit_memory",
                    "created_at": created_at,
                },
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": "Memory stored.",
                "result": {"content": intent.content, "items": operator_memory.search_explicit_memories("", limit=5) if operator_memory else []},
            }

        if intent.type == "memory" and intent.action == "recall":
            items: list[dict[str, Any]]
            if operator_memory is not None:
                explicit = operator_memory.search_explicit_memories(intent.query, limit=5)
                items = [
                    {
                        "content": item["content"],
                        "score": 1.0,
                        "metadata": {
                            "memory_id": item["id"],
                            "created_at": item.get("created_at", ""),
                            "kind": "explicit_memory",
                            "tags": item.get("tags", []),
                        },
                    }
                    for item in explicit
                ]
            else:
                backend = _memory_backend()
                results = backend.search(intent.query, top_k=5)
                items = [
                    {
                        "content": item.content,
                        "score": item.score,
                        "metadata": item.metadata,
                    }
                    for item in results
                ]
            return {
                "intent": payload,
                "status": "completed",
                "message": "Memory lookup complete.",
                "result": {"items": items},
            }

        if intent.type == "memory" and intent.action == "list":
            items = []
            if operator_memory is not None:
                items = [
                    {
                        "content": item["content"],
                        "score": 1.0,
                        "metadata": {
                            "memory_id": item["id"],
                            "created_at": item.get("created_at", ""),
                            "kind": "explicit_memory",
                            "tags": item.get("tags", []),
                        },
                    }
                    for item in operator_memory.search_explicit_memories("", limit=12)
                ]
            return {
                "intent": payload,
                "status": "completed",
                "message": "Memory list ready.",
                "result": {"items": items},
            }

        if intent.type == "memory" and intent.action == "forget":
            if operator_memory is None:
                raise HTTPException(status_code=503, detail="Operator memory not configured")
            outcome = operator_memory.delete_explicit_memory(intent.query)
            return {
                "intent": payload,
                "status": "completed",
                "message": f"Removed {outcome['deleted']} memory item(s)." if outcome["deleted"] else "No matching memory found.",
                "result": {
                    "content": intent.query,
                    "items": [
                        {
                            "content": item["content"],
                            "score": 1.0,
                            "metadata": {
                                "memory_id": item["id"],
                                "created_at": item.get("created_at", ""),
                                "kind": "explicit_memory",
                                "tags": item.get("tags", []),
                            },
                        }
                        for item in outcome["snapshot"].get("explicit_memories", [])[:8]
                    ],
                },
            }

        if intent.type == "web" and intent.action == "search":
            tool = WebSearchTool()
            result = tool.execute(query=intent.query, max_results=6)
            if not result.success:
                raise HTTPException(status_code=400, detail=str(result.content))
            return {
                "intent": payload,
                "status": "completed",
                "message": "Web search complete.",
                "result": {
                    "content": str(result.content),
                    "metadata": result.metadata,
                    "sources": _extract_search_sources(str(result.content)),
                },
            }

        if intent.type == "desktop" and intent.action in {"state", "list_windows"}:
            desktop_state = _desktop_state_snapshot(operator_memory)
            items = [
                {
                    "content": f"{item['process']}: {item['title']}",
                    "score": 1.0,
                    "metadata": item,
                }
                for item in desktop_state["open_windows"]
            ]
            active_line = desktop_state["active_window_title"] or desktop_state["active_process_name"] or "No active window detected."
            return {
                "intent": payload,
                "status": "completed",
                "message": "Desktop state ready.",
                "result": {
                    "content": active_line,
                    "metadata": {
                        "active_window_title": desktop_state["active_window_title"],
                        "active_process_name": desktop_state["active_process_name"],
                        "active_desktop_target": desktop_state["active_desktop_target"],
                        "active_browser_target": desktop_state["active_browser_target"],
                    },
                    "items": items[:8],
                },
            }

        if intent.type == "desktop" and intent.action == "browser_page_state":
            desktop_state = _desktop_state_snapshot(operator_memory)
            page_info = _extract_browser_page_info(desktop_state)
            if not page_info["browser"]:
                return {
                    "intent": payload,
                    "status": "completed",
                    "message": "No active browser detected.",
                    "result": {
                        "content": desktop_state.get("active_window_title", "") or "No active browser detected.",
                        "metadata": {
                            "browser": "",
                            "page_title": "",
                            "window_title": desktop_state.get("active_window_title", ""),
                        },
                    },
                }
            return {
                "intent": payload,
                "status": "completed",
                "message": "Active page ready.",
                "result": {
                    "content": page_info["page_title"] or page_info["window_title"],
                    "metadata": page_info,
                },
            }

        if intent.type == "desktop" and intent.action == "document_state":
            desktop_state = _desktop_state_snapshot(operator_memory)
            document_info = _extract_active_document_info(desktop_state)
            if not document_info["document_title"]:
                return {
                    "intent": payload,
                    "status": "completed",
                    "message": "No active document detected.",
                    "result": {
                        "content": desktop_state.get("active_window_title", "") or "No active document detected.",
                        "metadata": document_info,
                    },
                }
            return {
                "intent": payload,
                "status": "completed",
                "message": "Active document ready.",
                "result": {
                    "content": document_info["document_title"],
                    "metadata": document_info,
                },
            }

        if intent.type == "desktop" and intent.action == "browser_url_state":
            desktop_state = _desktop_state_snapshot(operator_memory)
            page_info = _extract_browser_page_info(desktop_state)
            browser_target = page_info["browser"] or (operator_memory.active_browser_target() if operator_memory is not None else "")
            if not browser_target:
                return {
                    "intent": payload,
                    "status": "completed",
                    "message": "No active browser detected.",
                    "result": {
                        "content": desktop_state.get("active_window_title", "") or "No active browser detected.",
                        "metadata": {
                            "browser": "",
                            "page_title": page_info.get("page_title", ""),
                            "page_url": "",
                        },
                    },
                }
            try:
                page_url = _read_active_browser_url(browser_target)
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            return {
                "intent": payload,
                "status": "completed",
                "message": "Active URL ready.",
                "result": {
                    "content": page_url or "No active browser URL available.",
                    "metadata": {
                        "browser": browser_target,
                        "page_title": page_info.get("page_title", ""),
                        "page_url": page_url,
                        "window_title": page_info.get("window_title", ""),
                    },
                },
            }

        if intent.type == "desktop" and intent.action == "browser_remember_page":
            desktop_state = _desktop_state_snapshot(operator_memory)
            page_info = _extract_browser_page_info(desktop_state)
            browser_target = page_info["browser"] or (operator_memory.active_browser_target() if operator_memory is not None else "")
            if not browser_target:
                raise HTTPException(status_code=503, detail="No active browser detected")
            try:
                page_url = _read_active_browser_url(browser_target)
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            memory_line = f"Active page in {browser_target}: {page_info.get('page_title', '')} — {page_url}".strip()
            created_at = datetime.now(timezone.utc).isoformat()
            if operator_memory is not None:
                operator_memory.add_explicit_memory(
                    memory_line,
                    tags=["browser", "page", browser_target],
                    created_at=created_at,
                )
            backend = _memory_backend()
            backend.store(
                memory_line,
                metadata={
                    "kind": "explicit_memory",
                    "created_at": created_at,
                    "tags": ["browser", "page", browser_target],
                },
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": "Active page saved to memory.",
                "result": {
                    "content": memory_line,
                    "metadata": {
                        "browser": browser_target,
                        "page_title": page_info.get("page_title", ""),
                        "page_url": page_url,
                        "window_title": page_info.get("window_title", ""),
                    },
                },
            }

        if intent.type == "desktop" and intent.action == "document_remember":
            desktop_state = _desktop_state_snapshot(operator_memory)
            document_info = _extract_active_document_info(desktop_state)
            if not document_info["document_title"]:
                raise HTTPException(status_code=503, detail="No active document detected")
            memory_line = (
                f"Active document in {document_info.get('app', 'desktop')}: "
                f"{document_info.get('document_title', '')}"
            ).strip()
            created_at = datetime.now(timezone.utc).isoformat()
            if operator_memory is not None:
                operator_memory.add_explicit_memory(
                    memory_line,
                    tags=["desktop", "document", document_info.get("app", "desktop")],
                    created_at=created_at,
                )
            backend = _memory_backend()
            backend.store(
                memory_line,
                metadata={
                    "kind": "explicit_memory",
                    "created_at": created_at,
                    "tags": ["desktop", "document", document_info.get("app", "desktop")],
                },
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": "Active document saved to memory.",
                "result": {
                    "content": memory_line,
                    "metadata": document_info,
                },
            }

        if intent.type == "desktop" and intent.action == "clipboard_read":
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", _desktop_clipboard_read_command().replace("powershell -NoProfile -Command ", "", 1)],
                capture_output=True,
                text=True,
                timeout=8,
            )
            if result.returncode != 0:
                raise HTTPException(status_code=503, detail=(result.stderr or "Clipboard unavailable.").strip())
            content = (result.stdout or "").strip()
            preview = content if len(content) <= 1000 else f"{content[:997]}..."
            return {
                "intent": payload,
                "status": "completed",
                "message": "Clipboard ready.",
                "result": {
                    "content": preview or "Clipboard is empty.",
                    "metadata": {
                        "length": len(content),
                    },
                },
            }

        if intent.type == "desktop" and intent.action == "selected_text_read":
            try:
                selected = _read_selected_text()
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            return {
                "intent": payload,
                "status": "completed",
                "message": "Selected text captured.",
                "result": {
                    "content": selected or "No selected text available.",
                    "metadata": {
                        "length": len(selected),
                    },
                },
            }

        if intent.type == "desktop" and intent.action in {"remember_clipboard", "remember_selection"}:
            try:
                content = _read_clipboard_text() if intent.action == "remember_clipboard" else _read_selected_text()
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            if not content:
                raise HTTPException(
                    status_code=400,
                    detail="Clipboard is empty." if intent.action == "remember_clipboard" else "No selected text available.",
                )
            label = "Clipboard" if intent.action == "remember_clipboard" else "Selected text"
            memory_line = f"{label}: {content}".strip()
            created_at = datetime.now(timezone.utc).isoformat()
            if operator_memory is not None:
                operator_memory.add_explicit_memory(
                    memory_line,
                    tags=["desktop", "clipboard" if intent.action == "remember_clipboard" else "selection"],
                    created_at=created_at,
                )
            backend = _memory_backend()
            backend.store(
                memory_line,
                metadata={
                    "kind": "explicit_memory",
                    "created_at": created_at,
                    "tags": ["desktop", "clipboard" if intent.action == "remember_clipboard" else "selection"],
                },
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": f"{label} saved to memory.",
                "result": {
                    "content": memory_line,
                    "metadata": {
                        "length": len(content),
                    },
                },
            }

        if intent.type == "desktop" and intent.action == "lock_active_target":
            if operator_memory is None:
                raise HTTPException(status_code=503, detail="Operator memory not configured")
            desktop_state = _desktop_state_snapshot(operator_memory)
            active_process = desktop_state.get("active_process_name", "").strip().lower()
            if not active_process:
                raise HTTPException(status_code=503, detail="No active window detected")
            browser = active_process in {"chrome", "msedge", "firefox"}
            browser_target = {
                "msedge": "edge",
                "chrome": "chrome",
                "firefox": "firefox",
            }.get(active_process, "")
            snapshot = operator_memory.update_profile(
                {
                    "active_desktop_target": browser_target or active_process,
                    "active_browser_target": browser_target if browser else operator_memory.active_browser_target(),
                }
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": "Active window locked as target.",
                "result": {
                    "content": desktop_state.get("active_window_title", active_process),
                    "metadata": {
                        "active_process_name": active_process,
                        "active_window_title": desktop_state.get("active_window_title", ""),
                        "profile": snapshot.get("profile", {}),
                    },
                },
            }

        if intent.type == "desktop" and intent.action == "clear_target":
            if operator_memory is None:
                raise HTTPException(status_code=503, detail="Operator memory not configured")
            snapshot = operator_memory.update_profile(
                {
                    "active_desktop_target": "",
                    "active_browser_target": "",
                }
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": "Desktop targets cleared.",
                "result": {
                    "content": "Active desktop and browser targets cleared.",
                    "metadata": snapshot.get("profile", {}),
                },
            }

        if intent.type == "desktop" and intent.action == "set_browser_target":
            if operator_memory is None:
                raise HTTPException(status_code=503, detail="Operator memory not configured")
            snapshot = operator_memory.update_profile(
                {
                    "active_desktop_target": intent.target,
                    "active_browser_target": intent.target,
                }
            )
            return {
                "intent": payload,
                "status": "completed",
                "message": "Browser target updated.",
                "result": {
                    "content": f"Browser target locked to {intent.target}.",
                    "metadata": snapshot.get("profile", {}),
                },
            }

        if intent.type == "vision" and intent.action == "capture_screen":
            return {
                "intent": payload,
                "status": "client_action_required",
                "message": "Screen capture must be completed by the HUD client.",
                "result": {"client_action": "capture_screen"},
            }

        if intent.type == "vision" and intent.action == "upload_image":
            return {
                "intent": payload,
                "status": "client_action_required",
                "message": "Image upload must be completed by the HUD client.",
                "result": {"client_action": "upload_image"},
            }

        if intent.requires_approval:
            manager = getattr(request.app.state, "workbench", None)
            if manager is None:
                raise HTTPException(status_code=503, detail="Workbench manager not configured")
            status = manager.stage(command=intent.command, timeout=60)
            desktop_metadata: dict[str, Any] = {}
            if intent.type == "desktop" and intent.action in {
                "type_text",
                "paste_text",
                "compose_message",
                "compose_clipboard_message",
                "compose_selection_message",
                "send_shortcut",
                "submit_message",
            }:
                try:
                    desktop_state = _desktop_state_snapshot(operator_memory)
                except RuntimeError:
                    desktop_state = None
                desktop_metadata = {
                    **(
                        _submit_message_metadata(intent.target, desktop_state)
                        if intent.action == "submit_message"
                        else _target_readiness(intent.target, desktop_state)
                    ),
                    "active_window_title": desktop_state.get("active_window_title", "") if desktop_state else "",
                    "active_process_name": desktop_state.get("active_process_name", "") if desktop_state else "",
                }
            if operator_memory is not None and intent.type == "desktop" and intent.target.strip():
                operator_memory.update_active_target(
                    intent.target,
                    browser=_is_browser_target(intent.target) or intent.action.startswith("browser_"),
                )
            return {
                "intent": payload,
                "status": "staged",
                "message": desktop_metadata.get("target_reason", "Intent translated into an approval-gated command."),
                "result": {
                    **status,
                    "metadata": desktop_metadata,
                },
            }

        return {
            "intent": payload,
            "status": "unsupported",
            "message": "No direct execution path is configured for this intent yet.",
            "result": {},
        }

    return router


__all__ = ["create_jarvis_intent_router"]
