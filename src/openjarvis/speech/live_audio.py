"""Helpers for live voice gating: PCM decode, VAD, and optional wake-word models."""

from __future__ import annotations

import io
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


def _decode_wav_bytes(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        channels = wav_file.getnchannels()
        frames = wav_file.readframes(wav_file.getnframes())

    if sample_width != 2:
        raise ValueError("Only 16-bit PCM WAV audio is supported for live VAD")

    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, sample_rate


def _resample(samples: np.ndarray, sample_rate: int, target_rate: int = 16000) -> np.ndarray:
    if sample_rate == target_rate:
        return samples.astype(np.float32, copy=False)
    if samples.size == 0:
        return samples.astype(np.float32, copy=False)
    duration = samples.shape[0] / float(sample_rate)
    target_length = max(int(duration * target_rate), 1)
    source_positions = np.linspace(0.0, 1.0, num=samples.shape[0], endpoint=False)
    target_positions = np.linspace(0.0, 1.0, num=target_length, endpoint=False)
    return np.interp(target_positions, source_positions, samples).astype(np.float32)


def _rms_level(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples), dtype=np.float64)))


@dataclass(slots=True)
class LiveAudioAnalysis:
    speech_detected: bool
    wake_detected: bool
    rms_level: float
    sample_rate: int
    duration_seconds: float
    vad_backend: str
    wake_backend: str
    wake_score: float | None = None


class LiveAudioGate:
    """Analyze live audio chunks before STT to reduce idle/background traffic."""

    def __init__(
        self,
        *,
        vad_enabled: bool = True,
        vad_backend: str = "auto",
        vad_threshold: float = 0.016,
        vad_min_speech_ms: int = 250,
        wake_backend: str = "transcript",
        wake_model_path: str = "",
        wake_threshold: float = 0.5,
    ) -> None:
        self._vad_enabled = vad_enabled
        self._vad_backend = vad_backend
        self._vad_threshold = vad_threshold
        self._vad_min_speech_ms = vad_min_speech_ms
        self._wake_backend = wake_backend
        self._wake_model_path = wake_model_path
        self._wake_threshold = wake_threshold
        self._silero_model: Any | None = None
        self._silero_failed = False
        self._wake_model: Any | None = None
        self._wake_failed = False

    def _load_silero(self) -> Any | None:
        if self._silero_model is not None or self._silero_failed:
            return self._silero_model
        try:
            from silero_vad import load_silero_vad

            self._silero_model = load_silero_vad()
        except Exception:
            self._silero_failed = True
        return self._silero_model

    def _load_wake_model(self) -> Any | None:
        if self._wake_backend != "openwakeword":
            return None
        if self._wake_model is not None or self._wake_failed:
            return self._wake_model
        try:
            from openwakeword.model import Model

            if self._wake_model_path:
                model_path = Path(self._wake_model_path)
                if not model_path.exists():
                    self._wake_failed = True
                    return None
                self._wake_model = Model(wakeword_models=[str(model_path)])
            else:
                # Let openWakeWord load its bundled pretrained models.
                self._wake_model = Model()
        except Exception:
            self._wake_failed = True
        return self._wake_model

    def _detect_speech(self, samples_16k: np.ndarray) -> tuple[bool, str]:
        if not self._vad_enabled:
            return True, "disabled"

        if self._vad_backend in {"auto", "silero"}:
            model = self._load_silero()
            if model is not None:
                try:
                    from silero_vad import get_speech_timestamps

                    timestamps = get_speech_timestamps(
                        samples_16k,
                        model,
                        sampling_rate=16000,
                        threshold=self._vad_threshold,
                        min_speech_duration_ms=self._vad_min_speech_ms,
                    )
                    return bool(timestamps), "silero"
                except Exception:
                    pass
            if self._vad_backend == "silero":
                return _rms_level(samples_16k) >= self._vad_threshold, "energy"

        return _rms_level(samples_16k) >= self._vad_threshold, "energy"

    def _detect_wake(self, samples_16k: np.ndarray) -> tuple[bool, str, float | None]:
        if self._wake_backend != "openwakeword":
            return False, "transcript", None

        model = self._load_wake_model()
        if model is None:
            return False, "transcript", None

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
            return best_score >= self._wake_threshold, "openwakeword", best_score
        except Exception:
            self._wake_failed = True
            return False, "transcript", None

    def analyze(self, audio_bytes: bytes, *, format: str = "wav") -> LiveAudioAnalysis:
        normalized_format = format.lower().lstrip(".")
        if normalized_format != "wav":
            return LiveAudioAnalysis(
                speech_detected=True,
                wake_detected=False,
                rms_level=0.0,
                sample_rate=0,
                duration_seconds=0.0,
                vad_backend="unsupported",
                wake_backend="transcript",
                wake_score=None,
            )

        samples, sample_rate = _decode_wav_bytes(audio_bytes)
        samples_16k = _resample(samples, sample_rate, 16000)
        rms_level = _rms_level(samples_16k)
        speech_detected, vad_backend = self._detect_speech(samples_16k)
        wake_detected, wake_backend, wake_score = self._detect_wake(samples_16k)
        return LiveAudioAnalysis(
            speech_detected=speech_detected,
            wake_detected=wake_detected,
            rms_level=rms_level,
            sample_rate=sample_rate,
            duration_seconds=(samples.shape[0] / float(sample_rate)) if sample_rate else 0.0,
            vad_backend=vad_backend,
            wake_backend=wake_backend,
            wake_score=wake_score,
        )


__all__ = ["LiveAudioAnalysis", "LiveAudioGate"]
