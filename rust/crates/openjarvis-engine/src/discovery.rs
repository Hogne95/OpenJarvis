//! Engine discovery — probe health endpoints to find running engines.

use crate::traits::InferenceEngine;
use crate::ollama::OllamaEngine;
use crate::openai_compat::OpenAICompatEngine;
use openjarvis_core::config::JarvisConfig;
use openjarvis_core::OpenJarvisError;
use std::sync::Arc;

/// Engine endpoint descriptor discovered at runtime.
#[derive(Debug, Clone)]
pub struct EngineInfo {
    pub engine_id: String,
    pub host: String,
    pub healthy: bool,
    pub models: Vec<String>,
}

/// Probe known engine endpoints and return those that respond.
pub fn discover_engines(config: &JarvisConfig) -> Vec<EngineInfo> {
    let mut found = Vec::new();

    let ollama_host = &config.engine.ollama.host;
    let ollama = OllamaEngine::new(ollama_host, 5.0);
    if ollama.health() {
        let models = ollama.list_models().unwrap_or_default();
        found.push(EngineInfo {
            engine_id: "ollama".into(),
            host: ollama_host.clone(),
            healthy: true,
            models,
        });
    }

    let compat_engines = [
        ("vllm", &config.engine.vllm.host),
        ("sglang", &config.engine.sglang.host),
        ("llamacpp", &config.engine.llamacpp.host),
        ("mlx", &config.engine.mlx.host),
        ("lmstudio", &config.engine.lmstudio.host),
    ];

    for (name, host) in compat_engines {
        let engine = OpenAICompatEngine::new(name, host, None, 5.0);
        if engine.health() {
            let models = engine.list_models().unwrap_or_default();
            found.push(EngineInfo {
                engine_id: name.into(),
                host: host.clone(),
                healthy: true,
                models,
            });
        }
    }

    found
}

/// Get a configured engine instance by key.
pub fn get_engine(
    config: &JarvisConfig,
    engine_key: Option<&str>,
) -> Result<Arc<dyn InferenceEngine>, OpenJarvisError> {
    let key = engine_key
        .map(String::from)
        .unwrap_or_else(|| config.engine.default.clone());

    match key.as_str() {
        "ollama" => Ok(Arc::new(OllamaEngine::new(
            &config.engine.ollama.host,
            120.0,
        ))),
        "vllm" => Ok(Arc::new(OpenAICompatEngine::vllm(
            &config.engine.vllm.host,
        ))),
        "sglang" => Ok(Arc::new(OpenAICompatEngine::sglang(
            &config.engine.sglang.host,
        ))),
        "llamacpp" => Ok(Arc::new(OpenAICompatEngine::llamacpp(
            &config.engine.llamacpp.host,
        ))),
        "mlx" => Ok(Arc::new(OpenAICompatEngine::mlx(
            &config.engine.mlx.host,
        ))),
        "lmstudio" => Ok(Arc::new(OpenAICompatEngine::lmstudio(
            &config.engine.lmstudio.host,
        ))),
        other => Err(OpenJarvisError::Engine(
            openjarvis_core::error::EngineError::ModelNotFound(format!(
                "Unknown engine: {}",
                other
            )),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use openjarvis_core::config::JarvisConfig;

    #[test]
    fn test_get_engine_ollama() {
        let config = JarvisConfig::default();
        let engine = get_engine(&config, Some("ollama")).unwrap();
        assert_eq!(engine.engine_id(), "ollama");
    }

    #[test]
    fn test_get_engine_unknown() {
        let config = JarvisConfig::default();
        assert!(get_engine(&config, Some("nonexistent")).is_err());
    }
}
