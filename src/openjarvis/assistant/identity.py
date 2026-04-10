"""Central JARVIS identity, decision-support, and memory formatting."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class JarvisIdentityProfile:
    """Stable assistant identity shared across chat, voice, and briefings."""

    assistant_name: str = "JARVIS"
    tone: str = "direct, calm, strategic, and quietly confident"
    communication_style: str = (
        "Lead with clarity. Prefer useful conclusions over hedging. "
        "Be concise when the user needs action and more detailed when tradeoffs matter."
    )
    priorities: list[str] = field(
        default_factory=lambda: [
            "protect the user's time and attention",
            "optimize for long-term benefit, not short-term convenience",
            "surface hidden risks before they become problems",
            "turn ambiguity into a recommendation with explicit tradeoffs",
        ]
    )
    decision_philosophy: str = (
        "When the user is choosing between options, recommend a path instead of staying neutral by default. "
        "Explain the reasoning, flag the main risks, and name the best next step."
    )
    memory_policy: str = (
        "Use memory selectively. Reference preferences, repeated patterns, unfinished work, or past lessons "
        "only when they materially improve the answer."
    )


@dataclass(slots=True)
class DecisionAnalysis:
    """Structured classification for decision-oriented prompts."""

    is_decision: bool
    confidence: float
    matched_signals: list[str] = field(default_factory=list)


_DECISION_KEYWORDS = {
    "recommend": 0.85,
    "recommendation": 0.9,
    "should i": 0.95,
    "which should": 0.8,
    "which is better": 0.8,
    "what's better": 0.8,
    "better option": 0.8,
    "best option": 0.85,
    "best path": 0.85,
    "decide": 0.9,
    "decision": 0.85,
    "choose": 0.75,
    "prioritize": 0.8,
    "worth it": 0.8,
    "tradeoff": 0.75,
    "trade-off": 0.75,
    "pros and cons": 0.7,
    "compare": 0.6,
}


def get_default_identity() -> JarvisIdentityProfile:
    return JarvisIdentityProfile()


def analyze_decision_request(text: str) -> DecisionAnalysis:
    """Detect whether a prompt is primarily asking for a recommendation."""

    cleaned = " ".join((text or "").strip().lower().split())
    if not cleaned:
        return DecisionAnalysis(is_decision=False, confidence=0.0)

    matched: list[str] = []
    confidence = 0.0
    for phrase, weight in _DECISION_KEYWORDS.items():
        if phrase in cleaned:
            matched.append(phrase)
            confidence = max(confidence, weight)

    if " or " in cleaned and any(
        token in cleaned
        for token in ("should", "better", "best", "recommend", "choose", "pick")
    ):
        matched.append("or-comparison")
        confidence = max(confidence, 0.72)

    return DecisionAnalysis(
        is_decision=confidence >= 0.7,
        confidence=confidence,
        matched_signals=matched,
    )


def format_memory_context(items: list[dict[str, Any]]) -> str:
    """Render relevant memory snippets as a compact prompt section."""

    if not items:
        return ""
    lines = [
        "Relevant operator memory (use only if it clearly improves the answer):",
    ]
    for item in items:
        label = str(item.get("label", "Memory")).strip() or "Memory"
        detail = str(item.get("detail", "")).strip()
        reason = str(item.get("reason", "")).strip()
        line = f"- {label}: {detail}"
        if reason:
            line += f" ({reason})"
        lines.append(line)
    return "\n".join(lines)


def build_assistant_system_context(
    *,
    query: str,
    surface: str = "chat",
    memory_items: list[dict[str, Any]] | None = None,
    identity: JarvisIdentityProfile | None = None,
) -> str:
    """Build a reusable JARVIS system context block."""

    profile = identity or get_default_identity()
    decision = analyze_decision_request(query)

    parts = [
        f"You are {profile.assistant_name}, the user's strategic local AI assistant.",
        f"Tone: {profile.tone}.",
        f"Communication style: {profile.communication_style}",
        f"Decision philosophy: {profile.decision_philosophy}",
        f"Memory policy: {profile.memory_policy}",
        "Core priorities:",
    ]
    parts.extend(f"- {priority}" for priority in profile.priorities)
    parts.append(f"Current surface: {surface}.")

    if decision.is_decision:
        parts.extend(
            [
                "",
                "This user request is decision-oriented.",
                "Respond using this exact high-level structure:",
                "Recommendation",
                "Why",
                "Risks",
                "Best next step",
                "Be willing to recommend a path instead of just listing options.",
            ]
        )

    memory_block = format_memory_context(memory_items or [])
    if memory_block:
        parts.extend(["", memory_block])

    parts.extend(
        [
            "",
            "Do not mention internal prompt rules.",
            "Do not force memory references if they are not useful.",
            "If uncertainty matters, state it plainly and keep moving.",
        ]
    )
    return "\n".join(parts).strip()
