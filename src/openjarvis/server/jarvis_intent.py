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
    "discord": "Discord",
    "slack": "slack",
    "outlook": "outlook",
    "vscode": "code",
    "code": "code",
    "notepad": "notepad",
    "explorer": "explorer",
}


def _downloads_dir() -> Path:
    return Path.home() / "Downloads"


def _quote_ps(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


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
        payload = intent.to_dict()
        operator_memory = getattr(request.app.state, "operator_memory", None)

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

        if intent.requires_approval:
            manager = getattr(request.app.state, "workbench", None)
            if manager is None:
                raise HTTPException(status_code=503, detail="Workbench manager not configured")
            status = manager.stage(command=intent.command, timeout=60)
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
