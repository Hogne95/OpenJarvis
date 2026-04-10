"""KnowledgeSQLTool — read-only SQL queries against the KnowledgeStore.

Allows agents to run SELECT queries for aggregation, counting, ranking,
and filtering operations that BM25 search cannot handle.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Optional

from openjarvis.connectors.store import KnowledgeStore
from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_MAX_ROWS = 50

_SCHEMA_DESCRIPTION = (
    "Table: knowledge_chunks\n"
    "Columns: id, owner_user_id, account_key, content, source, doc_type, doc_id, "
    "title, author, participants, timestamp, thread_id, url, metadata, chunk_index"
)


@ToolRegistry.register("knowledge_sql")
class KnowledgeSQLTool(BaseTool):
    """Run read-only SQL against the knowledge store for aggregation queries."""

    tool_id = "knowledge_sql"

    def __init__(
        self,
        store: Optional[KnowledgeStore] = None,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> None:
        self._store = store
        self._owner_user_id = owner_user_id.strip()
        self._account_key = account_key.strip()

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="knowledge_sql",
            description=(
                "Run a read-only SQL SELECT query against the knowledge_chunks table. "
                "Use for counting, ranking, aggregation, and filtering. "
                        f"{_SCHEMA_DESCRIPTION}. "
                        "When a scoped workspace is active, queries are automatically limited "
                        "to the current user's rows."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "SQL SELECT query. Only SELECT statements allowed. "
                            "Example: SELECT author, COUNT(*) as n "
                            "FROM knowledge_chunks "
                            "WHERE source='imessage' GROUP BY author "
                            "ORDER BY n DESC LIMIT 10"
                        ),
                    },
                },
                "required": ["query"],
            },
            category="knowledge",
        )

    def execute(self, **params: Any) -> ToolResult:
        if self._store is None:
            return ToolResult(
                tool_name="knowledge_sql",
                content="No knowledge store configured.",
                success=False,
            )

        query: str = params.get("query", "").strip()
        if not query:
            return ToolResult(
                tool_name="knowledge_sql",
                content="No query provided.",
                success=False,
            )

        normalized = query.lstrip().upper()
        if not normalized.startswith("SELECT"):
            return ToolResult(
                tool_name="knowledge_sql",
                content="Only SELECT queries are allowed (read-only).",
                success=False,
            )

        _FORBIDDEN = ("DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "ATTACH")
        for forbidden in _FORBIDDEN:
            if forbidden in normalized:
                return ToolResult(
                    tool_name="knowledge_sql",
                    content=(
                        f"Query contains forbidden keyword: {forbidden}."
                        " Only SELECT queries allowed."
                    ),
                    success=False,
                )

        scoped_query = query
        if self._owner_user_id or self._account_key:
            scoped_query = scoped_query.replace("knowledge_chunks", "knowledge_chunks_scoped")
            where: list[str] = []
            params: list[Any] = []
            if self._owner_user_id:
                where.append("owner_user_id = ?")
                params.append(self._owner_user_id)
            if self._account_key:
                where.append("account_key = ?")
                params.append(self._account_key)
            where_sql = " AND ".join(where) if where else "1=1"
            self._store._conn.execute("DROP VIEW IF EXISTS temp.knowledge_chunks_scoped")
            self._store._conn.execute("DROP TABLE IF EXISTS temp.knowledge_chunks_scoped")
            self._store._conn.execute(
                f"""
                CREATE TEMP TABLE knowledge_chunks_scoped AS
                SELECT *
                FROM main.knowledge_chunks
                WHERE {where_sql}
                """,
                params,
            )
        try:
            rows = self._store._conn.execute(scoped_query).fetchmany(_MAX_ROWS)
        except sqlite3.OperationalError as exc:
            return ToolResult(
                tool_name="knowledge_sql",
                content=f"SQL error: {exc}",
                success=False,
            )

        if not rows:
            return ToolResult(
                tool_name="knowledge_sql",
                content="Query returned no results.",
                success=True,
                metadata={"num_rows": 0},
            )

        columns = rows[0].keys()
        lines = [" | ".join(columns)]
        lines.append(" | ".join("---" for _ in columns))
        for row in rows:
            lines.append(" | ".join(str(row[c]) for c in columns))

        return ToolResult(
            tool_name="knowledge_sql",
            content="\n".join(lines),
            success=True,
            metadata={"num_rows": len(rows)},
        )


__all__ = ["KnowledgeSQLTool"]
