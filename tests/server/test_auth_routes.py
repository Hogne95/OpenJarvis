from __future__ import annotations

import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from unittest.mock import patch

from fastapi.testclient import TestClient

from openjarvis.agents.manager import AgentManager
from openjarvis.connectors.store import KnowledgeStore
from openjarvis.core.registry import ConnectorRegistry
from openjarvis.server.app import create_app
from openjarvis.server.user_store import UserStore
from openjarvis.server.web_security import AuthRateLimiter


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
    client = _browser_client(app)
    return client


def _browser_client(app) -> TestClient:
    client = TestClient(app)
    client.headers.update(
        {
            "Origin": "http://localhost:5173",
            "Referer": "http://localhost:5173/",
        }
    )
    return client


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


def test_bootstrap_sets_secure_cookie_when_request_is_https(tmp_path: Path):
    client = _make_client(tmp_path)

    response = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "Hogne",
            "password": "supersecret123",
            "display_name": "Hogne",
        },
        headers={"X-Forwarded-Proto": "https"},
    )

    assert response.status_code == 200
    set_cookie = response.headers.get("set-cookie", "")
    assert "Secure" in set_cookie
    assert "SameSite=none" in set_cookie


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


def test_session_idle_timeout_expires_inactive_browser_session(tmp_path: Path):
    previous = os.environ.get("OPENJARVIS_SESSION_IDLE_MINUTES")
    os.environ["OPENJARVIS_SESSION_IDLE_MINUTES"] = "1"
    try:
        client = _make_client(tmp_path)
    finally:
        if previous is None:
            os.environ.pop("OPENJARVIS_SESSION_IDLE_MINUTES", None)
        else:
            os.environ["OPENJARVIS_SESSION_IDLE_MINUTES"] = previous

    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    token = bootstrap.cookies.get("openjarvis_session")
    token_hash = client.app.state.user_store._db.execute(
        "SELECT session_token_hash FROM web_sessions"
    ).fetchone()["session_token_hash"]
    client.app.state.user_store._db.execute(
        "UPDATE web_sessions SET last_seen_at = datetime('now', '-5 minutes') WHERE session_token_hash = ?",
        (token_hash,),
    )
    client.app.state.user_store._db.commit()

    client.cookies.set("openjarvis_session", token)
    expired = client.get("/v1/auth/me")
    assert expired.status_code == 401


def test_login_rate_limit_blocks_repeated_failures(tmp_path: Path):
    client = _make_client(tmp_path)
    client.app.state.auth_rate_limiter = AuthRateLimiter(max_attempts=2, window_seconds=60)
    client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    client.post("/v1/auth/logout")

    first = client.post("/v1/auth/login", json={"username": "owner", "password": "wrong-password"})
    second = client.post("/v1/auth/login", json={"username": "owner", "password": "wrong-password"})
    third = client.post("/v1/auth/login", json={"username": "owner", "password": "wrong-password"})

    assert first.status_code == 401
    assert second.status_code == 401
    assert third.status_code == 429
    assert "too many authentication attempts" in third.json()["detail"].lower()
    assert 1 <= int(third.headers.get("retry-after") or "0") <= 60


def test_default_cors_allows_localhost_but_not_arbitrary_origins(tmp_path: Path):
    client = _make_client(tmp_path)

    allowed = client.get("/health", headers={"Origin": "http://localhost:5173"})
    denied = client.get("/health", headers={"Origin": "https://evil.example"})

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert denied.headers.get("access-control-allow-origin") is None


def test_default_trusted_hosts_reject_unknown_host_header(tmp_path: Path):
    client = _make_client(tmp_path)

    allowed = client.get("/health", headers={"Host": "localhost"})
    denied = client.get("/health", headers={"Host": "evil.example"})

    assert allowed.status_code == 200
    assert denied.status_code == 400


def test_superadmin_can_create_and_list_users(tmp_path: Path):
    client = _make_client(tmp_path)
    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    create_user = client.post(
        "/v1/auth/users",
        json={
            "username": "guest",
            "password": "guestsecret123",
            "display_name": "Guest User",
            "role": "user",
        },
    )
    assert create_user.status_code == 200
    assert create_user.json()["user"]["username"] == "guest"

    users = client.get("/v1/auth/users")
    assert users.status_code == 200
    usernames = [user["username"] for user in users.json()["users"]]
    assert set(usernames) == {"owner", "guest"}


