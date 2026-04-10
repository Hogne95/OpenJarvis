from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from openjarvis.agents.manager import AgentManager
from openjarvis.server.app import create_app
from openjarvis.server.voice_loop import VoiceLoopManager


def _make_engine():
    engine = MagicMock()
    engine.engine_id = "mock"
    engine.health.return_value = True
    engine.list_models.return_value = ["test-model"]
    engine.generate.return_value = {
        "content": "ok",
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        "model": "test-model",
        "finish_reason": "stop",
    }
    return engine


class _BrokenHealthSpeechBackend:
    backend_id = "broken-health"

    def health(self) -> bool:
        raise RuntimeError("probe failed")

    def supported_formats(self):
        return ["wav", "webm"]


class _BrokenTranscribeSpeechBackend:
    backend_id = "broken-transcribe"

    def health(self) -> bool:
        return True

    def transcribe(self, audio: bytes, *, format: str = "wav", language: str | None = None):
        raise RuntimeError("transcribe failed")

    def supported_formats(self):
        return ["wav", "webm"]


def test_speech_health_degrades_when_backend_probe_raises():
    app = create_app(_make_engine(), "test-model", speech_backend=_BrokenHealthSpeechBackend())
    client = TestClient(app)

    response = client.get("/v1/speech/health")

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is False
    assert data["backend"] == "broken-health"
    assert "probe failed" in (data.get("reason") or "")


def test_voice_loop_process_audio_recovers_to_listening_after_transcribe_error():
    manager = VoiceLoopManager(speech_backend=_BrokenTranscribeSpeechBackend())
    manager.start()
    manager._audio_gate.analyze = lambda audio, format="webm": SimpleNamespace(  # type: ignore[method-assign]
        vad_backend="energy",
        wake_backend="transcript",
        rms_level=0.04,
        wake_score=None,
        wake_detected=False,
        speech_detected=True,
        duration_seconds=0.8,
    )

    result = manager.process_audio(b"fake-audio", format="webm")

    assert result["accepted"] is False
    assert result["phase"] == "listening"
    assert result["active"] is True
    assert result["message"] == "transcribe failed"
    assert result["last_error"] == "transcribe failed"


def test_managed_agents_compact_listing_returns_small_payload(tmp_path: Path):
    manager = AgentManager(str(tmp_path / "agents.db"))
    manager.create_agent(
        name="Test Agent",
        agent_type="monitor_operative",
        config={"model": "test-model", "schedule_type": "manual"},
    )
    app = create_app(_make_engine(), "test-model", agent_manager=manager)
    client = TestClient(app)

    response = client.get("/v1/managed-agents?compact=1")

    assert response.status_code == 200
    agents = response.json()["agents"]
    assert len(agents) >= 1
    sample = agents[0]
    assert "id" in sample
    assert "name" in sample
    assert "status" in sample
    assert "config" in sample
    assert "total_tokens" not in sample


def test_core_agent_architecture_bootstraps_on_startup(tmp_path: Path):
    manager = AgentManager(str(tmp_path / "core-agents.db"))
    app = create_app(_make_engine(), "test-model", agent_manager=manager)
    client = TestClient(app)

    response = client.get("/v1/agent-architecture/status")

    assert response.status_code == 200
    roles = response.json()["roles"]
    managed_roles = {role["role"]: role for role in roles if role["kind"] == "managed"}
    assert managed_roles["planner"]["ready"] is True
    assert managed_roles["executor"]["ready"] is True
    assert managed_roles["vision"]["ready"] is True


def test_run_agent_returns_running_when_agent_is_already_running(tmp_path: Path):
    manager = AgentManager(str(tmp_path / "run-agents.db"))
    agent = manager.create_agent(
        name="Inbox",
        agent_type="monitor_operative",
        config={"model": "test-model", "schedule_type": "manual"},
    )
    manager.start_tick(agent["id"])
    app = create_app(_make_engine(), "test-model", agent_manager=manager)
    client = TestClient(app)

    response = client.post(f"/v1/managed-agents/{agent['id']}/run")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert data["already_running"] is True
