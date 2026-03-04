//! OpenJarvis Core — foundation types, registry, config, and event bus.
//!
//! This crate provides the shared data types, configuration loading,
//! component registry, and event bus used by all other OpenJarvis crates.

pub mod config;
pub mod error;
pub mod events;
pub mod hardware;
pub mod registry;
pub mod types;

pub use config::{load_config, JarvisConfig};
pub use error::OpenJarvisError;
pub use events::{Event, EventBus, EventType};
pub use registry::TypedRegistry;
pub use types::*;
