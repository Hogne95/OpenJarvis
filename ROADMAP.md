# OpenJarvis Roadmap

Phased development plan for OpenJarvis. Phases are ordered to maximize early usability: foundation first, then intelligence + inference (so you can ask questions), then memory (so it remembers), then agents (so it can act), then learning (so it improves).

---

## Phase 0 — Foundation (~2-3 weeks)

**Goal:** Repository scaffolding, core abstractions, and CLI skeleton. Nothing runs yet, but all interfaces are defined.

**Version milestone:** v0.1

### Repository structure

```
OpenJarvis/
├── pyproject.toml              # uv/hatchling, all deps + extras
├── src/
│   └── openjarvis/
│       ├── __init__.py
│       ├── core/
│       │   ├── registry.py     # RegistryBase[T] + typed registries
│       │   ├── types.py        # Message, Conversation, ModelSpec, ToolResult, TelemetryRecord
│       │   ├── config.py       # JarvisConfig dataclass hierarchy, TOML loader
│       │   └── events.py       # Event bus: pub/sub for inter-pillar telemetry
│       ├── intelligence/       # Phase 1
│       ├── memory/             # Phase 2
│       ├── agents/             # Phase 3
│       ├── engine/             # Phase 1
│       ├── learning/           # Phase 4
│       └── cli/                # CLI entry points
├── tests/
├── VISION.md
├── ROADMAP.md
└── README.md
```

### Deliverables

- [ ] **Registry system** — `RegistryBase[T]` adapted from IPW's `registry.py`. Typed subclasses:
  - `ModelRegistry` — model specs and metadata
  - `EngineRegistry` — inference engine implementations
  - `MemoryRegistry` — memory backend implementations
  - `AgentRegistry` — agent implementations
  - `ToolRegistry` — tools with `ToolSpec` metadata (category, cost, latency, capabilities)

- [ ] **Core types** (`core/types.py`):
  - `Message` — role + content + metadata (tool calls, images, etc.)
  - `Conversation` — ordered list of messages with sliding window support
  - `ModelSpec` — model ID, parameter count, quantization, context length, hardware compatibility
  - `ToolResult` — tool name + output + usage + cost
  - `TelemetryRecord` — timestamp, model, tokens, latency, energy (optional), cost

- [ ] **Config system** (`core/config.py`):
  - `JarvisConfig` dataclass hierarchy: `EngineConfig`, `IntelligenceConfig`, `MemoryConfig`, `AgentConfig`
  - TOML config file at `~/.openjarvis/config.toml`
  - Hardware auto-detection: GPU vendor/model/VRAM/platform → populate defaults

- [ ] **Event bus** (`core/events.py`):
  - Simple pub/sub for inter-pillar communication
  - Telemetry events flow without tight coupling between pillars
  - Synchronous dispatch (async optional later)

- [ ] **CLI skeleton** (Click-based):
  - `jarvis init` — create `~/.openjarvis/config.toml` with auto-detected defaults
  - `jarvis ask` — placeholder (wired in Phase 1)
  - `jarvis serve` — placeholder (wired in Phase 3)
  - `jarvis model list|pull|info` — placeholder (wired in Phase 1)
  - `jarvis memory index|search|stats` — placeholder (wired in Phase 2)

---

## Phase 1 — Intelligence + Inference Engine (~3-4 weeks)

**Goal:** You can ask OpenJarvis a question and get an answer. Models run locally or via cloud APIs. Basic telemetry records every call.

**Version milestone:** v0.2 — first usable version

### Inference Engine

- [ ] **`InferenceEngine` ABC:**
  ```python
  class InferenceEngine(ABC):
      def generate(self, model: str, messages: list[Message], **params) -> Response: ...
      def stream(self, model: str, messages: list[Message], **params) -> Iterator[ResponseChunk]: ...
      def list_models(self) -> list[ModelSpec]: ...
      def health(self) -> bool: ...
  ```

- [ ] **Engine implementations:**
  - `OllamaEngine` — wraps Ollama HTTP API (`/api/chat`, `/api/tags`). Apple Silicon + NVIDIA.
  - `VLLMEngine` — wraps vLLM OpenAI-compatible API. Multi-GPU, tensor parallelism.
  - `LlamaCppEngine` — wraps `llama-cpp-python` or llama.cpp server. Maximum compatibility.
  - `CloudEngine` — unified wrapper for OpenAI, Anthropic, and Google APIs. Key-based routing.

