from __future__ import annotations

import numpy as np

from openjarvis.speech.live_audio import LiveAudioGate


def test_live_audio_gate_reports_transcript_wake_backend_as_available():
    gate = LiveAudioGate(wake_backend="transcript")

    status = gate.wake_status()

    assert status.requested_backend == "transcript"
    assert status.active_backend == "transcript"
    assert status.available is True
    assert status.reason == ""


def test_live_audio_gate_degrades_openwakeword_to_transcript_when_model_fails():
    gate = LiveAudioGate(wake_backend="openwakeword")
    detector = gate._wake_detector
    detector._failed_reason = "openwakeword unavailable on this platform"  # type: ignore[attr-defined]

    detected, backend, score = gate._detect_wake(np.zeros(1600, dtype=np.float32))
    status = gate.wake_status()

    assert detected is False
    assert backend == "transcript"
    assert score is None
    assert status.requested_backend == "openwakeword"
    assert status.active_backend == "transcript"
    assert status.available is False
    assert "unavailable" in status.reason
