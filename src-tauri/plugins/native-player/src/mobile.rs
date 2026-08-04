use serde::de::DeserializeOwned;
use tauri::{
    ipc::Channel,
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{
    CommandResponse, MetadataRequest, PlayRequest, RegisterListenerRequest, RemoveListenerRequest,
    VolumeRequest,
};

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<WavefuncPlayer<R>> {
    #[cfg(target_os = "android")]
    {
        let handle = api.register_android_plugin("live.wavefunc.player", "WavefuncPlayerPlugin")?;
        return Ok(WavefuncPlayer::Android(handle));
    }

    #[cfg(target_os = "ios")]
    {
        // Android is the only platform that opts into this backend in JS.
        // Retain a harmless implementation on iOS so adding the Android
        // plugin cannot regress existing iOS builds.
        let _ = api;
        Ok(WavefuncPlayer::Ios(_app.clone()))
    }
}

pub enum WavefuncPlayer<R: Runtime> {
    #[cfg(target_os = "android")]
    Android(PluginHandle<R>),
    #[cfg(target_os = "ios")]
    Ios(#[allow(dead_code)] AppHandle<R>),
}

impl<R: Runtime> WavefuncPlayer<R> {
    #[cfg(target_os = "ios")]
    fn ios_ok(&self) -> crate::Result<CommandResponse> {
        Ok(CommandResponse { ok: true })
    }

    pub fn play(&self, payload: PlayRequest) -> crate::Result<CommandResponse> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("play", payload)
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => {
                let _ = payload;
                self.ios_ok()
            }
        }
    }

    pub fn pause(&self) -> crate::Result<CommandResponse> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle.run_mobile_plugin("pause", ()).map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => self.ios_ok(),
        }
    }

    pub fn resume(&self) -> crate::Result<CommandResponse> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle.run_mobile_plugin("resume", ()).map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => self.ios_ok(),
        }
    }

    pub fn stop(&self) -> crate::Result<CommandResponse> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle.run_mobile_plugin("stop", ()).map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => self.ios_ok(),
        }
    }

    pub fn update_metadata(&self, payload: MetadataRequest) -> crate::Result<CommandResponse> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("updateMetadata", payload)
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => {
                let _ = payload;
                self.ios_ok()
            }
        }
    }

    pub fn set_volume(&self, payload: VolumeRequest) -> crate::Result<CommandResponse> {
        match self {
            #[cfg(target_os = "android")]
            Self::Android(handle) => handle
                .run_mobile_plugin("setVolume", payload)
                .map_err(Into::into),
            #[cfg(target_os = "ios")]
            Self::Ios(_) => {
                let _ = payload;
                self.ios_ok()
            }
        }
    }

    pub fn register_listener(&self, event: String, handler: Channel<()>) -> crate::Result<()> {
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

    pub fn remove_listener(&self, event: String, channel_id: u32) -> crate::Result<()> {
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
