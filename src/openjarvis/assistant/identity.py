"""Central JARVIS identity, decision-support, and memory formatting."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from openjarvis.assistant.memory_layers import AssistantMemoryLayers, format_layered_memory_context


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


@dataclass(slots=True)
class UserInteractionProfile:
    response_depth: str = "adaptive"
    pace: str = "steady"
    decisiveness: str = "recommend clearly"
    autonomy: str = "balanced"
    technical_depth: str = "adaptive"
    collaboration_style: str = "collaborative"


@dataclass(slots=True)
class UserTemperamentProfile:
    summary: str = "balanced operator who benefits from clear recommendations"
    risk_posture: str = "measured"
    execution_tempo: str = "steady"
    briefing_style: str = "direct"
    support_level: str = "balanced"


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


def infer_user_interaction_profile(
    *,
    query: str,
    recent_user_messages: list[str] | None = None,
    stored_profile: dict[str, Any] | None = None,
) -> UserInteractionProfile:
    profile = UserInteractionProfile()
    stored = stored_profile or {}
    if str(stored.get("verbosity_preference", "")).strip():
        profile.response_depth = str(stored.get("verbosity_preference")).strip()
    if str(stored.get("technical_depth", "")).strip():
        profile.technical_depth = str(stored.get("technical_depth")).strip()
    if str(stored.get("decisiveness_preference", "")).strip():
        profile.decisiveness = str(stored.get("decisiveness_preference")).strip()
    if str(stored.get("autonomy_preference", "")).strip():
        profile.autonomy = str(stored.get("autonomy_preference")).strip()
    reply_tone = str(stored.get("reply_tone", "")).strip().lower()
    if any(token in reply_tone for token in ("concise", "direct", "crisp")):
        profile.collaboration_style = "direct and efficient"
    if any(token in reply_tone for token in ("warm", "supportive", "friendly")):
        profile.collaboration_style = "supportive and collaborative"

    recent = [msg.strip() for msg in (recent_user_messages or []) if str(msg).strip()]
    sample = " ".join(recent[-4:] + ([query] if query.strip() else [])).lower()
    avg_words = sum(len(msg.split()) for msg in recent[-4:] or [query]) / max(len(recent[-4:] or [query]), 1)

    autonomy_signals = (
        "go ahead",
        "just do it",
        "continue",
        "until done",
        "no need to stop",
        "approved",
        "do everything",
        "non stop",
    )
    detailed_signals = ("explain", "deep", "details", "double check", "triple check", "why", "tradeoff")
    technical_signals = (
        "api",
        "backend",
        "frontend",
        "repo",
        "latency",
        "architecture",
        "memory",
        "agent",
        "test",
        "voice",
        "hud",
    )
    collaborative_signals = ("let's", "we should", "can we", "work on")

    if any(signal in sample for signal in autonomy_signals):
        profile.autonomy = "high initiative"
        profile.pace = "fast-moving"
        profile.decisiveness = "take the lead and recommend strongly"
    elif avg_words <= 8:
        profile.pace = "fast-moving"

    if any(signal in sample for signal in detailed_signals):
        profile.response_depth = "detailed when useful"
    elif avg_words <= 10 and profile.response_depth == "adaptive":
        profile.response_depth = "concise-first"

    if any(signal in sample for signal in technical_signals):
        profile.technical_depth = "high"

    if any(signal in sample for signal in collaborative_signals):
        profile.collaboration_style = "collaborative and execution-oriented"

    return profile


def infer_user_temperament(
    *,
    stored_profile: dict[str, Any] | None = None,
    interaction_profile: UserInteractionProfile | None = None,
) -> UserTemperamentProfile:
    stored = stored_profile or {}
    interaction = interaction_profile or UserInteractionProfile()
    temperament = UserTemperamentProfile()

    autonomy = str(stored.get("autonomy_preference", interaction.autonomy)).strip().lower()
    decisiveness = str(stored.get("decisiveness_preference", interaction.decisiveness)).strip().lower()
    verbosity = str(stored.get("verbosity_preference", interaction.response_depth)).strip().lower()
    technical_depth = str(stored.get("technical_depth", interaction.technical_depth)).strip().lower()
    reply_tone = str(stored.get("reply_tone", "")).strip().lower()

    if "high" in autonomy or "initiative" in autonomy:
        temperament.execution_tempo = "fast-moving"
        temperament.support_level = "light-touch"
        temperament.summary = "high-initiative operator who wants decisive momentum with minimal drag"
    elif "low" in autonomy or "careful" in autonomy or "guided" in autonomy:
        temperament.execution_tempo = "deliberate"
        temperament.support_level = "guided"
        temperament.summary = "careful operator who benefits from explicit safeguards and stepwise confidence"

    if any(token in decisiveness for token in ("strong", "clearly", "lead")):
        temperament.risk_posture = "assertive"
    if any(token in decisiveness for token in ("cautious", "careful", "tradeoff")):
        temperament.risk_posture = "cautious"

    if any(token in verbosity for token in ("concise", "crisp", "brief")):
        temperament.briefing_style = "compressed"
    elif any(token in verbosity for token in ("detailed", "thorough", "deep")):
        temperament.briefing_style = "expanded"

    if any(token in reply_tone for token in ("warm", "supportive", "friendly")):
        temperament.support_level = "supportive"
    elif any(token in reply_tone for token in ("clear", "direct", "concise", "crisp")):
        temperament.briefing_style = "direct"

    if technical_depth == "high":
        temperament.summary += " and expects technical reasoning without oversimplification"

    return temperament


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
    memory_layers: AssistantMemoryLayers | None = None,
    identity: JarvisIdentityProfile | None = None,
    user_interaction: UserInteractionProfile | None = None,
    user_temperament: UserTemperamentProfile | None = None,
) -> str:
    """Build a reusable JARVIS system context block."""

    profile = identity or get_default_identity()
    decision = analyze_decision_request(query)
    default_interaction = UserInteractionProfile()
    default_temperament = UserTemperamentProfile()
    compact_chat = surface == "chat" and not decision.is_decision

    if compact_chat:
        parts = [
            f"You are {profile.assistant_name}, the user's strategic local AI assistant.",
            "Be direct, calm, and useful.",
            "Prefer concise answers unless the user clearly needs more detail.",
            "Use memory only when it materially improves the answer.",
            "Recommend a next step when it helps.",
            f"Core priorities: {'; '.join(profile.priorities[:3])}.",
        ]
    else:
        parts = [
            f"You are {profile.assistant_name}, the user's strategic local AI assistant.",
            f"Tone: {profile.tone}.",
            f"Communication style: {profile.communication_style}",
            f"Decision philosophy: {profile.decision_philosophy}",
            f"Memory policy: {profile.memory_policy}",
        ]
        parts.append("Core priorities:")
        parts.extend(f"- {priority}" for priority in profile.priorities)
    parts.append(f"Current surface: {surface}.")
    if user_interaction is not None:
        interaction_changed = any(
            getattr(user_interaction, field_name) != getattr(default_interaction, field_name)
            for field_name in (
                "response_depth",
                "pace",
                "decisiveness",
                "autonomy",
                "technical_depth",
                "collaboration_style",
            )
        )
        if not compact_chat or interaction_changed:
            parts.extend(
                [
                    "",
                    "User interaction profile:",
                    f"- Response depth: {user_interaction.response_depth}",
                    f"- Pace: {user_interaction.pace}",
                    f"- Decision handling: {user_interaction.decisiveness}",
                    f"- Autonomy preference: {user_interaction.autonomy}",
                    f"- Technical level: {user_interaction.technical_depth}",
                    f"- Collaboration style: {user_interaction.collaboration_style}",
                ]
            )
    if user_temperament is not None:
        temperament_changed = any(
            getattr(user_temperament, field_name) != getattr(default_temperament, field_name)
            for field_name in (
                "summary",
                "risk_posture",
                "execution_tempo",
                "briefing_style",
                "support_level",
            )
        )
        if not compact_chat or temperament_changed:
            parts.extend(
                [
                    "",
                    "User operating temperament:",
                    f"- Summary: {user_temperament.summary}",
                    f"- Risk posture: {user_temperament.risk_posture}",
                    f"- Execution tempo: {user_temperament.execution_tempo}",
                    f"- Briefing style: {user_temperament.briefing_style}",
                    f"- Support level: {user_temperament.support_level}",
                ]
            )

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

    memory_block = ""
    if memory_layers is not None and memory_layers.has_content():
        memory_block = format_layered_memory_context(memory_layers)
    else:
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
