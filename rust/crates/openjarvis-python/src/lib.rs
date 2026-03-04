//! PyO3 bridge — exposes Rust backend to Python.

use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::collections::HashMap;

// Re-export core types as Python classes

#[pyclass(name = "Message")]
#[derive(Clone)]
struct PyMessage {
    #[pyo3(get, set)]
    role: String,
    #[pyo3(get, set)]
    content: String,
    #[pyo3(get, set)]
    name: Option<String>,
    #[pyo3(get, set)]
    tool_call_id: Option<String>,
}

#[pymethods]
impl PyMessage {
    #[new]
    fn new(role: String, content: String) -> Self {
        Self {
            role,
            content,
            name: None,
            tool_call_id: None,
        }
    }
}

impl PyMessage {
    fn to_core(&self) -> openjarvis_core::Message {
        let role = match self.role.as_str() {
            "system" => openjarvis_core::Role::System,
            "assistant" => openjarvis_core::Role::Assistant,
            "tool" => openjarvis_core::Role::Tool,
            _ => openjarvis_core::Role::User,
        };
        openjarvis_core::Message {
            role,
            content: self.content.clone(),
            name: self.name.clone(),
            tool_calls: None,
            tool_call_id: self.tool_call_id.clone(),
            metadata: HashMap::new(),
        }
    }
}

#[pyclass(name = "ToolResult")]
#[derive(Clone)]
struct PyToolResult {
    #[pyo3(get)]
    tool_name: String,
    #[pyo3(get)]
    content: String,
    #[pyo3(get)]
    success: bool,
}

#[pyclass(name = "Config")]
struct PyConfig {
    inner: openjarvis_core::JarvisConfig,
}

#[pymethods]
impl PyConfig {
    #[new]
    fn new() -> Self {
        Self {
            inner: openjarvis_core::JarvisConfig::default(),
        }
    }

    fn __repr__(&self) -> String {
        format!(
            "Config(engine={}, model={})",
            self.inner.engine.default, self.inner.intelligence.default_model
        )
    }
}

#[pyclass(name = "OllamaEngine")]
struct PyOllamaEngine {
    inner: openjarvis_engine::OllamaEngine,
}

#[pymethods]
impl PyOllamaEngine {
    #[new]
    #[pyo3(signature = (host="http://localhost:11434", timeout=120.0))]
    fn new(host: &str, timeout: f64) -> Self {
        Self {
            inner: openjarvis_engine::OllamaEngine::new(host, timeout),
        }
    }

    fn engine_id(&self) -> &str {
        use openjarvis_engine::InferenceEngine;
        self.inner.engine_id()
    }

    fn health(&self) -> bool {
        use openjarvis_engine::InferenceEngine;
        self.inner.health()
    }

    fn list_models(&self) -> PyResult<Vec<String>> {
        use openjarvis_engine::InferenceEngine;
        self.inner
            .list_models()
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))
    }

    #[pyo3(signature = (messages, model, temperature=0.7, max_tokens=1024))]
    fn generate(
        &self,
        messages: Vec<PyMessage>,
        model: &str,
        temperature: f64,
        max_tokens: i64,
    ) -> PyResult<String> {
        use openjarvis_engine::InferenceEngine;
        let core_msgs: Vec<openjarvis_core::Message> =
            messages.iter().map(|m| m.to_core()).collect();
        let result = self
            .inner
            .generate(&core_msgs, model, temperature, max_tokens, None)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(serde_json::to_string(&result).unwrap_or_default())
    }
}

#[pyclass(name = "SecretScanner")]
struct PySecretScanner {
    inner: openjarvis_security::SecretScanner,
}

#[pymethods]
impl PySecretScanner {
    #[new]
    fn new() -> Self {
        Self {
            inner: openjarvis_security::SecretScanner::new(),
        }
    }

    fn scan(&self, text: &str) -> PyResult<String> {
        let result = self.inner.scan(text);
        Ok(serde_json::to_string(&result).unwrap_or_default())
    }

    fn redact(&self, text: &str) -> String {
        self.inner.redact(text)
    }
}

#[pyclass(name = "PIIScanner")]
struct PyPIIScanner {
    inner: openjarvis_security::PIIScanner,
}

#[pymethods]
impl PyPIIScanner {
    #[new]
    fn new() -> Self {
        Self {
            inner: openjarvis_security::PIIScanner::new(),
        }
    }

    fn scan(&self, text: &str) -> PyResult<String> {
        let result = self.inner.scan(text);
        Ok(serde_json::to_string(&result).unwrap_or_default())
    }

    fn redact(&self, text: &str) -> String {
        self.inner.redact(text)
    }
}

#[pyclass(name = "CalculatorTool")]
struct PyCalculatorTool;

#[pymethods]
impl PyCalculatorTool {
    #[new]
    fn new() -> Self {
        Self
    }

    fn execute(&self, expression: &str) -> PyResult<String> {
        use openjarvis_tools::traits::BaseTool;
        let tool = openjarvis_tools::builtin::calculator::CalculatorTool;
        let params = serde_json::json!({"expression": expression});
        let result = tool
            .execute(&params)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(result.content)
    }
}

// Module-level functions

#[pyfunction]
#[pyo3(signature = (path=None))]
fn load_config(path: Option<&str>) -> PyResult<PyConfig> {
    let p = path.map(std::path::Path::new);
    let config = openjarvis_core::load_config(p)
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
    Ok(PyConfig { inner: config })
}

#[pyfunction]
fn detect_hardware() -> PyResult<String> {
    let hw = openjarvis_core::hardware::detect_hardware();
    Ok(serde_json::to_string(&hw).unwrap_or_default())
}

#[pyfunction]
fn check_ssrf(url: &str) -> Option<String> {
    openjarvis_security::check_ssrf(url)
}

#[pyfunction]
fn is_sensitive_file(path: &str) -> bool {
    openjarvis_security::is_sensitive_file(std::path::Path::new(path))
}

#[pymodule]
fn openjarvis_rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyMessage>()?;
    m.add_class::<PyToolResult>()?;
    m.add_class::<PyConfig>()?;
    m.add_class::<PyOllamaEngine>()?;
    m.add_class::<PySecretScanner>()?;
    m.add_class::<PyPIIScanner>()?;
    m.add_class::<PyCalculatorTool>()?;
    m.add_function(wrap_pyfunction!(load_config, m)?)?;
    m.add_function(wrap_pyfunction!(detect_hardware, m)?)?;
    m.add_function(wrap_pyfunction!(check_ssrf, m)?)?;
    m.add_function(wrap_pyfunction!(is_sensitive_file, m)?)?;
    Ok(())
}
