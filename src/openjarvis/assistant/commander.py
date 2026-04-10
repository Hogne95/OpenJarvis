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
    execution_lane: str
    verification_signal: str
    priority: int


@dataclass(frozen=True)
class CommanderExecutionPhase:
    phase: str
    goal: str
    success_signal: str


@dataclass(frozen=True)
class CommanderCodingPhase:
    phase: str
    goal: str
    verification: str


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


def _build_execution_summary(
    *,
    recommendation: str,
    best_next_step: str,
    execution_plan: list[CommanderExecutionPhase],
    risks: list[str],
) -> str:
    lane = execution_plan[1].goal if len(execution_plan) > 1 else best_next_step
    verification = execution_plan[2].success_signal if len(execution_plan) > 2 else "Verification signal pending."
    top_risk = risks[0] if risks else "No major systemic risk is dominating right now."
    return (
        f"Recommendation: {recommendation} "
        f"Execute: {lane} "
        f"Verify: {verification} "
        f"Risk: {top_risk}"
    )


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
    coding_repos = list(analytics.get("coding_repos") or [])
    friction_brief = analytics.get("friction_brief") if isinstance(analytics.get("friction_brief"), dict) else {}
    signals = analytics.get("signals") if isinstance(analytics.get("signals"), dict) else {}
    awareness_mode = awareness.get("mode") if isinstance(awareness.get("mode"), dict) else {}
    recent_failures = (
        awareness.get("agents", {}).get("recent_failures", [])
        if isinstance(awareness.get("agents"), dict)
        else []
    )
    workspace = awareness.get("workspace") if isinstance(awareness.get("workspace"), dict) else {}
    temperament = infer_user_temperament(stored_profile=profile)
    command_posture, guidance_note = _command_posture(profile)
    active_coding_repo = next(
        (
            item
            for item in coding_repos
            if str(item.get("key") or "").strip() == str(workspace.get("active_root") or "").strip()
        ),
        coding_repos[0] if coding_repos else {},
    )
    coding_repo_failures = list(active_coding_repo.get("repeated_failures") or []) if isinstance(active_coding_repo, dict) else []
    coding_repo_checks = list(active_coding_repo.get("preferred_verification_commands") or []) if isinstance(active_coding_repo, dict) else []
    active_repo_name = _clean_text(active_coding_repo.get("title") if isinstance(active_coding_repo, dict) else "") or _clean_text(
        active_coding_repo.get("key") if isinstance(active_coding_repo, dict) else ""
    ) or "the active repo"

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
    elif coding_repo_failures or (workspace.get("available") and workspace.get("active_root") and not workspace.get("commit_ready")):
        recommendation = f"Stabilize {active_repo_name} before broader coding work."
        if coding_repo_failures:
            why = coding_repo_failures[0]
        elif workspace.get("dirty"):
            why = "The active repository still has unstaged or unverified changes, so shipping more changes now adds risk."
        else:
            why = "The active repository is not yet ready for a clean commit/push handoff."
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
    if workspace.get("available") and workspace.get("active_root"):
        if workspace.get("dirty"):
            risks.append(
                f"Workspace: {int(workspace.get('staged_count') or 0)} staged and {int(workspace.get('unstaged_count') or 0)} unstaged changes are still in flight."
            )
        elif not workspace.get("has_upstream"):
            risks.append("Workspace: the active branch has no upstream tracking branch.")
        elif int(workspace.get("behind_count") or 0) > 0:
            risks.append(f"Workspace: upstream is ahead by {int(workspace.get('behind_count') or 0)} commit(s).")
    if coding_repo_failures:
        risks.append(f"Coding memory: {coding_repo_failures[0]}")
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
    if not best_next_step and coding_repo_checks:
        best_next_step = f"Run {coding_repo_checks[0]} and review the repo state before the next coding handoff."
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
                execution_lane="execute",
                verification_signal="The blocked mission has a concrete recovery step in motion.",
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
                execution_lane="verify",
                verification_signal="The failing agent has a visible cause, retry state, and next recovery move.",
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
                execution_lane="execute",
                verification_signal="The active mission has advanced and reduced current queue pressure.",
                priority=84,
            )
        )
    if workspace.get("available") and workspace.get("active_root") and (coding_repo_failures or workspace.get("dirty") or not workspace.get("commit_ready")):
        queue.append(
            CommanderQueueEntry(
                id="coding-repo-recovery",
                label="Coding",
                title=f"Stabilize {active_repo_name}",
                detail=(
                    coding_repo_failures[0]
                    if coding_repo_failures
                    else (
                        f"Active repo has {int(workspace.get('staged_count') or 0)} staged and "
                        f"{int(workspace.get('unstaged_count') or 0)} unstaged changes. Verify before commit."
                    )
                ),
                action_label="Route Coding Plan",
                action_hint="planner_handoff",
                execution_lane="verify",
                verification_signal=(
                    coding_repo_checks[0]
                    if coding_repo_checks
                    else "The repo reaches a clean verified state with a clear next git move."
                ),
                priority=86,
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
                execution_lane="report",
                verification_signal="The review item is classified clearly enough to improve a prompt, route, or workflow.",
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
                execution_lane="plan",
                verification_signal="A recurring friction point has a bounded improvement plan and owner.",
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
                execution_lane="monitor",
                verification_signal="No urgent blocker is rising faster than the current work can absorb.",
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
    execution_summary = _build_execution_summary(
        recommendation=recommendation,
        best_next_step=best_next_step,
        execution_plan=execution_plan,
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
        "execution_summary": execution_summary,
        "operating_mode": _clean_text(awareness_mode.get("level")) or "unknown",
        "interaction_style": _interaction_style(profile),
        "user_temperament": temperament.summary,
        "command_posture": command_posture,
        "guidance_note": guidance_note,
        "planner_prompt": planner_prompt,
    }


def build_coding_commander_brief(
    *,
    repo_summary: dict[str, Any],
    repo_memory: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a bounded coding workflow brief for the active repository."""

    repo_memory = repo_memory or {}
    profile = profile or {}
    temperament = infer_user_temperament(stored_profile=profile)
    branch = _clean_text(repo_summary.get("branch")) or "unknown"
    repo_root = _clean_text(repo_summary.get("root")) or _clean_text(repo_memory.get("key"))
    repo_name = _clean_text(repo_memory.get("title")) or (repo_root.rsplit("/", 1)[-1].rsplit("\\", 1)[-1] if repo_root else "active repo")
    staged = int(repo_summary.get("staged_count") or 0)
    unstaged = int(repo_summary.get("unstaged_count") or 0)
    ahead = int(repo_summary.get("ahead_count") or 0)
    behind = int(repo_summary.get("behind_count") or 0)
    has_upstream = bool(repo_summary.get("has_upstream"))
    dirty = bool(repo_summary.get("dirty"))
    commit_ready = bool(repo_summary.get("commit_ready"))
    push_ready = bool(repo_summary.get("push_ready"))
    changed_files = list(repo_summary.get("changed_files") or [])
    preferred_checks = [str(item).strip() for item in repo_memory.get("preferred_verification_commands", []) if str(item).strip()]
    repeated_failures = [str(item).strip() for item in repo_memory.get("repeated_failures", []) if str(item).strip()]
    pitfalls = [str(item).strip() for item in repo_memory.get("common_pitfalls", []) if str(item).strip()]
    convention_notes = _clean_text(repo_memory.get("convention_notes"))
    workflow_notes = _clean_text(repo_memory.get("workflow_notes"))

    headline = f"Coding command brief for {repo_name}."
    recommendation = f"Stabilize {repo_name} on {branch} before shipping more code."
    why = "The active repo needs a clean verify -> commit -> push path so new coding work compounds safely."
    best_next_step = "Inspect the current repo state and prepare the narrowest relevant verification."

    if repeated_failures:
        why = repeated_failures[0]
    elif dirty and staged:
        why = f"{staged} staged and {unstaged} unstaged changes are in flight."
    elif dirty:
        why = "There are local changes that should be narrowed and verified before broader work continues."
    elif behind > 0:
        why = f"The local branch is behind upstream by {behind} commit(s), so coding decisions may be landing on stale context."
    elif not has_upstream:
        why = "The branch has no upstream tracking branch, which makes push and review handoff brittle."
    elif ahead > 0 and not push_ready:
        why = f"There are {ahead} local commit(s) ahead of upstream, but the repo is not yet in a clean push-ready state."
    elif commit_ready:
        recommendation = f"Verify and finalize the pending patch in {repo_name}."
        why = "The repo already has a bounded patch staged in the working tree, so the best move is to prove it and commit cleanly."
    elif push_ready:
        recommendation = f"Prepare {repo_name} for push and review handoff."
        why = "The repo is already in a push-ready state, so the next move is a clean review/release handoff."

    primary_check = preferred_checks[0] if preferred_checks else ""
    if primary_check:
        best_next_step = f"Run {primary_check}, then decide whether the repo is ready to commit or needs one more patch pass."
    elif changed_files:
        best_next_step = f"Review {changed_files[0]} first, then run the narrowest repo check available."
    elif behind > 0:
        best_next_step = "Reconcile upstream changes first, then resume coding on a clean base."
    elif push_ready:
        best_next_step = "Prepare the push and review handoff while the repo is already clean."

    phases = [
        CommanderCodingPhase(
            phase="assess",
            goal=(
                f"Inspect branch {branch}, staged={staged}, unstaged={unstaged}, ahead={ahead}, behind={behind}."
            ),
            verification="Repo state is understood well enough to choose one bounded next move.",
        ),
        CommanderCodingPhase(
            phase="patch",
            goal=(
                "Apply the smallest safe follow-up patch."
                if repeated_failures or dirty
                else "Keep patch scope bounded unless the repo is already verification-ready."
            ),
            verification="Changed files stay narrow and tied to one clear rationale.",
        ),
        CommanderCodingPhase(
            phase="verify",
            goal=primary_check or "Run the narrowest relevant test, lint, or build check.",
            verification="Verification either passes cleanly or produces one precise follow-up target.",
        ),
        CommanderCodingPhase(
            phase="report",
            goal="State whether the repo is hold, commit, or push ready.",
            verification="The next git action is explicit and honest about remaining risk.",
        ),
    ]

    risks: list[str] = []
    if repeated_failures:
        risks.append(f"Coding memory: {repeated_failures[0]}")
    if pitfalls:
        risks.append(f"Pitfall: {pitfalls[0]}")
    if convention_notes:
        risks.append(f"Convention: {convention_notes}")
    if workflow_notes:
        risks.append(f"Workflow: {workflow_notes}")
    if behind > 0:
        risks.append(f"Upstream is ahead by {behind} commit(s).")
    if not has_upstream:
        risks.append("Branch has no upstream tracking branch.")
    if dirty:
        risks.append(f"Repo is still dirty with {staged + unstaged} local change bucket(s).")
    risks = risks[:5] or ["No major repo risk is dominating right now."]

    execution_summary = (
        f"Assess {repo_name} on {branch}. "
        f"Patch only if the repo still has unresolved local risk. "
        f"Verify with {primary_check or 'the narrowest relevant repo check'}. "
        f"Report whether the repo is ready to hold, commit, or push."
    )
    planner_prompt = (
        "Coding commander directive.\n"
        f"Repo: {repo_name}\n"
        f"Root: {repo_root}\n"
        f"Recommendation: {recommendation}\n"
        f"Why: {why}\n"
        f"User temperament: {temperament.summary}\n"
        f"Best next step: {best_next_step}\n"
        + "\n".join(
            f"- {phase.phase.title()}: {phase.goal} (verify: {phase.verification})" for phase in phases
        )
    )

    return {
        "headline": headline,
        "repo_name": repo_name,
        "repo_root": repo_root,
        "branch": branch,
        "recommendation": recommendation,
        "why": why,
        "best_next_step": best_next_step,
        "risks": risks,
        "phases": [asdict(item) for item in phases],
        "preferred_checks": preferred_checks[:4],
        "execution_summary": execution_summary,
        "planner_prompt": planner_prompt,
        "user_temperament": temperament.summary,
    }