def test_admin_routes_enforce_role_boundaries(tmp_path: Path):
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
        username="manager",
        password="managersecret123",
        display_name="Manager",
        role="admin",
    )
    app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    manager = _browser_client(app)
    login_manager = manager.post(
        "/v1/auth/login",
        json={"username": "manager", "password": "managersecret123"},
    )
    assert login_manager.status_code == 200

    create_admin = manager.post(
        "/v1/auth/users",
        json={
            "username": "another-admin",
            "password": "supersecret123",
            "display_name": "Another Admin",
            "role": "admin",
        },
    )
    assert create_admin.status_code == 403

    users = owner.get("/v1/auth/users").json()["users"]
    manager_record = next(user for user in users if user["username"] == "manager")
    update_admin = manager.patch(
        f"/v1/auth/users/{manager_record['id']}",
        json={"display_name": "Nope"},
    )
    assert update_admin.status_code == 403


def test_superadmin_can_update_user_and_reset_password(tmp_path: Path):
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
    guest_record = app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    update_guest = owner.patch(
        f"/v1/auth/users/{guest_record['id']}",
        json={"display_name": "Guest Updated", "role": "restricted", "status": "disabled"},
    )
    assert update_guest.status_code == 200
    updated = update_guest.json()["user"]
    assert updated["display_name"] == "Guest Updated"
    assert updated["role"] == "restricted"
    assert updated["status"] == "disabled"

    guest = _browser_client(app)
    disabled_login = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert disabled_login.status_code == 401

    reenable_guest = owner.patch(
        f"/v1/auth/users/{guest_record['id']}",
        json={"status": "active", "role": "user"},
    )
    assert reenable_guest.status_code == 200

    reset_password = owner.post(
        f"/v1/auth/users/{guest_record['id']}/reset-password",
        json={"password": "brandnewsecret123"},
    )
    assert reset_password.status_code == 200

    old_login = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert old_login.status_code == 401

    new_login = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "brandnewsecret123"},
    )
    assert new_login.status_code == 200


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
    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner.post(
        "/v1/operator-memory/profile",
        json={"honorific": "captain", "autonomy_preference": "high initiative"},
    )
    guest.post(
        "/v1/operator-memory/profile",
        json={"honorific": "friend", "autonomy_preference": "balanced"},
    )

    owner_snapshot = owner.get("/v1/operator-memory")
    guest_snapshot = guest.get("/v1/operator-memory")

    assert owner_snapshot.status_code == 200
    assert guest_snapshot.status_code == 200
    assert owner_snapshot.json()["profile"]["honorific"] == "captain"
    assert guest_snapshot.json()["profile"]["honorific"] == "friend"
    assert owner_snapshot.json()["profile"]["autonomy_preference"] == "high initiative"
    assert guest_snapshot.json()["profile"]["autonomy_preference"] == "balanced"


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

    guest = _browser_client(app)
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

    guest = _browser_client(app)
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

    guest = _browser_client(app)
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


def test_action_center_state_is_isolated_per_authenticated_user(tmp_path: Path):
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

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner_stage = owner.post(
        "/v1/action-center/stage-email",
        json={
            "recipient": "owner@example.com",
            "subject": "Owner note",
            "body": "Private owner draft",
            "provider": "gmail",
        },
    )
    guest_stage = guest.post(
        "/v1/action-center/stage-email",
        json={
            "recipient": "guest@example.com",
            "subject": "Guest note",
            "body": "Private guest draft",
            "provider": "gmail",
        },
    )
    assert owner_stage.status_code == 200
    assert guest_stage.status_code == 200

    owner_status = owner.get("/v1/action-center/status")
    guest_status = guest.get("/v1/action-center/status")
    assert owner_status.status_code == 200
    assert guest_status.status_code == 200
    assert owner_status.json()["pending"]["payload"]["recipient"] == "owner@example.com"
    assert guest_status.json()["pending"]["payload"]["recipient"] == "guest@example.com"


def test_connector_backed_routes_require_superadmin_until_per_user_accounts_exist(tmp_path: Path):
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

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    guest_connectors = guest.get("/v1/connectors")
    assert guest_connectors.status_code == 403

    guest_capabilities = guest.get("/v1/action-center/capabilities")
    assert guest_capabilities.status_code == 403

    guest_inbox = guest.get("/v1/action-center/inbox-summary")
    assert guest_inbox.status_code == 200


