//! SimpleAgent — single-turn generation without tools.

use crate::helpers::AgentHelpers;
use crate::traits::Agent;
use openjarvis_core::{AgentContext, AgentResult, OpenJarvisError};
use openjarvis_engine::traits::InferenceEngine;
use std::sync::Arc;

pub struct SimpleAgent {
    helpers: AgentHelpers,
}

impl SimpleAgent {
    pub fn new(
        engine: Arc<dyn InferenceEngine>,
        model: String,
        system_prompt: String,
        temperature: f64,
        max_tokens: i64,
    ) -> Self {
        Self {
            helpers: AgentHelpers::new(engine, model, system_prompt, temperature, max_tokens),
        }
    }
}

impl Agent for SimpleAgent {
    fn agent_id(&self) -> &str {
        "simple"
    }

    fn accepts_tools(&self) -> bool {
        false
    }

    fn run(
        &self,
        input: &str,
        context: Option<&AgentContext>,
    ) -> Result<AgentResult, OpenJarvisError> {
        let history = context
            .map(|c| c.conversation.messages.as_slice())
            .unwrap_or(&[]);
        let messages = self.helpers.build_messages(input, history);

        let result = self.helpers.generate(&messages, None)?;
        let content = AgentHelpers::strip_think_tags(&result.content);

        Ok(AgentResult {
            content,
            tool_results: vec![],
            turns: 1,
            metadata: std::collections::HashMap::new(),
        })
    }
}
