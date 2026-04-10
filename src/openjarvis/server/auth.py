"""Helpers for JARVIS web authentication."""

from __future__ import annotations

import pathlib
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.server.action_center import ActionCenterManager
from openjarvis.server.coding_workspace import CodingWorkspaceManager
from openjarvis.server.operator_memory import OperatorMemory
from openjarvis.server.repo_registry import RepoRegistry
from openjarvis.server.workbench import WorkbenchManager

SESSION_COOKIE_NAME = "openjarvis_session"


def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    cached = getattr(request.state, "current_user", None)
    if cached is not None:
        return cached
    store = getattr(request.app.state, "user_store", None)
    if store is None:
        request.state.current_user = None
        return None
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    if not token:
        request.state.current_user = None
        return None
    user = store.get_user_for_session(token)
    request.state.current_user = user
    return user


def require_current_user(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_current_user_if_bootstrapped(request: Request) -> Optional[Dict[str, Any]]:
    store = getattr(request.app.state, "user_store", None)
    if store is None:
        return None
    if store.user_count() <= 0:
        return get_current_user(request)
    return require_current_user(request)


def require_role_if_bootstrapped(request: Request, *roles: str) -> Optional[Dict[str, Any]]:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        return None
    allowed = {role.strip().lower() for role in roles if role and role.strip()}
    if not allowed:
        return user
    current_role = str(user.get("role", "")).strip().lower()
    if current_role not in allowed:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def get_operator_memory_manager(request: Request) -> OperatorMemory:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        manager = getattr(request.app.state, "operator_memory", None)
        if manager is None:
            manager = OperatorMemory()
            request.app.state.operator_memory = manager
        return manager

    cache = getattr(request.app.state, "_operator_memory_by_user_id", None)
    if cache is None:
        cache = {}
        request.app.state._operator_memory_by_user_id = cache

    user_id = str(user["id"]).strip()
    cached = cache.get(user_id)
    if cached is not None:
        return cached

    scoped_dir = DEFAULT_CONFIG_DIR / "operator_memory"
    scoped_dir.mkdir(parents=True, exist_ok=True)
    scoped_path = scoped_dir / f"{user_id}.json"
    legacy_path = DEFAULT_CONFIG_DIR / "operator_memory.json"
    if (
        not scoped_path.exists()
        and legacy_path.exists()
        and str(user.get("role", "")).strip().lower() == "superadmin"
    ):
        try:
            shutil.copyfile(legacy_path, scoped_path)
        except Exception:
            pass

    manager = OperatorMemory(path=str(scoped_path))
    cache[user_id] = manager
    return manager


def get_workspace_registry(request: Request) -> RepoRegistry:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        registry = getattr(request.app.state, "workspace_registry", None)
        if registry is None:
            registry = RepoRegistry(
                storage_path=DEFAULT_CONFIG_DIR / "workspace_repos.json",
                default_root=str(pathlib.Path.cwd()),
            )
            request.app.state.workspace_registry = registry
        return registry

    cache = getattr(request.app.state, "_workspace_registry_by_user_id", None)
    if cache is None:
        cache = {}
        request.app.state._workspace_registry_by_user_id = cache

    user_id = str(user["id"]).strip()
    cached = cache.get(user_id)
    if cached is not None:
        return cached

    scoped_dir = DEFAULT_CONFIG_DIR / "workspace_repos"
    scoped_dir.mkdir(parents=True, exist_ok=True)
    scoped_path = scoped_dir / f"{user_id}.json"
    legacy_path = DEFAULT_CONFIG_DIR / "workspace_repos.json"
    if (
        not scoped_path.exists()
        and legacy_path.exists()
        and str(user.get("role", "")).strip().lower() == "superadmin"
    ):
        try:
            shutil.copyfile(legacy_path, scoped_path)
        except Exception:
            pass

    default_root = str(pathlib.Path.cwd())
    legacy_registry = getattr(request.app.state, "workspace_registry", None)
    if legacy_registry is not None:
        try:
            default_root = str(Path(legacy_registry.active_root()).resolve())
        except Exception:
            default_root = str(pathlib.Path.cwd())

    registry = RepoRegistry(
        storage_path=scoped_path,
        default_root=default_root,
    )
    cache[user_id] = registry
    return registry


def get_workbench_manager(request: Request) -> WorkbenchManager:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        manager = getattr(request.app.state, "workbench", None)
        if manager is None:
            manager = WorkbenchManager(default_working_dir=str(pathlib.Path.cwd()))
            request.app.state.workbench = manager
        return manager

    cache = getattr(request.app.state, "_workbench_by_user_id", None)
    if cache is None:
        cache = {}
        request.app.state._workbench_by_user_id = cache

    user_id = str(user["id"]).strip()
    cached = cache.get(user_id)
    if cached is not None:
        return cached

    registry = get_workspace_registry(request)
    manager = WorkbenchManager(default_working_dir=registry.active_root())
    cache[user_id] = manager
    return manager


def get_action_center_manager(request: Request) -> ActionCenterManager:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        manager = getattr(request.app.state, "action_center", None)
        if manager is None:
            manager = ActionCenterManager()
            request.app.state.action_center = manager
        return manager

    cache = getattr(request.app.state, "_action_center_by_user_id", None)
    if cache is None:
        cache = {}
        request.app.state._action_center_by_user_id = cache

    user_id = str(user["id"]).strip()
    cached = cache.get(user_id)
    if cached is not None:
        return cached

    manager = ActionCenterManager(owner_user_id=user_id)
    cache[user_id] = manager
    return manager


def get_coding_workspace_manager(request: Request) -> CodingWorkspaceManager:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        manager = getattr(request.app.state, "coding_workspace", None)
        if manager is None:
            manager = CodingWorkspaceManager()
            request.app.state.coding_workspace = manager
        return manager

    cache = getattr(request.app.state, "_coding_workspace_by_user_id", None)
    if cache is None:
        cache = {}
        request.app.state._coding_workspace_by_user_id = cache

    user_id = str(user["id"]).strip()
    cached = cache.get(user_id)
    if cached is not None:
        return cached

    manager = CodingWorkspaceManager()
    cache[user_id] = manager
    return manager


__all__ = [
    "SESSION_COOKIE_NAME",
    "get_action_center_manager",
    "get_coding_workspace_manager",
    "get_current_user",
    "require_current_user",
    "require_current_user_if_bootstrapped",
    "require_role_if_bootstrapped",
    "get_operator_memory_manager",
    "get_workbench_manager",
    "get_workspace_registry",
]
