"""Explicit JARVIS agent-role architecture built on existing services."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


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


def _find_role_agent(agent_manager: Any, role: str) -> dict[str, Any] | None:
    if agent_manager is None:
        return None
    for agent in agent_manager.list_agents():
        if _agent_matches_role(agent, role):
            return agent
    return None


def build_architecture_status(app_state: Any) -> dict[str, Any]:
    agent_manager = getattr(app_state, "agent_manager", None)
    voice_loop = getattr(app_state, "voice_loop", None)
    operator_memory = getattr(app_state, "operator_memory", None)
    roles: list[dict[str, Any]] = []

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
        agent = _find_role_agent(agent_manager, role_name)
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
    return {
        "roles": roles,
        "summary": {
            "ready_roles": active_roles,
            "total_roles": len(roles),
            "managed_ready": managed_ready,
            "managed_total": len(ROLE_SPECS),
        },
    }


def ensure_core_team(app_state: Any) -> dict[str, Any]:
    agent_manager = getattr(app_state, "agent_manager", None)
    if agent_manager is None:
        raise ValueError("Managed agent system is not configured")
    selected_model = getattr(app_state, "model", "") or ""
    created: list[dict[str, Any]] = []
    existing: list[dict[str, Any]] = []
    for role_name, spec in ROLE_SPECS.items():
        agent = _find_role_agent(agent_manager, role_name)
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
        )
        created.append({"role": role_name, "agent_id": created_agent.get("id"), "name": created_agent.get("name")})
    status = build_architecture_status(app_state)
    status["created"] = created
    status["existing"] = existing
    return status


def create_role_handoff(app_state: Any, *, brief: str, source: str = "hud") -> dict[str, Any]:
    cleaned_brief = brief.strip()
    if not cleaned_brief:
        raise ValueError("A planner brief is required")
    status = ensure_core_team(app_state)
    agent_manager = getattr(app_state, "agent_manager", None)
    if agent_manager is None:
        raise ValueError("Managed agent system is not configured")

    planner = _find_role_agent(agent_manager, "planner")
    executor = _find_role_agent(agent_manager, "executor")
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

    refreshed = build_architecture_status(app_state)
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
    return refreshed


__all__ = ["ROLE_SPECS", "build_architecture_status", "ensure_core_team", "create_role_handoff"]
