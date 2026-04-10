"""Per-user connector account registry for multi-account JARVIS setups."""

from __future__ import annotations

import json
import secrets
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.security.file_utils import secure_create


class ConnectorAccountStore:
    """Track user-owned connector accounts such as personal/work inboxes."""

    def __init__(self, db_path: str = "") -> None:
        if not db_path:
            db_path = str(DEFAULT_CONFIG_DIR / "connector_accounts.db")
        secure_create(Path(db_path))
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self) -> None:
        self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS connector_accounts (
                id                TEXT PRIMARY KEY,
                owner_user_id     TEXT NOT NULL,
                provider          TEXT NOT NULL,
                account_type      TEXT NOT NULL DEFAULT '',
                label             TEXT NOT NULL,
                external_identity TEXT NOT NULL DEFAULT '',
                status            TEXT NOT NULL DEFAULT 'configured',
                metadata_json     TEXT NOT NULL DEFAULT '{}',
                created_at        TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_connector_accounts_owner
                ON connector_accounts (owner_user_id);
            CREATE INDEX IF NOT EXISTS idx_connector_accounts_provider
                ON connector_accounts (provider);
            """
        )
        self._db.commit()

    def list_accounts(self, owner_user_id: str) -> list[Dict[str, Any]]:
        rows = self._db.execute(
            """
            SELECT *
            FROM connector_accounts
            WHERE owner_user_id = ?
            ORDER BY updated_at DESC, created_at DESC
            """,
            (owner_user_id,),
        ).fetchall()
        return [self._row_to_account(row) for row in rows]

    def create_account(
        self,
        *,
        owner_user_id: str,
        provider: str,
        label: str,
        account_type: str = "",
        external_identity: str = "",
        status: str = "configured",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        cleaned_provider = provider.strip().lower()
        cleaned_label = label.strip()
        if not cleaned_provider:
            raise ValueError("Provider is required.")
        if not cleaned_label:
            raise ValueError("Label is required.")
        account_id = secrets.token_hex(16)
        self._db.execute(
            """
            INSERT INTO connector_accounts
                (id, owner_user_id, provider, account_type, label, external_identity, status, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                owner_user_id,
                cleaned_provider,
                account_type.strip().lower(),
                cleaned_label,
                external_identity.strip(),
                status.strip().lower() or "configured",
                json.dumps(metadata or {}),
            ),
        )
        self._db.commit()
        account = self.get_account(account_id, owner_user_id=owner_user_id)
        if account is None:
            raise ValueError("Failed to create connector account.")
        return account

    def get_account(self, account_id: str, *, owner_user_id: str) -> Optional[Dict[str, Any]]:
        row = self._db.execute(
            """
            SELECT *
            FROM connector_accounts
            WHERE id = ? AND owner_user_id = ?
            """,
            (account_id, owner_user_id),
        ).fetchone()
        return self._row_to_account(row)

    def update_account(
        self,
        account_id: str,
        *,
        owner_user_id: str,
        provider: Optional[str] = None,
        label: Optional[str] = None,
        account_type: Optional[str] = None,
        external_identity: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        current = self.get_account(account_id, owner_user_id=owner_user_id)
        if current is None:
            raise ValueError("Connector account not found.")
        next_provider = (provider or current["provider"]).strip().lower()
        next_label = (label or current["label"]).strip()
        if not next_provider:
            raise ValueError("Provider is required.")
        if not next_label:
            raise ValueError("Label is required.")
        next_metadata = metadata if metadata is not None else current.get("metadata", {})
        self._db.execute(
            """
            UPDATE connector_accounts
            SET provider = ?,
                account_type = ?,
                label = ?,
                external_identity = ?,
                status = ?,
                metadata_json = ?,
                updated_at = datetime('now')
            WHERE id = ? AND owner_user_id = ?
            """,
            (
                next_provider,
                (account_type if account_type is not None else current.get("account_type", "")).strip().lower(),
                next_label,
                (external_identity if external_identity is not None else current.get("external_identity", "")).strip(),
                (status if status is not None else current.get("status", "configured")).strip().lower() or "configured",
                json.dumps(next_metadata or {}),
                account_id,
                owner_user_id,
            ),
        )
        self._db.commit()
        updated = self.get_account(account_id, owner_user_id=owner_user_id)
        if updated is None:
            raise ValueError("Connector account not found.")
        return updated

    def delete_account(self, account_id: str, *, owner_user_id: str) -> bool:
        cur = self._db.execute(
            """
            DELETE FROM connector_accounts
            WHERE id = ? AND owner_user_id = ?
            """,
            (account_id, owner_user_id),
        )
        self._db.commit()
        return cur.rowcount > 0

    def _row_to_account(self, row: sqlite3.Row | None) -> Optional[Dict[str, Any]]:
        if row is None:
            return None
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except Exception:
            metadata = {}
        return {
            "id": str(row["id"]),
            "owner_user_id": str(row["owner_user_id"]),
            "provider": str(row["provider"]),
            "account_type": str(row["account_type"] or ""),
            "label": str(row["label"]),
            "external_identity": str(row["external_identity"] or ""),
            "status": str(row["status"] or "configured"),
            "metadata": metadata,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def close(self) -> None:
        self._db.close()


__all__ = ["ConnectorAccountStore"]
