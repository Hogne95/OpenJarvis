# Audit Remediation Design

**Date**: 2026-03-08
**Branch**: `feat/feature-gap-closure`

## Overview

Comprehensive audit remediation across four workstreams: model catalog expansion, documentation fixes, engine-model matrix test coverage, and platform-specific testing delegated to team members.

---

## Phase 1: Code Changes (We Do Now)

### 1. Model Catalog Additions

**File**: `src/openjarvis/intelligence/model_catalog.py`
**Also**: `src/openjarvis/engine/cloud.py` (fold in uncommitted pricing additions)

Add 16 new `ModelSpec` entries to `BUILTIN_MODELS`, bringing the catalog from 26 to 42.

#### Qwen3.5 (4 entries -- sweet-spot tiers)

| Catalog ID | Total Params | Active Params | Context | Min VRAM | Engines | Architecture |
|---|---|---|---|---|---|---|
| `qwen3.5:4b` | 4B | ~0.5B | 262K | 3 GB | ollama, vllm, sglang, llamacpp | MoE (Gated DeltaNet + sparse MoE) |
| `qwen3.5:35b-a3b` | 35B | 3B | 262K | 8 GB | ollama, vllm, sglang | MoE |
| `qwen3.5:122b-a10b` | 122B | 10B | 262K | 20 GB | vllm, sglang | MoE |
| `qwen3.5:397b-a17b` | 397B | 17B | 262K | 50 GB (per GPU, TP=8) | vllm, sglang | MoE |

All Qwen3.5 models use Gated DeltaNet + sparse MoE architecture. Provider: `alibaba`. HF repos: `Qwen/Qwen3.5-*`.

#### Unsloth GGUFs (8 entries)

| Catalog ID | Base Model | Total Params | Active Params | Engines |
|---|---|---|---|---|
| `unsloth/Qwen3.5-35B-A3B-GGUF` | Qwen3.5 | 35B | 3B | ollama, llamacpp |
| `unsloth/Qwen3.5-122B-A10B-GGUF` | Qwen3.5 | 122B | 10B | ollama, llamacpp |
| `unsloth/Qwen3.5-397B-A17B-GGUF` | Qwen3.5 | 397B | 17B | ollama, llamacpp |
| `unsloth/GLM-5-GGUF` | GLM-5 | ~100B | TBD | ollama, llamacpp |
| `unsloth/GLM-4.7-Flash-GGUF` | GLM 4.7 Flash | 30B | 3B | ollama, llamacpp |
| `unsloth/Qwen3-Coder-Next-GGUF` | Qwen3 Coder Next | 80B | TBD | ollama, llamacpp |
| `unsloth/MiniMax-M2.5-GGUF` | MiniMax M2.5 | 229B | TBD | ollama, llamacpp |
| `unsloth/Kimi-K2.5-GGUF` | Kimi K2.5 | ~1000B | ~32B | ollama, llamacpp |

All Unsloth entries: provider `unsloth`, quantization `GGUF`, metadata includes `hf_repo` and `base_model`.

#### LFM2.5 (4 entries -- Instruct + Thinking, GGUF + MLX)

| Catalog ID | Params | Context | Architecture | Engines |
|---|---|---|---|---|
| `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` | 1.2B | 32K | Hybrid SSM+Transformer | llamacpp, ollama |
| `LiquidAI/LFM2.5-1.2B-Instruct-MLX` | 1.2B | 32K | Hybrid SSM+Transformer | mlx |
| `LiquidAI/LFM2.5-1.2B-Thinking-GGUF` | 1.2B | 32K | Hybrid SSM+Transformer | llamacpp, ollama |
| `LiquidAI/LFM2.5-1.2B-Thinking-MLX` | 1.2B | 32K | Hybrid SSM+Transformer | mlx |

LFM2.5 architecture: 16 layers (10 double-gated LIV convolution blocks + 6 GQA blocks). Provider: `liquidai`. Trained on 28T tokens, supports 8 languages.

---

### 2. Documentation Fixes

#### 2a. Purge OpenClawAgent (vestigial, never implemented)

Files to modify -- remove all OpenClaw references:
- `docs/user-guide/agents.md` -- remove the OpenClaw section
- `docs/architecture/overview.md` -- remove OpenClaw mentions
- `docs/architecture/agents.md` -- remove OpenClaw section
- `docs/development/contributing.md` -- remove OpenClaw references
- `docs/development/changelog.md` -- remove OpenClaw changelog entries

No replacement. OpenClaw is vestigial, not a rename of OperativeAgent.

#### 2b. Unify "Five Pillars" Terminology

- `docs/architecture/overview.md` -- change "Four Pillars + Learning" to "Five Pillars" (Intelligence, Agents, Tools, Engine, Learning) to match README and `docs/index.md`

#### 2c. Document OperativeAgent & MonitorOperativeAgent

- Add new section to `docs/user-guide/agents.md` covering both agents
- Content sourced from actual implementations in `src/openjarvis/agents/`
- Cover: purpose, registration keys (`operative`, `monitor_operative`), config options, example usage

#### 2d. Expand Eval/Tool/Engine/Channel Documentation

| Doc Page | Current State | Action |
|---|---|---|
| `docs/user-guide/evaluations.md` | 4 datasets documented | Add table of all 40+ datasets including the 5 use-case benchmarks |
| `docs/user-guide/tools.md` | Exists but sparse | Add summary table of all 45+ tools grouped by category |
| `docs/architecture/engine.md` | 5 engines documented | Add MLX, LM Studio, Exo, Nexa, Uzu, Apple FM |
| Channel docs | Only OpenClaw mentioned (now removed) | Add channel matrix table listing all 27 implemented channels |

---

