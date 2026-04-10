from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from openjarvis.server.app import create_app
from openjarvis.server.user_store import UserStore


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


def _make_client(tmp_path: Path) -> TestClient:
    app = create_app(_make_engine(), "test-model")
    original_store = app.state.user_store
    original_store.close()
    app.state.user_store = UserStore(str(tmp_path / "web-users.db"))
    return TestClient(app)


def test_auth_status_requires_bootstrap_when_no_users_exist(tmp_path: Path):
    client = _make_client(tmp_path)

    response = client.get("/v1/auth/status")

    assert response.status_code == 200
    data = response.json()
    assert data["bootstrap_required"] is True
    assert data["authenticated"] is False
    assert data["user"] is None


def test_bootstrap_creates_first_admin_and_session(tmp_path: Path):
    client = _make_client(tmp_path)

    response = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "Hogne",
            "password": "supersecret123",
            "display_name": "Hogne",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["username"] == "hogne"
    assert data["user"]["role"] == "superadmin"
    assert "openjarvis_session" in response.cookies

    me = client.get("/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "hogne"


def test_bootstrap_rejects_second_admin_creation(tmp_path: Path):
    client = _make_client(tmp_path)
    first = {
        "username": "owner",
        "password": "supersecret123",
        "display_name": "Owner",
    }
    client.post("/v1/auth/bootstrap", json=first)

    response = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "second",
            "password": "supersecret123",
            "display_name": "Second",
        },
    )

    assert response.status_code == 400
    assert "first user" in response.json()["detail"].lower()


def test_login_logout_and_me_round_trip(tmp_path: Path):
    client = _make_client(tmp_path)
    client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    client.post("/v1/auth/logout")

    unauthenticated = client.get("/v1/auth/me")
    assert unauthenticated.status_code == 401

    bad_login = client.post(
        "/v1/auth/login",
        json={"username": "owner", "password": "wrong-password"},
    )
    assert bad_login.status_code == 401

    good_login = client.post(
        "/v1/auth/login",
        json={"username": "OWNER", "password": "supersecret123"},
    )
    assert good_login.status_code == 200
    assert good_login.json()["user"]["username"] == "owner"

    me = client.get("/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "Owner"

    logout = client.post("/v1/auth/logout")
    assert logout.status_code == 200

    after_logout = client.get("/v1/auth/me")
    assert after_logout.status_code == 401
