"""SQLite-backed user store for JARVIS web authentication."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.security.file_utils import secure_create

_PBKDF2_ITERATIONS = 240_000


def _now_sql() -> str:
    return "datetime('now')"


class UserStore:
    """Manage local web users for the JARVIS UI."""

    def __init__(self, db_path: str = "") -> None:
        if not db_path:
            db_path = str(DEFAULT_CONFIG_DIR / "web_users.db")
        secure_create(Path(db_path))
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self) -> None:
        self._db.executescript(
            f"""\
            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                username        TEXT NOT NULL UNIQUE,
                display_name    TEXT NOT NULL DEFAULT '',
                password_hash   TEXT NOT NULL,
                role            TEXT NOT NULL DEFAULT 'user',
                status          TEXT NOT NULL DEFAULT 'active',
                created_at      TEXT NOT NULL DEFAULT ({_now_sql()}),
                updated_at      TEXT NOT NULL DEFAULT ({_now_sql()}),
                last_login_at   TEXT
            );

            CREATE TABLE IF NOT EXISTS web_sessions (
                id                 TEXT PRIMARY KEY,
                user_id            TEXT NOT NULL,
                session_token_hash TEXT NOT NULL UNIQUE,
                expires_at         TEXT NOT NULL,
                created_at         TEXT NOT NULL DEFAULT ({_now_sql()}),
                last_seen_at       TEXT NOT NULL DEFAULT ({_now_sql()}),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_web_sessions_user
                ON web_sessions (user_id);
            CREATE INDEX IF NOT EXISTS idx_web_sessions_expiry
                ON web_sessions (expires_at);
            """
        )
        self._db.commit()

    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            _PBKDF2_ITERATIONS,
        )
        return "pbkdf2_sha256${}${}${}".format(
            _PBKDF2_ITERATIONS,
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        try:
            algorithm, iterations_raw, salt_b64, digest_b64 = password_hash.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            iterations = int(iterations_raw)
            salt = base64.b64decode(salt_b64.encode("ascii"))
            expected = base64.b64decode(digest_b64.encode("ascii"))
        except Exception:
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(actual, expected)

    def user_count(self) -> int:
        row = self._db.execute("SELECT COUNT(*) FROM users").fetchone()
        return int(row[0] if row else 0)

    def bootstrap_admin(self, username: str, password: str, display_name: str = "") -> Dict[str, Any]:
        if self.user_count() > 0:
            raise ValueError("Bootstrap is only available before the first user is created.")
        return self.create_user(
            username=username,
            password=password,
            display_name=display_name or username,
            role="superadmin",
        )

    def create_user(
        self,
        *,
        username: str,
        password: str,
        display_name: str = "",
        role: str = "user",
    ) -> Dict[str, Any]:
        cleaned_username = username.strip().lower()
        if not cleaned_username:
            raise ValueError("Username is required.")
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")
        user_id = secrets.token_hex(16)
        self._db.execute(
            """
            INSERT INTO users (id, username, display_name, password_hash, role, status)
            VALUES (?, ?, ?, ?, ?, 'active')
            """,
            (
                user_id,
                cleaned_username,
                (display_name or cleaned_username).strip(),
                self.hash_password(password),
                role.strip() or "user",
            ),
        )
        self._db.commit()
        user = self.get_user_by_id(user_id)
        if user is None:
            raise ValueError("Failed to create user.")
        return user

    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        row = self._db.execute(
            "SELECT * FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
        return self._row_to_user(row)

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        row = self._db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return self._row_to_user(row)

    def list_users(self) -> list[Dict[str, Any]]:
        rows = self._db.execute(
            """
            SELECT *
            FROM users
            ORDER BY created_at ASC, username ASC
            """
        ).fetchall()
        return [user for user in (self._row_to_user(row) for row in rows) if user is not None]

    def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        user = self.get_user_by_username(username)
        if user is None or user.get("status") != "active":
            return None
        row = self._db.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if row is None or not self.verify_password(password, str(row["password_hash"])):
            return None
        self._db.execute(
            f"UPDATE users SET last_login_at = ({_now_sql()}), updated_at = ({_now_sql()}) WHERE id = ?",
            (user["id"],),
        )
        self._db.commit()
        return self.get_user_by_id(user["id"])

    def create_session(self, user_id: str, *, ttl_days: int = 30) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        session_id = secrets.token_hex(16)
        self._db.execute(
            """
            INSERT INTO web_sessions (id, user_id, session_token_hash, expires_at)
            VALUES (?, ?, ?, datetime('now', ?))
            """,
            (session_id, user_id, token_hash, f"+{ttl_days} days"),
        )
        self._db.commit()
        return token

    def get_user_for_session(self, token: str) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        row = self._db.execute(
            """
            SELECT u.*
            FROM web_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.session_token_hash = ?
              AND s.expires_at > datetime('now')
              AND u.status = 'active'
            """,
            (token_hash,),
        ).fetchone()
        if row is None:
            return None
        self._db.execute(
            f"UPDATE web_sessions SET last_seen_at = ({_now_sql()}) WHERE session_token_hash = ?",
            (token_hash,),
        )
        self._db.commit()
        return self._row_to_user(row)

    def revoke_session(self, token: str) -> None:
        if not token:
            return
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        self._db.execute(
            "DELETE FROM web_sessions WHERE session_token_hash = ?",
            (token_hash,),
        )
        self._db.commit()

    def revoke_sessions_for_user(self, user_id: str) -> None:
        self._db.execute("DELETE FROM web_sessions WHERE user_id = ?", (user_id,))
        self._db.commit()

    def update_user(
        self,
        user_id: str,
        *,
        display_name: Optional[str] = None,
        role: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        current = self.get_user_by_id(user_id)
        if current is None:
            raise ValueError("User not found.")

        next_display_name = (
            display_name.strip()
            if display_name is not None
            else str(current["display_name"])
        )
        next_role = (role or str(current["role"])).strip().lower() or "user"
        next_status = (status or str(current["status"])).strip().lower() or "active"
        if not next_display_name:
            raise ValueError("Display name is required.")
        if next_role not in {"superadmin", "admin", "user", "restricted"}:
            raise ValueError("Invalid role.")
        if next_status not in {"active", "disabled"}:
            raise ValueError("Invalid status.")

        self._db.execute(
            """
            UPDATE users
            SET display_name = ?,
                role = ?,
                status = ?,
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (next_display_name, next_role, next_status, user_id),
        )
        self._db.commit()
        if next_status != "active":
            self.revoke_sessions_for_user(user_id)
        updated = self.get_user_by_id(user_id)
        if updated is None:
            raise ValueError("User not found.")
        return updated

    def set_password(self, user_id: str, password: str) -> Dict[str, Any]:
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")
        current = self.get_user_by_id(user_id)
        if current is None:
            raise ValueError("User not found.")
        self._db.execute(
            """
            UPDATE users
            SET password_hash = ?,
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (self.hash_password(password), user_id),
        )
        self._db.commit()
        self.revoke_sessions_for_user(user_id)
        updated = self.get_user_by_id(user_id)
        if updated is None:
            raise ValueError("User not found.")
        return updated

    def _row_to_user(self, row: sqlite3.Row | None) -> Optional[Dict[str, Any]]:
        if row is None:
            return None
        return {
            "id": str(row["id"]),
            "username": str(row["username"]),
            "display_name": str(row["display_name"] or row["username"]),
            "role": str(row["role"]),
            "status": str(row["status"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_login_at": row["last_login_at"],
        }

    def close(self) -> None:
        self._db.close()


__all__ = ["UserStore"]
