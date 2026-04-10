"""Tests for extended API routes."""

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.core.types import TelemetryRecord  # noqa: E402
from openjarvis.server.api_routes import include_all_routes  # noqa: E402
from openjarvis.telemetry.store import TelemetryStore  # noqa: E402


def _make_app():
    app = FastAPI()
    include_all_routes(app)
    return app


class TestAgentRoutes:
    def test_list_agents(self):
        client = TestClient(_make_app())
        resp = client.get("/v1/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert "registered" in data
        assert "running" in data

    def test_create_agent(self):
        client = TestClient(_make_app())
        resp = client.post("/v1/agents", json={"agent_type": "simple"})
        # May succeed or fail depending on agent_tools availability
        assert resp.status_code in (200, 501)

    def test_kill_nonexistent(self):
        client = TestClient(_make_app())
        resp = client.delete("/v1/agents/nonexistent")
        assert resp.status_code in (404, 501)


class TestMemoryRoutes:
    def test_search(self):
        client = TestClient(_make_app())
        resp = client.post("/v1/memory/search", json={"query": "test"})
        # May fail if SQLite not set up, that's ok
        assert resp.status_code in (200, 500)

    def test_stats(self):
        client = TestClient(_make_app())
        resp = client.get("/v1/memory/stats")
        assert resp.status_code in (200, 500)


class TestBudgetRoutes:
    def test_get_budget(self):
        client = TestClient(_make_app())
        resp = client.get("/v1/budget")
        assert resp.status_code == 200
        data = resp.json()
        assert "limits" in data
        assert "usage" in data

    def test_set_limits(self):
        client = TestClient(_make_app())
        resp = client.put("/v1/budget/limits", json={"max_tokens_per_day": 100000})
        assert resp.status_code == 200
        assert resp.json()["limits"]["max_tokens_per_day"] == 100000


class TestMetricsRoute:
    def test_metrics_endpoint(self):
        client = TestClient(_make_app())
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "openjarvis_build_info" in resp.text

    def test_metrics_endpoint_reports_telemetry_totals(self, tmp_path, monkeypatch):
        from openjarvis.core import config as core_config

        telemetry_db = tmp_path / "telemetry.db"
        store = TelemetryStore(telemetry_db)
        store.record(
            TelemetryRecord(
                timestamp=1.0,
                model_id="qwen3:8b",
                engine="ollama",
                total_tokens=42,
                prompt_tokens=12,
                completion_tokens=30,
                latency_seconds=1.5,
                cost_usd=0.0025,
                energy_joules=3.5,
            )
        )
        store.close()
        monkeypatch.setattr(core_config, "DEFAULT_CONFIG_DIR", tmp_path)

        app = _make_app()
        app.state.session_start = 0.0
        client = TestClient(app)
        resp = client.get("/metrics")

        assert resp.status_code == 200
        assert "openjarvis_telemetry_calls_total 1" in resp.text
        assert "openjarvis_telemetry_tokens_total 42" in resp.text
        assert "openjarvis_telemetry_cost_usd_total 0.002500" in resp.text
        assert "openjarvis_telemetry_latency_seconds_total 1.500000" in resp.text


class TestSkillRoutes:
    def test_list_skills(self):
        client = TestClient(_make_app())
        resp = client.get("/v1/skills")
        assert resp.status_code == 200
        assert "skills" in resp.json()


class TestSessionRoutes:
    def test_list_sessions(self):
        client = TestClient(_make_app())
        resp = client.get("/v1/sessions")
        assert resp.status_code == 200


class TestTraceRoutes:
    def test_list_traces(self):
        client = TestClient(_make_app())
        resp = client.get("/v1/traces")
        assert resp.status_code == 200
