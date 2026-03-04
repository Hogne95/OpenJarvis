//! ToolExecutor — central dispatch with RBAC, taint, timeout.

use crate::traits::BaseTool;
use openjarvis_core::error::{OpenJarvisError, ToolError};
use openjarvis_core::{EventBus, EventType, ToolResult};
use openjarvis_security::capabilities::CapabilityPolicy;
use openjarvis_security::taint::{TaintSet, check_taint};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

pub struct ToolExecutor {
    tools: HashMap<String, Arc<dyn BaseTool>>,
    capability_policy: Option<Arc<CapabilityPolicy>>,
    bus: Option<Arc<EventBus>>,
    default_timeout: Duration,
}

impl ToolExecutor {
    pub fn new(
        capability_policy: Option<Arc<CapabilityPolicy>>,
        bus: Option<Arc<EventBus>>,
    ) -> Self {
        Self {
            tools: HashMap::new(),
            capability_policy,
            bus,
            default_timeout: Duration::from_secs(30),
        }
    }

    pub fn register(&mut self, tool: Arc<dyn BaseTool>) {
        let id = tool.tool_id().to_string();
        self.tools.insert(id, tool);
    }

    pub fn get_tool(&self, name: &str) -> Option<&Arc<dyn BaseTool>> {
        self.tools.get(name)
    }

    pub fn list_tools(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    pub fn tool_specs(&self) -> Vec<Value> {
        self.tools
            .values()
            .map(|t| t.to_openai_function())
            .collect()
    }

    pub fn execute(
        &self,
        tool_name: &str,
        params: &Value,
        agent_id: Option<&str>,
        taint: Option<&TaintSet>,
    ) -> Result<ToolResult, OpenJarvisError> {
        let tool = self.tools.get(tool_name).ok_or_else(|| {
            OpenJarvisError::Tool(ToolError::NotFound(tool_name.to_string()))
        })?;

        // RBAC check
        if let (Some(policy), Some(aid)) = (&self.capability_policy, agent_id) {
            let spec = tool.spec();
            for cap in &spec.required_capabilities {
                if !policy.check(aid, cap, "") {
                    return Err(OpenJarvisError::Tool(ToolError::CapabilityDenied(
                        aid.to_string(),
                        format!("{} (tool: {})", cap, tool_name),
                    )));
                }
            }
        }

        // Taint check
        if let Some(taint_set) = taint {
            if let Some(violation) = check_taint(tool_name, taint_set) {
                return Err(OpenJarvisError::Tool(ToolError::TaintViolation(
                    tool_name.to_string(),
                    violation,
                )));
            }
        }

        // Emit start event
        if let Some(ref bus) = self.bus {
            let mut data = HashMap::new();
            data.insert(
                "tool_name".to_string(),
                Value::String(tool_name.to_string()),
            );
            bus.publish(EventType::ToolCallStart, data);
        }

        let start = std::time::Instant::now();
        let timeout = Duration::from_secs_f64(tool.spec().timeout_seconds);
        let timeout = if timeout.is_zero() {
            self.default_timeout
        } else {
            timeout
        };

        let tool_clone = Arc::clone(tool);
        let params_clone = params.clone();

        let result = std::thread::scope(|s| {
            let handle = s.spawn(move || tool_clone.execute(&params_clone));

            match handle.join() {
                Ok(r) => r,
                Err(_) => Err(OpenJarvisError::Tool(ToolError::Execution(
                    "Tool thread panicked".into(),
                ))),
            }
        });

        let elapsed = start.elapsed();

        if elapsed > timeout {
            if let Some(ref bus) = self.bus {
                let mut data = HashMap::new();
                data.insert(
                    "tool_name".to_string(),
                    Value::String(tool_name.to_string()),
                );
                bus.publish(EventType::ToolTimeout, data);
            }
            return Err(OpenJarvisError::Tool(ToolError::Timeout(
                timeout.as_secs_f64(),
                tool_name.to_string(),
            )));
        }

        // Emit end event
        if let Some(ref bus) = self.bus {
            let mut data = HashMap::new();
            data.insert(
                "tool_name".to_string(),
                Value::String(tool_name.to_string()),
            );
            data.insert(
                "duration_seconds".to_string(),
                Value::Number(
                    serde_json::Number::from_f64(elapsed.as_secs_f64()).unwrap(),
                ),
            );
            bus.publish(EventType::ToolCallEnd, data);
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use openjarvis_core::ToolSpec;

    struct MockTool;

    impl BaseTool for MockTool {
        fn tool_id(&self) -> &str {
            "mock_tool"
        }
        fn spec(&self) -> &ToolSpec {
            static SPEC: once_cell::sync::Lazy<ToolSpec> =
                once_cell::sync::Lazy::new(|| ToolSpec {
                    name: "mock_tool".into(),
                    description: "A mock tool".into(),
                    parameters: serde_json::json!({}),
                    category: "test".into(),
                    cost_estimate: 0.0,
                    latency_estimate: 0.0,
                    requires_confirmation: false,
                    timeout_seconds: 30.0,
                    required_capabilities: vec![],
                    metadata: HashMap::new(),
                });
            &SPEC
        }
        fn execute(
            &self,
            _params: &Value,
        ) -> Result<ToolResult, OpenJarvisError> {
            Ok(ToolResult::success("mock_tool", "42"))
        }
    }

    #[test]
    fn test_executor_register_and_execute() {
        let mut exec = ToolExecutor::new(None, None);
        exec.register(Arc::new(MockTool));
        let result = exec
            .execute("mock_tool", &serde_json::json!({}), None, None)
            .unwrap();
        assert!(result.success);
        assert_eq!(result.content, "42");
    }

    #[test]
    fn test_executor_tool_not_found() {
        let exec = ToolExecutor::new(None, None);
        let err = exec
            .execute("nonexistent", &serde_json::json!({}), None, None)
            .unwrap_err();
        assert!(matches!(err, OpenJarvisError::Tool(ToolError::NotFound(_))));
    }
}
