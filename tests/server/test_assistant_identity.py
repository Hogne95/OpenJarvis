from __future__ import annotations

from fastapi.testclient import TestClient

from openjarvis.assistant import (
    AssistantMemoryLayers,
    analyze_decision_request,
    build_assistant_system_context,
    infer_user_interaction_profile,
    infer_user_temperament,
)
from openjarvis.server.app import create_app
from openjarvis.server.operator_memory import OperatorMemory


class _EngineStub:
    def __init__(self) -> None:
        self.engine_id = "stub"
        self._last_messages = None

    def health(self) -> bool:
        return True

    def list_models(self):
        return ["test-model"]

    def generate(self, messages, **kwargs):
        self._last_messages = messages
        return {
            "content": "Acknowledged.",
            "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14},
            "finish_reason": "stop",
        }


def test_decision_detection_prefers_recommendations() -> None:
    decision = analyze_decision_request("Should I keep building this locally or move it to the cloud?")
    assert decision.is_decision is True
    assert decision.confidence >= 0.7
    assert decision.matched_signals

    non_decision = analyze_decision_request("What ports is the server using right now?")
    assert non_decision.is_decision is False


def test_assistant_system_context_includes_memory_and_structure() -> None:
    prompt = build_assistant_system_context(
        query="Which release plan do you recommend for this repo?",
        memory_items=[
            {
                "label": "Past lesson: Release discipline",
                "detail": "Ship fewer changes, but verify the risky path before tagging.",
                "reason": "repeated pattern or prior decision",
            }
        ],
    )
    assert "You are JARVIS" in prompt
    assert "Recommendation" in prompt
    assert "Best next step" in prompt
    assert "Release discipline" in prompt


def test_assistant_system_context_formats_layered_memory() -> None:
    prompt = build_assistant_system_context(
        query="What should I focus on next?",
        memory_layers=AssistantMemoryLayers(
            identity=[{"label": "Known preferences", "detail": "Reply tone: crisp and strategic"}],
            session_focus=[{"label": "Open mission: Release", "detail": "Verify tests and changelog"}],
            long_term=[{"label": "Past lesson: Releases", "detail": "Ship smaller batches."}],
        ),
    )

    assert "Identity/Profile:" in prompt
    assert "Session Focus:" in prompt
    assert "Long-Term Memory:" in prompt
    assert "Ship smaller batches" in prompt


def test_infer_user_interaction_profile_detects_fast_autonomous_technical_style() -> None:
    profile = infer_user_interaction_profile(
        query="Continue until done and double check the backend tests.",
        recent_user_messages=[
            "go ahead",
            "dont stop in between",
            "make the architecture cleaner and test everything",
        ],
        stored_profile={"reply_tone": "clear and concise"},
    )

    assert profile.autonomy == "high initiative"
    assert profile.pace == "fast-moving"
    assert profile.technical_depth == "high"
    assert "lead" in profile.decisiveness.lower() or "recommend" in profile.decisiveness.lower()


def test_infer_user_temperament_recognizes_high_initiative_operator() -> None:
    interaction = infer_user_interaction_profile(
        query="Continue until done and keep it concise.",
        recent_user_messages=["go ahead", "just do it", "double check the backend"],
        stored_profile={
            "reply_tone": "clear and concise",
            "autonomy_preference": "high initiative",
            "verbosity_preference": "concise-first",
            "technical_depth": "high",
        },
    )
    temperament = infer_user_temperament(
        stored_profile={
            "reply_tone": "clear and concise",
            "autonomy_preference": "high initiative",
            "verbosity_preference": "concise-first",
            "technical_depth": "high",
        },
        interaction_profile=interaction,
    )

    assert temperament.execution_tempo == "fast-moving"
    assert temperament.support_level == "light-touch"
    assert temperament.briefing_style in {"compressed", "direct"}
    assert "high-initiative operator" in temperament.summary


