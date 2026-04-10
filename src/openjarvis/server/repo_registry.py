"""Tracked local Git repositories for HUD coding workflows."""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path


def _run_git(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (subprocess.TimeoutExpired, OSError):
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _resolve_repo_root(path: str) -> Path:
    target = Path(path).expanduser().resolve()
    cwd = target if target.is_dir() else target.parent
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise ValueError(f"Unable to inspect Git repository: {path}") from exc
    if result.returncode != 0 or not result.stdout.strip():
        raise ValueError(f"Not a Git repository: {path}")
    return Path(result.stdout.strip()).resolve()


@dataclass(slots=True)
class RepoEntry:
    root: str
    name: str
    branch: str = "unknown"
    remote_url: str = ""
    last_selected_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


class RepoRegistry:
    """Stores tracked repos and the current active coding workspace."""

    def __init__(self, *, storage_path: Path, default_root: str) -> None:
        self._storage_path = storage_path
        self._repos: dict[str, RepoEntry] = {}
        self._active_root = ""
        self._default_root = str(Path(default_root).resolve())
        self._load()
        try:
            default_repo = self.register(self._default_root)
            if not self._active_root:
                self._active_root = default_repo["root"]
                self._save()
        except ValueError:
            if not self._active_root:
                self._active_root = self._default_root

    def _load(self) -> None:
        if not self._storage_path.exists():
            return
        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except Exception:
            return
        self._active_root = str(payload.get("active_root", "")).strip()
        repos = payload.get("repos", [])
        if not isinstance(repos, list):
            return
        for raw in repos:
            if not isinstance(raw, dict):
                continue
            root = str(raw.get("root", "")).strip()
            if not root:
                continue
            self._repos[root] = RepoEntry(
                root=root,
                name=str(raw.get("name", Path(root).name)),
                branch=str(raw.get("branch", "unknown")),
                remote_url=str(raw.get("remote_url", "")),
                last_selected_at=float(raw.get("last_selected_at", time.time())),
            )

    def _save(self) -> None:
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "active_root": self._active_root,
            "repos": [
                entry.to_dict()
                for entry in sorted(
                    self._repos.values(),
                    key=lambda item: item.last_selected_at,
                    reverse=True,
                )
            ],
        }
        self._storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _inspect(self, root: Path) -> RepoEntry:
        root = root.resolve()
        branch = _run_git(root, "rev-parse", "--abbrev-ref", "HEAD") or "unknown"
        remote_url = _run_git(root, "config", "--get", "remote.origin.url")
        existing = self._repos.get(str(root))
        return RepoEntry(
            root=str(root),
            name=existing.name if existing else root.name,
            branch=branch,
            remote_url=remote_url,
            last_selected_at=existing.last_selected_at if existing else time.time(),
        )

    def active_root(self) -> str:
        return self._active_root or self._default_root

    def list(self) -> dict:
        refreshed: list[dict] = []
        for root, entry in list(self._repos.items()):
            path = Path(root)
            if not path.exists():
                continue
            refreshed_entry = self._inspect(path)
            refreshed_entry.last_selected_at = entry.last_selected_at
            self._repos[root] = refreshed_entry
            refreshed.append(refreshed_entry.to_dict())
        refreshed.sort(key=lambda item: item["last_selected_at"], reverse=True)
        self._save()
        return {
            "active_root": self.active_root(),
            "repos": refreshed,
        }

    def register(self, path: str) -> dict:
        root = _resolve_repo_root(path)
        entry = self._inspect(root)
        entry.last_selected_at = time.time()
        self._repos[str(root)] = entry
        self._active_root = str(root)
        self._save()
        return entry.to_dict()

    def select(self, root: str) -> dict:
        resolved = str(Path(root).expanduser().resolve())
        if resolved not in self._repos:
            return self.register(resolved)
        entry = self._inspect(Path(resolved))
        entry.last_selected_at = time.time()
        self._repos[resolved] = entry
        self._active_root = resolved
        self._save()
        return entry.to_dict()

    def summary(self, root: str | None = None) -> dict:
        selected_root = Path(root or self.active_root()).expanduser().resolve()
        if not selected_root.exists() or not selected_root.is_dir():
            raise ValueError(f"Repository path does not exist: {selected_root}")
        branch = _run_git(selected_root, "rev-parse", "--abbrev-ref", "HEAD") or "unknown"
        changed_files = [
            line.strip()
            for line in _run_git(selected_root, "status", "--short").splitlines()
            if line.strip()
        ]
        top_level = sorted(
            item.name
            for item in selected_root.iterdir()
            if item.is_dir() and not item.name.startswith(".")
        )[:12]
        remote_url = _run_git(selected_root, "config", "--get", "remote.origin.url")
        return {
            "root": str(selected_root),
            "branch": branch,
            "dirty": bool(changed_files),
            "changed_count": len(changed_files),
            "changed_files": changed_files[:8],
            "top_level": top_level,
            "remote_url": remote_url,
            "active_root": self.active_root(),
        }


__all__ = ["RepoRegistry"]
