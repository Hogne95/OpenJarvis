"""Workspace repository summary, checks, and git preparation routes."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openjarvis.server.auth import get_workbench_manager, get_workspace_registry


class WorkspaceRepoRegisterRequest(BaseModel):
    path: str


class WorkspaceRepoSelectRequest(BaseModel):
    root: str


class WorkspaceGitActionRequest(BaseModel):
    message: Optional[str] = None


workspace_router = APIRouter(prefix="/v1/workspace", tags=["workspace"])


@workspace_router.get("/summary")
async def workspace_summary(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    if registry is not None:
        try:
            return registry.summary(root)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    root_path = Path(root).expanduser().resolve() if root else Path(__file__).resolve().parents[3]

    def run_git(*args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=root_path,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()

    branch = run_git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    changed_files = [line.strip() for line in run_git("status", "--short").splitlines() if line.strip()]
    top_level = sorted(
        item.name
        for item in root_path.iterdir()
        if item.is_dir() and not item.name.startswith(".")
    )[:12]
    return {
        "root": str(root_path),
        "branch": branch,
        "dirty": bool(changed_files),
        "changed_count": len(changed_files),
        "changed_files": changed_files[:8],
        "top_level": top_level,
        "remote_url": run_git("config", "--get", "remote.origin.url"),
        "active_root": str(root_path),
    }


@workspace_router.get("/repos")
async def workspace_repos(request: Request):
    registry = get_workspace_registry(request)
    return registry.list()


@workspace_router.post("/repos/register")
async def workspace_register_repo(req: WorkspaceRepoRegisterRequest, request: Request):
    registry = get_workspace_registry(request)
    workbench = get_workbench_manager(request)
    try:
        entry = registry.register(req.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if workbench is not None:
        workbench.set_default_working_dir(entry["root"])
    return registry.list()


@workspace_router.post("/repos/select")
async def workspace_select_repo(req: WorkspaceRepoSelectRequest, request: Request):
    registry = get_workspace_registry(request)
    workbench = get_workbench_manager(request)
    try:
        entry = registry.select(req.root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if workbench is not None:
        workbench.set_default_working_dir(entry["root"])
    return registry.list()


@workspace_router.get("/checks")
async def workspace_checks(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    checks: list[dict[str, str]] = []
    git_actions: list[dict[str, str]] = []
    summary_commands = summary.get("commands") or {}
    for kind in ("test", "lint", "typecheck", "build"):
        for command in summary_commands.get(kind, []):
            checks.append(
                {
                    "label": _workspace_command_label(command),
                    "command": command,
                    "kind": "typecheck" if kind == "build" else kind,
                }
            )

    changed_files = summary.get("changed_files") or []
    git_actions.append({"label": "Git Status", "command": "git status --short", "kind": "status"})
    if changed_files:
        git_actions.append({"label": "Stage All", "command": "git add -A", "kind": "stage"})
        git_actions.append({"label": "Diff Cached", "command": "git diff --cached", "kind": "diff"})

    return {
        "root": summary["root"],
        "checks": checks,
        "git_actions": git_actions,
        "repo_profile": {
            "languages": summary.get("languages") or [],
            "package_managers": summary.get("package_managers") or [],
            "conventions": summary.get("conventions") or [],
        },
    }


def _workspace_command_label(command: str) -> str:
    cleaned = str(command).strip()
    if not cleaned:
        return "Workspace Check"
    parts = cleaned.split()
    if cleaned.startswith("python -m "):
        return " ".join(parts[:3])
    if cleaned.startswith("npm run "):
        return " ".join(parts[:3])
    return " ".join(parts[:2]) if len(parts) >= 2 else cleaned


def _workspace_changed_paths(summary: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for raw_line in summary.get("changed_files") or []:
        line = str(raw_line).strip()
        if not line:
            continue
        parts = line.split(maxsplit=1)
        candidate = parts[-1].strip() if parts else ""
        if " -> " in candidate:
            candidate = candidate.split(" -> ", 1)[-1].strip()
        if candidate:
            paths.append(candidate)
    return paths


def _workspace_commit_type(paths: list[str]) -> str:
    lowered = [path.lower() for path in paths]
    if lowered and all(path.endswith((".md", ".txt", ".rst")) or path.startswith("docs/") for path in lowered):
        return "docs"
    if lowered and all(path.startswith("tests/") or "/test" in path or path.endswith(("_test.py", ".spec.ts", ".test.ts", ".test.tsx")) for path in lowered):
        return "test"
    if lowered and all(
        path.startswith((".github/", "configs/", "deploy/"))
        or path.endswith((".json", ".toml", ".yaml", ".yml", ".ini"))
        for path in lowered
    ):
        return "chore"
    return "fix"


def _workspace_commit_scope(paths: list[str]) -> str:
    if not paths:
        return "workspace"
    first = paths[0].replace("\\", "/")
    parts = [part for part in first.split("/") if part]
    preferred = [part for part in parts if part not in {"src", "openjarvis", "frontend", "tests"}]
    if preferred:
        return preferred[0].replace("_", "-")
    stem = Path(first).stem.strip()
    return stem.replace("_", "-") or "workspace"


def _workspace_commit_subject(paths: list[str]) -> str:
    if not paths:
        return "update workspace"
    names = [Path(path.replace("\\", "/")).stem.replace("_", "-") for path in paths[:3]]
    names = [name for name in names if name]
    if not names:
        return "update workspace"
    if len(paths) == 1:
        return f"update {names[0]}"
    if len(paths) == 2 and len(names) >= 2:
        return f"update {names[0]} and {names[1]}"
    return f"update {names[0]} and related files"


def _generate_workspace_commit_message(summary: dict[str, Any]) -> str:
    paths = _workspace_changed_paths(summary)
    commit_type = _workspace_commit_type(paths)
    scope = _workspace_commit_scope(paths)
    subject = _workspace_commit_subject(paths)
    if scope:
        return f"{commit_type}({scope}): {subject}"
    return f"{commit_type}: {subject}"


@workspace_router.post("/git/prepare-stage")
async def workspace_prepare_stage(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "root": summary["root"],
        "command": "git add -A",
        "ready": bool(summary.get("changed_count")),
        "changed_count": summary.get("changed_count", 0),
        "staged_count": summary.get("staged_count", 0),
        "unstaged_count": summary.get("unstaged_count", 0),
        "message": (
            "Stage the current working tree changes."
            if summary.get("changed_count")
            else "No working tree changes detected."
        ),
    }


@workspace_router.post("/git/prepare-commit")
async def workspace_prepare_commit(req: WorkspaceGitActionRequest, request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    message = (req.message or "").strip() or _generate_workspace_commit_message(summary)

    return {
        "root": summary["root"],
        "message": message,
        "command": f'git commit -m "{message.replace(chr(34), chr(39))}"',
        "ready": bool(summary.get("commit_ready")),
        "changed_count": summary.get("changed_count", 0),
        "staged_count": summary.get("staged_count", 0),
        "unstaged_count": summary.get("unstaged_count", 0),
        "branch": summary.get("branch", "unknown"),
    }


@workspace_router.get("/git/prepare-push")
async def workspace_prepare_push(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    branch = summary.get("branch") or "HEAD"
    remote_url = str(summary.get("remote_url", "")).strip()
    has_upstream = bool(summary.get("has_upstream"))
    ahead_count = int(summary.get("ahead_count", 0))
    blocked_reason = ""
    if not remote_url:
        blocked_reason = "No remote origin is configured for this repository."
    elif not has_upstream:
        blocked_reason = "The current branch does not have an upstream tracking branch."
    elif summary.get("dirty"):
        blocked_reason = "The working tree is still dirty. Commit or hold local changes before pushing."
    elif ahead_count <= 0:
        blocked_reason = "No local commits are ahead of the upstream branch."
    return {
        "root": summary["root"],
        "command": f"git push origin {branch}",
        "ready": not blocked_reason,
        "blocked_reason": blocked_reason or None,
        "branch": branch,
        "ahead_count": ahead_count,
        "behind_count": int(summary.get("behind_count", 0)),
        "has_upstream": has_upstream,
    }