### 3. Engine-Model Matrix Test Expansion

**File**: `tests/engine/test_engine_model_matrix.py`

#### Current State
- `ENGINES_AND_HOSTS`: vLLM + Ollama (2 engines)
- `MODELS`: 4 local models
- 3 test classes with shared mock helpers

#### Changes

Expand `ENGINES_AND_HOSTS` to all 12 engines:

```python
ENGINES_AND_HOSTS = [
    # Native API
    ("ollama", "http://testhost:11434"),
    # OpenAI-compatible (shared mock: POST /v1/chat/completions)
    ("vllm", "http://testhost:8000"),
    ("sglang", "http://testhost:30000"),
    ("llamacpp", "http://testhost:8080"),
    ("mlx", "http://testhost:8080"),
    ("lmstudio", "http://testhost:1234"),
    ("exo", "http://testhost:52415"),
    ("nexa", "http://testhost:18181"),
    ("uzu", "http://testhost:8080"),
    ("apple_fm", "http://testhost:8079"),
    # SDK-based (separate mock patterns)
    ("cloud", None),
    ("litellm", None),
]
```

Extend `_create_engine` to instantiate all engine classes. The 9 OpenAI-compatible engines share the same `/v1/chat/completions` mock setup. Ollama keeps `/api/chat`. Cloud and LiteLLM get their own mock patterns.

Add new catalog models to `MODELS` list (at least one Qwen3.5 and one LFM2.5).

Expected test count: ~12 engines x 6 models x 3 scenarios = ~216 test cases (all mocked, fast).

---

## Phase 2: Run Evals

Run the 5 use-case benchmarks on cloud and local models:

```bash
uv run python -m openjarvis.evals --config src/openjarvis/evals/configs/use_case_v2_cloud.toml
uv run python -m openjarvis.evals --config src/openjarvis/evals/configs/use_case_v2_local.toml
```

Commit the untracked `use_case_v2_cloud.toml` and `use_case_v2_local.toml` configs first.

---

## Delegated Tasks (Platform Owners)

### Herumb -- NVIDIA Platform Owner

**Task 1: Install Verification**
- Fresh clone, `uv sync --extra dev`, build Rust extension, `jarvis init`, `jarvis doctor`
- Verify `recommend_engine()` selects `vllm` on datacenter GPU, `ollama` on consumer GPU
- Run `uv run pytest -m "not live and not cloud" tests/ -v`
- Deliverable: Screenshot of `jarvis doctor` + test results on NVIDIA machine

**Task 2: Hardware Eval Config**
- Create `src/openjarvis/evals/configs/use_case_v2_nvidia.toml`
- Models: Qwen3.5 + Unsloth GGUFs that fit available VRAM
- Engine: vLLM (primary), Ollama (secondary)
- All 5 use-case benchmarks, 30 samples each
- Deliverable: Committed TOML config file

**Task 3: Run Evals**
- Run the NVIDIA eval config
- Deliverable: Results JSON in `results/use-cases-v2-nvidia/`

### Orhun -- AMD Platform Owner

**Task 1: Install Verification**
- Same install flow on AMD hardware
- Verify `recommend_engine()` selects `vllm` for AMD GPU
- Verify ROCm detection works via `rocm-smi`
- Run full test suite
- Deliverable: Screenshot of `jarvis doctor` + test results on AMD machine

**Task 2: Hardware Eval Config**
- Create `src/openjarvis/evals/configs/use_case_v2_amd.toml`
- Models: Qwen3.5 + Unsloth GGUFs appropriate for AMD VRAM
- Engine: vLLM with ROCm
- All 5 use-case benchmarks, 30 samples each
- Deliverable: Committed TOML config file

**Task 3: Run Evals**
- Run the AMD eval config
- Deliverable: Results JSON in `results/use-cases-v2-amd/`

### Robby -- Apple Platform Owner

**Task 1: Install Verification**
- Same install flow on Apple Silicon Mac
- Verify `recommend_engine()` selects `mlx`
- Verify Apple Silicon detection via `system_profiler SPDisplaysDataType`
- Test Apple FM shim if on macOS 15+ (`jarvis host apple-fm`)
- Run full test suite
- Deliverable: Screenshot of `jarvis doctor` + test results on Apple Silicon

**Task 2: Hardware Eval Config**
- Create `src/openjarvis/evals/configs/use_case_v2_apple.toml`
- Models: LFM2.5 MLX variants, Qwen3.5:4b, Unsloth GGUFs via Ollama
- Engine: MLX (primary), Ollama (secondary)
- All 5 use-case benchmarks, 30 samples each
- Deliverable: Committed TOML config file

**Task 3: Run Evals**
- Run the Apple eval config
- Deliverable: Results JSON in `results/use-cases-v2-apple/`

### Gabe -- Cross-Platform Install & UI Owner

**Task 1: CLI Install Test** (Linux + macOS minimum, Windows if possible)
- `pip install openjarvis` (from PyPI or local wheel)
- `jarvis init` then `jarvis ask "Hello"` then `jarvis doctor`
- Document any friction, errors, or confusing output
- Deliverable: Written report per platform with pass/fail + issues found

**Task 2: Desktop App Test**
- `cd desktop && npm install && npm run tauri dev`
- Verify Ollama auto-starts, model auto-downloads, chat works
- Test setup screen progress reporting
- Deliverable: Written report with screenshots, pass/fail per platform

**Task 3: Frontend/Browser Test**
- `cd frontend && npm install && npm run dev`
- Verify chat page, dashboard, settings, get-started page all render
- Test against running `jarvis serve` backend
- Verify streaming responses, tool call rendering, command palette (Cmd+K)
- Deliverable: Written report with screenshots, pass/fail per page
