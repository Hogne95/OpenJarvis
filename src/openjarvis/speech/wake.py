"""Wake-word detector abstractions for the live voice pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass(slots=True)
class WakeDetectorResult:
    detected: bool
    backend: str
    score: float | None = None


@dataclass(slots=True)
class WakeDetectorStatus:
    requested_backend: str
    active_backend: str
    available: bool
    reason: str = ""


class WakeDetector:
    def detect(self, samples_16k: np.ndarray) -> WakeDetectorResult:
        raise NotImplementedError

    def status(self) -> WakeDetectorStatus:
        raise NotImplementedError


class TranscriptWakeDetector(WakeDetector):
    def __init__(self, *, requested_backend: str = "transcript", reason: str = "") -> None:
        self._requested_backend = requested_backend or "transcript"
        self._reason = reason

    def detect(self, samples_16k: np.ndarray) -> WakeDetectorResult:
        return WakeDetectorResult(detected=False, backend="transcript", score=None)

    def status(self) -> WakeDetectorStatus:
        return WakeDetectorStatus(
            requested_backend=self._requested_backend,
            active_backend="transcript",
            available=self._requested_backend == "transcript",
            reason=self._reason,
        )


class OpenWakeWordDetector(WakeDetector):
    def __init__(self, *, model_path: str = "", threshold: float = 0.5) -> None:
        self._model_path = model_path
        self._threshold = threshold
        self._model: Any | None = None
        self._failed_reason = ""

    def _load_model(self) -> Any | None:
        if self._model is not None:
            return self._model
        if self._failed_reason:
            return None
        try:
            from openwakeword.model import Model

            if self._model_path:
                path = Path(self._model_path)
                if not path.exists():
                    self._failed_reason = f"Wake model not found: {path}"
                    return None
                self._model = Model(wakeword_models=[str(path)])
            else:
                self._model = Model()
        except Exception as exc:
            self._failed_reason = str(exc) or "Failed to initialize openWakeWord"
        return self._model

    def detect(self, samples_16k: np.ndarray) -> WakeDetectorResult:
        model = self._load_model()
        if model is None:
            return WakeDetectorResult(detected=False, backend="transcript", score=None)

        pcm16 = np.clip(samples_16k * 32767.0, -32768, 32767).astype(np.int16)
        frame_size = 1280
        best_score = 0.0
        try:
            for start in range(0, max(len(pcm16) - frame_size + 1, 1), frame_size):
                frame = pcm16[start : start + frame_size]
                if frame.size < frame_size:
                    break
                prediction = model.predict(frame)
                if isinstance(prediction, dict):
                    interesting_keys = [
                        key
                        for key in prediction.keys()
                        if "jarvis" in key.lower() or "alexa" in key.lower()
                    ]
                    candidates = (
                        [float(prediction[key]) for key in interesting_keys]
                        if interesting_keys
                        else [float(value) for value in prediction.values()]
                    )
                    score = max(candidates)
                else:
                    score = float(prediction)
                if score > best_score:
                    best_score = score
            return WakeDetectorResult(
                detected=best_score >= self._threshold,
                backend="openwakeword",
                score=best_score,
            )
        except Exception as exc:
            self._failed_reason = str(exc) or "Wake-word inference failed"
            return WakeDetectorResult(detected=False, backend="transcript", score=None)

    def status(self) -> WakeDetectorStatus:
        model = self._load_model()
        if model is not None:
            return WakeDetectorStatus(
                requested_backend="openwakeword",
                active_backend="openwakeword",
                available=True,
                reason="",
            )
        return WakeDetectorStatus(
            requested_backend="openwakeword",
            active_backend="transcript",
            available=False,
            reason=self._failed_reason or "openWakeWord unavailable",
        )


def build_wake_detector(
    backend: str,
    *,
    model_path: str = "",
    threshold: float = 0.5,
) -> WakeDetector:
    normalized = (backend or "transcript").strip().lower()
    if normalized == "openwakeword":
        return OpenWakeWordDetector(model_path=model_path, threshold=threshold)
    return TranscriptWakeDetector(requested_backend=normalized)


__all__ = [
    "WakeDetector",
    "WakeDetectorResult",
    "WakeDetectorStatus",
    "TranscriptWakeDetector",
    "OpenWakeWordDetector",
    "build_wake_detector",
]
