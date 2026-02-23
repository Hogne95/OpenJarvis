"""Configuration loading, hardware detection, and engine recommendation.

User configuration lives at ``~/.openjarvis/config.toml``.  ``load_config()``
detects hardware, fills sensible defaults, then overlays any user overrides
found in the TOML file.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore[no-redef]

# ---------------------------------------------------------------------------
# Hardware dataclasses
# ---------------------------------------------------------------------------

DEFAULT_CONFIG_DIR = Path.home() / ".openjarvis"
DEFAULT_CONFIG_PATH = DEFAULT_CONFIG_DIR / "config.toml"


@dataclass(slots=True)
class GpuInfo:
    """Detected GPU metadata."""

    vendor: str = ""
    name: str = ""
    vram_gb: float = 0.0
    compute_capability: str = ""
    count: int = 0


@dataclass(slots=True)
class HardwareInfo:
    """Detected system hardware."""

    platform: str = ""
    cpu_brand: str = ""
    cpu_count: int = 0
    ram_gb: float = 0.0
    gpu: Optional[GpuInfo] = None


# ---------------------------------------------------------------------------
# Hardware detection helpers
# ---------------------------------------------------------------------------


def _run_cmd(cmd: list[str]) -> str:
    """Run a command and return stripped stdout, or empty string on failure."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10,  # noqa: S603
        )
        return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return ""


def _detect_nvidia_gpu() -> Optional[GpuInfo]:
    if not shutil.which("nvidia-smi"):
        return None
    raw = _run_cmd([
        "nvidia-smi",
        "--query-gpu=name,memory.total,count",
        "--format=csv,noheader,nounits",
    ])
    if not raw:
        return None
    try:
        first_line = raw.splitlines()[0]
        parts = [p.strip() for p in first_line.split(",")]
        name = parts[0]
        vram_mb = float(parts[1])
        count = int(parts[2])
        return GpuInfo(
            vendor="nvidia",
            name=name,
            vram_gb=round(vram_mb / 1024, 1),
            count=count,
        )
    except (IndexError, ValueError):
        return None


def _detect_amd_gpu() -> Optional[GpuInfo]:
    if not shutil.which("rocm-smi"):
        return None
    raw = _run_cmd(["rocm-smi", "--showproductname"])
    if not raw:
        return None
    return GpuInfo(vendor="amd", name=raw.splitlines()[0] if raw else "AMD GPU")


def _detect_apple_gpu() -> Optional[GpuInfo]:
    if platform.system() != "Darwin":
        return None
    raw = _run_cmd(["system_profiler", "SPDisplaysDataType"])
    if "Apple" not in raw:
        return None
    # Rough extraction — "Apple M2 Max" etc.
    for line in raw.splitlines():
        line = line.strip()
        if "Chipset Model" in line:
            name = line.split(":")[-1].strip()
            return GpuInfo(vendor="apple", name=name)
    return GpuInfo(vendor="apple", name="Apple Silicon")


def _detect_cpu_brand() -> str:
    """Best-effort CPU brand string."""
    if platform.system() == "Darwin":
        brand = _run_cmd(["sysctl", "-n", "machdep.cpu.brand_string"])
        if brand:
            return brand
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.exists():
        try:
            for line in cpuinfo.read_text().splitlines():
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
        except OSError:
            pass
    return platform.processor() or "unknown"


def _total_ram_gb() -> float:
    try:
        if platform.system() == "Darwin":
            raw = _run_cmd(["sysctl", "-n", "hw.memsize"])
            return round(int(raw) / (1024**3), 1) if raw else 0.0
        meminfo = Path("/proc/meminfo")
        if meminfo.exists():
            for line in meminfo.read_text().splitlines():
                if line.startswith("MemTotal"):
                    kb = int(line.split()[1])
                    return round(kb / (1024**2), 1)
    except (OSError, ValueError):
        pass
    return 0.0


def detect_hardware() -> HardwareInfo:
    """Auto-detect hardware capabilities with graceful fallbacks."""
    gpu = _detect_nvidia_gpu() or _detect_amd_gpu() or _detect_apple_gpu()
    return HardwareInfo(
        platform=platform.system().lower(),
        cpu_brand=_detect_cpu_brand(),
        cpu_count=os.cpu_count() or 1,
        ram_gb=_total_ram_gb(),
        gpu=gpu,
    )


