from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
import unittest.mock as mock

from fastapi.testclient import TestClient

from openjarvis.agents.executor import AgentExecutor
from openjarvis.agents.manager import AgentManager
from openjarvis.core.config import load_config
from openjarvis.server.action_center import ActionCenterManager
from openjarvis.server.agent_manager_routes import _make_lightweight_system
from openjarvis.server.app import create_app
from openjarvis.server import jarvis_intent
from openjarvis.server.voice_loop import VoiceLoopManager
from openjarvis.server.repo_registry import RepoRegistry
from openjarvis.server.workbench import WorkbenchManager
from openjarvis.system import SystemBuilder


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


def test_run_agent_seeds_manual_task_for_visible_launch_state(tmp_path: Path):
    manager = AgentManager(str(tmp_path / "seed-task-agents.db"))
    agent = manager.create_agent(
        name="JARVIS Inbox Triager",
        agent_type="monitor_operative",
        config={
            "model": "test-model",
            "schedule_type": "manual",
            "instruction": "Monitor my connected email and messaging sources.",
        },
    )
    app = create_app(_make_engine(), "test-model", agent_manager=manager)
    client = TestClient(app)

    response = client.post(f"/v1/managed-agents/{agent['id']}/run")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert data["already_running"] is False
    assert data["task"] is not None
    assert "urgent items" in data["task"]["description"]
    tasks = manager.list_tasks(agent["id"])
    assert len(tasks) == 1
    assert tasks[0]["status"] == "pending"


def test_inbox_triager_runtime_config_prefers_connector_collection():
    agent = {"name": "JARVIS Inbox Triager"}
    config = {
        "tools": ["channel_send", "channel_list"],
        "instruction": "Monitor my connected email and messaging sources.",
        "system_prompt": "You are an Inbox Triager agent.",
    }

    normalized = AgentExecutor._normalize_managed_agent_config(agent, config)

    assert "digest_collect" in normalized["tools"]
    assert "memory_store" in normalized["tools"]
    assert "memory_retrieve" in normalized["tools"]
    assert "digest_collect" in normalized["instruction"]
    assert "Runtime Override" in normalized["system_prompt"]


def test_lightweight_system_uses_sqlite_memory_fallback():
    system = _make_lightweight_system(_make_engine(), "test-model")

    assert system.memory_backend is not None


def test_system_memory_resolution_falls_back_to_sqlite_when_registry_create_fails():
    builder = SystemBuilder(config=load_config())

    with mock.patch(
        "openjarvis.core.registry.MemoryRegistry.create",
        side_effect=ImportError("openjarvis_rust missing"),
    ):
        memory_backend = builder._resolve_memory(builder._config)

    assert memory_backend is not None
    assert memory_backend.__class__.__name__ == "SQLiteMemory"


def test_action_center_capabilities_cache_reuses_recent_probe():
    manager = ActionCenterManager()

    with mock.patch(
        "openjarvis.server.action_center.resolve_google_credentials",
        side_effect=lambda path: path,
    ), mock.patch(
        "openjarvis.server.action_center.load_tokens",
        side_effect=[
            {"token": "gmail"},
            {"token": "calendar"},
            {"token": "tasks"},
            {"email": "user@example.com", "password": "secret"},
        ],
    ) as load_tokens_mock:
        first = manager.capabilities()
        second = manager.capabilities()

    assert first == second
    assert load_tokens_mock.call_count == 4


def test_desktop_state_snapshot_returns_cached_success_during_failure_cooldown():
    original_success = jarvis_intent._DESKTOP_STATE_LAST_SUCCESS
    original_success_at = jarvis_intent._DESKTOP_STATE_LAST_SUCCESS_AT
    original_error = jarvis_intent._DESKTOP_STATE_LAST_ERROR
    original_cooldown = jarvis_intent._DESKTOP_STATE_COOLDOWN_UNTIL
    try:
        jarvis_intent._DESKTOP_STATE_LAST_SUCCESS = None
        jarvis_intent._DESKTOP_STATE_LAST_SUCCESS_AT = 0.0
        jarvis_intent._DESKTOP_STATE_LAST_ERROR = ""
        jarvis_intent._DESKTOP_STATE_COOLDOWN_UNTIL = 0.0

        ok = SimpleNamespace(
            returncode=0,
            stdout='{"active_window_title":"Code","active_process_name":"code","open_windows":[]}',
            stderr="",
        )
        failed = SimpleNamespace(returncode=1, stdout="", stderr="native probe failed")
        monotonic_values = iter([10.0, 20.0, 21.0])

        with mock.patch(
            "openjarvis.server.jarvis_intent.time.monotonic",
            side_effect=lambda: next(monotonic_values),
        ), mock.patch(
            "openjarvis.server.jarvis_intent._run_powershell",
            side_effect=[ok, failed],
        ):
            first = jarvis_intent._desktop_state_snapshot()
            second = jarvis_intent._desktop_state_snapshot()
            third = jarvis_intent._desktop_state_snapshot()

        assert first["active_process_name"] == "code"
        assert second["active_process_name"] == "code"
        assert third["active_process_name"] == "code"
    finally:
        jarvis_intent._DESKTOP_STATE_LAST_SUCCESS = original_success
        jarvis_intent._DESKTOP_STATE_LAST_SUCCESS_AT = original_success_at
        jarvis_intent._DESKTOP_STATE_LAST_ERROR = original_error
        jarvis_intent._DESKTOP_STATE_COOLDOWN_UNTIL = original_cooldown


def test_workbench_stage_rejects_missing_working_dir(tmp_path: Path):
    manager = WorkbenchManager(default_working_dir=str(tmp_path))

    missing = tmp_path / "does-not-exist"

    try:
        manager.stage(command="git status", working_dir=str(missing))
    except ValueError as exc:
        assert "does not exist" in str(exc)
    else:
        raise AssertionError("Expected stage() to reject a missing working directory")


def test_repo_registry_summary_rejects_missing_root(tmp_path: Path):
    storage_path = tmp_path / "repos.json"
    registry = RepoRegistry(storage_path=storage_path, default_root=str(tmp_path))

    missing = tmp_path / "missing-repo"

    try:
        registry.summary(str(missing))
    except ValueError as exc:
        assert "does not exist" in str(exc)
    else:
        raise AssertionError("Expected summary() to reject a missing repository path")
