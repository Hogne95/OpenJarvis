"""Structured intent parsing and execution for the JARVIS HUD."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openjarvis.tools.web_search import WebSearchTool


class JarvisIntentRequest(BaseModel):
    text: str


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


def _browser_shortcut_command(keys: str, target: str = "chrome") -> str:
    return _desktop_send_keys_command(keys, target)


def _resolve_desktop_target(intent: ParsedIntent, operator_memory) -> ParsedIntent:
    if operator_memory is None or intent.type != "desktop":
        return intent

    target = intent.target.strip()
    if intent.action.startswith("browser_"):
        resolved = target
        if not resolved or resolved.lower() == "active browser":
            resolved = operator_memory.active_browser_target() or "chrome"
        intent.target = resolved
        intent.command = _browser_shortcut_command(_extract_sendkeys_payload(intent.command), resolved)
        return intent

    if intent.action in {"paste_text", "send_shortcut"} and not target:
        resolved = operator_memory.active_desktop_target()
        if resolved:
            intent.target = resolved
            if intent.action == "paste_text":
                intent.command = _desktop_type_command(intent.content, resolved)
            elif intent.action == "send_shortcut":
                shortcut = _parse_shortcut_keys(intent.content)
                if shortcut:
                    intent.command = _desktop_send_keys_command(shortcut, resolved)
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

    if re.match(r"^(what'?s on my screen|describe my screen|screen summary|analyze my screen)$", lowered):
        return ParsedIntent(
            type="vision",
            action="capture_screen",
            client_action="capture_screen",
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
        (r"^(go back|browser back|back page)$", "browser_back", "%{LEFT}", "active browser"),
        (r"^(go forward|browser forward|forward page)$", "browser_forward", "%{RIGHT}", "active browser"),
        (r"^(focus address bar|address bar)$", "browser_address_bar", "^L", "active browser"),
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
            if operator_memory is not None and intent.type == "desktop" and intent.target.strip():
                operator_memory.update_active_target(
                    intent.target,
                    browser=_is_browser_target(intent.target) or intent.action.startswith("browser_"),
                )
            return {
                "intent": payload,
                "status": "staged",
                "message": "Intent translated into an approval-gated command.",
                "result": status,
            }

        return {
            "intent": payload,
            "status": "unsupported",
            "message": "No direct execution path is configured for this intent yet.",
            "result": {},
        }

    return router


__all__ = ["create_jarvis_intent_router"]