# ---------------------------------------------------------------------------
# Engine recommendation
# ---------------------------------------------------------------------------


def recommend_engine(hw: HardwareInfo) -> str:
    """Suggest the best inference engine for the detected hardware."""
    gpu = hw.gpu
    if gpu is None:
        return "llamacpp"
    if gpu.vendor == "apple":
        return "ollama"
    if gpu.vendor == "nvidia":
        # Datacenter cards (A100, H100, L40, etc.) → vllm; consumer → ollama
        datacenter_keywords = ("A100", "H100", "H200", "L40", "A10", "A30")
        if any(kw in gpu.name for kw in datacenter_keywords):
            return "vllm"
        return "ollama"
    if gpu.vendor == "amd":
        return "vllm"
    return "llamacpp"


# ---------------------------------------------------------------------------
# Configuration hierarchy
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class EngineConfig:
    """Inference engine settings."""

    default: str = "ollama"
    ollama_host: str = "http://localhost:11434"
    vllm_host: str = "http://localhost:8000"
    llamacpp_host: str = "http://localhost:8080"
    llamacpp_path: str = ""
    sglang_host: str = "http://localhost:30000"


@dataclass(slots=True)
class IntelligenceConfig:
    """Model routing defaults."""

    default_model: str = ""
    fallback_model: str = ""


@dataclass(slots=True)
class LearningConfig:
    """Learning / router policy settings."""

    default_policy: str = "heuristic"
    intelligence_policy: str = "none"  # "none" | "sft" — updates model routing
    agent_policy: str = "none"  # "none" | "agent_advisor" — updates agent logic
    tools_policy: str = "none"  # "none" | "icl_updater" — updates tool usage
    reward_weights: str = ""  # comma-separated key=value, e.g. "latency=0.4,cost=0.3"
    update_interval: int = 10  # traces between learning updates


@dataclass(slots=True)
class StorageConfig:
    """Storage (memory) backend settings."""

    default_backend: str = "sqlite"
    db_path: str = str(DEFAULT_CONFIG_DIR / "memory.db")
    context_injection: bool = True
    context_top_k: int = 5
    context_min_score: float = 0.1
    context_max_tokens: int = 2048
    chunk_size: int = 512
    chunk_overlap: int = 64


# Backward-compatibility alias
MemoryConfig = StorageConfig


@dataclass(slots=True)
class MCPConfig:
    """MCP (Model Context Protocol) settings."""

    enabled: bool = True
    servers: str = ""  # JSON list of MCP server configs
    expose_storage: bool = True
    expose_llm: bool = True


@dataclass(slots=True)
class ToolsConfig:
    """Tools pillar settings — wraps storage and MCP configuration."""

    storage: StorageConfig = field(default_factory=StorageConfig)
    mcp: MCPConfig = field(default_factory=MCPConfig)
    enabled: str = ""  # comma-separated default tools


@dataclass(slots=True)
class AgentConfig:
    """Agent defaults."""

    default_agent: str = "simple"
    max_turns: int = 3
    default_tools: str = ""  # comma-separated tool names
    temperature: float = 0.7
    max_tokens: int = 1024


@dataclass(slots=True)
class ServerConfig:
    """API server settings."""

    host: str = "0.0.0.0"
    port: int = 8000
    agent: str = "orchestrator"
    model: str = ""
    workers: int = 1


@dataclass(slots=True)
class TelemetryConfig:
    """Telemetry persistence settings."""

    enabled: bool = True
    db_path: str = str(DEFAULT_CONFIG_DIR / "telemetry.db")


@dataclass(slots=True)
class TracesConfig:
    """Trace system settings."""

    enabled: bool = False
    db_path: str = str(DEFAULT_CONFIG_DIR / "traces.db")


@dataclass(slots=True)
class TelegramChannelConfig:
    """Per-channel config for Telegram."""

    bot_token: str = ""
    allowed_chat_ids: str = ""
    parse_mode: str = "Markdown"


@dataclass(slots=True)
class DiscordChannelConfig:
    """Per-channel config for Discord."""

    bot_token: str = ""


