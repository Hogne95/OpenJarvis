"""Validate production deployment prerequisites for broader-user JARVIS."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def validate_production(repo_root: Path | None = None) -> tuple[list[str], list[str], str]:
    repo_root = repo_root or Path(__file__).resolve().parents[1]
    env_path = repo_root / "deploy" / "env" / "openjarvis.production.env"
    secrets_dir = repo_root / "deploy" / "env" / "secrets"
    api_key_secret = secrets_dir / "openjarvis_api_key.txt"

    env_values = _read_env_file(env_path)
    errors: list[str] = []
    warnings: list[str] = []

    if not env_path.exists():
        errors.append("Missing deploy/env/openjarvis.production.env")

    domain = env_values.get("OPENJARVIS_DOMAIN", "")
    if not domain:
        errors.append("OPENJARVIS_DOMAIN is not set in deploy/env/openjarvis.production.env")
    else:
        parsed = urlparse(f"https://{domain}")
        if not parsed.hostname or "." not in parsed.hostname:
            warnings.append("OPENJARVIS_DOMAIN does not look like a public DNS hostname")

    if not api_key_secret.exists() and not env_values.get("OPENJARVIS_API_KEY", ""):
        errors.append(
            "Missing API key secret. Create deploy/env/secrets/openjarvis_api_key.txt "
            "or set OPENJARVIS_API_KEY in the production env file."
        )

    required_files = [
        repo_root / "deploy" / "docker" / "docker-compose.production.yml",
        repo_root / "deploy" / "docker" / "docker-compose.monitoring.yml",
        repo_root / "deploy" / "caddy" / "Caddyfile",
        repo_root / "deploy" / "monitoring" / "prometheus.yml",
        repo_root / "deploy" / "monitoring" / "openjarvis-alerts.yml",
    ]
    for required in required_files:
        if not required.exists():
            errors.append(f"Missing required deployment asset: {required.relative_to(repo_root)}")

    if not (repo_root / "scripts" / "backup_openjarvis.sh").exists():
        errors.append("Missing backup script")
    if not (repo_root / "scripts" / "restore_openjarvis.sh").exists():
        errors.append("Missing restore script")

    voice_note = (
        "Remote voice is best treated as browser convenience. Keep wake-word and low-latency "
        "barge-in local if you want the strongest JARVIS experience."
    )

    return errors, warnings, voice_note


def main() -> int:
    errors, warnings, voice_note = validate_production()

    if errors:
        print("OpenJarvis production readiness: FAIL")
        for item in errors:
            print(f"  - {item}")
        if warnings:
            print("Warnings:")
            for item in warnings:
                print(f"  - {item}")
        print(f"Voice note: {voice_note}")
        return 1

    print("OpenJarvis production readiness: PASS")
    if warnings:
        print("Warnings:")
        for item in warnings:
            print(f"  - {item}")
    print(f"Voice note: {voice_note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
