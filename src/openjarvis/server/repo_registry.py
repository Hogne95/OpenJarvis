"""Tracked local Git repositories for HUD coding workflows."""

from __future__ import annotations

import json
import re
import subprocess
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from collections import Counter


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


_LANGUAGE_EXTENSIONS = {
    ".py": "python",
    ".pyi": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".swift": "swift",
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".lua": "lua",
}


def _repo_profile(root: Path) -> dict:
    package_managers: list[str] = []
    manifests: list[str] = []
    commands = {
        "test": [],
        "lint": [],
        "typecheck": [],
        "build": [],
    }
    conventions: list[str] = []
    languages = Counter()

    def _record_file(name: str) -> bool:
        path = root / name
        if path.exists():
            manifests.append(name)
            return True
        return False

    if _record_file("pyproject.toml"):
        pyproject_text = (root / "pyproject.toml").read_text(encoding="utf-8", errors="ignore")
        if "[tool.uv" in pyproject_text or "uv.lock" in pyproject_text or (root / "uv.lock").exists():
            package_managers.append("uv")
        if "[tool.poetry" in pyproject_text:
            package_managers.append("poetry")
        commands["test"].append("python -m pytest tests -q")
        commands["lint"].append("python -m ruff check src tests")
    if _record_file("requirements.txt") and "pip" not in package_managers:
        package_managers.append("pip")
    if _record_file("package.json"):
        if (root / "package-lock.json").exists():
            package_managers.append("npm")
        elif (root / "pnpm-lock.yaml").exists():
            package_managers.append("pnpm")
        elif (root / "yarn.lock").exists():
            package_managers.append("yarn")
        elif (root / "bun.lockb").exists() or (root / "bun.lock").exists():
            package_managers.append("bun")
        try:
            package = json.loads((root / "package.json").read_text(encoding="utf-8"))
            scripts = package.get("scripts", {})
        except Exception:
            scripts = {}
        if isinstance(scripts, dict):
            if "test" in scripts:
                commands["test"].append("npm test")
            if "lint" in scripts:
                commands["lint"].append("npm run lint")
            if "typecheck" in scripts:
                commands["typecheck"].append("npm run typecheck")
            if "build" in scripts:
                commands["build"].append("npm run build")
    if _record_file("Cargo.toml"):
        package_managers.append("cargo")
        commands["test"].append("cargo test")
        commands["typecheck"].append("cargo check")
        commands["build"].append("cargo build")
    if _record_file("go.mod"):
        package_managers.append("go")
        commands["test"].append("go test ./...")
        commands["build"].append("go build ./...")

    src_dir = root / "src"
    tests_dir = root / "tests"
    frontend_dir = root / "frontend"
    if src_dir.is_dir():
        conventions.append("src-layout")
    if tests_dir.is_dir():
        conventions.append("tests-directory")
    if frontend_dir.is_dir():
        conventions.append("frontend-workspace")
    if (root / "ruff.toml").exists() or (root / ".ruff.toml").exists():
        conventions.append("ruff")
    if (root / ".prettierrc").exists() or (root / "prettier.config.js").exists() or (root / "prettier.config.cjs").exists():
        conventions.append("prettier")
    if (root / "tsconfig.json").exists():
        conventions.append("typescript-project")
    if (root / ".editorconfig").exists():
        conventions.append("editorconfig")

    for candidate in list(root.glob("*")) + list(src_dir.rglob("*"))[:250]:
        if not candidate.is_file():
            continue
        suffix = candidate.suffix.lower()
        language = _LANGUAGE_EXTENSIONS.get(suffix)
        if language:
            languages[language] += 1

    primary_languages = [name for name, _count in languages.most_common(5)]
    return {
        "languages": primary_languages,
        "language_counts": dict(languages),
        "package_managers": sorted(dict.fromkeys(package_managers)),
        "manifests": sorted(dict.fromkeys(manifests)),
        "commands": {kind: values for kind, values in commands.items() if values},
        "conventions": sorted(dict.fromkeys(conventions)),
    }


def _git_status_snapshot(root: Path) -> dict:
    raw = _run_git(root, "status", "--short", "--branch")
    lines = [line.rstrip() for line in raw.splitlines() if line.strip()]
    branch_line = lines[0] if lines else ""
    changed_lines = lines[1:] if branch_line.startswith("## ") else lines
    ahead = 0
    behind = 0
    has_upstream = "..." in branch_line
    for label, value in re.findall(r"(ahead|behind) (\d+)", branch_line):
        if label == "ahead":
            ahead = int(value)
        elif label == "behind":
            behind = int(value)

    changed_files: list[str] = []
    staged_count = 0
    unstaged_count = 0
    untracked_count = 0
    for line in changed_lines:
        if len(line) < 3:
            continue
        code = line[:2]
        path = line[3:].strip() or line[2:].strip()
        if path:
            changed_files.append(line.strip())
        if code == "??":
            untracked_count += 1
            continue
        if code[0] != " ":
            staged_count += 1
        if len(code) > 1 and code[1] != " ":
            unstaged_count += 1

    return {
        "changed_files": changed_files,
        "staged_count": staged_count,
        "unstaged_count": unstaged_count,
        "untracked_count": untracked_count,
        "ahead_count": ahead,
        "behind_count": behind,
        "has_upstream": has_upstream,
    }


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
        status_snapshot = _git_status_snapshot(selected_root)
        changed_files = status_snapshot["changed_files"]
        top_level = sorted(
            item.name
            for item in selected_root.iterdir()
            if item.is_dir() and not item.name.startswith(".")
        )[:12]
        remote_url = _run_git(selected_root, "config", "--get", "remote.origin.url")
        profile = _repo_profile(selected_root)
        return {
            "root": str(selected_root),
            "branch": branch,
            "dirty": bool(changed_files),
            "changed_count": len(changed_files),
            "changed_files": changed_files[:8],
            "staged_count": status_snapshot["staged_count"],
            "unstaged_count": status_snapshot["unstaged_count"],
            "untracked_count": status_snapshot["untracked_count"],
            "ahead_count": status_snapshot["ahead_count"],
            "behind_count": status_snapshot["behind_count"],
            "has_upstream": status_snapshot["has_upstream"],
            "commit_ready": bool(changed_files),
            "push_ready": bool(
                remote_url
                and status_snapshot["has_upstream"]
                and status_snapshot["ahead_count"] > 0
                and not changed_files
            ),
            "top_level": top_level,
            "remote_url": remote_url,
            "active_root": self.active_root(),
            "languages": profile["languages"],
            "language_counts": profile["language_counts"],
            "package_managers": profile["package_managers"],
            "manifests": profile["manifests"],
            "commands": profile["commands"],
            "conventions": profile["conventions"],
        }


__all__ = ["RepoRegistry"]
