use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareRequest {
    pub video_id: String,
    pub format: MediaFormat,
    pub job_id: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaFormat {
    Audio,
    #[serde(rename = "360p")]
    P360,
    #[serde(rename = "480p")]
    P480,
    #[serde(rename = "720p")]
    P720,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedMedia {
    pub job_id: String,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PreparationState {
    Missing,
    Preparing,
    Prepared,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparationStatus {
    pub state: PreparationState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<PreparedMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRequest {
    pub job_id: String,
    pub blossom_url: String,
    pub signed_auth_event: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedMedia {
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterListenerRequest {
    pub event: String,
    pub handler: Channel<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveListenerRequest {
    pub event: String,
    pub channel_id: u32,
}
