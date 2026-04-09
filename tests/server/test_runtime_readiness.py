from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from openjarvis.server.api_routes import _mission_followup_payload, build_runtime_readiness


class _HealthySpeechBackend:
    backend_id = "stub-speech"

    def health(self) -> bool:
        return True


def test_mission_followup_uses_document_brief_for_memo_modes():
    mission = {
        "title": "Document Intel",
        "domain": "document",
        "summary": "Document analysis ready.",
        "result": "Investment thesis and risks are ready.",
        "next_step": "Turn this into a memo.",
        "result_data": {"mode": "investment_memo"},
    }

    followup = _mission_followup_payload(mission, "retry")

    assert followup is not None
    assert followup["kind"] == "brief"
    assert followup["label"] == "Document Intel Memo"


def test_runtime_readiness_reports_desktop_report_warning_when_missing(monkeypatch, tmp_path: Path):
    monkeypatch.chdir(tmp_path)
    app_state = SimpleNamespace(speech_backend=_HealthySpeechBackend(), voice_loop=object())

    readiness = build_runtime_readiness(app_state)
    checks = {item["id"]: item for item in readiness["checks"]}

    assert checks["speech-backend"]["status"] == "ready"
    assert checks["voice-loop"]["status"] == "ready"
    assert checks["desktop-report"]["status"] == "warning"


def test_runtime_readiness_reports_desktop_policy_block_when_report_mentions_wdac(monkeypatch, tmp_path: Path):
    monkeypatch.chdir(tmp_path)
    report = tmp_path / "desktop-readiness-report.txt"
    report.write_text("WDAC policy active. Code Integrity blocked the build helper.", encoding="utf-8")
    app_state = SimpleNamespace(speech_backend=None, voice_loop=None)

    readiness = build_runtime_readiness(app_state)
    checks = {item["id"]: item for item in readiness["checks"]}

    assert checks["desktop-report"]["status"] == "blocked"
    assert "WDAC" in checks["desktop-report"]["recommendation"]
