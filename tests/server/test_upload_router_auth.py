from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from openjarvis.connectors.store import KnowledgeStore
from openjarvis.server import upload_router
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


def test_paste_ingest_stamps_owner_user_id(tmp_path: Path, monkeypatch):
    store = KnowledgeStore(db_path=tmp_path / "knowledge.db")
    monkeypatch.setattr(upload_router, "_get_store", lambda: store)

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

    guest = TestClient(app)
    login_guest = guest.post(
        "/v1/auth/login",
        json={"username": "guest", "password": "guestsecret123"},
    )
    assert login_guest.status_code == 200

    owner_ingest = owner.post(
        "/v1/connectors/upload/ingest",
        json={"title": "Owner notes", "content": "private owner text"},
    )
    guest_ingest = guest.post(
        "/v1/connectors/upload/ingest",
        json={"title": "Guest notes", "content": "private guest text"},
    )
    assert owner_ingest.status_code == 200
    assert guest_ingest.status_code == 200

    rows = store._conn.execute(
        """
        SELECT title, owner_user_id
        FROM knowledge_chunks
        WHERE source = 'upload'
        ORDER BY title ASC, chunk_index ASC
        """
    ).fetchall()
    records = [(str(row["title"]), str(row["owner_user_id"])) for row in rows]
    owner_id = bootstrap.json()["user"]["id"]
    guest_id = guest.get("/v1/auth/me").json()["user"]["id"]
    assert ("Guest notes", guest_id) in records
    assert ("Owner notes", owner_id) in records


def test_file_ingest_stamps_owner_user_id(tmp_path: Path, monkeypatch):
    store = KnowledgeStore(db_path=tmp_path / "knowledge-files.db")
    monkeypatch.setattr(upload_router, "_get_store", lambda: store)

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
    owner_id = bootstrap.json()["user"]["id"]

    response = client.post(
        "/v1/connectors/upload/ingest/files",
        files=[("files", ("notes.txt", io.BytesIO(b"hello from file upload"), "text/plain"))],
        data={"title": "File Upload"},
    )
    assert response.status_code == 200
    row = store._conn.execute(
        """
        SELECT owner_user_id, title, doc_type
        FROM knowledge_chunks
        WHERE title = 'File Upload'
        ORDER BY chunk_index ASC
        LIMIT 1
        """
    ).fetchone()
    assert row is not None
    assert str(row["owner_user_id"]) == owner_id
    assert str(row["doc_type"]) == "txt"
