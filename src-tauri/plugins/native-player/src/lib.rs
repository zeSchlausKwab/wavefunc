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
use desktop::WavefuncPlayer;
#[cfg(mobile)]
use mobile::WavefuncPlayer;

pub trait WavefuncPlayerExt<R: Runtime> {
    fn wavefunc_player(&self) -> &WavefuncPlayer<R>;
}

impl<R: Runtime, T: Manager<R>> WavefuncPlayerExt<R> for T {
    fn wavefunc_player(&self) -> &WavefuncPlayer<R> {
        self.state::<WavefuncPlayer<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wavefunc-player")
        .invoke_handler(tauri::generate_handler![
            commands::play,
            commands::pause,
            commands::resume,
            commands::stop,
            commands::update_metadata,
            commands::set_volume,
            commands::register_listener,
            commands::remove_listener,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let player = mobile::init(app, api)?;
            #[cfg(desktop)]
            let player = desktop::init(app, api)?;
            app.manage(player);
            Ok(())
        })
        .build()
}
