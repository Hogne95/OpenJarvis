"""Microsoft Mail connector via Microsoft Graph.

Provides a modern OAuth-based mail sync path for Microsoft accounts while
leaving the older IMAP/app-password Outlook connector available as a fallback.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional

import httpx

from openjarvis.connectors._stubs import BaseConnector, Document, SyncStatus
from openjarvis.connectors.oauth import (
    delete_tokens,
    get_client_credentials,
    get_provider_for_connector,
    load_tokens,
)
from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.core.registry import ConnectorRegistry

_GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"
_DEFAULT_CREDENTIALS_PATH = str(
    DEFAULT_CONFIG_DIR / "connectors" / "microsoft_mail.json"
)


def _graph_api_list_messages(
    token: str,
    *,
    next_url: Optional[str] = None,
    top: int = 50,
) -> Dict[str, Any]:
    url = next_url or f"{_GRAPH_API_BASE}/me/messages"
    params: Dict[str, Any] = {}
    if not next_url:
        params = {
            "$top": top,
            "$select": ",".join(
                [
                    "id",
                    "internetMessageId",
                    "subject",
                    "bodyPreview",
                    "from",
                    "toRecipients",
                    "ccRecipients",
                    "receivedDateTime",
                    "conversationId",
                    "webLink",
                ]
            ),
            "$orderby": "receivedDateTime desc",
        }

    resp = httpx.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()


def _parse_graph_timestamp(value: str) -> datetime:
    if not value:
        return datetime.now()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.now()


def _extract_recipient_values(
    recipients: List[Dict[str, Any]],
) -> List[str]:
    results: List[str] = []
    for entry in recipients:
        email_address = entry.get("emailAddress", {})
        label = email_address.get("name") or email_address.get("address") or ""
        if label:
            results.append(str(label))
    return results


def _format_message(message: Dict[str, Any]) -> str:
    lines: List[str] = []

    sender = message.get("from", {}).get("emailAddress", {})
    sender_label = sender.get("name") or sender.get("address") or ""
    if sender_label:
        lines.append(f"From: {sender_label}")

    recipients = _extract_recipient_values(message.get("toRecipients", []))
    if recipients:
        lines.append(f"To: {', '.join(recipients)}")

    cc_recipients = _extract_recipient_values(message.get("ccRecipients", []))
    if cc_recipients:
        lines.append(f"CC: {', '.join(cc_recipients)}")

    subject = str(message.get("subject", "")).strip()
    if subject:
        lines.append(f"Subject: {subject}")

    preview = str(message.get("bodyPreview", "")).strip()
    if preview:
        lines.append("")
        lines.append(preview)

    return "\n".join(lines).strip()


@ConnectorRegistry.register("microsoft_mail")
class MicrosoftMailConnector(BaseConnector):
    """OAuth-backed Microsoft mail connector using Microsoft Graph."""

    connector_id = "microsoft_mail"
    display_name = "Microsoft Mail"
    auth_type = "oauth"

    def __init__(self, credentials_path: str = "") -> None:
        self._credentials_path = credentials_path or _DEFAULT_CREDENTIALS_PATH
        self._items_synced: int = 0
        self._items_total: int = 0
        self._last_sync: Optional[datetime] = None
        self._last_cursor: Optional[str] = None

    def is_connected(self) -> bool:
        tokens = load_tokens(self._credentials_path)
        if tokens is None:
            return False
        return bool(tokens.get("access_token") or tokens.get("token"))

    def disconnect(self) -> None:
        delete_tokens(self._credentials_path)

    def auth_url(self) -> str:
        provider = get_provider_for_connector(self.connector_id)
        if provider is None:
            return "https://portal.azure.com/"
        creds = get_client_credentials(provider)
        if not creds:
            return provider.setup_url
        client_id, _ = creds
        return (
            f"{provider.auth_endpoint}?client_id={client_id}"
            "&response_type=code"
            "&redirect_uri=http://127.0.0.1:8000/v1/connectors/providers/microsoft/oauth/callback"
            "&scope=openid%20profile%20email%20offline_access%20User.Read%20Mail.Read"
        )

    def handle_callback(self, code: str) -> None:
        # Provider-first OAuth callback is the preferred path.
        # For manual connector connect requests we at least store the raw token/code.
        from openjarvis.connectors.oauth import save_tokens

        save_tokens(self._credentials_path, {"token": code.strip()})

    def sync(
        self,
        *,
        since: Optional[datetime] = None,
        cursor: Optional[str] = None,
    ) -> Iterator[Document]:
        tokens = load_tokens(self._credentials_path)
        if not tokens:
            return

        token: str = tokens.get("access_token", tokens.get("token", ""))
        if not token:
            return

        self._items_synced = 0
        self._items_total = 0

        next_url = cursor
        while True:
            data = _graph_api_list_messages(token, next_url=next_url)
            messages: List[Dict[str, Any]] = data.get("value", [])
            if self._items_total == 0:
                self._items_total = len(messages)

            for message in messages:
                received_at = _parse_graph_timestamp(
                    str(message.get("receivedDateTime", ""))
                )
                if since is not None and received_at < since:
                    continue

                doc_id = (
                    str(message.get("internetMessageId", "")).strip()
                    or str(message.get("id", "")).strip()
                )
                if not doc_id:
                    continue

                sender = message.get("from", {}).get("emailAddress", {})
                recipients = _extract_recipient_values(message.get("toRecipients", []))
                participants = [value for value in ([sender.get("address", "")] + recipients) if value]

                yield Document(
                    doc_id=f"microsoft_mail:{doc_id}",
                    source="microsoft_mail",
                    doc_type="email",
                    content=_format_message(message),
                    title=str(message.get("subject", "")).strip(),
                    author=str(sender.get("name") or sender.get("address") or ""),
                    participants=participants,
                    timestamp=received_at,
                    thread_id=str(message.get("conversationId", "")).strip() or None,
                    url=str(message.get("webLink", "")).strip() or None,
                    metadata={
                        "provider": "microsoft",
                        "message_id": str(message.get("id", "")).strip(),
                    },
                )
                self._items_synced += 1
                self._last_sync = received_at

            next_url = data.get("@odata.nextLink")
            self._last_cursor = next_url or cursor
            if not next_url:
                break

    def sync_status(self) -> SyncStatus:
        return SyncStatus(
            state="idle",
            items_synced=self._items_synced,
            items_total=self._items_total,
            last_sync=self._last_sync,
            cursor=self._last_cursor,
        )
