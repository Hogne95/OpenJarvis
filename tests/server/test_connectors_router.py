"""Tests for the /v1/connectors API router."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def app():
    try:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi not installed")

    from openjarvis.server.connectors_router import create_connectors_router

    _app = FastAPI()
    router = create_connectors_router()
    _app.include_router(router, prefix="/v1")
    return TestClient(_app)


def test_list_connectors(app):
    """GET /v1/connectors returns a list that includes the obsidian connector."""
    resp = app.get("/v1/connectors")
    assert resp.status_code == 200
    data = resp.json()
    assert "connectors" in data
    ids = [c["connector_id"] for c in data["connectors"]]
    assert "obsidian" in ids


def test_connector_detail(app):
    """GET /v1/connectors/obsidian returns the expected fields."""
    resp = app.get("/v1/connectors/obsidian")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connector_id"] == "obsidian"
    assert "display_name" in data
    assert "auth_type" in data
    assert "connected" in data
    assert "mcp_tools" in data


def test_list_connector_providers(app):
    """GET /v1/connectors/providers returns the real OAuth provider registry."""
    resp = app.get("/v1/connectors/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    ids = [provider["provider"] for provider in data["providers"]]
    assert "google" in ids
    assert "microsoft" in ids


def test_provider_oauth_start_redirects(app, monkeypatch):
    """Provider OAuth start should redirect through the configured provider."""
    from openjarvis.connectors import oauth as oauth_module

    monkeypatch.setattr(
        oauth_module,
        "get_client_credentials",
        lambda provider: ("client-id", "client-secret"),
    )

    resp = app.get("/v1/connectors/providers/google/oauth/start", follow_redirects=False)
    assert resp.status_code in {302, 307}
    location = resp.headers["location"]
    assert "accounts.google.com" in location
    assert "client_id=client-id" in location
    assert "state=" in location


def test_microsoft_provider_oauth_start_redirects(app, monkeypatch):
    """Microsoft provider start should redirect through Microsoft login."""
    from openjarvis.connectors import oauth as oauth_module

    monkeypatch.setattr(
        oauth_module,
        "get_client_credentials",
        lambda provider: ("microsoft-client-id", "microsoft-client-secret"),
    )

    resp = app.get("/v1/connectors/providers/microsoft/oauth/start", follow_redirects=False)
    assert resp.status_code in {302, 307}
    location = resp.headers["location"]
    assert "login.microsoftonline.com" in location
    assert "client_id=microsoft-client-id" in location
    assert "state=" in location


def test_list_connectors_includes_microsoft_mail(app):
    """GET /v1/connectors should include the Graph-backed Microsoft mail connector."""
    resp = app.get("/v1/connectors")
    assert resp.status_code == 200
    data = resp.json()
    ids = [c["connector_id"] for c in data["connectors"]]
    assert "microsoft_mail" in ids


def test_connector_not_found(app):
    """GET /v1/connectors/nonexistent returns 404."""
    resp = app.get("/v1/connectors/nonexistent")
    assert resp.status_code == 404


def test_connect_obsidian(app, tmp_path):
    """POST /v1/connectors/obsidian/connect with a valid path marks it connected."""
    # Create a minimal vault directory so is_connected() returns True.
    vault = tmp_path / "vault"
    vault.mkdir()

    resp = app.post("/v1/connectors/obsidian/connect", json={"path": str(vault)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["connector_id"] == "obsidian"
    assert data["connected"] is True


def test_disconnect(app):
    """POST /v1/connectors/obsidian/disconnect returns 200 with connected=False."""
    resp = app.post("/v1/connectors/obsidian/disconnect")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connector_id"] == "obsidian"
    assert data["connected"] is False


def test_sync_status(app):
    """GET /v1/connectors/obsidian/sync returns a response with a state field."""
    resp = app.get("/v1/connectors/obsidian/sync")
    assert resp.status_code == 200
    data = resp.json()
    assert "state" in data
    assert data["connector_id"] == "obsidian"


def test_trigger_sync(app, tmp_path: Path) -> None:
    """POST /v1/connectors/obsidian/sync triggers an incremental sync."""
    vault = tmp_path / "vault"
    vault.mkdir()
    (vault / "note.md").write_text("# Test note\n\nContent here.")
    app.post("/v1/connectors/obsidian/connect", json={"path": str(vault)})
    resp = app.post("/v1/connectors/obsidian/sync")
    assert resp.status_code == 200
    data = resp.json()
    assert data["chunks_indexed"] >= 1
