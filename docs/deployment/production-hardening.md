# Production Hardening

This guide turns OpenJarvis from a strong local assistant into a safer
internet-facing deployment.

## Root Cause

Most deployment failures do not come from the assistant logic itself. They come
from the surrounding stack:

- no reverse proxy or TLS termination
- secrets copied into commands or compose files
- no backups for `~/.openjarvis`
- no health checks or alerting path
- unrealistic expectations for remote voice latency

This phase gives you one opinionated reference setup instead of leaving those
choices implicit.

## Recommended Stack

- `deploy/docker/docker-compose.production.yml`
- `deploy/docker/docker-compose.monitoring.yml`
- `deploy/caddy/Caddyfile`
- `deploy/monitoring/prometheus.yml`
- `deploy/monitoring/openjarvis-alerts.yml`
- `deploy/env/openjarvis.production.env`
- `scripts/check_openjarvis_stack.sh`
- `scripts/backup_openjarvis.sh`
- `scripts/restore_openjarvis.sh`

## Reverse Proxy + TLS

Use the production compose stack:

```bash
python scripts/init_openjarvis_production.py
docker compose -f deploy/docker/docker-compose.production.yml up -d --build
```

If you use the bootstrap helper, it will create:

- `deploy/env/openjarvis.production.env`
- `deploy/env/secrets/openjarvis_api_key.txt`

Then edit the generated env file before first deploy.

Before first deploy, validate the production bundle:

```bash
python scripts/validate_openjarvis_production.py
```

The production stack:

- terminates TLS with Caddy
- exposes only `80/443`
- keeps JARVIS and Ollama on an internal Docker network
- hardens allowed origins and hosts from `OPENJARVIS_DOMAIN`

## Secret Management

Do not hardcode secrets in compose commands or commit them to git.

Store secrets in:

- `deploy/env/openjarvis.production.env`
- your host secret manager
- your datacenter's environment-injection system
- mounted secret files via `*_FILE`

At minimum, set:

- `OPENJARVIS_DOMAIN`
- `OPENJARVIS_API_KEY`
- any cloud model keys you use
- any webhook/messaging secrets you use

For production compose, the reference stack now supports file-backed secrets.
The API key is read from:

- `deploy/env/secrets/openjarvis_api_key.txt`
- exposed inside the container as `OPENJARVIS_API_KEY_FILE=/run/secrets/openjarvis_api_key`

JARVIS also understands other `*_FILE` variants, so cloud keys and webhook
secrets can be injected the same way.

## Monitoring And Alerts

Use the included health script for basic probing:

```bash
OPENJARVIS_BASE_URL=https://jarvis.example.com scripts/check_openjarvis_stack.sh
```

Recommended alert sources:

- `/health`
- `/v1/readiness`
- `/v1/speech/health`
- `/v1/voice-loop/status`

For broader-user deployments, run the script from cron or your monitoring
system and alert on non-zero exit.

You can also run the reference Prometheus stack:

```bash
docker compose \
  -f deploy/docker/docker-compose.production.yml \
  -f deploy/docker/docker-compose.monitoring.yml \
  up -d
```

That stack scrapes:

- `/metrics`
- built-in runtime gauges for uptime, voice loop, and managed agents
- telemetry-derived counters for calls, tokens, cost, latency, and energy

## Backups

The most important data to protect is:

- `~/.openjarvis`
- user/session state
- operator memory
- traces/telemetry databases
- Ollama model volume if re-download time matters

Run:

```bash
scripts/backup_openjarvis.sh
```

Defaults:

- backup root: `./backups`
- retention: `14` days

You can override:

```bash
BACKUP_ROOT=/srv/openjarvis-backups RETENTION_DAYS=30 scripts/backup_openjarvis.sh
```

Test restores regularly:

```bash
scripts/restore_openjarvis.sh backups/<timestamp>
```

For Linux servers, you can also use the included systemd timer units:

- `deploy/systemd/openjarvis-backup.service`
- `deploy/systemd/openjarvis-backup.timer`
- `deploy/systemd/openjarvis-healthcheck.service`
- `deploy/systemd/openjarvis-healthcheck.timer`

## Realistic Remote Voice Expectations

Remote voice works best when treated as a convenience layer, not the primary
zero-latency control path.

Recommended expectations:

- browser chat and dashboard: excellent remotely
- text-first family/friend use: excellent remotely
- voice dictation: acceptable remotely
- wake-word and fast interruption: still best on the local machine

If you want the best voice experience:

- keep microphone capture local
- keep wake-word local
- keep barge-in local
- use the datacenter mainly for web, orchestration, memory, and heavier models

In other words: remote JARVIS is production-ready for the web experience before
it is perfect for the “always-listening room assistant” experience.

## Recommended Rollout

1. Private deployment behind your own domain
2. Verify health checks and backups
3. Roll out to a few trusted users
4. Watch logs and backup restores
5. Expand access only after that
