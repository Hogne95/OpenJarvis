//! OrchestratorAgent — multi-turn tool loop with function calling.

use crate::helpers::AgentHelpers;
use crate::loop_guard::LoopGuard;
use crate::traits::Agent;
use openjarvis_core::{AgentContext, AgentResult, Message, OpenJarvisError, Role, ToolResult};
use openjarvis_engine::traits::InferenceEngine;
use openjarvis_tools::executor::ToolExecutor;
use std::collections::HashMap;
use std::sync::Arc;

pub struct OrchestratorAgent {
    helpers: AgentHelpers,
    executor: Arc<ToolExecutor>,
    max_turns: usize,
}

impl OrchestratorAgent {
    pub fn new(
        engine: Arc<dyn InferenceEngine>,
        model: String,
        system_prompt: String,
        executor: Arc<ToolExecutor>,
        max_turns: usize,
        temperature: f64,
        max_tokens: i64,
    ) -> Self {
        Self {
            helpers: AgentHelpers::new(engine, model, system_prompt, temperature, max_tokens),
            executor,
            max_turns,
        }
    }
}

impl Agent for OrchestratorAgent {
    fn agent_id(&self) -> &str {
        "orchestrator"
    }

    fn accepts_tools(&self) -> bool {
        true
    }

    fn run(
        &self,
        input: &str,
        context: Option<&AgentContext>,
    ) -> Result<AgentResult, OpenJarvisError> {
        let history = context
            .map(|c| c.conversation.messages.as_slice())
            .unwrap_or(&[]);
        let mut messages = self.helpers.build_messages(input, history);

        let tool_specs = self.executor.tool_specs();
        let extra = if tool_specs.is_empty() {
            None
        } else {
            Some(serde_json::json!({ "tools": tool_specs }))
        };

        let mut all_tool_results = Vec::new();
        let mut guard = LoopGuard::default();
        let mut turn = 0;

        loop {
            turn += 1;
            if turn > self.max_turns {
                let last_content = messages
                    .last()
                    .filter(|m| m.role == Role::Assistant)
                    .map(|m| m.content.clone())
                    .unwrap_or_else(|| {
                        format!("Reached maximum turns ({})", self.max_turns)
                    });
                return Ok(AgentResult {
                    content: last_content,
                    tool_results: all_tool_results,
                    turns: turn - 1,
                    metadata: HashMap::new(),
                });
            }

            let result = self.helpers.generate(&messages, extra.as_ref())?;

            if let Some(ref tool_calls) = result.tool_calls {
                if !tool_calls.is_empty() {
                    messages.push(Message {
                        role: Role::Assistant,
                        content: result.content.clone(),
                        name: None,
                        tool_calls: Some(tool_calls.clone()),
                        tool_call_id: None,
                        metadata: HashMap::new(),
                    });

                    for tc in tool_calls {
                        if let Some(loop_msg) = guard.check(&tc.name, &tc.arguments) {
                            return Ok(AgentResult {
                                content: format!(
                                    "Agent stopped: {}. Last response: {}",
                                    loop_msg, result.content
                                ),
                                tool_results: all_tool_results,
                                turns: turn,
                                metadata: HashMap::new(),
                            });
                        }

                        let params: serde_json::Value =
                            serde_json::from_str(&tc.arguments).unwrap_or(serde_json::json!({}));

                        let tool_result = match self.executor.execute(
                            &tc.name,
                            &params,
                            Some("orchestrator"),
                            None,
                        ) {
                            Ok(r) => r,
                            Err(e) => ToolResult::failure(&tc.name, e.to_string()),
                        };

                        messages.push(Message {
                            role: Role::Tool,
                            content: tool_result.content.clone(),
                            name: Some(tc.name.clone()),
                            tool_calls: None,
                            tool_call_id: Some(tc.id.clone()),
                            metadata: HashMap::new(),
                        });

                        all_tool_results.push(tool_result);
                    }
                    continue;
                }
            }

            let content = AgentHelpers::strip_think_tags(&result.content);
            return Ok(AgentResult {
                content,
                tool_results: all_tool_results,
                turns: turn,
                metadata: HashMap::new(),
            });
        }
    }
}
