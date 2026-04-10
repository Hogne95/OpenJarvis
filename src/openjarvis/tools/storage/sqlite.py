"""SQLite/FTS5 memory backend — zero-dependency default."""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.events import EventType, get_event_bus
from openjarvis.core.registry import MemoryRegistry
from openjarvis.tools.storage._stubs import MemoryBackend, RetrievalResult


def _check_fts5(conn: sqlite3.Connection) -> bool:
    """Return True if the SQLite build includes FTS5."""
    try:
        opts = conn.execute("PRAGMA compile_options").fetchall()
        return any("FTS5" in o[0].upper() for o in opts)
    except sqlite3.Error:
        return False


@MemoryRegistry.register("sqlite")
class SQLiteMemory(MemoryBackend):
    """Full-text search memory backend using SQLite FTS5.

    Uses the built-in ``sqlite3`` module — no extra dependencies.
    """

    backend_id: str = "sqlite"

    def __init__(self, db_path: str | Path = "") -> None:
        if not db_path:
            from openjarvis.core.config import DEFAULT_CONFIG_DIR

            db_path = str(DEFAULT_CONFIG_DIR / "memory.db")

        self._db_path = str(db_path)
        self._rust_impl = None
        self._conn: sqlite3.Connection | None = None
        self._fts5_enabled = False

        try:
            from openjarvis._rust_bridge import get_rust_module

            _rust = get_rust_module()
            self._rust_impl = _rust.SQLiteMemory(self._db_path)
        except Exception:
            # Root cause: the Rust extension is optional in many local setups,
            # but SQLiteMemory is still the default backend. Fall back to a
            # pure-Python sqlite3 implementation so memory flows remain usable.
            self._init_python_backend()

    def _init_python_backend(self) -> None:
        db_path = Path(self._db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path)
        self._conn.row_factory = sqlite3.Row
        self._fts5_enabled = _check_fts5(self._conn)
        self._create_tables()
        self._conn.commit()

    def _create_tables(self) -> None:
        if self._conn is None:
            return
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id       TEXT PRIMARY KEY,
                content  TEXT NOT NULL,
                source   TEXT NOT NULL DEFAULT '',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL
            );
        """)

        if self._fts5_enabled:
            self._conn.executescript("""
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
                USING fts5(
                    id UNINDEXED,
                    content,
                    source,
                    tokenize='porter unicode61'
                );
            """)

    def store(
        self,
        content: str,
        *,
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Persist *content* and return a unique document id."""
        meta_json = json.dumps(metadata) if metadata else None
        if self._rust_impl is not None:
            doc_id = self._rust_impl.store(content, source, meta_json)
        else:
            doc_id = str(uuid.uuid4())
            assert self._conn is not None
            self._conn.execute(
                """
                INSERT INTO documents (id, content, source, metadata, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    content,
                    source,
                    meta_json or "{}",
                    time.time(),
                ),
            )
            if self._fts5_enabled:
                self._conn.execute(
                    """
                    INSERT INTO documents_fts (id, content, source)
                    VALUES (?, ?, ?)
                    """,
                    (doc_id, content, source),
                )
            self._conn.commit()
        bus = get_event_bus()
        bus.publish(
            EventType.MEMORY_STORE,
            {
                "backend": self.backend_id,
                "doc_id": doc_id,
                "source": source,
            },
        )
        return doc_id

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 5,
        **kwargs: Any,
    ) -> List[RetrievalResult]:
        """Search via FTS5 MATCH with BM25 ranking — always via Rust backend."""
        if not query.strip():
            return []

        if self._rust_impl is not None:
            from openjarvis._rust_bridge import retrieval_results_from_json

            results = retrieval_results_from_json(
                self._rust_impl.retrieve(query, top_k),
            )
        else:
            results = self._retrieve_python(query, top_k)
        bus = get_event_bus()
        bus.publish(
            EventType.MEMORY_RETRIEVE,
            {
                "backend": self.backend_id,
                "query": query,
                "num_results": len(results),
            },
        )
        return results

    def _retrieve_python(self, query: str, top_k: int) -> List[RetrievalResult]:
        assert self._conn is not None
        if self._fts5_enabled:
            rows = self._conn.execute(
                """
                SELECT d.content, d.source, d.metadata, bm25(documents_fts) AS score
                FROM documents_fts
                JOIN documents d ON d.id = documents_fts.id
                WHERE documents_fts MATCH ?
                ORDER BY score ASC
                LIMIT ?
                """,
                (query, top_k),
            ).fetchall()
            return [
                RetrievalResult(
                    content=str(row["content"]),
                    score=max(0.0001, float(-row["score"])),
                    source=str(row["source"]),
                    metadata=json.loads(str(row["metadata"] or "{}")),
                )
                for row in rows
            ]

        terms = [term.strip().lower() for term in query.split() if term.strip()]
        if not terms:
            return []
        rows = self._conn.execute(
            "SELECT content, source, metadata FROM documents"
        ).fetchall()
        matches: List[RetrievalResult] = []
        for row in rows:
            content = str(row["content"])
            haystack = content.lower()
            hits = sum(1 for term in terms if term in haystack)
            if not hits:
                continue
            matches.append(
                RetrievalResult(
                    content=content,
                    score=hits / len(terms),
                    source=str(row["source"]),
                    metadata=json.loads(str(row["metadata"] or "{}")),
                )
            )
        matches.sort(key=lambda item: item.score, reverse=True)
        return matches[:top_k]

    def delete(self, doc_id: str) -> bool:
        """Delete a document by id — always via Rust backend."""
        if self._rust_impl is not None:
            return self._rust_impl.delete(doc_id)
        assert self._conn is not None
        deleted = self._conn.execute(
            "DELETE FROM documents WHERE id = ?",
            (doc_id,),
        ).rowcount
        if self._fts5_enabled:
            self._conn.execute(
                "DELETE FROM documents_fts WHERE id = ?",
                (doc_id,),
            )
        self._conn.commit()
        return bool(deleted)

    def clear(self) -> None:
        """Remove all stored documents — always via Rust backend."""
        if self._rust_impl is not None:
            self._rust_impl.clear()
            return
        assert self._conn is not None
        self._conn.execute("DELETE FROM documents")
        if self._fts5_enabled:
            self._conn.execute("DELETE FROM documents_fts")
        self._conn.commit()

    def count(self) -> int:
        """Return the number of stored documents — always via Rust backend."""
        if self._rust_impl is not None:
            return self._rust_impl.count()
        assert self._conn is not None
        row = self._conn.execute("SELECT COUNT(*) FROM documents").fetchone()
        return int(row[0] if row else 0)

    def close(self) -> None:
        """Close the database connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None


__all__ = ["SQLiteMemory"]