def test_operator_memory_relevant_context_is_selective(tmp_path) -> None:
    memory = OperatorMemory(path=str(tmp_path / "operator_memory.json"))
    memory.update_profile(
        {
            "reply_tone": "crisp and strategic",
            "verbosity_preference": "concise-first",
            "autonomy_preference": "high initiative",
            "priority_contacts": ["alice@example.com"],
        }
    )
    memory.add_learning_experience(
        label="Release discipline",
        domain="coding",
        summary="Rushed releases caused avoidable cleanup.",
        lesson="Prefer smaller release batches with verification before tagging.",
        reuse_hint="Use when deciding release timing.",
        tags=["release", "verification"],
    )
    memory.update_mission(
        "repo-release",
        {
            "title": "Prepare repo release",
            "status": "active",
            "next_step": "Verify tests and changelog before release.",
        },
    )
    memory.update_relationship(
        "bob@example.com",
        {"name": "Bob", "notes": "Prefers short meeting summaries."},
    )

    relevant = memory.relevant_context("What release plan do you recommend for this repo?", limit=4)
    details = " ".join(item["detail"] for item in relevant)
    labels = " ".join(item["label"] for item in relevant)

    assert "smaller release batches" in details.lower()
    assert "verify tests and changelog" in details.lower()
    assert "bob" not in labels.lower()


def test_operator_memory_layered_relevant_context_separates_layers(tmp_path) -> None:
    memory = OperatorMemory(path=str(tmp_path / "operator_memory.json"))
    memory.update_profile(
        {
            "reply_tone": "crisp and strategic",
            "technical_depth": "high",
            "decisiveness_preference": "recommend clearly",
            "priority_contacts": ["alice@example.com"],
        }
    )
    memory.add_learning_experience(
        label="Release discipline",
        domain="coding",
        summary="Rushed releases caused avoidable cleanup.",
        lesson="Prefer smaller release batches with verification before tagging.",
        reuse_hint="Use when deciding release timing.",
        tags=["release", "verification"],
    )
    memory.update_mission(
        "repo-release",
        {
            "title": "Prepare repo release",
            "status": "active",
            "next_step": "Verify tests and changelog before release.",
        },
    )

    layers = memory.layered_relevant_context("What release plan should I use?", limit=5)

    assert any("Known preferences" in item["label"] for item in layers.identity)
    assert any("technical depth" in item["detail"].lower() for item in layers.identity)
    assert any("Open mission" in item["label"] for item in layers.session_focus)
    assert any("Past lesson" in item["label"] for item in layers.long_term)


def test_chat_route_injects_identity_and_relevant_memory(tmp_path) -> None:
    engine = _EngineStub()
    app = create_app(engine, "test-model")
    memory = OperatorMemory(path=str(tmp_path / "operator_memory.json"))
    memory.update_profile(
        {
            "reply_tone": "clear and strategic",
            "verbosity_preference": "concise-first",
            "technical_depth": "high",
            "autonomy_preference": "high initiative",
            "priority_contacts": ["alice@example.com"],
        }
    )
    memory.add_learning_experience(
        label="Infra tradeoffs",
        domain="ops",
        summary="Cloud moves increase convenience but add lock-in and cost.",
        lesson="Recommend local-first unless uptime requirements clearly justify cloud complexity.",
        reuse_hint="Use when evaluating hosting choices.",
        tags=["cloud", "local", "hosting"],
    )
    memory.update_mission(
        "hosting-review",
        {
            "title": "Hosting review",
            "status": "active",
            "next_step": "Compare local reliability gains against cloud operating overhead.",
        },
    )
    app.state.operator_memory = memory
    client = TestClient(app)

    resp = client.post(
        "/v1/chat/completions",
        json={
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "Should I keep JARVIS local or move it to a hosted server?"}
            ],
        },
    )

    assert resp.status_code == 200
    assert engine._last_messages is not None
    first = engine._last_messages[0]
    assert first.role.value == "system"
    assert "You are JARVIS" in first.content
    assert "Recommendation" in first.content
    assert "User interaction profile:" in first.content
    assert "Autonomy preference: high initiative" in first.content
    assert "User operating temperament:" in first.content
    assert "Support level: light-touch" in first.content
    assert "Identity/Profile:" in first.content
    assert "Session Focus:" in first.content
    assert "local-first" in first.content.lower()
    assert "hosting review" in first.content.lower()
