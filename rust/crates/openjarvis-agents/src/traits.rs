//! Agent trait — interface for all agent implementations.

use openjarvis_core::{AgentContext, AgentResult, OpenJarvisError};

pub trait Agent: Send + Sync {
    fn agent_id(&self) -> &str;
    fn accepts_tools(&self) -> bool {
        false
    }
    fn run(
        &self,
        input: &str,
        context: Option<&AgentContext>,
    ) -> Result<AgentResult, OpenJarvisError>;
}
