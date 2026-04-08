"""Approval-driven code editing manager for local repository work."""

from __future__ import annotations

import difflib
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path


def _safe_file_path(root: str, file_path: str) -> Path:
    repo_root = Path(root).expanduser().resolve()
    target = (repo_root / file_path).resolve()
    try:
        target.relative_to(repo_root)
    except ValueError as exc:
        raise ValueError("File path must stay inside the active repository") from exc
    if target.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf"}:
        raise ValueError("Binary assets are not supported by the code editor yet")
    return target


@dataclass(slots=True)
class PendingCodeEdit:
    id: str
    repo_root: str
    file_path: str
    original_content: str
    updated_content: str
    diff: str
    created_at: float = field(default_factory=time.time)
    status: str = "pending"

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["line_count"] = len(self.updated_content.splitlines())
        return payload


@dataclass(slots=True)
class CodeEditEntry:
    id: str
    repo_root: str
    file_path: str
    diff: str
    created_at: float
    completed_at: float
    status: str
    result: str

    def to_dict(self) -> dict:
        return asdict(self)


class CodingWorkspaceManager:
    """Read files, stage text edits, and apply them only after approval."""

    def __init__(self) -> None:
        self._pending: PendingCodeEdit | None = None
        self._history: list[CodeEditEntry] = []

    def status(self) -> dict:
        return {
            "pending": self._pending.to_dict() if self._pending else None,
            "history": [entry.to_dict() for entry in self._history[-12:]][::-1],
        }

    def read_file(self, *, repo_root: str, file_path: str) -> dict:
        target = _safe_file_path(repo_root, file_path)
        if not target.exists():
            raise ValueError("File does not exist")
        content = target.read_text(encoding="utf-8")
        return {
            "file_path": file_path,
            "repo_root": repo_root,
            "content": content,
        }

    def stage_edit(self, *, repo_root: str, file_path: str, updated_content: str) -> dict:
        target = _safe_file_path(repo_root, file_path)
        if not target.exists():
            raise ValueError("File does not exist")
        original_content = target.read_text(encoding="utf-8")
        if original_content == updated_content:
            raise ValueError("No file changes detected")

        diff = "".join(
            difflib.unified_diff(
                original_content.splitlines(keepends=True),
                updated_content.splitlines(keepends=True),
                fromfile=file_path,
                tofile=file_path,
            )
        )
        self._pending = PendingCodeEdit(
            id=uuid.uuid4().hex,
            repo_root=repo_root,
            file_path=file_path,
            original_content=original_content,
            updated_content=updated_content,
            diff=diff or "No textual diff available.",
        )
        return self.status()

    def hold(self) -> dict:
        if self._pending is None:
            return self.status()
        pending = self._pending
        self._pending = None
        self._history.append(
            CodeEditEntry(
                id=pending.id,
                repo_root=pending.repo_root,
                file_path=pending.file_path,
                diff=pending.diff,
                created_at=pending.created_at,
                completed_at=time.time(),
                status="held",
                result="Code edit held by operator.",
            )
        )
        self._history = self._history[-50:]
        return self.status()

    def approve(self) -> dict:
        if self._pending is None:
            raise ValueError("No pending code edit to approve")
        pending = self._pending
        self._pending = None
        target = _safe_file_path(pending.repo_root, pending.file_path)
        target.write_text(pending.updated_content, encoding="utf-8")
        entry = CodeEditEntry(
            id=pending.id,
            repo_root=pending.repo_root,
            file_path=pending.file_path,
            diff=pending.diff,
            created_at=pending.created_at,
            completed_at=time.time(),
            status="applied",
            result=f"Applied staged edit to {pending.file_path}.",
        )
        self._history.append(entry)
        self._history = self._history[-50:]
        return {**self.status(), "result": entry.to_dict()}


__all__ = ["CodingWorkspaceManager"]
