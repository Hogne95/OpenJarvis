# OpenJarvis

**Programming abstractions for on-device AI.**

OpenJarvis defines the abstractions needed to study and build AI systems that run entirely on local hardware. It provides four composable pillars — Intelligence, Engine, Agentic Logic, and Memory — with a trace-driven learning system that improves over time.

> **Status: v1.0+** — All pillars implemented. Trace system, trace-driven learning, SDK, benchmarks, and Docker deployment ready. 576 tests passing.

## What is this?

Local AI is a new computing paradigm: intelligence as a *resource you own*, not a *service you rent*. Existing frameworks (LangChain, DSPy, CrewAI) assume cloud-class models and infinite compute. OpenJarvis provides the abstractions for building AI systems against local hardware constraints.

**Four core abstractions:**

- **Intelligence** — the local LM being run (Qwen3 8B, GPT OSS 120B, Kimi 2.5, etc.) with multi-model management and automatic routing
- **Engine** — the local inference engine (Ollama, SGLang, vLLM, llama.cpp, MLX) with hardware-aware selection
- **Agentic Logic** — pluggable logic for handling queries, making tool/API calls, managing memory. Can be static (rules, ReAct) or learned from traces
- **Memory** — persistent, searchable storage with multiple backends (SQLite, FAISS, ColBERTv2, BM25, hybrid)

**Cross-cutting: Learning** — every interaction generates a trace. The system learns better routing, tool selection, and memory strategies from accumulated trace data.

## Quick Start — Python SDK

```python
from openjarvis import Jarvis

j = Jarvis()
response = j.ask("What is the meaning of life?")
print(response)

# With a specific model and agent
response = j.ask("Explain gravity", model="qwen3:8b", agent="orchestrator")

# Memory operations
j.memory.index("./docs/")
results = j.memory.search("machine learning")

j.close()
```

## Quick Start — CLI

```bash
jarvis ask "Hello, what can you do?"
jarvis ask --agent orchestrator --tools calculator,think "What is 2+2?"
jarvis bench run -n 5 --json
jarvis model list
jarvis memory index ./docs/
jarvis serve --port 8000
```

## Docker

```bash
docker compose up -d          # Starts Jarvis + Ollama
curl http://localhost:8000/health
```

## Documentation

- **[VISION.md](VISION.md)** — Project vision, architecture, design principles
- **[ROADMAP.md](ROADMAP.md)** — Phased development plan with deliverables
- **[CLAUDE.md](CLAUDE.md)** — Developer reference for working with the codebase

## Quick orientation

```
src/openjarvis/
├── core/          # Registry, types, config, event bus
├── intelligence/  # Model management, routing
├── engine/        # Inference engine wrappers (Ollama, vLLM, SGLang, llama.cpp, MLX)
├── agents/        # Pluggable agent implementations + tool system
├── memory/        # Storage backends (SQLite, FAISS, ColBERT, BM25, hybrid)
├── traces/        # Full interaction traces — store, collector, analyzer
├── learning/      # Router policies (heuristic, trace-driven, GRPO stub)
├── telemetry/     # Per-inference telemetry store + aggregator
├── tools/         # Built-in tools (calculator, think, retrieval, LLM, file read)
├── bench/         # Benchmarking framework (latency, throughput)
├── server/        # OpenAI-compatible API server
├── cli/           # CLI entry points
└── sdk.py         # Python SDK (Jarvis class)
```

## Requirements

- Python 3.10+
- An inference backend: [Ollama](https://ollama.com), [vLLM](https://github.com/vllm-project/vllm), or [llama.cpp](https://github.com/ggerganov/llama.cpp)
- Node.js 22+ (only if using OpenClaw agent)

## License

TBD