@dataclass(slots=True)
class SlackChannelConfig:
    """Per-channel config for Slack."""

    bot_token: str = ""
    app_token: str = ""


@dataclass(slots=True)
class WebhookChannelConfig:
    """Per-channel config for generic webhooks."""

    url: str = ""
    secret: str = ""
    method: str = "POST"


@dataclass(slots=True)
class EmailChannelConfig:
    """Per-channel config for email (SMTP/IMAP)."""

    smtp_host: str = ""
    smtp_port: int = 587
    imap_host: str = ""
    imap_port: int = 993
    username: str = ""
    password: str = ""
    use_tls: bool = True


@dataclass(slots=True)
class WhatsAppChannelConfig:
    """Per-channel config for WhatsApp Cloud API."""

    access_token: str = ""
    phone_number_id: str = ""


@dataclass(slots=True)
class SignalChannelConfig:
    """Per-channel config for Signal (via signal-cli REST API)."""

    api_url: str = ""
    phone_number: str = ""


@dataclass(slots=True)
class GoogleChatChannelConfig:
    """Per-channel config for Google Chat webhooks."""

    webhook_url: str = ""


@dataclass(slots=True)
class IRCChannelConfig:
    """Per-channel config for IRC."""

    server: str = ""
    port: int = 6667
    nick: str = ""
    password: str = ""
    use_tls: bool = False


@dataclass(slots=True)
class WebChatChannelConfig:
    """Per-channel config for in-memory webchat."""

    pass


@dataclass(slots=True)
class TeamsChannelConfig:
    """Per-channel config for Microsoft Teams (Bot Framework)."""

    app_id: str = ""
    app_password: str = ""
    service_url: str = ""


@dataclass(slots=True)
class MatrixChannelConfig:
    """Per-channel config for Matrix."""

    homeserver: str = ""
    access_token: str = ""


@dataclass(slots=True)
class MattermostChannelConfig:
    """Per-channel config for Mattermost."""

    url: str = ""
    token: str = ""


@dataclass(slots=True)
class FeishuChannelConfig:
    """Per-channel config for Feishu (Lark)."""

    app_id: str = ""
    app_secret: str = ""


@dataclass(slots=True)
class BlueBubblesChannelConfig:
    """Per-channel config for BlueBubbles (iMessage bridge)."""

    url: str = ""
    password: str = ""


@dataclass
class ChannelConfig:
    """Channel messaging settings."""

    enabled: bool = False
    default_channel: str = ""
    default_agent: str = "simple"
    telegram: TelegramChannelConfig = field(default_factory=TelegramChannelConfig)
    discord: DiscordChannelConfig = field(default_factory=DiscordChannelConfig)
    slack: SlackChannelConfig = field(default_factory=SlackChannelConfig)
    webhook: WebhookChannelConfig = field(default_factory=WebhookChannelConfig)
    email: EmailChannelConfig = field(default_factory=EmailChannelConfig)
    whatsapp: WhatsAppChannelConfig = field(default_factory=WhatsAppChannelConfig)
    signal: SignalChannelConfig = field(default_factory=SignalChannelConfig)
    google_chat: GoogleChatChannelConfig = field(default_factory=GoogleChatChannelConfig)
    irc: IRCChannelConfig = field(default_factory=IRCChannelConfig)
    webchat: WebChatChannelConfig = field(default_factory=WebChatChannelConfig)
    teams: TeamsChannelConfig = field(default_factory=TeamsChannelConfig)
    matrix: MatrixChannelConfig = field(default_factory=MatrixChannelConfig)
    mattermost: MattermostChannelConfig = field(default_factory=MattermostChannelConfig)
    feishu: FeishuChannelConfig = field(default_factory=FeishuChannelConfig)
    bluebubbles: BlueBubblesChannelConfig = field(default_factory=BlueBubblesChannelConfig)


@dataclass(slots=True)
class SecurityConfig:
    """Security guardrails settings."""

    enabled: bool = True
    scan_input: bool = True
    scan_output: bool = True
    mode: str = "warn"  # "redact" | "warn" | "block"
    secret_scanner: bool = True
    pii_scanner: bool = True
    audit_log_path: str = str(DEFAULT_CONFIG_DIR / "audit.db")
    enforce_tool_confirmation: bool = True


