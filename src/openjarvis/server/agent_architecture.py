"""Explicit JARVIS agent-role architecture built on existing services."""

from __future__ import annotations

import json
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
    payload = {
        "available": True,
        "active_root": active_root,
        "repo_count": len(repos),
    }
    if active_root:
        try:
            summary = registry.summary(active_root)
        except Exception:
            summary = {}
        payload.update(
            {
                "branch": str(summary.get("branch") or ""),
                "dirty": bool(summary.get("dirty")),
                "staged_count": int(summary.get("staged_count", 0) or 0),
                "unstaged_count": int(summary.get("unstaged_count", 0) or 0),
                "has_upstream": bool(summary.get("has_upstream")),
                "ahead_count": int(summary.get("ahead_count", 0) or 0),
                "behind_count": int(summary.get("behind_count", 0) or 0),
                "commit_ready": bool(summary.get("commit_ready")),
                "push_ready": bool(summary.get("push_ready")),
            }
        )
    return payload


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


def _operating_mode(
    *,
    voice: dict[str, Any],
    memory: dict[str, Any],
    connectors: dict[str, Any],
    workspace: dict[str, Any],
    recent_failures: list[dict[str, Any]],
) -> dict[str, Any]:
    reasons: list[str] = []
    capabilities: list[str] = []

    if memory.get("available"):
        capabilities.append("memory")
    else:
        reasons.append("memory unavailable")

    if workspace.get("available"):
        capabilities.append("workspace")
    else:
        reasons.append("workspace unavailable")

    if voice.get("available"):
        capabilities.append("voice")
    else:
        reasons.append("voice unavailable")

    if connectors.get("multi_account_ready"):
        capabilities.append("connectors")
    else:
        reasons.append("connectors limited")

    if recent_failures:
        reasons.append(f"{len(recent_failures)} agent blocker{'s' if len(recent_failures) != 1 else ''}")

    if memory.get("available") and workspace.get("available") and not recent_failures:
        level = "healthy"
        detail = "Core operator systems are online."
    elif memory.get("available") or workspace.get("available"):
        level = "degraded"
        detail = "JARVIS is operating with reduced capability."
    else:
        level = "minimal"
        detail = "JARVIS is running in fallback mode only."

    return {
        "level": level,
        "detail": detail,
        "reasons": reasons,
        "capabilities": capabilities,
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
    voice = _voice_awareness(app_state)
    memory = _memory_backend_mode(app_state)
    connectors = {
        "multi_account_ready": connector_accounts is not None,
        "runtime_mode": "per-user accounts" if connector_accounts is not None else "unconfigured",
    }
    workspace = _workspace_awareness(app_state)
    return {
        "agents": {
            "total": len(agents),
            "statuses": statuses,
            "active": active_agents[:5],
            "recent_failures": recent_failures[:5],
            "retrying": retrying_agents[:5],
        },
        "voice": voice,
        "memory": memory,
        "connectors": connectors,
        "workspace": workspace,
        "mode": _operating_mode(
            voice=voice,
            memory=memory,
            connectors=connectors,
            workspace=workspace,
            recent_failures=recent_failures[:5],
        ),
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


def _handoff_mission_profile(source: str, metadata: dict[str, Any] | None = None) -> dict[str, str]:
    workflow_mode = str((metadata or {}).get("workflow_mode") or "").strip()
    repo_name = str((metadata or {}).get("repo_name") or "active repo").strip() or "active repo"
    if source == "system-coding":
        title = f"Coding Workflow Mission: {repo_name}"
        summary = (
            f"Coding workflow is running in {workflow_mode} mode."
            if workflow_mode
            else "Coding workflow is running."
        )
        next_step = (
            f"Review coding workflow progress for {workflow_mode} mode."
            if workflow_mode
            else "Review coding workflow progress."
        )
        return {"title": title, "domain": "coding", "summary": summary, "next_step": next_step}
    return {
        "title": "Planner to Executor Mission",
        "domain": "planner",
        "summary": f"Planner and executor are working a handoff from {source}.",
        "next_step": "Review planner and executor task updates.",
    }


def _task_progress_snapshot(task: dict[str, Any] | None) -> dict[str, Any]:
    progress = task.get("progress") if isinstance(task, dict) and isinstance(task.get("progress"), dict) else {}
    current_step = str(progress.get("current_step") or "").strip()
    step_status = str(progress.get("step_status") or "").strip()
    current_detail = str(progress.get("current_detail") or "").strip()
    result_summary = str(progress.get("result_summary") or "").strip()
    steps = list(progress.get("steps") or [])
    if not steps and (current_step or step_status or current_detail or result_summary):
        synthesized_step = {
            "phase": current_step or "step",
            "status": step_status or "info",
            "detail": current_detail or result_summary,
        }
        steps = [synthesized_step]
    return {
        "current_step": current_step,
        "step_status": step_status,
        "current_detail": current_detail,
        "result_summary": result_summary,
        "steps": steps,
    }


def _coding_live_profile(
    mission_profile: dict[str, str],
    metadata: dict[str, Any],
    *,
    task: dict[str, Any] | None,
) -> dict[str, Any]:
    if mission_profile.get("domain") != "coding":
        return {
            "summary": "Planner/executor mission is active.",
            "next_step": "Review planner and executor task progress.",
            "result": str((task or {}).get("description") or "").strip(),
            "label": "Planner Progress",
        }

    progress = _task_progress_snapshot(task)
    workflow_mode = str(metadata.get("workflow_mode") or "").strip()
    preferred_checks = [
        str(item).strip()
        for item in (metadata.get("preferred_checks") if isinstance(metadata.get("preferred_checks"), list) else [])
        if str(item).strip()
    ]
    deliverables = [
        str(item).strip()
        for item in (metadata.get("deliverables") if isinstance(metadata.get("deliverables"), list) else [])
        if str(item).strip()
    ]
    current_step = progress["current_step"] or "plan"
    current_detail = progress["current_detail"]
    result_summary = progress["result_summary"] or str((task or {}).get("description") or "").strip()
    mode_label = workflow_mode.replace("-", " ").strip()
    mode_prefix = f"{mode_label.title()} workflow" if mode_label else "Coding workflow"
    summary = f"{mode_prefix} is active."
    if current_step or current_detail:
        parts = [f"Current step: {current_step}."]
        if current_detail:
            parts.append(current_detail)
        summary = f"{mode_prefix} is active. {' '.join(parts)}"
    next_step_parts = [mission_profile["next_step"]]
    if preferred_checks:
        next_step_parts.append(f"Primary verification anchor: `{preferred_checks[0]}`.")
    if deliverables:
        next_step_parts.append(f"Target deliverable: {deliverables[0]}")
    return {
        "summary": summary,
        "next_step": " ".join(part for part in next_step_parts if part).strip(),
        "result": result_summary,
        "label": "Coding Workflow Progress",
    }


def _coding_workflow_payload(
    metadata: dict[str, Any],
    progress: dict[str, Any],
    *,
    outcome: str,
    artifacts: list[str] | None = None,
) -> dict[str, Any]:
    workflow_mode = str(metadata.get("workflow_mode") or "").strip()
    repo_name = str(metadata.get("repo_name") or "").strip()
    repo_root = str(metadata.get("repo_root") or "").strip()
    branch = str(metadata.get("branch") or "").strip()
    preferred_checks = [
        str(item).strip()
        for item in (metadata.get("preferred_checks") if isinstance(metadata.get("preferred_checks"), list) else [])
        if str(item).strip()
    ]
    deliverables = [
        str(item).strip()
        for item in (metadata.get("deliverables") if isinstance(metadata.get("deliverables"), list) else [])
        if str(item).strip()
    ]
    exit_criteria = [
        str(item).strip()
        for item in (metadata.get("exit_criteria") if isinstance(metadata.get("exit_criteria"), list) else [])
        if str(item).strip()
    ]
    report_template = str(metadata.get("report_template") or "").strip()
    return {
        "workflow_mode": workflow_mode,
        "repo_name": repo_name,
        "repo_root": repo_root,
        "branch": branch,
        "preferred_checks": preferred_checks,
        "deliverables": deliverables,
        "exit_criteria": exit_criteria,
        "report_template": report_template,
        "closure": {
            "outcome": outcome,
            "verification_anchor": preferred_checks[0] if preferred_checks else "",
            "primary_deliverable": deliverables[0] if deliverables else "",
            "primary_exit_criterion": exit_criteria[0] if exit_criteria else "",
            "latest_step": progress.get("current_step") or "",
            "latest_detail": progress.get("current_detail") or "",
            "latest_result": progress.get("result_summary") or "",
            "report_lines": _build_coding_report_lines(
                metadata,
                progress,
                outcome=outcome,
                artifacts=artifacts,
            ),
        },
    }


def _task_artifacts(task: dict[str, Any] | None) -> list[str]:
    findings = (task or {}).get("findings")
    if not isinstance(findings, list):
        return []
    artifacts: list[str] = []
    for item in findings:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                artifacts.append(cleaned)
        elif isinstance(item, dict):
            label = str(item.get("label") or item.get("title") or item.get("name") or "").strip()
            detail = str(item.get("detail") or item.get("summary") or item.get("value") or "").strip()
            if label and detail:
                artifacts.append(f"{label}: {detail}")
            elif label:
                artifacts.append(label)
            elif detail:
                artifacts.append(detail)
        if len(artifacts) >= 5:
            break
    return artifacts


def _build_coding_report_lines(
    metadata: dict[str, Any],
    progress: dict[str, Any],
    *,
    outcome: str,
    artifacts: list[str] | None = None,
) -> list[str]:
    workflow_mode = str(metadata.get("workflow_mode") or "coding").strip().replace("-", " ")
    repo_name = str(metadata.get("repo_name") or "active repo").strip() or "active repo"
    latest_step = str(progress.get("current_step") or "").strip()
    latest_detail = str(progress.get("current_detail") or "").strip()
    latest_result = str(progress.get("result_summary") or "").strip()
    preferred_checks = [
        str(item).strip()
        for item in (metadata.get("preferred_checks") if isinstance(metadata.get("preferred_checks"), list) else [])
        if str(item).strip()
    ]
    report_lines = [
        f"Mode: {workflow_mode}",
        f"Repo: {repo_name}",
        f"Outcome: {outcome}",
    ]
    if latest_step:
        report_lines.append(f"Latest step: {latest_step}")
    if latest_detail:
        report_lines.append(f"Detail: {latest_detail}")
    if latest_result:
        report_lines.append(f"Result: {latest_result}")
    if preferred_checks:
        report_lines.append(f"Verification: {preferred_checks[0]}")
    for artifact in (artifacts or [])[:2]:
        cleaned = str(artifact).strip()
        if cleaned:
            report_lines.append(f"Artifact: {cleaned}")
    return report_lines


def _coding_outcome_profile(
    mission_profile: dict[str, str],
    metadata: dict[str, Any],
    *,
    outcome: str,
    task: dict[str, Any] | None,
) -> dict[str, Any]:
    if mission_profile.get("domain") != "coding":
        description = str((task or {}).get("description") or "").strip()
        if outcome == "blocked":
            return {
                "summary": "Planner/executor mission is blocked.",
                "next_step": "Review the latest blocker and retry or narrow the brief.",
                "result": description,
                "label": "Planner Retry",
                "retry_hint": "Retry the handoff after clarifying scope or reducing risk.",
            }
        return {
            "summary": "Planner/executor mission completed.",
            "next_step": "Review the latest outcome and decide whether to continue.",
            "result": description,
            "label": "Planner Outcome",
            "retry_hint": "Start a new handoff if more work remains.",
        }

    workflow_mode = str(metadata.get("workflow_mode") or "").strip()
    preferred_checks = [
        str(item).strip()
        for item in (metadata.get("preferred_checks") if isinstance(metadata.get("preferred_checks"), list) else [])
        if str(item).strip()
    ]
    deliverables = [
        str(item).strip()
        for item in (metadata.get("deliverables") if isinstance(metadata.get("deliverables"), list) else [])
        if str(item).strip()
    ]
    exit_criteria = [
        str(item).strip()
        for item in (metadata.get("exit_criteria") if isinstance(metadata.get("exit_criteria"), list) else [])
        if str(item).strip()
    ]
    progress = _task_progress_snapshot(task)
    description = str((task or {}).get("description") or "").strip()
    detail = progress["current_detail"]
    result_summary = progress["result_summary"]
    mode_label = workflow_mode.replace("-", " ").strip()
    mode_prefix = f"{mode_label.title()} workflow" if mode_label else "Coding workflow"
    primary_check = preferred_checks[0] if preferred_checks else ""
    primary_deliverable = deliverables[0] if deliverables else ""
    primary_exit = exit_criteria[0] if exit_criteria else ""

    if outcome == "blocked":
        blocker = detail or description or result_summary or "The latest coding task blocked before the workflow could finish."
        next_step_parts = ["Review the blocker, narrow scope if needed, and re-route the coding workflow."]
        if primary_check:
            next_step_parts.append(f"Re-run or confirm `{primary_check}` before continuing.")
        if primary_exit:
            next_step_parts.append(primary_exit)
        return {
            "summary": f"{mode_prefix} is blocked. {blocker}",
            "next_step": " ".join(next_step_parts).strip(),
            "result": result_summary or description or blocker,
            "label": "Coding Workflow Retry",
            "retry_hint": "Retry the handoff after clarifying scope or reducing risk.",
        }

    completion = result_summary or detail or description or "The latest coding workflow finished."
    next_step_parts = ["Review the outcome and either continue with follow-up work or close the workflow."]
    if primary_deliverable:
        next_step_parts.append(primary_deliverable)
    if primary_check:
        next_step_parts.append(f"Verification anchor: `{primary_check}`.")
    return {
        "summary": f"{mode_prefix} completed. {completion}",
        "next_step": " ".join(next_step_parts).strip(),
        "result": result_summary or description or completion,
        "label": "Coding Workflow Outcome",
        "retry_hint": "Start a new coding handoff if more work remains.",
    }


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
            if str(item.get("domain", "")).strip().lower() in {"planner", "coding"}
            or str(item.get("id", "")).strip().lower() == "planner-executor"
        ),
        None,
    )
    if planner_mission and agent_manager is not None:
        mission_result_data = planner_mission.get("result_data") if isinstance(planner_mission.get("result_data"), dict) else {}
        mission_metadata = mission_result_data.get("metadata") if isinstance(mission_result_data.get("metadata"), dict) else {}
        mission_source = str(mission_result_data.get("source") or "hud").strip() or "hud"
        mission_profile = _handoff_mission_profile(mission_source, mission_metadata)
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
        active_progress_task = next(
            (
                item
                for item in recent_tasks
                if str(item.get("status", "")).lower() in {"active", "pending", "running"}
                and (
                    _task_progress_snapshot(item).get("current_step")
                    or _task_progress_snapshot(item).get("current_detail")
                    or _task_progress_snapshot(item).get("step_status")
                )
            ),
            None,
        )
        if active_progress_task is not None:
            active_task = active_progress_task
        active_progress = _task_progress_snapshot(active_task)
        phase_override = active_progress["current_step"] or ("act" if str(active_task.get("agent_id", "")).strip() else "plan") if active_task else ""
        detail_override = active_progress["current_detail"]
        result_override = active_progress["result_summary"]
        if failed_task is not None:
            failed_artifacts = _task_artifacts(failed_task)
            failed_outcome = _coding_outcome_profile(
                mission_profile,
                mission_metadata,
                outcome="blocked",
                task=failed_task,
            )
            failed_progress = _task_progress_snapshot(failed_task)
            failed_workflow = _coding_workflow_payload(
                mission_metadata,
                failed_progress,
                outcome="blocked",
                artifacts=failed_artifacts,
            )
            mission_snapshot = _upsert_architecture_mission(
                app_state,
                mission_id="planner-executor",
                title=str(planner_mission.get("title", "")).strip() or mission_profile["title"],
                domain=str(planner_mission.get("domain", "")).strip() or mission_profile["domain"],
                status="blocked",
                phase="retry",
                summary=failed_outcome["summary"],
                next_step=failed_outcome["next_step"],
                result=failed_outcome["result"],
                retry_hint=failed_outcome["retry_hint"],
                result_data={
                    "task_id": failed_task.get("id"),
                    "status": failed_task.get("status"),
                    "agent_id": failed_task.get("agent_id"),
                    "current_step": failed_progress["current_step"],
                    "step_status": failed_progress["step_status"],
                    "current_detail": failed_progress["current_detail"],
                    "result_summary": failed_progress["result_summary"],
                    "steps": failed_progress["steps"],
                    "artifacts": failed_artifacts,
                    "source": mission_source,
                    "metadata": mission_metadata,
                    "workflow": failed_workflow,
                },
                next_action={
                    "kind": "brief",
                    "content": failed_outcome["result"],
                    "label": failed_outcome["label"],
                    "metadata": mission_metadata,
                    "workflow": failed_workflow,
                    "artifacts": failed_artifacts,
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
            completed_artifacts = _task_artifacts(completed_task)
            completed_outcome = _coding_outcome_profile(
                mission_profile,
                mission_metadata,
                outcome="complete",
                task=completed_task,
            )
            completed_progress = _task_progress_snapshot(completed_task)
            completed_workflow = _coding_workflow_payload(
                mission_metadata,
                completed_progress,
                outcome="complete",
                artifacts=completed_artifacts,
            )
            mission_snapshot = _upsert_architecture_mission(
                app_state,
                mission_id="planner-executor",
                title=str(planner_mission.get("title", "")).strip() or mission_profile["title"],
                domain=str(planner_mission.get("domain", "")).strip() or mission_profile["domain"],
                status="complete",
                phase="done",
                summary=completed_outcome["summary"],
                next_step=completed_outcome["next_step"],
                result=completed_outcome["result"],
                retry_hint=completed_outcome["retry_hint"],
                result_data={
                    "task_id": completed_task.get("id"),
                    "status": completed_task.get("status"),
                    "agent_id": completed_task.get("agent_id"),
                    "current_step": completed_progress["current_step"],
                    "step_status": completed_progress["step_status"],
                    "current_detail": completed_progress["current_detail"],
                    "result_summary": completed_progress["result_summary"],
                    "steps": completed_progress["steps"],
                    "artifacts": completed_artifacts,
                    "source": mission_source,
                    "metadata": mission_metadata,
                    "workflow": completed_workflow,
                },
                next_action={
                    "kind": "brief",
                    "content": completed_outcome["result"],
                    "label": completed_outcome["label"],
                    "metadata": mission_metadata,
                    "workflow": completed_workflow,
                    "artifacts": completed_artifacts,
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
            active_artifacts = _task_artifacts(active_task)
            active_outcome = _coding_live_profile(
                mission_profile,
                mission_metadata,
                task=active_task,
            )
            active_workflow = _coding_workflow_payload(
                mission_metadata,
                active_progress,
                outcome="active",
                artifacts=active_artifacts,
            )
            mission_snapshot = _upsert_architecture_mission(
                app_state,
                mission_id="planner-executor",
                title=str(planner_mission.get("title", "")).strip() or mission_profile["title"],
                domain=str(planner_mission.get("domain", "")).strip() or mission_profile["domain"],
                status="active",
                phase=phase_override or "plan",
                summary=active_outcome["summary"],
                next_step=active_outcome["next_step"],
                result=result_override or active_outcome["result"] or str(planner_mission.get("result", "")),
                retry_hint=str(planner_mission.get("retry_hint", "")).strip(),
                result_data={
                    "task_id": active_task.get("id"),
                    "status": active_task.get("status"),
                    "agent_id": active_task.get("agent_id"),
                    "current_step": active_progress["current_step"],
                    "step_status": active_progress["step_status"],
                    "current_detail": active_progress["current_detail"],
                    "result_summary": active_progress["result_summary"],
                    "steps": active_progress["steps"],
                    "artifacts": active_artifacts,
                    "source": mission_source,
                    "metadata": mission_metadata,
                    "workflow": active_workflow,
                },
                next_action={
                    "kind": "brief",
                    "content": active_outcome["result"] or str(planner_mission.get("summary", "")).strip(),
                    "label": active_outcome["label"],
                    "metadata": mission_metadata,
                    "workflow": active_workflow,
                    "artifacts": active_artifacts,
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
    metadata: dict[str, Any] | None = None,
    owner_user_id: str | None = None,
) -> dict[str, Any]:
    cleaned_brief = brief.strip()
    if not cleaned_brief:
        raise ValueError("A planner brief is required")
    handoff_metadata = dict(metadata or {})
    mission_profile = _handoff_mission_profile(source, handoff_metadata)
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
        + (
            "Structured handoff metadata:\n"
            f"{json.dumps(handoff_metadata, ensure_ascii=True, indent=2)}\n\n"
            if handoff_metadata
            else ""
        )
        + f"Brief:\n{cleaned_brief}"
    )
    executor_note = (
        f"Source: {source}\n"
        "Role: executor\n"
        "This task was delegated by the JARVIS planner. Execute the work safely, keep approvals in the loop, "
        "and report outcomes clearly.\n\n"
        + (
            "Structured handoff metadata:\n"
            f"{json.dumps(handoff_metadata, ensure_ascii=True, indent=2)}\n\n"
            if handoff_metadata
            else ""
        )
        + f"Planner brief:\n{cleaned_brief}"
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
        title=mission_profile["title"],
        domain=mission_profile["domain"],
        status="active",
        phase="act",
        summary=mission_profile["summary"],
        next_step=mission_profile["next_step"],
        result=cleaned_brief[:280],
        retry_hint="Retry the handoff if the delegated tasks stall or block.",
        result_data={
            "planner_task_id": planner_task.get("id"),
            "executor_task_id": executor_task.get("id"),
            "source": source,
            "metadata": handoff_metadata,
        },
        next_action={
            "kind": "brief",
            "content": cleaned_brief,
            "label": "Planner Handoff",
            "metadata": handoff_metadata,
        },
    )

    refreshed = build_architecture_status(app_state, owner_user_id=owner_user_id)
    refreshed["handoff"] = {
        "source": source,
        "brief": cleaned_brief,
        "metadata": handoff_metadata,
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
