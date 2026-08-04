use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::WavefuncMedia;
#[cfg(mobile)]
use mobile::WavefuncMedia;

pub trait WavefuncMediaExt<R: Runtime> {
    fn wavefunc_media(&self) -> &WavefuncMedia<R>;
}

impl<R: Runtime, T: Manager<R>> WavefuncMediaExt<R> for T {
    fn wavefunc_media(&self) -> &WavefuncMedia<R> {
        self.state::<WavefuncMedia<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wavefunc-media")
        .invoke_handler(tauri::generate_handler![
            commands::prepare,
            commands::status,
            commands::upload,
            commands::discard,
            commands::cancel,
            commands::register_listener,
            commands::remove_listener,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let media = mobile::init(app, api)?;
            #[cfg(desktop)]
            let media = desktop::init(app, api)?;
            app.manage(media);
            Ok(())
        })
        .build()
}