def test_action_center_knowledge_summaries_are_scoped_per_authenticated_user(tmp_path: Path):
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
    guest_record = app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    owner_me = owner.get("/v1/auth/me")
    assert owner_me.status_code == 200
    owner_user_id = owner_me.json()["user"]["id"]

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200
    now = datetime.now(timezone.utc)
    upcoming_owner_event = (now + timedelta(hours=1)).isoformat()
    upcoming_guest_event = (now + timedelta(hours=2)).isoformat()

    knowledge_db = tmp_path / "knowledge-test.db"
    ks = KnowledgeStore(db_path=knowledge_db)
    ks.store(
        content="Owner email body",
        source="gmail",
        doc_type="email",
        title="Owner private email",
        author="Owner Sender <owner@example.com>",
        timestamp="2026-04-10T09:00:00+00:00",
        owner_user_id=str(owner_user_id),
        account_key="work-mail",
    )
    ks.store(
        content="Guest email body",
        source="gmail",
        doc_type="email",
        title="Guest private email",
        author="Guest Sender <guest@example.com>",
        timestamp="2026-04-10T10:00:00+00:00",
        owner_user_id=str(guest_record["id"]),
    )
    ks.store(
        content="Owner task notes",
        source="google_tasks",
        doc_type="task",
        title="Owner follow-up",
        metadata={"status": "needsAction", "due": "2026-04-10T12:00:00+00:00"},
        timestamp="2026-04-10T08:30:00+00:00",
        owner_user_id=str(owner_user_id),
    )
    ks.store(
        content="Guest task notes",
        source="google_tasks",
        doc_type="task",
        title="Guest follow-up",
        metadata={"status": "needsAction", "due": "2026-04-10T13:00:00+00:00"},
        timestamp="2026-04-10T08:45:00+00:00",
        owner_user_id=str(guest_record["id"]),
    )
    ks.store(
        content="Owner calendar details\nBring agenda",
        source="gcalendar",
        doc_type="event",
        title="Owner meeting",
        timestamp=upcoming_owner_event,
        owner_user_id=str(owner_user_id),
    )
    ks.store(
        content="Guest calendar details\nBring docs",
        source="gcalendar",
        doc_type="event",
        title="Guest meeting",
        timestamp=upcoming_guest_event,
        owner_user_id=str(guest_record["id"]),
    )

    with patch("openjarvis.connectors.store.KnowledgeStore", side_effect=lambda: KnowledgeStore(db_path=knowledge_db)):
        owner_inbox = owner.get("/v1/action-center/inbox-summary")
        guest_inbox = guest.get("/v1/action-center/inbox-summary")
        owner_tasks = owner.get("/v1/action-center/task-summary")
        guest_tasks = guest.get("/v1/action-center/task-summary")
        owner_reminders = owner.get("/v1/action-center/reminders")
        guest_reminders = guest.get("/v1/action-center/reminders")

    assert owner_inbox.status_code == 200
    assert guest_inbox.status_code == 200
    assert owner_inbox.json()["items"][0]["title"] == "Owner private email"
    assert owner_inbox.json()["items"][0]["account_key"] == "work-mail"
    assert guest_inbox.json()["items"][0]["title"] == "Guest private email"

    assert owner_tasks.status_code == 200
    assert guest_tasks.status_code == 200
    assert owner_tasks.json()["items"][0]["title"] == "Owner follow-up"
    assert guest_tasks.json()["items"][0]["title"] == "Guest follow-up"

    owner_reminder_titles = {item["title"] for item in owner_reminders.json()["items"]}
    guest_reminder_titles = {item["title"] for item in guest_reminders.json()["items"]}
    assert "Owner meeting" in owner_reminder_titles
    assert "Owner follow-up" in owner_reminder_titles
    assert "Guest meeting" not in owner_reminder_titles
    assert "Guest follow-up" not in owner_reminder_titles
    assert "Guest meeting" in guest_reminder_titles
    assert "Guest follow-up" in guest_reminder_titles


