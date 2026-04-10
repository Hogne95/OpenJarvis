from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from openjarvis.agents.manager import AgentManager
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


def _make_client(tmp_path: Path, *, with_agent_manager: bool = False) -> TestClient:
    agent_manager = AgentManager(str(tmp_path / "agents.db")) if with_agent_manager else None
    app = create_app(_make_engine(), "test-model", agent_manager=agent_manager)
    original_store = app.state.user_store
    original_store.close()
    app.state.user_store = UserStore(str(tmp_path / "web-users.db"))
    return TestClient(app)


def _init_git_repo(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init"],
        cwd=path,
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "jarvis@example.com"],
        cwd=path,
        capture_output=True,
        text=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Jarvis"],
        cwd=path,
        capture_output=True,
        text=True,
        check=True,
    )
    return path


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


def test_operator_memory_routes_are_isolated_per_authenticated_user(tmp_path: Path):
    app_client = _make_client(tmp_path)
    app = app_client.app
    bootstrap = app_client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200
    app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    owner = app_client
    guest = TestClient(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner.post("/v1/operator-memory/profile", json={"honorific": "captain"})
    guest.post("/v1/operator-memory/profile", json={"honorific": "friend"})

    owner_snapshot = owner.get("/v1/operator-memory")
    guest_snapshot = guest.get("/v1/operator-memory")

    assert owner_snapshot.status_code == 200
    assert guest_snapshot.status_code == 200
    assert owner_snapshot.json()["profile"]["honorific"] == "captain"
    assert guest_snapshot.json()["profile"]["honorific"] == "friend"


def test_managed_agents_are_isolated_per_authenticated_user(tmp_path: Path):
    owner = _make_client(tmp_path, with_agent_manager=True)
    app = owner.app
    bootstrap = owner.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200
    app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    guest = TestClient(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner_agent = owner.post(
        "/v1/managed-agents",
        json={"name": "Owner Agent", "agent_type": "monitor_operative", "config": {}},
    )
    guest_agent = guest.post(
        "/v1/managed-agents",
        json={"name": "Guest Agent", "agent_type": "monitor_operative", "config": {}},
    )

    assert owner_agent.status_code == 200
    assert guest_agent.status_code == 200
    owner_id = owner_agent.json()["id"]
    guest_id = guest_agent.json()["id"]

    owner_list = owner.get("/v1/managed-agents")
    guest_list = guest.get("/v1/managed-agents")

    owner_ids = [agent["id"] for agent in owner_list.json()["agents"]]
    guest_ids = [agent["id"] for agent in guest_list.json()["agents"]]

    assert owner_id in owner_ids
    assert guest_id not in owner_ids
    assert guest_id in guest_ids
    assert owner_id not in guest_ids

    cross_fetch = owner.get(f"/v1/managed-agents/{guest_id}")
    assert cross_fetch.status_code == 404


def test_workspace_and_workbench_state_are_isolated_per_authenticated_user(tmp_path: Path):
    owner = _make_client(tmp_path)
    app = owner.app
    bootstrap = owner.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200
    app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    repo_owner = _init_git_repo(tmp_path / "repo-owner")
    repo_guest = _init_git_repo(tmp_path / "repo-guest")

    guest = TestClient(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner_register = owner.post("/v1/workspace/repos/register", json={"path": str(repo_owner)})
    guest_register = guest.post("/v1/workspace/repos/register", json={"path": str(repo_guest)})
    assert owner_register.status_code == 200
    assert guest_register.status_code == 200

    owner_repos = owner.get("/v1/workspace/repos")
    guest_repos = guest.get("/v1/workspace/repos")
    assert owner_repos.status_code == 200
    assert guest_repos.status_code == 200
    assert owner_repos.json()["active_root"] == str(repo_owner.resolve())
    assert guest_repos.json()["active_root"] == str(repo_guest.resolve())

    owner_repo_roots = [item["root"] for item in owner_repos.json()["repos"]]
    guest_repo_roots = [item["root"] for item in guest_repos.json()["repos"]]
    assert str(repo_owner.resolve()) in owner_repo_roots
    assert str(repo_guest.resolve()) not in owner_repo_roots
    assert str(repo_guest.resolve()) in guest_repo_roots
    assert str(repo_owner.resolve()) not in guest_repo_roots

    owner_stage = owner.post(
        "/v1/workbench/stage",
        json={"command": "git status --short", "working_dir": str(repo_owner.resolve())},
    )
    assert owner_stage.status_code == 200

    owner_status = owner.get("/v1/workbench/status")
    guest_status = guest.get("/v1/workbench/status")
    assert owner_status.status_code == 200
    assert guest_status.status_code == 200
    assert owner_status.json()["pending"]["command"] == "git status --short"
    assert owner_status.json()["pending"]["working_dir"] == str(repo_owner.resolve())
    assert guest_status.json()["pending"] is None


def test_coding_workspace_state_is_isolated_per_authenticated_user(tmp_path: Path):
    owner = _make_client(tmp_path)
    app = owner.app
    bootstrap = owner.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200
    app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    repo = _init_git_repo(tmp_path / "repo-code")
    target = repo / "note.txt"
    target.write_text("old content\n", encoding="utf-8")

    guest = TestClient(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    stage = owner.post(
        "/v1/coding/stage-edit",
        json={
            "repo_root": str(repo.resolve()),
            "file_path": "note.txt",
            "updated_content": "new content\n",
        },
    )
    assert stage.status_code == 200

    owner_status = owner.get("/v1/coding/status")
    guest_status = guest.get("/v1/coding/status")
    assert owner_status.status_code == 200
    assert guest_status.status_code == 200
    assert owner_status.json()["pending"]["file_path"] == "note.txt"
    assert guest_status.json()["pending"] is None

    guest_hold = guest.post("/v1/coding/hold")
    assert guest_hold.status_code == 200
    assert guest_hold.json()["pending"] is None

    owner_approve = owner.post("/v1/coding/approve")
    assert owner_approve.status_code == 200
    assert target.read_text(encoding="utf-8") == "new content\n"
