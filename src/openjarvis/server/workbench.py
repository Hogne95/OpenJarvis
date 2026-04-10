"""Workbench manager for staged terminal commands and approval-driven execution."""

from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from openjarvis.tools.shell_exec import ShellExecTool


@dataclass(slots=True)
class PendingCommand:
    id: str
    command: str
    working_dir: str
    timeout: int
    metadata: dict[str, str | bool] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    status: str = "pending"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class WorkbenchEntry:
    id: str
    command: str
    working_dir: str
    timeout: int
    created_at: float
    completed_at: float
    status: str
    output: str
    returncode: int | None = None
    metadata: dict[str, str | bool] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class WorkbenchManager:
    """Stages commands for approval and executes them through ShellExecTool."""

    def __init__(self, *, default_working_dir: str) -> None:
        self._default_working_dir = str(Path(default_working_dir))
        self._pending: PendingCommand | None = None
        self._history: list[WorkbenchEntry] = []
        self._tool = ShellExecTool()

    def status(self) -> dict:
        return {
            "pending": self._pending.to_dict() if self._pending else None,
            "history": [entry.to_dict() for entry in self._history[-12:]][::-1],
            "default_working_dir": self._default_working_dir,
        }

    def set_default_working_dir(self, working_dir: str) -> None:
        self._default_working_dir = str(Path(working_dir).resolve())

    def stage(
        self,
        *,
        command: str,
        working_dir: str | None = None,
        timeout: int = 30,
        metadata: dict[str, str | bool] | None = None,
    ) -> dict:
        cleaned = command.strip()
        if not cleaned:
            raise ValueError("Command is required")

        resolved_dir = Path(working_dir).resolve() if working_dir else Path(self._default_working_dir).resolve()
        if not resolved_dir.exists():
            raise ValueError(f"Working directory does not exist: {resolved_dir}")
        if not resolved_dir.is_dir():
            raise ValueError(f"Working directory is not a directory: {resolved_dir}")
        wd = str(resolved_dir)
        self._pending = PendingCommand(
            id=uuid.uuid4().hex,
            command=cleaned,
            working_dir=wd,
            timeout=max(1, min(int(timeout), 300)),
            metadata=dict(metadata or {}),
        )
        return self.status()

    def hold(self) -> dict:
        if self._pending is None:
            return self.status()
        pending = self._pending
        self._pending = None
        self._history.append(
            WorkbenchEntry(
                id=pending.id,
                command=pending.command,
                working_dir=pending.working_dir,
                timeout=pending.timeout,
                metadata=dict(pending.metadata),
                created_at=pending.created_at,
                completed_at=time.time(),
                status="held",
                output="Command held by operator.",
                returncode=None,
            )
        )
        self._history = self._history[-50:]
        return self.status()

    def approve(self) -> dict:
        if self._pending is None:
            raise ValueError("No pending command to approve")

        pending = self._pending
        self._pending = None
        result = self._tool.execute(
            command=pending.command,
            working_dir=pending.working_dir,
            timeout=pending.timeout,
        )
        self._history.append(
            WorkbenchEntry(
                id=pending.id,
                command=pending.command,
                working_dir=pending.working_dir,
                timeout=pending.timeout,
                metadata=dict(pending.metadata),
                created_at=pending.created_at,
                completed_at=time.time(),
                status="success" if result.success else "error",
                output=str(result.content),
                returncode=result.metadata.get("returncode"),
            )
        )
        self._history = self._history[-50:]
        return {
            **self.status(),
            "result": self._history[-1].to_dict(),
        }


__all__ = ["WorkbenchManager"]