def test_connector_accounts_are_isolated_per_authenticated_user(tmp_path: Path):
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

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner_create = owner.post(
        "/v1/connectors/accounts",
        json={
            "provider": "gmail",
            "label": "Personal",
            "account_type": "email",
            "external_identity": "owner@example.com",
            "metadata": {"scope": "private"},
        },
    )
    guest_create = guest.post(
        "/v1/connectors/accounts",
        json={
            "provider": "gmail",
            "label": "Work",
            "account_type": "email",
            "external_identity": "guest@company.com",
            "metadata": {"scope": "private"},
        },
    )
    assert owner_create.status_code == 200
    assert guest_create.status_code == 200

    owner_account = owner_create.json()
    guest_account = guest_create.json()

    owner_list = owner.get("/v1/connectors/accounts")
    guest_list = guest.get("/v1/connectors/accounts")
    assert owner_list.status_code == 200
    assert guest_list.status_code == 200

    owner_ids = [account["id"] for account in owner_list.json()["accounts"]]
    guest_ids = [account["id"] for account in guest_list.json()["accounts"]]
    assert owner_account["id"] in owner_ids
    assert guest_account["id"] not in owner_ids
    assert guest_account["id"] in guest_ids
    assert owner_account["id"] not in guest_ids


def test_connector_accounts_cannot_be_modified_across_users(tmp_path: Path):
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

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    guest_create = guest.post(
        "/v1/connectors/accounts",
        json={
            "provider": "gmail",
            "label": "Guest Mail",
            "account_type": "email",
            "external_identity": "guest@example.com",
        },
    )
    assert guest_create.status_code == 200
    guest_account_id = guest_create.json()["id"]

    cross_update = owner.patch(
        f"/v1/connectors/accounts/{guest_account_id}",
        json={"label": "Owner Tried"},
    )
    assert cross_update.status_code == 404

    cross_delete = owner.delete(f"/v1/connectors/accounts/{guest_account_id}")
    assert cross_delete.status_code == 404

    guest_list = guest.get("/v1/connectors/accounts")
    assert guest_list.status_code == 200
    assert [account["id"] for account in guest_list.json()["accounts"]] == [guest_account_id]


