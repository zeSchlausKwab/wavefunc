use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayRequest {
    pub url: String,
    pub alternatives: Vec<String>,
    pub station_id: String,
    pub station_name: String,
    pub artwork_url: Option<String>,
    pub song: Option<String>,
    pub artist: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataRequest {
    pub station_name: String,
    pub artwork_url: Option<String>,
    pub song: Option<String>,
    pub artist: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeRequest {
    pub volume: f32,
    pub muted: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct CommandResponse {
    pub ok: bool,
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
