//! NativeReActAgent — Thought-Action-Observation loop with regex parsing.

use crate::helpers::AgentHelpers;
use crate::loop_guard::LoopGuard;
use crate::traits::Agent;
use openjarvis_core::{AgentContext, AgentResult, Message, OpenJarvisError, ToolResult};
use openjarvis_engine::traits::InferenceEngine;
use openjarvis_tools::executor::ToolExecutor;
use regex::Regex;
use std::collections::HashMap;
use std::sync::Arc;

pub struct NativeReActAgent {
    helpers: AgentHelpers,
    executor: Arc<ToolExecutor>,
    max_turns: usize,
}

impl NativeReActAgent {
    pub fn new(
        engine: Arc<dyn InferenceEngine>,
        model: String,
        executor: Arc<ToolExecutor>,
        max_turns: usize,
        temperature: f64,
        max_tokens: i64,
    ) -> Self {
        let system_prompt = format!(
            "You are a helpful assistant that uses the ReAct framework.\n\
             Available tools: {}\n\n\
             For each step, output:\n\
             Thought: <your reasoning>\n\
             Action: <tool_name>\n\
             Action Input: <JSON arguments>\n\n\
             After receiving an observation, continue reasoning.\n\
             When you have the final answer, output:\n\
             Thought: I now know the answer.\n\
             Final Answer: <your answer>",
            executor
                .list_tools()
                .join(", ")
        );

        Self {
            helpers: AgentHelpers::new(engine, model, system_prompt, temperature, max_tokens),
            executor,
            max_turns,
        }
    }

    fn parse_action(text: &str) -> Option<(String, String)> {
        let action_re = Regex::new(r"(?m)^Action:\s*(.+)$").unwrap();
        let input_re = Regex::new(r"(?m)^Action Input:\s*(.+)$").unwrap();

        let action = action_re
            .captures(text)?
            .get(1)?
            .as_str()
            .trim()
            .to_string();
        let input = input_re
            .captures(text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_else(|| "{}".to_string());

        Some((action, input))
    }

    fn parse_final_answer(text: &str) -> Option<String> {
        let re = Regex::new(r"(?m)^Final Answer:\s*(.+)").unwrap();
        re.captures(text)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
    }
}

impl Agent for NativeReActAgent {
    fn agent_id(&self) -> &str {
        "native_react"
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
        let mut guard = LoopGuard::default();

        for turn in 1..=self.max_turns {
            let result = self.helpers.generate(&messages, None)?;
            let text = AgentHelpers::strip_think_tags(&result.content);

            if let Some(answer) = Self::parse_final_answer(&text) {
                return Ok(AgentResult {
                    content: answer,
                    tool_results: all_tool_results,
                    turns: turn,
                    metadata: HashMap::new(),
                });
            }

            if let Some((action, action_input)) = Self::parse_action(&text) {
                if let Some(loop_msg) = guard.check(&action, &action_input) {
                    return Ok(AgentResult {
                        content: format!("Agent stopped: {}", loop_msg),
                        tool_results: all_tool_results,
                        turns: turn,
                        metadata: HashMap::new(),
                    });
                }

                let params: serde_json::Value =
                    serde_json::from_str(&action_input).unwrap_or(serde_json::json!({}));

                let tool_result = match self.executor.execute(
                    &action,
                    &params,
                    Some("native_react"),
                    None,
                ) {
                    Ok(r) => r,
                    Err(e) => ToolResult::failure(&action, e.to_string()),
                };

                messages.push(Message::assistant(&text));
                messages.push(Message::user(format!(
                    "Observation: {}",
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_action() {
        let text = "Thought: I need to calculate\nAction: calculator\nAction Input: {\"expression\": \"2+2\"}";
        let (action, input) = NativeReActAgent::parse_action(text).unwrap();
        assert_eq!(action, "calculator");
        assert!(input.contains("2+2"));
    }

    #[test]
    fn test_parse_final_answer() {
        let text = "Thought: I know the answer\nFinal Answer: 42";
        let answer = NativeReActAgent::parse_final_answer(text).unwrap();
        assert_eq!(answer, "42");
    }
}
