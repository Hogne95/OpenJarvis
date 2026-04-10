"""Approval-driven code editing manager for local repository work."""

from __future__ import annotations

import difflib
import json
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


def _diff_line_stats(original_content: str, updated_content: str) -> tuple[int, int]:
    added = 0
    removed = 0
    for line in difflib.unified_diff(
        original_content.splitlines(),
        updated_content.splitlines(),
        lineterm="",
    ):
        if line.startswith(("+++", "---", "@@")):
            continue
        if line.startswith("+"):
            added += 1
        elif line.startswith("-"):
            removed += 1
    return added, removed


def _load_package_scripts(repo_root: Path) -> dict[str, str]:
    package_json = repo_root / "package.json"
    if not package_json.exists():
        return {}
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
    except Exception:
        return {}
    scripts = payload.get("scripts", {})
    return scripts if isinstance(scripts, dict) else {}


def _infer_suggested_checks(repo_root: Path, file_path: str) -> list[str]:
    suffix = Path(file_path).suffix.lower()
    suggested: list[str] = []
    has_tests_dir = (repo_root / "tests").is_dir()
    package_scripts = _load_package_scripts(repo_root)
    has_python_files = any(repo_root.glob("*.py")) or any((repo_root / "src").glob("*.py")) or any((repo_root / "tests").glob("*.py"))

    if suffix in {".py", ".pyi"}:
        if (repo_root / "pyproject.toml").exists() or (repo_root / "requirements.txt").exists() or has_python_files:
            if has_tests_dir:
                suggested.append("python -m pytest tests -q")
            if any((repo_root / name).exists() for name in ("ruff.toml", ".ruff.toml", "pyproject.toml")):
                suggested.append("python -m ruff check src tests")

    if suffix in {".ts", ".tsx", ".js", ".jsx"}:
        if "typecheck" in package_scripts:
            suggested.append("npm run typecheck")
        if "lint" in package_scripts:
            suggested.append("npm run lint")
        if "test" in package_scripts:
            suggested.append("npm test")
        if "build" in package_scripts:
            suggested.append("npm run build")

    if suffix in {".rs"} and (repo_root / "Cargo.toml").exists():
        suggested.extend(["cargo check", "cargo test"])

    if suffix in {".go"} and (repo_root / "go.mod").exists():
        suggested.extend(["go test ./...", "go build ./..."])

    if not suggested:
        if ((repo_root / "pyproject.toml").exists() or (repo_root / "requirements.txt").exists() or has_python_files) and has_tests_dir:
            suggested.append("python -m pytest tests -q")
        if any((repo_root / name).exists() for name in ("ruff.toml", ".ruff.toml")):
            suggested.append("python -m ruff check src tests")
        if "typecheck" in package_scripts:
            suggested.append("npm run typecheck")
        if "lint" in package_scripts:
            suggested.append("npm run lint")
        if "test" in package_scripts:
            suggested.append("npm test")
        if "build" in package_scripts:
            suggested.append("npm run build")
        if (repo_root / "Cargo.toml").exists():
            suggested.extend(["cargo check", "cargo test"])
        if (repo_root / "go.mod").exists():
            suggested.extend(["go test ./...", "go build ./..."])

    return list(dict.fromkeys(suggested))


