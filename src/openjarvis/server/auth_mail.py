"""Mail helpers for auth recovery flows."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote

from openjarvis.channels.email_channel import EmailChannel


def send_password_reset_email(app_state: Any, request_origin: str, user: dict[str, Any], token: str) -> bool:
    email = str(user.get("email") or "").strip()
    if not email:
        return False
    channel = _build_email_channel(app_state)
    if channel is None:
        return False
    reset_url = _build_reset_url(request_origin, token)
    display_name = str(user.get("display_name") or user.get("username") or "there").strip()
    body = (
        f"Hello {display_name},\n\n"
        "We received a request to reset your JARVIS password.\n\n"
        f"Open this link to choose a new password:\n{reset_url}\n\n"
        "If you did not request this change, you can ignore this email.\n"
        "This link expires in 30 minutes.\n\n"
        "JARVIS Security"
    )
    return channel.send(
        email,
        body,
        metadata={"subject": "Reset your JARVIS password"},
    )


def _build_email_channel(app_state: Any) -> EmailChannel | None:
    config = getattr(app_state, "config", None)
    email_cfg = getattr(getattr(config, "channel", None), "email", None)

    smtp_host = _first_non_empty(
        getattr(email_cfg, "smtp_host", ""),
        os.environ.get("EMAIL_SMTP_HOST", ""),
        os.environ.get("OPENJARVIS_EMAIL_SMTP_HOST", ""),
    )
    if not smtp_host:
        return None
    smtp_port = _coerce_int(
        _first_non_empty(
            str(getattr(email_cfg, "smtp_port", "") or ""),
            os.environ.get("EMAIL_SMTP_PORT", ""),
            os.environ.get("OPENJARVIS_EMAIL_SMTP_PORT", ""),
        ),
        587,
    )
    username = _first_non_empty(
        getattr(email_cfg, "username", ""),
        os.environ.get("EMAIL_USERNAME", ""),
        os.environ.get("OPENJARVIS_EMAIL_USERNAME", ""),
    )
    password = _first_non_empty(
        getattr(email_cfg, "password", ""),
        os.environ.get("EMAIL_PASSWORD", ""),
        os.environ.get("OPENJARVIS_EMAIL_PASSWORD", ""),
    )
    use_tls = _coerce_bool(
        _first_non_empty(
            str(getattr(email_cfg, "use_tls", "") or ""),
            os.environ.get("EMAIL_USE_TLS", ""),
            os.environ.get("OPENJARVIS_EMAIL_USE_TLS", ""),
        ),
        True,
    )
    return EmailChannel(
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        username=username,
        password=password,
        use_tls=use_tls,
    )


def _build_reset_url(request_origin: str, token: str) -> str:
    public_base = (
        os.environ.get("OPENJARVIS_PUBLIC_WEB_URL", "")
        or os.environ.get("OPENJARVIS_WEB_URL", "")
        or request_origin
    ).strip()
    public_base = public_base.rstrip("/")
    return f"{public_base}/reset-password?token={quote(token)}"


def _first_non_empty(*values: str) -> str:
    for value in values:
        cleaned = str(value or "").strip()
        if cleaned:
            return cleaned
    return ""


def _coerce_int(raw: str, default: int) -> int:
    try:
        return int(str(raw).strip())
    except Exception:
        return default


def _coerce_bool(raw: str, default: bool) -> bool:
    value = str(raw or "").strip().lower()
    if not value:
        return default
    return value not in {"0", "false", "no", "off"}


__all__ = ["send_password_reset_email"]