- [ ] **Model management:**
  - Auto-discovery from running engines (poll `/api/tags`, `/v1/models`)
  - `ModelSpec` with hardware compatibility matrix (min VRAM, supported engines, quantization options)
  - `jarvis model list` shows all available models across engines
  - `jarvis model info <model>` shows spec, hardware requirements, estimated performance

### Intelligence

- [ ] **Hardware profiles:**
  - Auto-detect: `nvidia-smi`, `rocm-smi`, `system_profiler` (macOS), `/proc/cpuinfo`
  - Map GPU to capabilities: VRAM, compute capability, FP8/FP4 support, unified memory
  - Recommend engine: Apple Silicon → Ollama/MLX, NVIDIA datacenter → vLLM, AMD → vLLM+ROCm, CPU → llama.cpp

- [ ] **Heuristic Router V0:**
  - Rule-based routing: short queries (< 50 tokens) → small model, complex (reasoning keywords, multi-step) → large model, code patterns → code specialist
  - Fallback chains: if preferred model unavailable, try next in chain
  - Configurable via `~/.openjarvis/config.toml`

- [ ] **Basic telemetry:**
  - Wrap every `generate()` / `stream()` call with timing + token counting
  - Record to SQLite: model, prompt tokens, completion tokens, latency, cost estimate
  - `TelemetryRecord` stored via event bus, accumulated for future learning phase

### Wire-up

- [ ] **`jarvis ask "What is X?"` works end-to-end:**
  1. Parse query → detect complexity → route to model
  2. Generate response via selected engine
  3. Record telemetry
  4. Print response (with optional `--json` output)

---

## Phase 2 — Memory / Storage (~3-4 weeks)

**Goal:** OpenJarvis remembers conversations, can index your documents, and injects relevant context into prompts.

**Version milestone:** v0.3

### Memory backends

- [ ] **`MemoryBackend` ABC:**
  ```python
  class MemoryBackend(ABC):
      def store(self, content: str, metadata: dict) -> str: ...      # Returns doc ID
      def retrieve(self, query: str, k: int = 10) -> list[Result]: ...
      def delete(self, doc_id: str) -> bool: ...
      def clear(self) -> None: ...
  ```

- [ ] **Memory subtypes:**
  - `ConversationMemory` — sliding window (configurable size) + automatic summarization of older turns via LLM call
  - `KnowledgeBase` — indexed document collection with multi-backend search

- [ ] **Backend implementations:**

  - **`SQLiteMemory`** — FTS5 full-text search, zero-config default. Always available, no extra dependencies.

  - **`FAISSMemory`** — Dense neural retrieval. Encodes documents with `sentence-transformers`, builds FAISS index (IVF or flat depending on collection size). GPU-accelerated when available.

  - **`ColBERTMemory`** — ColBERTv2 late interaction retrieval. Best retrieval quality.
    - Package: `colbert-ai[torch,faiss-gpu]`
    - Indexing: `Indexer(checkpoint="colbertv2.0", config=ColBERTConfig(nbits=2))` → `indexer.index(name, collection)`
    - Search: `Searcher(index=name)` → `searcher.search(query, k=10)` returns `(passage_ids, ranks, scores)`
    - Token-level MaxSim matching: each query token attends to each document token, max-pooled per query token, summed
    - 2-bit residual compression keeps indexes compact (~50x smaller than full embeddings)
    - Millisecond query latency, substantially better than single-vector methods on complex queries

  - **`BM25Memory`** — Keyword search baseline using `rank-bm25`. No GPU, no embeddings. Fast and effective for keyword-heavy queries.

  - **`HybridMemory`** — Combines BM25 with a dense backend (FAISS or ColBERT) using Reciprocal Rank Fusion (RRF):
    ```
    RRF_score(d) = sum(1 / (k + rank_i(d))) for each retriever i
    ```
    Configurable `k` parameter (default 60). Best overall retrieval when you don't know the query type.

### Document pipeline

- [ ] **Indexing pipeline:** PDF / Markdown / plain text / code → chunking (configurable size + overlap) → embedding (if using dense/ColBERT backend) → index
- [ ] **Context injection:** auto-retrieve top-k relevant chunks before each LLM call, inject into prompt with source attribution (`[Source: filename:line]`)

### CLI

- [ ] `jarvis memory index <path>` — index a file or directory
- [ ] `jarvis memory search <query>` — search across all memory backends
- [ ] `jarvis memory stats` — show index sizes, document counts, backend status

