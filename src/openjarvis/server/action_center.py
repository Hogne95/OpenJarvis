"""Approval-driven action center for email and calendar assistant tasks."""

from __future__ import annotations

import base64
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import Any

import httpx

from openjarvis.connectors.gcalendar import (
    _DEFAULT_CREDENTIALS_PATH as _GCALENDAR_CREDENTIALS_PATH,
)
from openjarvis.connectors.gmail import _DEFAULT_CREDENTIALS_PATH as _GMAIL_CREDENTIALS_PATH
from openjarvis.connectors.google_tasks import (
    _DEFAULT_CREDENTIALS_PATH as _GTASKS_CREDENTIALS_PATH,
)
from openjarvis.connectors.oauth import load_tokens, resolve_google_credentials


@dataclass(slots=True)
class PendingAction:
    id: str
    action_type: str
    title: str
    summary: str
    payload: dict[str, Any]
    created_at: float = field(default_factory=time.time)
    status: str = "pending"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ActionEntry:
    id: str
    action_type: str
    title: str
    summary: str
    payload: dict[str, Any]
    created_at: float
    completed_at: float
    status: str
    result: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ActionCenterManager:
    """Stage assistant actions and execute only trusted, low-risk paths."""

    def __init__(self) -> None:
        self._pending: PendingAction | None = None
        self._history: list[ActionEntry] = []

    def status(self) -> dict[str, Any]:
        return {
            "pending": self._pending.to_dict() if self._pending else None,
            "history": [entry.to_dict() for entry in self._history[-12:]][::-1],
        }

    def stage_email_draft(
        self,
        *,
        recipient: str,
        subject: str,
        body: str,
        provider: str = "gmail",
    ) -> dict[str, Any]:
        recipient_clean = recipient.strip()
        subject_clean = subject.strip()
        body_clean = body.strip()
        if not recipient_clean or not subject_clean or not body_clean:
            raise ValueError("Recipient, subject, and body are required")

        self._pending = PendingAction(
            id=uuid.uuid4().hex,
            action_type="email_draft",
            title=f"Email draft: {subject_clean}",
            summary=f"Draft a {provider} email to {recipient_clean}",
            payload={
                "recipient": recipient_clean,
                "subject": subject_clean,
                "body": body_clean,
                "provider": provider.strip().lower() or "gmail",
            },
        )
        return self.status()

    def stage_calendar_brief(
        self,
        *,
        title: str,
        start_at: str,
        end_at: str = "",
        attendees: str = "",
        location: str = "",
        notes: str = "",
    ) -> dict[str, Any]:
        title_clean = title.strip()
        start_clean = start_at.strip()
        if not title_clean or not start_clean:
            raise ValueError("Title and start time are required")

        self._pending = PendingAction(
            id=uuid.uuid4().hex,
            action_type="calendar_brief",
            title=f"Calendar plan: {title_clean}",
            summary=f"Draft a calendar event plan for {start_clean}",
            payload={
                "title": title_clean,
                "start_at": start_clean,
                "end_at": end_at.strip(),
                "attendees": attendees.strip(),
                "location": location.strip(),
                "notes": notes.strip(),
            },
        )
        return self.status()

    def stage_inbox_action(
        self,
        *,
        action_kind: str,
        source: str,
        message_id: str,
        title: str,
        author: str,
    ) -> dict[str, Any]:
        cleaned_kind = action_kind.strip().lower()
        if cleaned_kind not in {"archive", "star"}:
            raise ValueError("Unsupported inbox action")
        if not message_id.strip():
            raise ValueError("Message id is required")

        self._pending = PendingAction(
            id=uuid.uuid4().hex,
            action_type=f"inbox_{cleaned_kind}",
            title=f"{cleaned_kind.title()} inbox item",
            summary=f"{cleaned_kind.title()} '{title.strip() or '(No subject)'}' from {author.strip() or 'unknown sender'}",
            payload={
                "action_kind": cleaned_kind,
                "source": source.strip(),
                "message_id": message_id.strip(),
                "title": title.strip(),
                "author": author.strip(),
            },
        )
        return self.status()

    def stage_task(
        self,
        *,
        title: str,
        notes: str = "",
        due_at: str = "",
    ) -> dict[str, Any]:
        title_clean = title.strip()
        if not title_clean:
            raise ValueError("Task title is required")

        self._pending = PendingAction(
            id=uuid.uuid4().hex,
            action_type="task_create",
            title=f"Task: {title_clean}",
            summary="Create a follow-up task",
            payload={
                "title": title_clean,
                "notes": notes.strip(),
                "due_at": due_at.strip(),
            },
        )
        return self.status()

    def hold(self) -> dict[str, Any]:
        if self._pending is None:
            return self.status()
        pending = self._pending
        self._pending = None
        self._history.append(
            ActionEntry(
                id=pending.id,
                action_type=pending.action_type,
                title=pending.title,
                summary=pending.summary,
                payload=pending.payload,
                created_at=pending.created_at,
                completed_at=time.time(),
                status="held",
                result="Action held by operator.",
            )
        )
        self._history = self._history[-50:]
        return self.status()

    def approve(self) -> dict[str, Any]:
        if self._pending is None:
            raise ValueError("No pending action to approve")

        pending = self._pending
        self._pending = None
        handler = {
            "email_draft": self._approve_email_draft,
            "calendar_brief": self._approve_calendar_brief,
            "inbox_archive": self._approve_inbox_action,
            "inbox_star": self._approve_inbox_action,
            "task_create": self._approve_task_create,
        }.get(pending.action_type)
        if handler is None:
            raise ValueError(f"Unsupported action type: {pending.action_type}")

        status, result, metadata = handler(pending.payload)
        entry = ActionEntry(
            id=pending.id,
            action_type=pending.action_type,
            title=pending.title,
            summary=pending.summary,
            payload=pending.payload,
            created_at=pending.created_at,
            completed_at=time.time(),
            status=status,
            result=result,
            metadata=metadata,
        )
        self._history.append(entry)
        self._history = self._history[-50:]
        return {**self.status(), "result": entry.to_dict()}

    def _approve_email_draft(self, payload: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
        provider = str(payload.get("provider", "gmail")).lower()
        if provider != "gmail":
            return (
                "draft_ready",
                f"Draft is ready for {provider}, but direct send is not supported yet.",
                {"provider": provider},
            )

        tokens_path = resolve_google_credentials(_GMAIL_CREDENTIALS_PATH)
        tokens = load_tokens(tokens_path)
        if not tokens:
            return (
                "error",
                "Gmail is not connected. Connect Gmail in Data Sources before sending.",
                {"provider": provider},
            )

        token = tokens.get("access_token") or tokens.get("token")
        if not token:
            return (
                "error",
                "Gmail credentials are present, but no usable access token was found.",
                {"provider": provider},
            )

        msg = MIMEText(str(payload["body"]))
        msg["To"] = str(payload["recipient"])
        msg["From"] = "me"
        msg["Subject"] = str(payload["subject"])
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        try:
            response = httpx.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"raw": raw},
                timeout=30.0,
            )
            response.raise_for_status()
        except Exception as exc:
            return (
                "error",
                f"Gmail send failed: {exc}",
                {"provider": provider},
            )

        return (
            "sent",
            f"Email sent to {payload['recipient']}.",
            {"provider": provider},
        )

    def _approve_calendar_brief(self, payload: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
        tokens_path = resolve_google_credentials(_GCALENDAR_CREDENTIALS_PATH)
        tokens = load_tokens(tokens_path)
        token = (tokens or {}).get("access_token") or (tokens or {}).get("token")
        start_at = str(payload["start_at"]).strip()
        end_at = str(payload.get("end_at", "")).strip()
        parsed_start = self._parse_datetime(start_at)
        parsed_end = self._parse_datetime(end_at) if end_at else None
        if parsed_start and parsed_end is None:
            parsed_end = parsed_start + timedelta(hours=1)

        if token and parsed_start and parsed_end:
            attendees_raw = str(payload.get("attendees", "")).strip()
            attendees = [
                {"email": item.strip()}
                for item in attendees_raw.split(",")
                if "@" in item.strip()
            ]
            event = {
                "summary": payload["title"],
                "description": payload.get("notes", ""),
                "location": payload.get("location", ""),
                "start": {"dateTime": parsed_start.isoformat()},
                "end": {"dateTime": parsed_end.isoformat()},
            }
            if attendees:
                event["attendees"] = attendees
            try:
                response = httpx.post(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json=event,
                    timeout=30.0,
                )
                response.raise_for_status()
                event_json = response.json()
                return (
                    "created",
                    f"Calendar event created for {payload['start_at']}.",
                    {"html_link": event_json.get("htmlLink", ""), "event_id": event_json.get("id", "")},
                )
            except Exception as exc:
                return (
                    "error",
                    f"Calendar create failed: {exc}. Reconnect Google Calendar to grant write access if needed.",
                    {},
                )

        attendees = payload.get("attendees", "")
        attendee_phrase = f" with {attendees}" if attendees else ""
        location = payload.get("location", "")
        location_phrase = f" at {location}" if location else ""
        return (
            "draft_ready",
            f"Calendar event plan ready for {payload['start_at']}{location_phrase}{attendee_phrase}. Review and create it from your calendar app after checking details.",
            {"requires_manual_create": True, "reason": "Missing writable calendar token or invalid datetime"},
        )

    def _approve_inbox_action(self, payload: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
        source = str(payload.get("source", "")).strip().lower()
        message_id = str(payload.get("message_id", "")).strip()
        action_kind = str(payload.get("action_kind", "")).strip().lower()
        if source != "gmail":
            return (
                "draft_ready",
                f"{action_kind.title()} is only supported for the Gmail REST connector right now.",
                {"source": source},
            )

        tokens_path = resolve_google_credentials(_GMAIL_CREDENTIALS_PATH)
        tokens = load_tokens(tokens_path)
        token = (tokens or {}).get("access_token") or (tokens or {}).get("token")
        if not token:
            return ("error", "Gmail is not connected with a writable token.", {"source": source})

        body: dict[str, Any]
        if action_kind == "archive":
            body = {"removeLabelIds": ["INBOX"]}
        elif action_kind == "star":
            body = {"addLabelIds": ["STARRED"]}
        else:
            return ("error", "Unsupported inbox action.", {"source": source})

        try:
            response = httpx.post(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/modify",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=body,
                timeout=30.0,
            )
            response.raise_for_status()
        except Exception as exc:
            return (
                "error",
                f"Gmail {action_kind} failed: {exc}. Reconnect Gmail to grant modify access if needed.",
                {"source": source},
            )

        return (
            "completed",
            f"Message {action_kind}d successfully.",
            {"source": source, "message_id": message_id},
        )

    def _approve_task_create(self, payload: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
        tokens_path = resolve_google_credentials(_GTASKS_CREDENTIALS_PATH)
        tokens = load_tokens(tokens_path)
        token = (tokens or {}).get("access_token") or (tokens or {}).get("token")
        if not token:
            return (
                "draft_ready",
                "Google Tasks is not connected with write access. Reconnect Google Tasks to create tasks directly.",
                {},
            )

        try:
            lists_response = httpx.get(
                "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            lists_response.raise_for_status()
            lists = lists_response.json().get("items", [])
            if not lists:
                return ("error", "No Google Task list is available for this account.", {})
            task_list_id = lists[0]["id"]

            body: dict[str, Any] = {
                "title": payload["title"],
                "notes": payload.get("notes", ""),
            }
            due_at = str(payload.get("due_at", "")).strip()
            parsed_due = self._parse_datetime(due_at)
            if parsed_due:
                body["due"] = parsed_due.isoformat()

            response = httpx.post(
                f"https://tasks.googleapis.com/tasks/v1/lists/{task_list_id}/tasks",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=body,
                timeout=30.0,
            )
            response.raise_for_status()
            task_json = response.json()
            return (
                "created",
                f"Task created: {payload['title']}.",
                {"task_id": task_json.get("id", ""), "self_link": task_json.get("selfLink", "")},
            )
        except Exception as exc:
            return (
                "error",
                f"Task create failed: {exc}. Reconnect Google Tasks to grant write access if needed.",
                {},
            )

    @staticmethod
    def _parse_datetime(value: str) -> datetime | None:
        raw = value.strip()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None


__all__ = ["ActionCenterManager"]
