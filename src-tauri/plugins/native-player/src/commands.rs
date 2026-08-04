use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::{
    CommandResponse, MetadataRequest, PlayRequest, Result, VolumeRequest, WavefuncPlayerExt,
};

#[command]
pub(crate) async fn play<R: Runtime>(
    app: AppHandle<R>,
    payload: PlayRequest,
) -> Result<CommandResponse> {
    app.wavefunc_player().play(payload)
}

#[command]
pub(crate) async fn pause<R: Runtime>(app: AppHandle<R>) -> Result<CommandResponse> {
    app.wavefunc_player().pause()
}

#[command]
pub(crate) async fn resume<R: Runtime>(app: AppHandle<R>) -> Result<CommandResponse> {
    app.wavefunc_player().resume()
}

#[command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<CommandResponse> {
    app.wavefunc_player().stop()
}

#[command]
pub(crate) async fn update_metadata<R: Runtime>(
    app: AppHandle<R>,
    payload: MetadataRequest,
) -> Result<CommandResponse> {
    app.wavefunc_player().update_metadata(payload)
}

#[command]
pub(crate) async fn set_volume<R: Runtime>(
    app: AppHandle<R>,
    payload: VolumeRequest,
) -> Result<CommandResponse> {
    app.wavefunc_player().set_volume(payload)
}

// `addPluginListener` invokes these snake_case commands on the Rust plugin.
// Forward them to the built-in listener commands on Tauri's native mobile
// Plugin base class so Kotlin `trigger(...)` events reach the WebView.
#[command]
pub(crate) async fn register_listener<R: Runtime>(
    app: AppHandle<R>,
    event: String,
    handler: Channel<()>,
) -> Result<()> {
    app.wavefunc_player().register_listener(event, handler)
}

#[command]
pub(crate) async fn remove_listener<R: Runtime>(
    app: AppHandle<R>,
    event: String,
    channel_id: u32,
) -> Result<()> {
    app.wavefunc_player().remove_listener(event, channel_id)
}