---

## Phase 3 — Agentic Logic (~3-4 weeks)

**Goal:** OpenJarvis can use tools, reason over multiple turns, and serve an OpenAI-compatible API. The default agent is OpenClaw's Pi.

**Version milestone:** v0.4

### Agent framework

- [ ] **`BaseAgent` ABC:**
  ```python
  class BaseAgent(ABC):
      def run(self, input: str, context: AgentContext) -> AgentResult: ...
  ```
  `AgentContext` carries: conversation history, memory handle, tool registry, telemetry recorder, model router.
  `AgentResult` contains: response text, tool calls made, tokens used, telemetry data.

- [ ] **Agent implementations:**

  - **`OpenClawAgent`** (default) — wraps OpenClaw's Pi agent runtime (`@mariozechner/pi-coding-agent` v0.52.12+). Two modes:
    1. **HTTP mode:** OpenClaw gateway running locally on `:18789`. Communicate via WebSocket. Best for persistent sessions.
    2. **Subprocess mode:** invoke `node` with `runEmbeddedPiAgent()` call, JSON over stdin/stdout. No gateway needed.
    - Capabilities: multi-turn reasoning, tool calling, streaming, skill composition, context compaction
    - Requires Node.js 22+

  - **`SimpleAgent`** — single-turn: parse query → call model → return response. No tool calling, no multi-turn. Works without Node.js. Good for testing and simple Q&A.

  - **`OrchestratorAgent`** — multi-turn with model selection per step. Adapted from IPW's executor pattern. Each reasoning step can route to a different model (e.g., fast model for planning, large model for synthesis).

  - **`CustomAgent`** — template class for user-defined agents. Subclass `BaseAgent`, implement `run()`, register with `@AgentRegistry.register("my-agent")`.

### Tool system

- [ ] **`BaseTool` ABC:**
  ```python
  class BaseTool(ABC):
      name: str
      spec: ToolSpec  # category, cost_estimate, latency_estimate, capabilities
      def execute(self, input: str, **params) -> ToolResult: ...
  ```

- [ ] **Built-in tools:**
  - `Calculator` — evaluate math expressions
  - `WebSearch` — search the web (Tavily, SearXNG, or DuckDuckGo)
  - `CodeInterpreter` — execute Python in sandboxed environment
  - `FileRead` / `FileWrite` — local file operations
  - `Think` — internal reasoning scratchpad (zero-cost tool for chain-of-thought)
  - `Retrieval` — wired to memory backends, returns relevant documents
  - `LLMTool` — call another LLM as a tool (for model composition)

- [ ] **`ToolRegistry`** with discovery:
  - `ToolSpec` metadata: category, estimated latency, estimated cost, required API keys, capabilities list
  - Auto-discover available tools based on installed packages and environment

### API server

- [ ] **OpenAI-compatible API server:**
  - `POST /v1/chat/completions` — standard chat completion with tool use
  - `GET /v1/models` — list available models
  - Streaming via Server-Sent Events (SSE)
  - `jarvis serve --port 8000 --agent openclaw`

### CLI

- [ ] `jarvis serve --port 8000 --agent <agent>` — start API server
- [ ] `jarvis ask` now supports `--agent <agent>` flag

---

## Phase 4 — Learning Approach (placeholder)

**Goal:** Stub interfaces for the learned router. No ML training in this phase — just the contracts and telemetry plumbing so everything is ready when we build it.

**Version milestone:** v0.5

### Stubs

- [ ] **`RouterPolicy` ABC:**
  ```python
  class RouterPolicy(ABC):
      def select_model(self, query: str, context: RoutingContext) -> ModelSpec: ...
  ```
  The heuristic router from Phase 1 implements this as the default.

- [ ] **`RewardFunction` ABC:**
  ```python
  class RewardFunction(ABC):
      def compute(self, trajectory: Trajectory) -> float: ...
  ```
  Placeholder implementations: `QualityReward` (LLM-judge), `LatencyReward` (inverse latency), `EnergyReward` (inverse energy), `CostReward` (inverse cost), `CompositeReward` (weighted combination).

- [ ] **`TelemetryAggregator`:**
  - Reads `TelemetryRecord` entries from SQLite (accumulated since Phase 1)
  - Computes per-model statistics: average latency, token throughput, cost, quality (when graded)
  - Exports training-ready datasets for the future GRPO pipeline

