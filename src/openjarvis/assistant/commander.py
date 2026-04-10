"""Commander-mode briefing helpers for turning state into next actions."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class CommanderQueueEntry:
    id: str
    label: str
    title: str
    detail: str
    action_label: str
    action_hint: str
    priority: int


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _interaction_style(profile: dict[str, Any]) -> str:
    autonomy = _clean_text(profile.get("autonomy_preference")) or "balanced"
    decisiveness = _clean_text(profile.get("decisiveness_preference")) or "recommend clearly"
    verbosity = _clean_text(profile.get("verbosity_preference")) or "adaptive"
    return f"{autonomy} autonomy, {decisiveness}, {verbosity} verbosity"


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
    signals = analytics.get("signals") if isinstance(analytics.get("signals"), dict) else {}
    awareness_mode = awareness.get("mode") if isinstance(awareness.get("mode"), dict) else {}
    recent_failures = (
        awareness.get("agents", {}).get("recent_failures", [])
        if isinstance(awareness.get("agents"), dict)
        else []
    )

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
    elif focus:
        recommendation = focus[0]
        why = "This is the clearest current direction from your recent operating patterns."

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

    return {
        "headline": "Commander brief ready.",
        "recommendation": recommendation,
        "why": why,
        "risks": risks,
        "best_next_step": best_next_step,
        "queue": [asdict(item) for item in queue],
        "operating_mode": _clean_text(awareness_mode.get("level")) or "unknown",
        "interaction_style": _interaction_style(profile),
    }
