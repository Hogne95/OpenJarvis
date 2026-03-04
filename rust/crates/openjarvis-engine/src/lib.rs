//! Inference Engine pillar — LLM runtime management.
//!
//! Provides the `InferenceEngine` trait and concrete backends (Ollama,
//! cloud providers, OpenAI-compatible servers).

pub mod discovery;
pub mod ollama;
pub mod openai_compat;
pub mod traits;

pub use discovery::{discover_engines, get_engine};
pub use ollama::OllamaEngine;
pub use openai_compat::OpenAICompatEngine;
pub use traits::{InferenceEngine, messages_to_dicts};
