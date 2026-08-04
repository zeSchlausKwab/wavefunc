use serde::de::DeserializeOwned;
use tauri::{
    ipc::Channel,
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{
    PreparationStatus, PrepareRequest, PreparedMedia, RegisterListenerRequest,
    RemoveListenerRequest, Result, UploadRequest, UploadedMedia,
};

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<WavefuncMedia<R>> {
    #[cfg(target_os = "android")]
    {
        let handle = api.register_android_plugin("live.wavefunc.media", "WavefuncMediaPlugin")?;
        return Ok(WavefuncMedia::Android(handle));
    }

    #[cfg(target_os = "ios")]
    {
        let _ = api;
        Ok(WavefuncMedia::Ios(_app.clone()))
    }
}

pub enum WavefuncMedia<R: Runtime> {
    #[cfg(target_os = "android")]
    Android(PluginHandle<R>),
    #[cfg(target_os = "ios")]
    Ios(AppHandle<R>),
}

impl<R: Runtime> WavefuncMedia<R> {
    pub async fn prepare(&self, payload: PrepareRequest) -> Result<PreparedMedia> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("prepare", payload)
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Err(crate::Error::Message(
                "Local media downloads are not available on iOS.".into(),
            )),
        }
    }

    pub async fn status(&self, job_id: String) -> Result<PreparationStatus> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("status", serde_json::json!({ "jobId": job_id }))
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Ok(PreparationStatus {
                state: crate::PreparationState::Missing,
                media: None,
                error: None,
            }),
        }
    }

    pub async fn upload(&self, payload: UploadRequest) -> Result<UploadedMedia> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("upload", payload)
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Err(crate::Error::Message(
                "Local media uploads are not available on iOS.".into(),
            )),
        }
    }

    pub async fn discard(&self, job_id: String) -> Result<()> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("discard", serde_json::json!({ "jobId": job_id }))
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Ok(()),
        }
    }

    pub async fn cancel(&self, job_id: String) -> Result<()> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("cancel", serde_json::json!({ "jobId": job_id }))
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Ok(()),
        }
    }

    pub fn register_listener(&self, event: String, handler: Channel<()>) -> Result<()> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin(
                    "registerListener",
                    RegisterListenerRequest { event, handler },
                )
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Ok(()),
        }
    }

    pub fn remove_listener(&self, event: String, channel_id: u32) -> Result<()> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin(
                    "removeListener",
                    RemoveListenerRequest { event, channel_id },
                )
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => Ok(()),
        }
    }
}
