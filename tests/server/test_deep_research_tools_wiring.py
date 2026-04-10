"""Test that _build_deep_research_tools works correctly."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

try:
    import fastapi  # noqa: F401

    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from openjarvis.connectors.store import KnowledgeStore


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
def test_deep_research_agent_gets_tools(tmp_path: Path) -> None:
    """When knowledge.db exists, returns 4 tools."""
    db_path = tmp_path / "knowledge.db"
    store = KnowledgeStore(str(db_path))
    store.store("test content", source="test", doc_type="note")

    from openjarvis.server.agent_manager_routes import _build_deep_research_tools

    tools = _build_deep_research_tools(
        engine=MagicMock(),
        model="test-model",
        knowledge_db_path=str(db_path),
    )

    tool_ids = [t.tool_id for t in tools]
    assert "knowledge_search" in tool_ids
    assert "knowledge_sql" in tool_ids
    assert "scan_chunks" in tool_ids
    assert "think" in tool_ids
    assert len(tools) == 4
    store.close()


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
def test_deep_research_tools_returns_empty_when_no_db() -> None:
    """When knowledge.db doesn't exist, returns empty list."""
    from openjarvis.server.agent_manager_routes import _build_deep_research_tools

    tools = _build_deep_research_tools(
        engine=MagicMock(),
        model="test-model",
        knowledge_db_path="/nonexistent/path/knowledge.db",
    )

    assert tools == []


@pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")
def test_deep_research_tools_pass_owner_scope_to_knowledge_tools(tmp_path: Path) -> None:
    db_path = tmp_path / "knowledge.db"
    store = KnowledgeStore(str(db_path))
    store.store("owner note", source="test", doc_type="note", owner_user_id="owner-1")
    store.store("guest note", source="test", doc_type="note", owner_user_id="guest-1")

    from openjarvis.server.agent_manager_routes import _build_deep_research_tools

    tools = _build_deep_research_tools(
        engine=MagicMock(),
        model="test-model",
        knowledge_db_path=str(db_path),
        owner_user_id="owner-1",
    )

    by_id = {tool.tool_id: tool for tool in tools}
    assert getattr(by_id["knowledge_search"], "_owner_user_id", "") == "owner-1"
    assert getattr(by_id["knowledge_sql"], "_owner_user_id", "") == "owner-1"
    assert getattr(by_id["scan_chunks"], "_owner_user_id", "") == "owner-1"
    store.close()
