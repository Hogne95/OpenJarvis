from __future__ import annotations

from pathlib import Path

from openjarvis.security.secrets import apply_secret_file_overrides, resolve_secret


def test_resolve_secret_prefers_direct_env(monkeypatch, tmp_path: Path):
    secret_file = tmp_path / "api-key.txt"
    secret_file.write_text("from-file\n", encoding="utf-8")
    monkeypatch.setenv("OPENJARVIS_API_KEY", "from-env")
    monkeypatch.setenv("OPENJARVIS_API_KEY_FILE", str(secret_file))

    assert resolve_secret("OPENJARVIS_API_KEY") == "from-env"


def test_resolve_secret_reads_file(monkeypatch, tmp_path: Path):
    secret_file = tmp_path / "api-key.txt"
    secret_file.write_text("from-file\n", encoding="utf-8")
    monkeypatch.delenv("OPENJARVIS_API_KEY", raising=False)
    monkeypatch.setenv("OPENJARVIS_API_KEY_FILE", str(secret_file))

    assert resolve_secret("OPENJARVIS_API_KEY") == "from-file"


def test_apply_secret_file_overrides_sets_missing_env(monkeypatch, tmp_path: Path):
    secret_file = tmp_path / "openai-key.txt"
    secret_file.write_text("sk-secret\n", encoding="utf-8")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY_FILE", str(secret_file))

    apply_secret_file_overrides(["OPENAI_API_KEY"])

    assert resolve_secret("OPENAI_API_KEY") == "sk-secret"
