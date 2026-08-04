use serde::de::DeserializeOwned;
use tauri::{ipc::Channel, plugin::PluginApi, AppHandle, Runtime};

use crate::{CommandResponse, MetadataRequest, PlayRequest, VolumeRequest};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<WavefuncPlayer<R>> {
    Ok(WavefuncPlayer(app.clone()))
}

pub struct WavefuncPlayer<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> WavefuncPlayer<R> {
    fn ok(&self) -> crate::Result<CommandResponse> {
        Ok(CommandResponse { ok: true })
    }

    pub fn play(&self, _payload: PlayRequest) -> crate::Result<CommandResponse> {
        self.ok()
    }

    pub fn pause(&self) -> crate::Result<CommandResponse> {
        self.ok()
    }

    pub fn resume(&self) -> crate::Result<CommandResponse> {
        self.ok()
    }

    pub fn stop(&self) -> crate::Result<CommandResponse> {
        self.ok()
    }

    pub fn update_metadata(&self, _payload: MetadataRequest) -> crate::Result<CommandResponse> {
        self.ok()
    }

    pub fn set_volume(&self, _payload: VolumeRequest) -> crate::Result<CommandResponse> {
        self.ok()
    }

    pub fn register_listener(&self, _event: String, _handler: Channel<()>) -> crate::Result<()> {
        Ok(())
    }

    pub fn remove_listener(&self, _event: String, _channel_id: u32) -> crate::Result<()> {
        Ok(())
    }
}
