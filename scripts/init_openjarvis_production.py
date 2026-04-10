"""Bootstrap production deployment files for OpenJarvis."""

from __future__ import annotations

import secrets
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    env_dir = repo_root / "deploy" / "env"
    env_dir.mkdir(parents=True, exist_ok=True)
    secrets_dir = env_dir / "secrets"
    secrets_dir.mkdir(parents=True, exist_ok=True)

    example_path = env_dir / "openjarvis.production.env.example"
    env_path = env_dir / "openjarvis.production.env"
    api_key_path = secrets_dir / "openjarvis_api_key.txt"

    created: list[str] = []

    if example_path.exists() and not env_path.exists():
        env_path.write_text(example_path.read_text(encoding="utf-8"), encoding="utf-8")
        created.append(str(env_path.relative_to(repo_root)))

    if not api_key_path.exists():
        api_key_path.write_text(f"oj_sk_{secrets.token_urlsafe(32)}\n", encoding="utf-8")
        created.append(str(api_key_path.relative_to(repo_root)))

    print("OpenJarvis production bootstrap complete.")
    if created:
        print("Created:")
        for item in created:
            print(f"  - {item}")
    else:
        print("No new files were needed.")

    print("Next steps:")
    print("  1. Edit deploy/env/openjarvis.production.env")
    print("  2. Set OPENJARVIS_DOMAIN and any provider/webhook keys you need")
    print("  3. Run python scripts/validate_openjarvis_production.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