def test_connector_runtime_is_scoped_per_account(tmp_path: Path):
    import openjarvis.server.connectors_router as connectors_router

    class AccountFakeConnector:
        connector_id = "account_fake"
        display_name = "Account Fake"
        auth_type = "oauth"

        def __init__(self, credentials_path: str = "") -> None:
            self.credentials_path = credentials_path

        def is_connected(self) -> bool:
            return bool(self.credentials_path) and Path(self.credentials_path).exists()

        def disconnect(self) -> None:
            if self.credentials_path and Path(self.credentials_path).exists():
                Path(self.credentials_path).unlink()

        def auth_url(self) -> str:
            return "https://example.test/oauth"

        def handle_callback(self, code: str) -> None:
            path = Path(self.credentials_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(code, encoding="utf-8")

        def sync_status(self):
            return SimpleNamespace(
                state="idle",
                items_synced=0,
                items_total=0,
                last_sync=None,
                error=None,
            )

    if not ConnectorRegistry.contains("account_fake"):
        ConnectorRegistry.register_value("account_fake", AccountFakeConnector)

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
    owner_user_id = bootstrap.json()["user"]["id"]
    app.state.user_store.create_user(
        username="guest",
        password="guestsecret123",
        display_name="Guest",
        role="user",
    )

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200
    guest_user_id = guest.get("/v1/auth/me").json()["user"]["id"]

    owner_account = owner.post(
        "/v1/connectors/accounts",
        json={"provider": "gmail", "label": "Owner Mail", "account_type": "email"},
    ).json()
    guest_account = guest.post(
        "/v1/connectors/accounts",
        json={"provider": "gmail", "label": "Guest Mail", "account_type": "email"},
    ).json()

    owner_connect = owner.post(
        f"/v1/connectors/account_fake/connect?account_id={owner_account['id']}",
        json={"code": "owner-token"},
    )
    guest_connect = guest.post(
        f"/v1/connectors/account_fake/connect?account_id={guest_account['id']}",
        json={"code": "guest-token"},
    )
    assert owner_connect.status_code == 200
    assert guest_connect.status_code == 200

    owner_detail = owner.get(f"/v1/connectors/account_fake?account_id={owner_account['id']}")
    guest_detail = guest.get(f"/v1/connectors/account_fake?account_id={guest_account['id']}")
    assert owner_detail.status_code == 200
    assert guest_detail.status_code == 200
    assert owner_detail.json()["connected"] is True
    assert guest_detail.json()["connected"] is True

    owner_cache_key = f"account_fake::user={owner_user_id}::account={owner_account['id']}"
    guest_cache_key = f"account_fake::user={guest_user_id}::account={guest_account['id']}"
    owner_instance = connectors_router._instances[owner_cache_key]
    guest_instance = connectors_router._instances[guest_cache_key]
    assert owner_instance.credentials_path != guest_instance.credentials_path
    assert Path(owner_instance.credentials_path).read_text(encoding="utf-8") == "owner-token"
    assert Path(guest_instance.credentials_path).read_text(encoding="utf-8") == "guest-token"


def test_connector_account_runtime_denies_cross_user_access(tmp_path: Path):
    import openjarvis.server.connectors_router as connectors_router

    class AccountFakeConnector:
        connector_id = "account_fake_secure"
        display_name = "Account Fake Secure"
        auth_type = "oauth"

        def __init__(self, credentials_path: str = "") -> None:
            self.credentials_path = credentials_path

        def is_connected(self) -> bool:
            return True

        def disconnect(self) -> None:
            return None

        def auth_url(self) -> str:
            return ""

        def handle_callback(self, code: str) -> None:
            return None

        def sync_status(self):
            return SimpleNamespace(
                state="idle",
                items_synced=0,
                items_total=0,
                last_sync=None,
                error=None,
            )

    if not ConnectorRegistry.contains("account_fake_secure"):
        ConnectorRegistry.register_value("account_fake_secure", AccountFakeConnector)

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

    guest = _browser_client(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    guest_account = guest.post(
        "/v1/connectors/accounts",
        json={"provider": "gmail", "label": "Guest Mail", "account_type": "email"},
    ).json()

    cross_fetch = owner.get(
        f"/v1/connectors/account_fake_secure?account_id={guest_account['id']}"
    )
    assert cross_fetch.status_code == 404


def test_operator_memory_context_route_returns_layered_results(tmp_path: Path):
    client = _make_client(tmp_path)
    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    client.post(
        "/v1/operator-memory/profile",
        json={"reply_tone": "clear and strategic", "priority_contacts": ["alice@example.com"]},
    )
    client.post(
        "/v1/operator-memory/mission",
        json={
            "id": "release-review",
            "title": "Release review",
            "domain": "coding",
            "status": "active",
            "next_step": "Verify tests and changelog before release.",
        },
    )
    client.post(
        "/v1/operator-memory/learning",
        json={
            "label": "Release discipline",
            "domain": "coding",
            "summary": "Rushed releases caused avoidable cleanup.",
            "lesson": "Prefer smaller release batches with verification before tagging.",
        },
    )

    response = client.post(
        "/v1/operator-memory/context",
        json={"query": "What release plan should I use?", "limit": 5},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "What release plan should I use?"
    assert data["identity"]
    assert data["session_focus"]
    assert data["long_term"]


def test_operator_memory_analytics_route_returns_focus_and_lessons(tmp_path: Path):
    client = _make_client(tmp_path)
    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    client.post(
        "/v1/operator-memory/mission",
        json={
            "id": "ship-release",
            "title": "Ship release",
            "domain": "coding",
            "status": "blocked",
            "phase": "verify",
            "next_step": "Fix the failing release checklist items.",
        },
    )
    client.post("/v1/operator-memory/signal", json={"kind": "urgent"})
    client.post(
        "/v1/operator-memory/learning",
        json={
            "label": "Release discipline",
            "domain": "coding",
            "summary": "Large releases created cleanup work.",
            "lesson": "Ship smaller batches with a verification gate.",
            "reuse_hint": "Use before tagging a release.",
            "tags": ["release", "verification"],
        },
    )

    response = client.get("/v1/operator-memory/analytics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["blocked_missions"]
    assert payload["top_lessons"]
    assert payload["focus_recommendations"]
    assert "recurring_patterns" in payload
    assert "improvement_opportunities" in payload
    assert "friction_brief" in payload
    assert "operating_profile" in payload
    assert payload["friction_brief"]["summary"]
    assert payload["friction_brief"]["root_cause"]
    assert payload["operating_profile"]["summary"]


def test_operator_memory_review_item_is_recorded_and_returned_in_analytics(tmp_path: Path):
    client = _make_client(tmp_path)
    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    review = client.post(
        "/v1/operator-memory/review",
        json={
            "category": "quality",
            "label": "Operator review",
            "summary": "The answer was too vague and should be tightened.",
            "detail": "Improve recommendation confidence and next-step specificity.",
            "source": "test",
        },
    )
    assert review.status_code == 200

    analytics = client.get("/v1/operator-memory/analytics")
    assert analytics.status_code == 200
    payload = analytics.json()
    assert payload["review_items"]
    assert payload["review_items"][0]["summary"] == "The answer was too vague and should be tightened."


def test_operator_memory_analytics_detects_recurring_patterns(tmp_path: Path):
    client = _make_client(tmp_path)
    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    for mission_id in ("voice-1", "voice-2"):
        client.post(
            "/v1/operator-memory/mission",
            json={
                "id": mission_id,
                "title": "Voice blocker",
                "domain": "voice",
                "status": "blocked",
                "phase": "retry",
                "next_step": "Stabilize the voice loop.",
            },
        )
    for summary in ("Answer was too vague.", "Another answer was too vague."):
        review = client.post(
            "/v1/operator-memory/review",
            json={
                "category": "quality",
                "label": "Operator review",
                "summary": summary,
                "detail": "Need tighter recommendations.",
                "source": "test",
            },
        )
        assert review.status_code == 200

    analytics = client.get("/v1/operator-memory/analytics")
    assert analytics.status_code == 200
    payload = analytics.json()
    keys = {f"{item['kind']}:{item['key']}" for item in payload["recurring_patterns"]}
    assert "review_category:quality" in keys
    assert "blocked_domain:voice" in keys
    assert payload["improvement_opportunities"]
    assert payload["friction_brief"]["summary"]
    assert payload["friction_brief"]["recommended_focus"]
    assert payload["operating_profile"]["execution_mode"]


def test_operator_memory_analytics_reflects_explicit_profile_preferences(tmp_path: Path):
    client = _make_client(tmp_path)
    bootstrap = client.post(
        "/v1/auth/bootstrap",
        json={
            "username": "owner",
            "password": "supersecret123",
            "display_name": "Owner",
        },
    )
    assert bootstrap.status_code == 200

    profile = client.post(
        "/v1/operator-memory/profile",
        json={
            "reply_tone": "warm and supportive",
            "verbosity_preference": "concise-first",
            "autonomy_preference": "high initiative",
            "decisiveness_preference": "recommend clearly",
        },
    )
    assert profile.status_code == 200

    analytics = client.get("/v1/operator-memory/analytics")
    assert analytics.status_code == 200
    payload = analytics.json()
    assert payload["operating_profile"]["execution_mode"] == "high-initiative"
    assert payload["operating_profile"]["briefing_mode"] == "compressed"
    assert "supportive framing" in payload["operating_profile"]["adaptation_note"].lower()


def test_operator_memory_commander_brief_is_user_scoped_and_structured(tmp_path: Path):
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

    owner.post(
        "/v1/operator-memory/mission",
        json={
            "id": "voice-repair",
            "title": "Repair voice loop",
            "domain": "voice",
            "status": "blocked",
            "phase": "retry",
            "next_step": "Inspect the latest interruption failure.",
        },
    )

    guest = _browser_client(app)
    guest_login = guest.post("/v1/auth/login", json={"username": "guest", "password": "guestsecret123"})
    assert guest_login.status_code == 200

    owner_brief = owner.get("/v1/operator-memory/commander-brief")
    assert owner_brief.status_code == 200
    owner_data = owner_brief.json()
    assert owner_data["recommendation"] == "Unblock Repair voice loop first."
    assert owner_data["friction_summary"]
    assert owner_data["root_cause"]
    assert "User temperament:" in owner_data["planner_prompt"]
    assert "Command posture:" in owner_data["planner_prompt"]
    assert owner_data["queue"][0]["action_hint"] == "planner_handoff"

    guest_brief = guest.get("/v1/operator-memory/commander-brief")
    assert guest_brief.status_code == 200
    guest_data = guest_brief.json()
    assert guest_data["recommendation"] != owner_data["recommendation"]
    assert isinstance(guest_data["queue"], list)
