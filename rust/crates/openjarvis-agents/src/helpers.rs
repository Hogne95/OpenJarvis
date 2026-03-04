//! Agent helpers — shared utilities replacing BaseAgent concrete methods.

use openjarvis_core::{GenerateResult, Message, OpenJarvisError, Role};
use openjarvis_engine::traits::InferenceEngine;
use regex::Regex;
use std::sync::Arc;

pub struct AgentHelpers {
    engine: Arc<dyn InferenceEngine>,
    model: String,
    system_prompt: String,
    temperature: f64,
    max_tokens: i64,
}

impl AgentHelpers {
    pub fn new(
        engine: Arc<dyn InferenceEngine>,
        model: String,
        system_prompt: String,
        temperature: f64,
        max_tokens: i64,
    ) -> Self {
        Self {
            engine,
            model,
            system_prompt,
            temperature,
            max_tokens,
        }
    }

    pub fn build_messages(&self, input: &str, history: &[Message]) -> Vec<Message> {
        let mut messages = Vec::new();
        if !self.system_prompt.is_empty() {
            messages.push(Message::system(&self.system_prompt));
        }
        messages.extend_from_slice(history);
        messages.push(Message::user(input));
        messages
    }

    pub fn generate(
        &self,
        messages: &[Message],
        extra: Option<&serde_json::Value>,
    ) -> Result<GenerateResult, OpenJarvisError> {
        self.engine
            .generate(messages, &self.model, self.temperature, self.max_tokens, extra)
    }

    pub fn engine(&self) -> &Arc<dyn InferenceEngine> {
        &self.engine
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    /// Strip <think>...</think> tags from output.
    pub fn strip_think_tags(text: &str) -> String {
        let re = Regex::new(r"(?s)<think>.*?</think>").unwrap();
        re.replace_all(text, "").trim().to_string()
    }

    /// Check if generation was cut off and needs continuation.
    pub fn check_continuation(result: &GenerateResult) -> bool {
        result.finish_reason == "length"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_think_tags() {
        let input = "Hello <think>internal reasoning</think> world";
        assert_eq!(AgentHelpers::strip_think_tags(input), "Hello  world");
    }

    #[test]
    fn test_strip_think_tags_multiline() {
        let input = "<think>\nstep 1\nstep 2\n</think>\nAnswer: 42";
        assert_eq!(AgentHelpers::strip_think_tags(input), "Answer: 42");
    }
}