@dataclass
class JarvisConfig:
    """Top-level configuration for OpenJarvis."""

    hardware: HardwareInfo = field(default_factory=HardwareInfo)
    engine: EngineConfig = field(default_factory=EngineConfig)
    intelligence: IntelligenceConfig = field(default_factory=IntelligenceConfig)
    learning: LearningConfig = field(default_factory=LearningConfig)
    tools: ToolsConfig = field(default_factory=ToolsConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    telemetry: TelemetryConfig = field(default_factory=TelemetryConfig)
    traces: TracesConfig = field(default_factory=TracesConfig)
    channel: ChannelConfig = field(default_factory=ChannelConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)

    @property
    def memory(self) -> StorageConfig:
        """Backward-compatible accessor — canonical location is tools.storage."""
        return self.tools.storage

    @memory.setter
    def memory(self, value: StorageConfig) -> None:
        """Backward-compatible setter."""
        self.tools.storage = value


# ---------------------------------------------------------------------------
# TOML loading
# ---------------------------------------------------------------------------


def _apply_toml_section(target: Any, section: Dict[str, Any]) -> None:
    """Overlay TOML key/value pairs onto a dataclass instance."""
    for key, value in section.items():
        if hasattr(target, key):
            setattr(target, key, value)


def load_config(path: Optional[Path] = None) -> JarvisConfig:
    """Detect hardware, build defaults, overlay TOML overrides.

    Parameters
    ----------
    path:
        Explicit config file.  Falls back to ``~/.openjarvis/config.toml``.
    """
    hw = detect_hardware()
    cfg = JarvisConfig(hardware=hw)
    cfg.engine.default = recommend_engine(hw)

    config_path = path or DEFAULT_CONFIG_PATH
    if config_path.exists():
        with open(config_path, "rb") as fh:
            data = tomllib.load(fh)

        # Simple top-level sections
        simple_sections = (
            "engine", "intelligence", "learning",
            "agent", "server", "telemetry", "traces", "security",
        )
        for section_name in simple_sections:
            if section_name in data:
                _apply_toml_section(getattr(cfg, section_name), data[section_name])

        # Memory: accept [memory] (old) → maps to tools.storage
        if "memory" in data:
            _apply_toml_section(cfg.tools.storage, data["memory"])

        # [channel] with nested per-channel sub-configs
        if "channel" in data:
            ch_data = data["channel"]
            # Top-level channel keys (enabled, default_channel, etc.)
            for key, value in ch_data.items():
                if not isinstance(value, dict) and hasattr(cfg.channel, key):
                    setattr(cfg.channel, key, value)
            # Nested per-channel configs
            for sub in (
                "telegram", "discord", "slack", "webhook", "email",
                "whatsapp", "signal", "google_chat", "irc", "webchat",
                "teams", "matrix", "mattermost", "feishu", "bluebubbles",
            ):
                if sub in ch_data and isinstance(ch_data[sub], dict):
                    _apply_toml_section(getattr(cfg.channel, sub), ch_data[sub])

        # Tools: accept [tools] and nested [tools.storage], [tools.mcp]
        if "tools" in data:
            tools_data = data["tools"]
            # Top-level tools keys (e.g. enabled)
            for key, value in tools_data.items():
                if not isinstance(value, dict) and hasattr(cfg.tools, key):
                    setattr(cfg.tools, key, value)
            # [tools.storage]
            if "storage" in tools_data:
                _apply_toml_section(cfg.tools.storage, tools_data["storage"])
            # [tools.mcp]
            if "mcp" in tools_data:
                _apply_toml_section(cfg.tools.mcp, tools_data["mcp"])

    return cfg


# ---------------------------------------------------------------------------
# Default TOML generation (for ``jarvis init``)
# ---------------------------------------------------------------------------


def generate_default_toml(hw: HardwareInfo) -> str:
    """Render a commented TOML string suitable for ``~/.openjarvis/config.toml``."""
    engine = recommend_engine(hw)
    gpu_line = ""
    if hw.gpu:
        gpu_line = f"# Detected GPU: {hw.gpu.name} ({hw.gpu.vram_gb} GB VRAM)"

    return f"""\
# OpenJarvis configuration
# Generated by `jarvis init`
#
# Hardware: {hw.cpu_brand} ({hw.cpu_count} cores, {hw.ram_gb} GB RAM)
{gpu_line}

[engine]
default = "{engine}"
ollama_host = "http://localhost:11434"
vllm_host = "http://localhost:8000"
sglang_host = "http://localhost:30000"

[intelligence]
default_model = ""
fallback_model = ""

[memory]
default_backend = "sqlite"

[agent]
default_agent = "simple"
max_turns = 10

[server]
host = "0.0.0.0"
port = 8000
agent = "orchestrator"

[learning]
default_policy = "heuristic"
# intelligence_policy = "none"   # "sft" to learn from traces
# agent_policy = "none"          # "agent_advisor" for LM-guided restructuring
# tools_policy = "none"          # "icl_updater" for ICL example + skill discovery
# update_interval = 10

[telemetry]
enabled = true

[traces]
enabled = false

[channel]
enabled = false
default_agent = "simple"

# [channel.telegram]
# bot_token = ""  # Or set TELEGRAM_BOT_TOKEN env var

# [channel.discord]
# bot_token = ""  # Or set DISCORD_BOT_TOKEN env var

# [channel.slack]
# bot_token = ""  # Or set SLACK_BOT_TOKEN env var

# [channel.webhook]
# url = ""

# [channel.whatsapp]
# access_token = ""      # Or set WHATSAPP_ACCESS_TOKEN env var
# phone_number_id = ""   # Or set WHATSAPP_PHONE_NUMBER_ID env var

# [channel.signal]
# api_url = ""            # signal-cli REST API URL
# phone_number = ""       # Or set SIGNAL_PHONE_NUMBER env var

# [channel.google_chat]
# webhook_url = ""        # Or set GOOGLE_CHAT_WEBHOOK_URL env var

# [channel.irc]
# server = ""
# port = 6667
# nick = ""
# use_tls = false

# [channel.teams]
# app_id = ""             # Or set TEAMS_APP_ID env var
# app_password = ""       # Or set TEAMS_APP_PASSWORD env var

# [channel.matrix]
# homeserver = ""         # Or set MATRIX_HOMESERVER env var
# access_token = ""       # Or set MATRIX_ACCESS_TOKEN env var

# [channel.mattermost]
# url = ""                # Or set MATTERMOST_URL env var
# token = ""              # Or set MATTERMOST_TOKEN env var

# [channel.feishu]
# app_id = ""             # Or set FEISHU_APP_ID env var
# app_secret = ""         # Or set FEISHU_APP_SECRET env var

# [channel.bluebubbles]
# url = ""                # Or set BLUEBUBBLES_URL env var
# password = ""           # Or set BLUEBUBBLES_PASSWORD env var

[security]
enabled = true
mode = "warn"
scan_input = true
scan_output = true
secret_scanner = true
pii_scanner = true
enforce_tool_confirmation = true
"""


__all__ = [
    "AgentConfig",
    "BlueBubblesChannelConfig",
    "ChannelConfig",
    "DEFAULT_CONFIG_DIR",
    "DEFAULT_CONFIG_PATH",
    "DiscordChannelConfig",
    "EmailChannelConfig",
    "EngineConfig",
    "FeishuChannelConfig",
    "GoogleChatChannelConfig",
    "GpuInfo",
    "HardwareInfo",
    "IRCChannelConfig",
    "IntelligenceConfig",
    "JarvisConfig",
    "LearningConfig",
    "MCPConfig",
    "MatrixChannelConfig",
    "MattermostChannelConfig",
    "MemoryConfig",
    "SecurityConfig",
    "ServerConfig",
    "SignalChannelConfig",
    "SlackChannelConfig",
    "StorageConfig",
    "TeamsChannelConfig",
    "TelegramChannelConfig",
    "TelemetryConfig",
    "ToolsConfig",
    "TracesConfig",
    "WebChatChannelConfig",
    "WebhookChannelConfig",
    "WhatsAppChannelConfig",
    "detect_hardware",
    "generate_default_toml",
    "load_config",
    "recommend_engine",
]
