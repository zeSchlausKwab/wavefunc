use tauri::{command, ipc::Channel, AppHandle, Runtime};

use crate::{
    PreparationStatus, PrepareRequest, PreparedMedia, Result, UploadRequest, UploadedMedia,
    WavefuncMediaExt,
};

#[command]
pub(crate) async fn prepare<R: Runtime>(
    app: AppHandle<R>,
    payload: PrepareRequest,
) -> Result<PreparedMedia> {
    app.wavefunc_media().prepare(payload).await
}

#[command]
pub(crate) async fn status<R: Runtime>(
    app: AppHandle<R>,
    job_id: String,
) -> Result<PreparationStatus> {
    app.wavefunc_media().status(job_id).await
}

#[command]
pub(crate) async fn upload<R: Runtime>(
    app: AppHandle<R>,
    payload: UploadRequest,
) -> Result<UploadedMedia> {
    app.wavefunc_media().upload(payload).await
}

#[command]
pub(crate) async fn discard<R: Runtime>(app: AppHandle<R>, job_id: String) -> Result<()> {
    app.wavefunc_media().discard(job_id).await
}

#[command]
pub(crate) async fn cancel<R: Runtime>(app: AppHandle<R>, job_id: String) -> Result<()> {
    app.wavefunc_media().cancel(job_id).await
}

#[command]
pub(crate) async fn register_listener<R: Runtime>(
    app: AppHandle<R>,
    event: String,
    handler: Channel<()>,
) -> Result<()> {
    app.wavefunc_media().register_listener(event, handler)
}

#[command]
pub(crate) async fn remove_listener<R: Runtime>(
    app: AppHandle<R>,
    event: String,
    channel_id: u32,
) -> Result<()> {
    app.wavefunc_media().remove_listener(event, channel_id)
}
