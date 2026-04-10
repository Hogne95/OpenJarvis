"""Explicit JARVIS agent-role architecture built on existing services."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


def _memory_backend_mode(app_state: Any) -> dict[str, Any]:
    backend = getattr(app_state, "memory_backend", None)
    operator_memory = getattr(app_state, "operator_memory", None)
    if backend is None:
        return {
            "available": operator_memory is not None,
            "mode": "operator_only" if operator_memory is not None else "disabled",
            "backend": None,
        }
    backend_name = getattr(backend, "backend_id", None) or type(backend).__name__
    lowered = str(backend_name).lower()
    if "sqlite" in lowered:
        mode = "sqlite"
    elif "rust" in lowered:
        mode = "rust"
    else:
        mode = "custom"
    return {"available": True, "mode": mode, "backend": str(backend_name)}


def _workspace_awareness(app_state: Any) -> dict[str, Any]:
    registry = getattr(app_state, "workspace_registry", None)
    if registry is None:
        return {"available": False, "active_root": "", "repo_count": 0}
    try:
        repos = list(registry.list_repos())
    except Exception:
        repos = []
    try:
        active_root = str(registry.active_root() or "")
    except Exception:
        active_root = ""
    return {
        "available": True,
        "active_root": active_root,
        "repo_count": len(repos),
    }


def _voice_awareness(app_state: Any) -> dict[str, Any]:
    voice_loop = getattr(app_state, "voice_loop", None)
    if voice_loop is None:
        return {"available": False, "phase": "offline"}
    try:
        snapshot = voice_loop.snapshot()
    except Exception:
        snapshot = {}
    return {
        "available": True,
        "phase": str(snapshot.get("phase") or "idle"),
        "active": bool(snapshot.get("active")),
    }


def _build_system_awareness(app_state: Any, *, owner_user_id: str | None = None) -> dict[str, Any]:
    agent_manager = getattr(app_state, "agent_manager", None)
    if agent_manager is None:
        agents: list[dict[str, Any]] = []
    else:
        try:
            agents = list(agent_manager.list_agents(owner_user_id=owner_user_id))
        except Exception:
            agents = []

    statuses = {
        "running": 0,
        "idle": 0,
        "paused": 0,
        "error": 0,
        "needs_attention": 0,
        "budget_exceeded": 0,
        "stalled": 0,
        "archived": 0,
    }
    active_agents: list[dict[str, Any]] = []
    recent_failures: list[dict[str, Any]] = []
    retrying_agents: list[dict[str, Any]] = []
    for agent in agents:
        status = str(agent.get("status") or "idle")
        statuses[status] = statuses.get(status, 0) + 1
        if status == "running":
            active_agents.append(
                {
                    "id": agent.get("id"),
                    "name": agent.get("name"),
                    "activity": str(agent.get("current_activity") or "").strip(),
                    "last_activity_at": agent.get("last_activity_at"),
                }
            )
        if status in {"error", "needs_attention", "budget_exceeded", "stalled"}:
            recent_failures.append(
                {
                    "id": agent.get("id"),
                    "name": agent.get("name"),
                    "status": status,
                    "detail": str(agent.get("summary_memory") or agent.get("current_activity") or "").strip()[:240],
                    "updated_at": agent.get("updated_at"),
                }
            )
        stall_retries = int(agent.get("stall_retries") or 0)
        if stall_retries > 0:
            retrying_agents.append(
                {
                    "id": agent.get("id"),
                    "name": agent.get("name"),
                    "stall_retries": stall_retries,
                    "activity": str(agent.get("current_activity") or "").strip(),
                }
            )

    connector_accounts = getattr(app_state, "connector_account_store", None)
    return {
        "agents": {
            "total": len(agents),
            "statuses": statuses,
            "active": active_agents[:5],
            "recent_failures": recent_failures[:5],
            "retrying": retrying_agents[:5],
        },
        "voice": _voice_awareness(app_state),
        "memory": _memory_backend_mode(app_state),
        "connectors": {
            "multi_account_ready": connector_accounts is not None,
            "runtime_mode": "per-user accounts" if connector_accounts is not None else "unconfigured",
        },
        "workspace": _workspace_awareness(app_state),
    }


@dataclass(frozen=True)
class ManagedRoleSpec:
    role: str
    name: str
    agent_type: str
    description: str
    system_prompt: str


ROLE_SPECS: dict[str, ManagedRoleSpec] = {
    "planner": ManagedRoleSpec(
        role="planner",
        name="JARVIS Planner",
        agent_type="monitor_operative",
        description="Breaks incoming work into clear next actions, delegation, and safe plans.",
        system_prompt=(
            "You are the JARVIS Planner. Convert voice, text, automation, and visual inputs into "
            "clear next actions. Prioritize safety, approvals, and concise operator handoff. "
            "Delegate execution-oriented work to the executor role when appropriate."
        ),
    ),
    "executor": ManagedRoleSpec(
        role="executor",
        name="JARVIS Executor",
        agent_type="monitor_operative",
        description="Executes approved work across tools, workbench, coding, and operator actions.",
        system_prompt=(
            "You are the JARVIS Executor. Turn approved plans into concrete work across coding, "
            "tool use, workbench actions, and operator workflows. Report outcomes clearly and keep "
            "human approval in the loop for risky side effects."
        ),
    ),
    "vision": ManagedRoleSpec(
        role="vision",
        name="JARVIS Vision Specialist",
        agent_type="monitor_operative",
        description="Interprets visual summaries, screen context, and UI targets into next actions.",
        system_prompt=(
            "You are the JARVIS Vision Specialist. Work from visual summaries, OCR output, signal "
            "extraction, and UI-target analysis to identify what matters, what is blocked, and what "
            "the operator should do next."
        ),
    ),
}


def _agent_matches_role(agent: dict[str, Any], role: str) -> bool:
    config = agent.get("config") or {}
    if str(config.get("core_role", "")).strip().lower() == role:
        return True
    spec = ROLE_SPECS.get(role)
    if not spec:
        return False
    return str(agent.get("name", "")).strip().lower() == spec.name.lower()


def _find_role_agent(
    agent_manager: Any,
    role: str,
    *,
    owner_user_id: str | None = None,
) -> dict[str, Any] | None:
    if agent_manager is None:
        return None
    for agent in agent_manager.list_agents(owner_user_id=owner_user_id):
        if _agent_matches_role(agent, role):
            return agent
    return None


def _list_role_tasks(
    agent_manager: Any,
    role_agent: dict[str, Any] | None,
    *,
    owner_user_id: str | None = None,
) -> list[dict[str, Any]]:
    if agent_manager is None or role_agent is None:
        return []
    agent_id = str(role_agent.get("id", "")).strip()
    if not agent_id:
        return []
    try:
        return list(agent_manager.list_tasks(agent_id, owner_user_id=owner_user_id))
    except Exception:
        return []


def _upsert_architecture_mission(
    app_state: Any,
    *,
    mission_id: str,
    title: str,
    domain: str,
    status: str,
    phase: str,
    summary: str,
    next_step: str = "",
    result: str = "",
    retry_hint: str = "",
    result_data: dict[str, Any] | None = None,
    next_action: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    operator_memory = getattr(app_state, "operator_memory", None)
    if operator_memory is None:
        return None
    return operator_memory.update_mission(
        mission_id,
        {
            "title": title,
            "domain": domain,
            "status": status,
            "phase": phase,
            "summary": summary,
            "next_step": next_step,
            "result": result,
            "retry_hint": retry_hint,
            "result_data": result_data or {},
            "next_action": next_action or {},
        },
    )


def build_architecture_status(app_state: Any, *, owner_user_id: str | None = None) -> dict[str, Any]:
    agent_manager = getattr(app_state, "agent_manager", None)
    voice_loop = getattr(app_state, "voice_loop", None)
    operator_memory = getattr(app_state, "operator_memory", None)
    roles: list[dict[str, Any]] = []
    role_agents: dict[str, dict[str, Any] | None] = {}

    voice_snapshot = voice_loop.snapshot() if voice_loop is not None else {}
    voice_active = bool(voice_snapshot.get("active"))
    voice_phase = str(voice_snapshot.get("phase") or "idle")
    roles.append(
        {
            "role": "voice",
            "title": "Voice Agent",
            "kind": "system",
            "source": "voice_loop",
            "ready": voice_loop is not None,
            "status": voice_phase if voice_loop is not None else "offline",
            "detail": (
                f"Wake/listen pipeline is {voice_phase}."
                if voice_loop is not None
                else "Voice loop is not configured."
            ),
            "active": voice_active,
        }
    )

    for role_name, spec in ROLE_SPECS.items():
        agent = _find_role_agent(agent_manager, role_name, owner_user_id=owner_user_id)
        role_agents[role_name] = agent
        roles.append(
            {
                "role": role_name,
                "title": f"{role_name.title()} Agent",
                "kind": "managed",
                "source": "managed_agent",
                "ready": agent is not None,
                "status": str(agent.get("status", "missing")) if agent else "missing",
                "detail": (
                    str(agent.get("current_activity") or agent.get("summary_memory") or spec.description)
                    if agent
                    else f"{spec.name} is not provisioned yet."
                ),
                "agent_id": agent.get("id") if agent else None,
                "agent_name": agent.get("name") if agent else spec.name,
                "agent_type": agent.get("agent_type") if agent else spec.agent_type,
                "active": bool(agent and agent.get("status") == "running"),
            }
        )

    memory_snapshot = operator_memory.snapshot() if operator_memory is not None else {}
    explicit_count = len(memory_snapshot.get("explicit_memories", [])) if memory_snapshot else 0
    visual_count = len(memory_snapshot.get("visual_briefs", [])) if memory_snapshot else 0
    roles.append(
        {
            "role": "memory",
            "title": "Memory Agent",
            "kind": "system",
            "source": "operator_memory",
            "ready": operator_memory is not None,
            "status": "ready" if operator_memory is not None else "offline",
            "detail": (
                f"{explicit_count} explicit memories and {visual_count} visual briefs available."
                if operator_memory is not None
                else "Durable operator memory is not configured."
            ),
            "active": operator_memory is not None,
        }
    )

    active_roles = sum(1 for item in roles if item["ready"])
    managed_ready = sum(1 for item in roles if item["kind"] == "managed" and item["ready"])
    missions = memory_snapshot.get("missions", []) if memory_snapshot else []
    planner_mission = next(
        (
            item
            for item in missions
            if str(item.get("domain", "")).strip().lower() == "planner"
            or str(item.get("id", "")).strip().lower() == "planner-executor"
        ),
        None,
    )
    if planner_mission and agent_manager is not None:
        planner_tasks = _list_role_tasks(agent_manager, role_agents.get("planner"), owner_user_id=owner_user_id)
        executor_tasks = _list_role_tasks(agent_manager, role_agents.get("executor"), owner_user_id=owner_user_id)
        recent_tasks = sorted(
            [*planner_tasks, *executor_tasks],
            key=lambda item: float(item.get("created_at") or 0.0),
            reverse=True,
        )
        failed_task = next((item for item in recent_tasks if str(item.get("status", "")).lower() == "failed"), None)
        completed_task = next(
            (item for item in recent_tasks if str(item.get("status", "")).lower() == "completed"),
            None,
        )
        active_task = next(
            (
                item
                for item in recent_tasks
                if str(item.get("status", "")).lower() in {"active", "pending", "running"}
            ),
            None,
        )
        if failed_task is not None:
            mission_snapshot = _upsert_architecture_mission(
                app_state,
                mission_id="planner-executor",
                title=str(planner_mission.get("title", "")).strip() or "Planner to Executor Mission",
                domain="planner",
                status="blocked",
                phase="retry",
                summary="Planner/executor mission is blocked.",
                next_step="Review the latest blocker and retry or narrow the brief.",
                result=str(failed_task.get("description", "")).strip(),
                retry_hint="Retry the handoff after clarifying scope or reducing risk.",
                result_data={
                    "task_id": failed_task.get("id"),
                    "status": failed_task.get("status"),
                    "agent_id": failed_task.get("agent_id"),
                },
                next_action={
                    "kind": "brief",
                    "content": str(failed_task.get("description", "")).strip(),
                    "label": "Planner Retry",
                },
            )
            if mission_snapshot is not None:
                planner_mission = next(
                    (
                        item
                        for item in mission_snapshot.get("missions", [])
                        if str(item.get("id", "")).strip().lower() == "planner-executor"
                    ),
                    planner_mission,
                )
        elif completed_task is not None:
            mission_snapshot = _upsert_architecture_mission(
                app_state,
                mission_id="planner-executor",
                title=str(planner_mission.get("title", "")).strip() or "Planner to Executor Mission",
                domain="planner",
                status="complete",
                phase="done",
                summary="Planner/executor mission completed.",
                next_step="Review the latest outcome and decide whether to continue.",
                result=str(completed_task.get("description", "")).strip(),
                retry_hint="Start a new handoff if more work remains.",
                result_data={
                    "task_id": completed_task.get("id"),
                    "status": completed_task.get("status"),
                    "agent_id": completed_task.get("agent_id"),
                },
                next_action={
                    "kind": "brief",
                    "content": str(completed_task.get("description", "")).strip(),
                    "label": "Planner Outcome",
                },
            )
            if mission_snapshot is not None:
                planner_mission = next(
                    (
                        item
                        for item in mission_snapshot.get("missions", [])
                        if str(item.get("id", "")).strip().lower() == "planner-executor"
                    ),
                    planner_mission,
                )
        elif active_task is not None:
            mission_snapshot = _upsert_architecture_mission(
                app_state,
                mission_id="planner-executor",
                title=str(planner_mission.get("title", "")).strip() or "Planner to Executor Mission",
                domain="planner",
                status="active",
                phase="act" if str(active_task.get("agent_id", "")).strip() else "plan",
                summary="Planner/executor mission is active.",
                next_step="Review planner and executor task progress.",
                result=str(active_task.get("description", "")).strip() or str(planner_mission.get("result", "")),
                retry_hint=str(planner_mission.get("retry_hint", "")).strip(),
                result_data={
                    "task_id": active_task.get("id"),
                    "status": active_task.get("status"),
                    "agent_id": active_task.get("agent_id"),
                },
                next_action={
                    "kind": "brief",
                    "content": str(active_task.get("description", "")).strip() or str(planner_mission.get("summary", "")).strip(),
                    "label": "Planner Progress",
                },
            )
            if mission_snapshot is not None:
                planner_mission = next(
                    (
                        item
                        for item in mission_snapshot.get("missions", [])
                        if str(item.get("id", "")).strip().lower() == "planner-executor"
                    ),
                    planner_mission,
                )
    return {
        "roles": roles,
        "summary": {
            "ready_roles": active_roles,
            "total_roles": len(roles),
            "managed_ready": managed_ready,
            "managed_total": len(ROLE_SPECS),
        },
        "mission": planner_mission,
        "awareness": _build_system_awareness(app_state, owner_user_id=owner_user_id),
    }


def ensure_core_team(app_state: Any, *, owner_user_id: str | None = None) -> dict[str, Any]:
    agent_manager = getattr(app_state, "agent_manager", None)
    if agent_manager is None:
        raise ValueError("Managed agent system is not configured")
    selected_model = getattr(app_state, "model", "") or ""
    created: list[dict[str, Any]] = []
    existing: list[dict[str, Any]] = []
    for role_name, spec in ROLE_SPECS.items():
        agent = _find_role_agent(agent_manager, role_name, owner_user_id=owner_user_id)
        if agent is not None:
            existing.append({"role": role_name, "agent_id": agent.get("id"), "name": agent.get("name")})
            continue
        config = {
            "model": selected_model or None,
            "schedule_type": "manual",
            "core_role": role_name,
            "system_prompt": spec.system_prompt,
        }
        created_agent = agent_manager.create_agent(
            name=spec.name,
            agent_type=spec.agent_type,
            config=config,
            owner_user_id=owner_user_id,
        )
        created.append({"role": role_name, "agent_id": created_agent.get("id"), "name": created_agent.get("name")})
    status = build_architecture_status(app_state, owner_user_id=owner_user_id)
    status["created"] = created
    status["existing"] = existing
    return status


def create_role_handoff(
    app_state: Any,
    *,
    brief: str,
    source: str = "hud",
    owner_user_id: str | None = None,
) -> dict[str, Any]:
    cleaned_brief = brief.strip()
    if not cleaned_brief:
        raise ValueError("A planner brief is required")
    status = ensure_core_team(app_state, owner_user_id=owner_user_id)
    agent_manager = getattr(app_state, "agent_manager", None)
    if agent_manager is None:
        raise ValueError("Managed agent system is not configured")

    planner = _find_role_agent(agent_manager, "planner", owner_user_id=owner_user_id)
    executor = _find_role_agent(agent_manager, "executor", owner_user_id=owner_user_id)
    if planner is None or executor is None:
        raise ValueError("Planner and executor roles must be provisioned")

    planner_note = (
        f"Source: {source}\n"
        "Role: planner\n"
        "Take this incoming JARVIS brief, clarify the objective, risks, and the best execution plan.\n\n"
        f"Brief:\n{cleaned_brief}"
    )
    executor_note = (
        f"Source: {source}\n"
        "Role: executor\n"
        "This task was delegated by the JARVIS planner. Execute the work safely, keep approvals in the loop, "
        "and report outcomes clearly.\n\n"
        f"Planner brief:\n{cleaned_brief}"
    )

    planner_task = agent_manager.create_task(planner["id"], description=planner_note)
    executor_task = agent_manager.create_task(executor["id"], description=executor_note)
    agent_manager.update_summary_memory(
        planner["id"],
        f"Latest planner handoff from {source}: {cleaned_brief[:240]}",
    )
    agent_manager.update_summary_memory(
        executor["id"],
        f"Latest executor handoff from {source}: {cleaned_brief[:240]}",
    )
    mission_snapshot = _upsert_architecture_mission(
        app_state,
        mission_id="planner-executor",
        title="Planner to Executor Mission",
        domain="planner",
        status="active",
        phase="act",
        summary=f"Planner and executor are working a handoff from {source}.",
        next_step="Review planner and executor task updates.",
        result=cleaned_brief[:280],
        retry_hint="Retry the handoff if the delegated tasks stall or block.",
        result_data={
            "planner_task_id": planner_task.get("id"),
            "executor_task_id": executor_task.get("id"),
            "source": source,
        },
        next_action={
            "kind": "brief",
            "content": cleaned_brief,
            "label": "Planner Handoff",
        },
    )

    refreshed = build_architecture_status(app_state, owner_user_id=owner_user_id)
    refreshed["handoff"] = {
        "source": source,
        "brief": cleaned_brief,
        "planner": {
            "agent_id": planner["id"],
            "task_id": planner_task.get("id"),
            "name": planner.get("name"),
        },
        "executor": {
            "agent_id": executor["id"],
            "task_id": executor_task.get("id"),
            "name": executor.get("name"),
        },
    }
    if mission_snapshot is not None:
        refreshed["mission"] = next(
            (
                item
                for item in mission_snapshot.get("missions", [])
                if str(item.get("id", "")).strip().lower() == "planner-executor"
            ),
            refreshed.get("mission"),
        )
    return refreshed


__all__ = ["ROLE_SPECS", "build_architecture_status", "ensure_core_team", "create_role_handoff"]
