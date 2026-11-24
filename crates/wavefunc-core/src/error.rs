use thiserror::Error;

#[derive(Debug, Error)]
pub enum WavefuncError {
    #[error("Invalid relay URL '{0}': {1}")]
    InvalidRelayUrl(String, String),

    #[error("Invalid station address '{0}'")]
    InvalidStationAddress(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Authentication required: {0}")]
    AuthRequired(String),

    #[error("Nostr SDK error: {0}")]
    NostrSdk(#[from] nostr_sdk::error::Error),

    #[error("Nostr error: {0}")]
    Nostr(#[from] nostr::error::Error),

    #[error("NIP-46 bunker error: {0}")]
    NostrConnect(#[from] nostr_connect::error::Error),

    #[error("NWC wallet error: {0}")]
    Nwc(#[from] nwc::error::Error),

    #[error("Wallet error: {0}")]
    Wallet(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("ContextVM error: {0}")]
    ContextVm(String),

    #[error("Request timed out after {0}s")]
    Timeout(u64),

    #[error("Relay rejected publication: {0}")]
    PublishRejected(String),

    #[error("Relay not connected: {0}")]
    NotConnected(String),
}

pub type Result<T> = std::result::Result<T, WavefuncError>;