- [ ] **Design document:** `docs/learning-pipeline.md` describing the planned GRPO training pipeline:
  - Trajectory generation from Phases 1-3 telemetry
  - Reward model training
  - Policy optimization with GRPO
  - Online evaluation and rollout strategy

---

## Phase 5 — Integration & Polish (~3-4 weeks)

**Goal:** Production-ready packaging, OpenClaw integration, benchmarking, SDK, and documentation.

**Version milestone:** v1.0

### OpenClaw integration

- [ ] **`openjarvis-openclaw` plugin package:**
  - `register()` hook implementing OpenClaw's plugin API
  - `registerProvider()` — wraps OpenJarvis as an OpenClaw `ProviderPlugin` (routes through OpenJarvis intelligence + engine)
  - `registerTool()` — exposes OpenJarvis tools to OpenClaw
  - `MemorySearchManager` — implements OpenClaw's `search()` / `sync()` / `status()` interface, backed by OpenJarvis memory

### Deployment

- [ ] **Dockerfile** — multi-stage build with optional GPU support
- [ ] **docker-compose.yml** — OpenJarvis + Ollama/vLLM + optional gateway
- [ ] **Service files** — systemd (Linux) and launchd (macOS) for running as a system service

### Python SDK

- [ ] **Programmatic API:**
  ```python
  from openjarvis import Jarvis

  j = Jarvis()                                        # Auto-loads config
  response = await j.ask("Explain transformers")      # Uses router + engine
  await j.memory.index("~/papers/")                   # Index documents
  results = await j.memory.search("attention mechanism")
  ```

### Benchmarking

- [ ] **`jarvis bench` CLI:**
  - `BaseBenchmark` / `DatasetBenchmark` ABCs (adapted from IPW's `BenchmarkSuite`)
  - Run benchmarks across models, measure accuracy + latency + energy
  - Output JSONL results + summary JSON

### Documentation

- [ ] Documentation site (MkDocs or similar)
- [ ] Getting started guide
- [ ] Plugin development guide
- [ ] API reference

---

## Phase 6 — Trace System & Learning (~ongoing)

**Goal:** Full interaction-level trace recording, trace-driven learning, and pluggable agentic architectures. The foundation for studying local AI systems.

**Version milestone:** v1.1

### Trace System (complete)

- [x] **`Trace` and `TraceStep` types** — full interaction recording with step types: route, retrieve, generate, tool_call, respond
- [x] **`TraceStore`** — SQLite-backed append-only store with filtering (by agent, model, outcome, time range)
- [x] **`TraceCollector`** — wraps any `BaseAgent`, subscribes to EventBus, records steps automatically
- [x] **`TraceAnalyzer`** — read-only query layer: per-route stats, per-tool stats, summaries, query-type filtering, export
- [x] **`TraceDrivenPolicy`** — learns routing from trace outcomes, batch and online updates, registered as `"learned"` policy
- [x] **Event bus integration** — `TRACE_STEP` and `TRACE_COMPLETE` event types

### Next Steps

- [ ] Wire `TraceCollector` into SDK/CLI for automatic trace collection
- [ ] `jarvis trace` CLI subcommand (list, inspect, export traces)
- [ ] User feedback mechanisms (thumbs up/down, quality scores)
- [ ] Hierarchical memory (episodic/semantic/procedural layers)
- [ ] Pluggable agentic architectures (ReAct, tree-of-thought, custom loops)
- [ ] Prompt optimization from traces (DSPy-style compilation for local models)
- [ ] Model weight updates from traces (LoRA/QLoRA finetuning)
- [ ] GAIA benchmark evaluation with local models

---

## Version Summary

| Version | Phase | What you get |
|---------|-------|-------------|
| **v0.1** | Phase 0 | Scaffolding, registries, config, CLI skeleton |
| **v0.2** | Phase 1 | `jarvis ask` works — local & cloud inference with telemetry |
| **v0.3** | Phase 2 | Memory — index docs, conversation history, context injection |
| **v0.4** | Phase 3 | Agents + tools + OpenAI-compatible API server |
| **v0.5** | Phase 4 | Learning stubs — router policy interface, telemetry aggregation |
| **v1.0** | Phase 5 | Production — SDK, OpenClaw plugin, Docker, benchmarks, docs |
| **v1.1** | Phase 6 | Trace system, trace-driven learning, pluggable agent architectures |
