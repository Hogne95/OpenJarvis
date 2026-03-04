//! NativeOpenHandsAgent — CodeAct pattern (code-based action execution).

use crate::helpers::AgentHelpers;
use crate::traits::Agent;
use openjarvis_core::{AgentContext, AgentResult, Message, OpenJarvisError};
use openjarvis_engine::traits::InferenceEngine;
use openjarvis_tools::executor::ToolExecutor;
use regex::Regex;
use std::collections::HashMap;
use std::sync::Arc;

pub struct NativeOpenHandsAgent {
    helpers: AgentHelpers,
    executor: Arc<ToolExecutor>,
    max_turns: usize,
}

impl NativeOpenHandsAgent {
    pub fn new(
        engine: Arc<dyn InferenceEngine>,
        model: String,
        executor: Arc<ToolExecutor>,
        max_turns: usize,
        temperature: f64,
        max_tokens: i64,
    ) -> Self {
        let system_prompt = "\
            You are a helpful coding assistant using the CodeAct paradigm.\n\
            You can execute code by wrapping it in <execute> tags:\n\
            <execute>python_code_here</execute>\n\n\
            When you have the final answer, respond normally without execute tags."
            .to_string();

        Self {
            helpers: AgentHelpers::new(engine, model, system_prompt, temperature, max_tokens),
            executor,
            max_turns,
        }
    }

    fn extract_code(text: &str) -> Option<String> {
        let re = Regex::new(r"(?s)<execute>(.*?)</execute>").unwrap();
        re.captures(text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
    }
}

impl Agent for NativeOpenHandsAgent {
    fn agent_id(&self) -> &str {
        "native_openhands"
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

        let mut all_tool_results = Vec::new();

        for turn in 1..=self.max_turns {
            let result = self.helpers.generate(&messages, None)?;
            let text = AgentHelpers::strip_think_tags(&result.content);

            if let Some(code) = Self::extract_code(&text) {
                let params = serde_json::json!({ "command": code });

                let tool_result = match self.executor.execute(
                    "shell_exec",
                    &params,
                    Some("native_openhands"),
                    None,
                ) {
                    Ok(r) => r,
                    Err(e) => openjarvis_core::ToolResult::failure("shell_exec", e.to_string()),
                };

                messages.push(Message::assistant(&text));
                messages.push(Message::user(format!(
                    "Output:\n{}",
                    tool_result.content
                )));

                all_tool_results.push(tool_result);
            } else {
                return Ok(AgentResult {
                    content: text,
                    tool_results: all_tool_results,
                    turns: turn,
                    metadata: HashMap::new(),
                });
            }
        }

        Ok(AgentResult {
            content: format!("Reached maximum turns ({})", self.max_turns),
            tool_results: all_tool_results,
            turns: self.max_turns,
            metadata: HashMap::new(),
        })
    }
}
