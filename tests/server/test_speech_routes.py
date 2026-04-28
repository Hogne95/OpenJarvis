"""Tests for speech API endpoints."""

from unittest.mock import MagicMock
from unittest.mock import patch

import pytest

fastapi = pytest.importorskip("fastapi")

from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.speech._stubs import TranscriptionResult  # noqa: E402
from openjarvis.speech.tts import TTSResult  # noqa: E402


@pytest.fixture
def mock_speech_backend():
    backend = MagicMock()
    backend.backend_id = "mock"
    backend.health.return_value = True
    backend.transcribe.return_value = TranscriptionResult(
        text="Hello world",
        language="en",
        confidence=0.95,
        duration_seconds=1.5,
        segments=[],
    )
    return backend


@pytest.fixture
def app_with_speech(mock_speech_backend):
    from fastapi import FastAPI

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.speech_backend = mock_speech_backend
    app.include_router(speech_router)
    return app


@pytest.fixture
def client(app_with_speech):
    return TestClient(app_with_speech)


def test_transcribe_endpoint(client, mock_speech_backend):
    response = client.post(
        "/v1/speech/transcribe",
        files={"file": ("test.wav", b"fake audio data", "audio/wav")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "Hello world"
    assert data["language"] == "en"
    assert data["confidence"] == 0.95
    assert data["duration_seconds"] == 1.5


def test_transcribe_no_file(client):
    response = client.post("/v1/speech/transcribe")
    assert response.status_code == 400 or response.status_code == 422


def test_health_endpoint(client):
    response = client.get("/v1/speech/health")
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["backend"] == "mock"


def test_health_no_backend():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.speech_backend = None
    app.include_router(speech_router)
    client = TestClient(app)

    response = client.get("/v1/speech/health")
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is False


def test_synthesize_reuses_warm_tts_backend():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from openjarvis.server.api_routes import speech_router

    app = FastAPI()
    app.state.config = None
    app.include_router(speech_router)
    client = TestClient(app)

    mock_backend = MagicMock()
    mock_backend.synthesize.return_value = TTSResult(
        audio=b"fake-wav",
        format="wav",
        voice_id="am_michael",
        duration_seconds=0.4,
    )
    mock_backend_cls = MagicMock(return_value=mock_backend)

    with patch("openjarvis.core.registry.TTSRegistry") as mock_registry:
        mock_registry.contains.return_value = True
        mock_registry.get.return_value = mock_backend_cls

        first = client.post(
            "/v1/speech/synthesize",
            json={"text": "Standing by.", "backend": "kokoro"},
        )
        second = client.post(
            "/v1/speech/synthesize",
            json={"text": "How can I assist?", "backend": "kokoro"},
        )

    assert first.status_code == 200
    assert first.content == b"fake-wav"
    assert second.status_code == 200
    assert mock_backend_cls.call_count == 1
    assert mock_backend.synthesize.call_count == 2