@dataclass(slots=True)
class PendingCodeEdit:
    id: str
    repo_root: str
    file_path: str
    original_content: str
    updated_content: str
    diff: str
    summary: str
    rationale: str
    workflow_phase: str
    verification_status: str
    suggested_checks: list[str] = field(default_factory=list)
    latest_verification: dict | None = None
    created_at: float = field(default_factory=time.time)
    status: str = "staged"

    def to_dict(self) -> dict:
        payload = asdict(self)
        added_lines, removed_lines = _diff_line_stats(self.original_content, self.updated_content)
        payload["line_count"] = len(self.updated_content.splitlines())
        payload["changed_line_count"] = added_lines + removed_lines
        payload["added_line_count"] = added_lines
        payload["removed_line_count"] = removed_lines
        payload["workflow"] = {
            "phase": self.workflow_phase,
            "completed": ["inspect", "plan", "patch"],
            "remaining": ["verify", "report"],
            "summary": self.summary,
        }
        payload["verification"] = {
            "status": self.verification_status,
            "suggested_checks": list(self.suggested_checks),
            "latest_run": dict(self.latest_verification) if self.latest_verification else None,
            "guidance": (
                "Run the narrowest relevant verification before finalizing the patch."
                if self.suggested_checks
                else "Review the diff and choose a focused verification step before finalizing."
            ),
        }
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
    summary: str = ""
    rationale: str = ""
    workflow_phase: str = "report"
    verification_status: str = "not_run"
    suggested_checks: list[str] = field(default_factory=list)
    latest_verification: dict | None = None
    changed_line_count: int = 0
    added_line_count: int = 0
    removed_line_count: int = 0

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

    def stage_edit(
        self,
        *,
        repo_root: str,
        file_path: str,
        updated_content: str,
        summary: str | None = None,
        rationale: str | None = None,
        verification_commands: list[str] | None = None,
    ) -> dict:
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
        added_lines, removed_lines = _diff_line_stats(original_content, updated_content)
        repo_path = Path(repo_root).expanduser().resolve()
        suggested_checks = (
            [item.strip() for item in verification_commands if item and item.strip()]
            if verification_commands
            else _infer_suggested_checks(repo_path, file_path)
        )
        change_summary = summary.strip() if summary and summary.strip() else (
            f"Update {file_path} with {added_lines + removed_lines} changed line"
            f"{'' if added_lines + removed_lines == 1 else 's'}."
        )
        change_rationale = rationale.strip() if rationale and rationale.strip() else (
            f"Prepared a bounded patch for {file_path} and staged it for verification."
        )
        self._pending = PendingCodeEdit(
            id=uuid.uuid4().hex,
            repo_root=repo_root,
            file_path=file_path,
            original_content=original_content,
            updated_content=updated_content,
            diff=diff or "No textual diff available.",
            summary=change_summary,
            rationale=change_rationale,
            workflow_phase="verify",
            verification_status="not_run",
            suggested_checks=suggested_checks,
        )
        return self.status()

    def hold(self) -> dict:
        if self._pending is None:
            return self.status()
        pending = self._pending
        self._pending = None
        pending_payload = pending.to_dict()
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
                summary=pending.summary,
                rationale=pending.rationale,
                workflow_phase="report",
                verification_status=pending.verification_status,
                suggested_checks=list(pending.suggested_checks),
                latest_verification=dict(pending.latest_verification) if pending.latest_verification else None,
                changed_line_count=pending_payload["changed_line_count"],
                added_line_count=pending_payload["added_line_count"],
                removed_line_count=pending_payload["removed_line_count"],
            )
        )
        self._history = self._history[-50:]
        return self.status()

    def record_verification(self, *, command: str, success: bool, output: str = "") -> dict:
        if self._pending is None:
            raise ValueError("No pending code edit to record verification for")
        normalized_command = command.strip()
        if not normalized_command:
            raise ValueError("Verification command is required")
        summarized_output = output.strip()[:1200]
        self._pending.verification_status = "passed" if success else "failed"
        self._pending.workflow_phase = "report" if success else "verify"
        self._pending.latest_verification = {
            "command": normalized_command,
            "success": bool(success),
            "output": summarized_output,
            "recorded_at": time.time(),
        }
        return self.status()

    def approve(self) -> dict:
        if self._pending is None:
            raise ValueError("No pending code edit to approve")
        pending = self._pending
        self._pending = None
        target = _safe_file_path(pending.repo_root, pending.file_path)
        target.write_text(pending.updated_content, encoding="utf-8")
        pending_payload = pending.to_dict()
        entry = CodeEditEntry(
            id=pending.id,
            repo_root=pending.repo_root,
            file_path=pending.file_path,
            diff=pending.diff,
            created_at=pending.created_at,
            completed_at=time.time(),
            status="applied",
            result=(
                f"Applied staged edit to {pending.file_path}. "
                + (
                    f"Suggested next verification: {', '.join(pending.suggested_checks[:2])}."
                    if pending.suggested_checks
                    else "Review and run the narrowest relevant verification next."
                )
            ),
            summary=pending.summary,
            rationale=pending.rationale,
            workflow_phase="report",
            verification_status=(
                pending.verification_status
                if pending.verification_status in {"passed", "failed"}
                else "pending_verification"
            ),
            suggested_checks=list(pending.suggested_checks),
            latest_verification=dict(pending.latest_verification) if pending.latest_verification else None,
            changed_line_count=int(pending_payload.get("changed_line_count", 0)),
            added_line_count=int(pending_payload.get("added_line_count", 0)),
            removed_line_count=int(pending_payload.get("removed_line_count", 0)),
        )
        self._history.append(entry)
        self._history = self._history[-50:]
        return {**self.status(), "result": entry.to_dict()}


__all__ = ["CodingWorkspaceManager"]
