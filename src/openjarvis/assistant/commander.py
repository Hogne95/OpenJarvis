"""Commander-mode briefing helpers for turning state into next actions."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from openjarvis.assistant.identity import infer_user_temperament


@dataclass(frozen=True)
class CommanderQueueEntry:
    id: str
    label: str
    title: str
    detail: str
    action_label: str
    action_hint: str
    priority: int


@dataclass(frozen=True)
class CommanderExecutionPhase:
    phase: str
    goal: str
    success_signal: str


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _interaction_style(profile: dict[str, Any]) -> str:
    autonomy = _clean_text(profile.get("autonomy_preference")) or "balanced"
    decisiveness = _clean_text(profile.get("decisiveness_preference")) or "recommend clearly"
    verbosity = _clean_text(profile.get("verbosity_preference")) or "adaptive"
    return f"{autonomy} autonomy, {decisiveness}, {verbosity} verbosity"


def _command_posture(profile: dict[str, Any]) -> tuple[str, str]:
    temperament = infer_user_temperament(stored_profile=profile)
    if temperament.support_level == "light-touch":
        return (
            "direct high-initiative execution",
            "Keep recommendations decisive, compress the briefing, and route bounded work quickly.",
        )
    if temperament.support_level in {"guided", "supportive"} or temperament.risk_posture == "cautious":
        return (
            "guided risk-aware execution",
            "Lead with the recommendation, but make safeguards and verification explicit before handoff.",
        )
    return (
        "balanced operator support",
        "Recommend clearly, explain the tradeoff, and keep the next action bounded and observable.",
    )


def _build_execution_plan(*, recommendation: str, why: str, best_next_step: str, risks: list[str]) -> list[CommanderExecutionPhase]:
    primary_risk = risks[0] if risks else "Watch for hidden blockers while the plan is running."
    return [
        CommanderExecutionPhase(
            phase="plan",
            goal=recommendation,
            success_signal="The top objective is narrowed to one bounded action.",
        ),
        CommanderExecutionPhase(
            phase="execute",
            goal=best_next_step,
            success_signal="A concrete task, handoff, or approved action is in motion.",
        ),
        CommanderExecutionPhase(
            phase="verify",
            goal=f"Confirm the result actually reduces the pressure behind: {why}",
            success_signal="The blocker, queue pressure, or failure signal is measurably reduced.",
        ),
        CommanderExecutionPhase(
            phase="report",
            goal=f"Report outcome and remaining risk: {primary_risk}",
            success_signal="JARVIS can state what changed, what remains, and the next safest move.",
        ),
    ]


def build_commander_brief(
    *,
    analytics: dict[str, Any],
    awareness: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate a bounded commander brief from memory analytics and system awareness."""

    awareness = awareness or {}
    profile = profile or {}
    blocked = list(analytics.get("blocked_missions") or [])
    active = list(analytics.get("active_missions") or [])
    lessons = list(analytics.get("top_lessons") or [])
    review_items = list(analytics.get("review_items") or [])
    focus = list(analytics.get("focus_recommendations") or [])
    improvement_opportunities = list(analytics.get("improvement_opportunities") or [])
    friction_brief = analytics.get("friction_brief") if isinstance(analytics.get("friction_brief"), dict) else {}
    signals = analytics.get("signals") if isinstance(analytics.get("signals"), dict) else {}
    awareness_mode = awareness.get("mode") if isinstance(awareness.get("mode"), dict) else {}
    recent_failures = (
        awareness.get("agents", {}).get("recent_failures", [])
        if isinstance(awareness.get("agents"), dict)
        else []
    )
    temperament = infer_user_temperament(stored_profile=profile)
    command_posture, guidance_note = _command_posture(profile)

    recommendation = "Stabilize the stack and clear blockers first."
    why = "The fastest path to momentum is clearing work that is already blocked."
    if blocked:
        primary = blocked[0]
        recommendation = f"Unblock {primary.get('title') or 'the top mission'} first."
        why = primary.get("next_step") or "A blocked mission is preventing downstream progress."
    elif recent_failures:
        primary_failure = recent_failures[0]
        recommendation = f"Recover {primary_failure.get('name') or 'the failing agent'} before expanding scope."
        why = primary_failure.get("detail") or "Recent agent failures are increasing operational drag."
    elif int(signals.get("urgent_reviews") or 0) > 0:
        recommendation = "Handle urgent reviews before starting new work."
        why = f"{int(signals.get('urgent_reviews') or 0)} urgent review signal(s) are waiting."
    elif active:
        primary_active = active[0]
        recommendation = f"Advance {primary_active.get('title') or 'the active mission'} now."
        why = primary_active.get("next_step") or "There is active work ready to move without extra setup."
    elif improvement_opportunities:
        recommendation = improvement_opportunities[0]
        why = "Repeated friction suggests this is worth tightening before it spreads."
    elif focus:
        recommendation = focus[0]
        why = "This is the clearest current direction from your recent operating patterns."

    friction_summary = _clean_text(friction_brief.get("summary"))
    friction_root_cause = _clean_text(friction_brief.get("root_cause"))
    if friction_summary and not blocked and not recent_failures:
        why = friction_root_cause or friction_summary

    risks: list[str] = []
    for item in awareness_mode.get("reasons") or []:
        cleaned = _clean_text(item)
        if cleaned:
            risks.append(cleaned)
    for item in recent_failures[:2]:
        detail = _clean_text(item.get("detail"))
        name = _clean_text(item.get("name")) or "Agent issue"
        risks.append(f"{name}: {detail or 'recent execution blocker'}")
    for item in review_items[:2]:
        summary = _clean_text(item.get("summary"))
        if summary:
            risks.append(f"Review queue: {summary}")
    for item in improvement_opportunities[:2]:
        cleaned = _clean_text(item)
        if cleaned:
            risks.append(f"Improvement loop: {cleaned}")
    for item in (friction_brief.get("pressure_points") or [])[:2]:
        cleaned = _clean_text(item)
        if cleaned:
            risks.append(f"Pressure point: {cleaned}")
    risks = risks[:4] or ["No major systemic risk is dominating right now."]

    best_next_step = ""
    if blocked:
        best_next_step = _clean_text(blocked[0].get("next_step"))
    if not best_next_step and active:
        best_next_step = _clean_text(active[0].get("next_step"))
    if not best_next_step and focus:
        best_next_step = _clean_text(focus[0])
    if not best_next_step:
        best_next_step = "Review the commander queue and hand the highest-value task to the planner."

    queue: list[CommanderQueueEntry] = []
    if blocked:
        first = blocked[0]
        queue.append(
            CommanderQueueEntry(
                id=f"blocked-{_clean_text(first.get('id')) or 'mission'}",
                label="Commander",
                title=_clean_text(first.get("title")) or "Clear blocker",
                detail=_clean_text(first.get("next_step")) or "Blocked mission needs a recovery pass.",
                action_label="Route To Planner",
                action_hint="planner_handoff",
                priority=100,
            )
        )
    if recent_failures:
        first = recent_failures[0]
        queue.append(
            CommanderQueueEntry(
                id=f"agent-{_clean_text(first.get('id')) or 'failure'}",
                label="System",
                title=_clean_text(first.get("name")) or "Agent blocker",
                detail=_clean_text(first.get("detail")) or "Recent agent execution failure needs review.",
                action_label="Open System",
                action_hint="open_system",
                priority=92,
            )
        )
    if active:
        first = active[0]
        queue.append(
            CommanderQueueEntry(
                id=f"active-{_clean_text(first.get('id')) or 'mission'}",
                label="Mission",
                title=_clean_text(first.get("title")) or "Advance active mission",
                detail=_clean_text(first.get("next_step")) or "This mission can move now with a bounded next action.",
                action_label="Continue Work",
                action_hint="planner_handoff",
                priority=84,
            )
        )
    if review_items:
        first = review_items[0]
        queue.append(
            CommanderQueueEntry(
                id=f"review-{_clean_text(first.get('id')) or 'item'}",
                label="Review",
                title=_clean_text(first.get("label")) or "Review item",
                detail=_clean_text(first.get("summary")) or "A recent answer or workflow should be reviewed.",
                action_label="Open System",
                action_hint="open_system",
                priority=74,
            )
        )
    if improvement_opportunities:
        first = _clean_text(improvement_opportunities[0])
        queue.append(
            CommanderQueueEntry(
                id="improvement-opportunity",
                label="Improve",
                title="Tighten a recurring weak spot",
                detail=first,
                action_label="Route Improvement",
                action_hint="planner_handoff",
                priority=72,
            )
        )
    if not queue:
        queue.append(
            CommanderQueueEntry(
                id="steady-state",
                label="Commander",
                title="Maintain steady execution",
                detail="No dominant blocker detected. Keep momentum on the next active objective.",
                action_label="Open System",
                action_hint="open_system",
                priority=50,
            )
        )

    queue = sorted(queue, key=lambda item: item.priority, reverse=True)[:4]
    execution_plan = _build_execution_plan(
        recommendation=recommendation,
        why=why,
        best_next_step=best_next_step,
        risks=risks,
    )
    planner_prompt = (
        "Commander mode directive.\n"
        f"Recommendation: {recommendation}\n"
        f"Why: {why}\n"
        f"User temperament: {temperament.summary}\n"
        f"Command posture: {command_posture}\n"
        f"Guidance note: {guidance_note}\n"
        f"Best next step: {best_next_step}\n"
        "Execution phases:\n"
        + "\n".join(
            f"- {phase.phase.title()}: {phase.goal} (success: {phase.success_signal})" for phase in execution_plan
        )
    )

    return {
        "headline": "Commander brief ready.",
        "recommendation": recommendation,
        "why": why,
        "friction_summary": friction_summary,
        "root_cause": friction_root_cause,
        "risks": risks,
        "best_next_step": best_next_step,
        "queue": [asdict(item) for item in queue],
        "execution_plan": [asdict(item) for item in execution_plan],
        "operating_mode": _clean_text(awareness_mode.get("level")) or "unknown",
        "interaction_style": _interaction_style(profile),
        "user_temperament": temperament.summary,
        "command_posture": command_posture,
        "guidance_note": guidance_note,
        "planner_prompt": planner_prompt,
    }
